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
  customerWindow?: string; // e.g. "Tue 11:00–13:00" for GHL custom field
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
          // Customer-facing window: e.g. "Tue 11:00–13:00"
          customerWindow = `${ds.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" })} ${timePart}${endPart}`;
          // Internal note with full operational detail
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

async function upsertContact(
  apiKey: string,
  locationId: string,
  customer: { email?: string; phone?: string; first_name: string; last_name: string }
) {
  const searchField = customer.email || customer.phone;
  if (searchField) {
    try {
      const search = await ghlFetch(
        `/contacts/search/duplicate?locationId=${locationId}&${customer.email ? "email" : "phone"}=${encodeURIComponent(searchField)}`,
        apiKey
      );
      if (search.contacts?.length) return search.contacts[0];
    } catch { /* not found, create */ }
  }
  const created = await ghlFetch("/contacts/", apiKey, "POST", {
    locationId,
    firstName: customer.first_name,
    lastName: customer.last_name,
    email: customer.email || undefined,
    phone: customer.phone || undefined,
  });
  return created.contact;
}

async function upsertOpportunity(
  apiKey: string,
  locationId: string,
  pipelineId: string,
  pipelineStageId: string,
  contactId: string,
  job: { job_ref: string; job_title: string; contract_value?: number },
  existingOppId?: string
) {
  if (existingOppId) {
    const payload = {
      pipelineStageId,
      name: `${job.job_ref} — ${job.job_title}`,
      monetaryValue: job.contract_value || 0,
    };
    const updated = await ghlFetch(`/opportunities/${existingOppId}`, apiKey, "PUT", payload);
    return updated.opportunity || { id: existingOppId };
  }
  const payload = {
    pipelineId,
    pipelineStageId,
    locationId,
    contactId,
    name: `${job.job_ref} — ${job.job_title}`,
    monetaryValue: job.contract_value || 0,
    status: "open",
  };
  const created = await ghlFetch("/opportunities/", apiKey, "POST", payload);
  return created.opportunity;
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

    // List pipelines action — fetch from GHL API
    if (action === "list_pipelines") {
      try {
        const data = await ghlFetch(`/opportunities/pipelines?locationId=${ghlLocationId}`, ghlApiKey);
        const pipelines = (data.pipelines || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          stages: (p.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
        }));
        return new Response(JSON.stringify({ pipelines }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: errMsg, pipelines: [] }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!pipelineId) {
      return new Response(JSON.stringify({ error: "GHL pipeline not configured. Set up in /admin/ghl" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // If limit is 0, just test connection
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

        // 1) Upsert contact
        let ghlContactId = job.ghl_contact_id;
        if (!ghlContactId) {
          const contact = await upsertContact(ghlApiKey, ghlLocationId, customer);
          ghlContactId = contact.id;
          await supabase.from("cab_jobs").update({ ghl_contact_id: ghlContactId }).eq("id", job.id);
        }

        // 2) Determine target stage
        const targetStageId = actions.stageKey ? stageIds[actions.stageKey] : undefined;

        // 3) Upsert opportunity
        let ghlOppId = job.ghl_opportunity_id;
        if (!ghlOppId || targetStageId) {
          const opp = await upsertOpportunity(
            ghlApiKey,
            ghlLocationId,
            pipelineId,
            targetStageId || stageIds["lead_captured"] || "",
            ghlContactId!,
            job,
            ghlOppId || undefined
          );
          if (!ghlOppId) {
            ghlOppId = opp.id;
            await supabase.from("cab_jobs").update({ ghl_opportunity_id: ghlOppId }).eq("id", job.id);
          }
        }

        // 4) Add tags
        if (actions.tags.length && ghlContactId) {
          await addTags(ghlApiKey, ghlContactId, actions.tags);
        }

        // 4b) Update appointment window custom field if configured
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

        // Log
        await supabase.from("cab_ghl_sync_log").insert({
          company_id: companyId,
          event_id: event.id,
          job_id: event.job_id,
          action: `${event.event_type} → stage:${actions.stageKey || "none"} tags:${actions.tags.join(",")}`,
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
        // Include request payload and GHL response for debugging
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
