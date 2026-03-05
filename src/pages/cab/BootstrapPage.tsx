import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Rocket } from "lucide-react";

export default function BootstrapPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleBootstrap = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Check if already linked
      const { data: existing } = await (supabase.from("cab_user_profiles") as any)
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();

      if (existing?.company_id) {
        toast({ title: "Already set up", description: "You already have a company linked." });
        navigate("/admin/leads");
        return;
      }

      // Create company
      const { data: company, error: compErr } = await (supabase.from("cab_companies") as any)
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

      // Create user profile
      const { error: profErr } = await (supabase.from("cab_user_profiles") as any)
        .upsert({
          id: user.id,
          company_id: company.id,
          name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Admin",
          email: user.email!,
          role: "admin",
          is_active: true,
        });

      if (profErr) throw profErr;

      toast({ title: "Company created", description: "Enclave Cabinetry is live." });
      navigate("/admin/leads");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="w-14 h-14 rounded-xl bg-primary/15 flex items-center justify-center mx-auto">
          <Rocket size={28} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Bootstrap Setup</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Create the Enclave Cabinetry company record and link your account as admin.
          </p>
        </div>
        <Button onClick={handleBootstrap} disabled={loading} className="w-full" size="lg">
          {loading ? "Setting up…" : "Create Enclave Company + Link Me"}
        </Button>
      </div>
    </div>
  );
}
