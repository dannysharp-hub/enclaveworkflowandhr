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
  quote: "EC_Quote_Template",
  sign_off: "EC_Client_Design_Sign_Off",
  invoice_deposit: "EC_Invoice_Deposit",
  invoice_progress: "EC_Invoice_Progress",
  invoice_final: "EC_Invoice_Final",
  fitter_form: "EC_Fitters_Installation_Completion_Form",
};

function buildOutputName(docType: string, job: any, quote?: any): string {
  const ref = job.job_ref || "UNKNOWN";
  switch (docType) {
    case "quote": return `Quote_v${quote?.version || 1}`;
    case "sign_off": return `Design Sign-Off_${ref}`;
    case "invoice_deposit": return `Invoice_Deposit_${ref}`;
    case "invoice_progress": return `Invoice_Progress_${ref}`;
    case "invoice_final": return `Invoice_Final_${ref}`;
    case "fitter_form": return `Fitter_Form_${ref}`;
    default: return `Document_${ref}`;
  }
}

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatAddress(addr: any): string {
  if (!addr) return "";
  if (typeof addr === "string") return addr;
  return [addr.address_line_1, addr.address, addr.city, addr.postcode].filter(Boolean).join(", ");
}

function formatCurrency(amount: number): string {
  return "\u00A3" + amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    console.log("[DocGen] Using cached access token (expires " + tokenRow.expires_at + ")");
    return atob(tokenRow.access_token_encrypted);
  }

  console.log("[DocGen] Access token expired, refreshing...");
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set");

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
  if (!res.ok || !data.access_token) {
    console.error("[DocGen] Token refresh response:", JSON.stringify(data));
    throw new Error(`Token refresh failed: ${data.error_description || data.error || "unknown"}`);
  }

  // Check scopes in response
  if (data.scope) {
    console.log("[DocGen] Token scopes:", data.scope);
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

async function driveSearch(accessToken: string, query: string): Promise<any[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id,name,mimeType)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive search failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.files || [];
}

async function findTemplatesFolderId(accessToken: string): Promise<string> {
  // Search for _Templates folder anywhere in Drive
  console.log("[DocGen] Searching for _Templates folder...");
  
  // Strategy 1: Look for _Templates inside _EnclaveCabinetry
  const parentFiles = await driveSearch(accessToken, "name='_EnclaveCabinetry' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  console.log(`[DocGen] Found ${parentFiles.length} '_EnclaveCabinetry' folders:`, parentFiles.map((f: any) => f.id));
  
  if (parentFiles.length > 0) {
    const parentId = parentFiles[0].id;
    const templateFolders = await driveSearch(accessToken, `name='_Templates' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    console.log(`[DocGen] Found ${templateFolders.length} '_Templates' folders inside _EnclaveCabinetry:`, templateFolders.map((f: any) => f.id));
    if (templateFolders.length > 0) {
      console.log(`[DocGen] ✓ Using _Templates folder: ${templateFolders[0].id}`);
      return templateFolders[0].id;
    }
  }

  // Strategy 2: Search for _Templates directly
  const directSearch = await driveSearch(accessToken, "name='_Templates' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  console.log(`[DocGen] Direct search found ${directSearch.length} '_Templates' folders:`, directSearch.map((f: any) => `${f.id} (${f.name})`));
  if (directSearch.length > 0) {
    console.log(`[DocGen] ✓ Using _Templates folder: ${directSearch[0].id}`);
    return directSearch[0].id;
  }

  // Strategy 3: Search for Templates (without underscore)
  const altSearch = await driveSearch(accessToken, "name='Templates' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  console.log(`[DocGen] Alt search found ${altSearch.length} 'Templates' folders:`, altSearch.map((f: any) => `${f.id} (${f.name})`));
  if (altSearch.length > 0) {
    console.log(`[DocGen] ✓ Using Templates folder (no underscore): ${altSearch[0].id}`);
    return altSearch[0].id;
  }

  throw new Error("Templates folder not found in Google Drive. Looked for '_Templates' inside '_EnclaveCabinetry', then '_Templates' and 'Templates' at root level.");
}

async function findTemplateFile(accessToken: string, templatesFolderId: string, fileNameBase: string): Promise<string> {
  // Search for the template by base name (without extension) — could be .docx or Google Doc
  console.log(`[DocGen] Searching for template '${fileNameBase}' in folder ${templatesFolderId}...`);
  
  // List all files in templates folder for debugging
  const allFiles = await driveSearch(accessToken, `'${templatesFolderId}' in parents and trashed=false`);
  console.log(`[DocGen] All files in _Templates folder (${allFiles.length}):`, allFiles.map((f: any) => `${f.name} [${f.mimeType}]`));

  // Try exact name match with .docx
  let matches = allFiles.filter((f: any) => f.name === `${fileNameBase}.docx`);
  if (matches.length > 0) {
    console.log(`[DocGen] ✓ Found template: ${matches[0].name} (${matches[0].id}) [${matches[0].mimeType}]`);
    return matches[0].id;
  }

  // Try exact name match without extension
  matches = allFiles.filter((f: any) => f.name === fileNameBase);
  if (matches.length > 0) {
    console.log(`[DocGen] ✓ Found template (no ext): ${matches[0].name} (${matches[0].id}) [${matches[0].mimeType}]`);
    return matches[0].id;
  }

  // Try partial name match (starts with)
  matches = allFiles.filter((f: any) => f.name.startsWith(fileNameBase));
  if (matches.length > 0) {
    console.log(`[DocGen] ✓ Found template (partial): ${matches[0].name} (${matches[0].id}) [${matches[0].mimeType}]`);
    return matches[0].id;
  }

  throw new Error(`Template '${fileNameBase}' not found in _Templates folder. Available files: ${allFiles.map((f: any) => f.name).join(", ") || "none"}`);
}

function buildReplaceRequests(docType: string, job: any, customer: any, quote: any): any[] {
  const today = new Date();
  const paymentDue = new Date(today);
  paymentDue.setDate(paymentDue.getDate() + 14);
  const cv = job.contract_value || 0;
  const addr = formatAddress(job.property_address_json || customer);

  const amount = docType === "invoice_deposit" ? cv * 0.5
    : docType === "invoice_progress" ? cv * 0.4
    : docType === "invoice_final" ? cv * 0.1
    : cv;

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
    "{{deposit_amount}}": formatCurrency(cv * 0.5),
    "{{progress_amount}}": formatCurrency(cv * 0.4),
    "{{final_amount}}": formatCurrency(cv * 0.1),
    "{{contract_value}}": formatCurrency(cv),
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
  const startTime = Date.now();
  try {
    errorStage = "parse_request";
    const { job_id, document_type } = await req.json();
    console.log(`[DocGen] START job_id=${job_id} document_type=${document_type}`);
    if (!job_id || !document_type) return jsonResponse({ ok: false, error: "job_id and document_type required" }, 400);

    const templateFileBase = TEMPLATE_MAP[document_type];
    if (!templateFileBase) return jsonResponse({ ok: false, error: `Unknown document_type: ${document_type}` }, 400);

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
    console.log(`[DocGen] Authenticated user: ${userId}`);

    // Resolve tenant
    errorStage = "resolve_tenant";
    const { data: profile } = await supabaseAdmin.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) throw new Error("No tenant for user");
    const tenantId = profile.tenant_id;
    console.log(`[DocGen] Tenant: ${tenantId}`);

    // Fetch job
    errorStage = "fetch_job";
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("cab_jobs")
      .select("id, job_ref, job_title, room_type, assigned_rep_name, contract_value, contract_currency, customer_id, company_id, drive_folder_id, property_address_json")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) throw new Error(`Job not found: ${job_id}`);
    console.log(`[DocGen] Job: ${job.job_ref} (drive_folder: ${job.drive_folder_id || "NONE"})`);
    if (!job.drive_folder_id) return jsonResponse({ ok: false, error: "No Drive folder linked to this job", skipped: true });

    // Fetch customer
    errorStage = "fetch_customer";
    const { data: customer } = await supabaseAdmin
      .from("cab_customers")
      .select("first_name, last_name, phone, email, postcode, address_line_1, city")
      .eq("id", job.customer_id)
      .single();
    console.log(`[DocGen] Customer: ${customer?.first_name} ${customer?.last_name}`);

    // Fetch quote
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
      console.log(`[DocGen] Quote: v${quote?.version || "none"}`);
    }

    // Get access token
    errorStage = "get_access_token";
    const accessToken = await getAccessToken(supabaseAdmin, tenantId);
    console.log(`[DocGen] ✓ Got access token`);

    // Verify Drive access by checking token info
    errorStage = "verify_token_scopes";
    const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
    if (tokenInfoRes.ok) {
      const tokenInfo = await tokenInfoRes.json();
      console.log(`[DocGen] Token scopes: ${tokenInfo.scope}`);
      const hasDocsScope = tokenInfo.scope?.includes("docs") || tokenInfo.scope?.includes("drive");
      console.log(`[DocGen] Has Drive/Docs scope: ${hasDocsScope}`);
    } else {
      console.warn(`[DocGen] Could not verify token scopes: ${tokenInfoRes.status}`);
    }

    // Find templates folder
    errorStage = "find_templates_folder";
    const templatesFolderId = await findTemplatesFolderId(accessToken);

    // Find template file
    errorStage = "find_template_file";
    const templateFileId = await findTemplateFile(accessToken, templatesFolderId, templateFileBase);

    // Check if the template is already a Google Doc or a .docx
    errorStage = "check_template_type";
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${templateFileId}?fields=mimeType,name&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const metaData = await metaRes.json();
    const isGoogleDoc = metaData.mimeType === "application/vnd.google-apps.document";
    console.log(`[DocGen] Template type: ${metaData.mimeType} (isGoogleDoc: ${isGoogleDoc})`);

    const outputName = buildOutputName(document_type, job, quote);
    let gdocId: string;

    if (isGoogleDoc) {
      // Template is already a Google Doc — just copy it to the job folder
      errorStage = "copy_gdoc";
      console.log(`[DocGen] Copying Google Doc template to job folder...`);
      const copyRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${templateFileId}/copy?supportsAllDrives=true`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: outputName, parents: [job.drive_folder_id] }),
        }
      );
      if (!copyRes.ok) {
        const errBody = await copyRes.text();
        throw new Error(`Drive copy failed (${copyRes.status}): ${errBody}`);
      }
      const copied = await copyRes.json();
      gdocId = copied.id;
      console.log(`[DocGen] ✓ Copied Google Doc → ${outputName} (${gdocId})`);
    } else {
      // Template is .docx — download and re-upload as Google Doc
      errorStage = "download_docx";
      console.log(`[DocGen] Downloading .docx template (${templateFileId})...`);
      const downloadRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${templateFileId}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!downloadRes.ok) {
        const errBody = await downloadRes.text();
        throw new Error(`Download failed (${downloadRes.status}): ${errBody}`);
      }
      const docxBytes = await downloadRes.arrayBuffer();
      console.log(`[DocGen] ✓ Downloaded template (${docxBytes.byteLength} bytes)`);

      // Upload as Google Doc with conversion
      errorStage = "upload_as_gdoc";
      console.log(`[DocGen] Uploading as Google Doc to job folder ${job.drive_folder_id}...`);
      const boundary = "docgen_boundary_" + Date.now();
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
        throw new Error(`Upload as GDoc failed (${createRes.status}): ${errBody}`);
      }
      const createdDoc = await createRes.json();
      gdocId = createdDoc.id;
      console.log(`[DocGen] ✓ Created Google Doc ${outputName} (${gdocId})`);
    }

    // Find and replace placeholders
    errorStage = "replace_placeholders";
    const replaceRequests = buildReplaceRequests(document_type, job, customer, quote);
    console.log(`[DocGen] Replacing ${replaceRequests.length} placeholders in ${gdocId}...`);
    if (replaceRequests.length > 0) {
      const batchRes = await fetch(
        `https://docs.googleapis.com/v1/documents/${gdocId}:batchUpdate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ requests: replaceRequests }),
        }
      );
      if (!batchRes.ok) {
        const errBody = await batchRes.text();
        console.warn(`[DocGen] ⚠ Docs API replace failed (non-fatal): ${errBody}`);
      } else {
        console.log(`[DocGen] ✓ Replaced ${replaceRequests.length} placeholders`);
      }
    }

    // Save to quote record if applicable
    if (document_type === "quote" && quote?.id) {
      errorStage = "save_quote_link";
      await supabaseAdmin
        .from("cab_quotes")
        .update({ drive_file_id: gdocId, drive_filename: outputName })
        .eq("id", quote.id);
      console.log(`[DocGen] ✓ Saved drive_file_id to quote ${quote.id}`);
    }

    const elapsed = Date.now() - startTime;
    const webViewLink = `https://docs.google.com/document/d/${gdocId}/edit`;
    console.log(`[DocGen] ✓ COMPLETE ${document_type} → ${outputName} in ${elapsed}ms`);

    return jsonResponse({
      ok: true,
      drive_file_id: gdocId,
      file_name: outputName,
      web_view_link: webViewLink,
    });
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[DocGen] ✗ FAILED at stage="${errorStage}" after ${elapsed}ms:`, err.message);
    return jsonResponse({ ok: false, error: err.message, stage: errorStage }, 500);
  }
});
