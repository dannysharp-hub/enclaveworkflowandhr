import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
// Identity-only scopes for initial Google Account connection.
// Additional scopes (Drive, Calendar) are requested incrementally when those features are enabled.
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Authenticate caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get tenant_id
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
  const tenantId = profile.tenant_id;

  // Check role
  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!roleData || roleData.role !== "admin") {
    return new Response(JSON.stringify({ error: "Admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return new Response(
      JSON.stringify({
        error: "Google OAuth credentials not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  try {
    // ─── INITIATE: generate OAuth URL ───
    if (action === "initiate") {
      const redirectUri = body.redirect_uri as string;
      if (!redirectUri) {
        return new Response(JSON.stringify({ error: "redirect_uri required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const state = btoa(JSON.stringify({ tenant_id: tenantId }));
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state,
      });
      const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;

      return new Response(JSON.stringify({ url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── CALLBACK: exchange code for tokens ───
    if (action === "callback") {
      const code = body.code as string;
      const redirectUri = body.redirect_uri as string;
      if (!code || !redirectUri) {
        return new Response(JSON.stringify({ error: "code and redirect_uri required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Exchange code for tokens
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        console.error("Token exchange error:", tokenData);
        return new Response(
          JSON.stringify({ error: "Token exchange failed", detail: tokenData.error_description || tokenData.error }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { access_token, refresh_token, expires_in } = tokenData;
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

      // Get Google user info
      const userRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const googleUser = await userRes.json();

      // Store tokens (upsert) - using simple base64 encoding as basic obfuscation
      // In production, use pgsodium encrypt/decrypt
      const encAccessToken = btoa(access_token);
      const encRefreshToken = btoa(refresh_token || "");

      // Upsert token record
      const { data: existingToken } = await supabaseAdmin
        .from("google_oauth_tokens")
        .select("id, token_version")
        .eq("tenant_id", tenantId)
        .single();

      if (existingToken) {
        await supabaseAdmin
          .from("google_oauth_tokens")
          .update({
            access_token_encrypted: encAccessToken,
            refresh_token_encrypted: encRefreshToken,
            expires_at: expiresAt,
            token_version: existingToken.token_version + 1,
          })
          .eq("id", existingToken.id);
      } else {
        await supabaseAdmin.from("google_oauth_tokens").insert({
          tenant_id: tenantId,
          access_token_encrypted: encAccessToken,
          refresh_token_encrypted: encRefreshToken,
          expires_at: expiresAt,
        });
      }

      // Upsert integration settings
      await supabaseAdmin.from("google_integration_settings").upsert(
        {
          tenant_id: tenantId,
          is_connected: true,
          google_user_email: googleUser.email || null,
          google_user_id: googleUser.sub || null,
          granted_scopes: SCOPES.split(" "),
          status: "healthy",
          last_health_check_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      );

      // Audit log
      await supabaseAdmin.from("calendar_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "google_connected",
        payload_after_json: { email: googleUser.email },
      });

      return new Response(
        JSON.stringify({ success: true, email: googleUser.email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── DISCONNECT ───
    if (action === "disconnect") {
      // Delete tokens
      await supabaseAdmin
        .from("google_oauth_tokens")
        .delete()
        .eq("tenant_id", tenantId);

      // Update settings
      await supabaseAdmin
        .from("google_integration_settings")
        .update({
          is_connected: false,
          status: "disconnected",
          google_user_email: null,
          google_user_id: null,
        })
        .eq("tenant_id", tenantId);

      // Delete mappings
      await supabaseAdmin
        .from("google_calendar_mappings")
        .delete()
        .eq("tenant_id", tenantId);

      // Audit
      await supabaseAdmin.from("calendar_sync_audit").insert({
        tenant_id: tenantId,
        actor_staff_id: user.id,
        action: "google_disconnected",
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── STATUS: health check ───
    if (action === "status") {
      const { data: settings } = await supabaseAdmin
        .from("google_integration_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .single();

      const { count: queueCount } = await supabaseAdmin
        .from("calendar_sync_queue")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "queued");

      return new Response(
        JSON.stringify({
          settings: settings || { is_connected: false, status: "disconnected" },
          queue_count: queueCount || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── UPDATE SETTINGS ───
    if (action === "update_settings") {
      const updates: Record<string, unknown> = {};
      if (body.sync_mode) updates.sync_mode = body.sync_mode;
      if (body.conflict_policy) updates.conflict_policy = body.conflict_policy;
      if (body.default_timezone) updates.default_timezone = body.default_timezone;

      if (Object.keys(updates).length > 0) {
        await supabaseAdmin
          .from("google_integration_settings")
          .update(updates)
          .eq("tenant_id", tenantId);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("google-calendar-auth error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
