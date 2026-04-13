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

  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted);
  }

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

/** List ALL folders in the parent folder, handling pagination */
async function listAllDriveFolders(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  const folders: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "nextPageToken,files(id,name)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Drive API list error [${res.status}]: ${errBody}`);
    }

    const data = await res.json();
    folders.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return folders;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate caller
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
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .single();

    if (!profile?.tenant_id) {
      throw new Error("No tenant found for user");
    }

    const accessToken = await getAccessToken(supabaseAdmin, profile.tenant_id);

    // Get all Drive folders
    console.log("Listing Drive folders...");
    const driveFolders = await listAllDriveFolders(accessToken);
    console.log(`Found ${driveFolders.length} folders in Drive`);

    // Get all cab_jobs without a drive_folder_id
    const { data: jobs, error: jobsErr } = await supabaseAdmin
      .from("cab_jobs")
      .select("id, job_ref")
      .is("drive_folder_id", null);

    if (jobsErr) throw jobsErr;

    console.log(`Found ${jobs?.length ?? 0} jobs without Drive folders`);

    // Build a map: numeric prefix → drive folder
    const folderByPrefix = new Map<string, { id: string; name: string }>();
    for (const f of driveFolders) {
      const match = f.name.match(/^(\d+)/);
      if (match) {
        folderByPrefix.set(match[1].replace(/^0+/, ""), f); // normalize: "059" → "59"
      }
    }

    const results: Array<{ job_ref: string; folder_name: string; status: string }> = [];
    let matched = 0;

    for (const job of jobs || []) {
      // Extract numeric prefix from job_ref (e.g. "046_WesSmith_MediaWall" → "46")
      const jobMatch = job.job_ref.match(/^(\d+)/);
      if (!jobMatch) continue;

      const jobNum = jobMatch[1].replace(/^0+/, ""); // "046" → "46"
      const folder = folderByPrefix.get(jobNum);

      if (folder) {
        const { error: updateErr } = await supabaseAdmin
          .from("cab_jobs")
          .update({
            drive_folder_id: folder.id,
            drive_folder_name: folder.name,
          })
          .eq("id", job.id);

        if (updateErr) {
          results.push({ job_ref: job.job_ref, folder_name: folder.name, status: `error: ${updateErr.message}` });
        } else {
          results.push({ job_ref: job.job_ref, folder_name: folder.name, status: "linked" });
          matched++;
        }
      }
    }

    console.log(`Backfill complete: ${matched} matched out of ${jobs?.length ?? 0} unlinked jobs`);

    return jsonResponse({
      ok: true,
      total_drive_folders: driveFolders.length,
      total_unlinked_jobs: jobs?.length ?? 0,
      matched,
      results,
    });
  } catch (err: any) {
    console.error("backfill-drive-folders error:", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
});
