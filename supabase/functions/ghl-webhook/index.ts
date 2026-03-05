import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload = await req.json();
    console.log("GHL webhook received:", JSON.stringify(payload));

    // GHL appointment booked payload structure varies — handle common shapes
    const eventType = payload.type || payload.event || "appointment.booked";

    // Only handle appointment-related events for now
    if (!eventType.includes("appointment") && eventType !== "AppointmentBooked") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract customer identifiers
    const email = payload.email || payload.contact?.email || payload.calendarData?.email;
    const phone = payload.phone || payload.contact?.phone || payload.calendarData?.phone;
    const jobRef = payload.customData?.job_ref || payload.job_ref;
    const appointmentStart = payload.startTime || payload.calendarData?.startTime || payload.appointment?.startTime;
    const appointmentEnd = payload.endTime || payload.calendarData?.endTime || payload.appointment?.endTime;
    const ghlAppointmentId = payload.id || payload.appointmentId;
    const notes = payload.notes || payload.calendarData?.notes || "";

    if (!email && !phone && !jobRef) {
      console.error("GHL webhook: no identifiers found in payload");
      return new Response(JSON.stringify({ error: "No customer identifier found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find customer + company
    let customer: any = null;
    let companyId: string | null = null;

    if (jobRef) {
      // Best path: find by job_ref
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
      if (custs?.length) {
        customer = custs[0];
        companyId = customer.company_id;
      }
    }

    if (!customer && phone) {
      const { data: custs } = await supabase.from("cab_customers").select("*").eq("phone", phone).limit(1);
      if (custs?.length) {
        customer = custs[0];
        companyId = customer.company_id;
      }
    }

    if (!customer || !companyId) {
      console.error("GHL webhook: customer not found", { email, phone, jobRef });
      return new Response(JSON.stringify({ error: "Customer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the job (prefer jobRef, fallback to most recent open job for customer)
    let job: any = null;
    if (jobRef) {
      const { data } = await supabase
        .from("cab_jobs")
        .select("*")
        .eq("company_id", companyId)
        .eq("job_ref", jobRef)
        .single();
      job = data;
    }

    if (!job) {
      const { data } = await supabase
        .from("cab_jobs")
        .select("*")
        .eq("company_id", companyId)
        .eq("customer_id", customer.id)
        .neq("status", "closed")
        .order("created_at", { ascending: false })
        .limit(1);
      job = data?.[0];
    }

    if (!job) {
      console.error("GHL webhook: no open job found for customer", customer.id);
      return new Response(JSON.stringify({ error: "No open job found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        notes,
        source: "ghl_webhook",
      },
      status: "pending",
    });

    if (insertErr) {
      console.error("GHL webhook: failed to insert event", insertErr);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`GHL webhook: appointment.booked event created for job ${job.job_ref}`);
    return new Response(JSON.stringify({ ok: true, job_ref: job.job_ref }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("GHL webhook error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
