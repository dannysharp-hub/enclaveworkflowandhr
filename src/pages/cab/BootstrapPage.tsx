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
      const { data, error } = await supabase.functions.invoke("bootstrap-admin");

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Bootstrap failed");

      toast({
        title: data.already_linked ? "Already set up" : "Company linked",
        description: data.already_linked
          ? "You already have a company linked."
          : "Enclave Cabinetry is ready.",
      });
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
