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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabaseUser.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = (claimsData.claims.email as string) || "";
    const userName = (claimsData.claims.user_metadata as any)?.full_name || userEmail.split("@")[0] || "Admin";

    // Service-role client to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if user already linked
    const { data: existing } = await supabaseAdmin
      .from("cab_user_profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (existing?.company_id) {
      return new Response(
        JSON.stringify({ success: true, company_id: existing.company_id, already_linked: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert company
    const { data: existingCompany } = await supabaseAdmin
      .from("cab_companies")
      .select("id")
      .eq("name", "Enclave Cabinetry")
      .maybeSingle();

    let companyId: string;

    if (existingCompany?.id) {
      companyId = existingCompany.id;
    } else {
      const { data: newCompany, error: compErr } = await supabaseAdmin
        .from("cab_companies")
        .insert({
          name: "Enclave Cabinetry",
          base_postcode: "PE20 3QF",
          service_radius_miles: 50,
          brand_phone: "07944608098",
          timezone: "Europe/London",
        })
        .select("id")
        .single();
      if (compErr) throw compErr;
      companyId = newCompany.id;
    }

    // Upsert user profile
    const { error: profErr } = await supabaseAdmin
      .from("cab_user_profiles")
      .upsert({
        id: userId,
        company_id: companyId,
        name: userName,
        email: userEmail,
        role: "admin",
        is_active: true,
      });

    if (profErr) throw profErr;

    // Auto-populate cab_company_tenant_map if user has a tenant
    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileRow?.tenant_id) {
      await supabaseAdmin
        .from("cab_company_tenant_map")
        .upsert(
          { company_id: companyId, tenant_id: profileRow.tenant_id },
          { onConflict: "company_id" }
        );
    }

    return new Response(
      JSON.stringify({ success: true, company_id: companyId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
