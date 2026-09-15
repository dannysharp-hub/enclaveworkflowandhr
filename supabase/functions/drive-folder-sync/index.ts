import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface DriveFolder {
  id: string;
  name: string;
  webViewLink?: string;
}

interface SyncResult {
  tenant_id: string;
  company_id: string | null;
  linked: number;
  candidates: number;
  missing: number;
  errors: string[];
  folders_scanned: number;
}

type Admin = ReturnType<typeof createClient>;

/** Valid Google access token for a tenant, refreshing when close to expiry. */
async function getAccessToken(admin: Admin, tenantId: string): Promise<string> {
  const { data: tokenRow } = await admin
    .from("google_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!tokenRow) throw new Error("No Google tokens found. Please reconnect Google Drive in settings.");

  const expiresAt = new Date(tokenRow.expires_at as string);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted as string);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: atob(tokenRow.refresh_token_encrypted as string),
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google token refresh failed [${res.status}]: ${data.error_description || data.error || JSON.stringify(data)}`);
  }

  await admin.from("google_oauth_tokens").update({
    access_token_encrypted: btoa(data.access_token),
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("tenant_id", tenantId);

  return data.access_token as string;
}

/** All subfolders of a Drive folder, following pagination. Surfaces the real Google error. */
async function listAllSubfolders(accessToken: string, parentId: string): Promise<DriveFolder[]> {
  const folders: DriveFolder[] = [];
  let pageToken: string | null = null;

  do {
    const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}` +
      `&fields=nextPageToken,files(id,name,webViewLink)&pageSize=1000` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const raw = await res.text();
    let data: any = {};
    try { data = JSON.parse(raw); } catch { /* non-JSON body */ }

    if (!res.ok) {
      const message = data?.error?.message || raw || res.statusText;
      throw new Error(`Google Drive API error [${res.status}]: ${message}`);
    }

    folders.push(...((data.files || []) as DriveFolder[]));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return folders;
}

async function syncTenant(admin: Admin, tenantId: string): Promise<SyncResult> {
  const result: SyncResult = {
    tenant_id: tenantId,
    company_id: null,
    linked: 0,
    candidates: 0,
    missing: 0,
    errors: [],
    folders_scanned: 0,
  };

  const { data: settings } = await admin
    .from("google_drive_integration_settings")
    .select("is_connected, jobs_folder_id, jobs_folder_name")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!settings?.is_connected) {
    result.errors.push("Google Drive is not connected.");
    return result;
  }
  if (!settings.jobs_folder_id) {
    result.errors.push("No Jobs folder configured. Set the Jobs folder ID in Google Drive settings.");
    return result;
  }

  const { data: map } = await admin
    .from("cab_company_tenant_map")
    .select("company_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!map?.company_id) {
    result.errors.push("No cabinetry company is mapped to this workspace.");
    return result;
  }
  const companyId = map.company_id as string;
  result.company_id = companyId;

  let folders: DriveFolder[];
  try {
    const accessToken = await getAccessToken(admin, tenantId);
    folders = await listAllSubfolders(accessToken, settings.jobs_folder_id as string);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
  result.folders_scanned = folders.length;

  const { data: dbJobs, error: jobsErr } = await admin
    .from("cab_jobs")
    .select("id, job_ref")
    .eq("company_id", companyId);

  if (jobsErr) {
    result.errors.push(`Could not load jobs: ${jobsErr.message}`);
    return result;
  }

  const jobsByRef = new Map<string, string>();
  for (const j of (dbJobs || []) as { id: string; job_ref: string }[]) {
    if (j.job_ref) jobsByRef.set(j.job_ref.trim().toLowerCase(), j.id);
  }

  const matchedRefs = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const folder of folders) {
    const folderName = (folder.name || "").trim();
    if (!folderName) continue;

    const folderUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
    const key = folderName.toLowerCase();
    const jobId = jobsByRef.get(key);

    if (jobId) {
      matchedRefs.add(key);
      const { error } = await admin
        .from("cab_job_files")
        .upsert(
          { company_id: companyId, job_id: jobId, url: folderUrl, file_type: "drive_folder" },
          { onConflict: "job_id,url", ignoreDuplicates: true },
        );
      if (error) result.errors.push(`Failed to link "${folderName}": ${error.message}`);
      else result.linked++;
      continue;
    }

    // No matching job — queue for human review. Never auto-create jobs or customers.
    const { error } = await admin
      .from("drive_sync_candidates")
      .upsert(
        {
          company_id: companyId,
          folder_id: folder.id,
          folder_name: folderName,
          folder_url: folderUrl,
          status: "pending",
          last_seen_at: nowIso,
        },
        { onConflict: "company_id,folder_id", ignoreDuplicates: true },
      );
    if (error) result.errors.push(`Failed to record candidate "${folderName}": ${error.message}`);
    else result.candidates++;
  }

  // Jobs in the database with no folder in Drive
  for (const [key, jobId] of jobsByRef) {
    if (matchedRefs.has(key)) continue;
    const job = (dbJobs as { id: string; job_ref: string }[]).find(j => j.id === jobId);
    const jobRef = job?.job_ref || key;

    const { error } = await admin
      .from("drive_sync_candidates")
      .upsert(
        {
          company_id: companyId,
          folder_id: `missing:${jobRef}`,
          folder_name: jobRef,
          folder_url: null,
          status: "missing_folder",
          job_ref: jobRef,
          last_seen_at: nowIso,
        },
        { onConflict: "company_id,folder_id", ignoreDuplicates: true },
      );
    if (error) result.errors.push(`Failed to record missing folder for ${jobRef}: ${error.message}`);
    else result.missing++;
  }

  await admin.from("google_drive_integration_settings")
    .update({ last_sync_at: nowIso })
    .eq("tenant_id", tenantId);

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const authHeader = req.headers.get("Authorization");
    const hasUserToken = !!authHeader?.startsWith("Bearer ") &&
      authHeader.replace("Bearer ", "") !== Deno.env.get("SUPABASE_ANON_KEY");

    // ─── Scheduled run: no user session, sync every connected workspace ───
    if (body.scheduled === true || !hasUserToken) {
      const { data: tenants } = await admin
        .from("google_drive_integration_settings")
        .select("tenant_id")
        .eq("is_connected", true);

      const results: SyncResult[] = [];
      for (const t of (tenants || []) as { tenant_id: string }[]) {
        results.push(await syncTenant(admin, t.tenant_id));
      }

      return json({
        ok: true,
        mode: "scheduled",
        tenants: results.length,
        linked: results.reduce((n, r) => n + r.linked, 0),
        candidates: results.reduce((n, r) => n + r.candidates, 0),
        missing: results.reduce((n, r) => n + r.missing, 0),
        errors: results.flatMap(r => r.errors),
        results,
      });
    }

    // ─── Manual run: authenticated admin or supervisor for their own workspace ───
    const token = authHeader!.replace("Bearer ", "");
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } },
    );
    const { data: claimsData, error: authError } = await authed.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    const { data: profile } = await admin
      .from("profiles").select("tenant_id").eq("user_id", userId).maybeSingle();
    if (!profile?.tenant_id) {
      return json({ ok: false, error: "No workspace found for this account." }, 400);
    }

    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const role = (roleRow?.role as string) || "viewer";
    if (!["admin", "supervisor"].includes(role)) {
      return json({ ok: false, error: "Admin or supervisor required." }, 403);
    }

    const result = await syncTenant(admin, profile.tenant_id as string);

    return json({
      ok: result.errors.length === 0,
      mode: "manual",
      linked: result.linked,
      candidates: result.candidates,
      missing: result.missing,
      folders_scanned: result.folders_scanned,
      errors: result.errors,
      error: result.errors[0] || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[drive-folder-sync] unexpected failure:", message);
    return json({ ok: false, error: message, errors: [message] });
  }
});
