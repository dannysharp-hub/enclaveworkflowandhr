import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOGO_URL = "https://taftcuryslgdkstzqrcy.supabase.co/storage/v1/object/public/assets/ec-logo.png";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    const { job_id } = await req.json();
    if (!job_id) throw new Error("job_id required");

    console.log("[generate-completion-certificate] Starting for job:", job_id);

    // Fetch job
    const { data: job, error: jobErr } = await supabase
      .from("cab_jobs")
      .select("id, job_ref, job_title, customer_id, company_id, contract_value, contract_currency, room_type, property_address_json, fitter_signature_url, fitter_signed_by, fitter_signed_at, fitter_checklist_json, sign_off_signature_url, sign_off_completed_at, drive_folder_id")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) throw new Error("Job not found: " + (jobErr?.message || ""));

    // Fetch customer
    const { data: customer } = await supabase
      .from("cab_customers")
      .select("first_name, last_name, email, address_line_1, address_line_2, city, postcode")
      .eq("id", job.customer_id)
      .single();

    const customerName = customer ? `${customer.first_name} ${customer.last_name}` : "Customer";
    const address = job.property_address_json
      ? [job.property_address_json.line1, job.property_address_json.line2, job.property_address_json.city, job.property_address_json.postcode].filter(Boolean).join(", ")
      : customer ? [customer.address_line_1, customer.address_line_2, customer.city, customer.postcode].filter(Boolean).join(", ") : "";

    const contractValue = job.contract_value || 0;
    const fmtGBP = (v: number) => `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const snagging = job.fitter_checklist_json?.snagging || null;
    const completionDate = job.sign_off_completed_at ? new Date(job.sign_off_completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const fitterDate = job.fitter_signed_at ? new Date(job.fitter_signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) + " " + new Date(job.fitter_signed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

    // Build certificate HTML
    const certHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  body { font-family: 'Georgia', serif; margin: 0; padding: 0; background: #fff; color: #1B2A4A; }
  .header { background: #1B2A4A; padding: 40px; text-align: center; }
  .header img { height: 60px; }
  .gold-bar { height: 4px; background: #C9A96E; }
  .content { padding: 48px 60px; }
  .title { font-size: 28px; color: #1B2A4A; text-align: center; margin: 0 0 8px; font-weight: bold; }
  .subtitle { font-size: 14px; color: #C9A96E; text-align: center; margin: 0 0 40px; letter-spacing: 2px; text-transform: uppercase; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 32px; }
  .detail-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
  .detail-value { font-size: 14px; color: #1B2A4A; font-weight: 600; }
  .confirmation { background: #f8f7f4; border-left: 4px solid #C9A96E; padding: 20px; margin: 32px 0; font-size: 14px; line-height: 1.6; }
  .sig-section { display: flex; gap: 40px; margin-top: 40px; }
  .sig-box { flex: 1; }
  .sig-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .sig-img { max-height: 60px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .sig-name { font-size: 13px; font-weight: 600; margin-top: 4px; }
  .sig-date { font-size: 11px; color: #666; }
  .snagging { margin-top: 32px; }
  .snagging h3 { font-size: 13px; color: #C9A96E; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px; }
  .snagging p { font-size: 13px; color: #333; line-height: 1.5; }
  .payment-table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
  .payment-table td { padding: 8px 0; border-bottom: 1px solid #eee; }
  .payment-table .total td { border-top: 2px solid #C9A96E; border-bottom: none; font-weight: bold; }
  .footer { background: #1B2A4A; padding: 20px; text-align: center; color: #C9A96E; font-size: 11px; margin-top: 40px; }
</style></head>
<body>
  <div class="header">
    <img src="${LOGO_URL}" alt="Enclave Cabinetry" />
  </div>
  <div class="gold-bar"></div>
  <div class="content">
    <h1 class="title">Installation Completion Certificate</h1>
    <p class="subtitle">Enclave Cabinetry</p>

    <div class="detail-grid">
      <div><div class="detail-label">Customer</div><div class="detail-value">${customerName}</div></div>
      <div><div class="detail-label">Job Reference</div><div class="detail-value">${job.job_ref}</div></div>
      <div><div class="detail-label">Project</div><div class="detail-value">${job.job_title}</div></div>
      ${job.room_type ? `<div><div class="detail-label">Room Type</div><div class="detail-value">${job.room_type}</div></div>` : ""}
      ${address ? `<div><div class="detail-label">Address</div><div class="detail-value">${address}</div></div>` : ""}
      <div><div class="detail-label">Completion Date</div><div class="detail-value">${completionDate}</div></div>
    </div>

    <div class="confirmation">
      I confirm that the installation has been completed to my satisfaction.
    </div>

    <div class="sig-section">
      <div class="sig-box">
        <div class="sig-label">Installer Signature</div>
        ${job.fitter_signature_url ? `<img src="${job.fitter_signature_url}" class="sig-img" />` : "<p>—</p>"}
        <div class="sig-name">${job.fitter_signed_by || "—"}</div>
        <div class="sig-date">${fitterDate}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">Customer Signature</div>
        ${job.sign_off_signature_url ? `<img src="${job.sign_off_signature_url}" class="sig-img" />` : "<p>—</p>"}
        <div class="sig-name">${customerName}</div>
        <div class="sig-date">${completionDate}</div>
      </div>
    </div>

    ${snagging ? `
    <div class="snagging">
      <h3>Installer Notes</h3>
      <p>${snagging}</p>
    </div>` : ""}

    ${contractValue > 0 ? `
    <table class="payment-table">
      <tr><td>50% Deposit</td><td style="text-align:right">${fmtGBP(contractValue * 0.5)}</td></tr>
      <tr><td>40% Progress Payment</td><td style="text-align:right">${fmtGBP(contractValue * 0.4)}</td></tr>
      <tr><td>10% Final Balance</td><td style="text-align:right">${fmtGBP(contractValue * 0.1)}</td></tr>
      <tr class="total"><td>Total Contract Value</td><td style="text-align:right">${fmtGBP(contractValue)}</td></tr>
    </table>` : ""}
  </div>
  <div class="footer">Enclave Cabinetry · 07944 608098 · info@enclavecabinetry.com</div>
</body></html>`;

    // Store certificate HTML as a file in storage (clients can view as HTML)
    const certPath = `${job.id}/Completion_Certificate_${job.job_ref}.html`;
    await supabase.storage.from("install-signoffs").upload(certPath, new Blob([certHtml], { type: "text/html" }), {
      contentType: "text/html",
      upsert: true,
    });
    const { data: certUrlData } = supabase.storage.from("install-signoffs").getPublicUrl(certPath);
    const certificateUrl = certUrlData.publicUrl;

    // Update job record
    await supabase.from("cab_jobs").update({
      completion_certificate_url: certificateUrl,
      final_signoff_url: certificateUrl,
      updated_at: new Date().toISOString(),
    } as any).eq("id", job.id);

    // Upload to Drive if linked
    if (job.drive_folder_id) {
      try {
        const { data: gSettings } = await supabase
          .from("google_integration_settings")
          .select("access_token, refresh_token")
          .limit(1)
          .single();

        if (gSettings?.access_token) {
          // Refresh token first
          const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
          const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
          
          let accessToken = gSettings.access_token;
          if (gSettings.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
            const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: gSettings.refresh_token,
                grant_type: "refresh_token",
              }),
            });
            const tokenData = await tokenResp.json();
            if (tokenData.access_token) accessToken = tokenData.access_token;
          }

          // Upload HTML to Drive
          const metadata = {
            name: `Completion_Certificate_${job.job_ref}.html`,
            parents: [job.drive_folder_id],
            mimeType: "text/html",
          };

          const boundary = "cert_boundary";
          const multipartBody = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/html\r\n\r\n${certHtml}\r\n--${boundary}--`;

          await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody,
          });
          console.log("[generate-completion-certificate] Uploaded to Drive");
        }
      } catch (driveErr) {
        console.warn("[generate-completion-certificate] Drive upload failed (non-blocking):", driveErr);
      }
    }

    // Send certificate email to customer
    if (customer?.email && resendKey) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: #1B2A4A; padding: 24px; text-align: center;">
            <img src="${LOGO_URL}" alt="Enclave Cabinetry" style="height: 48px;" />
          </div>
          <div style="padding: 32px 24px;">
            <h2 style="color: #1B2A4A; margin: 0 0 16px;">Your Completion Certificate</h2>
            <p style="color: #333; line-height: 1.6;">Hi ${customer.first_name},</p>
            <p style="color: #333; line-height: 1.6;">Thank you for choosing Enclave Cabinetry. Your installation has been signed off and your completion certificate is ready.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${certificateUrl}" style="background: #C9A96E; color: #1B2A4A; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 16px;">
                View Certificate
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">It has been a pleasure working with you. If you need anything in the future, please don't hesitate to get in touch.</p>
            <p style="color: #333;">Kind regards,<br/><strong>Enclave Cabinetry</strong></p>
          </div>
          <div style="background: #1B2A4A; padding: 16px; text-align: center;">
            <p style="color: #C9A96E; font-size: 12px; margin: 0;">Enclave Cabinetry · 07944 608098 · info@enclavecabinetry.com</p>
          </div>
        </div>`;

      // Send to customer
      await supabase.functions.invoke("send-email", {
        body: {
          to: customer.email,
          subject: `Your Enclave Cabinetry Completion Certificate — ${job.job_ref}`,
          replyTo: "info@enclavecabinetry.com",
          html: emailHtml,
        },
      });

      // Send copy to info@
      await supabase.functions.invoke("send-email", {
        body: {
          to: "info@enclavecabinetry.com",
          subject: `Completion Certificate — ${job.job_ref} — ${customerName}`,
          html: emailHtml,
        },
      });
    }

    // Fire GHL event
    await supabase.from("cab_events").insert({
      company_id: job.company_id,
      event_type: "job.completed",
      job_id: job.id,
      payload_json: { certificate_url: certificateUrl, customer_name: customerName },
      status: "pending",
    } as any);

    console.log("[generate-completion-certificate] Complete for", job.job_ref);

    return new Response(JSON.stringify({ success: true, certificate_url: certificateUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[generate-completion-certificate] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
