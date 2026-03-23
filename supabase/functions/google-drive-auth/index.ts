// Force redeploy v6 - 2026-03-23 - XLSX binary download support
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper: process queue for a specific tenant
async function processQueueForTenant(supabaseAdmin: any, tenantId: string): Promise<number> {
  const { data: items } = await supabaseAdmin
    .from("drive_sync_queue")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .lte("run_after", new Date().toISOString())
    .order("priority")
    .order("created_at")
    .limit(10);

  if (!items || items.length === 0) return 0;

  // Get access token for this tenant
  const { data: tokenRow } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (!tokenRow) return 0;

  let accessToken: string;
  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);

  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    accessToken = atob(tokenRow.access_token_encrypted);
  } else {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
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
    if (!res.ok) return 0;

    accessToken = data.access_token;
    await supabaseAdmin.from("google_oauth_tokens").update({
      access_token_encrypted: btoa(data.access_token),
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      token_version: tokenRow.token_version + 1,
    }).eq("id", tokenRow.id);
  }

  let processed = 0;

  for (const item of items) {
    try {
      await supabaseAdmin.from("drive_sync_queue")
        .update({ status: "processing", attempts: item.attempts + 1 })
        .eq("id", item.id);

      if (item.action === "scan_job_folder" && item.job_id) {
        const { data: link } = await supabaseAdmin
          .from("job_drive_links")
          .select("drive_folder_id")
          .eq("tenant_id", tenantId)
          .eq("job_id", item.job_id)
          .single();

        if (link) {
          const { data: settings } = await supabaseAdmin
            .from("google_drive_integration_settings")
            .select("include_subfolders")
            .eq("tenant_id", tenantId)
            .single();

          // Inline file listing for queue processor
          const allFiles: any[] = [];
          const listFiles = async (folderId: string, recurse: boolean) => {
            const query = `'${folderId}' in parents and trashed=false`;
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents)&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
            const data = await res.json();
            if (!res.ok) return;
            for (const file of (data.files || [])) {
              if (file.mimeType === "application/vnd.google-apps.folder") {
                if (recurse) await listFiles(file.id, true);
              } else {
                allFiles.push(file);
              }
            }
          };
          await listFiles(link.drive_folder_id, settings?.include_subfolders ?? true);

          const nowStr = new Date().toISOString();
          for (const file of allFiles) {
            await supabaseAdmin.from("drive_file_index").upsert({
              tenant_id: tenantId,
              job_id: item.job_id,
              drive_file_id: file.id,
              drive_parent_folder_id: file.parents?.[0] || link.drive_folder_id,
              file_name: file.name,
              mime_type: file.mimeType,
              file_size_bytes: file.size ? parseInt(file.size) : null,
              drive_modified_time: file.modifiedTime || null,
              drive_created_time: file.createdTime || null,
              drive_web_view_link: file.webViewLink || null,
              detected_type: detectFileType(file.name, file.mimeType),
              detected_stage: detectStage(file.name),
              status: "active",
              last_seen_at: nowStr,
            }, { onConflict: "tenant_id,drive_file_id" });
          }
        }
      }

      await supabaseAdmin.from("drive_sync_queue")
        .update({ status: "done" })
        .eq("id", item.id);
      processed++;
    } catch (err: any) {
      const newAttempts = item.attempts + 1;
      await supabaseAdmin.from("drive_sync_queue").update({
        status: newAttempts >= item.max_attempts ? "failed" : "queued",
        last_error: err.message,
        run_after: new Date(Date.now() + Math.pow(2, newAttempts) * 60000).toISOString(),
      }).eq("id", item.id);
    }
  }

  return processed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  // ─── CRON: process_queue_all — no user auth needed, processes all tenants ───
  if (action === "process_queue_all") {
    // Get all tenants with connected Drive
    const { data: tenants } = await supabaseAdmin
      .from("google_drive_integration_settings")
      .select("tenant_id")
      .eq("is_connected", true);

    if (!tenants || tenants.length === 0) {
      return new Response(JSON.stringify({ processed: 0, tenants: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalProcessed = 0;
    for (const t of tenants) {
      const result = await processQueueForTenant(supabaseAdmin, t.tenant_id);
      totalProcessed += result;
    }

    return new Response(JSON.stringify({ processed: totalProcessed, tenants: tenants.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth for all other actions using getClaims (compatible with signing-keys)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseWithAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claimsData, error: authError } = await supabaseWithAuth.auth.getClaims(token);
  if (authError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const user = { id: claimsData.claims.sub as string };

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("tenant_id").eq("user_id", user.id).single();
  if (!profile?.tenant_id) {
    return new Response(JSON.stringify({ error: "No tenant" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const tenantId = profile.tenant_id;

  // Role check
  const { data: roleData } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", user.id).single();
  const userRole = roleData?.role || "viewer";

  // Actions that require admin
  const adminActions = ["setup", "disconnect", "set_root_folder", "update_settings", "start_watch", "stop_watch"];
  if (adminActions.includes(action) && userRole !== "admin") {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Actions that require at least supervisor
  const supervisorActions = ["scan_root", "scan_root_cab", "index_job_files", "index_all_jobs", "list_drive_folders_page", "find_jobs_folder"];
  if (supervisorActions.includes(action) && !["admin", "supervisor"].includes(userRole)) {
    return new Response(JSON.stringify({ error: "Supervisor or admin required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Helper: get valid access token (refresh if needed)
    async function getAccessToken(): Promise<string> {
      const { data: tokenRow } = await supabaseAdmin
        .from("google_oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId)
        .single();

      if (!tokenRow) throw new Error("No Google tokens found. Please reconnect Google.");

      const now = new Date();
      const expiresAt = new Date(tokenRow.expires_at);

      if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
        return atob(tokenRow.access_token_encrypted);
      }

      const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
      const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
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
      if (!res.ok) throw new Error(`Token refresh failed: ${data.error_description || data.error}`);

      const newExpires = new Date(Date.now() + data.expires_in * 1000).toISOString();
      await supabaseAdmin.from("google_oauth_tokens").update({
        access_token_encrypted: btoa(data.access_token),
        expires_at: newExpires,
        token_version: tokenRow.token_version + 1,
      }).eq("id", tokenRow.id);

      return data.access_token;
    }

    // Helper: list all files in a folder (with pagination)
    async function listDriveFiles(accessToken: string, folderId: string, includeSubfolders: boolean): Promise<any[]> {
      const allFiles: any[] = [];
      let pageToken: string | null = null;

      do {
        const query = `'${folderId}' in parents and trashed=false`;
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents)&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(`Drive API error: ${data.error?.message}`);

        const files = data.files || [];
        for (const file of files) {
          if (file.mimeType === "application/vnd.google-apps.folder") {
            if (includeSubfolders) {
              const subFiles = await listDriveFiles(accessToken, file.id, true);
              allFiles.push(...subFiles);
            }
          } else {
            allFiles.push(file);
          }
        }
        pageToken = data.nextPageToken || null;
      } while (pageToken);

      return allFiles;
    }

    // Helper: create a folder in Drive
    async function createDriveFolder(accessToken: string, parentId: string, folderName: string): Promise<string> {
      const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Failed to create folder: ${data.error?.message}`);
      return data.id;
    }

    // Helper: find or create subfolder
    async function findOrCreateSubfolder(accessToken: string, parentId: string, folderName: string): Promise<string> {
      const query = `'${parentId}' in parents and name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (data.files?.length > 0) return data.files[0].id;
      return await createDriveFolder(accessToken, parentId, folderName);
    }

    // ─── STATUS ───
    if (action === "status") {
      const { data: settings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .single();

      const { count: queueCount } = await supabaseAdmin
        .from("drive_sync_queue")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "queued");

      return new Response(JSON.stringify({
        settings: settings || { is_connected: false, status: "disconnected" },
        queue_count: queueCount || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── SETUP ───
    if (action === "setup") {
      const { data: tokenRow } = await supabaseAdmin
        .from("google_oauth_tokens")
        .select("id")
        .eq("tenant_id", tenantId)
        .single();

      if (!tokenRow) {
        return new Response(JSON.stringify({ error: "Google not connected. Connect Google first via Integrations." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if we need to request Drive scope (incremental consent)
      const { data: calSettings } = await supabaseAdmin
        .from("google_integration_settings")
        .select("google_user_email, google_user_id, granted_scopes")
        .eq("tenant_id", tenantId)
        .single();

      const grantedScopes: string[] = Array.isArray(calSettings?.granted_scopes) ? calSettings.granted_scopes : [];
      const hasDriveScope = grantedScopes.some((s: string) => s.includes("drive"));

      if (!hasDriveScope) {
        // Need incremental consent — return an auth URL with drive.readonly scope
        const redirectUri = body.redirect_uri as string;
        if (!redirectUri) {
          return new Response(JSON.stringify({ error: "redirect_uri required for Drive consent" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
        const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
        const state = btoa(JSON.stringify({ tenant_id: tenantId, flow: "drive_setup" }));
        const params = new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: DRIVE_SCOPE,
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          state,
        });
        const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        return new Response(JSON.stringify({ needs_consent: true, url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Already has Drive scope — just enable the integration
      await supabaseAdmin.from("google_drive_integration_settings").upsert({
        tenant_id: tenantId,
        is_connected: true,
        google_user_email: calSettings?.google_user_email || null,
        google_user_id: calSettings?.google_user_id || null,
        granted_scopes: calSettings?.granted_scopes || null,
        status: "healthy",
      }, { onConflict: "tenant_id" });

      await supabaseAdmin.from("drive_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "drive_connected",
        payload_after_json: { email: calSettings?.google_user_email },
      });

      return new Response(JSON.stringify({ success: true, email: calSettings?.google_user_email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DRIVE CALLBACK: exchange incremental consent code ───
    if (action === "drive_callback") {
      const code = body.code as string;
      const redirectUri = body.redirect_uri as string;
      if (!code || !redirectUri) {
        return new Response(JSON.stringify({ error: "code and redirect_uri required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
      const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return new Response(JSON.stringify({ error: "Token exchange failed", detail: tokenData.error_description || tokenData.error }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { access_token, refresh_token, expires_in, scope: grantedScope } = tokenData;
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

      // Update tokens
      const encAccessToken = btoa(access_token);
      const encRefreshToken = refresh_token ? btoa(refresh_token) : null;

      const { data: existingToken } = await supabaseAdmin
        .from("google_oauth_tokens")
        .select("id, token_version, refresh_token_encrypted")
        .eq("tenant_id", tenantId)
        .single();

      if (existingToken) {
        const updateData: Record<string, unknown> = {
          access_token_encrypted: encAccessToken,
          expires_at: expiresAt,
          token_version: existingToken.token_version + 1,
        };
        if (encRefreshToken) updateData.refresh_token_encrypted = encRefreshToken;
        await supabaseAdmin.from("google_oauth_tokens").update(updateData).eq("id", existingToken.id);
      }

      // Merge granted scopes
      const newScopes = (grantedScope || "").split(" ").filter(Boolean);
      const { data: calSettings } = await supabaseAdmin
        .from("google_integration_settings")
        .select("granted_scopes, google_user_email, google_user_id")
        .eq("tenant_id", tenantId)
        .single();
      const existingScopes: string[] = Array.isArray(calSettings?.granted_scopes) ? calSettings.granted_scopes : [];
      const mergedScopes = [...new Set([...existingScopes, ...newScopes])];

      await supabaseAdmin.from("google_integration_settings").update({
        granted_scopes: mergedScopes,
      }).eq("tenant_id", tenantId);

      // Enable Drive integration
      await supabaseAdmin.from("google_drive_integration_settings").upsert({
        tenant_id: tenantId,
        is_connected: true,
        google_user_email: calSettings?.google_user_email || null,
        google_user_id: calSettings?.google_user_id || null,
        granted_scopes: mergedScopes,
        status: "healthy",
      }, { onConflict: "tenant_id" });

      await supabaseAdmin.from("drive_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "drive_connected",
        payload_after_json: { scopes: mergedScopes },
      });

      return new Response(JSON.stringify({ success: true, email: calSettings?.google_user_email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DISCONNECT ───
    if (action === "disconnect") {
      await supabaseAdmin.from("google_drive_integration_settings").update({
        is_connected: false,
        status: "disconnected",
        google_user_email: null,
        google_user_id: null,
        projects_root_folder_id: null,
        projects_root_folder_name: null,
      }).eq("tenant_id", tenantId);

      await supabaseAdmin.from("drive_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "drive_disconnected",
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST FOLDERS ───
    if (action === "list_folders") {
      const parentId = (body.parent_id as string) || "root";
      const accessToken = await getAccessToken();

      let allFolders: any[] = [];

      if (parentId === "root") {
        // List My Drive root folders
        const query = `'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&orderBy=name&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        const data = await res.json();
        if (res.ok) allFolders = data.files || [];

        // Also list "Shared with me" folders
        const sharedQuery = `mimeType='application/vnd.google-apps.folder' and trashed=false and sharedWithMe=true`;
        const sharedUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(sharedQuery)}&fields=files(id,name,mimeType)&orderBy=name&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        const sharedRes = await fetch(sharedUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        const sharedData = await sharedRes.json();
        if (sharedRes.ok && sharedData.files) {
          for (const f of sharedData.files) {
            if (!allFolders.some((existing: any) => existing.id === f.id)) {
              allFolders.push({ ...f, name: `🔗 ${f.name} (Shared with me)` });
            }
          }
        }

        // Also list Shared Drives themselves
        const drivesUrl = `https://www.googleapis.com/drive/v3/drives?pageSize=50`;
        const drivesRes = await fetch(drivesUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        const drivesData = await drivesRes.json();
        if (drivesRes.ok && drivesData.drives) {
          for (const d of drivesData.drives) {
            if (!allFolders.some((f: any) => f.id === d.id)) {
              allFolders.push({ id: d.id, name: `📁 ${d.name} (Shared Drive)`, mimeType: "application/vnd.google-apps.folder", _isSharedDrive: true });
            }
          }
        }
      } else {
        // Check if this parentId is actually a Shared Drive root by trying to get it as a drive
        let isSharedDriveRoot = false;
        try {
          const driveCheckUrl = `https://www.googleapis.com/drive/v3/drives/${parentId}`;
          const driveCheckRes = await fetch(driveCheckUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (driveCheckRes.ok) isSharedDriveRoot = true;
        } catch {}

        if (isSharedDriveRoot) {
          // Debug: check token info
          const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
          const tokenInfo = await tokenInfoRes.json();
          console.log("Token scopes:", tokenInfo.scope);
          
          // Debug: try listing ANY files in the shared drive (not just folders)
          const debugQuery = `trashed=false`;
          const debugUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(debugQuery)}&fields=files(id,name,mimeType)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${parentId}`;
          const debugRes = await fetch(debugUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          const debugData = await debugRes.json();
          console.log("Debug - ANY files in shared drive:", JSON.stringify(debugData).substring(0, 1000));

          // Now try the actual folder query
          const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          
          // Approach 1: corpora=drive
          const url1 = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&orderBy=name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${parentId}`;
          const res1 = await fetch(url1, { headers: { Authorization: `Bearer ${accessToken}` } });
          const data1 = await res1.json();
          console.log("Folder query response:", JSON.stringify(data1).substring(0, 500));
          
          if (res1.ok && data1.files && data1.files.length > 0) {
            allFolders = data1.files;
          } else {
            // Approach 2: corpora=allDrives
            const url2 = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&orderBy=name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;
            const res2 = await fetch(url2, { headers: { Authorization: `Bearer ${accessToken}` } });
            const data2 = await res2.json();
            if (res2.ok) allFolders = data2.files || [];
          }
        } else {
          const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)&orderBy=name&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
          const data = await res.json();
          if (!res.ok) throw new Error(`Drive API error: ${data.error?.message || JSON.stringify(data)}`);
          allFolders = data.files || [];
        }
      }

      return new Response(JSON.stringify({ folders: allFolders }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── IMPORT JOBS FROM DRIVE ───
    if (action === "import_jobs_from_drive") {
      const accessToken = await getAccessToken();

      // Get settings
      const { data: settings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("projects_root_folder_id, job_number_parse_regex, folder_name_pattern")
        .eq("tenant_id", tenantId)
        .single();

      if (!settings?.projects_root_folder_id) {
        return new Response(JSON.stringify({ error: "No root folder configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let rootId = settings.projects_root_folder_id;
      const parseRegex = new RegExp(settings.job_number_parse_regex || "^(\\d{3})_(.+)$");

      // Look for a _Jobs subfolder inside the root
      const jobsFolderQuery = `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and name='_Jobs' and trashed=false`;
      const jobsFolderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(jobsFolderQuery)}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const jobsFolderRes = await fetch(jobsFolderUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const jobsFolderData = await jobsFolderRes.json();
      if (jobsFolderData.files?.length > 0) {
        rootId = jobsFolderData.files[0].id;
        console.log(`Found _Jobs subfolder, using it as import root: ${rootId}`);
      }

      // List all subfolders in root (or _Jobs) with full pagination
      const folders: any[] = [];
      let pageToken: string | null = null;
      do {
        console.log('[Drive Import] Fetching page with pageSize=1000, pageToken=', pageToken || 'START');

        const query = `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        let listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,webViewLink)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        if (pageToken) listUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

        const res = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(`Drive API error: ${data.error?.message || JSON.stringify(data)}`);

        const files = Array.isArray(data.files) ? data.files : [];
        const nextPageToken = data.nextPageToken || null;

        console.log('[Drive Import] Page returned:', files.length, 'folders, hasNextPage:', !!nextPageToken);

        folders.push(...files);
        pageToken = nextPageToken;
      } while (pageToken);

      console.log(`[Drive Import] Total folders found: ${folders.length}`);
      console.log(`[Drive Import] Folder names: ${JSON.stringify(folders.map((f: any) => f.name).sort())}`);

      // Get existing job_drive_links to avoid duplicates
      const { data: existingLinks } = await supabaseAdmin
        .from("job_drive_links")
        .select("drive_folder_id")
        .eq("tenant_id", tenantId);
      const linkedFolderIds = new Set((existingLinks || []).map((l: any) => l.drive_folder_id));

      // Get existing jobs by job_id to avoid duplicates
      const { data: existingJobs } = await supabaseAdmin
        .from("jobs")
        .select("id, job_id")
        .eq("tenant_id", tenantId);
      const existingJobIds = new Set((existingJobs || []).map((j: any) => j.job_id));

      let created = 0;
      let skipped = 0;
      let unmatched: string[] = [];

      for (const folder of folders) {
        // Skip if already linked
        if (linkedFolderIds.has(folder.id)) {
          skipped++;
          continue;
        }

        const match = folder.name.match(parseRegex);
        if (!match) {
          console.log(`Unmatched folder: "${folder.name}" against regex: ${parseRegex}`);
          unmatched.push(folder.name);
          continue;
        }

        const jobNumber = match[1].trim();
        const jobName = match[2].trim().replace(/[_-]/g, " ");

        // Skip if job_id already exists
        if (existingJobIds.has(jobNumber)) {
          // Just create the drive link for the existing job
          const existingJob = existingJobs!.find((j: any) => j.job_id === jobNumber);
          if (existingJob) {
            await supabaseAdmin.from("job_drive_links").insert({
              tenant_id: tenantId,
              job_id: existingJob.id,
              drive_folder_id: folder.id,
              drive_folder_name: folder.name,
              drive_folder_url: folder.webViewLink || null,
            });
            linkedFolderIds.add(folder.id);
          }
          skipped++;
          continue;
        }

        // Create the job
        const { data: newJob, error: jobErr } = await supabaseAdmin
          .from("jobs")
          .insert({
            tenant_id: tenantId,
            job_id: jobNumber,
            job_name: jobName,
            status: "draft",
            created_by: user.id,
          })
          .select("id")
          .single();

        if (jobErr) {
          console.error(`Failed to create job ${jobNumber}: ${jobErr.message}`);
          continue;
        }

        // Create drive link
        await supabaseAdmin.from("job_drive_links").insert({
          tenant_id: tenantId,
          job_id: newJob.id,
          drive_folder_id: folder.id,
          drive_folder_name: folder.name,
          drive_folder_url: folder.webViewLink || null,
        });

        created++;
        existingJobIds.add(jobNumber);
        linkedFolderIds.add(folder.id);
      }

      console.log(`Import complete: ${created} created, ${skipped} skipped, ${unmatched.length} unmatched`);

      return new Response(JSON.stringify({ 
        created, 
        skipped, 
        unmatched,
        total_folders: folders.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── AUTO LOCATE FOLDER ───
    if (action === "auto_locate") {
      const searchName = (body.search_name as string) || "Jobs";
      const accessToken = await getAccessToken();

      // Search across all drives for the folder by name
      const query = `name='${searchName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,parents,driveId)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`Drive API error: ${data.error?.message || JSON.stringify(data)}`);

      return new Response(JSON.stringify({ folders: data.files || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SET ROOT FOLDER ───
    if (action === "set_root_folder") {
      const folderId = body.folder_id as string;
      const folderName = body.folder_name as string;
      if (!folderId || !folderName) {
        return new Response(JSON.stringify({ error: "folder_id and folder_name required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("google_drive_integration_settings").update({
        projects_root_folder_id: folderId,
        projects_root_folder_name: folderName,
      }).eq("tenant_id", tenantId);

      await supabaseAdmin.from("drive_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "root_folder_set",
        drive_folder_id: folderId,
        payload_after_json: { folder_name: folderName },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE SETTINGS ───
    if (action === "update_settings") {
      const allowedFields = [
        "auto_create_jobs_from_folders", "auto_index_files", "auto_attach_dxfs",
        "folder_name_pattern", "job_number_parse_regex", "sync_mode",
        "polling_interval_minutes", "auto_upload_exports",
        "export_subfolder_cnc", "export_subfolder_exports",
        "export_subfolder_labels", "export_subfolder_nesting",
        "include_subfolders", "detect_dxfs", "detect_photos", "detect_cost_sheets",
        "auto_import_bom_on_detect", "auto_link_shared_media",
        "shared_media_folder_id", "shared_media_folder_name",
        "bom_file_match_keywords", "bom_file_match_extensions",
      ];
      const updates: Record<string, unknown> = {};
      for (const f of allowedFields) {
        if (body[f] !== undefined) updates[f] = body[f];
      }

      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("google_drive_integration_settings")
          .update(updates).eq("tenant_id", tenantId);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SCAN ROOT (find project folders + auto-create jobs) ───
    if (action === "scan_root") {
      const { data: settings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .single();

      if (!settings?.is_connected || !settings.projects_root_folder_id) {
        return new Response(JSON.stringify({ error: "Drive not connected or no root folder set" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      const rootId = settings.projects_root_folder_id;

      // List immediate subfolders
      const query = `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&orderBy=name&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(`Drive API error: ${data.error?.message}`);

      const folders = data.files || [];
      const pattern = new RegExp(settings.folder_name_pattern || "^\\d{3}_.+$");
      const parseRegex = new RegExp(settings.job_number_parse_regex || "^(\\d{3})_(.+)$");

      let created = 0;
      let linked = 0;
      let skipped = 0;
      const conflicts: string[] = [];

      for (const folder of folders) {
        if (!pattern.test(folder.name)) {
          skipped++;
          continue;
        }

        const match = folder.name.match(parseRegex);
        if (!match) { skipped++; continue; }

        const jobNumber = match[1];
        const jobName = match[2]?.trim() || folder.name;

        // Check if already linked
        const { data: existingLink } = await supabaseAdmin
          .from("job_drive_links")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("drive_folder_id", folder.id)
          .single();

        if (existingLink) { skipped++; continue; }

        // Check if job exists with this number
        const { data: existingJobs } = await supabaseAdmin
          .from("jobs")
          .select("id, job_id")
          .eq("tenant_id", tenantId)
          .ilike("job_id", `%${jobNumber}%`);

        if (existingJobs && existingJobs.length > 1) {
          conflicts.push(`Multiple jobs match "${jobNumber}" for folder "${folder.name}"`);
          continue;
        }

        let jobId: string;

        if (existingJobs && existingJobs.length === 1) {
          jobId = existingJobs[0].id;
          linked++;
        } else if (settings.auto_create_jobs_from_folders) {
          const { data: newJob, error: jobErr } = await supabaseAdmin
            .from("jobs")
            .insert({
              tenant_id: tenantId,
              job_id: jobNumber,
              job_name: jobName,
              status: "Not Started",
            })
            .select("id")
            .single();

          if (jobErr) {
            conflicts.push(`Failed to create job for "${folder.name}": ${jobErr.message}`);
            continue;
          }
          jobId = newJob!.id;
          created++;
        } else {
          skipped++;
          continue;
        }

        // Create link
        await supabaseAdmin.from("job_drive_links").insert({
          tenant_id: tenantId,
          job_id: jobId,
          drive_folder_id: folder.id,
          drive_folder_name: folder.name,
          drive_folder_url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
        });

        // If auto-index enabled, queue file indexing for this job
        if (settings.auto_index_files) {
          await supabaseAdmin.from("drive_sync_queue").insert({
            tenant_id: tenantId,
            job_id: jobId,
            action: "scan_job_folder",
            drive_folder_id: folder.id,
            priority: "normal",
          });
        }
      }

      // Update last sync
      await supabaseAdmin.from("google_drive_integration_settings").update({
        last_sync_at: new Date().toISOString(),
        status: "healthy",
        last_error_message: null,
      }).eq("tenant_id", tenantId);

      // Audit
      await supabaseAdmin.from("drive_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "scan_root",
        payload_after_json: { created, linked, skipped, conflicts },
      });

      return new Response(JSON.stringify({ created, linked, skipped, conflicts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SCAN ROOT CAB (match Drive folders to existing cab_jobs by job_ref) ───
    if (action === "scan_root_cab") {
      const companyId = body.company_id as string;
      if (!companyId) {
        return new Response(JSON.stringify({ error: "company_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: settings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .single();

      if (!settings?.is_connected || !settings.projects_root_folder_id) {
        return new Response(JSON.stringify({ error: "Drive not connected or no root folder set" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      const rootId = settings.projects_root_folder_id;

      // Step 1: Find the _Jobs folder inside the root
      const jobsFolderQuery = `'${rootId}' in parents and name='_Jobs' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const jobsFolderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(jobsFolderQuery)}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const jobsFolderRes = await fetch(jobsFolderUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const jobsFolderData = await jobsFolderRes.json();
      if (!jobsFolderRes.ok) throw new Error(`Drive API error: ${jobsFolderData.error?.message}`);

      const jobsFolder = jobsFolderData.files?.[0];
      if (!jobsFolder) {
        console.log("[Drive Import] No '_Jobs' folder found in root. Root folders:", JSON.stringify((jobsFolderData.files || []).map((f: any) => f.name)));
        return new Response(JSON.stringify({ error: "No '_Jobs' folder found in Drive root" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[Drive Import] Found _Jobs folder: ${jobsFolder.id}`);

      // Step 2: Paginate through ALL subfolders inside _Jobs
      const scanFolderId = jobsFolder.id;
      let allFolders: any[] = [];
      let pageToken: string | null = null;
      let cabPageNum = 0;
      do {
        cabPageNum++;
        const query = `'${scanFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        let listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink),nextPageToken&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        if (pageToken) listUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
        const res = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        const pageData = await res.json();
        if (!res.ok) throw new Error(`Drive API error: ${pageData.error?.message}`);
        console.log(`[Drive Import][scan_root_cab] Page ${cabPageNum}: got ${(pageData.files || []).length} folders, nextPageToken=${!!pageData.nextPageToken}`);
        allFolders = allFolders.concat(pageData.files || []);
        pageToken = pageData.nextPageToken || null;
      } while (pageToken);

      const allFolderNames = allFolders.map((f: any) => f.name);
      console.log(`[Drive Import] Total folders found: ${allFolders.length}`);

      // Load ALL existing cab_jobs for this company
      const { data: existingJobs } = await supabaseAdmin
        .from("cab_jobs")
        .select("id, job_ref")
        .eq("company_id", companyId);
      const jobsByRef = new Map<string, string>();
      for (const j of (existingJobs || [])) {
        jobsByRef.set((j as any).job_ref.toLowerCase(), (j as any).id);
      }

      const allJobRefs = Array.from(jobsByRef.keys());
      console.log(`[Drive Import] All job_refs in cab_jobs (${allJobRefs.length}):`, JSON.stringify(allJobRefs));

      let matched = 0;
      const skippedDetails: { folder: string; reason: string }[] = [];
      const conflicts: string[] = [];

      for (const folder of allFolders) {
        console.log(`[Drive Import] Trying to match folder: "${folder.name}" against all job_refs in cab_jobs`);
        // Use full folder name as job_ref (format: 009_alistairwood)
        const extractedRef = folder.name.trim();

        if (!extractedRef) {
          skippedDetails.push({ folder: folder.name, reason: "empty_ref" });
          console.log(`[Drive Import] Skipped empty folder name`);
          continue;
        }

        const jobId = jobsByRef.get(extractedRef.toLowerCase());
        if (!jobId) {
          skippedDetails.push({ folder: folder.name, reason: `no_matching_job (${extractedRef})` });
          console.log(`[Drive Import] No matching job for folder: ${folder.name}`);
          continue;
        }

        // Link the Drive folder to the matched job (upsert to avoid duplicates)
        const { error: linkErr } = await supabaseAdmin
          .from("cab_job_files")
          .insert({
            company_id: companyId,
            job_id: jobId,
            url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
            file_type: "drive_folder",
          });

        if (linkErr) {
          conflicts.push(`Failed to link folder "${folder.name}" to job ${extractedRef}: ${linkErr.message}`);
          continue;
        }

        matched++;
        console.log(`[Drive Import] Matched folder "${folder.name}" → job_ref="${extractedRef}" (id=${jobId})`);
      }

      console.log(`[Drive Import] Summary: ${matched} matched, ${skippedDetails.length} skipped out of ${allFolders.length} total folders`);

      return new Response(JSON.stringify({
        matched,
        skipped: skippedDetails.length,
        skipped_details: skippedDetails,
        conflicts,
        total_folders_found: allFolders.length,
        folder_names: allFolderNames,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST DRIVE FOLDERS PAGE (single page, client handles pagination) ───
    if (action === "list_drive_folders_page") {
      const parentId = body.parent_id as string;
      const pageToken = body.page_token as string | undefined;

      if (!parentId) {
        return new Response(JSON.stringify({ error: "parent_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      let listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,webViewLink)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;
      if (pageToken) listUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

      const res = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(`Drive API error: ${data.error?.message || JSON.stringify(data)}`);

      return new Response(JSON.stringify({
        files: data.files || [],
        next_page_token: data.nextPageToken || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── FIND _JOBS FOLDER ───
    if (action === "find_jobs_folder") {
      // Hardcoded _Jobs folder ID — the correct shared folder
      const JOBS_FOLDER_ID = "1FfyX8aL26pX3aLAvw2I7LWgGL4EjdMa7";
      return new Response(JSON.stringify({ folder_id: JOBS_FOLDER_ID, folder_name: "_Jobs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SEARCH FOLDER BY EXACT NAME INSIDE _JOBS ───
    if (action === "search_folder_by_name") {
      const folderName = body.folder_name as string;
      const jobId = body.job_id as string;
      if (!folderName || !jobId) {
        return new Response(JSON.stringify({ error: "folder_name and job_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Hardcoded _Jobs folder ID
      const JOBS_FOLDER_ID = "1FfyX8aL26pX3aLAvw2I7LWgGL4EjdMa7";
      const accessToken = await getAccessToken();

      // Search for the exact folder name inside _Jobs
      const searchQuery = `'${JOBS_FOLDER_ID}' in parents and name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,webViewLink)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;
      const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const searchData = await searchRes.json();
      if (!searchRes.ok) throw new Error(`Drive API error: ${searchData.error?.message}`);

      const folder = searchData.files?.[0];
      if (!folder) {
        return new Response(JSON.stringify({ error: `No folder named '${folderName}' found in _Jobs` }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert job_drive_links
      await supabaseAdmin.from("job_drive_links").upsert({
        tenant_id: tenantId,
        job_id: jobId,
        drive_folder_id: folder.id,
        drive_folder_name: folder.name,
        drive_folder_url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
      }, { onConflict: "tenant_id,job_id" });

      // Log
      await supabaseAdmin.from("drive_audit_log").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "manual_link_folder",
        drive_folder_id: folder.id,
        payload_after_json: { folder_name: folder.name, job_id: jobId },
      });

      return new Response(JSON.stringify({ success: true, folder_name: folder.name, folder_id: folder.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CREATE JOB FOLDER ───
    if (action === "create_job_folder") {
      const jobId = body.job_id as string;
      if (!jobId) {
        return new Response(JSON.stringify({ error: "job_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if link already exists
      const { data: existingLink } = await supabaseAdmin
        .from("job_drive_links")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("job_id", jobId)
        .maybeSingle();

      if (existingLink) {
        return new Response(JSON.stringify({ success: true, already_linked: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: settings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("is_connected, projects_root_folder_id")
        .eq("tenant_id", tenantId)
        .single();

      if (!settings?.is_connected || !settings.projects_root_folder_id) {
        return new Response(JSON.stringify({ success: false, reason: "no_root_folder" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get job details for folder name
      const { data: jobRow } = await supabaseAdmin
        .from("jobs")
        .select("job_id, job_name")
        .eq("id", jobId)
        .single();

      if (!jobRow) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const folderName = `${jobRow.job_id} - ${jobRow.job_name || "Untitled"}`;
      const accessToken = await getAccessToken();
      const folderId = await createDriveFolder(accessToken, settings.projects_root_folder_id, folderName);
      const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

      // Create link record
      await supabaseAdmin.from("job_drive_links").insert({
        tenant_id: tenantId,
        job_id: jobId,
        drive_folder_id: folderId,
        drive_folder_name: folderName,
        drive_folder_url: folderUrl,
      });

      // Audit
      await supabaseAdmin.from("drive_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "auto_create_job_folder",
        job_id: jobId,
        drive_folder_id: folderId,
        payload_after_json: { folder_name: folderName },
      });

      return new Response(JSON.stringify({ success: true, folder_id: folderId, folder_url: folderUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ─── INDEX JOB FILES ───
    if (action === "index_job_files") {
      const jobId = body.job_id as string;
      if (!jobId) {
        return new Response(JSON.stringify({ error: "job_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: link } = await supabaseAdmin
        .from("job_drive_links")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("job_id", jobId)
        .single();

      if (!link) {
        return new Response(JSON.stringify({ error: "No Drive link for this job" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      const folderId = link.drive_folder_id;

      const { data: settings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("include_subfolders, detect_dxfs, detect_photos, detect_cost_sheets, auto_import_bom_on_detect, bom_file_match_keywords, bom_file_match_extensions")
        .eq("tenant_id", tenantId)
        .single();

      const files = await listDriveFiles(accessToken, folderId, settings?.include_subfolders ?? true);
      let indexed = 0;
      const now = new Date().toISOString();
      let hasDxf = false;
      let hasJobpack = false;
      let bomFile: any = null;

      const bomKeywords = settings?.bom_file_match_keywords || ["bom", "inventor", "partslist", "parts list"];
      const bomExtensions = settings?.bom_file_match_extensions || [".csv"];

      for (const file of files) {
        const detectedType = detectFileType(file.name, file.mimeType);
        const detectedStage = detectStage(file.name);
        const lowerName = file.name.toLowerCase();

        if (detectedType === "dxf") hasDxf = true;
        if (lowerName.includes("jobpack") && (lowerName.endsWith(".zip") || lowerName.endsWith(".json"))) hasJobpack = true;

        // BOM detection
        const isBomExt = bomExtensions.some((ext: string) => lowerName.endsWith(ext));
        const isBomKeyword = bomKeywords.some((kw: string) => lowerName.includes(kw.toLowerCase()));
        const isBom = isBomExt && isBomKeyword;

        if (isBom && !bomFile) {
          bomFile = file; // take the first matching BOM
        }

        await supabaseAdmin.from("drive_file_index").upsert({
          tenant_id: tenantId,
          job_id: jobId,
          drive_file_id: file.id,
          drive_parent_folder_id: file.parents?.[0] || folderId,
          file_name: file.name,
          mime_type: file.mimeType,
          file_size_bytes: file.size ? parseInt(file.size) : null,
          drive_modified_time: file.modifiedTime || null,
          drive_created_time: file.createdTime || null,
          drive_web_view_link: file.webViewLink || null,
          detected_type: isBom ? "bom" : detectedType,
          detected_stage: detectedStage,
          status: "active",
          last_seen_at: now,
        }, { onConflict: "tenant_id,drive_file_id" });

        indexed++;
      }

      // Mark unseen files as deleted
      await supabaseAdmin.from("drive_file_index")
        .update({ status: "deleted" })
        .eq("tenant_id", tenantId)
        .eq("job_id", jobId)
        .eq("status", "active")
        .lt("last_seen_at", new Date(Date.now() - 60000).toISOString());

      // Update link
      await supabaseAdmin.from("job_drive_links")
        .update({ last_indexed_at: now })
        .eq("id", link.id);

      // Update job readiness flags
      await supabaseAdmin.from("jobs").update({
        has_dxf_files: hasDxf,
        has_jobpack: hasJobpack,
      }).eq("id", jobId);

      // BOM auto-import
      let bomImported = false;
      if (bomFile && settings?.auto_import_bom_on_detect) {
        // Check if we already processed this version (idempotency by drive_file_id + modifiedTime)
        const { data: existingUpload } = await supabaseAdmin
          .from("job_bom_uploads")
          .select("id")
          .eq("job_id", jobId)
          .eq("storage_ref", `drive:${bomFile.id}:${bomFile.modifiedTime || ""}`)
          .maybeSingle();

        if (!existingUpload) {
          // Download the BOM CSV from Drive
          const downloadUrl = `https://www.googleapis.com/drive/v3/files/${bomFile.id}?alt=media`;
          const dlRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (dlRes.ok) {
            const csvText = await dlRes.text();

            // Determine next revision
            const { data: prevUploads } = await supabaseAdmin
              .from("job_bom_uploads")
              .select("bom_revision")
              .eq("job_id", jobId)
              .order("bom_revision", { ascending: false })
              .limit(1);
            const nextRevision = ((prevUploads?.[0] as any)?.bom_revision || 0) + 1;

            // Create upload record
            const { data: upload } = await supabaseAdmin
              .from("job_bom_uploads")
              .insert({
                tenant_id: tenantId,
                job_id: jobId,
                file_name: bomFile.name,
                storage_ref: `drive:${bomFile.id}:${bomFile.modifiedTime || ""}`,
                uploaded_by_staff_id: "system",
                parse_status: "pending",
                bom_revision: nextRevision,
              })
              .select("id")
              .single();

            if (upload) {
              // Inline BOM parsing (simplified — matches parse-bom-csv logic)
              const lines = csvText.trim().split("\n");
              if (lines.length >= 2) {
                const headers = parseCSVRowInline(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_ ]/g, ""));
                const colMap = mapColumnsInline(headers);

                // Load spray rules
                const { data: sprayRules } = await supabaseAdmin
                  .from("spray_match_rules").select("*").eq("tenant_id", tenantId).eq("active", true);
                const inclusionTerms: { field: string; term: string }[] = [];
                if (sprayRules && sprayRules.length > 0) {
                  for (const rule of sprayRules) {
                    if (!rule.is_exclusion) inclusionTerms.push({ field: rule.match_field, term: rule.match_term.toLowerCase() });
                  }
                } else {
                  inclusionTerms.push({ field: "material_text", term: "mr mdf" });
                  inclusionTerms.push({ field: "description", term: "mr mdf" });
                }

                const bomItems: any[] = [];
                for (let i = 1; i < lines.length; i++) {
                  const row = parseCSVRowInline(lines[i]);
                  if (row.every(c => !c.trim())) continue;
                  const desc = colMap.description >= 0 ? row[colMap.description]?.trim() || "" : "";
                  const pn = colMap.part_number >= 0 ? row[colMap.part_number]?.trim() || "" : "";
                  if (!desc && !pn) continue;
                  const qtyRaw = colMap.quantity >= 0 ? row[colMap.quantity]?.trim() : "1";
                  let qty = parseFloat(qtyRaw || "1");
                  if (isNaN(qty) || qty <= 0) qty = 1;
                  const mat = colMap.material >= 0 ? row[colMap.material]?.trim() || null : null;

                  bomItems.push({
                    tenant_id: tenantId, job_id: jobId, bom_upload_id: upload.id,
                    bom_revision: nextRevision, part_number: pn || null,
                    description: desc || pn, quantity: qty, unit: "pcs",
                    material_text: mat,
                  });
                }

                if (bomItems.length > 0) {
                  await supabaseAdmin.from("job_bom_items").insert(bomItems);

                  // Generate buylist
                  const buylistLines: any[] = [];
                  const deduped = new Map<string, { totalQty: number; rep: any }>();
                  for (const item of bomItems) {
                    const key = item.part_number ? `pn:${item.part_number}` : `desc:${(item.description || "").toLowerCase()}`;
                    const ex = deduped.get(key);
                    if (ex) { ex.totalQty += item.quantity; } else { deduped.set(key, { totalQty: item.quantity, rep: item }); }
                  }

                  for (const [, group] of deduped) {
                    const rep = group.rep;
                    const d = (rep.description || "").toLowerCase();
                    const m = (rep.material_text || "").toLowerCase();
                    let isSpray = false;
                    let sprayReason = "";
                    for (const rule of inclusionTerms) {
                      const txt = rule.field === "material_text" ? m : d;
                      if (txt.includes(rule.term)) { isSpray = true; sprayReason = `Matched "${rule.term}"`; break; }
                    }
                    const cat = isSpray ? "paint_spray_subcontract" : "other";
                    const sg = isSpray ? "spray_shop" : "other";

                    buylistLines.push({
                      job_id: jobId, tenant_id: tenantId, category: cat, supplier_group: sg,
                      item_name: rep.part_number || rep.description, quantity: group.totalQty, unit: "pcs",
                      is_spray_required: isSpray, spray_detected: isSpray, spray_reason: sprayReason || null,
                      source_type: "bom", bom_revision: nextRevision,
                      notes: rep.material_text ? `Material: ${rep.material_text}` : null,
                    });
                  }

                  await supabaseAdmin.from("buylist_line_items").delete().eq("job_id", jobId).eq("source_type", "bom");
                  if (buylistLines.length > 0) await supabaseAdmin.from("buylist_line_items").insert(buylistLines);
                }

                await supabaseAdmin.from("job_bom_uploads").update({ parse_status: "parsed" }).eq("id", upload.id);
                await supabaseAdmin.from("jobs").update({ has_bom_imported: true, drive_bom_last_imported_at: now }).eq("id", jobId);
                bomImported = true;

                // Notify office
                const { data: notifyUsers } = await supabaseAdmin
                  .from("user_roles").select("user_id").eq("tenant_id", tenantId).in("role", ["admin", "office"]);
                for (const u of (notifyUsers || [])) {
                  await supabaseAdmin.from("notifications").insert({
                    user_id: u.user_id, tenant_id: tenantId,
                    title: "BOM imported from Drive",
                    message: `${bomFile.name} imported for Job (rev ${nextRevision}), ${bomItems.length} items`,
                    type: "info", link: `/jobs/${jobId}`,
                  });
                }
              }
            }
          }
        }
      }

      // Audit
      await supabaseAdmin.from("drive_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "index_job_files",
        job_id: jobId,
        drive_folder_id: folderId,
        payload_after_json: { indexed, total_files: files.length, has_dxf: hasDxf, has_jobpack: hasJobpack, bom_imported: bomImported },
      });

      return new Response(JSON.stringify({ indexed, total_files: files.length, has_dxf: hasDxf, has_jobpack: hasJobpack, bom_imported: bomImported }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SCAN SINGLE JOB (scan files + import BOM for one job) ───
    if (action === "scan_single_job") {
      const jobId = body.job_id as string;
      if (!jobId) {
        return new Response(JSON.stringify({ error: "job_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: link } = await supabaseAdmin
        .from("job_drive_links")
        .select("job_id, drive_folder_id")
        .eq("tenant_id", tenantId)
        .eq("job_id", jobId)
        .single();

      if (!link) {
        return new Response(JSON.stringify({ error: "No Drive folder linked to this job" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      const { data: singleSettings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("include_subfolders, auto_import_bom_on_detect, bom_file_match_keywords, bom_file_match_extensions")
        .eq("tenant_id", tenantId)
        .single();

      const bomKw = singleSettings?.bom_file_match_keywords || ["bom", "inventor", "partslist", "parts list"];
      const bomExt = singleSettings?.bom_file_match_extensions || [".csv"];
      const files = await listDriveFiles(accessToken, link.drive_folder_id, singleSettings?.include_subfolders ?? true);
      const now = new Date().toISOString();
      let hasDxf = false;
      let bomFile: any = null;
      let bomImported = false;

      for (const file of files) {
        const detectedType = detectFileType(file.name, file.mimeType);
        const detectedStage = detectStage(file.name);
        const lowerName = file.name.toLowerCase();
        if (detectedType === "dxf") hasDxf = true;
        const isBomExt = bomExt.some((ext: string) => lowerName.endsWith(ext));
        const isBomKw = bomKw.some((kw: string) => lowerName.includes(kw.toLowerCase()));
        if (isBomExt && isBomKw && !bomFile) bomFile = file;

        await supabaseAdmin.from("drive_file_index").upsert({
          tenant_id: tenantId, job_id: jobId, drive_file_id: file.id,
          drive_parent_folder_id: file.parents?.[0] || link.drive_folder_id,
          file_name: file.name, mime_type: file.mimeType,
          file_size_bytes: file.size ? parseInt(file.size) : null,
          drive_modified_time: file.modifiedTime || null,
          drive_created_time: file.createdTime || null,
          drive_web_view_link: file.webViewLink || null,
          detected_type: (isBomExt && isBomKw) ? "bom" : detectedType,
          detected_stage: detectedStage, status: "active", last_seen_at: now,
        }, { onConflict: "tenant_id,drive_file_id" });
      }

      await supabaseAdmin.from("jobs").update({ has_dxf_files: hasDxf }).eq("id", jobId);
      await supabaseAdmin.from("job_drive_links").update({ last_indexed_at: now }).eq("tenant_id", tenantId).eq("job_id", jobId);

      // BOM auto-import
      if (bomFile && (singleSettings?.auto_import_bom_on_detect !== false)) {
        const { data: existingUpload } = await supabaseAdmin
          .from("job_bom_uploads").select("id")
          .eq("job_id", jobId)
          .eq("storage_ref", `drive:${bomFile.id}:${bomFile.modifiedTime || ""}`)
          .maybeSingle();

        if (!existingUpload) {
          const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${bomFile.id}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (dlRes.ok) {
            const csvText = await dlRes.text();
            if (csvText.trim().split("\n").length >= 2) {
              const { data: prevUploads } = await supabaseAdmin
                .from("job_bom_uploads").select("bom_revision")
                .eq("job_id", jobId).order("bom_revision", { ascending: false }).limit(1);
              const nextRevision = ((prevUploads?.[0] as any)?.bom_revision || 0) + 1;

              const { data: upload } = await supabaseAdmin.from("job_bom_uploads").insert({
                tenant_id: tenantId, job_id: jobId, file_name: bomFile.name,
                uploaded_by_staff_id: user.id, parse_status: "parsed",
                bom_revision: nextRevision,
                storage_ref: `drive:${bomFile.id}:${bomFile.modifiedTime || ""}`,
              }).select("id").single();

              if (upload) {
                const parseRes = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/parse-bom-csv`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": req.headers.get("Authorization") || "" },
                    body: JSON.stringify({ job_id: jobId, csv_text: csvText, file_name: bomFile.name }),
                  }
                );
                if (parseRes.ok) {
                  bomImported = true;
                  await supabaseAdmin.from("jobs").update({
                    has_bom_imported: true, drive_bom_last_imported_at: now,
                  }).eq("id", jobId);
                }
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({
        success: true, files_found: files.length, has_dxf: hasDxf,
        bom_found: !!bomFile, bom_imported: bomImported, bom_file_name: bomFile?.name || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── BULK INDEX ALL JOBS (inline, scans + imports BOMs) ───
    if (action === "bulk_index_job_files") {
      const { data: links } = await supabaseAdmin
        .from("job_drive_links")
        .select("job_id, drive_folder_id")
        .eq("tenant_id", tenantId);

      if (!links || links.length === 0) {
        return new Response(JSON.stringify({ message: "No linked jobs to scan", total: 0, scanned: 0, bom_imported: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      const { data: settings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("include_subfolders, detect_dxfs, detect_photos, detect_cost_sheets, auto_import_bom_on_detect, bom_file_match_keywords, bom_file_match_extensions")
        .eq("tenant_id", tenantId)
        .single();

      const bomKeywords = settings?.bom_file_match_keywords || ["bom", "inventor", "partslist", "parts list"];
      const bomExtensions = settings?.bom_file_match_extensions || [".csv"];
      let totalScanned = 0;
      let totalBomImported = 0;
      const errors: string[] = [];

      for (const link of links) {
        try {
          const files = await listDriveFiles(accessToken, link.drive_folder_id, settings?.include_subfolders ?? true);
          const now = new Date().toISOString();
          let hasDxf = false;
          let hasJobpack = false;
          let bomFile: any = null;

          for (const file of files) {
            const detectedType = detectFileType(file.name, file.mimeType);
            const detectedStage = detectStage(file.name);
            const lowerName = file.name.toLowerCase();

            if (detectedType === "dxf") hasDxf = true;
            if (lowerName.includes("jobpack") && (lowerName.endsWith(".zip") || lowerName.endsWith(".json"))) hasJobpack = true;

            const isBomExt = bomExtensions.some((ext: string) => lowerName.endsWith(ext));
            const isBomKeyword = bomKeywords.some((kw: string) => lowerName.includes(kw.toLowerCase()));
            const isBom = isBomExt && isBomKeyword;
            if (isBom && !bomFile) bomFile = file;

            await supabaseAdmin.from("drive_file_index").upsert({
              tenant_id: tenantId,
              job_id: link.job_id,
              drive_file_id: file.id,
              drive_parent_folder_id: file.parents?.[0] || link.drive_folder_id,
              file_name: file.name,
              mime_type: file.mimeType,
              file_size_bytes: file.size ? parseInt(file.size) : null,
              drive_modified_time: file.modifiedTime || null,
              drive_created_time: file.createdTime || null,
              drive_web_view_link: file.webViewLink || null,
              detected_type: isBom ? "bom" : detectedType,
              detected_stage: detectedStage,
              status: "active",
              last_seen_at: now,
            }, { onConflict: "tenant_id,drive_file_id" });
          }

          // Update job readiness flags
          await supabaseAdmin.from("jobs").update({
            has_dxf_files: hasDxf,
            has_jobpack: hasJobpack,
          }).eq("id", link.job_id);

          await supabaseAdmin.from("job_drive_links")
            .update({ last_indexed_at: now })
            .eq("tenant_id", tenantId)
            .eq("job_id", link.job_id);

          // BOM auto-import
          if (bomFile && (settings?.auto_import_bom_on_detect !== false)) {
            const { data: existingUpload } = await supabaseAdmin
              .from("job_bom_uploads")
              .select("id")
              .eq("job_id", link.job_id)
              .eq("storage_ref", `drive:${bomFile.id}:${bomFile.modifiedTime || ""}`)
              .maybeSingle();

            if (!existingUpload) {
              const downloadUrl = `https://www.googleapis.com/drive/v3/files/${bomFile.id}?alt=media`;
              const dlRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
              if (dlRes.ok) {
                const csvText = await dlRes.text();
                if (csvText.trim().split("\n").length >= 2) {
                  // Get next revision
                  const { data: prevUploads } = await supabaseAdmin
                    .from("job_bom_uploads")
                    .select("bom_revision")
                    .eq("job_id", link.job_id)
                    .order("bom_revision", { ascending: false })
                    .limit(1);
                  const nextRevision = ((prevUploads?.[0] as any)?.bom_revision || 0) + 1;

                  // Create upload record
                  const { data: upload } = await supabaseAdmin
                    .from("job_bom_uploads")
                    .insert({
                      tenant_id: tenantId,
                      job_id: link.job_id,
                      file_name: bomFile.name,
                      uploaded_by_staff_id: user.id,
                      parse_status: "parsed",
                      bom_revision: nextRevision,
                      storage_ref: `drive:${bomFile.id}:${bomFile.modifiedTime || ""}`,
                    })
                    .select("id")
                    .single();

                  if (upload) {
                    // Parse & import BOM using the parse-bom-csv function's format
                    // We invoke it internally
                    const parseRes = await fetch(
                      `${Deno.env.get("SUPABASE_URL")}/functions/v1/parse-bom-csv`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          job_id: link.job_id,
                          csv_text: csvText,
                          file_name: bomFile.name,
                        }),
                      }
                    );
                    if (parseRes.ok) {
                      totalBomImported++;
                      await supabaseAdmin.from("jobs").update({
                        has_bom_imported: true,
                        drive_bom_last_imported_at: now,
                      }).eq("id", link.job_id);
                      console.log(`BOM imported for job ${link.job_id}: ${bomFile.name}`);
                    } else {
                      const errBody = await parseRes.text();
                      console.error(`BOM parse failed for job ${link.job_id}: ${errBody}`);
                      errors.push(`Job ${link.job_id}: BOM parse failed`);
                    }
                  }
                }
              }
            }
          }

          totalScanned++;
        } catch (err: any) {
          console.error(`Error scanning job ${link.job_id}:`, err.message);
          errors.push(`Job ${link.job_id}: ${err.message}`);
        }
      }

      return new Response(JSON.stringify({
        total: links.length,
        scanned: totalScanned,
        bom_imported: totalBomImported,
        errors,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── INDEX ALL JOBS (queue-based) ───
    if (action === "index_all_jobs") {
      const { data: links } = await supabaseAdmin
        .from("job_drive_links")
        .select("job_id, drive_folder_id")
        .eq("tenant_id", tenantId);

      if (!links || links.length === 0) {
        return new Response(JSON.stringify({ message: "No linked jobs to index", total: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Queue each job for indexing
      const queueItems = links.map(l => ({
        tenant_id: tenantId,
        job_id: l.job_id,
        action: "scan_job_folder",
        drive_folder_id: l.drive_folder_id,
        priority: "normal",
      }));

      await supabaseAdmin.from("drive_sync_queue").insert(queueItems);

      return new Response(JSON.stringify({ queued: links.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET JOB DRIVE LINK ───
    if (action === "get_job_link") {
      const jobId = body.job_id as string;
      if (!jobId) {
        return new Response(JSON.stringify({ error: "job_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: link } = await supabaseAdmin
        .from("job_drive_links")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("job_id", jobId)
        .single();

      const { data: files } = await supabaseAdmin
        .from("drive_file_index")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("job_id", jobId)
        .eq("status", "active")
        .order("file_name");

      return new Response(JSON.stringify({ link: link || null, files: files || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPLOAD TO DRIVE ───
    if (action === "upload_to_drive") {
      const jobId = body.job_id as string;
      const fileName = body.file_name as string;
      const fileBase64 = body.file_base64 as string;
      const mimeType = body.mime_type as string || "application/octet-stream";
      const subfolder = body.subfolder as string; // e.g. "Exports", "Labels", "Nesting", "CNC Output"

      if (!jobId || !fileName || !fileBase64) {
        return new Response(JSON.stringify({ error: "job_id, file_name, file_base64 required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: link } = await supabaseAdmin
        .from("job_drive_links")
        .select("drive_folder_id")
        .eq("tenant_id", tenantId)
        .eq("job_id", jobId)
        .single();

      if (!link) {
        return new Response(JSON.stringify({ error: "No Drive link for this job" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      let parentFolderId = link.drive_folder_id;

      // Create subfolder if specified
      if (subfolder) {
        parentFolderId = await findOrCreateSubfolder(accessToken, link.drive_folder_id, subfolder);
      }

      // Upload file using multipart upload
      const fileBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));

      const metadata = JSON.stringify({
        name: fileName,
        parents: [parentFolderId],
      });

      const boundary = "-----boundary" + Date.now();
      const body_parts = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
        `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${fileBase64}\r\n`,
        `--${boundary}--`,
      ];

      const uploadRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: body_parts.join(""),
        }
      );

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadData.error?.message}`);

      // Index the uploaded file
      await supabaseAdmin.from("drive_file_index").upsert({
        tenant_id: tenantId,
        job_id: jobId,
        drive_file_id: uploadData.id,
        drive_parent_folder_id: parentFolderId,
        file_name: fileName,
        mime_type: mimeType,
        drive_web_view_link: uploadData.webViewLink || null,
        detected_type: detectFileType(fileName, mimeType),
        detected_stage: detectStage(fileName),
        status: "active",
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,drive_file_id" });

      // Audit
      await supabaseAdmin.from("drive_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "upload_to_drive",
        job_id: jobId,
        drive_file_id: uploadData.id,
        drive_folder_id: parentFolderId,
        payload_after_json: { file_name: fileName, subfolder, drive_id: uploadData.id },
      });

      return new Response(JSON.stringify({
        success: true,
        drive_file_id: uploadData.id,
        web_view_link: uploadData.webViewLink,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── START WATCH (Push Notifications) ───
    if (action === "start_watch") {
      const { data: settings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("projects_root_folder_id")
        .eq("tenant_id", tenantId)
        .single();

      if (!settings?.projects_root_folder_id) {
        return new Response(JSON.stringify({ error: "No root folder set" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      const channelId = crypto.randomUUID();
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const webhookUrl = `${SUPABASE_URL}/functions/v1/google-drive-webhook`;

      // Watch for changes on the root folder
      const watchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${settings.projects_root_folder_id}/watch`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: channelId,
            type: "web_hook",
            address: webhookUrl,
            token: tenantId, // pass tenant_id as token for routing
            expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          }),
        }
      );

      const watchData = await watchRes.json();
      if (!watchRes.ok) throw new Error(`Watch setup failed: ${watchData.error?.message}`);

      // Store watch info
      await supabaseAdmin.from("google_drive_integration_settings").update({
        sync_mode: "push_notifications",
      }).eq("tenant_id", tenantId);

      await supabaseAdmin.from("drive_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "watch_started",
        payload_after_json: { channel_id: channelId, resource_id: watchData.resourceId, expiration: watchData.expiration },
      });

      return new Response(JSON.stringify({
        success: true,
        channel_id: channelId,
        expiration: watchData.expiration,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── STOP WATCH ───
    if (action === "stop_watch") {
      const channelId = body.channel_id as string;
      const resourceId = body.resource_id as string;

      if (channelId && resourceId) {
        const accessToken = await getAccessToken();
        await fetch("https://www.googleapis.com/drive/v3/channels/stop", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: channelId, resourceId }),
        });
      }

      await supabaseAdmin.from("google_drive_integration_settings").update({
        sync_mode: "polling",
      }).eq("tenant_id", tenantId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── PROCESS QUEUE ───
    if (action === "process_queue") {
      const { data: items } = await supabaseAdmin
        .from("drive_sync_queue")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "queued")
        .lte("run_after", new Date().toISOString())
        .order("priority")
        .order("created_at")
        .limit(10);

      if (!items || items.length === 0) {
        return new Response(JSON.stringify({ processed: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let processed = 0;
      const accessToken = await getAccessToken();

      for (const item of items) {
        try {
          await supabaseAdmin.from("drive_sync_queue")
            .update({ status: "processing", attempts: item.attempts + 1 })
            .eq("id", item.id);

          if (item.action === "scan_job_folder" && item.job_id) {
            const { data: link } = await supabaseAdmin
              .from("job_drive_links")
              .select("drive_folder_id")
              .eq("tenant_id", tenantId)
              .eq("job_id", item.job_id)
              .single();

            if (link) {
              const { data: settings } = await supabaseAdmin
                .from("google_drive_integration_settings")
                .select("include_subfolders")
                .eq("tenant_id", tenantId)
                .single();

              const files = await listDriveFiles(accessToken, link.drive_folder_id, settings?.include_subfolders ?? true);
              const now = new Date().toISOString();

              for (const file of files) {
                await supabaseAdmin.from("drive_file_index").upsert({
                  tenant_id: tenantId,
                  job_id: item.job_id,
                  drive_file_id: file.id,
                  drive_parent_folder_id: file.parents?.[0] || link.drive_folder_id,
                  file_name: file.name,
                  mime_type: file.mimeType,
                  file_size_bytes: file.size ? parseInt(file.size) : null,
                  drive_modified_time: file.modifiedTime || null,
                  drive_created_time: file.createdTime || null,
                  drive_web_view_link: file.webViewLink || null,
                  detected_type: detectFileType(file.name, file.mimeType),
                  detected_stage: detectStage(file.name),
                  status: "active",
                  last_seen_at: now,
                }, { onConflict: "tenant_id,drive_file_id" });
              }
            }
          }

          await supabaseAdmin.from("drive_sync_queue")
            .update({ status: "done" })
            .eq("id", item.id);
          processed++;
        } catch (err: any) {
          const newAttempts = item.attempts + 1;
          await supabaseAdmin.from("drive_sync_queue").update({
            status: newAttempts >= item.max_attempts ? "failed" : "queued",
            last_error: err.message,
            run_after: new Date(Date.now() + Math.pow(2, newAttempts) * 60000).toISOString(),
          }).eq("id", item.id);
        }
      }

      return new Response(JSON.stringify({ processed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SCAN SHARED MEDIA ───
    if (action === "scan_shared_media") {
      const { data: settings } = await supabaseAdmin
        .from("google_drive_integration_settings")
        .select("shared_media_folder_id, auto_link_shared_media")
        .eq("tenant_id", tenantId)
        .single();

      if (!settings?.shared_media_folder_id) {
        return new Response(JSON.stringify({ error: "No shared media folder configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      const mediaFiles = await listDriveFiles(accessToken, settings.shared_media_folder_id, true);

      // Get all job numbers for matching
      const { data: jobs } = await supabaseAdmin
        .from("jobs").select("id, job_id").eq("tenant_id", tenantId);
      const jobMap = new Map((jobs || []).map((j: any) => [j.job_id, j.id]));

      // Get existing assignments to skip
      const { data: existing } = await supabaseAdmin
        .from("shared_media_assignments").select("drive_file_id").eq("tenant_id", tenantId);
      const existingIds = new Set((existing || []).map((e: any) => e.drive_file_id));

      let autoMatched = 0;
      let unassigned = 0;

      for (const file of mediaFiles) {
        if (existingIds.has(file.id)) continue;
        if (!file.mimeType?.startsWith("image/") && !file.mimeType?.startsWith("video/")) continue;

        // Try to match by job number in filename
        let matchedJobId: string | null = null;
        let matchReason: string | null = null;

        for (const [jobNum, jobUuid] of jobMap) {
          if (jobNum && file.name.includes(jobNum)) {
            matchedJobId = jobUuid as string;
            matchReason = `Filename contains job number "${jobNum}"`;
            break;
          }
        }

        const status = matchedJobId ? "assigned" : "unassigned";
        if (matchedJobId) autoMatched++;
        else unassigned++;

        await supabaseAdmin.from("shared_media_assignments").insert({
          tenant_id: tenantId,
          drive_file_id: file.id,
          file_name: file.name,
          mime_type: file.mimeType,
          drive_web_view_link: file.webViewLink || null,
          job_id: matchedJobId,
          auto_matched: !!matchedJobId,
          match_reason: matchReason,
          status,
          assigned_at: matchedJobId ? new Date().toISOString() : null,
        });

        // If matched, also add to drive_file_index for the job
        if (matchedJobId) {
          await supabaseAdmin.from("drive_file_index").upsert({
            tenant_id: tenantId,
            job_id: matchedJobId,
            drive_file_id: file.id,
            file_name: file.name,
            mime_type: file.mimeType,
            drive_web_view_link: file.webViewLink || null,
            detected_type: "photo",
            detected_stage: "unknown",
            status: "active",
            last_seen_at: new Date().toISOString(),
          }, { onConflict: "tenant_id,drive_file_id" });
        }
      }

      return new Response(JSON.stringify({ total: mediaFiles.length, auto_matched: autoMatched, unassigned }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SET SHARED MEDIA FOLDER ───
    if (action === "set_shared_media_folder") {
      const folderId = body.folder_id as string;
      const folderName = body.folder_name as string;

      await supabaseAdmin.from("google_drive_integration_settings").update({
        shared_media_folder_id: folderId || null,
        shared_media_folder_name: folderName || null,
      }).eq("tenant_id", tenantId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ASSIGN MEDIA TO JOB ───
    if (action === "assign_media") {
      const mediaId = body.media_id as string;
      const targetJobId = body.job_id as string;

      if (!mediaId || !targetJobId) {
        return new Response(JSON.stringify({ error: "media_id and job_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: media } = await supabaseAdmin
        .from("shared_media_assignments")
        .select("*")
        .eq("id", mediaId)
        .eq("tenant_id", tenantId)
        .single();

      if (!media) {
        return new Response(JSON.stringify({ error: "Media not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("shared_media_assignments").update({
        job_id: targetJobId,
        assigned_by_staff_id: user.id,
        assigned_at: new Date().toISOString(),
        status: "assigned",
        match_reason: "Manual assignment",
      }).eq("id", mediaId);

      // Add to drive_file_index
      await supabaseAdmin.from("drive_file_index").upsert({
        tenant_id: tenantId,
        job_id: targetJobId,
        drive_file_id: media.drive_file_id,
        file_name: media.file_name,
        mime_type: media.mime_type,
        drive_web_view_link: media.drive_web_view_link,
        detected_type: "photo",
        detected_stage: "unknown",
        status: "active",
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,drive_file_id" });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET UNASSIGNED MEDIA ───
    if (action === "get_unassigned_media") {
      const { data: media } = await supabaseAdmin
        .from("shared_media_assignments")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "unassigned")
        .order("created_at", { ascending: false })
        .limit(100);

      return new Response(JSON.stringify({ media: media || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RECORD FILE OPEN (Read Receipt) ───
    if (action === "record_file_open") {
      const driveFileId = body.drive_file_id as string;
      const fileJobId = body.job_id as string;
      const fileName = body.file_name as string;
      const context = body.context as string || "job_documents";

      if (!driveFileId) {
        return new Response(JSON.stringify({ error: "drive_file_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("file_open_events").insert({
        tenant_id: tenantId,
        job_id: fileJobId || null,
        drive_file_id: driveFileId,
        file_name: fileName || null,
        opened_by_staff_id: user.id,
        context,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET FILE OPEN EVENTS (Seen By) ───
    if (action === "get_file_opens") {
      const driveFileId = body.drive_file_id as string;
      const fileJobId = body.job_id as string;

      let query = supabaseAdmin.from("file_open_events").select("*").eq("tenant_id", tenantId);
      if (driveFileId) query = query.eq("drive_file_id", driveFileId);
      if (fileJobId) query = query.eq("job_id", fileJobId);
      query = query.order("opened_at", { ascending: false }).limit(200);

      const { data: opens } = await query;

      return new Response(JSON.stringify({ opens: opens || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST FILES IN A JOB'S LINKED DRIVE FOLDER ───
    if (action === "list_job_folder_files") {
      const jobId = body.job_id as string;
      if (!jobId) {
        return new Response(JSON.stringify({ error: "job_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get the linked Drive folder for this job (try cab_job_files first, then job_drive_links)
      let driveFolderId: string | null = null;
      let lookupSource = "none";
      const { data: cabFile, error: cabFileErr } = await supabaseAdmin
        .from("cab_job_files")
        .select("url")
        .eq("job_id", jobId)
        .eq("file_type", "drive_folder")
        .maybeSingle();
      
      console.log(`[list_job_folder_files] job_id=${jobId}, cab_job_files result:`, JSON.stringify({ cabFile, cabFileErr }));
      
      if (cabFile?.url) {
        driveFolderId = cabFile.url;
        lookupSource = "cab_job_files";
      } else {
        const { data: driveLink, error: driveLinkErr } = await supabaseAdmin
          .from("job_drive_links")
          .select("drive_folder_id")
          .eq("job_id", jobId)
          .maybeSingle();
        console.log(`[list_job_folder_files] job_drive_links result:`, JSON.stringify({ driveLink, driveLinkErr }));
        if (driveLink) {
          driveFolderId = driveLink.drive_folder_id;
          lookupSource = "job_drive_links";
        }
      }

      // Extract raw folder ID from URL if needed
      driveFolderId = extractDriveFolderId(driveFolderId!);

      console.log(`[list_job_folder_files] resolved driveFolderId="${driveFolderId}", source=${lookupSource}`);

      if (!driveFolderId || driveFolderId.trim() === "" || driveFolderId.trim() === ".") {
        return new Response(JSON.stringify({ 
          error: "No Drive folder linked to this job. Please link a Drive folder first.",
          debug: { job_id: jobId, lookup_source: lookupSource, raw_folder_id: driveFolderId }
        }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();
      
      // Recursive listing to find files in subfolders
      const allFiles: any[] = [];
      async function listRecursive(folderId: string) {
        const query = `'${folderId}' in parents and trashed=false`;
        const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size)&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        const res = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        const data = await res.json();
        if (!res.ok) {
          console.error(`[list_job_folder_files] Drive API error for folder ${folderId}:`, JSON.stringify(data));
          throw new Error(`Drive API error: ${data.error?.message || "Unknown"}`);
        }
        for (const file of (data.files || [])) {
          if (file.mimeType === "application/vnd.google-apps.folder") {
            await listRecursive(file.id);
          } else {
            allFiles.push(file);
          }
        }
      }

      try {
        await listRecursive(driveFolderId);
      } catch (e: any) {
        return new Response(JSON.stringify({ 
          error: e.message,
          debug: { folder_id: driveFolderId }
        }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ files: allFiles }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DOWNLOAD FILE CONTENT (text) ───
    if (action === "download_file_content") {
      const fileId = (body.file_id as string || "").trim();
      if (!fileId || fileId === ".") {
        return new Response(JSON.stringify({ error: "file_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getAccessToken();

      // Check if it's a Google Sheets file — export as CSV
      const metaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,name&supportsAllDrives=true`;
      const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const metaData = await metaRes.json();
      if (!metaRes.ok) throw new Error(`Drive API error: ${metaData.error?.message || "File not found"}`);

      const isXlsx = metaData.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        (metaData.name || "").toLowerCase().endsWith(".xlsx");
      const isGoogleSheet = metaData.mimeType === "application/vnd.google-apps.spreadsheet";

      let content: string;
      let format: string = "csv";

      if (isGoogleSheet) {
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
        const exportRes = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!exportRes.ok) throw new Error("Failed to export Google Sheet as CSV");
        content = await exportRes.text();
      } else if (isXlsx) {
        // Download as binary and return base64
        const dlUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
        const dlRes = await fetch(dlUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!dlRes.ok) throw new Error("Failed to download XLSX file");
        const buf = await dlRes.arrayBuffer();
        // Convert to base64
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        content = btoa(binary);
        format = "xlsx_base64";
      } else {
        const dlUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
        const dlRes = await fetch(dlUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!dlRes.ok) throw new Error("Failed to download file");
        content = await dlRes.text();
      }

      return new Response(JSON.stringify({ content, file_name: metaData.name, format }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("google-drive-auth error:", err);

    try {
      await supabaseAdmin.from("google_drive_integration_settings").update({
        status: "error",
        last_error_message: err instanceof Error ? err.message : "Unknown error",
      }).eq("tenant_id", tenantId);
    } catch (_updateErr) {
      // Ignore update errors in the error handler
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── File Type Detection ───
function detectFileType(fileName: string, mimeType: string): string {
  const lower = fileName.toLowerCase();
  const ext = lower.split(".").pop() || "";

  if (ext === "dxf") return "dxf";
  if (["dwg", "ipt", "iam", "stp", "step", "iges"].includes(ext)) return "cad";
  if (ext === "nc" || ext === "gcode" || ext === "tap" || lower.includes("cnc")) return "cnc_output";

  if (/quote|proposal|estimate/i.test(lower)) return "proposal";
  if (/cost|budget|pandle/i.test(lower)) return "cost_sheet";

  if (mimeType?.startsWith("image/") || mimeType?.startsWith("video/")) return "photo";
  if (ext === "pdf" && /drawing|plan|elevation/i.test(lower)) return "cad";
  if (ext === "pdf") return "pdf";

  if (/bom|inventor|partslist|parts.?list/i.test(lower) && ext === "csv") return "bom";

  return "other";
}

function detectStage(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (/quote|proposal|estimate|enquiry|tender/i.test(lower)) return "sales";
  if (/design|cad|drawing|dxf|dwg/i.test(lower)) return "design";
  if (/cnc|nest|cut|production|toolpath/i.test(lower)) return "production";
  if (/install|site|delivery|signoff/i.test(lower)) return "install";
  if (/invoice|cost|budget|payment|finance/i.test(lower)) return "finance";
  return "unknown";
}

// Inline CSV helpers for BOM auto-import (can't import from src)
function parseCSVRowInline(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function mapColumnsInline(headers: string[]): Record<string, number> {
  const map: Record<string, number> = { description: -1, part_number: -1, quantity: -1, material: -1 };
  const descKeys = ["description", "desc", "part description", "item", "item name", "name", "component"];
  const pnKeys = ["part number", "part_number", "partnumber", "partno", "part_no", "part no", "part id", "part_id", "sku", "item code"];
  const qtyKeys = ["quantity", "qty", "q", "count"];
  const matKeys = ["material", "material_text", "mat", "material code", "material_code", "product_code", "product code"];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].replace(/_/g, " ").trim();
    if (map.description < 0 && descKeys.includes(h)) map.description = i;
    if (map.part_number < 0 && pnKeys.includes(h)) map.part_number = i;
    if (map.quantity < 0 && qtyKeys.includes(h)) map.quantity = i;
    if (map.material < 0 && matKeys.includes(h)) map.material = i;
  }
  return map;
}

// Extract raw Google Drive folder/file ID from a URL or return as-is
function extractDriveFolderId(input: string): string {
  if (!input) return input;
  const trimmed = input.trim();
  // If it looks like a URL, extract the ID
  if (trimmed.startsWith("http")) {
    // Handle https://drive.google.com/drive/folders/FOLDER_ID or /file/d/FILE_ID/...
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return folderMatch[1];
    const fileMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];
    // Fallback: take everything after the last /
    const parts = trimmed.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    // Strip query params
    return last.split("?")[0];
  }
  return trimmed;
}
