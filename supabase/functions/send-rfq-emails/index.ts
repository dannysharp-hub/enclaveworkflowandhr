import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Get valid Google access token (refresh if needed) ───
async function getAccessToken(supabaseAdmin: any, tenantId: string): Promise<string | null> {
  const { data: tokenRow } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (!tokenRow) return null;

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
  if (!res.ok) return null;

  await supabaseAdmin.from("google_oauth_tokens").update({
    access_token_encrypted: btoa(data.access_token),
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    token_version: tokenRow.token_version + 1,
  }).eq("id", tokenRow.id);

  return data.access_token;
}

// ─── Build RFC 2822 email with attachments ───
function buildMimeEmail(opts: {
  from: string;
  fromName?: string;
  to: string;
  cc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText: string;
}): string {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, "")}`;
  const fromHeader = opts.fromName ? `"${opts.fromName}" <${opts.from}>` : opts.from;

  let headers = [
    `From: ${fromHeader}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (opts.cc && opts.cc.length > 0) {
    headers.push(`Cc: ${opts.cc.join(", ")}`);
  }

  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    opts.bodyText,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    opts.bodyHtml,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  return headers.join("\r\n") + "\r\n\r\n" + body;
}

// ─── Send via Gmail API ───
async function sendViaGmail(accessToken: string, rawEmail: string): Promise<{ messageId: string }> {
  // Gmail API requires base64url encoding
  const encoded = btoa(rawEmail)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gmail API error: ${data.error?.message || JSON.stringify(data)}`);
  }

  return { messageId: data.id };
}

// ─── Detect if RFQ is spray-specific ───
function isSprayRfq(lines: any[], supplierGroup: string | null): boolean {
  if (supplierGroup === "spray_shop") return true;
  return lines.every(l => l.category === "paint_spray_subcontract" || l.spec_json?.is_spray_required);
}

// ─── Build Spray RFQ email content ───
function buildSprayRfqEmail(opts: {
  rfqNumber: string; jobNumber: string; jobName: string; supplierName: string;
  requiredByDate: string | null; deliveryAddress: string | null;
  lines: any[]; notes: string | null; fromName: string; fromEmail: string;
}): { subject: string; bodyHtml: string; bodyText: string } {
  const subject = `Spray RFQ – ${opts.jobNumber} – ${opts.jobName} – Spray Finish Quote Request`;

  const linesText = opts.lines.map(l => {
    const spec = l.spec_json || {};
    const spraySpec = l.spray_spec_json || spec;
    return `  ${l.item_name || l.material_key} | ${spraySpec.colour_name || l.colour_name || "TBC"} | ${spraySpec.finish_type || "Satin"} | ${spec.material_type || spec.thickness_mm ? spec.thickness_mm + "mm" : "—"} | ${spec.length_mm || "—"}×${spec.width_mm || "—"}mm | Qty: ${l.quantity_sheets || l.quantity || 1}`;
  }).join("\n");

  const linesHtml = opts.lines.map(l => {
    const spec = l.spec_json || {};
    const spraySpec = l.spray_spec_json || spec;
    return `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${l.item_name || l.material_key}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;">${spraySpec.colour_name || l.colour_name || "TBC"}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${spraySpec.finish_type || "Satin"}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${spec.material_type || (spec.thickness_mm ? spec.thickness_mm + "mm MDF" : "MDF")}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${spec.length_mm || "—"} × ${spec.width_mm || "—"}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${l.quantity_sheets || l.quantity || 1}</td>
    </tr>`;
  }).join("");

  const requiredBy = opts.requiredByDate ? `Required by: ${opts.requiredByDate}` : "";
  const delivery = opts.deliveryAddress ? `Collection/Delivery: ${opts.deliveryAddress}` : "";

  const bodyText = `Dear ${opts.supplierName},

We would like to request a spray/paint finish quotation for the following items for ${opts.rfqNumber} (Job: ${opts.jobNumber} – ${opts.jobName}).

${requiredBy}
${delivery}

Spray Items:
${linesText}

${opts.notes ? `Special Instructions / Masking Notes: ${opts.notes}` : ""}

Please reply with:
- Price per piece and total (ex VAT)
- Lead time (working days)
- Collection/delivery arrangements
- Any masking or prep requirements from our end

Kind regards,
${opts.fromName}
${opts.fromEmail}`;

  const bodyHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;color:#1a1a2e;">
  <div style="padding:24px 0;border-bottom:2px solid #7c3aed;">
    <h2 style="margin:0;font-size:18px;font-weight:700;color:#7c3aed;">🎨 ${opts.rfqNumber} — Spray Finish Quote Request</h2>
    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Job: ${opts.jobNumber} — ${opts.jobName}</p>
  </div>

  <div style="padding:20px 0;">
    <p style="font-size:14px;margin:0 0 16px;">Dear ${opts.supplierName},</p>
    <p style="font-size:14px;margin:0 0 16px;">We would like to request a <strong>spray/paint finish quotation</strong> for the following items:</p>

    ${requiredBy ? `<p style="font-size:13px;margin:0 0 8px;"><strong>Required by:</strong> ${opts.requiredByDate}</p>` : ""}
    ${delivery ? `<p style="font-size:13px;margin:0 0 16px;"><strong>Collection/Delivery:</strong> ${opts.deliveryAddress}</p>` : ""}

    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#f5f3ff;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#7c3aed;border-bottom:2px solid #ddd8fe;">Item</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#7c3aed;border-bottom:2px solid #ddd8fe;">Colour</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#7c3aed;border-bottom:2px solid #ddd8fe;">Finish</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#7c3aed;border-bottom:2px solid #ddd8fe;">Substrate</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#7c3aed;border-bottom:2px solid #ddd8fe;">Dimensions (mm)</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#7c3aed;border-bottom:2px solid #ddd8fe;">Qty</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>

    ${opts.notes ? `<div style="margin:16px 0;padding:12px;background:#fef3c7;border-radius:6px;border-left:4px solid #f59e0b;"><p style="font-size:13px;margin:0;"><strong>⚠ Special Instructions / Masking Notes:</strong><br>${opts.notes}</p></div>` : ""}

    <div style="margin:24px 0;padding:16px;background:#f5f3ff;border-radius:6px;border:1px solid #ddd8fe;">
      <p style="font-size:13px;margin:0;font-weight:600;color:#7c3aed;">Please reply with:</p>
      <ul style="font-size:13px;margin:8px 0 0;padding-left:20px;">
        <li>Price per piece and total (ex VAT)</li>
        <li>Lead time (working days)</li>
        <li>Collection/delivery arrangements</li>
        <li>Any masking or prep requirements from our end</li>
      </ul>
    </div>
  </div>

  <div style="padding:16px 0;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
    <p style="margin:0;">Kind regards,<br><strong>${opts.fromName}</strong><br>${opts.fromEmail}</p>
  </div>
</div>`;

  return { subject, bodyHtml, bodyText };
}

// ─── Build standard RFQ email content ───
function buildRfqEmail(opts: {
  rfqNumber: string; jobNumber: string; jobName: string; supplierName: string;
  requiredByDate: string | null; deliveryAddress: string | null;
  lines: any[]; notes: string | null; fromName: string; fromEmail: string;
}): { subject: string; bodyHtml: string; bodyText: string } {
  const subject = `RFQ – ${opts.jobNumber} – ${opts.jobName} – Materials Quote Request`;

  const linesText = opts.lines.map(l =>
    `  ${l.material_key} | ${l.colour_name || "—"} | ${l.thickness_mm}mm | ${l.sheet_size_key} | Qty: ${l.quantity_sheets}`
  ).join("\n");

  const linesHtml = opts.lines.map(l =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${l.material_key}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${l.colour_name || "—"}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${l.thickness_mm}mm</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${l.sheet_size_key}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${l.quantity_sheets}</td>
    </tr>`
  ).join("");

  const requiredBy = opts.requiredByDate ? `Required by: ${opts.requiredByDate}` : "";
  const delivery = opts.deliveryAddress ? `Delivery to: ${opts.deliveryAddress}` : "";

  const bodyText = `Dear ${opts.supplierName},

We would like to request a quotation for the following materials for ${opts.rfqNumber} (Job: ${opts.jobNumber} – ${opts.jobName}).

${requiredBy}
${delivery}

Materials Required:
${linesText}

${opts.notes ? `Notes: ${opts.notes}` : ""}

Please reply with:
- Price (ex VAT)
- Lead time (working days)
- Delivery options
- Quote validity period

Kind regards,
${opts.fromName}
${opts.fromEmail}`;

  const bodyHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px;margin:0 auto;color:#1a1a2e;">
  <div style="padding:24px 0;border-bottom:2px solid #1a1a2e;">
    <h2 style="margin:0;font-size:18px;font-weight:700;">${opts.rfqNumber} — Materials Quote Request</h2>
    <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Job: ${opts.jobNumber} — ${opts.jobName}</p>
  </div>

  <div style="padding:20px 0;">
    <p style="font-size:14px;margin:0 0 16px;">Dear ${opts.supplierName},</p>
    <p style="font-size:14px;margin:0 0 16px;">We would like to request a quotation for the following materials:</p>

    ${requiredBy ? `<p style="font-size:13px;margin:0 0 8px;"><strong>Required by:</strong> ${opts.requiredByDate}</p>` : ""}
    ${delivery ? `<p style="font-size:13px;margin:0 0 16px;"><strong>Delivery to:</strong> ${opts.deliveryAddress}</p>` : ""}

    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Material</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Colour</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Thickness</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Sheet Size</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Qty</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>

    ${opts.notes ? `<p style="font-size:13px;margin:16px 0;padding:12px;background:#fef3c7;border-radius:6px;"><strong>Notes:</strong> ${opts.notes}</p>` : ""}

    <div style="margin:24px 0;padding:16px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;">
      <p style="font-size:13px;margin:0;font-weight:600;">Please reply with:</p>
      <ul style="font-size:13px;margin:8px 0 0;padding-left:20px;">
        <li>Price (ex VAT)</li>
        <li>Lead time (working days)</li>
        <li>Delivery options</li>
        <li>Quote validity period</li>
      </ul>
    </div>
  </div>

  <div style="padding:16px 0;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
    <p style="margin:0;">Kind regards,<br><strong>${opts.fromName}</strong><br>${opts.fromEmail}</p>
  </div>
</div>`;

  return { subject, bodyHtml, bodyText };
}

// ─── Main handler ───
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
    .from("profiles").select("tenant_id, full_name, email").eq("user_id", user.id).single();
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
  if (!["admin", "office", "supervisor"].includes(userRole)) {
    return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { rfq_id } = body;

    if (!rfq_id) {
      return new Response(JSON.stringify({ error: "rfq_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load RFQ + job + settings
    const [{ data: rfq }, { data: lines }, { data: recipients }, { data: settings }] = await Promise.all([
      supabaseAdmin.from("rfq_requests").select("*, jobs(job_id, job_name)").eq("id", rfq_id).eq("tenant_id", tenantId).single(),
      supabaseAdmin.from("rfq_line_items").select("*").eq("rfq_id", rfq_id).order("created_at"),
      supabaseAdmin.from("rfq_recipients").select("*, suppliers(name, rfq_email, email)").eq("rfq_id", rfq_id).eq("send_status", "pending"),
      supabaseAdmin.from("purchasing_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    ]);

    if (!rfq) {
      return new Response(JSON.stringify({ error: "RFQ not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No pending recipients to send to" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fromName = settings?.from_display_name || profile.full_name || "Purchasing";
    const fromEmail = settings?.from_email || profile.email || user.email || "";
    const ccEmails: string[] = settings?.cc_internal_emails || [];
    const emailProvider = settings?.email_provider || "google";

    // Get access token for Google
    let accessToken: string | null = null;
    if (emailProvider === "google") {
      accessToken = await getAccessToken(supabaseAdmin, tenantId);
      if (!accessToken) {
        return new Response(JSON.stringify({ error: "Google not connected. Connect Google Workspace in Settings → Integrations first." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const results: { supplier: string; status: string; error?: string }[] = [];

    for (const recipient of recipients) {
      const supplierEmail = recipient.suppliers?.rfq_email || recipient.suppliers?.email;
      const supplierName = recipient.suppliers?.name || "Supplier";

      if (!supplierEmail) {
        await supabaseAdmin.from("rfq_recipients").update({
          send_status: "failed",
          last_error: "No email address configured for supplier",
        }).eq("id", recipient.id);
        results.push({ supplier: supplierName, status: "failed", error: "No email address" });
        continue;
      }

      try {
        // Choose spray or standard template
        const useSprayTemplate = isSprayRfq(lines || [], rfq.supplier_group);
        const buildFn = useSprayTemplate ? buildSprayRfqEmail : buildRfqEmail;
        const { subject, bodyHtml, bodyText } = buildFn({
          rfqNumber: rfq.rfq_number,
          jobNumber: rfq.jobs?.job_id || "—",
          jobName: rfq.jobs?.job_name || "—",
          supplierName,
          requiredByDate: rfq.required_by_date,
          deliveryAddress: rfq.delivery_address_text,
          lines: lines || [],
          notes: rfq.notes,
          fromName,
          fromEmail,
        });

        let messageId = "";

        if (emailProvider === "google" && accessToken) {
          const rawEmail = buildMimeEmail({
            from: fromEmail,
            fromName,
            to: supplierEmail,
            cc: ccEmails.length > 0 ? ccEmails : undefined,
            subject,
            bodyHtml,
            bodyText,
          });
          const result = await sendViaGmail(accessToken, rawEmail);
          messageId = result.messageId;
        } else {
          // SMTP fallback — not yet implemented, mark as failed with helpful message
          throw new Error("SMTP sending not yet configured. Use Google email provider.");
        }

        // Update recipient
        await supabaseAdmin.from("rfq_recipients").update({
          send_status: "sent",
          sent_at: new Date().toISOString(),
          email_message_id: messageId,
          last_error: null,
        }).eq("id", recipient.id);

        results.push({ supplier: supplierName, status: "sent" });
      } catch (err: any) {
        await supabaseAdmin.from("rfq_recipients").update({
          send_status: "failed",
          last_error: err.message,
        }).eq("id", recipient.id);
        results.push({ supplier: supplierName, status: "failed", error: err.message });
      }
    }

    // Update RFQ status
    const anySuccess = results.some(r => r.status === "sent");
    if (anySuccess) {
      await supabaseAdmin.from("rfq_requests").update({
        status: "sent",
      }).eq("id", rfq_id);
    }

    return new Response(JSON.stringify({
      success: true,
      sent: results.filter(r => r.status === "sent").length,
      failed: results.filter(r => r.status === "failed").length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-rfq-emails error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
