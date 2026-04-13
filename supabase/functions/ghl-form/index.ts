import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GHL_BASE = "https://services.leadconnectorhq.com";

const ACTIVE_STAGES = [
  "lead_captured", "ballpark_sent", "appointment_requested",
  "appointment_booked", "quote_sent", "quote_viewed", "awaiting_deposit",
];

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
  try { return { payload: JSON.parse(raw), parsed: true }; } catch { /* not JSON */ }
  if (contentType.includes("application/x-www-form-urlencoded") || raw.includes("=")) {
    try {
      const formData = parseFormUrlEncoded(raw);
      if (Object.keys(formData).length > 0) return { payload: formData, parsed: true };
    } catch { /* not form data */ }
  }
  return { payload: { payload_raw: raw.slice(0, 2000) }, parsed: false };
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

/** Normalize phone: strip spaces, dashes, parens; ensure +44 or 0-prefix consistency */
function normPhone(s: string | null | undefined): string {
  if (!s) return "";
  let p = s.replace(/[\s\-\(\)\.]/g, "");
  // Standardize UK: +440 → +44, 0044 → +44
  if (p.startsWith("0044")) p = "+44" + p.slice(4);
  if (p.startsWith("+440")) p = "+44" + p.slice(4);
  // If starts with +44 and next char isn't 0, fine; if local 07xxx keep as-is
  return p;
}

function extractFields(payload: Record<string, unknown>) {
  const contact = (payload.contact || {}) as Record<string, unknown>;
  return {
    firstName: ((payload.first_name || payload.firstName || contact.first_name || contact.firstName || "Unknown") as string).trim(),
    lastName: ((payload.last_name || payload.lastName || contact.last_name || contact.lastName || "") as string).trim(),
    email: norm(payload.email as string || contact.email as string) || null,
    phone: normPhone(payload.phone as string || contact.phone as string) || null,
    postcode: ((payload.postcode || payload.postal_code || contact.postalCode || contact.postal_code || null) as string | null)?.trim() || null,
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

    if (!parsed) {
      console.warn("ghl-form: unparseable body, logging for inspection");
      await supabase.from("cab_ghl_sync_log").insert({
        company_id: "00000000-0000-0000-0000-000000000000",
        action: "form.submitted_unparsed",
        success: false,
        error: `content_type=${contentType} raw_snippet=${raw.slice(0, 200)}`,
      });
      const contactIdMatch = raw.match(/contact_id[=:]?\s*["']?([a-zA-Z0-9]+)/);
      if (!contactIdMatch) return ok({ success: true, note: "unparsed_logged" });
      payload.contact_id = contactIdMatch[1];
    }

    let fields = extractFields(payload);

    // Enrich from GHL if missing key fields
    const missingKeyFields = !fields.email && !fields.phone && fields.firstName === "Unknown";
    if (fields.contactId && missingKeyFields) {
      const ghlApiKey = Deno.env.get("GHL_API_KEY");
      if (ghlApiKey) {
        try {
          console.log("ghl-form: fetching contact from GHL:", fields.contactId);
          const ghlContact = await ghlFetchContact(ghlApiKey, fields.contactId);
          fields = extractFields({ ...payload, contact: ghlContact });
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

    // ── 1) Upsert customer by email (normalized), fallback phone ──
    let customer: any = null;

    if (email) {
      const { data } = await supabase
        .from("cab_customers")
        .select("*")
        .eq("company_id", companyId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      customer = data;
    }

    if (!customer && phone) {
      const { data } = await supabase
        .from("cab_customers")
        .select("*")
        .eq("company_id", companyId)
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();
      customer = data;
    }

    if (customer) {
      // Update any changed fields
      await supabase.from("cab_customers").update({
        first_name: firstName,
        last_name: lastName,
        email: email || customer.email,
        phone: phone || customer.phone,
        postcode: postcode || customer.postcode,
        address_line_1: addressLine1 || customer.address_line_1,
        city: city || customer.city,
        ghl_contact_id: contactId || customer.ghl_contact_id,
        updated_at: new Date().toISOString(),
      }).eq("id", customer.id);
      console.log("ghl-form: reused existing customer", customer.id);
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
          ghl_contact_id: contactId,
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
      console.log("ghl-form: created new customer", customer.id);
    }

    // ── 2) Check for existing active jobs for this customer (within 90 days) ──
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: activeJobs } = await supabase
      .from("cab_jobs")
      .select("id, job_ref, current_stage_key, room_type, ghl_contact_id, created_at")
      .eq("company_id", companyId)
      .eq("customer_id", customer.id)
      .in("current_stage_key", ACTIVE_STAGES)
      .neq("status", "closed")
      .neq("status", "cancelled")
      .gte("created_at", ninetyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    const activeCount = activeJobs?.length || 0;

    // Map room_type from form_name
    let roomType = "general";
    const fnLower = formName.toLowerCase();
    if (fnLower.includes("media wall")) roomType = "media_wall";
    else if (fnLower.includes("wardrobe")) roomType = "wardrobes";

    // Helper: detect clearly different project (different room AND different postcode)
    function isDifferentProject(existingJob: any): boolean {
      if (roomType === "general") return false;
      const diffRoom = existingJob.room_type && existingJob.room_type !== roomType;
      const existingPc = norm((existingJob.property_address_json as any)?.postcode);
      const newPc = norm(postcode);
      const diffAddr = newPc && existingPc && newPc !== existingPc;
      return !!(diffRoom && diffAddr);
    }

    // ── 3a) Multiple active jobs → flag possible duplicate ──
    if (activeCount > 1) {
      const latestJob = activeJobs![0];
      console.log(`ghl-form: DUPLICATE FLAG — customer ${customer.id} has ${activeCount} active jobs: ${activeJobs!.map((j: any) => j.job_ref).join(", ")}`);

      await supabase.from("cab_events").insert({
        company_id: companyId,
        event_type: "lead.possible_duplicate",
        job_id: latestJob.id,
        customer_id: customer.id,
        payload_json: {
          form_name: formName, room_type: roomType, postcode, ghl_contact_id: contactId,
          source: "ghl_form", active_job_count: activeCount,
          active_job_refs: activeJobs!.map((j: any) => j.job_ref),
          note: `Customer has ${activeCount} active jobs — not creating another. Manual review required.`,
        },
        status: "pending",
      });

      await supabase.from("cab_ghl_sync_log").insert({
        company_id: companyId, action: "form.possible_duplicate_flagged",
        job_id: latestJob.id, success: true,
        error: `${activeCount} active jobs found: ${activeJobs!.map((j: any) => j.job_ref).join(", ")}`,
      });

      return ok({ success: true, job_ref: latestJob.job_ref, reused: true, duplicate_flagged: true, note: "possible_duplicate_flagged" });
    }

    // ── 3b) Exactly one active job ──
    if (activeCount === 1) {
      const existingJob = activeJobs![0];

      // If clearly a different project, fall through to create new job
      if (isDifferentProject(existingJob)) {
        console.log(`ghl-form: Different project detected (room: ${roomType} vs ${existingJob.room_type}, postcode: ${postcode} vs ${(existingJob as any).property_address_json?.postcode}). Creating new job.`);
      } else {
        // Reuse existing job
        console.log(`ghl-form: REUSING existing active job ${existingJob.job_ref} (stage: ${existingJob.current_stage_key}) for customer ${customer.id}`);

        const jobUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (contactId && !existingJob.ghl_contact_id) jobUpdates.ghl_contact_id = contactId;
        if (roomType !== "general" && existingJob.room_type !== roomType) jobUpdates.room_type = roomType;
        if (postcode) {
          jobUpdates.property_address_json = { postcode: postcode || null, address_line_1: addressLine1 || null, city: city || null };
        }
        await supabase.from("cab_jobs").update(jobUpdates).eq("id", existingJob.id);

        await supabase.from("cab_events").insert({
          company_id: companyId, event_type: "lead.resubmitted",
          job_id: existingJob.id, customer_id: customer.id,
          payload_json: {
            form_name: formName, room_type: roomType, postcode, ghl_contact_id: contactId,
            source: "ghl_form", note: "Duplicate enquiry merged into existing active job",
            original_stage: existingJob.current_stage_key,
          },
          status: "pending",
        });

        await supabase.from("cab_ghl_sync_log").insert({
          company_id: companyId, action: "form.resubmitted_merged",
          job_id: existingJob.id, success: true, error: null,
        });

        console.log(`ghl-form: lead.resubmitted → reused ${existingJob.job_ref}`);
        return ok({ success: true, job_ref: existingJob.job_ref, reused: true, note: "reused_existing_active_job" });
      }
    }

    // ── 4) No active job → create new one ──
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
        note: "New job created — no existing active job found for this customer",
      },
      status: "pending",
    });

    await supabase.from("cab_ghl_sync_log").insert({
      company_id: companyId,
      action: "form.submitted_new",
      job_id: job.id,
      success: true,
    });

    console.log(`ghl-form: NEW lead created ${job.job_ref}`);

    // Auto-create Drive folder (fire & forget via edge function call)
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      // Get a tenant's user to make the call (need auth context for google-drive-auth)
      const { data: memberRow } = await supabase
        .from("cab_company_memberships")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("role", "admin")
        .limit(1)
        .single();

      if (memberRow?.user_id) {
        // Get the tenant_id for this user
        const { data: prof } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", memberRow.user_id)
          .single();

        if (prof?.tenant_id) {
          // Check if Google Drive is connected for this tenant
          const { data: driveSettings } = await supabase
            .from("google_drive_integration_settings")
            .select("is_connected")
            .eq("tenant_id", prof.tenant_id)
            .single();

          if (driveSettings?.is_connected) {
            // Get Google OAuth tokens directly
            const { data: tokenRow } = await supabase
              .from("google_oauth_tokens")
              .select("*")
              .eq("tenant_id", prof.tenant_id)
              .single();

            if (tokenRow) {
              let accessToken: string;
              const now = new Date();
              const expiresAt = new Date(tokenRow.expires_at);

              if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
                accessToken = atob(tokenRow.access_token_encrypted);
              } else {
                const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
                const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
                const refreshToken = atob(tokenRow.refresh_token_encrypted);

                const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({
                    client_id: GOOGLE_CLIENT_ID,
                    client_secret: GOOGLE_CLIENT_SECRET,
                    refresh_token: refreshToken,
                    grant_type: "refresh_token",
                  }),
                });
                const tokenData = await tokenRes.json();
                if (tokenRes.ok) {
                  accessToken = tokenData.access_token;
                  await supabase.from("google_oauth_tokens").update({
                    access_token_encrypted: btoa(tokenData.access_token),
                    expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
                    token_version: tokenRow.token_version + 1,
                  }).eq("id", tokenRow.id);
                } else {
                  accessToken = "";
                }
              }

              if (accessToken) {
                // Build folder name
                const parts = [job.job_ref];
                if (lastName) parts.push(lastName);
                if (roomType) parts.push(roomType);
                const folderName = parts.join("_").replace(/[\/\\:*?"<>|]/g, "_");
                const JOBS_FOLDER_ID = "1FfyX8aL26pX3aLAvw2I7LWgGL4EjdMa7";

                const createRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    name: folderName,
                    mimeType: "application/vnd.google-apps.folder",
                    parents: [JOBS_FOLDER_ID],
                  }),
                });
                const createData = await createRes.json();
                if (createRes.ok && createData.id) {
                  await supabase.from("cab_jobs").update({
                    drive_folder_id: createData.id,
                    drive_folder_name: folderName,
                    updated_at: new Date().toISOString(),
                  }).eq("id", job.id);
                  console.log(`ghl-form: Drive folder created "${folderName}" → ${createData.id}`);
                }
              }
            }
          }
        }
      }
    } catch (driveErr: unknown) {
      console.error("ghl-form: Drive folder creation failed (non-fatal)", driveErr);
    }

    return ok({ success: true, job_ref: job.job_ref, reused: false, note: "new_job_created" });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("ghl-form error:", errMsg);
    return ok({ success: true, note: "error_logged", error: errMsg });
  }
});
