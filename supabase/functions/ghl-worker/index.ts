import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── Event → Stage/Tag mapping ─── */
interface SyncAction {
  stageKey?: string;
  tags: string[];
  noteExtra?: string;
  customerWindow?: string;
}

function resolveActions(eventType: string, milestone?: string, payload?: Record<string, unknown>): SyncAction | null {
  switch (eventType) {
    case "lead.created":
      return { stageKey: "lead_captured", tags: ["encl_lead_created"] };
    case "ballpark.sent": {
      const bMin = payload?.min as number | undefined;
      const bMax = payload?.max as number | undefined;
      const bCurrency = (payload?.currency as string) || "GBP";
      let noteText = "Ballpark estimate sent";
      if (bMin != null && bMax != null) noteText += ` — ${bCurrency} ${bMin.toLocaleString()}–${bMax.toLocaleString()}`;
      return { stageKey: "ballpark_sent", tags: ["encl_ballpark_sent"], noteExtra: noteText };
    }
    case "appointment.requested": {
      const calId = (payload?.calendar_id as string) || "";
      const repName = (payload?.rep_name as string) || "Alistair";
      const bookingUrl = (payload?.booking_url as string) || "";
      const jobRefVal = (payload?.job_ref as string) || "";
      let noteText = `Booking calendar: ${calId} (${repName})`;
      if (bookingUrl) noteText += `\nBooking link for job ${jobRefVal}: ${bookingUrl}`;
      return {
        stageKey: "appointment_requested",
        tags: ["encl_appointment_requested"],
        noteExtra: noteText,
      };
    }
    case "appointment.booked": {
      const startAt = payload?.appointment_start as string;
      const endAt = payload?.appointment_end as string;
      const repName = (payload?.rep_name as string) || "";
      const calId = (payload?.ghl_calendar_id as string) || "";
      let noteExtra = "";
      let customerWindow = "";
      if (startAt) {
        try {
          const ds = new Date(startAt);
          const de = endAt ? new Date(endAt) : null;
          const datePart = ds.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
          const timePart = ds.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
          const endPart = de ? `–${de.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}` : "";
          customerWindow = `${ds.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" })} ${timePart}${endPart}`;
          noteExtra = `Booked: ${datePart} ${timePart}${endPart}`;
          if (repName) noteExtra += ` | Rep: ${repName}`;
          if (calId) noteExtra += ` | Cal: ${calId}`;
        } catch { noteExtra = `Booked: ${startAt}`; }
      }
      return { stageKey: "appointment_booked", tags: ["encl_appointment_booked"], noteExtra, customerWindow };
    }
    case "quote.sent":
      return { stageKey: "quote_sent", tags: ["encl_quote_sent"] };
    case "quote.viewed":
      return { tags: ["encl_quote_viewed"] };
    case "quote.accepted":
      return { stageKey: "deposit_due", tags: ["encl_quote_accepted"] };
    case "invoice.created":
      if (milestone === "deposit") return { stageKey: "deposit_due", tags: ["encl_invoice_created_deposit"] };
      if (milestone === "preinstall") return { tags: ["encl_invoice_created_preinstall"] };
      if (milestone === "final") return { tags: ["encl_invoice_created_final"] };
      return null;
    case "invoice.paid":
      if (milestone === "deposit")
        return { stageKey: "project_confirmed", tags: ["encl_invoice_paid_deposit", "encl_project_confirmed"] };
      if (milestone === "preinstall")
        return { stageKey: "ready_for_installation", tags: ["encl_invoice_paid_preinstall", "encl_ready_for_installation"] };
      if (milestone === "final")
        return { stageKey: "closed_paid", tags: ["encl_invoice_paid_final", "encl_closed_paid"] };
      return null;
    case "materials.ordered":
      return { stageKey: "materials_ordered", tags: ["encl_materials_ordered"] };
    case "cnc.started":
      return { stageKey: "manufacturing_started", tags: ["encl_manufacturing_started"] };
    case "job.assembled":
    case "assembly.completed":
      return { stageKey: "cabinetry_assembled", tags: ["encl_cabinetry_assembled"] };
    case "install.booked":
      return { stageKey: "install_booked", tags: ["encl_install_booked"] };
    case "install.completed":
      return { stageKey: "installation_complete", tags: ["encl_installation_complete"] };
    case "job.practical_completed":
      return { stageKey: "practical_completed", tags: ["encl_practical_completed"] };
    case "lead.captured":
      return { stageKey: "lead_captured", tags: ["encl_lead_captured"] };
    case "production.started":
      return { stageKey: "project_confirmed", tags: ["encl_production_started"], noteExtra: "Production started — deposit received" };
    case "site_visit_2.completed":
      return { tags: ["encl_site_visit_2_completed"], noteExtra: "Site Visit 2 (technical survey) completed" };
    case "design.signed_off":
      return { tags: ["encl_design_signed_off"], noteExtra: "Design signed off by customer" };
    case "dry_fit.completed":
      return { tags: ["encl_dry_fit_completed"], noteExtra: "Dry fit completed — ready for progress invoice" };
    case "invoice.progress_requested":
      return { tags: ["encl_progress_invoice_requested"], noteExtra: "Progress invoice requested" };
    case "job.completed":
      return { stageKey: "closed_paid", tags: ["encl_job_completed"], noteExtra: "Job marked as complete" };
    case "invoice.final_requested":
      return { tags: ["encl_final_invoice_requested"], noteExtra: "Final invoice requested (10%)" };
    case "review.requested":
      return { tags: ["encl_review_requested"], noteExtra: "Google review request sent to customer" };
    default:
      return null;
  }
}

/* ─── GHL API helpers ─── */
const GHL_BASE = "https://services.leadconnectorhq.com";

class GhlError extends Error {
  requestPayload: unknown;
  responseBody: unknown;
  constructor(method: string, path: string, status: number, responseBody: unknown, requestPayload?: unknown) {
    super(`GHL ${method} ${path} ${status}: ${JSON.stringify(responseBody)}`);
    this.name = "GhlError";
    this.requestPayload = requestPayload;
    this.responseBody = responseBody;
  }
}

async function ghlFetch(path: string, apiKey: string, method = "GET", body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${GHL_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new GhlError(method, path, res.status, data, body);
  return data;
}

function formatUKPhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const cleaned = phone.replace(/\s+/g, "").replace(/-/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("07")) return "+44" + cleaned.slice(1);
  if (cleaned.startsWith("44")) return "+" + cleaned;
  return cleaned;
}

/* ─── Contact ensure: search by email, fallback phone, create if not found ─── */
interface EnsureContactResult {
  ghlContactId: string;
  action: "found_by_email" | "found_by_phone" | "created";
  searchDetails: string;
}

async function ensureGhlContact(
  apiKey: string,
  locationId: string,
  customer: { email?: string | null; phone?: string | null; first_name: string; last_name: string },
): Promise<EnsureContactResult> {
  // 1) Search by email
  if (customer.email) {
    try {
      const search = await ghlFetch(
        `/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(customer.email)}`,
        apiKey
      );
      if (search.contacts?.length) {
        const c = search.contacts[0];
        console.log(`[ghl-worker] Contact found by email: ${c.id} (${customer.email})`);
        return { ghlContactId: c.id, action: "found_by_email", searchDetails: `email=${customer.email} → ${c.id}` };
      }
    } catch (err) {
      console.log(`[ghl-worker] Email search error (continuing): ${err}`);
    }
  }

  // 2) Fallback: search by phone
  if (customer.phone) {
    try {
      const search = await ghlFetch(
        `/contacts/search/duplicate?locationId=${locationId}&phone=${encodeURIComponent(formatUKPhone(customer.phone) || "")}`,
        apiKey
      );
      if (search.contacts?.length) {
        const c = search.contacts[0];
        console.log(`[ghl-worker] Contact found by phone: ${c.id} (${customer.phone})`);
        return { ghlContactId: c.id, action: "found_by_phone", searchDetails: `phone=${customer.phone} → ${c.id}` };
      }
    } catch (err) {
      console.log(`[ghl-worker] Phone search error (continuing): ${err}`);
    }
  }

  // 3) Not found → create
  console.log(`[ghl-worker] Creating new GHL contact: ${customer.first_name} ${customer.last_name}`);
  try {
    const created = await ghlFetch("/contacts/", apiKey, "POST", {
      locationId,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email || undefined,
      phone: formatUKPhone(customer.phone),
    });
    const newId = created.contact?.id || created.id;
    console.log(`[ghl-worker] Contact created: ${newId}`);
    return { ghlContactId: newId, action: "created", searchDetails: `created new → ${newId}` };
  } catch (err) {
    // GHL returns 400 with the existing contact ID when duplicates are not allowed
    if (err instanceof GhlError) {
      const body = err.responseBody as any;
      const existingId = body?.meta?.contactId;
      if (existingId) {
        console.log(`[ghl-worker] Duplicate contact detected, using existing: ${existingId}`);
        return {
          ghlContactId: existingId,
          action: "found_by_phone",
          searchDetails: `duplicate_blocked → used existing ${existingId}`,
        };
      }
    }
    throw err;
  }
}

/* Save ghl_contact_id to both cab_jobs and cab_customers */
async function saveGhlContactId(supabase: any, jobId: string, customerId: string, ghlContactId: string) {
  await Promise.all([
    supabase.from("cab_jobs").update({ ghl_contact_id: ghlContactId }).eq("id", jobId),
    supabase.from("cab_customers").update({ ghl_contact_id: ghlContactId }).eq("id", customerId),
  ]);
}

interface ContactOppSearchResult { id: string | null; totalFound: number }

async function findContactOpportunity(apiKey: string, contactId: string, pipelineId: string): Promise<ContactOppSearchResult> {
  try {
    const data = await ghlFetch(`/contacts/${contactId}/opportunities`, apiKey);
    const opps = (data.opportunities || []) as any[];
    const pipelineOpps = opps
      .filter((o: any) => o.pipelineId === pipelineId)
      .sort((a: any, b: any) => {
        if (a.status === "open" && b.status !== "open") return -1;
        if (b.status === "open" && a.status !== "open") return 1;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
    if (pipelineOpps.length) return { id: pipelineOpps[0].id, totalFound: pipelineOpps.length };
    return { id: null, totalFound: 0 };
  } catch { return { id: null, totalFound: 0 }; }
}

interface UpsertResult { id: string; action: "created" | "updated" | "found_and_updated"; searchCount: number }

async function upsertOpportunity(
  apiKey: string,
  locationId: string,
  pipelineId: string,
  pipelineStageId: string,
  contactId: string,
  job: { job_ref: string; job_title: string; contract_value?: number },
  existingOppId?: string
): Promise<UpsertResult> {
  const name = `${job.job_ref} — ${job.job_title}`;
  const monetaryValue = job.contract_value || 0;

  if (existingOppId) {
    const payload: Record<string, unknown> = { pipelineStageId, name, monetaryValue };
    await ghlFetch(`/opportunities/${existingOppId}`, apiKey, "PUT", payload);
    return { id: existingOppId, action: "updated", searchCount: 0 };
  }

  const search = await findContactOpportunity(apiKey, contactId, pipelineId);
  if (search.id) {
    const payload: Record<string, unknown> = { pipelineStageId, name, monetaryValue };
    await ghlFetch(`/opportunities/${search.id}`, apiKey, "PUT", payload);
    return { id: search.id, action: "found_and_updated", searchCount: search.totalFound };
  }

  const payload = {
    pipelineId,
    pipelineStageId,
    locationId,
    contactId,
    name,
    monetaryValue,
    status: "open",
  };
  try {
    const created = await ghlFetch("/opportunities/", apiKey, "POST", payload);
    return { id: created.opportunity?.id || created.id, action: "created", searchCount: 0 };
  } catch (err) {
    if (err instanceof GhlError) {
      const body = err.responseBody as any;
      const isDuplicate = body?.statusCode === 400 &&
        (body?.message?.toLowerCase().includes("duplicate") ||
         body?.error?.toLowerCase().includes("duplicate"));
      if (isDuplicate) {
        // Find the existing opportunity and update it instead
        console.log(`[ghl-worker] Duplicate opportunity blocked, searching for existing...`);
        const search = await findContactOpportunity(apiKey, contactId, pipelineId);
        if (search.id) {
          await ghlFetch(`/opportunities/${search.id}`, apiKey, "PUT", {
            pipelineStageId,
            name,
            monetaryValue,
          });
          console.log(`[ghl-worker] Updated existing opportunity: ${search.id}`);
          return { id: search.id, action: "found_and_updated", searchCount: search.totalFound };
        }
      }
    }
    throw err;
  }
}

async function addTags(apiKey: string, contactId: string, tags: string[]) {
  if (!tags.length) return;
  await ghlFetch(`/contacts/${contactId}/tags`, apiKey, "POST", { tags });
}

async function addNote(apiKey: string, contactId: string, note: string) {
  await ghlFetch(`/contacts/${contactId}/notes`, apiKey, "POST", { body: note });
}

/* ─── Main handler ─── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ghlApiKey = Deno.env.get("GHL_API_KEY");
    const ghlLocationId = Deno.env.get("GHL_LOCATION_ID");

    if (!ghlApiKey) return new Response(JSON.stringify({ error: "GHL_API_KEY not configured" }), { status: 500, headers: corsHeaders });
    if (!ghlLocationId) return new Response(JSON.stringify({ error: "GHL_LOCATION_ID not configured" }), { status: 500, headers: corsHeaders });

    const supabase = createClient(supabaseUrl, supabaseKey);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getUser(token);
    if (claimsErr || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    let companyId: string | undefined;
    let jobId: string | undefined;
    let limit = 50;
    let action: string | undefined;
    try {
      const body = await req.json();
      companyId = body.company_id;
      jobId = body.job_id;
      action = body.action;
      if (body.limit !== undefined) limit = Math.min(body.limit, 100);
    } catch { /* no body */ }

    if (!companyId) {
      const { data: profile } = await supabase
        .from("cab_user_profiles")
        .select("company_id")
        .eq("id", claimsData.user.id)
        .single();
      companyId = profile?.company_id;
    }

    if (!companyId) {
      return new Response(JSON.stringify({ error: "No company found" }), { status: 400, headers: corsHeaders });
    }

    const { data: company } = await supabase
      .from("cab_companies")
      .select("settings_json")
      .eq("id", companyId)
      .single();

    const settings = (company?.settings_json as Record<string, unknown>) || {};
    const pipelineId = settings.ghl_pipeline_id as string;
    const stageIds = (settings.ghl_stage_ids as Record<string, string>) || {};

    // Debug info action
    if (action === "debug_info") {
      return new Response(JSON.stringify({
        saved_pipeline_id: pipelineId || null,
        ghl_location_id: ghlLocationId,
        stage_ids: stageIds,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // List pipelines action
    if (action === "list_pipelines") {
      const reqUrl = `${GHL_BASE}/opportunities/pipelines?locationId=${ghlLocationId}`;
      try {
        const rawRes = await fetch(reqUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${ghlApiKey}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
        });
        const rawBody = await rawRes.json();
        const pipelines = rawRes.ok
          ? (rawBody.pipelines || []).map((p: any) => ({
              id: p.id,
              name: p.name,
              stages: (p.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
            }))
          : [];
        return new Response(JSON.stringify({
          pipelines,
          ghl_location_id: ghlLocationId,
          _debug: {
            request_url: reqUrl,
            http_status: rawRes.status,
            raw_response: rawBody,
            api_key_prefix: ghlApiKey.slice(0, 8) + "…",
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({
          error: errMsg,
          pipelines: [],
          ghl_location_id: ghlLocationId,
          _debug: { request_url: reqUrl, error: errMsg },
        }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Test opportunity create action
    if (action === "test_opportunity_create") {
      let testStageId: string | undefined;
      try {
        const body = await req.clone().json().catch(() => ({}));
        testStageId = body.test_stage_id;
      } catch {}

      const targetStageId = testStageId || stageIds["lead_captured"] || Object.values(stageIds)[0] || "";
      const testPayload = {
        pipelineId,
        pipelineStageId: targetStageId,
        locationId: ghlLocationId,
        contactId: "test-contact-placeholder",
        name: "TEST — Pipeline Validation",
        monetaryValue: 0,
        status: "open",
      };

      try {
        const result = await ghlFetch("/opportunities/", ghlApiKey, "POST", testPayload);
        if (result.opportunity?.id) {
          try { await ghlFetch(`/opportunities/${result.opportunity.id}`, ghlApiKey, "DELETE"); } catch {}
        }
        return new Response(JSON.stringify({
          success: true,
          request_payload: testPayload,
          response: result,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err: unknown) {
        const errData: Record<string, unknown> = { success: false, request_payload: testPayload };
        if (err instanceof GhlError) {
          errData.ghl_response = err.responseBody;
          errData.error = err.message;
        } else {
          errData.error = err instanceof Error ? err.message : String(err);
        }
        return new Response(JSON.stringify(errData), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── Sync Contact to GHL (standalone) ───
    if (action === "sync_contact") {
      if (!jobId) return new Response(JSON.stringify({ error: "job_id required" }), { status: 400, headers: corsHeaders });

      const { data: job } = await supabase.from("cab_jobs").select("*").eq("id", jobId).single();
      if (!job) return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: corsHeaders });

      const { data: customer } = await supabase.from("cab_customers").select("*").eq("id", job.customer_id).single();
      if (!customer) return new Response(JSON.stringify({ error: "Customer not found" }), { status: 404, headers: corsHeaders });

      const result = await ensureGhlContact(ghlApiKey, ghlLocationId, customer);
      await saveGhlContactId(supabase, job.id, customer.id, result.ghlContactId);

      await supabase.from("cab_ghl_sync_log").insert({
        company_id: companyId,
        job_id: job.id,
        action: `contact.sync → ${result.action} | ${result.searchDetails}`,
        success: true,
      });

      return new Response(JSON.stringify({
        ghl_contact_id: result.ghlContactId,
        contact_action: result.action,
        search_details: result.searchDetails,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Link existing GHL opportunity to a job
    if (action === "link_opportunity") {
      if (!jobId) return new Response(JSON.stringify({ error: "job_id required" }), { status: 400, headers: corsHeaders });

      const { data: job } = await supabase.from("cab_jobs").select("*").eq("id", jobId).single();
      if (!job) return new Response(JSON.stringify({ error: "Job not found" }), { status: 404, headers: corsHeaders });

      const { data: customer } = await supabase.from("cab_customers").select("*").eq("id", job.customer_id).single();
      if (!customer) return new Response(JSON.stringify({ error: "Customer not found" }), { status: 404, headers: corsHeaders });

      // Ensure contact exists first
      let ghlContactId = job.ghl_contact_id;
      if (!ghlContactId) {
        const contactResult = await ensureGhlContact(ghlApiKey, ghlLocationId, customer);
        ghlContactId = contactResult.ghlContactId;
        await saveGhlContactId(supabase, job.id, customer.id, ghlContactId);
      }

      const search = await findContactOpportunity(ghlApiKey, ghlContactId, pipelineId);
      if (search.id) {
        await supabase.from("cab_jobs").update({ ghl_opportunity_id: search.id }).eq("id", job.id);
        return new Response(JSON.stringify({
          linked: true,
          ghl_opportunity_id: search.id,
          search_count: search.totalFound,
          ghl_contact_id: ghlContactId,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        linked: false,
        message: "No existing opportunity found for this contact in the configured pipeline",
        ghl_contact_id: ghlContactId,
        search_count: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Repair contacts: find/create GHL contacts for jobs that have opps but no visible contact ───
    if (action === "repair_contacts") {
      // Find jobs with ghl_opportunity_id but missing or stale ghl_contact_id
      let jobQuery = supabase.from("cab_jobs")
        .select("id, job_ref, customer_id, ghl_contact_id, ghl_opportunity_id")
        .eq("company_id", companyId)
        .not("ghl_opportunity_id", "is", null);

      if (jobId) jobQuery = jobQuery.eq("id", jobId);

      const { data: jobs } = await jobQuery;
      const results: any[] = [];

      for (const j of (jobs || [])) {
        const { data: customer } = await supabase.from("cab_customers").select("*").eq("id", j.customer_id).single();
        if (!customer) { results.push({ job_ref: j.job_ref, error: "customer_not_found" }); continue; }

        // Always re-ensure contact to make sure it's visible in GHL
        const contactResult = await ensureGhlContact(ghlApiKey, ghlLocationId, customer);
        await saveGhlContactId(supabase, j.id, customer.id, contactResult.ghlContactId);

        // If the opportunity was created with a different/phantom contact, update it
        if (j.ghl_opportunity_id) {
          try {
            await ghlFetch(`/opportunities/${j.ghl_opportunity_id}`, ghlApiKey, "PUT", {
              contactId: contactResult.ghlContactId,
            });
          } catch (err) {
            console.error(`[ghl-worker] Failed to relink opportunity ${j.ghl_opportunity_id}:`, err);
          }
        }

        await supabase.from("cab_ghl_sync_log").insert({
          company_id: companyId,
          job_id: j.id,
          action: `contact.repair → ${contactResult.action} | ${contactResult.searchDetails} | opp: ${j.ghl_opportunity_id}`,
          success: true,
        });

        results.push({
          job_ref: j.job_ref,
          ghl_contact_id: contactResult.ghlContactId,
          contact_action: contactResult.action,
          opp_relinked: !!j.ghl_opportunity_id,
        });
      }

      return new Response(JSON.stringify({ repaired: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Requeue latest events for a job
    if (action === "requeue_latest") {
      if (!jobId) return new Response(JSON.stringify({ error: "job_id required" }), { status: 400, headers: corsHeaders });

      await supabase.from("cab_events")
        .update({ status: "skipped" })
        .eq("job_id", jobId)
        .eq("company_id", companyId)
        .in("status", ["failed", "pending"]);

      const { data: latestEvents } = await supabase.from("cab_events")
        .select("*")
        .eq("job_id", jobId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      const seenTypes = new Set<string>();
      const toRequeue: any[] = [];
      for (const ev of (latestEvents || [])) {
        if (!seenTypes.has(ev.event_type)) {
          seenTypes.add(ev.event_type);
          toRequeue.push(ev);
        }
      }

      let requeued = 0;
      for (const ev of toRequeue) {
        await supabase.from("cab_events").insert({
          company_id: companyId,
          event_type: ev.event_type,
          job_id: jobId,
          customer_id: ev.customer_id,
          payload_json: ev.payload_json,
          status: "pending",
          attempts: 0,
        });
        requeued++;
      }

      return new Response(JSON.stringify({
        skipped_old: true,
        requeued,
        event_types: Array.from(seenTypes),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!pipelineId) {
      return new Response(JSON.stringify({ error: "GHL pipeline not configured. Set up in /admin/ghl" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (limit === 0) {
      return new Response(JSON.stringify({ processed: 0, errors: 0, message: "Connection OK" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = supabase
      .from("cab_events")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (jobId) query = query.eq("job_id", jobId);

    const { data: events } = await query;
    if (!events?.length) {
      return new Response(JSON.stringify({ processed: 0, errors: 0, message: "No pending events" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let errors = 0;

    for (const event of events) {
      await supabase.from("cab_events").update({ status: "processing" }).eq("id", event.id);

      try {
        const payload = (event.payload_json as Record<string, unknown>) || {};
        const milestone = payload.milestone as string | undefined;
        const actions = resolveActions(event.event_type, milestone, payload);

        console.log(`[ghl-worker] Processing event: ${event.event_type} (id: ${event.id})`, {
          hasActions: !!actions,
          stageKey: actions?.stageKey,
          tags: actions?.tags,
          payload: JSON.stringify(payload).slice(0, 500),
        });

        if (!actions) {
          await supabase.from("cab_events").update({ status: "success", processed_at: new Date().toISOString() }).eq("id", event.id);
          processed++;
          continue;
        }

        if (!event.job_id) {
          await supabase.from("cab_events").update({ status: "success", processed_at: new Date().toISOString() }).eq("id", event.id);
          processed++;
          continue;
        }

        const { data: job } = await supabase.from("cab_jobs").select("*").eq("id", event.job_id).single();
        if (!job) throw new Error(`Job not found: ${event.job_id}`);

        const { data: customer } = await supabase.from("cab_customers").select("*").eq("id", job.customer_id).single();
        if (!customer) throw new Error(`Customer not found: ${job.customer_id}`);

        // 1) ENSURE GHL contact exists (search email → phone → create)
        let ghlContactId = job.ghl_contact_id;
        let contactAction = "existing";
        let contactSearchDetails = `cached: ${ghlContactId}`;

        if (!ghlContactId) {
          const contactResult = await ensureGhlContact(ghlApiKey, ghlLocationId, customer);
          ghlContactId = contactResult.ghlContactId;
          contactAction = contactResult.action;
          contactSearchDetails = contactResult.searchDetails;
          await saveGhlContactId(supabase, job.id, customer.id, ghlContactId);
        }

        console.log(`[ghl-worker] Contact: ${contactAction} → ${ghlContactId} (${contactSearchDetails})`);

        // 2) Determine target stage
        const targetStageId = actions.stageKey ? stageIds[actions.stageKey] : undefined;

        // 3) Upsert opportunity using confirmed ghl_contact_id
        let ghlOppId = job.ghl_opportunity_id;
        let oppAction = "skipped";
        let oppSearchCount = 0;
        const targetStageForOpp = targetStageId || stageIds["lead_captured"] || "";
        
        if (!ghlOppId || targetStageId) {
          const result = await upsertOpportunity(
            ghlApiKey,
            ghlLocationId,
            pipelineId,
            targetStageForOpp,
            ghlContactId!,
            job,
            ghlOppId || undefined
          );
          oppAction = result.action;
          oppSearchCount = result.searchCount;
          if (!ghlOppId || result.action === "found_and_updated") {
            ghlOppId = result.id;
            await supabase.from("cab_jobs").update({ ghl_opportunity_id: ghlOppId }).eq("id", job.id);
          }
        }

        // 4) Add tags
        if (actions.tags.length && ghlContactId) {
          await addTags(ghlApiKey, ghlContactId, actions.tags);
          console.log(`[ghl-worker] Tags applied: ${actions.tags.join(", ")} for contact ${ghlContactId}`);
        }

        // 4b) Update appointment window custom field
        if (actions.customerWindow && ghlContactId) {
          const apptFieldId = settings.ghl_custom_field_appointment_window_id as string;
          if (apptFieldId) {
            try {
              await ghlFetch(`/contacts/${ghlContactId}`, ghlApiKey, "PUT", {
                customFields: [{ id: apptFieldId, value: actions.customerWindow }],
              });
            } catch (cfErr) {
              console.error("Failed to update appointment window custom field:", cfErr);
            }
          }
        }

        // 5) Add note
        if (ghlContactId) {
          let noteText = `Event: ${event.event_type} | Job: ${job.job_ref} | Time: ${event.created_at}`;
          if (actions.noteExtra) {
            noteText += ` | ${actions.noteExtra}`;
          }
          await addNote(ghlApiKey, ghlContactId, noteText);
        }

        // Mark success
        await supabase.from("cab_events").update({ status: "success", processed_at: new Date().toISOString() }).eq("id", event.id);

        // Log with contact details
        await supabase.from("cab_ghl_sync_log").insert({
          company_id: companyId,
          event_id: event.id,
          job_id: event.job_id,
          action: `${event.event_type} → stage:${actions.stageKey || "none"} tags:${actions.tags.join(",")} opp:${oppAction}(searched:${oppSearchCount}) opp_id:${ghlOppId || "none"} contact:${contactAction} contact_id:${ghlContactId}`,
          success: true,
        });

        processed++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const attempts = (event.attempts || 0) + 1;
        const newStatus = attempts >= 10 ? "failed" : "pending";
        await supabase.from("cab_events").update({ status: newStatus, attempts, last_error: errMsg }).eq("id", event.id);

        const evPayload = (event.payload_json as Record<string, unknown>) || {};
        const actions = resolveActions(event.event_type, evPayload.milestone as string | undefined, evPayload);
        const debugInfo: Record<string, unknown> = {
          stageKey: actions?.stageKey,
          tags: actions?.tags,
        };
        if (err instanceof GhlError) {
          debugInfo.requestPayload = err.requestPayload;
          debugInfo.ghlResponse = err.responseBody;
        }
        await supabase.from("cab_ghl_sync_log").insert({
          company_id: companyId!,
          event_id: event.id,
          job_id: event.job_id,
          action: `${event.event_type} | debug: ${JSON.stringify(debugInfo).slice(0, 1000)}`,
          success: false,
          error: errMsg,
        });

        errors++;
      }
    }

    return new Response(
      JSON.stringify({ processed, errors, total: events.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("GHL worker error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: corsHeaders });
  }
});
