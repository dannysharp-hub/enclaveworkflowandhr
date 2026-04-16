import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";

const PASSWORD_SETUP_TYPES = new Set(["recovery", "invite"]);

const getHashParams = () => {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  return new URLSearchParams(hash);
};

const clearHashParams = () => {
  const nextUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, nextUrl);
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleAuthLink = async () => {
      const hashParams = getHashParams();
      const linkType = hashParams.get("type");
      const errorCode = hashParams.get("error_code");

      if (errorCode === "otp_expired") {
        setShowReset(false);
        setShowForgot(false);
        setError("This password setup link has expired. Please ask your administrator to resend it.");
        clearHashParams();
        return;
      }

      if (!linkType || !PASSWORD_SETUP_TYPES.has(linkType)) {
        return;
      }

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          setError("This password setup link is invalid or has expired. Please ask your administrator to resend it.");
          clearHashParams();
          return;
        }

        setShowReset(true);
        setShowForgot(false);
        setError("");
        clearHashParams();
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setShowReset(true);
        setShowForgot(false);
        setError("");
        clearHashParams();
      }
    };

    void handleAuthLink();
  }, []);

  // Listen for PASSWORD_RECOVERY event from Supabase auth
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      const linkType = getHashParams().get("type");

      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && linkType && PASSWORD_SETUP_TYPES.has(linkType))) {
        setShowReset(true);
        setShowForgot(false);
        setError("");
        clearHashParams();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (searchParams.get("reason") === "timeout") {
      setError("Your session has expired due to inactivity. Please sign in again.");
    }
  }, [searchParams]);

  const callManageStaff = async (action: string, body: Record<string, unknown>) => {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff?action=${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return res.json();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const checkResult = await callManageStaff("check-login", { email });
      if (checkResult.locked) {
        setError("Your account has been locked. Please contact your administrator.");
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        const failResult = await callManageStaff("record-failed-login", { email });
        if (failResult.locked) {
          setError("Your account has been locked after too many failed attempts. Please contact your administrator.");
        } else {
          const remaining = 5 - (failResult.failed_login_attempts || 0);
          if (remaining <= 2 && remaining > 0) {
            setError(`Invalid email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before account lock.`);
          } else {
            setError("Invalid email or password.");
          }
        }
      } else {
        await callManageStaff("reset-login-attempts", { email });
        navigate("/");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    }
    setLoading(false);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setResetSuccess(true);
      setTimeout(() => {
        setShowReset(false);
        setResetSuccess(false);
        navigate("/");
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `https://www.cabinetrycommand.com/login`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const brandHeader = (
    <div className="flex items-center gap-3 mb-8 justify-center">
      <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
        <span className="font-mono text-lg font-bold text-primary-foreground">E</span>
      </div>
      <div>
        <p className="font-mono text-lg font-bold text-foreground leading-none">ENCLAVE</p>
        <p className="text-[10px] text-muted-foreground tracking-widest">CABINETRY</p>
      </div>
    </div>
  );

  const inputClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-xs font-mono font-medium text-muted-foreground mb-1.5";
  const btnClass = "w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50";

  // ── SET PASSWORD SCREEN (recovery / invite) ──
  if (showReset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm glass-panel rounded-lg p-8">
          {brandHeader}

          {resetSuccess ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-foreground font-medium">Password set successfully!</p>
              <p className="text-xs text-muted-foreground">Redirecting you now…</p>
            </div>
          ) : (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">Create your password to get started</p>
              <div>
                <label className={labelClass}>NEW PASSWORD</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className={inputClass}
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div>
                <label className={labelClass}>CONFIRM PASSWORD</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className={inputClass}
                  placeholder="Confirm your password"
                />
              </div>
              {error && <p className="text-xs text-destructive font-mono">{error}</p>}
              <button type="submit" disabled={resetLoading} className={btnClass}>
                {resetLoading ? "Setting password…" : "Set Password & Sign In"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── FORGOT PASSWORD SCREEN ──
  if (showForgot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm glass-panel rounded-lg p-8">
          {brandHeader}

          {forgotSent ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-foreground">Password reset email sent to <strong>{forgotEmail}</strong></p>
              <p className="text-xs text-muted-foreground">Check your inbox and follow the link to reset your password.</p>
              <button
                onClick={() => { setShowForgot(false); setForgotSent(false); }}
                className="text-xs text-primary hover:underline"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">Enter your email to receive a password reset link</p>
              <div>
                <label className={labelClass}>EMAIL</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="you@enclave.co.uk"
                />
              </div>
              {error && <p className="text-xs text-destructive font-mono">{error}</p>}
              <button type="submit" disabled={forgotLoading} className={btnClass}>
                {forgotLoading ? "Sending…" : "Send Reset Link"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForgot(false); setError(""); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── MAIN LOGIN SCREEN ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm glass-panel rounded-lg p-8">
        {brandHeader}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className={labelClass}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className={inputClass}
              placeholder="you@enclave.co.uk"
            />
          </div>
          <div>
            <label className={labelClass}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className={inputClass}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-xs text-destructive font-mono">{error}</p>}
          <button type="submit" disabled={loading} className={btnClass}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setShowForgot(true); setError(""); setForgotEmail(email); }}
            className="text-xs text-primary hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Contact your admin for account access
        </p>
      </div>
    </div>
  );
}