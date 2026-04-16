import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Google OAuth token helper ──────────────────────────────────
async function getAccessToken(supabaseAdmin: any, tenantId: string): Promise<string> {
  const { data: tokenRow, error } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (error || !tokenRow) throw new Error("No Google OAuth tokens for tenant");

  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);

  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted);
  }

  // Refresh
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
  if (!res.ok) throw new Error("Failed to refresh Google token: " + JSON.stringify(data));

  await supabaseAdmin.from("google_oauth_tokens").update({
    access_token_encrypted: btoa(data.access_token),
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    token_version: tokenRow.token_version + 1,
  }).eq("id", tokenRow.id);

  return data.access_token;
}

// ── Drive helpers ──────────────────────────────────────────────
async function searchFileInFolder(
  accessToken: string,
  folderId: string,
  namePattern: string
): Promise<{ id: string; name: string; mimeType: string } | null> {
  // Search recursively inside folder for files matching namePattern (case-insensitive)
  const q = `'${folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const pattern = namePattern.toLowerCase();
  const match = data.files?.find((f: any) => f.name.toLowerCase().includes(pattern));
  if (match) return match;

  // Check subfolders
  const folders = data.files?.filter((f: any) => f.mimeType === "application/vnd.google-apps.folder") || [];
  for (const folder of folders) {
    const found = await searchFileInFolder(accessToken, folder.id, namePattern);
    if (found) return found;
  }
  return null;
}

async function findFileByPath(
  accessToken: string,
  pathSegments: string[]
): Promise<{ id: string; name: string; mimeType: string } | null> {
  // Navigate from root through path segments using allDrives
  let parentQuery = "sharedWithMe = true or 'root' in parents";
  
  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    const isLast = i === pathSegments.length - 1;
    
    let q: string;
    if (i === 0) {
      // First segment: search in all drives
      q = `name = '${segment}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    } else {
      q = `name = '${segment}' and trashed = false`;
      if (!isLast) {
        q += ` and mimeType = 'application/vnd.google-apps.folder'`;
      }
    }
    
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = await res.json();
    
    if (!data.files?.length) return null;
    
    if (isLast) return data.files[0];
    // Use found folder as parent for next iteration - but Drive API doesn't let us chain easily
    // We need to search within this folder for the next segment
    const folderId = data.files[0].id;
    // Override the loop to search within this folder
    const nextSegments = pathSegments.slice(i + 1);
    return findFileInPath(accessToken, folderId, nextSegments);
  }
  return null;
}

async function findFileInPath(
  accessToken: string,
  parentId: string,
  segments: string[]
): Promise<{ id: string; name: string; mimeType: string } | null> {
  let currentParentId = parentId;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;
    let q = `'${currentParentId}' in parents and name = '${segment}' and trashed = false`;
    if (!isLast) {
      q += ` and mimeType = 'application/vnd.google-apps.folder'`;
    }
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.files?.length) return null;
    if (isLast) return data.files[0];
    currentParentId = data.files[0].id;
  }
  return null;
}

// Mime types that need copy-to-Google-Docs-then-export-as-PDF
const OFFICE_DOC_MIMES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
];

async function downloadFileAsPdfBytes(accessToken: string, fileId: string, mimeType: string): Promise<Uint8Array> {
  if (mimeType.startsWith("application/vnd.google-apps.")) {
    // Google-native file — export directly as PDF
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Export failed for ${fileId}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  if (OFFICE_DOC_MIMES.includes(mimeType)) {
    // Office file — copy as Google Doc, export as PDF, delete the copy
    const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: "application/vnd.google-apps.document", name: "_tmp_pdf_export" }),
    });
    if (!copyRes.ok) throw new Error(`Copy-to-Docs failed for ${fileId}: ${copyRes.status}`);
    const copy = await copyRes.json();

    try {
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${copy.id}/export?mimeType=application/pdf`;
      const pdfRes = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!pdfRes.ok) throw new Error(`PDF export failed for copy ${copy.id}: ${pdfRes.status}`);
      return new Uint8Array(await pdfRes.arrayBuffer());
    } finally {
      // Clean up temp copy (fire-and-forget)
      fetch(`https://www.googleapis.com/drive/v3/files/${copy.id}?supportsAllDrives=true`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
    }
  }

  // Already a binary file (PDF, image, etc.) — download directly
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Download failed for ${fileId}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Currency formatter ─────────────────────────────────────────
function formatGBP(value: number): string {
  return "£" + value.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Main ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id, company_id } = await req.json();
    if (!job_id || !company_id) {
      return new Response(JSON.stringify({ error: "job_id and company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 1. Fetch job + customer ──────────────────────────────
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("cab_jobs")
      .select("*, cab_customers(*)")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customer = job.cab_customers;
    if (!customer?.email) {
      return new Response(JSON.stringify({ error: "Customer has no email address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Get designer name from cab_user_profiles ──────────
    let designerName = "Enclave Cabinetry";
    if (job.ballpark_sent_by) {
      const { data: profile } = await supabaseAdmin
        .from("cab_user_profiles")
        .select("name")
        .eq("id", job.ballpark_sent_by)
        .single();
      if (profile?.name) designerName = profile.name;
    }

    // ── 3. Get Google Drive access token ─────────────────────
    const { data: tenantMap } = await supabaseAdmin
      .from("cab_company_tenant_map")
      .select("tenant_id")
      .eq("company_id", company_id)
      .single();

    const tenantId = tenantMap?.tenant_id;
    let accessToken: string | null = null;
    if (tenantId) {
      try {
        accessToken = await getAccessToken(supabaseAdmin, tenantId);
      } catch (e) {
        console.warn("[send-ballpark-email] Could not get Drive access token:", e.message);
      }
    }

    // ── 4. Search for attachments ────────────────────────────
    const attachments: { filename: string; content: string }[] = [];
    const warnings: string[] = [];

    if (accessToken && job.drive_folder_id) {
      // 4a. Concept layout — search for any file containing "concept" in the name
      console.log("[send-ballpark-email] Searching for concept layout in folder:", job.drive_folder_id);

      let conceptFile = await searchFileInFolder(accessToken, job.drive_folder_id, "concept");
      if (conceptFile) {
        console.log("[send-ballpark-email] Found concept layout:", conceptFile.name, "mimeType:", conceptFile.mimeType);
        try {
          const bytes = await downloadFileAsPdfBytes(accessToken, conceptFile.id, conceptFile.mimeType);
          attachments.push({
            filename: `${job.job_ref}_ConceptLayout.pdf`,
            content: toBase64(bytes),
          });
        } catch (e) {
          console.error("[send-ballpark-email] Failed to download concept layout:", e.message);
          warnings.push("Concept layout found but download failed: " + e.message);
        }
      } else {
        console.warn("[send-ballpark-email] No file containing 'concept' found in Drive folder");
        warnings.push("Concept layout file not found in job Drive folder");
      }

      // 4b. Our Process — from _EnclaveCabinetry/_TemplateDocuments
      try {
        const processFile = await findFileByPath(accessToken, [
          "_EnclaveCabinetry", "_TemplateDocuments", "EC_Our_Process.docx",
        ]);
        if (processFile) {
          console.log("[send-ballpark-email] Found Our Process:", processFile.name);
          const bytes = await downloadFileAsPdfBytes(accessToken, processFile.id, processFile.mimeType);
          attachments.push({
            filename: "Enclave_Cabinetry_Our_Process.pdf",
            content: toBase64(bytes),
          });
        } else {
          // Try searching more broadly
          const altFile = await findFileByPath(accessToken, [
            "_EnclaveCabinetry", "_TemplateDocuments",
          ]);
          if (altFile) {
            // Search within this folder
            const found = await searchFileInFolder(accessToken, altFile.id, "EC_Our_Process");
            if (found) {
              const bytes = await downloadFileAsPdfBytes(accessToken, found.id, found.mimeType);
              attachments.push({
                filename: "Enclave_Cabinetry_Our_Process.pdf",
                content: toBase64(bytes),
              });
            } else {
              warnings.push("EC_Our_Process.docx not found in _TemplateDocuments");
            }
          } else {
            warnings.push("_EnclaveCabinetry/_TemplateDocuments folder not found");
          }
        }
      } catch (e) {
        console.error("[send-ballpark-email] Failed to fetch Our Process:", e.message);
        warnings.push("Our Process file error: " + e.message);
      }
    } else {
      warnings.push("Google Drive not connected or no Drive folder linked to job");
    }

    // ── 5. Build email HTML ──────────────────────────────────
    const ballparkMin = formatGBP(job.ballpark_min || 0);
    const ballparkMax = formatGBP(job.ballpark_max || 0);
    const bookingUrl = "https://api.leadconnectorhq.com/widget/booking/uFzAuYubySZdQZ3KASD2";

    // Build attachment mention based on what we found
    let attachmentParagraph = "";
    const hasConceptLayout = attachments.some(a => a.filename.includes("ConceptLayout"));
    const hasOurProcess = attachments.some(a => a.filename.includes("Our_Process"));

    if (hasConceptLayout && hasOurProcess) {
      attachmentParagraph = `
        <p style="margin: 0 0 10px;">We have attached two documents for you:</p>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li style="margin-bottom: 6px;"><strong>Your Concept Layout</strong> — an initial drawing showing how we have considered your space</li>
          <li><strong>Our Process</strong> — a brief overview of how we work, from first conversation through to installation</li>
        </ul>`;
    } else if (hasOurProcess) {
      attachmentParagraph = `
        <p style="margin: 0 0 10px;">We have attached a document for you:</p>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li><strong>Our Process</strong> — a brief overview of how we work, from first conversation through to installation</li>
        </ul>`;
    } else if (hasConceptLayout) {
      attachmentParagraph = `
        <p style="margin: 0 0 10px;">We have attached a document for you:</p>
        <ul style="margin: 0 0 20px; padding-left: 20px;">
          <li><strong>Your Concept Layout</strong> — an initial drawing showing how we have considered your space</li>
        </ul>`;
    }

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #222; max-width: 600px; margin: 0 auto; padding: 20px;">
        <p style="margin: 0 0 20px;">Dear ${customer.first_name},</p>

        <p style="margin: 0 0 20px;">Thank you for getting in touch with Enclave Cabinetry — we really appreciate your enquiry and are excited about the possibility of working with you.</p>

        <p style="margin: 0 0 20px;">Based on our initial conversation, we estimate your project would fall in the region of <strong>${ballparkMin} – ${ballparkMax}</strong>. Please note this is an indicative figure at this stage — your final quote will follow once we have visited your home and finalised the details.</p>

        ${attachmentParagraph}

        <p style="margin: 0 0 20px;">We would love to arrange a site visit at a time that suits you. You can book directly using the link below:</p>

        <p style="margin: 0 0 30px;">
          <a href="${bookingUrl}" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold;">Book Your Design Visit</a>
        </p>

        <p style="margin: 0 0 20px;">In the meantime, please don't hesitate to get in touch if you have any questions.</p>

        <p style="margin: 0 0 4px;">Warm regards,</p>
        <p style="margin: 0 0 4px; font-weight: bold;">${designerName}</p>
        <p style="margin: 0; color: #666; font-size: 13px;">Enclave Cabinetry<br/>07944608098 | info@enclavecabinetry.com | enclavecabinetry.com</p>
      </div>`;

    // ── 6. Send via Resend ───────────────────────────────────
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const emailPayload: Record<string, unknown> = {
      from: "Enclave Cabinetry <noreply@enclavecabinetry.com>",
      to: [customer.email],
      cc: ["info@enclavecabinetry.com"],
      subject: `Your Enclave Cabinetry Estimate — ${job.job_ref}`,
      html,
    };

    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    console.log(`[send-ballpark-email] Sending to ${customer.email} with ${attachments.length} attachment(s)`);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error("[send-ballpark-email] Resend error:", JSON.stringify(resendData));
      throw new Error(resendData.message || "Resend API error");
    }

    console.log("[send-ballpark-email] Email sent, id:", resendData.id);

    return new Response(JSON.stringify({
      success: true,
      email_id: resendData.id,
      attachments_sent: attachments.map(a => a.filename),
      warnings,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[send-ballpark-email] Error:", err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
