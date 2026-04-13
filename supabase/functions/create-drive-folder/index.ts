import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PARENT_FOLDER_ID = "1FfyX8aL26pX3aLAvw2I7LWgGL4EjdMa7";

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
      return new Response(
        JSON.stringify({ error: "job_id and job_ref are required", stage: errorStage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve tenant_id: try cab_company_tenant_map first, fall back to first available token
    errorStage = "resolve_tenant";
    const { data: jobRow, error: jobErr } = await supabaseAdmin
      .from("cab_jobs")
      .select("company_id")
      .eq("id", job_id)
      .single();

    if (jobErr || !jobRow) {
      throw new Error(`Job not found: ${job_id}`);
    }

    let tenantId: string | null = null;

    // Try tenant map first
    const { data: tenantMap } = await supabaseAdmin
      .from("cab_company_tenant_map")
      .select("tenant_id")
      .eq("company_id", jobRow.company_id)
      .single();

    if (tenantMap?.tenant_id) {
      tenantId = tenantMap.tenant_id;
    } else {
      // Fallback: use the first available google_oauth_tokens row
      const { data: fallbackToken } = await supabaseAdmin
        .from("google_oauth_tokens")
        .select("tenant_id")
        .limit(1)
        .single();
      tenantId = fallbackToken?.tenant_id || null;
      console.log(`No tenant map for company ${jobRow.company_id}, falling back to tenant ${tenantId}`);
    }

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

    return new Response(
      JSON.stringify({
        drive_folder_id: driveFolder.id,
        drive_folder_name: folderName,
        processing_time_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`create-drive-folder failed at stage="${errorStage}":`, err.message);
    return new Response(
      JSON.stringify({
        error: err.message,
        stage: errorStage,
        processing_time_ms: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
