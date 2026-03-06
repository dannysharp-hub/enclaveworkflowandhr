import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CleanupFilters {
  emailContainsTest: boolean;
  nameContainsTest: boolean;
  jobRefs: string[];
  includeSpecificNames: string[]; // e.g. ["Danny Sharp","John Smith"]
  createdWithinDays: number | null;
  companyId: string;
  alsoLogGhl: boolean;
}

interface CleanupResult {
  dryRun: boolean;
  customers: { id: string; name: string; email: string | null }[];
  jobs: { id: string; job_ref: string; customer_name: string; status: string }[];
  counts: Record<string, number>;
  ghlIds: { contactIds: string[]; opportunityIds: string[] };
  warnings: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin membership
    const { data: membership } = await supabaseAdmin
      .from("cab_company_memberships")
      .select("role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership || membership.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const dryRun: boolean = body.dryRun !== false;
    const filters: CleanupFilters = body.filters;
    const confirmation: string = body.confirmation || "";

    if (!dryRun && confirmation !== "DELETE TEST DATA") {
      return new Response(
        JSON.stringify({ error: 'Must confirm with "DELETE TEST DATA"' }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!filters.companyId) {
      return new Response(
        JSON.stringify({ error: "companyId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── 1. Find matching customers ──
    let customerQuery = supabaseAdmin
      .from("cab_customers")
      .select("id, first_name, last_name, email, phone")
      .eq("company_id", filters.companyId);

    const { data: allCustomers } = await customerQuery;
    if (!allCustomers || allCustomers.length === 0) {
      return jsonOk({ dryRun, customers: [], jobs: [], counts: {}, ghlIds: { contactIds: [], opportunityIds: [] }, warnings: [] });
    }

    const matchedCustomerIds: Set<string> = new Set();
    const warnings: string[] = [];

    for (const c of allCustomers) {
      const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
      const email = (c.email || "").toLowerCase();

      let matched = false;

      if (filters.emailContainsTest && email.includes("test")) matched = true;
      if (filters.nameContainsTest && fullName.includes("test")) matched = true;

      if (
        filters.includeSpecificNames &&
        filters.includeSpecificNames.length > 0
      ) {
        for (const name of filters.includeSpecificNames) {
          if (fullName === name.toLowerCase()) matched = true;
        }
      }

      if (matched) matchedCustomerIds.add(c.id);
    }

    // ── 2. Find matching jobs ──
    let jobFilter = supabaseAdmin
      .from("cab_jobs")
      .select(
        "id, job_ref, status, current_stage_key, customer_id, ghl_contact_id, ghl_opportunity_id, created_at, room_type"
      )
      .eq("company_id", filters.companyId);

    const { data: allJobs } = await jobFilter;
    const matchedJobIds: Set<string> = new Set();
    const ghlContactIds: Set<string> = new Set();
    const ghlOpportunityIds: Set<string> = new Set();

    if (allJobs) {
      for (const j of allJobs) {
        let matched = false;

        // By customer
        if (matchedCustomerIds.has(j.customer_id)) matched = true;

        // By explicit job_ref list
        if (
          filters.jobRefs &&
          filters.jobRefs.length > 0 &&
          filters.jobRefs.includes(j.job_ref)
        )
          matched = true;

        // Created within X days filter
        if (filters.createdWithinDays && matched) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - filters.createdWithinDays);
          if (new Date(j.created_at) < cutoff) {
            matched = false; // Too old, skip
          }
        }

        if (matched) {
          matchedJobIds.add(j.id);
          if (filters.alsoLogGhl) {
            if (j.ghl_contact_id) ghlContactIds.add(j.ghl_contact_id);
            if (j.ghl_opportunity_id)
              ghlOpportunityIds.add(j.ghl_opportunity_id);
          }
        }
      }
    }

    if (matchedJobIds.size === 0 && matchedCustomerIds.size === 0) {
      return jsonOk({
        dryRun,
        customers: [],
        jobs: [],
        counts: {},
        ghlIds: { contactIds: [], opportunityIds: [] },
        warnings: ["No matching test data found."],
      });
    }

    // Safety: warn if counts look high
    if (matchedJobIds.size > 50) {
      warnings.push(
        `⚠ ${matchedJobIds.size} jobs matched — please verify this is correct.`
      );
    }

    const jobIds = Array.from(matchedJobIds);
    const customerIds = Array.from(matchedCustomerIds);

    // Build preview data
    const previewCustomers = allCustomers
      .filter((c) => matchedCustomerIds.has(c.id))
      .map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        email: c.email,
      }));

    const previewJobs = (allJobs || [])
      .filter((j) => matchedJobIds.has(j.id))
      .map((j) => {
        const cust = allCustomers.find((c) => c.id === j.customer_id);
        return {
          id: j.id,
          job_ref: j.job_ref,
          customer_name: cust
            ? `${cust.first_name} ${cust.last_name}`
            : "Unknown",
          status: j.status,
        };
      });

    // ── 3. Dry Run → return preview ──
    if (dryRun) {
      // Count child records
      const counts: Record<string, number> = {};
      if (jobIds.length > 0) {
        for (const table of [
          "cab_quote_views",
          "cab_quote_acceptances",
          "cab_quote_items",
          "cab_quotes",
          "cab_payments",
          "cab_invoices",
          "cab_appointments",
          "cab_events",
          "cab_ghl_sync_log",
          "cab_buylist_items",
          "cab_rfqs",
          "cab_purchase_orders",
          "cab_job_cost_lines",
          "cab_job_alerts",
          "cab_job_files",
        ]) {
          const { count } = await supabaseAdmin
            .from(table)
            .select("id", { count: "exact", head: true })
            .in("job_id", jobIds);
          counts[table] = count || 0;
        }
        counts["cab_jobs"] = jobIds.length;
      }

      if (customerIds.length > 0) {
        const { count: authLinkCount } = await supabaseAdmin
          .from("cab_customer_auth_links")
          .select("id", { count: "exact", head: true })
          .in("customer_id", customerIds);
        counts["cab_customer_auth_links"] = authLinkCount || 0;

        // Only count customers that will have no remaining real jobs
        const safeToDeleteCustomerIds: string[] = [];
        for (const cid of customerIds) {
          const { count: remainingJobs } = await supabaseAdmin
            .from("cab_jobs")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", cid)
            .not("id", "in", `(${jobIds.join(",")})`);
          if (!remainingJobs || remainingJobs === 0) {
            safeToDeleteCustomerIds.push(cid);
          }
        }
        counts["cab_customers"] = safeToDeleteCustomerIds.length;
      }

      return jsonOk({
        dryRun: true,
        customers: previewCustomers,
        jobs: previewJobs,
        counts,
        ghlIds: {
          contactIds: Array.from(ghlContactIds),
          opportunityIds: Array.from(ghlOpportunityIds),
        },
        warnings,
      });
    }

    // ── 4. Execute Delete (relationship-aware order) ──
    const counts: Record<string, number> = {};

    if (jobIds.length > 0) {
      // Delete in child → parent order
      const jobChildTables = [
        "cab_quote_views",
        "cab_quote_acceptances",
        "cab_quote_items",
        "cab_quotes",
        "cab_payments",
        "cab_invoices",
        "cab_appointments",
        "cab_events",
        "cab_ghl_sync_log",
        "cab_buylist_items",
        "cab_rfqs",
        "cab_purchase_orders",
        "cab_job_cost_lines",
        "cab_job_alerts",
        "cab_job_files",
      ];

      for (const table of jobChildTables) {
        const { data: deleted } = await supabaseAdmin
          .from(table)
          .delete()
          .in("job_id", jobIds)
          .select("id");
        counts[table] = deleted?.length || 0;
      }

      // Delete jobs themselves
      const { data: deletedJobs } = await supabaseAdmin
        .from("cab_jobs")
        .delete()
        .in("id", jobIds)
        .select("id");
      counts["cab_jobs"] = deletedJobs?.length || 0;
    }

    // Delete customer auth links and customers (only if no remaining real jobs)
    if (customerIds.length > 0) {
      const safeToDeleteCustomerIds: string[] = [];
      for (const cid of customerIds) {
        const { count: remainingJobs } = await supabaseAdmin
          .from("cab_jobs")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", cid);
        if (!remainingJobs || remainingJobs === 0) {
          safeToDeleteCustomerIds.push(cid);
        }
      }

      if (safeToDeleteCustomerIds.length > 0) {
        const { data: deletedAuthLinks } = await supabaseAdmin
          .from("cab_customer_auth_links")
          .delete()
          .in("customer_id", safeToDeleteCustomerIds)
          .select("id");
        counts["cab_customer_auth_links"] = deletedAuthLinks?.length || 0;

        const { data: deletedCustomers } = await supabaseAdmin
          .from("cab_customers")
          .delete()
          .in("id", safeToDeleteCustomerIds)
          .select("id");
        counts["cab_customers"] = deletedCustomers?.length || 0;
      }
    }

    // ── 5. Audit log ──
    // Find company_id for audit event
    await supabaseAdmin.from("cab_events").insert({
      company_id: filters.companyId,
      event_type: "test.cleanup.executed",
      payload_json: {
        executed_by: user.id,
        counts,
        filters: {
          emailContainsTest: filters.emailContainsTest,
          nameContainsTest: filters.nameContainsTest,
          jobRefs: filters.jobRefs,
          includeSpecificNames: filters.includeSpecificNames,
          createdWithinDays: filters.createdWithinDays,
          alsoLogGhl: filters.alsoLogGhl,
        },
        ghl_ids: {
          contact_ids: Array.from(ghlContactIds),
          opportunity_ids: Array.from(ghlOpportunityIds),
        },
      },
      status: "processed",
    });

    return jsonOk({
      dryRun: false,
      customers: previewCustomers,
      jobs: previewJobs,
      counts,
      ghlIds: {
        contactIds: Array.from(ghlContactIds),
        opportunityIds: Array.from(ghlOpportunityIds),
      },
      warnings,
    });
  } catch (err) {
    console.error("test-cleanup error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function jsonOk(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
