import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAccessToken(supabaseAdmin: any, tenantId: string): Promise<string> {
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (tokenErr || !tokenRow) {
    throw new Error(`No Google OAuth tokens found for tenant ${tenantId}`);
  }

  if (!tokenRow.refresh_token_encrypted) {
    throw new Error("No refresh token stored. Please reconnect Google Drive.");
  }

  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);

  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted);
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set.");
  }

  const refreshToken = atob(tokenRow.refresh_token_encrypted);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error || "unknown"}`);
  }

  await supabaseAdmin
    .from("google_oauth_tokens")
    .update({
      access_token_encrypted: btoa(data.access_token),
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      token_version: tokenRow.token_version + 1,
    })
    .eq("id", tokenRow.id);

  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let errorStage = "init";
  try {
    errorStage = "parse_request";
    const { job_id } = await req.json();
    if (!job_id) {
      return jsonResponse({ ok: false, error: "job_id is required" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth check
    errorStage = "authenticate";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseWithAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authError } = await supabaseWithAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    // Resolve tenant
    errorStage = "resolve_tenant";
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .single();
    if (!profile?.tenant_id) {
      throw new Error("No tenant found for user");
    }
    const tenantId = profile.tenant_id;

    // Fetch job
    errorStage = "fetch_job";
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("cab_jobs")
      .select("*")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) throw new Error(`Job not found: ${job_id}`);

    if (!job.drive_folder_id) {
      return jsonResponse({ ok: false, error: "No Drive folder linked to this job", stage: errorStage }, 400);
    }

    // Fetch customer
    errorStage = "fetch_customer";
    const { data: customer } = await supabaseAdmin
      .from("cab_customers")
      .select("first_name, last_name, email, phone, postcode, address_line_1, address_line_2, city")
      .eq("id", job.customer_id)
      .single();

    // Build address string
    const addr = job.property_address_json || {};
    const propertyAddress = [addr.address, addr.city, addr.postcode].filter(Boolean).join(", ");

    // Build JSON payload
    const now = new Date().toISOString();
    const jobJson = {
      job_ref: job.job_ref || "",
      job_title: job.job_title || "",
      status: job.status || "",
      stage: job.current_stage_key || "",
      room_type: job.room_type || "",
      client_name: customer ? `${customer.first_name} ${customer.last_name}` : "",
      client_email: customer?.email || "",
      client_phone: customer?.phone || "",
      client_postcode: customer?.postcode || "",
      property_address: propertyAddress,
      contract_value: Number(job.contract_value) || 0,
      ballpark_min: Number(job.ballpark_min) || 0,
      ballpark_max: Number(job.ballpark_max) || 0,
      deposit_amount: Number(job.deposit_amount) || 0,
      deposit_paid_at: job.deposit_paid_at || null,
      progress_payment_amount: Number(job.progress_payment_amount) || 0,
      progress_payment_paid_at: job.progress_payment_paid_at || null,
      final_payment_amount: Number(job.final_payment_amount) || 0,
      final_payment_paid_at: job.final_payment_paid_at || null,
      production_stage_key: job.production_stage_key || "",
      production_stage: job.production_stage || "",
      install_date: job.install_date || null,
      install_completed_at: job.install_completed_at || null,
      sign_off_completed_at: job.sign_off_completed_at || null,
      dry_fit_completed: !!job.dry_fit_completed,
      dry_fit_completed_at: job.dry_fit_completed_at || null,
      site_visit_2_completed: !!job.site_visit_2_completed,
      site_visit_2_date: job.site_visit_2_date || null,
      assigned_rep: job.assigned_rep_name || "",
      ghl_contact_id: job.ghl_contact_id || "",
      ghl_opportunity_id: job.ghl_opportunity_id || "",
      drive_folder_id: job.drive_folder_id || "",
      created_at: job.created_at || "",
      updated_at: job.updated_at || "",
      last_synced_at: now,
    };

    const fileContent = JSON.stringify(jobJson, null, 2);
    const folderId = job.drive_folder_id;

    // Get access token
    errorStage = "get_access_token";
    const accessToken = await getAccessToken(supabaseAdmin, tenantId);

    // Check if job.json already exists in the folder
    errorStage = "search_existing";
    const searchQuery = `name='job.json' and '${folderId}' in parents and trashed=false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    const existingFileId = searchData.files?.[0]?.id;

    if (existingFileId) {
      // Overwrite existing file
      errorStage = "overwrite_file";
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media&supportsAllDrives=true`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: fileContent,
        }
      );
      if (!updateRes.ok) {
        const errBody = await updateRes.text();
        throw new Error(`Drive update failed ${updateRes.status}: ${errBody}`);
      }
      console.log(`[write-job-json] Updated existing job.json (${existingFileId}) for job ${job.job_ref}`);
    } else {
      // Create new file
      errorStage = "create_file";
      const boundary = "job_json_boundary";
      const metadata = JSON.stringify({
        name: "job.json",
        parents: [folderId],
        mimeType: "application/json",
      });

      const multipartBody =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${fileContent}\r\n` +
        `--${boundary}--`;

      const createRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      );
      if (!createRes.ok) {
        const errBody = await createRes.text();
        throw new Error(`Drive create failed ${createRes.status}: ${errBody}`);
      }
      const created = await createRes.json();
      console.log(`[write-job-json] Created job.json (${created.id}) for job ${job.job_ref}`);
    }

    return jsonResponse({ ok: true, job_ref: job.job_ref });
  } catch (err: any) {
    console.error(`[write-job-json] Failed at stage="${errorStage}":`, err.message);
    return jsonResponse({ ok: false, error: err.message, stage: errorStage }, 500);
  }
});
