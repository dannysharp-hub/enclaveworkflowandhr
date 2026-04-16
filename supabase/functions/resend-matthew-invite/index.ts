import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://www.cabinetrycommand.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const email = "matthewbruton8@gmail.com";

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (linkError) throw linkError;

    const rawLink = linkData?.properties?.action_link ?? "";
    let inviteUrl = `${SITE_URL}/login`;

    if (rawLink) {
      const parsed = new URL(rawLink);
      const token = parsed.searchParams.get("token");
      const type = parsed.searchParams.get("type") ?? "recovery";
      if (token) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const redirectTo = encodeURIComponent(`${SITE_URL}/login`);
        inviteUrl = `${supabaseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${redirectTo}`;
      }
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("email", email)
      .limit(1)
      .single();

    const userName = profile?.full_name || email;

    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        to: "danny@enclavecabinetry.com",
        subject: "Set Your Password — Cabinetry Command (Matthew Bruton)",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome to Cabinetry Command</h2>
            <p>An account has been created for <strong>${userName}</strong> (${email}).</p>
            <p><strong>Role:</strong> Supervisor | <strong>Department:</strong> Install</p>
            <p>Click the button below to set your password and get started:</p>
            <p style="margin: 24px 0;">
              <a href="${inviteUrl}" style="display: inline-block; padding: 14px 28px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Set Password &amp; Sign In</a>
            </p>
            <p style="font-size: 12px; color: #999;">Forward this email to Matthew when you're ready for him to set up his account.</p>
            <p style="font-size: 11px; color: #999; word-break: break-all;">Link: ${inviteUrl}</p>
          </div>
        `,
      }),
    });

    return new Response(JSON.stringify({ success: true, invite_url: inviteUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
