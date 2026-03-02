import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-goog-channel-id, x-goog-channel-token, x-goog-resource-id, x-goog-resource-state, x-goog-resource-uri, x-goog-message-number",
};

// This endpoint receives push notifications from Google Drive
// It does NOT require user auth — Google sends these directly
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Google sends POST with specific headers
  const channelId = req.headers.get("x-goog-channel-id");
  const tenantId = req.headers.get("x-goog-channel-token"); // We pass tenant_id as token
  const resourceState = req.headers.get("x-goog-resource-state");
  const resourceId = req.headers.get("x-goog-resource-id");

  // Sync verification — Google sends a "sync" message when watch is first set up
  if (resourceState === "sync") {
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  if (!tenantId || !channelId) {
    return new Response("Missing headers", { status: 400, headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Verify tenant has Drive connected
    const { data: settings } = await supabaseAdmin
      .from("google_drive_integration_settings")
      .select("is_connected, projects_root_folder_id")
      .eq("tenant_id", tenantId)
      .single();

    if (!settings?.is_connected || !settings.projects_root_folder_id) {
      return new Response("Not configured", { status: 200, headers: corsHeaders });
    }

    // Queue a root scan for this tenant
    await supabaseAdmin.from("drive_sync_queue").insert({
      tenant_id: tenantId,
      action: "scan_root",
      drive_folder_id: settings.projects_root_folder_id,
      priority: "high",
      payload_json: {
        trigger: "push_notification",
        channel_id: channelId,
        resource_id: resourceId,
        resource_state: resourceState,
      },
    });

    // Also queue file indexing for all linked jobs
    const { data: links } = await supabaseAdmin
      .from("job_drive_links")
      .select("job_id, drive_folder_id")
      .eq("tenant_id", tenantId);

    if (links && links.length > 0) {
      const queueItems = links.map(l => ({
        tenant_id: tenantId,
        job_id: l.job_id,
        action: "scan_job_folder" as const,
        drive_folder_id: l.drive_folder_id,
        priority: "normal" as const,
        payload_json: { trigger: "push_notification" },
      }));

      await supabaseAdmin.from("drive_sync_queue").insert(queueItems);
    }

    // Audit
    await supabaseAdmin.from("drive_sync_audit").insert({
      tenant_id: tenantId,
      action: "webhook_received",
      payload_after_json: {
        channel_id: channelId,
        resource_state: resourceState,
        resource_id: resourceId,
        jobs_queued: links?.length || 0,
      },
    });

    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("Drive webhook error:", err);
    return new Response("Error", { status: 500, headers: corsHeaders });
  }
});
