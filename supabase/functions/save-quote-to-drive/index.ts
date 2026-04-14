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
    const { quote_id, job_id } = await req.json();
    if (!quote_id || !job_id) {
      return jsonResponse({ ok: false, error: "quote_id and job_id are required" }, 400);
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
    const supabaseWithAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
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
    if (!profile?.tenant_id) throw new Error("No tenant found for user");
    const tenantId = profile.tenant_id;

    // Fetch job
    errorStage = "fetch_job";
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("cab_jobs")
      .select("id, job_ref, drive_folder_id")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) throw new Error(`Job not found: ${job_id}`);

    if (!job.drive_folder_id) {
      console.log(`[save-quote-to-drive] Job ${job.job_ref} has no Drive folder, skipping.`);
      return jsonResponse({ ok: false, error: "No Drive folder linked to this job", skipped: true });
    }

    // Fetch quote
    errorStage = "fetch_quote";
    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from("cab_quotes")
      .select("id, version, drive_file_id, drive_filename, document_url")
      .eq("id", quote_id)
      .single();
    if (quoteErr || !quote) throw new Error(`Quote not found: ${quote_id}`);

    const fileName = `Quote_v${quote.version}.pdf`;
    const folderId = job.drive_folder_id;

    // Get access token
    errorStage = "get_access_token";
    const accessToken = await getAccessToken(supabaseAdmin, tenantId);

    // If quote has a drive_file_id, copy that file into the job folder
    if (quote.drive_file_id) {
      errorStage = "copy_drive_file";

      // Check if file already exists in folder
      const searchQuery = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const searchData = await searchRes.json();
      const existingId = searchData.files?.[0]?.id;

      if (existingId) {
        // Delete old copy
        await fetch(`https://www.googleapis.com/drive/v3/files/${existingId}?supportsAllDrives=true`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      // Copy the source file
      const copyRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${quote.drive_file_id}/copy?supportsAllDrives=true`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: fileName,
            parents: [folderId],
          }),
        }
      );
      if (!copyRes.ok) {
        const errBody = await copyRes.text();
        throw new Error(`Drive copy failed ${copyRes.status}: ${errBody}`);
      }
      const copied = await copyRes.json();
      console.log(`[save-quote-to-drive] Copied Drive file to ${fileName} (${copied.id}) for job ${job.job_ref}`);
      return jsonResponse({ ok: true, file_id: copied.id, file_name: fileName });
    }

    // If quote has a document_url, download and upload to Drive
    if (quote.document_url) {
      errorStage = "download_document";
      const docRes = await fetch(quote.document_url);
      if (!docRes.ok) throw new Error(`Failed to download document: ${docRes.status}`);
      const pdfBytes = await docRes.arrayBuffer();

      errorStage = "upload_to_drive";
      // Check existing
      const searchQuery = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const searchData = await searchRes.json();
      const existingId = searchData.files?.[0]?.id;

      if (existingId) {
        // Overwrite
        const updateRes = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&supportsAllDrives=true`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/pdf",
            },
            body: new Uint8Array(pdfBytes),
          }
        );
        if (!updateRes.ok) {
          const errBody = await updateRes.text();
          throw new Error(`Drive update failed ${updateRes.status}: ${errBody}`);
        }
        console.log(`[save-quote-to-drive] Updated ${fileName} (${existingId}) for job ${job.job_ref}`);
        return jsonResponse({ ok: true, file_id: existingId, file_name: fileName });
      } else {
        // Create new
        const boundary = "quote_pdf_boundary";
        const metadata = JSON.stringify({
          name: fileName,
          parents: [folderId],
          mimeType: "application/pdf",
        });
        const encoder = new TextEncoder();
        const metaPart = encoder.encode(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
        );
        const endPart = encoder.encode(`\r\n--${boundary}--`);
        const body = new Uint8Array(metaPart.length + pdfBytes.byteLength + endPart.length);
        body.set(metaPart, 0);
        body.set(new Uint8Array(pdfBytes), metaPart.length);
        body.set(endPart, metaPart.length + pdfBytes.byteLength);

        const createRes = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
          }
        );
        if (!createRes.ok) {
          const errBody = await createRes.text();
          throw new Error(`Drive create failed ${createRes.status}: ${errBody}`);
        }
        const created = await createRes.json();
        console.log(`[save-quote-to-drive] Created ${fileName} (${created.id}) for job ${job.job_ref}`);
        return jsonResponse({ ok: true, file_id: created.id, file_name: fileName });
      }
    }

    return jsonResponse({ ok: false, error: "Quote has no file to save (no drive_file_id or document_url)" }, 400);
  } catch (err: any) {
    console.error(`[save-quote-to-drive] Failed at stage="${errorStage}":`, err.message);
    return jsonResponse({ ok: false, error: err.message, stage: errorStage }, 500);
  }
});
