import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Plus, Save, Trash2, Check, Settings, Sliders,
  BarChart3, AlertTriangle, Calendar, X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ForecastDashboard from "@/components/ForecastDashboard";
import ScenarioComparison from "@/components/ScenarioComparison";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-xs font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";
const btnPrimary = "flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors";
const btnOutline = "flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium text-foreground hover:bg-secondary/50 disabled:opacity-50 transition-colors";

const DEFAULT_ASSUMPTIONS = {
  probability_of_quote_conversion_percent: 70,
  average_days_to_invoice_after_stage_complete: 3,
  average_days_to_pay_after_invoice_due: 0,
  late_payment_probability_percent: 15,
  late_payment_extra_days: 14,
  deposit_probability_percent: 80,
  deposit_percent_of_quote: 30,
  wage_buffer_percent: 0,
  overhead_buffer_percent: 0,
  bill_slippage_probability_percent: 10,
  bill_slippage_extra_days: 7,
};

type Assumptions = typeof DEFAULT_ASSUMPTIONS;

const ASSUMPTION_LABELS: Record<keyof Assumptions, string> = {
  probability_of_quote_conversion_percent: "Quote Conversion Probability (%)",
  average_days_to_invoice_after_stage_complete: "Days to Invoice After Stage Complete",
  average_days_to_pay_after_invoice_due: "Days to Pay After Invoice Due",
  late_payment_probability_percent: "Late Payment Probability (%)",
  late_payment_extra_days: "Late Payment Extra Days",
  deposit_probability_percent: "Deposit Probability (%)",
  deposit_percent_of_quote: "Deposit % of Quote",
  wage_buffer_percent: "Wage Buffer (%)",
  overhead_buffer_percent: "Overhead Buffer (%)",
  bill_slippage_probability_percent: "Bill Slippage Probability (%)",
  bill_slippage_extra_days: "Bill Slippage Extra Days",
};

// ─── Scenarios Tab ────────────────────────────────────────
function ScenariosTab() {
  const { user } = useAuth();
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", is_default: false, assumptions: { ...DEFAULT_ASSUMPTIONS } });

  const load = useCallback(async () => {
    const { data } = await supabase.from("cashflow_scenarios" as any).select("*").eq("active", true).order("created_at");
    setScenarios(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        is_default: form.is_default,
        assumptions_json: form.assumptions,
        created_by_staff_id: user?.id,
      };
      if (editId) {
        const { error } = await (supabase.from("cashflow_scenarios" as any) as any).update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("cashflow_scenarios" as any) as any).insert([payload]);
        if (error) throw error;
      }
      // If setting as default, unset others
      if (form.is_default) {
        const others = scenarios.filter(s => s.id !== editId);
        for (const s of others) {
          if (s.is_default) {
            await (supabase.from("cashflow_scenarios" as any) as any).update({ is_default: false }).eq("id", s.id);
          }
        }
      }
      toast({ title: editId ? "Scenario updated" : "Scenario created" });
      setEditId(null);
      setForm({ name: "", is_default: false, assumptions: { ...DEFAULT_ASSUMPTIONS } });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase.from("cashflow_scenarios" as any) as any).update({ active: false }).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Scenario removed" }); load(); }
  };

  const startEdit = (s: any) => {
    setEditId(s.id);
    const a = s.assumptions_json || DEFAULT_ASSUMPTIONS;
    setForm({ name: s.name, is_default: s.is_default, assumptions: { ...DEFAULT_ASSUMPTIONS, ...a } });
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading scenarios…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-mono text-sm font-bold text-foreground">Forecast Scenarios</h3>
          <p className="text-xs text-muted-foreground">Define scenarios with different assumptions for cashflow forecasting</p>
        </div>
        {!editId && (
          <button onClick={() => setEditId("new")} className={btnPrimary}>
            <Plus size={14} /> New Scenario
          </button>
        )}
      </div>

      {/* Edit/Create Form */}
      {editId && (
        <div className="p-5 rounded-lg border border-border bg-card space-y-4">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase">{editId === "new" ? "Create" : "Edit"} Scenario</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Scenario Name</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Base, Conservative, Optimistic" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="w-4 h-4 rounded border-border accent-primary" />
                <span className="text-sm text-foreground">Default Scenario</span>
              </label>
            </div>
          </div>

          <div>
            <h5 className="font-mono text-[10px] font-bold text-muted-foreground uppercase mb-3">Assumptions</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(Object.keys(ASSUMPTION_LABELS) as (keyof Assumptions)[]).map(key => (
                <div key={key}>
                  <label className={labelClass}>{ASSUMPTION_LABELS[key]}</label>
                  <input
                    type="number"
                    step={key.includes("percent") ? "1" : "1"}
                    className={inputClass}
                    value={form.assumptions[key]}
                    onChange={e => setForm(f => ({
                      ...f,
                      assumptions: { ...f.assumptions, [key]: parseFloat(e.target.value) || 0 },
                    }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.name} className={btnPrimary}>
              <Save size={14} /> {saving ? "Saving…" : "Save Scenario"}
            </button>
            <button onClick={() => { setEditId(null); setForm({ name: "", is_default: false, assumptions: { ...DEFAULT_ASSUMPTIONS } }); }} className={btnOutline}>
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Scenario List */}
      {scenarios.length === 0 && !editId ? (
        <div className="p-8 text-center rounded-lg border border-dashed border-border">
          <BarChart3 size={24} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No scenarios created yet. Create a "Base" scenario to start forecasting.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {scenarios.map(s => (
            <div key={s.id} className={cn("p-4 rounded-lg border transition-colors", s.is_default ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/20")}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-foreground">{s.name}</span>
                  {s.is_default && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">DEFAULT</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => startEdit(s)} className={btnOutline}><Sliders size={12} /> Edit</button>
                  <button onClick={() => handleDelete(s.id)} className="p-2 rounded-md text-destructive hover:bg-destructive/10 transition-colors"><Trash2 size={12} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {(Object.keys(ASSUMPTION_LABELS) as (keyof Assumptions)[]).slice(0, 6).map(key => {
                  const val = s.assumptions_json?.[key] ?? DEFAULT_ASSUMPTIONS[key];
                  return (
                    <div key={key} className="text-center p-1.5 rounded bg-muted/30">
                      <p className="text-xs font-mono font-bold text-foreground">{val}{key.includes("percent") ? "%" : "d"}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{ASSUMPTION_LABELS[key].replace(/ \(%\)| \(Days?\)/g, "")}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────
function ForecastSettingsTab() {
  const [settings, setSettings] = useState<any>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [form, setForm] = useState({
    opening_balance: 0,
    auto_calculate_opening: false,
    default_pay_cycle: "monthly",
    default_scenario_id: "",
    minimum_cash_buffer_amount: 0,
    alert_horizon_days: 30,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [sRes, scRes] = await Promise.all([
      supabase.from("cashflow_settings" as any).select("*").maybeSingle(),
      supabase.from("cashflow_scenarios" as any).select("id, name").eq("active", true),
    ]);
    setScenarios(scRes.data ?? []);
    const d = sRes.data as any;
    if (d) {
      setSettings(d);
      setForm({
        opening_balance: d.opening_balance ?? 0,
        auto_calculate_opening: d.auto_calculate_opening ?? false,
        default_pay_cycle: d.default_pay_cycle ?? "monthly",
        default_scenario_id: d.default_scenario_id ?? "",
        minimum_cash_buffer_amount: d.minimum_cash_buffer_amount ?? 0,
        alert_horizon_days: d.alert_horizon_days ?? 30,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        default_scenario_id: form.default_scenario_id || null,
      };
      if (settings) {
        const { error } = await (supabase.from("cashflow_settings" as any) as any).update(payload).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("cashflow_settings" as any) as any).insert([payload]);
        if (error) throw error;
      }
      toast({ title: "Forecast settings saved" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading settings…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-mono text-sm font-bold text-foreground">Forecast Settings</h3>
          <p className="text-xs text-muted-foreground">Configure global forecast parameters and alert thresholds</p>
        </div>
        <button onClick={handleSave} disabled={saving} className={btnPrimary}>
          <Save size={14} /> {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Opening Cash Balance (£)</label>
          <input type="number" step="0.01" className={inputClass} value={form.opening_balance} onChange={e => setForm(f => ({ ...f, opening_balance: parseFloat(e.target.value) || 0 }))} />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.auto_calculate_opening} onChange={e => setForm(f => ({ ...f, auto_calculate_opening: e.target.checked }))} className="w-4 h-4 rounded border-border accent-primary" />
            <span className="text-sm text-foreground">Auto-calculate from paid invoices/bills</span>
          </label>
        </div>
        <div>
          <label className={labelClass}>Default Pay Cycle</label>
          <select className={inputClass} value={form.default_pay_cycle} onChange={e => setForm(f => ({ ...f, default_pay_cycle: e.target.value }))}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Default Scenario</label>
          <select className={inputClass} value={form.default_scenario_id} onChange={e => setForm(f => ({ ...f, default_scenario_id: e.target.value }))}>
            <option value="">None selected</option>
            {scenarios.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Minimum Cash Buffer (£)</label>
          <input type="number" step="0.01" className={inputClass} value={form.minimum_cash_buffer_amount} onChange={e => setForm(f => ({ ...f, minimum_cash_buffer_amount: parseFloat(e.target.value) || 0 }))} />
          <p className="text-[10px] text-muted-foreground mt-1">Alert triggers when projected balance drops below this</p>
        </div>
        <div>
          <label className={labelClass}>Alert Horizon (Days)</label>
          <input type="number" className={inputClass} value={form.alert_horizon_days} onChange={e => setForm(f => ({ ...f, alert_horizon_days: parseInt(e.target.value) || 30 }))} />
          <p className="text-[10px] text-muted-foreground mt-1">How far ahead to scan for shortfall alerts</p>
        </div>
      </div>
    </div>
  );
}

// ─── Manual Adjustments Tab ───────────────────────────────
function AdjustmentsTab() {
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    scenario_id: "", event_date: "", event_type: "cash_out", description: "",
    amount: 0, recurring: "none", end_date: "",
  });

  const load = useCallback(async () => {
    const [aRes, sRes] = await Promise.all([
      supabase.from("cashflow_adjustments" as any).select("*").eq("active", true).order("event_date"),
      supabase.from("cashflow_scenarios" as any).select("id, name").eq("active", true),
    ]);
    setAdjustments(aRes.data ?? []);
    setScenarios(sRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        scenario_id: form.scenario_id || null,
        event_date: form.event_date,
        event_type: form.event_type,
        description: form.description,
        amount: form.amount,
        recurring: form.recurring,
        end_date: form.end_date || null,
      };
      if (editId && editId !== "new") {
        const { error } = await (supabase.from("cashflow_adjustments" as any) as any).update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("cashflow_adjustments" as any) as any).insert([payload]);
        if (error) throw error;
      }
      toast({ title: editId === "new" ? "Adjustment added" : "Adjustment updated" });
      setEditId(null);
      resetForm();
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await (supabase.from("cashflow_adjustments" as any) as any).update({ active: false }).eq("id", id);
    load();
  };

  const resetForm = () => setForm({ scenario_id: "", event_date: "", event_type: "cash_out", description: "", amount: 0, recurring: "none", end_date: "" });

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading adjustments…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-mono text-sm font-bold text-foreground">Manual Adjustments</h3>
          <p className="text-xs text-muted-foreground">Add one-off or recurring items not tied to invoices/bills</p>
        </div>
        {!editId && (
          <button onClick={() => setEditId("new")} className={btnPrimary}><Plus size={14} /> Add Adjustment</button>
        )}
      </div>

      {editId && (
        <div className="p-5 rounded-lg border border-border bg-card space-y-4">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase">{editId === "new" ? "New" : "Edit"} Adjustment</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Description</label>
              <input className={inputClass} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Equipment purchase" />
            </div>
            <div>
              <label className={labelClass}>Type</label>
              <select className={inputClass} value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}>
                <option value="cash_in">Cash In</option>
                <option value="cash_out">Cash Out</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Amount (£)</label>
              <input type="number" step="0.01" className={inputClass} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className={labelClass}>Event Date</label>
              <input type="date" className={inputClass} value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Recurring</label>
              <select className={inputClass} value={form.recurring} onChange={e => setForm(f => ({ ...f, recurring: e.target.value }))}>
                <option value="none">None (One-off)</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            {form.recurring !== "none" && (
              <div>
                <label className={labelClass}>End Date</label>
                <input type="date" className={inputClass} value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            )}
            <div>
              <label className={labelClass}>Scenario (optional)</label>
              <select className={inputClass} value={form.scenario_id} onChange={e => setForm(f => ({ ...f, scenario_id: e.target.value }))}>
                <option value="">All Scenarios</option>
                {scenarios.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.description || !form.event_date || !form.amount} className={btnPrimary}>
              <Check size={14} /> {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setEditId(null); resetForm(); }} className={btnOutline}><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {adjustments.length === 0 && !editId ? (
        <div className="p-8 text-center rounded-lg border border-dashed border-border">
          <Calendar size={24} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No manual adjustments. Add expected payments or receipts not captured by invoices/bills.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Date</th>
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Description</th>
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Type</th>
              <th className="text-right p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Amount</th>
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Recurring</th>
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Scenario</th>
              <th className="p-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {adjustments.map(a => {
                const scenarioName = scenarios.find((s: any) => s.id === a.scenario_id)?.name || "All";
                return (
                  <tr key={a.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-3 font-mono text-foreground">{a.event_date}</td>
                    <td className="p-3 text-foreground">{a.description}</td>
                    <td className="p-3">
                      <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full", a.event_type === "cash_in" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
                        {a.event_type === "cash_in" ? "IN" : "OUT"}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-foreground">£{Number(a.amount).toFixed(2)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{a.recurring === "none" ? "One-off" : a.recurring}</td>
                    <td className="p-3 text-xs text-muted-foreground">{scenarioName}</td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditId(a.id); setForm({ scenario_id: a.scenario_id || "", event_date: a.event_date, event_type: a.event_type, description: a.description, amount: a.amount, recurring: a.recurring, end_date: a.end_date || "" }); }} className={btnOutline}><Sliders size={12} /></button>
                        <button onClick={() => handleDelete(a.id)} className="p-2 rounded-md text-destructive hover:bg-destructive/10 transition-colors"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function CashflowForecastPage() {
  const { userRole } = useAuth();
  const canAccess = ["admin", "office"].includes(userRole || "");

  if (!canAccess) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        You don't have permission to access cashflow forecasting.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={20} className="text-primary" />
          <h2 className="text-2xl font-mono font-bold text-foreground">Cashflow Forecast</h2>
        </div>
        <p className="text-sm text-muted-foreground">Configure scenarios, assumptions, and manual adjustments for cashflow forecasting</p>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="bg-muted/30 border border-border">
          <TabsTrigger value="dashboard" className="text-xs font-mono">Dashboard</TabsTrigger>
          <TabsTrigger value="compare" className="text-xs font-mono">Compare</TabsTrigger>
          <TabsTrigger value="scenarios" className="text-xs font-mono">Scenarios</TabsTrigger>
          <TabsTrigger value="adjustments" className="text-xs font-mono">Adjustments</TabsTrigger>
          <TabsTrigger value="settings" className="text-xs font-mono">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="glass-panel rounded-lg p-5">
          <ForecastDashboard />
        </TabsContent>
        <TabsContent value="compare" className="glass-panel rounded-lg p-5">
          <ScenarioComparison />
        </TabsContent>
        <TabsContent value="scenarios" className="glass-panel rounded-lg p-5">
          <ScenariosTab />
        </TabsContent>
        <TabsContent value="adjustments" className="glass-panel rounded-lg p-5">
          <AdjustmentsTab />
        </TabsContent>
        <TabsContent value="settings" className="glass-panel rounded-lg p-5">
          <ForecastSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
