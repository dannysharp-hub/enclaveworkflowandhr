import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Always return 200 to avoid webhook retry storms
  const ok = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload = await req.json();
    console.log("GHL webhook received:", JSON.stringify(payload));

    const eventType = payload.type || payload.event || "appointment.booked";

    if (!eventType.includes("appointment") && eventType !== "AppointmentBooked") {
      return ok({ ok: true, skipped: true });
    }

    // Extract fields from various GHL payload shapes
    const email = payload.email || payload.contact?.email || payload.calendarData?.email;
    const phone = payload.phone || payload.contact?.phone || payload.calendarData?.phone;
    const jobRef = payload.customData?.job_ref || payload.job_ref || payload.queryParams?.job_ref || payload.calendarData?.job_ref;
    const appointmentStart = payload.startTime || payload.calendarData?.startTime || payload.appointment?.startTime;
    const appointmentEnd = payload.endTime || payload.calendarData?.endTime || payload.appointment?.endTime;
    const ghlAppointmentId = payload.id || payload.appointmentId;
    const calendarId = payload.calendarId || payload.calendarData?.calendarId || payload.calendar_id;
    const notes = payload.notes || payload.calendarData?.notes || "";

    if (!email && !phone && !jobRef) {
      console.error("GHL webhook: no identifiers found in payload");
      // Log unmatched and return 200
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
        .eq("job_ref", jobRef)
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
      // Insert unmatched event so admin can resolve
      if (companyId) {
        await supabase.from("cab_events").insert({
          company_id: companyId,
          event_type: "appointment.booked_unmatched",
          payload_json: { email, phone, jobRef, raw_payload: payload },
          status: "pending",
        });
      }
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
        .eq("company_id", companyId).eq("job_ref", jobRef).single();
      job = data;
    }

    if (!job) {
      // Find most recent open job in relevant states
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
      await supabase.from("cab_events").insert({
        company_id: companyId,
        event_type: "appointment.booked_unmatched",
        customer_id: customer.id,
        payload_json: { email, phone, jobRef, ghl_appointment_id: ghlAppointmentId, raw_payload: payload },
        status: "pending",
      });
      await supabase.from("cab_ghl_sync_log").insert({
        company_id: companyId,
        action: "appointment.booked_unmatched",
        success: false,
        error: `No open job for customer ${customer.id}`,
      });
      return ok({ ok: true, unmatched: true, reason: "no_open_job" });
    }

    // Upsert cab_appointments
    if (ghlAppointmentId) {
      const { data: existing } = await supabase.from("cab_appointments")
        .select("id").eq("ghl_appointment_id", ghlAppointmentId).maybeSingle();

      if (existing) {
        await supabase.from("cab_appointments").update({
          start_at: appointmentStart || new Date().toISOString(),
          end_at: appointmentEnd || null,
          ghl_calendar_id: calendarId || null,
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
          start_at: appointmentStart || new Date().toISOString(),
          end_at: appointmentEnd || null,
          ghl_appointment_id: ghlAppointmentId,
          ghl_calendar_id: calendarId || null,
          notes: notes || null,
        });
      }
    } else {
      await supabase.from("cab_appointments").insert({
        company_id: companyId,
        job_id: job.id,
        customer_id: customer.id,
        type: "site_visit",
        start_at: appointmentStart || new Date().toISOString(),
        end_at: appointmentEnd || null,
        ghl_calendar_id: calendarId || null,
        notes: notes || null,
      });
    }

    // Update assigned_rep_calendar_id if missing
    if (calendarId && !job.assigned_rep_calendar_id) {
      await supabase.from("cab_jobs").update({ assigned_rep_calendar_id: calendarId }).eq("id", job.id);
    }

    // Insert cab_events — the DB trigger handles state transition
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
    // Always 200 to prevent retry storms
    return ok({ ok: false, error: errMsg });
  }
});
