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
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const callerId = claimsData.claims.sub;

    // Check admin role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (req.method === "POST" && action === "create") {
      const { email, password, full_name, role, department } = await req.json();

      if (!email || !password || !full_name || !role) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Create user
      const { data: userData, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        });

      if (createError) throw createError;

      const userId = userData.user.id;

      // Update profile
      await adminClient
        .from("profiles")
        .update({
          full_name,
          department: department || "Office",
        })
        .eq("user_id", userId);

      // Set role (replace default viewer)
      await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId);

      return new Response(
        JSON.stringify({ success: true, user_id: userId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && action === "update-role") {
      const { user_id, role } = await req.json();

      if (!user_id || !role) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { error } = await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", user_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "update-profile") {
      const { user_id, full_name, department, employment_type, contracted_hours_per_week, holiday_allowance_days, active, bank_sort_code, bank_account_number, bank_account_name, bank_name, ni_number, passport_number } = await req.json();

      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "Missing user_id" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const updates: Record<string, unknown> = {};
      if (full_name !== undefined) updates.full_name = full_name;
      if (department !== undefined) updates.department = department;
      if (employment_type !== undefined) updates.employment_type = employment_type;
      if (contracted_hours_per_week !== undefined) updates.contracted_hours_per_week = contracted_hours_per_week;
      if (holiday_allowance_days !== undefined) updates.holiday_allowance_days = holiday_allowance_days;
      if (active !== undefined) updates.active = active;
      if (bank_sort_code !== undefined) updates.bank_sort_code = bank_sort_code;
      if (bank_account_number !== undefined) updates.bank_account_number = bank_account_number;
      if (bank_account_name !== undefined) updates.bank_account_name = bank_account_name;
      if (bank_name !== undefined) updates.bank_name = bank_name;
      if (ni_number !== undefined) updates.ni_number = ni_number;
      if (passport_number !== undefined) updates.passport_number = passport_number;

      const { error } = await adminClient
        .from("profiles")
        .update(updates)
        .eq("user_id", user_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "reset-password") {
      const { user_id, password } = await req.json();

      if (!user_id || !password) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        password,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: corsHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
