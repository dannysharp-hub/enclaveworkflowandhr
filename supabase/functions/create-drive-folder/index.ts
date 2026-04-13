import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PARENT_FOLDER_ID = "1FfyX8aL26pX3aLAvw2I7LWgGL4EjdMa7";

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
    throw new Error(`No Google OAuth tokens found for tenant ${tenantId}. Please reconnect Google Drive.`);
  }

  if (!tokenRow.refresh_token_encrypted) {
    throw new Error("No refresh token stored. Please reconnect Google Drive with full permissions.");
  }

  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);

  // If token still valid (5min buffer), use it
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted);
  }

  // Refresh the token
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars not set.");
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

  // Persist refreshed token
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

  const startTime = Date.now();
  let errorStage = "init";

  try {
    errorStage = "parse_request";
    const { job_id, job_ref, customer_last_name } = await req.json();

    if (!job_id || !job_ref) {
      return jsonResponse({ ok: false, error: "job_id and job_ref are required", stage: errorStage }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    errorStage = "authenticate_user";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "Unauthorized", stage: errorStage }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseWithAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authError } = await supabaseWithAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return jsonResponse({ ok: false, error: "Unauthorized", stage: errorStage }, 401);
    }
    const userId = claimsData.claims.sub as string;

    // Resolve tenant_id from the authenticated caller, matching the existing Drive integration flow
    errorStage = "resolve_tenant";
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile?.tenant_id) {
      throw new Error(`No tenant found for authenticated user ${userId}`);
    }

    const { data: jobRow, error: jobErr } = await supabaseAdmin
      .from("cab_jobs")
      .select("id, company_id, drive_folder_id")
      .eq("id", job_id)
      .single();

    if (jobErr || !jobRow) {
      throw new Error(`Job not found: ${job_id}`);
    }

    if (jobRow.drive_folder_id) {
      return jsonResponse({
        ok: true,
        drive_folder_id: jobRow.drive_folder_id,
        drive_folder_name: job_ref,
        already_linked: true,
        stage: errorStage,
        processing_time_ms: Date.now() - startTime,
      });
    }

    const tenantId = profile.tenant_id;

    if (!tenantId) {
      throw new Error("No Google OAuth tokens configured. Please connect Google Drive first.");
    }

    errorStage = "get_access_token";
    const accessToken = await getAccessToken(supabaseAdmin, tenantId);

    // Build folder name
    const safeName = (customer_last_name || "unknown").replace(/[^a-zA-Z0-9_\-]/g, "");
    const folderName = `${job_ref}_${safeName}`;

    // Create folder in Google Drive
    errorStage = "create_drive_folder";
    console.log(`Creating Drive folder: ${folderName} in parent ${PARENT_FOLDER_ID}`);

    const driveRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [PARENT_FOLDER_ID],
      }),
    });

    if (!driveRes.ok) {
      const errBody = await driveRes.text();
      console.error(`Drive API error [${driveRes.status}]: ${errBody}`);
      throw new Error(`Drive API ${driveRes.status}: ${errBody}`);
    }

    const driveFolder = await driveRes.json();
    console.log(`Drive folder created: ${driveFolder.id}`);

    // Save to cab_jobs
    errorStage = "update_job";
    const { error: updateError } = await supabaseAdmin
      .from("cab_jobs")
      .update({
        drive_folder_id: driveFolder.id,
        drive_folder_name: folderName,
      })
      .eq("id", job_id);

    if (updateError) throw updateError;

    return jsonResponse({
      ok: true,
      drive_folder_id: driveFolder.id,
      drive_folder_name: folderName,
      processing_time_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error(`create-drive-folder failed at stage="${errorStage}":`, err.message);
    return jsonResponse({
      ok: false,
      error: err.message,
      stage: errorStage,
      processing_time_ms: Date.now() - startTime,
    }, 500);
  }
});
