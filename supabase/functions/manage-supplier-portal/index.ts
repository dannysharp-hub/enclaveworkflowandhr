import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await supabaseUser.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const callerUserId = claims.claims.sub;
    const { data: callerRole } = await supabaseAdmin.rpc('get_user_role', { _user_id: callerUserId });
    if (!['admin', 'office'].includes(callerRole)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403, headers: corsHeaders });
    }

    const { action, ...params } = await req.json();

    if (action === 'invite_supplier') {
      const { name, email, supplier_id, tenant_id } = params;

      if (!name || !email || !supplier_id || !tenant_id) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
      }

      const tempPassword = crypto.randomUUID().slice(0, 16) + 'Ss1!';
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: name, is_supplier: true, tenant_id },
      });

      if (authErr) {
        return new Response(JSON.stringify({ error: authErr.message }), { status: 400, headers: corsHeaders });
      }

      const { data: supplierUser, error: suErr } = await supabaseAdmin
        .from('supplier_users')
        .insert({
          user_id: authUser.user.id,
          tenant_id,
          supplier_id,
          name,
          email,
          supplier_role: 'primary',
          active: true,
          portal_access_enabled: true,
        })
        .select('id')
        .single();

      if (suErr) {
        return new Response(JSON.stringify({ error: suErr.message }), { status: 400, headers: corsHeaders });
      }

      await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email });

      return new Response(JSON.stringify({
        success: true,
        supplier_user_id: supplierUser.id,
        message: `Supplier ${name} invited. They will receive a password reset email.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
