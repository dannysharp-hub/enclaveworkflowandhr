import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ok = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = await req.json();
    console.log("ghl-form received:", JSON.stringify(payload));

    // Extract fields (flexible — GHL payloads vary)
    const firstName = payload.first_name || payload.firstName || payload.contact?.first_name || "Unknown";
    const lastName = payload.last_name || payload.lastName || payload.contact?.last_name || "";
    const email = payload.email || payload.contact?.email || null;
    const phone = payload.phone || payload.contact?.phone || null;
    const postcode = payload.postcode || payload.postal_code || payload.contact?.postalCode || null;
    const formName = payload.form_name || payload.formName || payload.page?.name || "unknown";
    const contactId = payload.contact_id || payload.contactId || payload.contact?.id || null;
    const addressLine1 = payload.address1 || payload.contact?.address1 || null;
    const city = payload.city || payload.contact?.city || null;

    // Resolve company
    const { data: company, error: compErr } = await supabase
      .from("cab_companies")
      .select("id")
      .eq("name", "Enclave Cabinetry")
      .single();

    if (compErr || !company) {
      console.error("ghl-form: Enclave Cabinetry company not found");
      await supabase.from("cab_ghl_sync_log").insert({
        company_id: "00000000-0000-0000-0000-000000000000",
        action: "form.submitted_error",
        success: false,
        error: "Enclave Cabinetry company not found",
      });
      return ok({ success: false, error: "company_not_found" });
    }

    const companyId = company.id;

    // Upsert customer by email, fallback phone
    let customer: any = null;

    if (email) {
      const { data } = await supabase
        .from("cab_customers")
        .select("*")
        .eq("company_id", companyId)
        .eq("email", email)
        .maybeSingle();
      customer = data;
    }

    if (!customer && phone) {
      const { data } = await supabase
        .from("cab_customers")
        .select("*")
        .eq("company_id", companyId)
        .eq("phone", phone)
        .maybeSingle();
      customer = data;
    }

    if (customer) {
      // Update existing
      await supabase.from("cab_customers").update({
        first_name: firstName,
        last_name: lastName,
        email: email || customer.email,
        phone: phone || customer.phone,
        postcode: postcode || customer.postcode,
        address_line_1: addressLine1 || customer.address_line_1,
        city: city || customer.city,
        updated_at: new Date().toISOString(),
      }).eq("id", customer.id);
    } else {
      const { data: newCust, error: custErr } = await supabase
        .from("cab_customers")
        .insert({
          company_id: companyId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          postcode,
          address_line_1: addressLine1,
          city,
        })
        .select("*")
        .single();

      if (custErr) {
        console.error("ghl-form: customer insert failed", custErr);
        await supabase.from("cab_ghl_sync_log").insert({
          company_id: companyId,
          action: "form.submitted_error",
          success: false,
          error: `Customer insert failed: ${custErr.message}`,
        });
        return ok({ success: false, error: "customer_insert_failed" });
      }
      customer = newCust;
    }

    // Map room_type from form_name
    let roomType = "general";
    const fnLower = formName.toLowerCase();
    if (fnLower.includes("media wall")) roomType = "media_wall";
    else if (fnLower.includes("wardrobe")) roomType = "wardrobes";

    // Generate job_ref
    const { data: seqNum, error: seqErr } = await supabase.rpc("cab_next_job_number", { _company_id: companyId });
    if (seqErr) {
      console.error("ghl-form: job number generation failed", seqErr);
      await supabase.from("cab_ghl_sync_log").insert({
        company_id: companyId,
        action: "form.submitted_error",
        success: false,
        error: `Job number generation failed: ${seqErr.message}`,
      });
      return ok({ success: false, error: "job_number_failed" });
    }

    const seq = (seqNum as number).toString().padStart(3, "0");
    const namePart = (firstName + lastName).toLowerCase().replace(/[^a-z0-9]/g, "");
    const jobRef = `${seq}_${namePart}`;

    // Create job
    const { data: job, error: jobErr } = await supabase
      .from("cab_jobs")
      .insert({
        company_id: companyId,
        customer_id: customer.id,
        job_ref: jobRef,
        job_title: `${firstName} ${lastName} – ${roomType}`,
        status: "lead",
        state: "awaiting_ballpark",
        current_stage_key: "lead_captured",
        assigned_rep_name: "Alistair",
        assigned_rep_calendar_id: "uFzAuYubySZdQZ3KASD2",
        room_type: roomType,
        ghl_contact_id: contactId,
        property_address_json: {
          postcode: postcode || null,
          address_line_1: addressLine1 || null,
          city: city || null,
        },
      })
      .select("id, job_ref")
      .single();

    if (jobErr) {
      console.error("ghl-form: job insert failed", jobErr);
      await supabase.from("cab_ghl_sync_log").insert({
        company_id: companyId,
        action: "form.submitted_error",
        success: false,
        error: `Job insert failed: ${jobErr.message}`,
      });
      return ok({ success: false, error: "job_insert_failed" });
    }

    // Insert cab_events — triggers state machine
    await supabase.from("cab_events").insert({
      company_id: companyId,
      event_type: "lead.created",
      job_id: job.id,
      customer_id: customer.id,
      payload_json: {
        form_name: formName,
        room_type: roomType,
        postcode,
        ghl_contact_id: contactId,
        source: "ghl_form",
      },
      status: "pending",
    });

    // Success log
    await supabase.from("cab_ghl_sync_log").insert({
      company_id: companyId,
      action: "form.submitted",
      job_id: job.id,
      success: true,
    });

    console.log(`ghl-form: lead created ${job.job_ref}`);
    return ok({ success: true, job_ref: job.job_ref });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("ghl-form error:", errMsg);
    return ok({ success: false, error: errMsg });
  }
});
