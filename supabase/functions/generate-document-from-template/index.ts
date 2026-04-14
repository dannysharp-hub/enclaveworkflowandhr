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

const TEMPLATE_MAP: Record<string, string> = {
  quote: "EC_Quote_Template.docx",
  sign_off: "EC_Client_Design_Sign_Off.docx",
  invoice_deposit: "EC_Invoice_Deposit.docx",
  invoice_progress: "EC_Invoice_Progress.docx",
  invoice_final: "EC_Invoice_Final.docx",
  fitter_form: "EC_Fitters_Installation_Completion_Form.docx",
};

function buildOutputName(docType: string, job: any, quote?: any): string {
  const ref = job.job_ref || "UNKNOWN";
  switch (docType) {
    case "quote":
      return `Quote_v${quote?.version || 1}`;
    case "sign_off":
      return `Design Sign-Off_${ref}`;
    case "invoice_deposit":
      return `Invoice_Deposit_${ref}`;
    case "invoice_progress":
      return `Invoice_Progress_${ref}`;
    case "invoice_final":
      return `Invoice_Final_${ref}`;
    case "fitter_form":
      return `Fitter_Form_${ref}`;
    default:
      return `Document_${ref}`;
  }
}

function getRelevantAmount(docType: string, job: any): string {
  const cv = job.contract_value || 0;
  switch (docType) {
    case "invoice_deposit":
      return (cv * 0.5).toFixed(2);
    case "invoice_progress":
      return (cv * 0.4).toFixed(2);
    case "invoice_final":
      return (cv * 0.1).toFixed(2);
    case "quote":
      return cv.toFixed(2);
    default:
      return "0.00";
  }
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatAddress(addr: any): string {
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  const parts = [addr.address_line_1, addr.address, addr.city, addr.postcode].filter(Boolean);
  return parts.join(", ");
}

function formatCurrency(amount: string): string {
  const num = parseFloat(amount);
  return "£" + num.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getAccessToken(supabaseAdmin: any, tenantId: string): Promise<string> {
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (tokenErr || !tokenRow) throw new Error(`No Google OAuth tokens for tenant ${tenantId}`);
  if (!tokenRow.refresh_token_encrypted) throw new Error("No refresh token. Reconnect Google Drive.");

  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted);
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth env vars missing");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: atob(tokenRow.refresh_token_encrypted),
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

// Parent folder for templates
const TEMPLATES_PARENT_NAME = "_EnclaveCabinetry";
const TEMPLATES_FOLDER_NAME = "_Templates";

async function findTemplatesFolderId(accessToken: string): Promise<string> {
  // Find _EnclaveCabinetry
  const q1 = `name='${TEMPLATES_PARENT_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r1 = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q1)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d1 = await r1.json();
  const parentId = d1.files?.[0]?.id;
  if (!parentId) throw new Error(`Folder '${TEMPLATES_PARENT_NAME}' not found in Drive`);

  // Find _Templates inside it
  const q2 = `name='${TEMPLATES_FOLDER_NAME}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r2 = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q2)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d2 = await r2.json();
  const templatesFolderId = d2.files?.[0]?.id;
  if (!templatesFolderId) throw new Error(`Folder '${TEMPLATES_FOLDER_NAME}' not found inside '${TEMPLATES_PARENT_NAME}'`);

  return templatesFolderId;
}

async function findTemplateFile(accessToken: string, templatesFolderId: string, fileName: string): Promise<string> {
  const q = `name='${fileName}' and '${templatesFolderId}' in parents and trashed=false`;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d = await r.json();
  const fileId = d.files?.[0]?.id;
  if (!fileId) throw new Error(`Template file '${fileName}' not found in _Templates folder`);
  return fileId;
}

function buildReplaceRequests(docType: string, job: any, customer: any, quote: any): any[] {
  const today = new Date();
  const paymentDue = new Date(today);
  paymentDue.setDate(paymentDue.getDate() + 14);
  const amount = getRelevantAmount(docType, job);
  const addr = formatAddress(job.property_address_json || customer);

  const replacements: Record<string, string> = {
    "{{client_name}}": `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim() || "Customer",
    "{{first_name}}": customer?.first_name || "",
    "{{last_name}}": customer?.last_name || "",
    "{{job_ref}}": job.job_ref || "",
    "{{quote_ref}}": job.job_ref || "",
    "{{order_ref}}": job.job_ref || "",
    "{{project_ref}}": job.job_ref || "",
    "{{date_issued}}": formatDate(today),
    "{{date}}": formatDate(today),
    "{{designer}}": job.assigned_rep_name || "Alistair Wood",
    "{{sales_contact}}": job.assigned_rep_name || "Alistair Wood",
    "{{phone}}": customer?.phone || "",
    "{{email}}": customer?.email || "",
    "{{address}}": addr,
    "{{payment_due}}": formatDate(paymentDue),
    "{{subtotal}}": formatCurrency(amount),
    "{{amount}}": formatCurrency(amount),
    "{{total}}": formatCurrency(amount),
    "{{job_title}}": job.job_title || "",
    "{{room_type}}": job.room_type || "",
    "{{scope_of_works}}": quote?.scope_of_works || "",
    "{{terms_and_conditions}}": quote?.terms_and_conditions || "",
    "{{deposit_amount}}": formatCurrency((job.contract_value * 0.5).toFixed(2)),
    "{{progress_amount}}": formatCurrency((job.contract_value * 0.4).toFixed(2)),
    "{{final_amount}}": formatCurrency((job.contract_value * 0.1).toFixed(2)),
    "{{contract_value}}": formatCurrency((job.contract_value || 0).toFixed(2)),
  };

  return Object.entries(replacements).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: key, matchCase: false },
      replaceText: value,
    },
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let errorStage = "init";
  try {
    errorStage = "parse_request";
    const { job_id, document_type } = await req.json();
    if (!job_id || !document_type) return jsonResponse({ ok: false, error: "job_id and document_type required" }, 400);

    const templateFile = TEMPLATE_MAP[document_type];
    if (!templateFile) return jsonResponse({ ok: false, error: `Unknown document_type: ${document_type}` }, 400);

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

    // Resolve tenant
    errorStage = "resolve_tenant";
    const { data: profile } = await supabaseAdmin.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) throw new Error("No tenant for user");
    const tenantId = profile.tenant_id;

    // Fetch job
    errorStage = "fetch_job";
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("cab_jobs")
      .select("id, job_ref, job_title, room_type, assigned_rep_name, contract_value, contract_currency, customer_id, company_id, drive_folder_id, property_address_json")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) throw new Error(`Job not found: ${job_id}`);
    if (!job.drive_folder_id) return jsonResponse({ ok: false, error: "No Drive folder linked to this job", skipped: true });

    // Fetch customer
    errorStage = "fetch_customer";
    const { data: customer } = await supabaseAdmin
      .from("cab_customers")
      .select("first_name, last_name, phone, email, postcode, address_line_1, city")
      .eq("id", job.customer_id)
      .single();

    // Fetch quote (for quote doc type)
    let quote: any = null;
    if (document_type === "quote") {
      errorStage = "fetch_quote";
      const { data: q } = await supabaseAdmin
        .from("cab_quotes")
        .select("id, version, quote_price, scope_of_works, terms_and_conditions")
        .eq("job_id", job_id)
        .order("version", { ascending: false })
        .limit(1);
      quote = q?.[0] || null;
    }

    // Get access token
    errorStage = "get_access_token";
    const accessToken = await getAccessToken(supabaseAdmin, tenantId);

    // Find templates folder
    errorStage = "find_templates_folder";
    const templatesFolderId = await findTemplatesFolderId(accessToken);

    // Find template file
    errorStage = "find_template_file";
    const templateFileId = await findTemplateFile(accessToken, templatesFolderId, templateFile);

    // Copy template to job folder
    errorStage = "copy_template";
    const outputName = buildOutputName(document_type, job, quote);
    const copyRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${templateFileId}/copy?supportsAllDrives=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: outputName,
          parents: [job.drive_folder_id],
        }),
      }
    );
    if (!copyRes.ok) {
      const errBody = await copyRes.text();
      throw new Error(`Drive copy failed ${copyRes.status}: ${errBody}`);
    }
    const copiedFile = await copyRes.json();
    const copiedFileId = copiedFile.id;
    console.log(`[generate-document-from-template] Copied ${templateFile} → ${outputName} (${copiedFileId})`);

    // The copied file is a .docx — convert to Google Doc for find-and-replace
    // Actually, Drive copy of a .docx stays as .docx unless we convert. Let's convert it.
    // We need to re-upload as Google Doc. Let's do it differently: 
    // Copy with convert, then do find/replace via Docs API.
    
    // Delete the non-converted copy
    await fetch(`https://www.googleapis.com/drive/v3/files/${copiedFileId}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Re-copy with conversion to Google Docs format
    errorStage = "copy_as_gdoc";
    // Download the docx content first
    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${templateFileId}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!downloadRes.ok) throw new Error(`Failed to download template: ${downloadRes.status}`);
    const docxBytes = await downloadRes.arrayBuffer();

    // Upload as Google Doc (converted)
    const boundary = "template_doc_boundary";
    const metadata = JSON.stringify({
      name: outputName,
      parents: [job.drive_folder_id],
      mimeType: "application/vnd.google-apps.document",
    });
    const encoder = new TextEncoder();
    const metaPart = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
    );
    const endPart = encoder.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(metaPart.length + docxBytes.byteLength + endPart.length);
    body.set(metaPart, 0);
    body.set(new Uint8Array(docxBytes), metaPart.length);
    body.set(endPart, metaPart.length + docxBytes.byteLength);

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
      throw new Error(`Drive upload failed ${createRes.status}: ${errBody}`);
    }
    const createdDoc = await createRes.json();
    const gdocId = createdDoc.id;
    console.log(`[generate-document-from-template] Created Google Doc ${outputName} (${gdocId})`);

    // Find and replace placeholders using Google Docs API
    errorStage = "replace_placeholders";
    const replaceRequests = buildReplaceRequests(document_type, job, customer, quote);
    if (replaceRequests.length > 0) {
      const batchRes = await fetch(
        `https://docs.googleapis.com/v1/documents/${gdocId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ requests: replaceRequests }),
        }
      );
      if (!batchRes.ok) {
        const errBody = await batchRes.text();
        console.warn(`[generate-document-from-template] Docs API replace failed: ${errBody}`);
        // Non-fatal — document was still created
      } else {
        console.log(`[generate-document-from-template] Replaced ${replaceRequests.length} placeholders`);
      }
    }

    // Save drive_file_id to quote if it's a quote document
    if (document_type === "quote" && quote?.id) {
      await supabaseAdmin
        .from("cab_quotes")
        .update({ drive_file_id: gdocId, drive_filename: outputName })
        .eq("id", quote.id);
    }

    const webViewLink = `https://docs.google.com/document/d/${gdocId}/edit`;

    return jsonResponse({
      ok: true,
      drive_file_id: gdocId,
      file_name: outputName,
      web_view_link: webViewLink,
    });
  } catch (err: any) {
    console.error(`[generate-document-from-template] Failed at stage="${errorStage}":`, err.message);
    return jsonResponse({ ok: false, error: err.message, stage: errorStage }, 500);
  }
});
