import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GHL_BASE = "https://services.leadconnectorhq.com";

async function ghlFetchContact(apiKey: string, contactId: string) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
  });
  if (!res.ok) throw new Error(`GHL contact fetch ${res.status}`);
  const data = await res.json();
  return data.contact;
}

function parseFormUrlEncoded(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function parsePayload(raw: string, contentType: string): { payload: Record<string, unknown>; parsed: boolean } {
  if (!raw || raw.trim() === "") return { payload: {}, parsed: true };

  // Try JSON first
  try {
    return { payload: JSON.parse(raw), parsed: true };
  } catch { /* not JSON */ }

  // Try form-urlencoded
  if (contentType.includes("application/x-www-form-urlencoded") || raw.includes("=")) {
    try {
      const formData = parseFormUrlEncoded(raw);
      if (Object.keys(formData).length > 0) {
        return { payload: formData, parsed: true };
      }
    } catch { /* not form data */ }
  }

  // Unparseable — store raw snippet
  return { payload: { payload_raw: raw.slice(0, 2000) }, parsed: false };
}

function extractFields(payload: Record<string, unknown>) {
  const contact = (payload.contact || {}) as Record<string, unknown>;
  return {
    firstName: (payload.first_name || payload.firstName || contact.first_name || contact.firstName || "Unknown") as string,
    lastName: (payload.last_name || payload.lastName || contact.last_name || contact.lastName || "") as string,
    email: (payload.email || contact.email || null) as string | null,
    phone: (payload.phone || contact.phone || null) as string | null,
    postcode: (payload.postcode || payload.postal_code || contact.postalCode || contact.postal_code || null) as string | null,
    formName: (payload.form_name || payload.formName || (payload.page as Record<string, unknown>)?.name || "unknown") as string,
    contactId: (payload.contact_id || payload.contactId || contact.id || null) as string | null,
    addressLine1: (payload.address1 || contact.address1 || null) as string | null,
    city: (payload.city || contact.city || null) as string | null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ok = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const contentType = req.headers.get("content-type") || "";
    const raw = await req.text();
    console.log("ghl-form content-type:", contentType, "body length:", raw.length);

    // Log every webhook hit to cab_webhook_logs
    const { payload, parsed } = parsePayload(raw, contentType);

    await supabase.from("cab_webhook_logs").insert({
      source: "ghl-form",
      event_type: "form.submitted",
      email: (payload.email || (payload.contact as any)?.email || null) as string | null,
      phone: (payload.phone || (payload.contact as any)?.phone || null) as string | null,
      contact_id: (payload.contact_id || payload.contactId || null) as string | null,
      payload_json: payload,
      status: parsed ? "received" : "unparsed",
    });

    // If we couldn't parse at all, log and return success to prevent GHL retries
    if (!parsed) {
      console.warn("ghl-form: unparseable body, logging for inspection");
      await supabase.from("cab_ghl_sync_log").insert({
        company_id: "00000000-0000-0000-0000-000000000000",
        action: "form.submitted_unparsed",
        success: false,
        error: `content_type=${contentType} raw_snippet=${raw.slice(0, 200)}`,
      });
      // Still try to extract a contact_id from the raw string
      const contactIdMatch = raw.match(/contact_id[=:]?\s*["']?([a-zA-Z0-9]+)/);
      if (!contactIdMatch) {
        return ok({ success: true, note: "unparsed_logged" });
      }
      // If we found a contact_id, put it in payload and continue
      payload.contact_id = contactIdMatch[1];
    }

    let fields = extractFields(payload);

    // If we have a contact_id but missing key fields, fetch from GHL API
    const missingKeyFields = !fields.email && !fields.phone && fields.firstName === "Unknown";
    if (fields.contactId && missingKeyFields) {
      const ghlApiKey = Deno.env.get("GHL_API_KEY");
      if (ghlApiKey) {
        try {
          console.log("ghl-form: fetching contact from GHL:", fields.contactId);
          const ghlContact = await ghlFetchContact(ghlApiKey, fields.contactId);
          // Merge GHL contact data into payload and re-extract
          const enriched = { ...payload, contact: ghlContact };
          fields = extractFields(enriched);
          console.log("ghl-form: enriched from GHL:", fields.firstName, fields.email);
        } catch (ghlErr) {
          console.error("ghl-form: GHL contact fetch failed:", ghlErr);
        }
      }
    }

    const { firstName, lastName, email, phone, postcode, formName, contactId, addressLine1, city } = fields;

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
        content_type: contentType,
        body_parsed: parsed,
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
    return ok({ success: true, note: "error_logged", error: errMsg });
  }
});
