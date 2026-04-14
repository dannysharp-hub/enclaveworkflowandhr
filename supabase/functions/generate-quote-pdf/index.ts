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

function buildDocRequests(quote: any, job: any, customer: any): any[] {
  const customerName = customer ? `${customer.first_name} ${customer.last_name}` : "—";
  const quotePrice = quote.quote_price ?? quote.price_max ?? quote.price_min ?? 0;
  const deposit = Math.round(quotePrice * 0.5 * 100) / 100;
  const progress = Math.round(quotePrice * 0.4 * 100) / 100;
  const final = Math.round(quotePrice * 0.1 * 100) / 100;
  const version = quote.version || 1;
  const versionStr = version < 10 ? `0${version}` : `${version}`;
  const quoteRef = `Quote – ${job.job_ref || ""}-${versionStr}`;

  const scope = quote.scope_markdown || quote.scope_of_works || "";
  const terms = quote.terms_markdown || quote.terms_and_conditions || "";

  // Build the full text content first, then apply formatting via ranges
  const sections: string[] = [];

  // PAGE 1 — Header & Client Details
  sections.push("ENCLAVE CABINETRY\n");
  sections.push("\n"); // will be horizontal rule area
  sections.push(`${quoteRef}\n\n`);
  sections.push("Designer: Alistair Wood | Email: alistair@enclavecabinetry.com | Mobile: 07944608098\n\n");
  sections.push(`Quote To:\n${customerName}\n`);
  if (customer?.email) sections.push(`${customer.email}\n`);
  if (customer?.phone) sections.push(`${customer.phone}\n`);
  const addr = [customer?.address_line_1, customer?.address_line_2, customer?.city, customer?.postcode].filter(Boolean).join(", ");
  if (addr) sections.push(`${addr}\n`);
  sections.push("\n\n"); // page break area

  // PAGE 2 — Line Items
  sections.push("Line Items\n\n");
  // We'll insert a table after text insertion
  sections.push("\n\n");

  // PAGE 3 — Material Specification
  sections.push("Material Specification\n\n");
  sections.push("[Add material swatches and project photo here]\n\n\n");

  // PAGE 4 — Price & Scope
  if (scope) {
    sections.push("Scope of Works\n\n");
    sections.push(`${scope}\n\n`);
  }
  sections.push(`Subtotal: ${fmt(quotePrice)}\n\n`);
  sections.push("Payment Schedule\n\n");
  sections.push(`Deposit (50%): ${fmt(deposit)}\n`);
  sections.push(`Progress Payment (40%): ${fmt(progress)}\n`);
  sections.push(`Final Payment (10%): ${fmt(final)}\n\n`);
  sections.push("Units 1 & 2 Poplars Farm, East Heckington, PE20 3QF\n\n");
  if (terms) {
    sections.push("Terms and Conditions\n\n");
    sections.push(`${terms}\n\n`);
  }
  sections.push("\n");

  // PAGE 5 — Thank you
  sections.push("Thank you for your business.\n\n");
  sections.push("Enclave Cabinetry\n");

  const fullText = sections.join("");

  // Build requests: first insert all text, then format
  const requests: any[] = [];

  // Insert text at index 1 (after the initial newline in empty doc)
  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullText,
    },
  });

  // Now calculate character offsets for formatting
  let idx = 1;
  const ranges: { start: number; end: number; text: string; section: string }[] = [];
  for (const s of sections) {
    ranges.push({ start: idx, end: idx + s.length, text: s, section: s });
    idx += s.length;
  }

  // Format "ENCLAVE CABINETRY" — first section
  let offset = 1;
  const titleEnd = offset + "ENCLAVE CABINETRY".length;
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: offset, endIndex: titleEnd + 1 },
      paragraphStyle: { namedStyleType: "TITLE", alignment: "CENTER" },
      fields: "namedStyleType,alignment",
    },
  });
  requests.push({
    updateTextStyle: {
      range: { startIndex: offset, endIndex: titleEnd },
      textStyle: {
        bold: true,
        fontSize: { magnitude: 24, unit: "PT" },
        foregroundColor: { color: { rgbColor: { red: 0.1, green: 0.12, blue: 0.2 } } },
      },
      fields: "bold,fontSize,foregroundColor",
    },
  });

  // Add horizontal rule after title
  offset = titleEnd + 1; // after \n
  // Skip the empty line section for HR
  const hrIdx = offset;
  offset += sections[1].length;

  // Quote reference heading
  const refText = quoteRef;
  const refStart = offset;
  const refEnd = offset + refText.length;
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: refStart, endIndex: refEnd + 1 },
      paragraphStyle: { namedStyleType: "HEADING_1" },
      fields: "namedStyleType",
    },
  });
  requests.push({
    updateTextStyle: {
      range: { startIndex: refStart, endIndex: refEnd },
      textStyle: {
        fontSize: { magnitude: 18, unit: "PT" },
        foregroundColor: { color: { rgbColor: { red: 0.1, green: 0.12, blue: 0.2 } } },
      },
      fields: "fontSize,foregroundColor",
    },
  });

  // "Quote To:" bold formatting — find it
  const quoteToSection = `Quote To:\n${customerName}\n`;
  const quoteToIdx = fullText.indexOf("Quote To:");
  if (quoteToIdx >= 0) {
    const qtStart = 1 + quoteToIdx;
    requests.push({
      updateTextStyle: {
        range: { startIndex: qtStart, endIndex: qtStart + "Quote To:".length },
        textStyle: { bold: true, fontSize: { magnitude: 11, unit: "PT" } },
        fields: "bold,fontSize",
      },
    });
    // Customer name bold
    const cnStart = qtStart + "Quote To:\n".length;
    requests.push({
      updateTextStyle: {
        range: { startIndex: cnStart, endIndex: cnStart + customerName.length },
        textStyle: { bold: true, fontSize: { magnitude: 12, unit: "PT" } },
        fields: "bold,fontSize",
      },
    });
  }

  // Format section headings
  const headings = ["Line Items", "Material Specification", "Scope of Works", "Payment Schedule", "Terms and Conditions"];
  for (const h of headings) {
    const hIdx = fullText.indexOf(h + "\n");
    if (hIdx >= 0) {
      const hStart = 1 + hIdx;
      const hEnd = hStart + h.length;
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: hStart, endIndex: hEnd + 1 },
          paragraphStyle: { namedStyleType: "HEADING_2" },
          fields: "namedStyleType",
        },
      });
      requests.push({
        updateTextStyle: {
          range: { startIndex: hStart, endIndex: hEnd },
          textStyle: {
            bold: true,
            fontSize: { magnitude: 14, unit: "PT" },
            foregroundColor: { color: { rgbColor: { red: 0.1, green: 0.12, blue: 0.2 } } },
          },
          fields: "bold,fontSize,foregroundColor",
        },
      });
    }
  }

  // Format Subtotal bold
  const subtotalText = `Subtotal: ${fmt(quotePrice)}`;
  const stIdx = fullText.indexOf(subtotalText);
  if (stIdx >= 0) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: 1 + stIdx, endIndex: 1 + stIdx + subtotalText.length },
        textStyle: { bold: true, fontSize: { magnitude: 14, unit: "PT" } },
        fields: "bold,fontSize",
      },
    });
  }

  // Format "Thank you" section
  const tyText = "Thank you for your business.";
  const tyIdx = fullText.indexOf(tyText);
  if (tyIdx >= 0) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: 1 + tyIdx, endIndex: 1 + tyIdx + tyText.length + 1 },
        paragraphStyle: { alignment: "CENTER" },
        fields: "alignment",
      },
    });
    requests.push({
      updateTextStyle: {
        range: { startIndex: 1 + tyIdx, endIndex: 1 + tyIdx + tyText.length },
        textStyle: {
          italic: true,
          fontSize: { magnitude: 14, unit: "PT" },
          foregroundColor: { color: { rgbColor: { red: 0.3, green: 0.3, blue: 0.3 } } },
        },
        fields: "italic,fontSize,foregroundColor",
      },
    });
  }

  const ecText = "Enclave Cabinetry";
  const ecIdx = fullText.lastIndexOf(ecText);
  if (ecIdx >= 0) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: 1 + ecIdx, endIndex: 1 + ecIdx + ecText.length + 1 },
        paragraphStyle: { alignment: "CENTER" },
        fields: "alignment",
      },
    });
    requests.push({
      updateTextStyle: {
        range: { startIndex: 1 + ecIdx, endIndex: 1 + ecIdx + ecText.length },
        textStyle: {
          bold: true,
          fontSize: { magnitude: 16, unit: "PT" },
          foregroundColor: { color: { rgbColor: { red: 0.1, green: 0.12, blue: 0.2 } } },
        },
        fields: "bold,fontSize,foregroundColor",
      },
    });
  }

  // Insert page breaks before key sections
  const pageBreakBefore = ["Line Items\n", "Material Specification\n", "Thank you for your business.\n"];
  // Also before "Scope of Works" or "Subtotal" (page 4)
  const scopeOrSubtotal = scope ? "Scope of Works\n" : subtotalText;
  if (scopeOrSubtotal) pageBreakBefore.splice(2, 0, scopeOrSubtotal);

  // We need to insert page breaks AFTER all text is inserted
  // Page breaks need to be inserted in reverse order to not shift indices
  const breakIndices: number[] = [];
  for (const marker of pageBreakBefore) {
    const mi = fullText.indexOf(marker);
    if (mi >= 0) breakIndices.push(1 + mi);
  }
  // Sort descending so we insert from bottom to top
  breakIndices.sort((a, b) => b - a);
  for (const bi of breakIndices) {
    requests.push({
      insertPageBreak: {
        location: { index: bi },
      },
    });
  }

  // Insert a table for line items after "Line Items" heading
  const liIdx = fullText.indexOf("Line Items\n\n");
  if (liIdx >= 0) {
    const tableInsertIdx = 1 + liIdx + "Line Items\n\n".length;
    requests.push({
      insertTable: {
        rows: 6,
        columns: 4,
        location: { index: tableInsertIdx },
      },
    });
  }

  return requests;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let errorStage = "init";
  try {
    errorStage = "parse_request";
    const body = await req.json();
    const { quote_id, job_id } = body;
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

    // Check Drive folder
    if (!job.drive_folder_id) {
      return jsonResponse({ ok: false, error: "No Drive folder linked to this job. Link a Drive folder first." }, 400);
    }

    // Get Google access token
    errorStage = "get_access_token";
    const accessToken = await getAccessToken(supabaseAdmin, tenantId);
    const folderId = job.drive_folder_id;
    const version = quote.version || 1;
    const fileName = `Quote_v${version}`;

    // Check if a doc already exists with this name
    errorStage = "search_existing";
    const searchQuery = `name='${fileName}' and '${folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.document'`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    let existingDocId = searchData.files?.[0]?.id;

    let docId: string;

    if (existingDocId) {
      // Delete existing and recreate (Docs API doesn't support full content replacement easily)
      errorStage = "delete_existing";
      await fetch(`https://www.googleapis.com/drive/v3/files/${existingDocId}?supportsAllDrives=true`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      console.log(`[generate-quote-pdf] Deleted existing doc ${existingDocId}`);
    }

    // Create new Google Doc in the Drive folder
    errorStage = "create_doc";
    const createRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: fileName,
          mimeType: "application/vnd.google-apps.document",
          parents: [folderId],
        }),
      }
    );
    if (!createRes.ok) throw new Error(`Drive create failed ${createRes.status}: ${await createRes.text()}`);
    const created = await createRes.json();
    docId = created.id;
    const webViewLink = created.webViewLink;
    console.log(`[generate-quote-pdf] Created Google Doc ${fileName} (${docId})`);

    // Populate the doc with content using Google Docs API
    errorStage = "populate_doc";
    const docRequests = buildDocRequests(quote, job, customer);

    const batchRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests: docRequests }),
      }
    );
    if (!batchRes.ok) {
      const errText = await batchRes.text();
      console.error(`[generate-quote-pdf] Docs API batchUpdate failed:`, errText);
      // Don't throw — doc is created but may be empty. Log and continue.
    } else {
      console.log(`[generate-quote-pdf] Populated doc content successfully`);
    }

    // Update quote record with Google Doc ID
    errorStage = "update_quote";
    await supabaseAdmin
      .from("cab_quotes")
      .update({ drive_file_id: docId, drive_filename: fileName })
      .eq("id", quote_id);

    return jsonResponse({
      ok: true,
      drive_file_id: docId,
      file_name: fileName,
      web_view_link: webViewLink || `https://docs.google.com/document/d/${docId}/edit`,
    });
  } catch (err: any) {
    console.error(`[generate-quote-pdf] Failed at stage="${errorStage}":`, err.message);
    return jsonResponse({ ok: false, error: err.message, stage: errorStage }, 500);
  }
});
