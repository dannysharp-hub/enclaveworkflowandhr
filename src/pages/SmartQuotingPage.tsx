import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  Calculator, TrendingUp, Layers, Plus, ArrowRight, Lightbulb,
  DollarSign, PoundSterling, BarChart3, History, FileCheck, Percent,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface QuoteTemplate {
  id: string;
  name: string;
  job_type: string;
  base_material_markup_percent: number;
  base_labour_markup_percent: number;
  base_overhead_percent: number;
  target_margin_percent: number;
  hourly_rate: number;
  active: boolean;
}

interface SmartQuote {
  id: string;
  title: string;
  job_type: string;
  status: string;
  suggested_quote_value: number;
  target_margin_percent: number;
  historical_confidence: number;
  converted_job_id: string | null;
  created_at: string;
}

interface HistoricalData {
  avgCncHoursPerSheet: number;
  avgAssemblyHours: number;
  avgInstallHours: number;
  avgMargin: number;
  avgWastePercent: number;
  dataPoints: number;
  confidence: number;
}

export default function SmartQuotingPage() {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [quotes, setQuotes] = useState<SmartQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const canManage = userRole === "admin" || userRole === "office" || userRole === "engineer";

  const load = useCallback(async () => {
    const [templatesRes, quotesRes] = await Promise.all([
      (supabase.from("quote_templates") as any).select("*").eq("active", true).order("name"),
      (supabase.from("smart_quotes") as any).select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setTemplates(templatesRes.data ?? []);
    setQuotes(quotesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 animate-slide-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="rounded-lg border border-border bg-card p-4 h-20 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const totalQuoteValue = quotes.reduce((s, q) => s + Number(q.suggested_quote_value), 0);
  const convertedCount = quotes.filter(q => q.converted_job_id).length;
  const avgConfidence = quotes.length > 0
    ? Math.round(quotes.reduce((s, q) => s + Number(q.historical_confidence || 0), 0) / quotes.length)
    : 0;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground flex items-center gap-2">
            <Calculator size={20} className="text-primary" /> Smart Quoting
          </h1>
          <p className="text-sm text-muted-foreground">AI-assisted estimates powered by historical production data</p>
        </div>
        {canManage && (
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus size={14} /> New Quote
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI icon={Layers} label="TOTAL QUOTES" value={quotes.length} />
        <KPI icon={PoundSterling} label="TOTAL VALUE" value={`£${Math.round(totalQuoteValue).toLocaleString()}`} variant="primary" />
        <KPI icon={FileCheck} label="CONVERTED" value={convertedCount} variant="primary" />
        <KPI icon={Lightbulb} label="AVG CONFIDENCE" value={`${avgConfidence}%`} variant={avgConfidence > 60 ? "primary" : "warning"} />
      </div>

      {/* Templates */}
      <div className="glass-panel rounded-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-mono text-sm font-bold text-foreground">QUOTE TEMPLATES</h2>
          <span className="text-[10px] font-mono text-muted-foreground">{templates.length} active</span>
        </div>
        {templates.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No templates configured</div>
        ) : (
          <div className="divide-y divide-border">
            {templates.map(t => (
              <div key={t.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{t.job_type} · £{t.hourly_rate}/hr · {t.target_margin_percent}% target margin</p>
                </div>
                <div className="text-right text-[10px] font-mono text-muted-foreground">
                  <p>Material +{t.base_material_markup_percent}%</p>
                  <p>Labour +{t.base_labour_markup_percent}%</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quotes Table */}
      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-mono text-sm font-bold text-foreground">RECENT QUOTES</h2>
        </div>
        {quotes.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No quotes created yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">TITLE</th>
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">TYPE</th>
                  <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">VALUE</th>
                  <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">MARGIN</th>
                  <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">CONFIDENCE</th>
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-2 font-medium text-foreground">{q.title}</td>
                    <td className="px-4 py-2 text-muted-foreground">{q.job_type}</td>
                    <td className="px-4 py-2 text-right font-mono text-foreground">£{Math.round(Number(q.suggested_quote_value)).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn(
                        "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                        Number(q.target_margin_percent) >= 25 ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning"
                      )}>
                        {Number(q.target_margin_percent).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn(
                        "text-[10px] font-mono",
                        Number(q.historical_confidence) > 70 ? "text-primary" : Number(q.historical_confidence) > 40 ? "text-warning" : "text-muted-foreground"
                      )}>
                        {Number(q.historical_confidence).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn(
                        "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                        q.status === "converted" ? "bg-primary/15 text-primary" :
                        q.status === "approved" ? "bg-primary/15 text-primary" :
                        q.status === "draft" ? "bg-muted text-muted-foreground" :
                        "bg-warning/15 text-warning"
                      )}>
                        {q.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Quote Dialog */}
      <SmartQuoteBuilder
        open={createOpen}
        onOpenChange={setCreateOpen}
        templates={templates}
        onSuccess={load}
      />
    </div>
  );
}

// ── Smart Quote Builder Dialog ──

function SmartQuoteBuilder({ open, onOpenChange, templates, onSuccess }: {
  open: boolean; onOpenChange: (o: boolean) => void; templates: QuoteTemplate[]; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    job_type: "general",
    template_id: "",
    estimated_sheets: 10,
    estimated_cnc_sheets: 8,
    assembly_complexity: "medium",
    estimated_install_days: 2,
    use_historical: true,
    spray: false,
    appliances: false,
    subcontract: false,
  });
  const [historical, setHistorical] = useState<HistoricalData | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  const selectedTemplate = templates.find(t => t.id === form.template_id);

  // Fetch historical data when job_type changes
  useEffect(() => {
    if (!form.use_historical || !open) return;
    const fetchHistorical = async () => {
      setLoadingHistorical(true);
      const { data } = await (supabase.from("job_performance_snapshots") as any)
        .select("*")
        .eq("job_type", form.job_type)
        .order("completed_at", { ascending: false })
        .limit(20);

      const snapshots = data ?? [];
      if (snapshots.length === 0) {
        setHistorical(null);
        setLoadingHistorical(false);
        return;
      }

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const totalSheets = snapshots.reduce((s: number, d: any) => s + (d.sheets_used || 1), 0);
      const totalCnc = snapshots.reduce((s: number, d: any) => s + d.cnc_hours, 0);

      setHistorical({
        avgCncHoursPerSheet: totalSheets > 0 ? totalCnc / totalSheets : 0.5,
        avgAssemblyHours: avg(snapshots.map((d: any) => d.assembly_hours)),
        avgInstallHours: avg(snapshots.map((d: any) => d.install_hours)),
        avgMargin: avg(snapshots.map((d: any) => d.margin_percent)),
        avgWastePercent: avg(snapshots.map((d: any) => d.sheets_scrapped / Math.max(d.sheets_used, 1) * 100)),
        dataPoints: snapshots.length,
        confidence: Math.min(100, snapshots.length * 5),
      });
      setLoadingHistorical(false);
    };
    fetchHistorical();
  }, [form.job_type, form.use_historical, open]);

  // Calculate estimate
  useEffect(() => {
    const template = selectedTemplate || {
      base_material_markup_percent: 15,
      base_labour_markup_percent: 20,
      base_overhead_percent: 10,
      target_margin_percent: 25,
      hourly_rate: 35,
    };

    const avgCostPerSheet = 50; // default assumption
    const materialBase = form.estimated_sheets * avgCostPerSheet;
    const materialEstimate = materialBase * (1 + template.base_material_markup_percent / 100);

    const cncHoursPerSheet = historical?.avgCncHoursPerSheet || 0.5;
    const cncHours = form.estimated_cnc_sheets * cncHoursPerSheet;
    const complexityMultiplier = form.assembly_complexity === "low" ? 0.7 : form.assembly_complexity === "high" ? 1.5 : 1;
    const assemblyHours = historical?.avgAssemblyHours || 8 * complexityMultiplier;
    const installHours = (historical?.avgInstallHours || 8) * form.estimated_install_days;
    const totalLabourHours = cncHours + assemblyHours + installHours;
    const labourEstimate = totalLabourHours * template.hourly_rate * (1 + template.base_labour_markup_percent / 100);

    let externalEstimate = 0;
    if (form.spray) externalEstimate += 800;
    if (form.appliances) externalEstimate += 500;
    if (form.subcontract) externalEstimate += 1200;

    const subtotal = materialEstimate + labourEstimate + externalEstimate;
    const overheadEstimate = subtotal * (template.base_overhead_percent / 100);
    const totalCost = subtotal + overheadEstimate;
    const targetMargin = template.target_margin_percent / 100;
    const suggestedValue = totalCost / (1 - targetMargin);
    const deposit = suggestedValue * 0.3;

    setEstimate({
      materialEstimate: Math.round(materialEstimate),
      labourEstimate: Math.round(labourEstimate),
      externalEstimate: Math.round(externalEstimate),
      overheadEstimate: Math.round(overheadEstimate),
      totalCost: Math.round(totalCost),
      suggestedValue: Math.round(suggestedValue),
      deposit: Math.round(deposit),
      targetMargin: template.target_margin_percent,
      cncHours: Math.round(cncHours * 10) / 10,
      assemblyHours: Math.round(assemblyHours * 10) / 10,
      installHours: Math.round(installHours * 10) / 10,
    });
  }, [form, selectedTemplate, historical]);

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase.from("smart_quotes") as any).insert({
        title: form.title,
        job_type: form.job_type,
        template_id: form.template_id || null,
        estimated_sheets: form.estimated_sheets,
        estimated_cnc_sheets: form.estimated_cnc_sheets,
        assembly_complexity: form.assembly_complexity,
        estimated_install_days: form.estimated_install_days,
        special_factors: { spray: form.spray, appliances: form.appliances, subcontract: form.subcontract },
        material_estimate: estimate.materialEstimate,
        labour_estimate: estimate.labourEstimate,
        external_estimate: estimate.externalEstimate,
        overhead_estimate: estimate.overheadEstimate,
        suggested_quote_value: estimate.suggestedValue,
        suggested_deposit: estimate.deposit,
        target_margin_percent: estimate.targetMargin,
        historical_confidence: historical?.confidence || 0,
        use_historical_data: form.use_historical,
      });
      if (error) throw error;
      toast({ title: "Quote created", description: `£${estimate.suggestedValue.toLocaleString()}` });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground flex items-center gap-2">
            <Calculator size={16} className="text-primary" /> Smart Quote Builder
          </DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Left: Inputs */}
          <div className="space-y-3">
            <div>
              <label className={labelClass}>TITLE</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="Kitchen Renovation — Smith" />
            </div>
            <div>
              <label className={labelClass}>JOB TYPE</label>
              <select value={form.job_type} onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))} className={inputClass}>
                <option value="general">General</option>
                <option value="kitchen">Kitchen</option>
                <option value="bedroom">Bedroom</option>
                <option value="bathroom">Bathroom</option>
                <option value="commercial">Commercial</option>
                <option value="bespoke">Bespoke</option>
              </select>
            </div>
            {templates.length > 0 && (
              <div>
                <label className={labelClass}>TEMPLATE</label>
                <select value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))} className={inputClass}>
                  <option value="">Default rates</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>EST. SHEETS</label>
                <input type="number" min={1} value={form.estimated_sheets} onChange={e => setForm(f => ({ ...f, estimated_sheets: Number(e.target.value) }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>CNC SHEETS</label>
                <input type="number" min={0} value={form.estimated_cnc_sheets} onChange={e => setForm(f => ({ ...f, estimated_cnc_sheets: Number(e.target.value) }))} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>ASSEMBLY COMPLEXITY</label>
                <select value={form.assembly_complexity} onChange={e => setForm(f => ({ ...f, assembly_complexity: e.target.value }))} className={inputClass}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>INSTALL DAYS</label>
                <input type="number" min={0.5} step={0.5} value={form.estimated_install_days} onChange={e => setForm(f => ({ ...f, estimated_install_days: Number(e.target.value) }))} className={inputClass} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>SPECIAL FACTORS</label>
              {["spray", "appliances", "subcontract"].map(key => (
                <label key={key} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" checked={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} className="rounded border-input" />
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer pt-2 border-t border-border">
              <input type="checkbox" checked={form.use_historical} onChange={e => setForm(f => ({ ...f, use_historical: e.target.checked }))} className="rounded border-input" />
              <History size={12} className="text-primary" /> Use historical data
            </label>
          </div>

          {/* Right: Estimate output */}
          <div className="space-y-3">
            {/* Historical confidence */}
            {form.use_historical && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb size={12} className="text-primary" />
                  <span className="text-[10px] font-mono font-bold text-muted-foreground">HISTORICAL DATA</span>
                </div>
                {loadingHistorical ? (
                  <p className="text-xs text-muted-foreground">Loading...</p>
                ) : historical ? (
                  <div className="space-y-1 text-[10px] font-mono text-muted-foreground">
                    <p>{historical.dataPoints} similar jobs found</p>
                    <p>CNC: {historical.avgCncHoursPerSheet.toFixed(2)} hrs/sheet</p>
                    <p>Avg margin: {historical.avgMargin.toFixed(1)}%</p>
                    <p>Waste: {historical.avgWastePercent.toFixed(1)}%</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={historical.confidence} className="h-1 flex-1" />
                      <span className={cn("font-bold", historical.confidence > 60 ? "text-primary" : "text-warning")}>{historical.confidence}%</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No historical data for "{form.job_type}"</p>
                )}
              </div>
            )}

            {/* Estimate breakdown */}
            {estimate && (
              <>
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <h4 className="text-[10px] font-mono font-bold text-muted-foreground mb-2">COST BREAKDOWN</h4>
                  <EstRow label="Materials" value={estimate.materialEstimate} />
                  <EstRow label={`Labour (${estimate.cncHours + estimate.assemblyHours + estimate.installHours}hrs)`} value={estimate.labourEstimate} />
                  <EstRow label="External" value={estimate.externalEstimate} />
                  <EstRow label="Overhead" value={estimate.overheadEstimate} />
                  <div className="border-t border-border pt-2">
                    <EstRow label="Total Cost" value={estimate.totalCost} bold />
                  </div>
                </div>

                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <h4 className="text-[10px] font-mono font-bold text-primary mb-2">SUGGESTED QUOTE</h4>
                  <div className="text-2xl font-mono font-bold text-primary">
                    £{estimate.suggestedValue.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
                    <span>Deposit: £{estimate.deposit.toLocaleString()}</span>
                    <span>Target: {estimate.targetMargin}% margin</span>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting || !form.title.trim()}
                  className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Save Quote"}
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EstRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-xs", bold ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn("text-xs font-mono", bold ? "font-bold text-foreground" : "text-foreground")}>£{value.toLocaleString()}</span>
    </div>
  );
}

function KPI({ icon: Icon, label, value, variant = "default" }: {
  icon: any; label: string; value: string | number;
  variant?: "default" | "primary" | "warning" | "danger";
}) {
  const colors = { default: "text-foreground", primary: "text-primary", warning: "text-warning", danger: "text-destructive" };
  const iconColors = { default: "text-muted-foreground", primary: "text-primary", warning: "text-warning", danger: "text-destructive" };
  return (
    <div className="glass-panel rounded-lg p-4 text-center">
      <Icon size={16} className={cn(iconColors[variant], "mx-auto mb-1")} />
      <p className={cn("text-2xl font-mono font-bold", colors[variant])}>{value}</p>
      <p className="text-[10px] font-mono text-muted-foreground tracking-wide">{label}</p>
    </div>
  );
}
