import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseFormUrlEncoded(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) result[key] = value;
  return result;
}

function safeParseBody(raw: string, contentType: string): Record<string, unknown> {
  if (!raw || raw.trim() === "") return {};

  // Try JSON
  try { return JSON.parse(raw); } catch { /* not JSON */ }

  // Try form-urlencoded
  if (contentType.includes("application/x-www-form-urlencoded") || raw.includes("=")) {
    try {
      const formData = parseFormUrlEncoded(raw);
      if (Object.keys(formData).length > 0) return formData;
    } catch { /* not form data */ }
  }

  // Fallback — store raw snippet
  return { _raw: raw.slice(0, 2000), _parse_failed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Always return 200 to avoid webhook retry storms
  const ok = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let payload: Record<string, unknown> = {};
  let rawSnippet = "";

  try {
    const contentType = req.headers.get("content-type") || "";
    const raw = await req.text();
    rawSnippet = raw.slice(0, 500);
    console.log("GHL webhook content-type:", contentType, "body length:", raw.length);

    payload = safeParseBody(raw, contentType);

    // Log every webhook hit
    const eventType = (payload.type || payload.event || "appointment.booked") as string;
    const email = (payload.email || (payload.contact as any)?.email || (payload.calendarData as any)?.email) as string | undefined;
    const phone = (payload.phone || (payload.contact as any)?.phone || (payload.calendarData as any)?.phone) as string | undefined;
    const jobRef = (payload.customData as any)?.job_ref || payload.job_ref || (payload.queryParams as any)?.job_ref || (payload.calendarData as any)?.job_ref;
    const contactId = (payload.contact_id || payload.contactId || (payload.contact as any)?.id) as string | undefined;

    // Always log to cab_webhook_logs
    await supabase.from("cab_webhook_logs").insert({
      source: "ghl",
      event_type: eventType,
      job_ref: jobRef || null,
      contact_id: contactId || null,
      email: email || null,
      phone: phone || null,
      payload_json: payload,
      status: "received",
    });

    // If parse failed, return early
    if (payload._parse_failed) {
      console.warn("GHL webhook: unparseable body");
      return ok({ ok: true, note: "unparseable_logged" });
    }

    if (!eventType.includes("appointment") && eventType !== "AppointmentBooked") {
      return ok({ ok: true, skipped: true });
    }

    const appointmentStart = payload.startTime || (payload.calendarData as any)?.startTime || (payload.appointment as any)?.startTime;
    const appointmentEnd = payload.endTime || (payload.calendarData as any)?.endTime || (payload.appointment as any)?.endTime;
    const ghlAppointmentId = (payload.id || payload.appointmentId) as string | undefined;
    const calendarId = (payload.calendarId || (payload.calendarData as any)?.calendarId || payload.calendar_id) as string | undefined;
    const notes = (payload.notes || (payload.calendarData as any)?.notes || "") as string;

    if (!email && !phone && !jobRef) {
      console.error("GHL webhook: no identifiers found in payload");
      await supabase.from("cab_ghl_sync_log").insert({
        company_id: "00000000-0000-0000-0000-000000000000",
        action: "appointment.booked_unmatched",
        success: false,
        error: "No customer identifier in webhook payload",
      });
      return ok({ ok: true, unmatched: true, reason: "no_identifier" });
    }

    // Find customer + company
    let customer: any = null;
    let companyId: string | null = null;

    if (jobRef) {
      const { data: job } = await supabase
        .from("cab_jobs")
        .select("id, company_id, customer_id")
        .eq("job_ref", jobRef as string)
        .single();
      if (job) {
        companyId = job.company_id;
        const { data: cust } = await supabase.from("cab_customers").select("*").eq("id", job.customer_id).single();
        customer = cust;
      }
    }

    if (!customer && email) {
      const { data: custs } = await supabase.from("cab_customers").select("*").eq("email", email).limit(1);
      if (custs?.length) { customer = custs[0]; companyId = customer.company_id; }
    }

    if (!customer && phone) {
      const { data: custs } = await supabase.from("cab_customers").select("*").eq("phone", phone).limit(1);
      if (custs?.length) { customer = custs[0]; companyId = customer.company_id; }
    }

    if (!customer || !companyId) {
      console.error("GHL webhook: customer not found", { email, phone, jobRef });
      await supabase.from("cab_ghl_sync_log").insert({
        company_id: companyId || "00000000-0000-0000-0000-000000000000",
        action: "appointment.booked_unmatched",
        success: false,
        error: `Customer not found: email=${email}, phone=${phone}, jobRef=${jobRef}`,
      });
      return ok({ ok: true, unmatched: true, reason: "customer_not_found" });
    }

    // Find the job
    let job: any = null;
    if (jobRef) {
      const { data } = await supabase.from("cab_jobs").select("*")
        .eq("company_id", companyId).eq("job_ref", jobRef as string).single();
      job = data;
    }

    if (!job) {
      const { data } = await supabase.from("cab_jobs").select("*")
        .eq("company_id", companyId)
        .eq("customer_id", customer.id)
        .neq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1);
      job = data?.[0];
    }

    if (!job) {
      console.error("GHL webhook: no open job found for customer", customer.id);
      await supabase.from("cab_ghl_sync_log").insert({
        company_id: companyId,
        action: "appointment.booked_unmatched",
        success: false,
        error: `No open job for customer ${customer.id}`,
      });
      return ok({ ok: true, unmatched: true, reason: "no_open_job" });
    }

    // Update webhook log with company + job_ref
    await supabase.from("cab_webhook_logs")
      .update({ status: "matched", job_ref: job.job_ref, company_id: companyId })
      .eq("job_ref", jobRef || "")
      .is("company_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    // Upsert cab_appointments
    if (ghlAppointmentId) {
      const { data: existing } = await supabase.from("cab_appointments")
        .select("id").eq("ghl_appointment_id", ghlAppointmentId).maybeSingle();

      if (existing) {
        await supabase.from("cab_appointments").update({
          start_at: (appointmentStart as string) || new Date().toISOString(),
          end_at: (appointmentEnd as string) || null,
          ghl_calendar_id: (calendarId as string) || null,
          notes: notes || null,
          status: "booked",
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("cab_appointments").insert({
          company_id: companyId,
          job_id: job.id,
          customer_id: customer.id,
          type: "site_visit",
          start_at: (appointmentStart as string) || new Date().toISOString(),
          end_at: (appointmentEnd as string) || null,
          ghl_appointment_id: ghlAppointmentId,
          ghl_calendar_id: (calendarId as string) || null,
          notes: notes || null,
        });
      }
    } else {
      await supabase.from("cab_appointments").insert({
        company_id: companyId,
        job_id: job.id,
        customer_id: customer.id,
        type: "site_visit",
        start_at: (appointmentStart as string) || new Date().toISOString(),
        end_at: (appointmentEnd as string) || null,
        ghl_calendar_id: (calendarId as string) || null,
        notes: notes || null,
      });
    }

    if (calendarId && !job.assigned_rep_calendar_id) {
      await supabase.from("cab_jobs").update({ assigned_rep_calendar_id: calendarId }).eq("id", job.id);
    }

    const { error: insertErr } = await supabase.from("cab_events").insert({
      company_id: companyId,
      event_type: "appointment.booked",
      job_id: job.id,
      customer_id: customer.id,
      payload_json: {
        appointment_start: appointmentStart,
        appointment_end: appointmentEnd,
        ghl_appointment_id: ghlAppointmentId,
        ghl_calendar_id: calendarId,
        notes,
        source: "ghl_webhook",
      },
      status: "pending",
    });

    if (insertErr) {
      console.error("GHL webhook: failed to insert event", insertErr);
      return ok({ ok: true, error: insertErr.message });
    }

    console.log(`GHL webhook: appointment.booked event created for job ${job.job_ref}`);
    return ok({ ok: true, job_ref: job.job_ref });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("GHL webhook error:", errMsg);
    // Log error to webhook logs
    try {
      await supabase.from("cab_webhook_logs").insert({
        source: "ghl",
        event_type: "error",
        status: "error",
        payload_json: { error: errMsg, raw_snippet: rawSnippet },
      });
    } catch { /* best effort */ }
    return ok({ ok: false, error: errMsg });
  }
});
