import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, date_choice } = await req.json();
    if (!token || !date_choice) {
      return new Response(JSON.stringify({ error: "Missing token or date_choice" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find job by install_date_token
    const { data: job, error: jobErr } = await supabase
      .from("cab_jobs")
      .select("id, job_ref, job_title, customer_id, company_id, install_date_option_1, install_date_option_2, install_date_option_3, install_date")
      .eq("install_date_token", token)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.install_date) {
      return new Response(JSON.stringify({ error: "Install date already confirmed", install_date: job.install_date }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick the date
    const dateMap: Record<string, string | null> = {
      "1": job.install_date_option_1,
      "2": job.install_date_option_2,
      "3": job.install_date_option_3,
    };
    const chosenDate = dateMap[String(date_choice)];
    if (!chosenDate) {
      return new Response(JSON.stringify({ error: "Invalid date choice" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update job
    await supabase.from("cab_jobs").update({
      install_date: chosenDate,
      current_stage_key: "install_booked",
      production_stage_key: "ready_for_install",
      state: "install_scheduled",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    // Insert event
    await supabase.from("cab_events").insert({
      company_id: job.company_id,
      event_type: "install.date_confirmed",
      job_id: job.id,
      payload_json: { date: chosenDate, choice: date_choice },
      status: "pending",
    });

    // Get customer for email
    const { data: customer } = await supabase
      .from("cab_customers")
      .select("first_name, last_name, email")
      .eq("id", job.customer_id)
      .single();

    const formattedDate = new Date(chosenDate + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Send confirmation email to customer
    if (customer?.email) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Enclave Cabinetry <noreply@enclavecabinetry.com>",
            to: [customer.email],
            reply_to: "danny@enclavecabinetry.com",
            subject: `Install Date Confirmed – ${job.job_ref}`,
            html: buildConfirmationEmail(customer.first_name, job.job_ref, job.job_title, formattedDate),
          }),
        });
      }
    }

    // Notify Danny
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Enclave Cabinetry <noreply@enclavecabinetry.com>",
          to: ["danny@enclavecabinetry.com"],
          subject: `✅ Install Confirmed: ${job.job_ref} – ${formattedDate}`,
          html: `<p>Install date confirmed for <strong>${job.job_ref}</strong> (${job.job_title}).</p>
                 <p><strong>Date:</strong> ${formattedDate}</p>
                 <p>Customer: ${customer?.first_name || ""} ${customer?.last_name || ""}</p>`,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, install_date: chosenDate, formatted: formattedDate }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("install-date-confirm error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildConfirmationEmail(firstName: string, jobRef: string, jobTitle: string, formattedDate: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <img src="https://enclaveworkflowandhr.lovable.app/ec-logo.png" alt="Enclave Cabinetry" height="40" style="height:40px;" />
  </td></tr>
  <tr><td style="padding:32px;">
    <h1 style="color:#1a1a2e;font-size:22px;margin:0 0 16px;">Install Date Confirmed ✅</h1>
    <p style="color:#333;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
    <p style="color:#333;font-size:15px;line-height:1.6;">Great news! Your installation date has been confirmed:</p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
      <p style="font-size:20px;font-weight:bold;color:#166534;margin:0;">${formattedDate}</p>
      <p style="font-size:14px;color:#166534;margin:8px 0 0;">Our team will arrive at 8:00 AM</p>
    </div>
    <p style="color:#333;font-size:15px;line-height:1.6;"><strong>Job:</strong> ${jobRef} – ${jobTitle}</p>
    <p style="color:#333;font-size:15px;line-height:1.6;">If you have any questions, please call us on <strong>07944 608098</strong>.</p>
    <p style="color:#333;font-size:15px;line-height:1.6;">Kind regards,<br/><strong>The Enclave Cabinetry Team</strong></p>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px;text-align:center;">
    <p style="color:#999;font-size:12px;margin:0;">Enclave Cabinetry | 07944 608098</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
