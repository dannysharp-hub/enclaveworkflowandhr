import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
      // Check if account is locked first
      const checkResult = await callManageStaff("check-login", { email });
      if (checkResult.locked) {
        setError("Your account has been locked. Please contact your administrator.");
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // Record failed attempt
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
        // Reset failed attempts on successful login
        await callManageStaff("reset-login-attempts", { email });
        navigate("/");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm glass-panel rounded-lg p-8">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
              <span className="font-mono text-lg font-bold text-primary-foreground">E</span>
            </div>
            <div>
              <p className="font-mono text-lg font-bold text-foreground leading-none">ENCLAVE</p>
              <p className="text-[10px] text-muted-foreground tracking-widest">CABINETRY</p>
            </div>
          </div>

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
                <label className="block text-xs font-mono font-medium text-muted-foreground mb-1.5">EMAIL</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  required
                  className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="you@enclave.co.uk"
                />
              </div>
              {error && <p className="text-xs text-destructive font-mono">{error}</p>}
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm glass-panel rounded-lg p-8">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
            <span className="font-mono text-lg font-bold text-primary-foreground">E</span>
          </div>
          <div>
            <p className="font-mono text-lg font-bold text-foreground leading-none">ENCLAVE</p>
            <p className="text-[10px] text-muted-foreground tracking-widest">CABINETRY</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-medium text-muted-foreground mb-1.5">EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="you@enclave.co.uk"
            />
          </div>
          <div>
            <label className="block text-xs font-mono font-medium text-muted-foreground mb-1.5">PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-xs text-destructive font-mono">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
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
