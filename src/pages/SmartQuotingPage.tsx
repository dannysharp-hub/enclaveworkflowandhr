import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Calculator, TrendingUp, Layers, Plus, ArrowRight, Lightbulb,
  PoundSterling, BarChart3, History, FileCheck, Percent, Eye,
  MessageSquare, CheckCircle2, Copy, Pencil, Trash2, ChevronDown,
  ChevronUp, Settings, Send, X, Check, Users,
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
  drift_adjusted_value: number;
  drift_adjustment_percent: number;
  target_margin_percent: number;
  historical_confidence: number;
  converted_job_id: string | null;
  customer_id: string | null;
  material_estimate: number;
  labour_estimate: number;
  external_estimate: number;
  overhead_estimate: number;
  margin_sensitivity: any;
  version_count: number;
  notes_count: number;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

interface HistoricalData {
  avgCncHoursPerSheet: number;
  avgAssemblyHours: number;
  avgInstallHours: number;
  avgMargin: number;
  avgWastePercent: number;
  avgDriftPercent: number;
  dataPoints: number;
  confidence: number;
}

export default function SmartQuotingPage() {
  const { userRole, profile } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [quotes, setQuotes] = useState<SmartQuote[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailQuote, setDetailQuote] = useState<SmartQuote | null>(null);
  const [templateMgrOpen, setTemplateMgrOpen] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const canManage = userRole === "admin" || userRole === "office" || userRole === "engineer";

  const load = useCallback(async () => {
    const [templatesRes, quotesRes, custRes] = await Promise.all([
      (supabase.from("quote_templates") as any).select("*").order("name"),
      (supabase.from("smart_quotes") as any).select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("customers").select("id, name").eq("active", true).order("name"),
    ]);
    setTemplates(templatesRes.data ?? []);
    setQuotes(quotesRes.data ?? []);
    setCustomers(custRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleConvertToJob = async (quote: SmartQuote) => {
    if (converting) return;
    setConverting(quote.id);
    try {
      const jobId = `SQ-${Date.now().toString(36).toUpperCase()}`;
      const quoteValue = Number(quote.drift_adjusted_value) > 0 ? quote.drift_adjusted_value : quote.suggested_quote_value;
      const { data: newJob, error: jobErr } = await supabase.from("jobs").insert({
        job_id: jobId,
        job_name: quote.title,
        status: "Not Started",
        customer_id: quote.customer_id || null,
      } as any).select("id").single();
      if (jobErr) throw jobErr;

      await supabase.from("job_financials").insert({
        job_id: newJob.id,
        quote_value_ex_vat: quoteValue,
        deposit_required: Number(quoteValue) * 0.3,
        revenue_status: "quoted",
        customer_id: quote.customer_id || null,
      } as any);

      await (supabase.from("smart_quotes") as any).update({ status: "converted", converted_job_id: newJob.id }).eq("id", quote.id);
      toast({ title: "Job created", description: `${jobId} from quote` });

      // Auto-create Drive folder (fire & forget)
      supabase.functions.invoke("google-drive-auth", {
        body: { action: "create_job_folder", job_id: newJob.id },
      }).catch(() => {});
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setConverting(null); }
  };

  const handleApprove = async (quote: SmartQuote) => {
    await (supabase.from("smart_quotes") as any).update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: profile?.full_name || "Staff",
    }).eq("id", quote.id);
    toast({ title: "Quote approved" });
    load();
  };

  const filtered = quotes.filter(q => {
    if (filterStatus !== "all" && q.status !== filterStatus) return false;
    if (search && !q.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalQuoteValue = quotes.reduce((s, q) => s + Number(q.suggested_quote_value), 0);
  const convertedCount = quotes.filter(q => q.converted_job_id).length;
  const avgConfidence = quotes.length > 0
    ? Math.round(quotes.reduce((s, q) => s + Number(q.historical_confidence || 0), 0) / quotes.length) : 0;
  const pipelineValue = quotes.filter(q => ["draft", "approved"].includes(q.status))
    .reduce((s, q) => s + Number(q.drift_adjusted_value || q.suggested_quote_value), 0);

  if (loading) {
    return <div className="space-y-4 animate-slide-in"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i => <div key={i} className="rounded-lg border border-border bg-card p-4 h-20 animate-pulse" />)}</div></div>;
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground flex items-center gap-2">
            <Calculator size={20} className="text-primary" /> Smart Quoting
          </h1>
          <p className="text-sm text-muted-foreground">Data-driven estimates with drift adjustment & margin analysis</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <button onClick={() => setTemplateMgrOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">
                <Settings size={14} /> Templates
              </button>
              <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Plus size={14} /> New Quote
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI icon={Layers} label="TOTAL QUOTES" value={quotes.length} />
        <KPI icon={PoundSterling} label="PIPELINE" value={`£${Math.round(pipelineValue).toLocaleString()}`} variant="primary" />
        <KPI icon={FileCheck} label="CONVERTED" value={convertedCount} variant="primary" />
        <KPI icon={Lightbulb} label="AVG CONFIDENCE" value={`${avgConfidence}%`} variant={avgConfidence > 60 ? "primary" : "warning"} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-card pl-3 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search quotes..." />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground">
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="converted">Converted</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Quotes Table */}
      <div className="glass-panel rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No quotes found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">TITLE</th>
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">TYPE</th>
                  <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">BASE VALUE</th>
                  <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">DRIFT ADJ.</th>
                  <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">MARGIN</th>
                  <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">CONFIDENCE</th>
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">STATUS</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(q => {
                  const driftVal = Number(q.drift_adjusted_value);
                  const driftPct = Number(q.drift_adjustment_percent);
                  return (
                    <tr key={q.id} className="border-b border-border last:border-0 hover:bg-secondary/20 cursor-pointer" onClick={() => setDetailQuote(q)}>
                      <td className="px-4 py-2 font-medium text-foreground">{q.title}</td>
                      <td className="px-4 py-2 text-muted-foreground">{q.job_type}</td>
                      <td className="px-4 py-2 text-right font-mono text-foreground">£{Math.round(Number(q.suggested_quote_value)).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        {driftVal > 0 ? (
                          <span className="font-mono text-xs">
                            <span className="text-foreground">£{Math.round(driftVal).toLocaleString()}</span>
                            <span className={cn("ml-1 text-[10px]", driftPct > 0 ? "text-destructive" : "text-primary")}>
                              {driftPct > 0 ? "+" : ""}{driftPct.toFixed(1)}%
                            </span>
                          </span>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={cn("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                          Number(q.target_margin_percent) >= 25 ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning"
                        )}>{Number(q.target_margin_percent).toFixed(0)}%</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={cn("text-[10px] font-mono",
                          Number(q.historical_confidence) > 70 ? "text-primary" : Number(q.historical_confidence) > 40 ? "text-warning" : "text-muted-foreground"
                        )}>{Number(q.historical_confidence).toFixed(0)}%</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                          q.status === "converted" ? "bg-primary/15 text-primary" :
                          q.status === "approved" ? "bg-primary/15 text-primary" :
                          q.status === "draft" ? "bg-muted text-muted-foreground" :
                          q.status === "rejected" ? "bg-destructive/15 text-destructive" :
                          "bg-warning/15 text-warning"
                        )}>{q.status}</span>
                      </td>
                      <td className="px-4 py-2">
                        <Eye size={14} className="text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Quote Dialog */}
      <SmartQuoteBuilder open={createOpen} onOpenChange={setCreateOpen} templates={templates.filter(t => t.active)} customers={customers} onSuccess={load} />

      {/* Quote Detail Dialog */}
      <QuoteDetailDialog quote={detailQuote} onClose={() => setDetailQuote(null)} onUpdate={load} canManage={canManage}
        onConvert={handleConvertToJob} onApprove={handleApprove} converting={converting} profileName={profile?.full_name || "Staff"} />

      {/* Template Manager */}
      <TemplateManager open={templateMgrOpen} onOpenChange={setTemplateMgrOpen} templates={templates} onUpdate={load} />
    </div>
  );
}

// ── Smart Quote Builder ──
function SmartQuoteBuilder({ open, onOpenChange, templates, customers, onSuccess }: {
  open: boolean; onOpenChange: (o: boolean) => void; templates: QuoteTemplate[]; customers: any[]; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    title: "", job_type: "general", template_id: "", customer_id: "",
    estimated_sheets: 10, estimated_cnc_sheets: 8, assembly_complexity: "medium",
    estimated_install_days: 2, use_historical: true, spray: false, appliances: false, subcontract: false,
  });
  const [historical, setHistorical] = useState<HistoricalData | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  const selectedTemplate = templates.find(t => t.id === form.template_id);

  useEffect(() => {
    if (!form.use_historical || !open) return;
    const fetchHistorical = async () => {
      setLoadingHistorical(true);
      const [snapRes, driftRes] = await Promise.all([
        (supabase.from("job_performance_snapshots") as any).select("*").eq("job_type", form.job_type).order("completed_at", { ascending: false }).limit(20),
        (supabase.from("drift_reasons") as any).select("*").limit(50),
      ]);
      const snapshots = snapRes.data ?? [];
      const driftData = driftRes.data ?? [];

      if (snapshots.length === 0) { setHistorical(null); setLoadingHistorical(false); return; }

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const totalSheets = snapshots.reduce((s: number, d: any) => s + (d.sheets_used || 1), 0);
      const totalCnc = snapshots.reduce((s: number, d: any) => s + d.cnc_hours, 0);

      // Calculate average drift from historical margin vs target
      const marginDiffs = snapshots.filter((d: any) => d.margin_percent != null && d.target_margin != null)
        .map((d: any) => d.margin_percent - (d.target_margin || 25));
      const avgDrift = marginDiffs.length > 0 ? avg(marginDiffs) : 0;

      setHistorical({
        avgCncHoursPerSheet: totalSheets > 0 ? totalCnc / totalSheets : 0.5,
        avgAssemblyHours: avg(snapshots.map((d: any) => d.assembly_hours)),
        avgInstallHours: avg(snapshots.map((d: any) => d.install_hours)),
        avgMargin: avg(snapshots.map((d: any) => d.margin_percent)),
        avgWastePercent: avg(snapshots.map((d: any) => d.sheets_scrapped / Math.max(d.sheets_used, 1) * 100)),
        avgDriftPercent: avgDrift,
        dataPoints: snapshots.length,
        confidence: Math.min(100, snapshots.length * 5),
      });
      setLoadingHistorical(false);
    };
    fetchHistorical();
  }, [form.job_type, form.use_historical, open]);

  useEffect(() => {
    const template = selectedTemplate || { base_material_markup_percent: 15, base_labour_markup_percent: 20, base_overhead_percent: 10, target_margin_percent: 25, hourly_rate: 35 };
    const avgCostPerSheet = 50;
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

    // Drift adjustment
    const driftPct = historical?.avgDriftPercent || 0;
    const driftAdjustment = driftPct < 0 ? Math.abs(driftPct) : 0; // If historically under-quoting, add buffer
    const driftAdjustedValue = suggestedValue * (1 + driftAdjustment / 100);

    // Margin sensitivity: what happens at ±5% margin
    const marginSensitivity = {
      low: { margin: template.target_margin_percent - 5, value: Math.round(totalCost / (1 - (template.target_margin_percent - 5) / 100)) },
      target: { margin: template.target_margin_percent, value: Math.round(suggestedValue) },
      high: { margin: template.target_margin_percent + 5, value: Math.round(totalCost / (1 - (template.target_margin_percent + 5) / 100)) },
    };

    setEstimate({
      materialEstimate: Math.round(materialEstimate),
      labourEstimate: Math.round(labourEstimate),
      externalEstimate: Math.round(externalEstimate),
      overheadEstimate: Math.round(overheadEstimate),
      totalCost: Math.round(totalCost),
      suggestedValue: Math.round(suggestedValue),
      driftAdjustedValue: Math.round(driftAdjustedValue),
      driftAdjustmentPercent: Math.round(driftAdjustment * 10) / 10,
      deposit: Math.round(deposit),
      targetMargin: template.target_margin_percent,
      cncHours: Math.round(cncHours * 10) / 10,
      assemblyHours: Math.round(assemblyHours * 10) / 10,
      installHours: Math.round(installHours * 10) / 10,
      marginSensitivity,
    });
  }, [form, selectedTemplate, historical]);

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const { error } = await (supabase.from("smart_quotes") as any).insert({
        title: form.title, job_type: form.job_type, template_id: form.template_id || null,
        customer_id: form.customer_id || null,
        estimated_sheets: form.estimated_sheets, estimated_cnc_sheets: form.estimated_cnc_sheets,
        assembly_complexity: form.assembly_complexity, estimated_install_days: form.estimated_install_days,
        special_factors: { spray: form.spray, appliances: form.appliances, subcontract: form.subcontract },
        material_estimate: estimate.materialEstimate, labour_estimate: estimate.labourEstimate,
        external_estimate: estimate.externalEstimate, overhead_estimate: estimate.overheadEstimate,
        suggested_quote_value: estimate.suggestedValue, suggested_deposit: estimate.deposit,
        drift_adjusted_value: estimate.driftAdjustedValue, drift_adjustment_percent: estimate.driftAdjustmentPercent,
        target_margin_percent: estimate.targetMargin, historical_confidence: historical?.confidence || 0,
        use_historical_data: form.use_historical, margin_sensitivity: estimate.marginSensitivity,
      });
      if (error) throw error;
      toast({ title: "Quote created", description: `£${estimate.suggestedValue.toLocaleString()}` });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSubmitting(false); }
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>JOB TYPE</label>
                <select value={form.job_type} onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))} className={inputClass}>
                  {["general", "kitchen", "bedroom", "bathroom", "commercial", "bespoke"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>CUSTOMER</label>
                <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} className={inputClass}>
                  <option value="">No customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
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
              <div><label className={labelClass}>EST. SHEETS</label><input type="number" min={1} value={form.estimated_sheets} onChange={e => setForm(f => ({ ...f, estimated_sheets: Number(e.target.value) }))} className={inputClass} /></div>
              <div><label className={labelClass}>CNC SHEETS</label><input type="number" min={0} value={form.estimated_cnc_sheets} onChange={e => setForm(f => ({ ...f, estimated_cnc_sheets: Number(e.target.value) }))} className={inputClass} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>ASSEMBLY COMPLEXITY</label>
                <select value={form.assembly_complexity} onChange={e => setForm(f => ({ ...f, assembly_complexity: e.target.value }))} className={inputClass}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </div>
              <div><label className={labelClass}>INSTALL DAYS</label><input type="number" min={0.5} step={0.5} value={form.estimated_install_days} onChange={e => setForm(f => ({ ...f, estimated_install_days: Number(e.target.value) }))} className={inputClass} /></div>
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
              <History size={12} className="text-primary" /> Use historical data + drift adjustment
            </label>
          </div>

          {/* Right: Estimate */}
          <div className="space-y-3">
            {form.use_historical && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb size={12} className="text-primary" />
                  <span className="text-[10px] font-mono font-bold text-muted-foreground">HISTORICAL DATA</span>
                </div>
                {loadingHistorical ? <p className="text-xs text-muted-foreground">Loading...</p> : historical ? (
                  <div className="space-y-1 text-[10px] font-mono text-muted-foreground">
                    <p>{historical.dataPoints} similar jobs · CNC: {historical.avgCncHoursPerSheet.toFixed(2)} hrs/sheet</p>
                    <p>Avg margin: {historical.avgMargin.toFixed(1)}% · Waste: {historical.avgWastePercent.toFixed(1)}%</p>
                    {historical.avgDriftPercent !== 0 && (
                      <p className={cn(historical.avgDriftPercent < 0 ? "text-destructive" : "text-primary")}>
                        Drift: {historical.avgDriftPercent > 0 ? "+" : ""}{historical.avgDriftPercent.toFixed(1)}% avg vs target
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={historical.confidence} className="h-1 flex-1" />
                      <span className={cn("font-bold", historical.confidence > 60 ? "text-primary" : "text-warning")}>{historical.confidence}%</span>
                    </div>
                  </div>
                ) : <p className="text-xs text-muted-foreground">No data for "{form.job_type}"</p>}
              </div>
            )}

            {estimate && (
              <>
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <h4 className="text-[10px] font-mono font-bold text-muted-foreground mb-2">COST BREAKDOWN</h4>
                  <EstRow label="Materials" value={estimate.materialEstimate} />
                  <EstRow label={`Labour (${(estimate.cncHours + estimate.assemblyHours + estimate.installHours).toFixed(1)}hrs)`} value={estimate.labourEstimate} />
                  <EstRow label="External" value={estimate.externalEstimate} />
                  <EstRow label="Overhead" value={estimate.overheadEstimate} />
                  <div className="border-t border-border pt-2"><EstRow label="Total Cost" value={estimate.totalCost} bold /></div>
                </div>

                {/* Margin Sensitivity */}
                <div className="rounded-lg border border-border bg-card p-3">
                  <h4 className="text-[10px] font-mono font-bold text-muted-foreground mb-2">MARGIN SENSITIVITY</h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {["low", "target", "high"].map(level => {
                      const s = estimate.marginSensitivity[level];
                      return (
                        <div key={level} className={cn("rounded-md p-2 border", level === "target" ? "border-primary/30 bg-primary/5" : "border-border")}>
                          <p className="text-[9px] font-mono text-muted-foreground">{s.margin}%</p>
                          <p className={cn("text-sm font-mono font-bold", level === "target" ? "text-primary" : "text-foreground")}>£{s.value.toLocaleString()}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <h4 className="text-[10px] font-mono font-bold text-primary mb-2">SUGGESTED QUOTE</h4>
                  <div className="text-2xl font-mono font-bold text-primary">£{estimate.suggestedValue.toLocaleString()}</div>
                  {estimate.driftAdjustmentPercent > 0 && (
                    <div className="text-xs font-mono">
                      <span className="text-muted-foreground">Drift-adjusted: </span>
                      <span className="text-warning font-bold">£{estimate.driftAdjustedValue.toLocaleString()}</span>
                      <span className="text-[10px] text-destructive ml-1">+{estimate.driftAdjustmentPercent}%</span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
                    <span>Deposit: £{estimate.deposit.toLocaleString()}</span>
                    <span>Target: {estimate.targetMargin}%</span>
                  </div>
                </div>

                <button onClick={handleSubmit} disabled={submitting || !form.title.trim()}
                  className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
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

// ── Quote Detail Dialog ──
function QuoteDetailDialog({ quote, onClose, onUpdate, canManage, onConvert, onApprove, converting, profileName }: {
  quote: SmartQuote | null; onClose: () => void; onUpdate: () => void; canManage: boolean;
  onConvert: (q: SmartQuote) => void; onApprove: (q: SmartQuote) => void; converting: string | null; profileName: string;
}) {
  const [tab, setTab] = useState<"breakdown" | "notes" | "versions">("breakdown");
  const [notes, setNotes] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");

  useEffect(() => {
    if (!quote) return;
    setTab("breakdown");
    Promise.all([
      (supabase.from("quote_notes") as any).select("*").eq("quote_id", quote.id).order("created_at", { ascending: false }),
      (supabase.from("quote_versions") as any).select("*").eq("quote_id", quote.id).order("version_number", { ascending: false }),
    ]).then(([notesRes, versionsRes]) => {
      setNotes(notesRes.data ?? []);
      setVersions(versionsRes.data ?? []);
    });
  }, [quote]);

  if (!quote) return null;

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await (supabase.from("quote_notes") as any).insert({
      quote_id: quote.id, author_name: profileName, note: newNote.trim(),
    });
    await (supabase.from("smart_quotes") as any).update({ notes_count: (quote.notes_count || 0) + 1 }).eq("id", quote.id);
    setNewNote("");
    const { data } = await (supabase.from("quote_notes") as any).select("*").eq("quote_id", quote.id).order("created_at", { ascending: false });
    setNotes(data ?? []);
    toast({ title: "Note added" });
  };

  const driftVal = Number(quote.drift_adjusted_value);
  const sensitivity = quote.margin_sensitivity as any;

  const tabClass = (t: string) => cn("px-3 py-1.5 text-xs font-mono rounded-md transition-colors",
    tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30");

  return (
    <Dialog open={!!quote} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">{quote.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-border bg-card p-2">
              <p className="text-[9px] font-mono text-muted-foreground">BASE</p>
              <p className="text-lg font-mono font-bold text-foreground">£{Math.round(Number(quote.suggested_quote_value)).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
              <p className="text-[9px] font-mono text-primary">DRIFT ADJ.</p>
              <p className="text-lg font-mono font-bold text-primary">
                {driftVal > 0 ? `£${Math.round(driftVal).toLocaleString()}` : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-2">
              <p className="text-[9px] font-mono text-muted-foreground">CONFIDENCE</p>
              <p className={cn("text-lg font-mono font-bold", Number(quote.historical_confidence) > 60 ? "text-primary" : "text-warning")}>
                {Number(quote.historical_confidence).toFixed(0)}%
              </p>
            </div>
          </div>

          {/* Status & actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full",
              quote.status === "approved" ? "bg-primary/15 text-primary" :
              quote.status === "converted" ? "bg-primary/15 text-primary" :
              quote.status === "rejected" ? "bg-destructive/15 text-destructive" :
              "bg-muted text-muted-foreground"
            )}>{quote.status}</span>
            <span className="text-[10px] text-muted-foreground">{quote.job_type} · {format(new Date(quote.created_at), "dd MMM yyyy")}</span>
            {quote.approved_by && <span className="text-[10px] text-primary">Approved by {quote.approved_by}</span>}
            <div className="flex-1" />
            {canManage && quote.status === "draft" && (
              <button onClick={() => onApprove(quote)} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-[10px] font-medium text-primary-foreground hover:bg-primary/90">
                <CheckCircle2 size={10} /> Approve
              </button>
            )}
            {canManage && !quote.converted_job_id && (
              <button onClick={() => onConvert(quote)} disabled={!!converting}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-primary/30 text-[10px] text-primary hover:bg-primary/10 disabled:opacity-50">
                <ArrowRight size={10} /> Convert to Job
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
            <button className={tabClass("breakdown")} onClick={() => setTab("breakdown")}>Breakdown</button>
            <button className={tabClass("notes")} onClick={() => setTab("notes")}>Notes ({notes.length})</button>
            <button className={tabClass("versions")} onClick={() => setTab("versions")}>Versions ({versions.length})</button>
          </div>

          {tab === "breakdown" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                <EstRow label="Materials" value={Number(quote.material_estimate)} />
                <EstRow label="Labour" value={Number(quote.labour_estimate)} />
                <EstRow label="External" value={Number(quote.external_estimate)} />
                <EstRow label="Overhead" value={Number(quote.overhead_estimate)} />
                <div className="border-t border-border pt-2">
                  <EstRow label="Total Cost" value={Number(quote.material_estimate) + Number(quote.labour_estimate) + Number(quote.external_estimate) + Number(quote.overhead_estimate)} bold />
                </div>
              </div>
              {sensitivity && typeof sensitivity === "object" && sensitivity.low && (
                <div className="rounded-lg border border-border bg-card p-3">
                  <h4 className="text-[10px] font-mono font-bold text-muted-foreground mb-2">MARGIN SENSITIVITY</h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {["low", "target", "high"].map(level => {
                      const s = sensitivity[level];
                      return s ? (
                        <div key={level} className={cn("rounded-md p-2 border", level === "target" ? "border-primary/30 bg-primary/5" : "border-border")}>
                          <p className="text-[9px] font-mono text-muted-foreground">{s.margin}%</p>
                          <p className={cn("text-sm font-mono font-bold", level === "target" ? "text-primary" : "text-foreground")}>£{Number(s.value).toLocaleString()}</p>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "notes" && (
            <div className="space-y-3">
              {canManage && (
                <div className="flex gap-2">
                  <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddNote()}
                    className="flex-1 h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Add a note..." />
                  <button onClick={handleAddNote} disabled={!newNote.trim()}
                    className="h-9 px-3 rounded-md bg-primary text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Add</button>
                </div>
              )}
              {notes.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No notes yet</p> : (
                <div className="space-y-2">
                  {notes.map(n => (
                    <div key={n.id} className="rounded-lg border border-border bg-card p-2.5">
                      <p className="text-xs text-foreground">{n.note}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">{n.author_name} · {format(new Date(n.created_at), "dd MMM HH:mm")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "versions" && (
            <div className="space-y-2">
              {versions.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">No version history</p> : (
                versions.map(v => (
                  <div key={v.id} className="rounded-lg border border-border bg-card p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-foreground">v{v.version_number}</span>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(v.created_at), "dd MMM yyyy HH:mm")}</span>
                    </div>
                    {v.change_summary && <p className="text-xs text-muted-foreground mt-1">{v.change_summary}</p>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Template Manager ──
function TemplateManager({ open, onOpenChange, templates, onUpdate }: {
  open: boolean; onOpenChange: (o: boolean) => void; templates: QuoteTemplate[]; onUpdate: () => void;
}) {
  const [editing, setEditing] = useState<QuoteTemplate | null>(null);
  const [form, setForm] = useState({ name: "", job_type: "general", hourly_rate: 35, base_material_markup_percent: 15, base_labour_markup_percent: 20, base_overhead_percent: 10, target_margin_percent: 25 });
  const [saving, setSaving] = useState(false);

  const startEdit = (t?: QuoteTemplate) => {
    if (t) {
      setEditing(t);
      setForm({ name: t.name, job_type: t.job_type, hourly_rate: t.hourly_rate, base_material_markup_percent: t.base_material_markup_percent, base_labour_markup_percent: t.base_labour_markup_percent, base_overhead_percent: t.base_overhead_percent, target_margin_percent: t.target_margin_percent });
    } else {
      setEditing({} as any);
      setForm({ name: "", job_type: "general", hourly_rate: 35, base_material_markup_percent: 15, base_labour_markup_percent: 20, base_overhead_percent: 10, target_margin_percent: 25 });
    }
  };

  const handleSave = async () => {
    if (!form.name) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        await (supabase.from("quote_templates") as any).update(form).eq("id", editing.id);
      } else {
        await (supabase.from("quote_templates") as any).insert(form);
      }
      toast({ title: editing?.id ? "Template updated" : "Template created" });
      setEditing(null);
      onUpdate();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDuplicate = async (t: QuoteTemplate) => {
    await (supabase.from("quote_templates") as any).insert({ ...t, id: undefined, name: `${t.name} (Copy)`, created_at: undefined, updated_at: undefined });
    toast({ title: "Template duplicated" });
    onUpdate();
  };

  const handleToggle = async (t: QuoteTemplate) => {
    await (supabase.from("quote_templates") as any).update({ active: !t.active }).eq("id", t.id);
    onUpdate();
  };

  const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground flex items-center gap-2">
            <Settings size={16} className="text-primary" /> Quote Templates
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <button onClick={() => startEdit()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={12} /> New Template
          </button>

          {editing && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>NAME</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} /></div>
                <div>
                  <label className={labelClass}>JOB TYPE</label>
                  <select value={form.job_type} onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))} className={inputClass}>
                    {["general", "kitchen", "bedroom", "bathroom", "commercial", "bespoke"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>HOURLY RATE (£)</label><input type="number" value={form.hourly_rate} onChange={e => setForm(f => ({ ...f, hourly_rate: Number(e.target.value) }))} className={inputClass} /></div>
                <div><label className={labelClass}>TARGET MARGIN %</label><input type="number" value={form.target_margin_percent} onChange={e => setForm(f => ({ ...f, target_margin_percent: Number(e.target.value) }))} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelClass}>MATERIAL +%</label><input type="number" value={form.base_material_markup_percent} onChange={e => setForm(f => ({ ...f, base_material_markup_percent: Number(e.target.value) }))} className={inputClass} /></div>
                <div><label className={labelClass}>LABOUR +%</label><input type="number" value={form.base_labour_markup_percent} onChange={e => setForm(f => ({ ...f, base_labour_markup_percent: Number(e.target.value) }))} className={inputClass} /></div>
                <div><label className={labelClass}>OVERHEAD %</label><input type="number" value={form.base_overhead_percent} onChange={e => setForm(f => ({ ...f, base_overhead_percent: Number(e.target.value) }))} className={inputClass} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  <Check size={12} /> {editing.id ? "Update" : "Create"}
                </button>
                <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{t.job_type} · £{t.hourly_rate}/hr · {t.target_margin_percent}% margin · Mat +{t.base_material_markup_percent}% · Lab +{t.base_labour_markup_percent}%</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggle(t)} className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full", t.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{t.active ? "Active" : "Off"}</button>
                  <button onClick={() => handleDuplicate(t)} className="p-1 text-muted-foreground hover:text-foreground"><Copy size={12} /></button>
                  <button onClick={() => startEdit(t)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
                </div>
              </div>
            ))}
            {templates.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No templates yet</p>}
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
  icon: any; label: string; value: string | number; variant?: "default" | "primary" | "warning" | "danger";
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
