import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const companyId = body.company_id as string | undefined;
    const jobId = body.job_id as string | undefined; // optional: sync single job

    if (!companyId) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant mapping
    const { data: mapping } = await admin
      .from("cab_company_tenant_map")
      .select("tenant_id")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!mapping?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant mapping found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = mapping.tenant_id;

    // Get labour rates for this company (latest effective_from first)
    const { data: rates } = await admin
      .from("cab_labour_rates")
      .select("*")
      .eq("company_id", companyId)
      .order("effective_from", { ascending: false });

    const defaultRate = 25; // fallback

    function getRate(role: string | null, date: string): number {
      if (rates && rates.length > 0) {
        // Try role-specific rate first
        if (role) {
          const roleRate = rates.find(
            (r: any) => r.role === role && r.effective_from <= date
          );
          if (roleRate) return Number(roleRate.hourly_rate);
        }
        // Fallback to default (null role) rate
        const defRate = rates.find(
          (r: any) => r.role === null && r.effective_from <= date
        );
        if (defRate) return Number(defRate.hourly_rate);
        // Any rate
        return Number(rates[0].hourly_rate);
      }
      return defaultRate;
    }

    // Find legacy jobs with cab_job_id
    let jobsQuery = admin
      .from("jobs")
      .select("id, cab_job_id, job_id, job_name")
      .eq("tenant_id", tenantId)
      .not("cab_job_id", "is", null);

    if (jobId) {
      // If specific cab job, find the legacy job for it
      jobsQuery = jobsQuery.eq("cab_job_id", jobId);
    }

    const { data: legacyJobs } = await jobsQuery;
    if (!legacyJobs || legacyJobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: "No linked legacy jobs found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSynced = 0;
    const jobsToRecalc = new Set<string>();

    for (const lj of legacyJobs) {
      // Get job_time_actuals for this legacy job
      const { data: actuals } = await admin
        .from("job_time_actuals")
        .select("*")
        .eq("job_id", lj.id)
        .eq("tenant_id", tenantId);

      if (!actuals || actuals.length === 0) continue;

      // Get the cab_job's company_id for verification
      const { data: cabJob } = await admin
        .from("cab_jobs")
        .select("id, company_id")
        .eq("id", lj.cab_job_id)
        .maybeSingle();

      if (!cabJob) continue;

      const entryDate = new Date().toISOString().split("T")[0];

      // Process each stage from job_time_actuals
      const stageMap = [
        { field: "actual_cnc_hours", role: "cnc", label: "CNC" },
        { field: "actual_assembly_hours", role: "assembly", label: "Assembly" },
        { field: "actual_install_hours", role: "installer", label: "Installation" },
        { field: "actual_spray_hours", role: "spray", label: "Spray" },
      ];

      for (const actual of actuals) {
        for (const stage of stageMap) {
          const hours = Number(actual[stage.field as keyof typeof actual]) || 0;
          if (hours <= 0) continue;

          const extRef = `timesheet:${lj.id}:${stage.role}`;
          const rate = getRate(stage.role, entryDate);

          const { error: upsertErr } = await admin
            .from("cab_job_cost_lines")
            .upsert(
              {
                company_id: cabJob.company_id,
                job_id: cabJob.id,
                cost_type: "labour",
                description: `Labour: ${stage.label} (${hours}h)`,
                qty: hours,
                unit_cost: rate,
                source: "timesheet",
                external_ref: extRef,
                incurred_at: actual.last_updated?.split("T")[0] || entryDate,
              },
              { onConflict: "company_id,external_ref" }
            );

          if (!upsertErr) {
            totalSynced++;
            jobsToRecalc.add(cabJob.id);
          }
        }
      }
    }

    // Enqueue profit recalc for affected jobs
    for (const cjId of jobsToRecalc) {
      const { data: cj } = await admin
        .from("cab_jobs")
        .select("company_id")
        .eq("id", cjId)
        .maybeSingle();

      if (cj) {
        await admin.from("cab_events").insert({
          company_id: cj.company_id,
          event_type: "profit.recalc_requested",
          job_id: cjId,
          payload_json: { job_id: cjId },
          status: "pending",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: totalSynced,
        jobs_recalc_queued: jobsToRecalc.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
