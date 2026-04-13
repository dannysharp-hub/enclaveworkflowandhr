import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PARENT_FOLDER_ID = "1FfyX8aL26pX3aLAvw2I7LWgGL4EjdMa7";

async function getAccessToken(supabaseAdmin: any): Promise<string> {
  const { data: row } = await supabaseAdmin
    .from("google_integration_settings")
    .select("access_token, refresh_token, token_expires_at")
    .limit(1)
    .single();

  if (!row?.refresh_token) throw new Error("Google Drive not connected");

  // If token still valid, use it
  if (row.access_token && row.token_expires_at) {
    const expiresAt = new Date(row.token_expires_at).getTime();
    if (Date.now() < expiresAt - 60_000) return row.access_token;
  }

  // Refresh
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await res.json();
  if (!tokens.access_token) throw new Error("Token refresh failed");

  await supabaseAdmin
    .from("google_integration_settings")
    .update({
      access_token: tokens.access_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq("id", row.id);

  return tokens.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job_id, job_ref, customer_last_name } = await req.json();

    if (!job_id || !job_ref) {
      return new Response(
        JSON.stringify({ error: "job_id and job_ref are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const accessToken = await getAccessToken(supabaseAdmin);

    // Build folder name: {job_ref}_{customer_last_name}
    const safeName = (customer_last_name || "unknown").replace(/[^a-zA-Z0-9_\-]/g, "");
    const folderName = `${job_ref}_${safeName}`;

    // Create folder in Google Drive
    const driveRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [PARENT_FOLDER_ID],
      }),
    });

    if (!driveRes.ok) {
      const errBody = await driveRes.text();
      throw new Error(`Drive API error: ${errBody}`);
    }

    const driveFolder = await driveRes.json();

    // Save to cab_jobs
    const { error: updateError } = await supabaseAdmin
      .from("cab_jobs")
      .update({
        drive_folder_id: driveFolder.id,
        drive_folder_name: folderName,
      })
      .eq("id", job_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        drive_folder_id: driveFolder.id,
        drive_folder_name: folderName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
