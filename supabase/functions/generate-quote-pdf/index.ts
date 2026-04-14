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

function fmt(val: number | null | undefined): string {
  if (val == null) return "—";
  return `£${Number(val).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(val: string | null | undefined): string {
  if (!val) return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  try { return new Date(val).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return val; }
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
}

function buildQuoteHtml(quote: any, job: any, customer: any): string {
  const addr = job.property_address_json || {};
  const propertyAddress = [addr.address, addr.city, addr.postcode].filter(Boolean).join(", ");
  const customerAddress = [
    customer?.address_line_1, customer?.address_line_2, customer?.city, customer?.postcode
  ].filter(Boolean).join(", ");
  const displayAddress = propertyAddress || customerAddress || "—";
  const quoteDate = fmtDate(quote.created_at);
  const customerName = customer ? `${customer.first_name} ${customer.last_name}` : "—";

  // Use quote_price, or fall back to price_max, or price_min
  const quotePrice = quote.quote_price ?? quote.price_max ?? quote.price_min;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #1a1a1a; padding: 50px 55px; line-height: 1.5; }
  
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 35px; padding-bottom: 20px; border-bottom: 2px solid #1a1a1a; }
  .header-left h1 { font-size: 20pt; letter-spacing: 5px; font-weight: 700; margin-bottom: 3px; }
  .header-left p { font-size: 8.5pt; color: #555; line-height: 1.4; }
  .header-right { text-align: right; }
  .header-right .doc-type { font-size: 14pt; font-weight: 700; letter-spacing: 3px; color: #333; }
  .header-right .date { font-size: 9pt; color: #777; margin-top: 4px; }
  
  .ref-bar { background: #f5f5f5; padding: 10px 16px; margin-bottom: 25px; border-radius: 3px; font-weight: 600; font-size: 11pt; }
  
  .two-col { display: flex; gap: 40px; margin-bottom: 25px; }
  .two-col > div { flex: 1; }
  
  .section { margin-bottom: 25px; }
  .section-title { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
  
  .detail-table { width: 100%; }
  .detail-table td { padding: 3px 0; vertical-align: top; }
  .detail-table td:first-child { font-weight: 600; color: #555; width: 110px; }
  
  .scope-text { white-space: pre-wrap; line-height: 1.6; font-size: 10.5pt; }
  
  .investment-box { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 4px; padding: 20px 24px; text-align: center; margin-bottom: 25px; }
  .investment-box .label { font-size: 9pt; text-transform: uppercase; letter-spacing: 2px; color: #777; margin-bottom: 6px; }
  .investment-box .price { font-size: 22pt; font-weight: 700; color: #1a1a1a; }
  .investment-box .vat { font-size: 9pt; color: #999; margin-top: 4px; }
  
  .terms-text { white-space: pre-wrap; line-height: 1.6; font-size: 10pt; color: #444; }
  
  .footer { margin-top: 35px; border-top: 2px solid #1a1a1a; padding-top: 15px; }
  .footer .validity { font-size: 10pt; font-weight: 600; margin-bottom: 8px; }
  .footer .contact { font-size: 8.5pt; color: #777; line-height: 1.5; }
</style></head><body>

<div class="header">
  <div class="header-left">
    <h1>ENCLAVE CABINETRY</h1>
    <p>Units 1 &amp; 2 Poplars Farm<br/>Lincolnshire, PE20 3QF<br/>danny@enclavecabinetry.com &bull; 07944 608098</p>
  </div>
  <div class="header-right">
    <div class="doc-type">QUOTATION</div>
    <div class="date">${quoteDate}</div>
  </div>
</div>

<div class="ref-bar">${job.job_ref || ""} &mdash; Quote v${quote.version}</div>

<div class="two-col">
  <div class="section">
    <div class="section-title">Client</div>
    <table class="detail-table">
      <tr><td>Name</td><td>${escapeHtml(customerName)}</td></tr>
      <tr><td>Email</td><td>${escapeHtml(customer?.email) || "—"}</td></tr>
      <tr><td>Phone</td><td>${escapeHtml(customer?.phone) || "—"}</td></tr>
      <tr><td>Address</td><td>${escapeHtml(displayAddress)}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Project</div>
    <table class="detail-table">
      <tr><td>Project</td><td>${escapeHtml(job.job_title) || "—"}</td></tr>
      <tr><td>Room Type</td><td>${escapeHtml(job.room_type) || "—"}</td></tr>
      <tr><td>Prepared by</td><td>${escapeHtml(job.assigned_rep_name) || "Enclave Cabinetry"}</td></tr>
    </table>
  </div>
</div>

${quote.scope_markdown ? `
<div class="section">
  <div class="section-title">Scope of Works</div>
  <div class="scope-text">${escapeHtml(quote.scope_markdown)}</div>
</div>
` : ""}

${quotePrice != null ? `
<div class="investment-box">
  <div class="label">Your Investment</div>
  <div class="price">${fmt(quotePrice)}</div>
  <div class="vat">All prices exclude VAT unless otherwise stated</div>
</div>
` : ""}

${quote.terms_markdown ? `
<div class="section">
  <div class="section-title">Payment Terms &amp; Conditions</div>
  <div class="terms-text">${escapeHtml(quote.terms_markdown)}</div>
</div>
` : ""}

<div class="footer">
  <div class="validity">This quote is valid for 30 days from the date above.</div>
  <div class="contact">
    Enclave Cabinetry &bull; Units 1 &amp; 2 Poplars Farm, Lincolnshire, PE20 3QF<br/>
    danny@enclavecabinetry.com &bull; 07944 608098 &bull; www.enclavecabinetry.com
  </div>
</div>

</body></html>`;
}

function generateFallbackPdf(quote: any, job: any, customer: any): Uint8Array {
  const customerName = customer ? `${customer.first_name} ${customer.last_name}` : "N/A";
  const quotePrice = quote.quote_price ?? quote.price_max ?? quote.price_min;

  const lines: string[] = [
    "ENCLAVE CABINETRY - QUOTATION",
    `${job.job_ref || ""} - Quote v${quote.version}`,
    `Date: ${fmtDate(quote.created_at)}`,
    "",
    "--- CLIENT ---",
    `Name: ${customerName}`,
    `Email: ${customer?.email || "N/A"}`,
    `Phone: ${customer?.phone || "N/A"}`,
    "",
    "--- PROJECT ---",
    `Title: ${job.job_title || "N/A"}`,
    `Room Type: ${job.room_type || "N/A"}`,
    "",
  ];

  if (quote.scope_markdown) {
    lines.push("--- SCOPE OF WORKS ---");
    lines.push(...quote.scope_markdown.split("\n").slice(0, 30));
    lines.push("");
  }

  if (quotePrice != null) {
    lines.push("--- INVESTMENT ---");
    lines.push(`${fmt(quotePrice)} (excl. VAT)`);
    lines.push("");
  }

  if (quote.terms_markdown) {
    lines.push("--- TERMS ---");
    lines.push(...quote.terms_markdown.split("\n").slice(0, 20));
    lines.push("");
  }

  lines.push("This quote is valid for 30 days.");
  lines.push("Enclave Cabinetry - Units 1 & 2 Poplars Farm, Lincolnshire, PE20 3QF");

  const escapePdf = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;
  const lineHeight = 14;
  let y = pageHeight - margin;

  let streamContent = "BT\n/F1 10 Tf\n";
  for (const line of lines) {
    if (y < margin) break;
    streamContent += `1 0 0 1 ${margin} ${y} Tm\n(${escapePdf(line)}) Tj\n`;
    y -= lineHeight;
  }
  streamContent += "ET\n";

  let output = "%PDF-1.4\n";
  const offsets: number[] = [];

  offsets.push(output.length);
  output += "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  offsets.push(output.length);
  output += "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  offsets.push(output.length);
  output += `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`;
  offsets.push(output.length);
  output += `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`;
  offsets.push(output.length);
  output += "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

  const xrefOffset = output.length;
  output += "xref\n0 6\n0000000000 65535 f \n";
  for (const off of offsets) {
    output += off.toString().padStart(10, "0") + " 00000 n \n";
  }
  output += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(output);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let errorStage = "init";
  try {
    errorStage = "parse_request";
    const body = await req.json();
    const { quote_id, job_id, download } = body;
    if (!quote_id) return jsonResponse({ ok: false, error: "quote_id is required" }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth
    errorStage = "authenticate";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const supabaseWithAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabaseWithAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    // Tenant
    errorStage = "resolve_tenant";
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) throw new Error("No tenant for user");
    const tenantId = profile.tenant_id;

    // Fetch quote
    errorStage = "fetch_quote";
    const { data: quote, error: quoteErr } = await supabaseAdmin
      .from("cab_quotes")
      .select("*")
      .eq("id", quote_id)
      .single();
    if (quoteErr || !quote) throw new Error(`Quote not found: ${quote_id}`);

    // Fetch job
    errorStage = "fetch_job";
    const resolvedJobId = job_id || quote.job_id;
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("cab_jobs")
      .select("*")
      .eq("id", resolvedJobId)
      .single();
    if (jobErr || !job) throw new Error(`Job not found: ${resolvedJobId}`);

    // Fetch customer
    errorStage = "fetch_customer";
    const { data: customer } = await supabaseAdmin
      .from("cab_customers")
      .select("first_name, last_name, email, phone, postcode, address_line_1, address_line_2, city")
      .eq("id", job.customer_id)
      .single();

    // Build HTML
    errorStage = "build_html";
    const html = buildQuoteHtml(quote, job, customer);

    // Convert HTML to PDF
    errorStage = "generate_pdf";
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
      console.warn("[generate-quote-pdf] html2pdf.app unavailable, using fallback");
      pdfBytes = generateFallbackPdf(quote, job, customer);
    } else {
      pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
    }

    // If download mode, return the PDF directly
    if (download) {
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Quote_v${quote.version}.pdf"`,
        },
      });
    }

    // Upload to Drive
    if (!job.drive_folder_id) {
      console.log(`[generate-quote-pdf] No Drive folder for job ${job.job_ref}, skipping upload`);
      return jsonResponse({ ok: true, skipped_drive: true });
    }

    errorStage = "get_access_token";
    const accessToken = await getAccessToken(supabaseAdmin, tenantId);
    const folderId = job.drive_folder_id;
    const fileName = `Quote_v${quote.version}.pdf`;

    // Check existing
    errorStage = "search_existing";
    const searchQuery = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    const existingFileId = searchData.files?.[0]?.id;

    let driveFileId: string;

    if (existingFileId) {
      errorStage = "overwrite_file";
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media&supportsAllDrives=true&fields=id`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/pdf" },
          body: pdfBytes,
        }
      );
      if (!updateRes.ok) throw new Error(`Drive update failed ${updateRes.status}: ${await updateRes.text()}`);
      driveFileId = existingFileId;
      console.log(`[generate-quote-pdf] Updated ${fileName} (${driveFileId})`);
    } else {
      errorStage = "create_file";
      const metadata = JSON.stringify({ name: fileName, parents: [folderId], mimeType: "application/pdf" });
      const boundary = "quote_gen_boundary";
      const encoder = new TextEncoder();
      const metaPart = encoder.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`
      );
      const endPart = encoder.encode(`\r\n--${boundary}--`);
      const bodyArr = new Uint8Array(metaPart.length + pdfBytes.length + endPart.length);
      bodyArr.set(metaPart, 0);
      bodyArr.set(pdfBytes, metaPart.length);
      bodyArr.set(endPart, metaPart.length + pdfBytes.length);

      const createRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
          body: bodyArr,
        }
      );
      if (!createRes.ok) throw new Error(`Drive create failed ${createRes.status}: ${await createRes.text()}`);
      const created = await createRes.json();
      driveFileId = created.id;
      console.log(`[generate-quote-pdf] Created ${fileName} (${driveFileId})`);
    }

    // Update quote record with drive file ID
    errorStage = "update_quote";
    await supabaseAdmin
      .from("cab_quotes")
      .update({ drive_file_id: driveFileId, drive_filename: fileName })
      .eq("id", quote_id);

    return jsonResponse({ ok: true, drive_file_id: driveFileId, file_name: fileName });
  } catch (err: any) {
    console.error(`[generate-quote-pdf] Failed at stage="${errorStage}":`, err.message);
    return jsonResponse({ ok: false, error: err.message, stage: errorStage }, 500);
  }
});
