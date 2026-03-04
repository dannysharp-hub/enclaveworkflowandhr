import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

async function getValidAccessToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  tenantId: string
): Promise<string> {
  const { data: tokenRow } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (!tokenRow) throw new Error("No Google tokens found. Please reconnect.");

  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);

  // If token still valid (with 5min buffer), return it
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted);
  }

  // Refresh token
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const refreshToken = atob(tokenRow.refresh_token_encrypted);

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
  if (!res.ok) {
    // Token invalid - mark as needs_auth
    await supabaseAdmin
      .from("google_integration_settings")
      .update({ status: "needs_auth", last_error_message: data.error_description || data.error })
      .eq("tenant_id", tenantId);
    throw new Error("Token refresh failed: " + (data.error_description || data.error));
  }

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
  const supabaseWithAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claimsData, error: authErr } = await supabaseWithAuth.auth.getClaims(token);
  if (authErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const user = { id: claimsData.claims.sub as string };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!profile?.tenant_id) {
    return new Response(JSON.stringify({ error: "No tenant" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const accessToken = await getValidAccessToken(supabaseAdmin, profile.tenant_id);

    const calRes = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!calRes.ok) {
      const err = await calRes.json();
      throw new Error(`Google API error [${calRes.status}]: ${JSON.stringify(err)}`);
    }

    const calData = await calRes.json();
    const calendars = (calData.items || []).map((c: any) => ({
      id: c.id,
      summary: c.summary || c.id,
      description: c.description || "",
      primary: c.primary || false,
      accessRole: c.accessRole,
      backgroundColor: c.backgroundColor,
    }));

    return new Response(JSON.stringify({ calendars }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("google-calendar-list error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
