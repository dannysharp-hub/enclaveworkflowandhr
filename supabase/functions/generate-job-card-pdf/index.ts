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

  if (tokenErr || !tokenRow) throw new Error(`No Google OAuth tokens for tenant ${tenantId}`);
  if (!tokenRow.refresh_token_encrypted) throw new Error("No refresh token. Reconnect Google Drive.");

  const expiresAt = new Date(tokenRow.expires_at);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted);
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth env vars not set.");

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
  if (!res.ok || !data.access_token) throw new Error(`Token refresh failed: ${data.error_description || data.error}`);

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

function fmt(val: number | null | undefined, prefix = "£"): string {
  if (val == null) return "—";
  return `${prefix}${Number(val).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  try { return new Date(val).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return val; }
}

function buildJobCardHtml(job: any, customer: any): string {
  const addr = job.property_address_json || {};
  const propertyAddress = [addr.address, addr.city, addr.postcode].filter(Boolean).join(", ");
  const now = new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; padding: 40px; }
  .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1a1a1a; padding-bottom: 15px; }
  .header h1 { font-size: 22pt; letter-spacing: 4px; margin-bottom: 4px; }
  .header h2 { font-size: 14pt; color: #555; font-weight: normal; }
  .header .ref { font-size: 13pt; font-weight: bold; margin-top: 8px; }
  .header .date { font-size: 9pt; color: #777; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 11pt; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  table td { padding: 4px 8px; vertical-align: top; }
  table td:first-child { font-weight: bold; width: 180px; color: #555; }
  .two-col { display: flex; gap: 30px; }
  .two-col > div { flex: 1; }
  .footer { margin-top: 30px; border-top: 2px solid #1a1a1a; padding-top: 10px; text-align: center; font-size: 8pt; color: #999; }
  .notes-box { background: #f5f5f5; padding: 10px; border-radius: 4px; white-space: pre-wrap; font-size: 10pt; min-height: 30px; }
</style></head><body>

<div class="header">
  <h1>ENCLAVE CABINETRY</h1>
  <h2>JOB CARD</h2>
  <div class="ref">${job.job_ref || ""}</div>
  <div class="date">Generated ${now}</div>
</div>

<div class="two-col">
  <div class="section">
    <div class="section-title">Client</div>
    <table>
      <tr><td>Name</td><td>${customer ? `${customer.first_name} ${customer.last_name}` : "—"}</td></tr>
      <tr><td>Email</td><td>${customer?.email || "—"}</td></tr>
      <tr><td>Phone</td><td>${customer?.phone || "—"}</td></tr>
      <tr><td>Postcode</td><td>${customer?.postcode || "—"}</td></tr>
      <tr><td>Property Address</td><td>${propertyAddress || "—"}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Project</div>
    <table>
      <tr><td>Job Title</td><td>${job.job_title || "—"}</td></tr>
      <tr><td>Room Type</td><td>${job.room_type || "—"}</td></tr>
      <tr><td>Assigned Rep</td><td>${job.assigned_rep_name || "—"}</td></tr>
    </table>
  </div>
</div>

<div class="two-col">
  <div class="section">
    <div class="section-title">Stage &amp; Status</div>
    <table>
      <tr><td>Production Stage</td><td>${(job.production_stage_key || "—").replace(/_/g, " ")}</td></tr>
      <tr><td>Status</td><td>${(job.status || "—").replace(/_/g, " ")}</td></tr>
      <tr><td>Current Stage</td><td>${(job.current_stage_key || "—").replace(/_/g, " ")}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Key Dates</div>
    <table>
      <tr><td>Created</td><td>${fmtDate(job.created_at)}</td></tr>
      <tr><td>Site Visit 2</td><td>${fmtDate(job.site_visit_2_date)}</td></tr>
      <tr><td>Customer Sign-Off</td><td>${fmtDate(job.customer_signoff_at)}</td></tr>
      <tr><td>Install Date</td><td>${fmtDate(job.install_date)}</td></tr>
      <tr><td>Install Completed</td><td>${fmtDate(job.install_completed_at)}</td></tr>
    </table>
  </div>
</div>

<div class="section">
  <div class="section-title">Financials</div>
  <table>
    <tr>
      <td>Ballpark</td><td>${fmt(job.ballpark_min)} – ${fmt(job.ballpark_max)}</td>
      <td>Contract Value</td><td>${fmt(job.contract_value)}</td>
    </tr>
    <tr>
      <td>Deposit</td><td>${fmt(job.deposit_amount)}${job.deposit_paid_at ? " ✓ " + fmtDate(job.deposit_paid_at) : ""}</td>
      <td>Progress Payment</td><td>${fmt(job.progress_payment_amount)}${job.progress_payment_paid_at ? " ✓ " + fmtDate(job.progress_payment_paid_at) : ""}</td>
    </tr>
    <tr>
      <td>Final Payment</td><td>${fmt(job.final_payment_amount)}${job.final_payment_paid_at ? " ✓ " + fmtDate(job.final_payment_paid_at) : ""}</td>
      <td></td><td></td>
    </tr>
  </table>
</div>

<div class="section">
  <div class="section-title">Notes</div>
  <div class="notes-box">${job.ballpark_internal_notes || ""}\n${job.fitter_notes ? "\nFitter Notes: " + job.fitter_notes : ""}</div>
</div>

<div class="footer">
  Generated by Enclave Cabinetry Management System &bull; ${now}
</div>

</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let errorStage = "init";
  try {
    errorStage = "parse_request";
    const { job_id } = await req.json();
    if (!job_id) return jsonResponse({ ok: false, error: "job_id is required" }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth
    errorStage = "authenticate";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const supabaseWithAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authError } = await supabaseWithAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    // Tenant
    errorStage = "resolve_tenant";
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) throw new Error("No tenant for user");
    const tenantId = profile.tenant_id;

    // Fetch job
    errorStage = "fetch_job";
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("cab_jobs").select("*").eq("id", job_id).single();
    if (jobErr || !job) throw new Error(`Job not found: ${job_id}`);
    if (!job.drive_folder_id) return jsonResponse({ ok: false, error: "No Drive folder linked", stage: errorStage }, 400);

    // Fetch customer
    errorStage = "fetch_customer";
    const { data: customer } = await supabaseAdmin
      .from("cab_customers")
      .select("first_name, last_name, email, phone, postcode, address_line_1, address_line_2, city")
      .eq("id", job.customer_id).single();

    // Build HTML
    errorStage = "build_html";
    const html = buildJobCardHtml(job, customer);

    // Convert HTML to PDF using a public HTML-to-PDF service
    errorStage = "generate_pdf";
    // Use a lightweight approach: render HTML via Deno's built-in capabilities
    // We'll use the html2pdf.app free API for conversion
    const pdfRes = await fetch("https://html2pdf.app/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        options: {
          format: "A4",
          margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
        },
      }),
    });

    let pdfBytes: Uint8Array;

    if (!pdfRes.ok) {
      // Fallback: generate a simple text-based PDF manually
      console.warn("[generate-job-card-pdf] html2pdf.app unavailable, using inline PDF generation");
      pdfBytes = generateSimplePdf(job, customer);
    } else {
      pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
    }

    // Get access token
    errorStage = "get_access_token";
    const accessToken = await getAccessToken(supabaseAdmin, tenantId);
    const folderId = job.drive_folder_id;

    // Check if Job Card.pdf already exists
    errorStage = "search_existing";
    const searchQuery = `name='Job Card.pdf' and '${folderId}' in parents and trashed=false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    const existingFileId = searchData.files?.[0]?.id;

    if (existingFileId) {
      // Overwrite existing
      errorStage = "overwrite_file";
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media&supportsAllDrives=true`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/pdf",
          },
          body: pdfBytes,
        }
      );
      if (!updateRes.ok) {
        const errBody = await updateRes.text();
        throw new Error(`Drive update failed ${updateRes.status}: ${errBody}`);
      }
      console.log(`[generate-job-card-pdf] Updated Job Card.pdf (${existingFileId}) for ${job.job_ref}`);
    } else {
      // Create new file via multipart upload
      errorStage = "create_file";
      const metadata = JSON.stringify({
        name: "Job Card.pdf",
        parents: [folderId],
        mimeType: "application/pdf",
      });

      const boundary = "jobcard_pdf_boundary";
      const encoder = new TextEncoder();

      // Build multipart body manually with binary PDF
      const metaPart = encoder.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`
      );
      const endPart = encoder.encode(`\r\n--${boundary}--`);

      const body = new Uint8Array(metaPart.length + pdfBytes.length + endPart.length);
      body.set(metaPart, 0);
      body.set(pdfBytes, metaPart.length);
      body.set(endPart, metaPart.length + pdfBytes.length);

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
      console.log(`[generate-job-card-pdf] Created Job Card.pdf (${created.id}) for ${job.job_ref}`);
    }

    return jsonResponse({ ok: true, job_ref: job.job_ref });
  } catch (err: any) {
    console.error(`[generate-job-card-pdf] Failed at stage="${errorStage}":`, err.message);
    return jsonResponse({ ok: false, error: err.message, stage: errorStage }, 500);
  }
});

/**
 * Fallback: generate a minimal valid PDF with job data when external API is unavailable.
 * Uses raw PDF operators for a text-based document.
 */
function generateSimplePdf(job: any, customer: any): Uint8Array {
  const addr = job.property_address_json || {};
  const propertyAddress = [addr.address, addr.city, addr.postcode].filter(Boolean).join(", ");
  const now = new Date().toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });

  const lines: string[] = [
    "ENCLAVE CABINETRY - JOB CARD",
    `Job Ref: ${job.job_ref || ""}`,
    `Generated: ${now}`,
    "",
    "--- CLIENT ---",
    `Name: ${customer ? `${customer.first_name} ${customer.last_name}` : "N/A"}`,
    `Email: ${customer?.email || "N/A"}`,
    `Phone: ${customer?.phone || "N/A"}`,
    `Postcode: ${customer?.postcode || "N/A"}`,
    `Property: ${propertyAddress || "N/A"}`,
    "",
    "--- PROJECT ---",
    `Title: ${job.job_title || "N/A"}`,
    `Room Type: ${job.room_type || "N/A"}`,
    `Assigned Rep: ${job.assigned_rep_name || "N/A"}`,
    "",
    "--- STAGE ---",
    `Production: ${(job.production_stage_key || "N/A").replace(/_/g, " ")}`,
    `Status: ${(job.status || "N/A").replace(/_/g, " ")}`,
    "",
    "--- FINANCIALS ---",
    `Ballpark: ${fmt(job.ballpark_min)} - ${fmt(job.ballpark_max)}`,
    `Contract: ${fmt(job.contract_value)}`,
    `Deposit: ${fmt(job.deposit_amount)}${job.deposit_paid_at ? " (Paid " + fmtDate(job.deposit_paid_at) + ")" : ""}`,
    `Progress: ${fmt(job.progress_payment_amount)}${job.progress_payment_paid_at ? " (Paid " + fmtDate(job.progress_payment_paid_at) + ")" : ""}`,
    `Final: ${fmt(job.final_payment_amount)}${job.final_payment_paid_at ? " (Paid " + fmtDate(job.final_payment_paid_at) + ")" : ""}`,
    "",
    "--- DATES ---",
    `Created: ${fmtDate(job.created_at)}`,
    `Site Visit 2: ${fmtDate(job.site_visit_2_date)}`,
    `Sign-Off: ${fmtDate(job.customer_signoff_at)}`,
    `Install: ${fmtDate(job.install_date)}`,
    `Install Complete: ${fmtDate(job.install_completed_at)}`,
    "",
    "--- NOTES ---",
    job.ballpark_internal_notes || "",
    job.fitter_notes ? `Fitter: ${job.fitter_notes}` : "",
    "",
    `Generated by Enclave Cabinetry Management System - ${now}`,
  ];

  // Build a minimal PDF 1.4
  const escapePdf = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const pageWidth = 595; // A4
  const pageHeight = 842;
  const margin = 50;
  const lineHeight = 14;
  let y = pageHeight - margin;

  let streamContent = "";
  streamContent += "BT\n/F1 11 Tf\n";

  for (const line of lines) {
    if (y < margin) {
      // Simple single-page for now
      break;
    }
    streamContent += `1 0 0 1 ${margin} ${y} Tm\n(${escapePdf(line)}) Tj\n`;
    y -= lineHeight;
  }
  streamContent += "ET\n";

  const objects: string[] = [];
  const offsets: number[] = [];
  let output = "%PDF-1.4\n";

  // Object 1: Catalog
  offsets.push(output.length);
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  output += objects[objects.length - 1];

  // Object 2: Pages
  offsets.push(output.length);
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  output += objects[objects.length - 1];

  // Object 3: Page
  offsets.push(output.length);
  objects.push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`);
  output += objects[objects.length - 1];

  // Object 4: Content stream
  offsets.push(output.length);
  objects.push(`4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`);
  output += objects[objects.length - 1];

  // Object 5: Font
  offsets.push(output.length);
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  output += objects[objects.length - 1];

  // xref
  const xrefOffset = output.length;
  output += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    output += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(output);
}
