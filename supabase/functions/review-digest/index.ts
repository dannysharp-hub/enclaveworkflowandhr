import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date().toISOString().split("T")[0];
    const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const in14Days = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

    // Fetch all scheduled/overdue reviews
    const { data: reviews, error: revErr } = await supabase
      .from("reviews")
      .select("*")
      .in("status", ["Scheduled", "Overdue"])
      .lte("due_date", in14Days);

    if (revErr) throw revErr;

    // Fetch supervisors/admins who should receive notifications
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "supervisor"]);

    const recipientIds = [...new Set((roles ?? []).map((r: any) => r.user_id))];
    if (recipientIds.length === 0 || !reviews?.length) {
      return new Response(
        JSON.stringify({ message: "No notifications to send", reviews: reviews?.length ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get staff names for display
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name");
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.full_name]));

    // Categorise reviews
    const overdue = reviews.filter((r: any) => r.due_date < today);
    const upcoming = reviews.filter((r: any) => r.due_date >= today && r.due_date <= in14Days);

    // Build digest message
    const parts: string[] = [];
    if (overdue.length > 0) {
      const items = overdue
        .map((r: any) => `• ${r.title} — ${nameMap.get(r.staff_id) || "Unknown"} (due ${r.due_date})`)
        .join("\n");
      parts.push(`🔴 ${overdue.length} OVERDUE:\n${items}`);
    }
    if (upcoming.length > 0) {
      const items = upcoming
        .map((r: any) => `• ${r.title} — ${nameMap.get(r.staff_id) || "Unknown"} (due ${r.due_date})`)
        .join("\n");
      parts.push(`🟡 ${upcoming.length} UPCOMING (14 days):\n${items}`);
    }

    const message = parts.join("\n\n");
    const title = overdue.length > 0
      ? `${overdue.length} overdue review${overdue.length !== 1 ? "s" : ""} require attention`
      : `${upcoming.length} review${upcoming.length !== 1 ? "s" : ""} due within 14 days`;

    // Create notification for each recipient
    const notifications = recipientIds.map((userId: string) => ({
      user_id: userId,
      title,
      message,
      type: overdue.length > 0 ? "warning" : "info",
      link: "/reviews",
    }));

    const { error: insertErr } = await supabase
      .from("notifications")
      .insert(notifications);

    if (insertErr) throw insertErr;

    // Also update overdue statuses
    if (overdue.length > 0) {
      const overdueIds = overdue.map((r: any) => r.id);
      await supabase
        .from("reviews")
        .update({ status: "Overdue" })
        .in("id", overdueIds)
        .eq("status", "Scheduled");
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications_created: notifications.length,
        overdue: overdue.length,
        upcoming: upcoming.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Review digest error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
