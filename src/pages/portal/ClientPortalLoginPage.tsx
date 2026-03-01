import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";

export default function ClientPortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if already logged in as client
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: clientUser } = await (supabase.from("client_users") as any)
          .select("id, portal_access_enabled")
          .eq("user_id", user.id)
          .eq("active", true)
          .maybeSingle();
        if (clientUser?.portal_access_enabled) {
          navigate("/portal/dashboard");
        }
      }
    };
    check();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Verify this is a client user with portal access
      const { data: clientUser } = await (supabase.from("client_users") as any)
        .select("id, portal_access_enabled, tenant_id")
        .eq("user_id", data.user.id)
        .eq("active", true)
        .maybeSingle();

      if (!clientUser || !clientUser.portal_access_enabled) {
        await supabase.auth.signOut();
        throw new Error("Portal access not enabled for this account");
      }

      // Log activity
      await (supabase.from("client_activity_log") as any).insert({
        client_user_id: clientUser.id,
        action: "client_logged_in",
        tenant_id: clientUser.tenant_id,
      });

      navigate("/portal/dashboard");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={24} className="text-primary" />
          </div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Client Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to view your project progress</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-medium text-muted-foreground mb-1.5">EMAIL</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-mono font-medium text-muted-foreground mb-1.5">PASSWORD</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
