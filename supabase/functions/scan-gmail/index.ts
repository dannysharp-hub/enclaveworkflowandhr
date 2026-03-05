import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GMAIL_API = "https://www.googleapis.com/gmail/v1";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Document type keywords for Gmail search
const DOC_KEYWORDS = [
  "invoice", "bill", "statement", "remittance", "quote",
  "purchase order", "PO", "proforma", "credit note", "receipt",
];

const SEARCH_QUERY = `has:attachment (${DOC_KEYWORDS.map(k => `"${k}"`).join(" OR ")}) newer_than:7d`;

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

async function getValidAccessToken(
  supabaseAdmin: any,
  tenantId: string
): Promise<string> {
  const { data: tokenRow } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("id, access_token_encrypted, refresh_token_encrypted, expires_at, token_version")
    .eq("tenant_id", tenantId)
    .single();

  if (!tokenRow) throw new Error("No Google tokens found. Please reconnect your Google account.");

  const accessToken = atob(tokenRow.access_token_encrypted);
  const refreshToken = atob(tokenRow.refresh_token_encrypted);
  const expiresAt = new Date(tokenRow.expires_at);

  // If token is still valid (with 5 min buffer), use it
  if (expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return accessToken;
  }

  // Refresh the token
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch(GOOGLE_TOKEN_URL, {
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

  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("google_oauth_tokens")
    .update({
      access_token_encrypted: btoa(data.access_token),
      expires_at: newExpiresAt,
      token_version: tokenRow.token_version + 1,
    })
    .eq("id", tokenRow.id);

  return data.access_token;
}

async function gmailGet(accessToken: string, path: string) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${body}`);
  }
  return res.json();
}

async function getAttachmentData(accessToken: string, messageId: string, attachmentId: string): Promise<Uint8Array> {
  const data = await gmailGet(accessToken, `/users/me/messages/${messageId}/attachments/${attachmentId}`);
  // Gmail returns base64url encoded data
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extractHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

async function classifyWithAI(
  fileName: string,
  subject: string,
  sender: string,
  jobs: { id: string; job_id: string; title: string; customer_name: string }[]
): Promise<{ document_type: string; matched_job_id: string | null; confidence: number; reason: string; extracted_data: Record<string, any> }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const jobList = jobs.map(j => `- ID: ${j.id}, Ref: ${j.job_id}, Title: "${j.title}", Customer: "${j.customer_name}"`).join("\n");

  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a document classification assistant for a cabinetry/joinery workshop. 
Classify email attachments and match them to jobs.

Available jobs:
${jobList}

Classify documents into: invoice, bill, statement, remittance, quote, purchase_order, credit_note, receipt, or unknown.
Match to a job based on job reference numbers, customer names, or contextual clues in the filename and email subject.`,
        },
        {
          role: "user",
          content: `Classify this document:
- File: "${fileName}"
- Email subject: "${subject}"
- Sender: "${sender}"`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "classify_document",
            description: "Classify a document and optionally match it to a job",
            parameters: {
              type: "object",
              properties: {
                document_type: {
                  type: "string",
                  enum: ["invoice", "bill", "statement", "remittance", "quote", "purchase_order", "credit_note", "receipt", "unknown"],
                },
                matched_job_id: {
                  type: "string",
                  description: "The UUID of the matched job, or null if no match",
                  nullable: true,
                },
                confidence: {
                  type: "number",
                  description: "Confidence score 0-1",
                },
                reason: {
                  type: "string",
                  description: "Brief explanation of the classification and matching decision",
                },
                extracted_data: {
                  type: "object",
                  description: "Any extracted info like invoice number, amount, date",
                  properties: {
                    invoice_number: { type: "string" },
                    amount: { type: "string" },
                    date: { type: "string" },
                    supplier_name: { type: "string" },
                  },
                },
              },
              required: ["document_type", "confidence", "reason"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "classify_document" } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("AI rate limit exceeded, please try again later");
    if (response.status === 402) throw new Error("AI credits exhausted, please add funds");
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const result = await response.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    return { document_type: "unknown", matched_job_id: null, confidence: 0, reason: "AI could not classify", extracted_data: {} };
  }

  const parsed = JSON.parse(toolCall.function.arguments);
  return {
    document_type: parsed.document_type || "unknown",
    matched_job_id: parsed.matched_job_id || null,
    confidence: parsed.confidence || 0,
    reason: parsed.reason || "",
    extracted_data: parsed.extracted_data || {},
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = user.id;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("tenant_id")
    .eq("user_id", userId)
    .single();
  if (!profile?.tenant_id) {
    return new Response(JSON.stringify({ error: "No tenant" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const tenantId = profile.tenant_id;

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  try {
    // ─── GET SETTINGS ───
    if (action === "get_settings") {
      const { data: settings } = await supabaseAdmin
        .from("gmail_scan_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .single();

      const { count: pendingCount } = await supabaseAdmin
        .from("gmail_extracted_documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending");

      const { count: totalScanned } = await supabaseAdmin
        .from("gmail_scanned_emails")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

      return new Response(JSON.stringify({
        settings: settings || { enabled: false, scan_frequency_minutes: 60, require_review: true, auto_file_threshold: 0.85 },
        pending_review: pendingCount || 0,
        total_scanned: totalScanned || 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE SETTINGS ───
    if (action === "update_settings") {
      const updates: Record<string, any> = {};
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      if (body.scan_frequency_minutes) updates.scan_frequency_minutes = body.scan_frequency_minutes;
      if (body.require_review !== undefined) updates.require_review = body.require_review;
      if (body.auto_file_threshold) updates.auto_file_threshold = body.auto_file_threshold;

      await supabaseAdmin.from("gmail_scan_settings").upsert({
        tenant_id: tenantId,
        ...updates,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id" });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SCAN NOW ───
    if (action === "scan") {
      // Check Google connection
      const { data: settings } = await supabaseAdmin
        .from("google_integration_settings")
        .select("is_connected, granted_scopes")
        .eq("tenant_id", tenantId)
        .single();

      if (!settings?.is_connected) {
        return new Response(JSON.stringify({ error: "Google account not connected" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if gmail scope is granted
      const scopes = settings.granted_scopes as string[] || [];
      const hasGmailScope = scopes.some((s: string) => s.includes("gmail.readonly"));
      if (!hasGmailScope) {
        return new Response(JSON.stringify({ 
          error: "Gmail access not granted",
          needs_scope: true,
          message: "Please reconnect your Google account with Gmail permissions enabled." 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getValidAccessToken(supabaseAdmin, tenantId);

      // Search for emails with financial document attachments
      const searchResult = await gmailGet(accessToken, `/users/me/messages?q=${encodeURIComponent(SEARCH_QUERY)}&maxResults=20`);
      const messageIds = (searchResult.messages || []).map((m: any) => m.id);

      if (messageIds.length === 0) {
        // Update last scan time
        await supabaseAdmin.from("gmail_scan_settings").upsert({
          tenant_id: tenantId,
          last_scan_at: new Date().toISOString(),
        }, { onConflict: "tenant_id" });

        return new Response(JSON.stringify({ scanned: 0, new_documents: 0, message: "No new emails with financial documents found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get active jobs for AI matching
      const { data: jobs } = await supabaseAdmin
        .from("jobs")
        .select("id, job_id, title, customer_name")
        .eq("tenant_id", tenantId)
        .in("status", ["quoted", "accepted", "in_progress", "production"])
        .order("created_at", { ascending: false })
        .limit(100);

      let newDocuments = 0;
      let scannedCount = 0;

      for (const msgId of messageIds) {
        // Skip already scanned
        const { data: existing } = await supabaseAdmin
          .from("gmail_scanned_emails")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("gmail_message_id", msgId)
          .single();

        if (existing) continue;

        // Get full message
        const message = await gmailGet(accessToken, `/users/me/messages/${msgId}?format=full`);
        const headers = message.payload?.headers || [];
        const subject = extractHeader(headers, "Subject");
        const from = extractHeader(headers, "From");
        const date = extractHeader(headers, "Date");

        // Extract sender info
        const senderMatch = from.match(/(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?/);
        const senderName = senderMatch?.[1] || "";
        const senderEmail = senderMatch?.[2] || from;

        // Find attachments (check all parts recursively)
        const attachments: { filename: string; mimeType: string; attachmentId: string; size: number }[] = [];
        const findAttachments = (part: any) => {
          if (part.filename && part.body?.attachmentId) {
            const isDoc = /\.(pdf|xlsx?|csv|docx?|png|jpg|jpeg)$/i.test(part.filename);
            if (isDoc) {
              attachments.push({
                filename: part.filename,
                mimeType: part.mimeType,
                attachmentId: part.body.attachmentId,
                size: part.body.size || 0,
              });
            }
          }
          if (part.parts) part.parts.forEach(findAttachments);
        };
        if (message.payload) findAttachments(message.payload);

        // Insert scanned email record
        const { data: emailRecord } = await supabaseAdmin
          .from("gmail_scanned_emails")
          .insert({
            tenant_id: tenantId,
            gmail_message_id: msgId,
            gmail_thread_id: message.threadId,
            subject,
            sender_email: senderEmail,
            sender_name: senderName,
            received_at: date ? new Date(date).toISOString() : null,
            has_attachments: attachments.length > 0,
            attachment_count: attachments.length,
            processing_status: attachments.length > 0 ? "processing" : "no_attachments",
          })
          .select("id")
          .single();

        scannedCount++;

        if (!emailRecord || attachments.length === 0) continue;

        // Process each attachment
        for (const att of attachments) {
          try {
            // AI classification
            const classification = await classifyWithAI(
              att.filename,
              subject,
              `${senderName} <${senderEmail}>`,
              jobs || []
            );

            // Download attachment to storage
            const attachmentBytes = await getAttachmentData(accessToken, msgId, att.attachmentId);
            const storagePath = `${tenantId}/gmail/${msgId}/${att.filename}`;
            
            await supabaseAdmin.storage
              .from("documents")
              .upload(storagePath, attachmentBytes, {
                contentType: att.mimeType,
                upsert: true,
              });

            // Insert document record
            await supabaseAdmin.from("gmail_extracted_documents").insert({
              tenant_id: tenantId,
              scanned_email_id: emailRecord.id,
              file_name: att.filename,
              mime_type: att.mimeType,
              file_size_bytes: att.size,
              document_type: classification.document_type,
              ai_confidence: classification.confidence,
              ai_matched_job_id: classification.matched_job_id,
              ai_match_reason: classification.reason,
              ai_extracted_data: classification.extracted_data,
              storage_path: storagePath,
              status: classification.confidence >= 0.85 ? "auto_filed" : "pending",
            });

            newDocuments++;
          } catch (attErr) {
            console.error(`Error processing attachment ${att.filename}:`, attErr);
            // Still record the document but mark as error
            await supabaseAdmin.from("gmail_extracted_documents").insert({
              tenant_id: tenantId,
              scanned_email_id: emailRecord.id,
              file_name: att.filename,
              mime_type: att.mimeType,
              file_size_bytes: att.size,
              status: "error",
              ai_match_reason: attErr instanceof Error ? attErr.message : "Unknown error",
            });
          }
        }

        // Update email status
        await supabaseAdmin
          .from("gmail_scanned_emails")
          .update({ processing_status: "processed" })
          .eq("id", emailRecord.id);
      }

      // Update last scan time
      await supabaseAdmin.from("gmail_scan_settings").upsert({
        tenant_id: tenantId,
        last_scan_at: new Date().toISOString(),
      }, { onConflict: "tenant_id" });

      return new Response(JSON.stringify({ scanned: scannedCount, new_documents: newDocuments }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── GET DOCUMENTS (pending review) ───
    if (action === "get_documents") {
      const statusFilter = body.status || "pending";
      const limit = body.limit || 50;

      const { data: docs } = await supabaseAdmin
        .from("gmail_extracted_documents")
        .select(`
          *,
          gmail_scanned_emails!inner(subject, sender_email, sender_name, received_at)
        `)
        .eq("tenant_id", tenantId)
        .eq("status", statusFilter)
        .order("created_at", { ascending: false })
        .limit(limit);

      return new Response(JSON.stringify({ documents: docs || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── APPROVE / REJECT DOCUMENT ───
    if (action === "review_document") {
      const { document_id, decision, job_id } = body;
      if (!document_id || !decision) {
        return new Response(JSON.stringify({ error: "document_id and decision required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: Record<string, any> = {
        status: decision === "approve" ? "filed" : "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (job_id) updates.ai_matched_job_id = job_id;

      await supabaseAdmin
        .from("gmail_extracted_documents")
        .update(updates)
        .eq("id", document_id)
        .eq("tenant_id", tenantId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("scan-gmail error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
