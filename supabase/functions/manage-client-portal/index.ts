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

    // Verify calling user
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

    // Check caller has admin/office role
    const { data: callerRole } = await supabaseAdmin.rpc('get_user_role', { _user_id: callerUserId });
    if (!['admin', 'office'].includes(callerRole)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403, headers: corsHeaders });
    }

    const { action, ...params } = await req.json();

    if (action === 'invite_client') {
      const { name, email, customer_id, tenant_id, job_id } = params;

      if (!name || !email || !customer_id || !tenant_id) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
      }

      // Create auth user with a temporary password
      const tempPassword = crypto.randomUUID().slice(0, 16) + 'Aa1!';
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: name, is_client: true, tenant_id },
      });

      if (authErr) {
        return new Response(JSON.stringify({ error: authErr.message }), { status: 400, headers: corsHeaders });
      }

      // Create client_users record
      const { data: clientUser, error: cuErr } = await supabaseAdmin
        .from('client_users')
        .insert({
          user_id: authUser.user.id,
          tenant_id,
          customer_id,
          name,
          email,
          client_role: 'primary',
          active: true,
          portal_access_enabled: true,
        })
        .select('id')
        .single();

      if (cuErr) {
        return new Response(JSON.stringify({ error: cuErr.message }), { status: 400, headers: corsHeaders });
      }

      // Create access token if job specified
      let accessToken = null;
      if (job_id) {
        const { data: tokenData } = await supabaseAdmin
          .from('client_access_tokens')
          .insert({
            tenant_id,
            job_id,
            client_user_id: clientUser.id,
          })
          .select('token')
          .single();
        accessToken = tokenData?.token;
      }

      // Send password reset so client can set their own password
      await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
      });

      return new Response(JSON.stringify({
        success: true,
        client_user_id: clientUser.id,
        access_token: accessToken,
        message: `Client ${name} invited. They will receive a password reset email.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
