import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Truck, LogIn } from "lucide-react";

export default function SupplierPortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Verify this is a supplier user
      const { data: su } = await (supabase.from("supplier_users") as any)
        .select("id, supplier_id")
        .eq("user_id", data.user.id)
        .eq("active", true)
        .eq("portal_access_enabled", true)
        .maybeSingle();

      if (!su) {
        await supabase.auth.signOut();
        throw new Error("No supplier portal access. Contact the company.");
      }

      navigate("/supplier/dashboard");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full h-11 rounded-md border border-input bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mx-auto mb-4">
            <Truck size={20} className="text-primary-foreground" />
          </div>
          <h1 className="text-xl font-mono font-bold text-foreground">Supplier Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Access your purchase orders</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-medium text-muted-foreground mb-1.5">EMAIL</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="supplier@example.com" />
          </div>
          <div>
            <label className="block text-xs font-mono font-medium text-muted-foreground mb-1.5">PASSWORD</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading} className="w-full h-11 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <LogIn size={14} />
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
