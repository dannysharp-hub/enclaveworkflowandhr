import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus, Trash2, TrendingUp, TrendingDown, DollarSign, Package, Wrench,
  Truck, Building2, HelpCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Target, RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const COST_TYPES = [
  { value: "materials", label: "Materials", icon: Package },
  { value: "labour", label: "Labour", icon: Wrench },
  { value: "subcontract", label: "Subcontract", icon: Building2 },
  { value: "delivery", label: "Delivery", icon: Truck },
  { value: "overheads", label: "Overheads", icon: DollarSign },
  { value: "misc", label: "Misc", icon: HelpCircle },
] as const;

const BUDGET_FIELDS: Record<string, string> = {
  materials: "budget_materials",
  labour: "budget_labour",
  subcontract: "budget_subcontract",
  delivery: "budget_delivery",
  overheads: "budget_overheads",
  misc: "budget_misc",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-destructive/50 bg-destructive/5 text-destructive",
  warning: "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  info: "border-primary/50 bg-primary/5 text-primary",
};

interface Props {
  companyId: string;
  job: any;
  onRefresh: () => void;
}

export default function JobProfitabilityTab({ companyId, job, onRefresh }: Props) {
  const [costLines, setCostLines] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  // Budget/forecast editing
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [remainingCost, setRemainingCost] = useState("");
  const [targetMargin, setTargetMargin] = useState("");
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [recalcing, setRecalcing] = useState(false);
  // Form state
  const [formType, setFormType] = useState("materials");
  const [formDesc, setFormDesc] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [formUnitCost, setFormUnitCost] = useState("");
  const [formDate, setFormDate] = useState("");

  const load = useCallback(async () => {
    const [costsRes, invRes, alertsRes] = await Promise.all([
      (supabase.from("cab_job_cost_lines") as any)
        .select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
      (supabase.from("cab_invoices") as any)
        .select("*").eq("job_id", job.id).order("created_at"),
      (supabase.from("cab_job_alerts") as any)
        .select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
    ]);
    setCostLines(costsRes.data ?? []);
    setInvoices(invRes.data ?? []);
    setAlerts(alertsRes.data ?? []);
    // Init budget form from job
    const b: Record<string, string> = {};
    for (const t of COST_TYPES) b[t.value] = String(job[BUDGET_FIELDS[t.value]] ?? "");
    setBudgets(b);
    setRemainingCost(String(job.estimated_remaining_cost ?? ""));
    setTargetMargin(String(job.target_margin_pct ?? ""));
    setLoading(false);
  }, [job.id]);

  useEffect(() => { load(); }, [load]);

  const contractValue = job.contract_value ?? 0;
  const totalCosts = useMemo(() =>
    costLines.reduce((sum, cl) => sum + (Number(cl.line_total) || Number(cl.qty) * Number(cl.unit_cost) || 0), 0),
    [costLines]
  );
  const totalInvoiced = useMemo(() =>
    invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0), [invoices]
  );
  const totalPaid = useMemo(() =>
    invoices.filter((inv: any) => inv.status === "paid").reduce((sum, inv) => sum + Number(inv.amount || 0), 0), [invoices]
  );

  const remaining = Number(job.estimated_remaining_cost) || 0;
  const forecastCost = job.forecast_cost_total ?? (totalCosts + remaining);
  const forecastMargin = job.forecast_margin_pct ?? (contractValue > 0 ? ((contractValue - forecastCost) / contractValue) * 100 : 0);
  const grossProfit = contractValue - totalCosts;
  const grossMargin = contractValue > 0 ? (grossProfit / contractValue) * 100 : 0;

  const marginStatus = grossMargin >= 35 ? "green" : grossMargin >= 25 ? "amber" : "red";
  const forecastStatus = forecastMargin >= 35 ? "green" : forecastMargin >= 25 ? "amber" : "red";
  const marginColors: Record<string, string> = {
    green: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
    amber: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    red: "text-red-600 bg-red-500/10 border-red-500/30",
  };

  const costsByType = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const t of COST_TYPES) grouped[t.value] = [];
    for (const cl of costLines) {
      if (grouped[cl.cost_type]) grouped[cl.cost_type].push(cl);
      else grouped["misc"].push(cl);
    }
    return grouped;
  }, [costLines]);

  const unresolvedAlerts = alerts.filter(a => !a.is_resolved);
  const resolvedAlerts = alerts.filter(a => a.is_resolved);

  const handleAddCost = async () => {
    if (!formDesc.trim() || !formUnitCost) {
      toast({ title: "Fill in description and unit cost", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase.from("cab_job_cost_lines") as any).insert({
        company_id: companyId, job_id: job.id, cost_type: formType,
        description: formDesc.trim(), qty: Number(formQty) || 1,
        unit_cost: Number(formUnitCost) || 0, source: "manual", incurred_at: formDate || null,
      });
      if (error) throw error;
      toast({ title: "Cost line added" });
      setFormDesc(""); setFormQty("1"); setFormUnitCost(""); setFormDate(""); setAdding(false);
      // Wait a tick for recalc trigger, then reload
      setTimeout(() => { load(); onRefresh(); }, 500);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await (supabase.from("cab_job_cost_lines") as any).delete().eq("id", id);
    setTimeout(() => { load(); onRefresh(); }, 500);
  };

  const handleSaveBudgets = async () => {
    setSavingBudgets(true);
    try {
      const updates: any = {
        estimated_remaining_cost: remainingCost ? Number(remainingCost) : null,
        target_margin_pct: targetMargin ? Number(targetMargin) : null,
      };
      for (const t of COST_TYPES) {
        updates[BUDGET_FIELDS[t.value]] = budgets[t.value] ? Number(budgets[t.value]) : null;
      }
      const { error } = await (supabase.from("cab_jobs") as any).update(updates).eq("id", job.id);
      if (error) throw error;
      toast({ title: "Budgets saved" });
      setBudgetEditing(false);
      setTimeout(() => { load(); onRefresh(); }, 500);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSavingBudgets(false); }
  };

  const handleResolveAlert = async (alertId: string) => {
    await (supabase.from("cab_job_alerts") as any).update({
      is_resolved: true, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", alertId);
    load();
  };

  const handleRecalcNow = async () => {
    setRecalcing(true);
    try {
      const { error } = await (supabase.from("cab_events") as any).insert({
        company_id: companyId,
        event_type: "profit.recalc_requested",
        job_id: job.id,
        payload_json: { job_id: job.id },
        status: "pending",
      });
      if (error) throw error;
      toast({ title: "Recalc queued", description: "Profit recalculation will run shortly." });
      // Poll for update after short delay
      setTimeout(() => { load(); onRefresh(); }, 1500);
      setTimeout(() => { load(); onRefresh(); }, 4000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setRecalcing(false); }
  };

  if (loading) {
    return <div className="h-20 flex items-center justify-center"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Alerts */}
      {unresolvedAlerts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-destructive" /> Active Alerts ({unresolvedAlerts.length})
          </h4>
          {unresolvedAlerts.map(a => (
            <div key={a.id} className={`rounded-md border p-2.5 flex items-start justify-between gap-2 ${SEVERITY_STYLES[a.severity] || ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Badge variant={a.severity === "critical" ? "destructive" : "outline"} className="text-[9px]">
                    {a.severity}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs">{a.message}</p>
              </div>
              <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 shrink-0" onClick={() => handleResolveAlert(a.id)}>
                Resolve
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
            <TrendingUp size={14} className="text-primary" /> Profitability
          </h3>
          <Button size="sm" variant="outline" className="text-[10px] h-7 gap-1" onClick={handleRecalcNow} disabled={recalcing}>
            <RefreshCw size={10} className={recalcing ? "animate-spin" : ""} />
            {recalcing ? "Queued…" : "Recalculate Profit Now"}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border border-border p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Contract Value</p>
            <p className="text-lg font-mono font-bold text-foreground">£{contractValue.toLocaleString()}</p>
          </div>
          <div className="rounded-md border border-border p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Actual Costs</p>
            <p className="text-lg font-mono font-bold text-foreground">£{totalCosts.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-md border border-border p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gross Profit</p>
            <p className={`text-lg font-mono font-bold ${grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              £{grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className={`rounded-md border p-3 space-y-1 ${marginColors[marginStatus]}`}>
            <p className="text-[10px] uppercase tracking-wide opacity-70">Gross Margin</p>
            <p className="text-lg font-mono font-bold flex items-center gap-1">
              {grossMargin >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {grossMargin.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Forecast row */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-md border border-border p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Forecast Cost</p>
            <p className="text-lg font-mono font-bold text-foreground">£{Number(forecastCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className={`rounded-md border p-3 space-y-1 ${marginColors[forecastStatus]}`}>
            <p className="text-[10px] uppercase tracking-wide opacity-70">Forecast Margin</p>
            <p className="text-lg font-mono font-bold flex items-center gap-1">
              <Target size={14} /> {Number(forecastMargin).toFixed(1)}%
            </p>
          </div>
          {job.target_margin_pct != null && (
            <div className="rounded-md border border-border p-3 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Target Margin</p>
              <p className="text-lg font-mono font-bold text-foreground">{Number(job.target_margin_pct).toFixed(1)}%</p>
            </div>
          )}
        </div>

        {/* Invoice summary */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Invoiced: <strong className="text-foreground font-mono">£{totalInvoiced.toLocaleString()}</strong></span>
          <span>Paid: <strong className="text-foreground font-mono">£{totalPaid.toLocaleString()}</strong></span>
          <span>Outstanding: <strong className="text-foreground font-mono">£{(totalInvoiced - totalPaid).toLocaleString()}</strong></span>
        </div>
      </div>

      {/* Budget & Remaining Cost */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <DollarSign size={12} className="text-primary" /> Budgets & Remaining Cost
          </h4>
          {!budgetEditing ? (
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setBudgetEditing(true)}>Edit</Button>
          ) : (
            <div className="flex gap-1">
              <Button size="sm" className="text-xs h-7" onClick={handleSaveBudgets} disabled={savingBudgets}>
                {savingBudgets ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setBudgetEditing(false)}>Cancel</Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <Label className="text-[10px]">Est. Remaining Cost (£)</Label>
            <Input type="number" value={remainingCost} onChange={e => setRemainingCost(e.target.value)}
              disabled={!budgetEditing} className="h-8 text-xs" step="0.01" />
          </div>
          <div>
            <Label className="text-[10px]">Target Margin (%)</Label>
            <Input type="number" value={targetMargin} onChange={e => setTargetMargin(e.target.value)}
              disabled={!budgetEditing} className="h-8 text-xs" step="0.1" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {COST_TYPES.map(t => {
            const typeCosts = costsByType[t.value] || [];
            const actual = typeCosts.reduce((s: number, cl: any) => s + (Number(cl.line_total) || Number(cl.qty) * Number(cl.unit_cost) || 0), 0);
            const budgetVal = Number(budgets[t.value]) || 0;
            const over = budgetVal > 0 && actual > budgetVal;
            return (
              <div key={t.value}>
                <Label className="text-[10px] flex items-center gap-1">
                  {t.label} Budget (£)
                  {budgetVal > 0 && (
                    <span className={`text-[9px] font-mono ${over ? "text-destructive" : "text-muted-foreground"}`}>
                      (actual: £{actual.toFixed(0)})
                    </span>
                  )}
                </Label>
                <Input type="number" value={budgets[t.value]} onChange={e => setBudgets(p => ({ ...p, [t.value]: e.target.value }))}
                  disabled={!budgetEditing} className={`h-8 text-xs ${over ? "border-destructive/50" : ""}`} step="0.01" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Cost Breakdown by Type */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h4 className="text-xs font-bold text-foreground">Cost Breakdown</h4>
        <div className="space-y-3">
          {COST_TYPES.map(({ value, label, icon: Icon }) => {
            const lines = costsByType[value] || [];
            const typeTotal = lines.reduce((s: number, cl: any) => s + (Number(cl.line_total) || Number(cl.qty) * Number(cl.unit_cost) || 0), 0);
            if (lines.length === 0) return null;
            return (
              <div key={value} className="rounded-md border border-border">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Icon size={12} className="text-muted-foreground" /> {label}
                  </span>
                  <span className="text-xs font-mono font-bold text-foreground">£{typeTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="divide-y divide-border">
                  {lines.map((cl: any) => (
                    <div key={cl.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="truncate text-foreground">{cl.description}</span>
                        {cl.source !== "manual" && <Badge variant="outline" className="text-[9px] shrink-0">{cl.source}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-muted-foreground">{cl.qty} × £{Number(cl.unit_cost).toFixed(2)}</span>
                        <span className="font-mono font-medium text-foreground w-20 text-right">
                          £{(Number(cl.line_total) || Number(cl.qty) * Number(cl.unit_cost)).toFixed(2)}
                        </span>
                        {cl.source === "manual" && (
                          <button onClick={() => handleDelete(cl.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {costLines.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No cost lines yet.</p>
          )}
        </div>

        {/* Add Cost Line */}
        {adding ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
            <h4 className="text-xs font-bold text-foreground">Add Cost Line</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COST_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Date</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Description</Label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="e.g. Hinges, Blum 110°" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Qty</Label>
                <Input type="number" value={formQty} onChange={e => setFormQty(e.target.value)} min="1" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">Unit Cost (£)</Label>
                <Input type="number" value={formUnitCost} onChange={e => setFormUnitCost(e.target.value)} step="0.01" min="0" className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddCost} disabled={saving} className="text-xs">
                {saving ? "Saving…" : "Add Cost"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)} className="text-xs">Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="text-xs">
            <Plus size={12} /> Add Cost Line
          </Button>
        )}
      </div>

      {/* Resolved Alerts History */}
      {resolvedAlerts.length > 0 && (
        <Collapsible open={showResolved} onOpenChange={setShowResolved}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {showResolved ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <CheckCircle2 size={12} /> Resolved Alerts ({resolvedAlerts.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1.5">
            {resolvedAlerts.map(a => (
              <div key={a.id} className="rounded-md border border-border p-2 text-xs text-muted-foreground flex items-center gap-2">
                <CheckCircle2 size={10} className="shrink-0 text-emerald-500" />
                <span className="flex-1">{a.message}</span>
                <span className="text-[10px]">resolved {formatDistanceToNow(new Date(a.resolved_at), { addSuffix: true })}</span>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
