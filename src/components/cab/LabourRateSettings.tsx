import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, DollarSign } from "lucide-react";

interface Props {
  companyId: string;
}

export default function LabourRateSettings({ companyId }: Props) {
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formRole, setFormRole] = useState("");
  const [formRate, setFormRate] = useState("25");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);

  const load = useCallback(async () => {
    const { data } = await (supabase.from("cab_labour_rates") as any)
      .select("*")
      .eq("company_id", companyId)
      .order("effective_from", { ascending: false });
    setRates(data ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!formRate) {
      toast({ title: "Enter an hourly rate", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase.from("cab_labour_rates") as any).insert({
        company_id: companyId,
        role: formRole.trim() || null,
        hourly_rate: Number(formRate),
        effective_from: formDate,
      });
      if (error) throw error;
      toast({ title: "Rate added" });
      setFormRole(""); setFormRate("25"); setAdding(false);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await (supabase.from("cab_labour_rates") as any).delete().eq("id", id);
    load();
  };

  if (loading) {
    return <div className="h-12 flex items-center justify-center"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
        <DollarSign size={12} className="text-primary" /> Labour Rates
      </h4>
      <p className="text-[10px] text-muted-foreground">
        Set hourly rates for labour cost calculations. Leave role empty for a default rate.
      </p>

      {rates.length > 0 ? (
        <div className="divide-y divide-border rounded-md border border-border">
          {rates.map(r => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px]">
                  {r.role || "Default"}
                </Badge>
                <span className="font-mono font-bold text-foreground">£{Number(r.hourly_rate).toFixed(2)}/hr</span>
                <span className="text-muted-foreground">from {r.effective_from}</span>
              </div>
              <button onClick={() => handleDelete(r.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">No rates set. Default £25/hr will be used.</p>
      )}

      {adding ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[10px]">Role (optional)</Label>
              <Input value={formRole} onChange={e => setFormRole(e.target.value)}
                placeholder="e.g. installer" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px]">Hourly Rate (£)</Label>
              <Input type="number" value={formRate} onChange={e => setFormRate(e.target.value)}
                step="0.50" min="0" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px]">Effective From</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving} className="text-xs">
              {saving ? "Saving…" : "Add Rate"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)} className="text-xs">Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="text-xs">
          <Plus size={12} /> Add Rate
        </Button>
      )}
    </div>
  );
}
