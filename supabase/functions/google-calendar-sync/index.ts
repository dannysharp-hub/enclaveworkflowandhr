import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface QueueItem {
  id: string;
  tenant_id: string;
  app_event_id: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
  action: string;
  attempts: number;
  max_attempts: number;
}

async function getValidAccessToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  tenantId: string
): Promise<string> {
  const { data: tokenRow } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (!tokenRow) throw new Error("NO_TOKENS");

  const now = new Date();
  const expiresAt = new Date(tokenRow.expires_at);

  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted);
  }

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
    await supabaseAdmin
      .from("google_integration_settings")
      .update({ status: "needs_auth", last_error_message: data.error_description })
      .eq("tenant_id", tenantId);
    throw new Error("TOKEN_REFRESH_FAILED");
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

function buildGoogleEvent(appEvent: any): Record<string, unknown> {
  const event: Record<string, unknown> = {
    summary: appEvent.title,
    description: appEvent.notes || appEvent.description || "",
    start: {},
    end: {},
  };

  // Use dateTime for timed events
  (event.start as any) = { dateTime: appEvent.start_datetime, timeZone: "UTC" };
  (event.end as any) = { dateTime: appEvent.end_datetime, timeZone: "UTC" };

  return event;
}

async function processItem(
  supabaseAdmin: ReturnType<typeof createClient>,
  item: QueueItem,
  accessToken: string
) {
  // Get the mapping to find which Google calendar to use
  let googleCalendarId = item.google_calendar_id;

  if (!googleCalendarId && item.app_event_id) {
    // Look up event type and find mapping
    const { data: appEvent } = await supabaseAdmin
      .from("calendar_events")
      .select("*")
      .eq("id", item.app_event_id)
      .single();

    if (!appEvent) {
      // Event was deleted, check for existing sync link
      if (item.action === "delete") {
        const { data: link } = await supabaseAdmin
          .from("calendar_sync_links")
          .select("*")
          .eq("app_event_id", item.app_event_id)
          .eq("tenant_id", item.tenant_id)
          .single();

        if (link?.google_event_id && link?.google_calendar_id) {
          // Delete from Google
          const delRes = await fetch(
            `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(link.google_calendar_id)}/events/${link.google_event_id}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (delRes.ok || delRes.status === 410) {
            await supabaseAdmin.from("calendar_sync_links").delete().eq("id", link.id);
          }
        }
        return;
      }
      throw new Error("App event not found");
    }

    // Map event_type to calendar
    const eventType = appEvent.event_type?.toLowerCase() || "production";
    const { data: mapping } = await supabaseAdmin
      .from("google_calendar_mappings")
      .select("google_calendar_id")
      .eq("tenant_id", item.tenant_id)
      .eq("event_type", eventType)
      .eq("enabled", true)
      .single();

    if (!mapping) {
      // No mapping for this event type - skip silently
      return;
    }
    googleCalendarId = mapping.google_calendar_id;

    // Check for existing sync link
    const { data: existingLink } = await supabaseAdmin
      .from("calendar_sync_links")
      .select("*")
      .eq("app_event_id", item.app_event_id)
      .eq("tenant_id", item.tenant_id)
      .single();

    const googleEvent = buildGoogleEvent(appEvent);

    if (item.action === "create" && !existingLink?.google_event_id) {
      // Create event in Google
      const createRes = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(googleCalendarId)}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(googleEvent),
        }
      );

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(`Google create failed [${createRes.status}]: ${JSON.stringify(err)}`);
      }

      const created = await createRes.json();

      // Create or update sync link
      if (existingLink) {
        await supabaseAdmin
          .from("calendar_sync_links")
          .update({
            google_event_id: created.id,
            google_etag: created.etag,
            google_calendar_id: googleCalendarId,
            sync_status: "synced",
            last_synced_at: new Date().toISOString(),
            direction_last_sync: "app_to_google",
          })
          .eq("id", existingLink.id);
      } else {
        await supabaseAdmin.from("calendar_sync_links").insert({
          tenant_id: item.tenant_id,
          app_event_id: item.app_event_id!,
          google_calendar_id: googleCalendarId,
          google_event_id: created.id,
          google_etag: created.etag,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
          direction_last_sync: "app_to_google",
        });
      }

      // Audit
      await supabaseAdmin.from("calendar_sync_audit").insert({
        tenant_id: item.tenant_id,
        action: "created_google_event",
        app_event_id: item.app_event_id,
        google_event_id: created.id,
        payload_after_json: googleEvent,
      });
    } else if (item.action === "update" && existingLink?.google_event_id) {
      // Update event in Google
      const updateRes = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(existingLink.google_calendar_id)}/events/${existingLink.google_event_id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(googleEvent),
        }
      );

      if (!updateRes.ok) {
        const err = await updateRes.json();
        throw new Error(`Google update failed [${updateRes.status}]: ${JSON.stringify(err)}`);
      }

      const updated = await updateRes.json();

      await supabaseAdmin
        .from("calendar_sync_links")
        .update({
          google_etag: updated.etag,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", existingLink.id);

      await supabaseAdmin.from("calendar_sync_audit").insert({
        tenant_id: item.tenant_id,
        action: "updated_google_event",
        app_event_id: item.app_event_id,
        google_event_id: existingLink.google_event_id,
        payload_before_json: { etag: existingLink.google_etag },
        payload_after_json: googleEvent,
      });
    } else if (item.action === "create" && existingLink?.google_event_id) {
      // Already exists - convert to update
      item.action = "update";
      // Recurse with update action
      await processItem(supabaseAdmin, { ...item, action: "update" }, accessToken);
      return;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // This can be called by cron or by admin manually
  const authHeader = req.headers.get("Authorization");
  let callerTenantId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const supabaseWithAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData } = await supabaseWithAuth.auth.getClaims(token);
    if (claimsData?.claims?.sub) {
      const userId = claimsData.claims.sub as string;
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .single();
      callerTenantId = profile?.tenant_id || null;
    }
  }

  try {
    // Fetch queued items (for specific tenant if called by user, or all if cron)
    let query = supabaseAdmin
      .from("calendar_sync_queue")
      .select("*")
      .eq("status", "queued")
      .lte("run_after", new Date().toISOString())
      .order("created_at")
      .limit(50);

    if (callerTenantId) {
      query = query.eq("tenant_id", callerTenantId);
    }

    const { data: items } = await query;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by tenant
    const byTenant = new Map<string, QueueItem[]>();
    for (const item of items) {
      const list = byTenant.get(item.tenant_id) || [];
      list.push(item as QueueItem);
      byTenant.set(item.tenant_id, list);
    }

    let processed = 0;
    let failed = 0;

    for (const [tenantId, tenantItems] of byTenant) {
      // Check if tenant is connected
      const { data: settings } = await supabaseAdmin
        .from("google_integration_settings")
        .select("is_connected")
        .eq("tenant_id", tenantId)
        .single();

      if (!settings?.is_connected) {
        // Mark all as failed
        for (const item of tenantItems) {
          await supabaseAdmin
            .from("calendar_sync_queue")
            .update({ status: "failed", last_error: "Google not connected" })
            .eq("id", item.id);
        }
        continue;
      }

      let accessToken: string;
      try {
        accessToken = await getValidAccessToken(supabaseAdmin, tenantId);
      } catch (err) {
        for (const item of tenantItems) {
          await supabaseAdmin
            .from("calendar_sync_queue")
            .update({
              status: item.attempts + 1 >= item.max_attempts ? "failed" : "queued",
              attempts: item.attempts + 1,
              last_error: err instanceof Error ? err.message : "Token error",
              run_after: new Date(Date.now() + Math.pow(2, item.attempts + 1) * 1000).toISOString(),
            })
            .eq("id", item.id);
        }
        continue;
      }

      for (const item of tenantItems) {
        // Mark as processing
        await supabaseAdmin
          .from("calendar_sync_queue")
          .update({ status: "processing" })
          .eq("id", item.id);

        try {
          await processItem(supabaseAdmin, item, accessToken);

          await supabaseAdmin
            .from("calendar_sync_queue")
            .update({ status: "done" })
            .eq("id", item.id);
          processed++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          const newAttempts = item.attempts + 1;
          const isFinal = newAttempts >= item.max_attempts;

          // Exponential backoff
          const backoffMs = Math.min(Math.pow(2, newAttempts) * 1000, 3600000);

          await supabaseAdmin
            .from("calendar_sync_queue")
            .update({
              status: isFinal ? "failed" : "queued",
              attempts: newAttempts,
              last_error: errMsg,
              run_after: new Date(Date.now() + backoffMs).toISOString(),
            })
            .eq("id", item.id);

          // Update sync link error
          if (item.app_event_id) {
            await supabaseAdmin
              .from("calendar_sync_links")
              .update({ sync_status: "error", error_message: errMsg })
              .eq("app_event_id", item.app_event_id)
              .eq("tenant_id", tenantId);
          }

          failed++;
        }
      }

      // Update health
      await supabaseAdmin
        .from("google_integration_settings")
        .update({
          last_health_check_at: new Date().toISOString(),
          status: failed > 0 ? "error" : "healthy",
          last_error_message: failed > 0 ? `${failed} sync items failed` : null,
        })
        .eq("tenant_id", tenantId);
    }

    return new Response(
      JSON.stringify({ processed, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("google-calendar-sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
