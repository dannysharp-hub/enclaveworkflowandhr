import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow service-role or an existing admin to call this
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is service role or admin
    if (authHeader && authHeader !== `Bearer ${serviceRoleKey}`) {
      const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await callerClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorised" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin role required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { tenant_name, admin_email, admin_password, admin_full_name, timezone } = await req.json();

    if (!tenant_name || !admin_email || !admin_password) {
      return new Response(
        JSON.stringify({ error: "tenant_name, admin_email, and admin_password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .insert({
        tenant_name,
        timezone: timezone || "Europe/London",
        subscription_status: "trial",
      })
      .select()
      .single();

    if (tenantErr) throw tenantErr;
    const tenantId = tenant.id;

    // 2. Create admin user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: true,
      user_metadata: {
        full_name: admin_full_name || admin_email,
        tenant_id: tenantId,
      },
    });

    if (authErr) throw authErr;
    const userId = authData.user.id;

    // Update profile tenant_id (handle_new_user trigger creates it)
    await supabase
      .from("profiles")
      .update({ tenant_id: tenantId, full_name: admin_full_name || admin_email })
      .eq("user_id", userId);

    // Set role to admin
    await supabase
      .from("user_roles")
      .update({ role: "admin", tenant_id: tenantId })
      .eq("user_id", userId);

    // 3. Seed default departments
    const defaultDepartments = ["CNC", "Assembly", "Spray", "Install", "Office"];
    await supabase.from("department_config").insert(
      defaultDepartments.map((name) => ({
        tenant_id: tenantId,
        name,
        minimum_staff_required_per_day: 1,
        maximum_staff_off_per_day: 2,
      }))
    );

    // 4. Seed default workflow stages
    const defaultStages = ["Design", "Programming", "CNC", "Edgebanding", "Assembly", "Spray", "Install"];
    await supabase.from("stage_config").insert(
      defaultStages.map((stage_name, i) => ({
        tenant_id: tenantId,
        stage_name,
        order_index: i,
        active: true,
      }))
    );

    // 5. Seed default feature flags (all disabled for new tenants)
    const defaultFlags = [
      "enable_qr_tracking",
      "enable_remnants",
      "enable_hr_cases",
      "enable_drive_integration",
      "enable_notifications",
    ];
    await supabase.from("tenant_feature_flags").insert(
      defaultFlags.map((flag_name) => ({
        tenant_id: tenantId,
        flag_name,
        enabled: false,
      }))
    );

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        admin_user_id: userId,
        message: `Tenant "${tenant_name}" created with admin ${admin_email}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
