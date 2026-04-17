import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = "https://www.cabinetrycommand.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildRecoveryUrl(link: string | undefined) {
  if (!link) return `${SITE_URL}/login`;

  try {
    const parsed = new URL(link);
    const accessToken = parsed.searchParams.get("access_token");
    const refreshToken = parsed.searchParams.get("refresh_token");
    const type = parsed.searchParams.get("type") ?? "recovery";

    if (!accessToken || !refreshToken) {
      return `${SITE_URL}/login`;
    }

    const hashParams = new URLSearchParams({
      access_token: accessToken,
      refresh_token: refreshToken,
      type,
    });

    return `${SITE_URL}/login#${hashParams.toString()}`;
  } catch {
    return `${SITE_URL}/login`;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  const target = email.toLowerCase();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("[auth-user-lookup] listUsers failed:", error);
      return null;
    }

    const user = (data.users ?? []).find((candidate) => (candidate.email || "").toLowerCase() === target);
    if (user) return user;

    if (!data.users || data.users.length < 200) break;
    page += 1;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── Public action: check-login (no auth required) ──
    if (req.method === "POST" && action === "check-login") {
      const { email } = await req.json();
      if (!email) return json({ error: "Missing email" }, 400);

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { data: profile } = await adminClient
        .from("profiles")
        .select("user_id, locked, failed_login_attempts")
        .eq("email", email.toLowerCase())
        .limit(1)
        .single();

      if (!profile) return json({ locked: false });

      let authLocked = false;
      try {
        const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(profile.user_id);
        if (userError) {
          console.error("[check-login] getUserById failed:", userError);
        } else {
          const bannedUntil = userData.user?.banned_until;
          authLocked = !!(bannedUntil && new Date(bannedUntil).getTime() > Date.now());
        }
      } catch (err) {
        console.error("[check-login] auth lookup threw:", err);
      }

      return json({
        locked: !!profile.locked || authLocked,
        failed_login_attempts: profile.failed_login_attempts || 0,
        auth_locked: authLocked,
      });
    }

    // ── Public action: record-failed-login ──
    if (req.method === "POST" && action === "record-failed-login") {
      const { email } = await req.json();
      if (!email) return json({ error: "Missing email" }, 400);

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { data: profile } = await adminClient
        .from("profiles")
        .select("user_id, failed_login_attempts, locked, full_name")
        .eq("email", email.toLowerCase())
        .limit(1)
        .single();

      if (!profile) return json({ locked: false });

      const newAttempts = (profile.failed_login_attempts || 0) + 1;
      const shouldLock = newAttempts >= 5;

      const updates: Record<string, unknown> = { failed_login_attempts: newAttempts };
      if (shouldLock) {
        updates.locked = true;
        updates.locked_at = new Date().toISOString();
      }

      await adminClient.from("profiles").update(updates).eq("user_id", profile.user_id);

      if (shouldLock) {
        const { error: banError } = await adminClient.auth.admin.updateUserById(profile.user_id, {
          ban_duration: "876000h",
        });
        if (banError) {
          console.error("[record-failed-login] auth ban failed:", banError);
        }

        const { error: signOutError } = await adminClient.auth.admin.signOut(profile.user_id, "global");
        if (signOutError) {
          console.error("[record-failed-login] global signOut failed (non-fatal):", signOutError);
        }
      }

      // If just locked, send notification email to admin
      if (shouldLock && !profile.locked) {
        try {
          const lockTime = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              to: "danny@enclavecabinetry.com",
              subject: `⚠️ Account Locked — ${profile.full_name || email}`,
              html: `<p>The account <strong>${email}</strong> (${profile.full_name || "Unknown"}) has been automatically locked after 5 failed login attempts.</p><p><strong>Time:</strong> ${lockTime}</p><p>Log in to Cabinetry Command to unlock this account from the Team page.</p>`,
            }),
          });
        } catch { /* fire-and-forget */ }
      }

      return json({ locked: shouldLock, failed_login_attempts: newAttempts, auth_locked: shouldLock });
    }

    // ── Public action: reset-login-attempts (called after successful login) ──
    if (req.method === "POST" && action === "reset-login-attempts") {
      const { email } = await req.json();
      if (!email) return json({ error: "Missing email" }, 400);

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      await adminClient
        .from("profiles")
        .update({ failed_login_attempts: 0, last_active_at: new Date().toISOString() })
        .eq("email", email.toLowerCase());

      return json({ success: true });
    }

    // ══════════════════════════════════════════
    // All actions below require admin auth
    // ══════════════════════════════════════════
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
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
      return json({ error: "Unauthorized" }, 401);
    }

    const callerId = claimsData.claims.sub;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const callerRoleSet = new Set((callerRoles ?? []).map((r: { role: string }) => r.role));
    const isAdmin = callerRoleSet.has("admin") || callerRoleSet.has("super_admin");
    const isSuperAdmin = callerRoleSet.has("super_admin");

    if (!isAdmin) {
      return json({ error: "Admin access required" }, 403);
    }

    // ── CREATE USER ──
    if (req.method === "POST" && action === "create") {
      const { email, password, full_name, role, department, company_id } = await req.json();
      if (!email || !password || !full_name || !role) {
        return json({ error: "Missing required fields" }, 400);
      }
      // Only the super admin can mint new admins
      if (role === "admin" && !isSuperAdmin) {
        return json({ error: "Only the super admin can create admin accounts" }, 403);
      }

      const { data: userData, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        });

      if (createError) throw createError;
      const userId = userData.user.id;

      await adminClient
        .from("profiles")
        .update({ full_name, department: department || "Office" })
        .eq("user_id", userId);

      await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId);

      if (company_id) {
        const { error: membershipError } = await adminClient
          .from("cab_company_memberships")
          .insert({ company_id, user_id: userId, role });

        if (membershipError) throw membershipError;
      }

      return json({ success: true, user_id: userId });
    }

    // ── RESEND INVITE ──
    if (req.method === "POST" && action === "resend-invite") {
      const { email, send_to } = await req.json();
      if (!email) return json({ error: "Missing email" }, 400);

      // Generate recovery link
      const { data: linkData, error: linkError } =
        await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
        });
      if (linkError) throw linkError;

      const rawLink = linkData?.properties?.action_link ?? "";
      let inviteUrl = `${SITE_URL}/login`;

      if (rawLink) {
        // Extract the token_hash and type from the raw Supabase link
        // Raw link format: SUPABASE_URL/auth/v1/verify?token=TOKEN&type=recovery&redirect_to=...
        const parsed = new URL(rawLink);
        const token = parsed.searchParams.get("token");
        const type = parsed.searchParams.get("type") ?? "recovery";

        if (token) {
          // Build a URL that goes through Supabase auth verification but redirects to our domain
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const redirectTo = encodeURIComponent(`${SITE_URL}/login`);
          inviteUrl = `${supabaseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${redirectTo}`;
        }
      }

      // Get user profile for the email
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("email", email.toLowerCase())
        .limit(1)
        .single();

      const recipientEmail = send_to || email;
      const userName = profile?.full_name || email;

      // Send invite email
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `Set Your Password — Cabinetry Command`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Welcome to Cabinetry Command</h2>
              <p>An account has been created for <strong>${userName}</strong> (${email}).</p>
              <p>Click the button below to set your password and get started:</p>
              <p style="margin: 24px 0;">
                <a href="${inviteUrl}" style="display: inline-block; padding: 14px 28px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Set Password & Sign In</a>
              </p>
              <p style="font-size: 12px; color: #999;">If the button doesn't work, copy and paste this URL into your browser:</p>
              <p style="font-size: 11px; color: #999; word-break: break-all;">${inviteUrl}</p>
            </div>
          `,
        }),
      });

      return json({ success: true, sent_to: recipientEmail });
    }

    // ── UPDATE ROLE ──
    if (req.method === "POST" && action === "update-role") {
      if (!isSuperAdmin) {
        return json({ error: "Only the super admin can change user roles" }, 403);
      }
      const { user_id, role } = await req.json();
      if (!user_id || !role) return json({ error: "Missing required fields" }, 400);

      const { error } = await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", user_id);

      if (error) throw error;
      return json({ success: true });
    }

    // ── UPDATE PROFILE ──
    if (req.method === "POST" && action === "update-profile") {
      const body = await req.json();
      const { user_id, ...fields } = body;
      if (!user_id) return json({ error: "Missing user_id" }, 400);

      const allowedFields = [
        "full_name", "department", "employment_type", "contracted_hours_per_week",
        "holiday_allowance_days", "active", "bank_sort_code", "bank_account_number",
        "bank_account_name", "bank_name", "ni_number", "passport_number",
        "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
        "pay_type", "hourly_rate", "annual_salary",
      ];

      const updates: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (fields[key] !== undefined) updates[key] = fields[key];
      }

      const { error } = await adminClient.from("profiles").update(updates).eq("user_id", user_id);
      if (error) throw error;
      return json({ success: true });
    }

    // ── RESET PASSWORD ──
    if (req.method === "POST" && action === "reset-password") {
      const { user_id, password } = await req.json();
      if (!user_id || !password) return json({ error: "Missing required fields" }, 400);

      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
      if (error) throw error;
      return json({ success: true });
    }

    // ── FORCE PASSWORD RESET EMAIL ──
    if (req.method === "POST" && action === "force-password-reset") {
      const { email } = await req.json();
      if (!email) return json({ error: "Missing email" }, 400);

      // Use the admin client to generate a password reset link
      const { data, error } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${SITE_URL}/login` },
      });

      if (error) throw error;

      // Send the email
      try {
        const recoveryUrl = buildRecoveryUrl(data.properties?.action_link);
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            to: email,
            subject: "Password Reset — Cabinetry Command",
            html: `<p>Your administrator has requested a password reset for your account.</p><p><a href="${recoveryUrl}">Click here to reset your password</a></p><p>If you didn't expect this, please contact your administrator.</p>`,
          }),
        });
      } catch { /* fire-and-forget */ }

      return json({ success: true });
    }

    // ── LOCK ACCOUNT ──
    // Locks the auth user (banned_until = far future) AND revokes all active sessions
    // so the user is kicked out immediately, not just blocked from logging in again.
    if (req.method === "POST" && action === "lock") {
      const { user_id } = await req.json();
      if (!user_id) return json({ error: "Missing user_id" }, 400);

      // 1. Ban the auth user — this stops Supabase auth from accepting their JWT
      //    and prevents new logins. "876000h" ≈ 100 years.
      const { error: banError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h",
      });
      if (banError) {
        console.error("[lock] auth ban failed:", banError);
        return json({ error: `Failed to ban user: ${banError.message}` }, 500);
      }

      // 2. Revoke ALL active sessions for this user — kicks them out right now
      const { error: signOutError } = await adminClient.auth.admin.signOut(user_id, "global");
      if (signOutError) {
        console.error("[lock] global signOut failed (non-fatal):", signOutError);
      }

      // 3. Mirror state on profiles so the UI badge + LoginPage check work
      await adminClient.from("profiles").update({
        locked: true,
        locked_at: new Date().toISOString(),
      }).eq("user_id", user_id);

      return json({ success: true });
    }

    // ── UNLOCK ACCOUNT ──
    if (req.method === "POST" && action === "unlock") {
      const { user_id } = await req.json();
      if (!user_id) return json({ error: "Missing user_id" }, 400);

      // 1. Lift the auth ban
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });
      if (unbanError) {
        console.error("[unlock] auth unban failed:", unbanError);
        return json({ error: `Failed to unban user: ${unbanError.message}` }, 500);
      }

      // 2. Clear profile flags
      await adminClient.from("profiles").update({
        locked: false,
        locked_at: null,
        failed_login_attempts: 0,
      }).eq("user_id", user_id);

      return json({ success: true });
    }

    // ── DELETE USER ──
    if (req.method === "POST" && action === "delete-user") {
      const { user_id } = await req.json();
      if (!user_id) return json({ error: "Missing user_id" }, 400);
      if (user_id === callerId) return json({ error: "Cannot delete your own account" }, 400);

      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return json({ success: true });
    }

    // ── INVITE USER (create + send setup email) ──
    if (req.method === "POST" && action === "invite") {
      const { email, full_name, role, company_id } = await req.json();
      if (!email || !full_name || !role) {
        return json({ error: "Missing required fields" }, 400);
      }
      // Only the super admin can mint new admins
      if (role === "admin" && !isSuperAdmin) {
        return json({ error: "Only the super admin can invite admin users" }, 403);
      }

      // Generate a temporary password — user will reset via the email link
      const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";

      const { data: userData, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name },
        });

      if (createError) throw createError;
      const userId = userData.user.id;

      // Update profile
      await adminClient
        .from("profiles")
        .update({ full_name, department: "Office" })
        .eq("user_id", userId);

      // Set role
      await adminClient
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId);

      // If company_id provided, add cab_company_membership
      if (company_id) {
        await adminClient
          .from("cab_company_memberships")
          .insert({ company_id, user_id: userId, role });
      }

      // Generate password reset link so user can set their own password
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${SITE_URL}/login` },
      });

      if (linkError) throw linkError;

      // Send invite email
      try {
        const recoveryUrl = buildRecoveryUrl(linkData.properties?.action_link);
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            to: email,
            subject: "You've been invited to Cabinetry Command",
            html: `<p>Hi ${full_name},</p><p>You've been invited to join <strong>Cabinetry Command</strong> as a team member.</p><p><a href="${recoveryUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Set Up Your Password</a></p><p>Click the button above to set your password and log in. This link will expire in 24 hours.</p><p>If you didn't expect this invitation, please ignore this email.</p>`,
          }),
        });
      } catch (emailErr) {
        console.error("Failed to send invite email:", emailErr);
      }

      return json({ success: true, user_id: userId });
    }

    // ── LIST ALL USERS (admin) ──
    if (req.method === "GET" && action === "list-users") {
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("user_id, full_name, email, department, locked, failed_login_attempts, locked_at, last_active_at, active")
        .order("full_name");

      const { data: roles } = await adminClient
        .from("user_roles")
        .select("user_id, role");

      const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));

      const users = (profiles || []).map(p => ({
        ...p,
        role: roleMap.get(p.user_id) || "viewer",
      }));

      return json({ users });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
});
