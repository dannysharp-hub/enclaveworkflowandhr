import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, Link2 } from "lucide-react";
import { getCabCompanyId } from "@/lib/cabHelpers";
import LabourRateSettings from "@/components/cab/LabourRateSettings";

export default function BootstrapPage() {
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [existingMap, setExistingMap] = useState<any>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    (async () => {
      const cid = await getCabCompanyId();
      setCompanyId(cid);
      if (cid) {
        const { data } = await (supabase.from("cab_company_tenant_map") as any)
          .select("*")
          .eq("company_id", cid)
          .maybeSingle();
        setExistingMap(data);
      }
    })();
  }, []);

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

  const handleLinkTenant = async () => {
    if (!companyId || !tenantId) return;
    setLinking(true);
    try {
      const { error } = await (supabase.from("cab_company_tenant_map") as any)
        .upsert({ company_id: companyId, tenant_id: tenantId }, { onConflict: "company_id" });
      if (error) throw error;
      toast({ title: "Tenant linked", description: "Workshop handoff is now active." });
      const { data } = await (supabase.from("cab_company_tenant_map") as any)
        .select("*").eq("company_id", companyId).maybeSingle();
      setExistingMap(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLinking(false);
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

        {/* Tenant linking section */}
        {companyId && (
          <div className="border border-border rounded-lg p-4 space-y-3 text-left">
            <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
              <Link2 size={14} className="text-primary" /> Link to Workshop Tenant
            </h3>
            {existingMap ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Workshop handoff is active.</p>
                <Badge variant="default" className="text-xs font-mono">Linked</Badge>
              </div>
            ) : tenantId ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Link this cabinetry company to your workshop tenant for automatic job handoff when production starts.
                </p>
                <Button onClick={handleLinkTenant} disabled={linking} size="sm" className="w-full">
                  {linking ? "Linking…" : "Link to Current Tenant"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No tenant detected in your profile. Log into the workshop side first.</p>
            )}
          </div>
        )}

        {/* Labour rate settings */}
        {companyId && (
          <div className="text-left">
            <LabourRateSettings companyId={companyId} />
          </div>
        )}
      </div>
    </div>
  );
}
