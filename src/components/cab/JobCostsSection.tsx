import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { PoundSterling, Plus, ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface CostTransaction {
  id: string;
  transaction_date: string;
  amount: number;
  description: string | null;
  counterparty_name: string | null;
  transaction_category: string | null;
  status: string;
}

interface CostLine {
  id: string;
  cost_type: string;
  description: string;
  qty: number;
  unit_cost: number;
  line_total: number | null;
  source: string;
  incurred_at: string | null;
  supplier_id: string | null;
}

const COST_TYPES = ["materials", "hardware", "subcontract", "delivery", "other"] as const;

export default function JobCostsSection({ companyId, job, onRefresh }: { companyId: string; job: any; onRefresh: () => void }) {
  const [costLines, setCostLines] = useState<CostLine[]>([]);
  const [bankMatches, setBankMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newCost, setNewCost] = useState({ description: "", cost_type: "materials", qty: "1", unit_cost: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [costRes, matchRes] = await Promise.all([
      (supabase.from("cab_job_cost_lines") as any)
        .select("*")
        .eq("job_id", job.id)
        .order("incurred_at", { ascending: false }),
      (supabase.from("bank_document_matches") as any)
        .select("*, bank_transactions(*)")
        .or(`resource_id.eq.${job.id}`)
        .order("created_at", { ascending: false }),
    ]);
    setCostLines(costRes.data ?? []);
    setBankMatches(matchRes.data ?? []);
    setLoading(false);
  }, [job.id]);

  useEffect(() => { load(); }, [load]);

  const totalCosts = costLines.reduce((sum, c) => sum + (c.line_total ?? c.qty * c.unit_cost), 0);
  const contractValue = job.contract_value || 0;
  const grossMargin = contractValue > 0 ? ((contractValue - totalCosts) / contractValue * 100) : 0;

  const costsByType = COST_TYPES.map(type => ({
    type,
    total: costLines.filter(c => c.cost_type === type).reduce((s, c) => s + (c.line_total ?? c.qty * c.unit_cost), 0),
  }));

  const handleAddCost = async () => {
    if (!newCost.description || !newCost.unit_cost) return;
    setSaving(true);
    try {
      const qty = parseFloat(newCost.qty) || 1;
      const unitCost = parseFloat(newCost.unit_cost) || 0;
      await (supabase.from("cab_job_cost_lines") as any).insert({
        company_id: companyId,
        job_id: job.id,
        cost_type: newCost.cost_type,
        description: newCost.description,
        qty,
        unit_cost: unitCost,
        line_total: qty * unitCost,
        source: "manual",
        incurred_at: new Date().toISOString(),
      });
      setAddOpen(false);
      setNewCost({ description: "", cost_type: "materials", qty: "1", unit_cost: "" });
      load();
      onRefresh();
      toast({ title: "Cost added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="glass-panel rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs font-bold text-foreground flex items-center gap-2">
          <PoundSterling size={14} className="text-primary" /> Job Costs
        </h3>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="text-xs gap-1">
          <Plus size={12} /> Add Cost
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-md border border-border bg-background">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Total Costs</p>
          <p className="text-lg font-bold text-foreground">£{totalCosts.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="p-3 rounded-md border border-border bg-background">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Contract Value</p>
          <p className="text-lg font-bold text-foreground">£{contractValue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="p-3 rounded-md border border-border bg-background">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Gross Margin</p>
          <p className={`text-lg font-bold ${grossMargin >= 30 ? "text-emerald-500" : grossMargin >= 15 ? "text-amber-500" : "text-destructive"}`}>
            {grossMargin.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Breakdown by category */}
      <div className="space-y-1">
        {costsByType.filter(c => c.total > 0).map(c => (
          <div key={c.type} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground capitalize">{c.type}</span>
            <span className="font-medium text-foreground">£{c.total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>

      {/* Cost lines */}
      {costLines.length > 0 && (
        <div className="divide-y divide-border border border-border rounded-md">
          {costLines.slice(0, 10).map(c => (
            <div key={c.id} className="px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">{c.description}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.cost_type} · {c.source} · {c.incurred_at ? format(new Date(c.incurred_at), "dd MMM") : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-foreground">
                  £{(c.line_total ?? c.qty * c.unit_cost).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                </p>
                {c.qty > 1 && <p className="text-[10px] text-muted-foreground">{c.qty} × £{c.unit_cost}</p>}
              </div>
            </div>
          ))}
          {costLines.length > 10 && (
            <p className="px-3 py-2 text-[10px] text-muted-foreground">+ {costLines.length - 10} more</p>
          )}
        </div>
      )}

      {costLines.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-4">No costs recorded yet</p>
      )}

      {/* Add cost dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">Add Manual Cost</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Description"
              value={newCost.description}
              onChange={e => setNewCost(p => ({ ...p, description: e.target.value }))}
            />
            <Select value={newCost.cost_type} onValueChange={v => setNewCost(p => ({ ...p, cost_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COST_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Qty"
                value={newCost.qty}
                onChange={e => setNewCost(p => ({ ...p, qty: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="Unit cost (£)"
                value={newCost.unit_cost}
                onChange={e => setNewCost(p => ({ ...p, unit_cost: e.target.value }))}
              />
            </div>
            <Button onClick={handleAddCost} disabled={saving} className="w-full" size="sm">
              {saving ? "Saving…" : "Add Cost"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
