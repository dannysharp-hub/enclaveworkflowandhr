// v2 — added detailed logging for Resend debugging
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  console.log("[send-email] Function invoked, method:", req.method);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    console.log("[send-email] RESEND_API_KEY present:", !!RESEND_API_KEY);
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const body = await req.json();
    const { to, subject, html, replyTo } = body;
    console.log("[send-email] Sending to:", to, "| Subject:", subject, "| replyTo:", replyTo);

    if (!to || !subject || !html) {
      console.error("[send-email] Missing required fields", { to: !!to, subject: !!subject, html: !!html });
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: Record<string, unknown> = {
      from: "Enclave Cabinetry <noreply@enclavecabinetry.com>",
      to: [to],
      subject,
      html,
    };

    if (replyTo) {
      payload.reply_to = replyTo;
    }

    console.log("[send-email] Calling Resend API...");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log("[send-email] Resend response status:", res.status, "| body:", JSON.stringify(data));

    if (!res.ok) {
      console.error("[send-email] Resend error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: data.message || "Failed to send email" }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-email] Email sent successfully, id:", data.id);
    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-email] Unhandled error:", err.message, err.stack);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
