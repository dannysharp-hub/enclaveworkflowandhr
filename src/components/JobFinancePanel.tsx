import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DollarSign, Receipt, Wallet, Save, TrendingUp, TrendingDown, Package } from "lucide-react";

const inputClass = "w-full h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-0.5 uppercase tracking-wider";

interface PartData {
  material_code: string | null;
  length_mm: number;
  width_mm: number;
  quantity: number;
}

interface MaterialProduct {
  material_code: string;
  cost_per_sheet: number;
  sheet_length_mm: number;
  sheet_width_mm: number;
  waste_factor_percent: number;
}

interface Props {
  jobId: string;
  jobCode: string;
  parts?: PartData[];
  materialProducts?: MaterialProduct[];
}

/**
 * Estimate sheets needed for a group of parts on a given material.
 * Simple area-based estimate: total part area (with waste) / sheet area.
 */
function estimateSheetsForMaterial(
  parts: PartData[],
  mat: MaterialProduct
): number {
  const sheetArea = mat.sheet_length_mm * mat.sheet_width_mm;
  if (sheetArea <= 0) return 0;
  const wasteMul = 1 + (mat.waste_factor_percent / 100);
  const totalPartArea = parts.reduce(
    (sum, p) => sum + p.length_mm * p.width_mm * p.quantity,
    0
  );
  return Math.ceil((totalPartArea * wasteMul) / sheetArea);
}

export default function JobFinancePanel({ jobId, jobCode, parts = [], materialProducts = [] }: Props) {
  const { userRole } = useAuth();
  const canEdit = ["admin", "office"].includes(userRole || "");

  const [financials, setFinancials] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    quote_value_ex_vat: 0,
    material_cost_override: "",
    labour_cost_override: "",
    overhead_allocation_override: "",
    customer_id: "",
    revenue_status: "quoted",
    notes: "",
    deposit_required: "",
    deposit_received: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [jfRes, invRes, billRes, custRes] = await Promise.all([
      supabase.from("job_financials").select("*").eq("job_id", jobId).maybeSingle(),
      supabase.from("invoices").select("id, invoice_number, amount_ex_vat, vat_amount, amount_paid, status").eq("job_id", jobId),
      supabase.from("bills").select("id, bill_reference, amount_ex_vat, vat_amount, amount_paid, status, category").eq("job_id", jobId),
      supabase.from("customers").select("id, name").eq("active", true),
    ]);

    setFinancials(jfRes.data);
    setInvoices(invRes.data ?? []);
    setBills(billRes.data ?? []);
    setCustomers(custRes.data ?? []);

    if (jfRes.data) {
      const jf = jfRes.data;
      setForm({
        quote_value_ex_vat: Number(jf.quote_value_ex_vat || 0),
        material_cost_override: jf.material_cost_override != null ? String(jf.material_cost_override) : "",
        labour_cost_override: jf.labour_cost_override != null ? String(jf.labour_cost_override) : "",
        overhead_allocation_override: jf.overhead_allocation_override != null ? String(jf.overhead_allocation_override) : "",
        customer_id: jf.customer_id || "",
        revenue_status: jf.revenue_status || "quoted",
        notes: jf.notes || "",
        deposit_required: jf.deposit_required != null ? String(jf.deposit_required) : "",
        deposit_received: jf.deposit_received != null ? String(jf.deposit_received) : "",
      });
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        job_id: jobId,
        quote_value_ex_vat: form.quote_value_ex_vat,
        material_cost_override: form.material_cost_override ? parseFloat(form.material_cost_override) : null,
        labour_cost_override: form.labour_cost_override ? parseFloat(form.labour_cost_override) : null,
        overhead_allocation_override: form.overhead_allocation_override ? parseFloat(form.overhead_allocation_override) : null,
        customer_id: form.customer_id || null,
        revenue_status: form.revenue_status,
        notes: form.notes || null,
        deposit_required: form.deposit_required ? parseFloat(form.deposit_required) : 0,
        deposit_received: form.deposit_received ? parseFloat(form.deposit_received) : 0,
      };
      if (financials) {
        const { error } = await supabase.from("job_financials").update(payload).eq("id", financials.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("job_financials").insert(payload);
        if (error) throw error;
      }
      toast({ title: "Financials saved" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Auto-calculate material cost from parts + material catalog
  const matLookup = new Map(materialProducts.map(m => [m.material_code, m]));
  const materialGroups = new Map<string, PartData[]>();
  parts.forEach(p => {
    if (!p.material_code) return;
    const group = materialGroups.get(p.material_code) || [];
    group.push(p);
    materialGroups.set(p.material_code, group);
  });

  let autoMaterialCost = 0;
  const materialBreakdown: { code: string; sheets: number; costPerSheet: number; subtotal: number }[] = [];
  materialGroups.forEach((groupParts, code) => {
    const mat = matLookup.get(code);
    if (!mat) return;
    const sheets = estimateSheetsForMaterial(groupParts, mat);
    const subtotal = sheets * mat.cost_per_sheet;
    autoMaterialCost += subtotal;
    materialBreakdown.push({ code, sheets, costPerSheet: mat.cost_per_sheet, subtotal });
  });

  // Calculations
  const quoteValue = form.quote_value_ex_vat;
  const hasOverride = !!form.material_cost_override;
  const materialCost = hasOverride ? parseFloat(form.material_cost_override) : autoMaterialCost;
  const labourCost = form.labour_cost_override ? parseFloat(form.labour_cost_override) : 0;
  const overheadCost = form.overhead_allocation_override ? parseFloat(form.overhead_allocation_override) : 0;
  const billsTotal = bills.reduce((s, b) => s + Number(b.amount_ex_vat || 0), 0);
  const totalCost = materialCost + labourCost + overheadCost + billsTotal;
  const profit = quoteValue - totalCost;
  const margin = quoteValue > 0 ? (profit / quoteValue) * 100 : 0;
  const invoicedTotal = invoices.reduce((s, i) => s + Number(i.amount_ex_vat || 0), 0);
  const paidTotal = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const billsPaidTotal = bills.reduce((s, b) => s + Number(b.amount_paid || 0), 0);
  const depositRequired = form.deposit_required ? parseFloat(form.deposit_required) : 0;
  const depositReceived = form.deposit_received ? parseFloat(form.deposit_received) : 0;
  const depositRemaining = depositRequired - depositReceived;

  const fmt = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  if (loading) {
    return (
      <div className="glass-panel rounded-lg p-5 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-4" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign size={16} className="text-primary" />
          <h3 className="font-mono text-sm font-bold text-foreground">Financial Summary</h3>
        </div>
        {canEdit && (
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Save size={12} /> {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Quote Value</p>
          <p className="text-lg font-mono font-bold text-foreground">{fmt(quoteValue)}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Material Cost {hasOverride ? "(Override)" : "(Auto)"}</p>
          <p className="text-lg font-mono font-bold text-foreground">{fmt(materialCost)}</p>
          {!hasOverride && autoMaterialCost > 0 && (
            <p className="text-[9px] font-mono text-muted-foreground mt-0.5">{materialBreakdown.length} material{materialBreakdown.length !== 1 ? "s" : ""} · {materialBreakdown.reduce((s, b) => s + b.sheets, 0)} sheets</p>
          )}
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Total Cost</p>
          <p className="text-lg font-mono font-bold text-foreground">{fmt(totalCost)}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Profit</p>
          <p className={cn("text-lg font-mono font-bold", profit >= 0 ? "text-success" : "text-destructive")}>{fmt(profit)}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Margin</p>
          <div className="flex items-center gap-1">
            {margin >= 0 ? <TrendingUp size={14} className="text-success" /> : <TrendingDown size={14} className="text-destructive" />}
            <p className={cn("text-lg font-mono font-bold", margin >= 15 ? "text-success" : margin >= 0 ? "text-warning" : "text-destructive")}>{margin.toFixed(1)}%</p>
          </div>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Cash In</p>
          <p className="text-lg font-mono font-bold text-success">{fmt(paidTotal)}</p>
        </div>
      </div>

      {/* Material Cost Breakdown */}
      {materialBreakdown.length > 0 && !hasOverride && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Package size={13} className="text-primary" />
            <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">Material Cost Breakdown (auto-calculated)</span>
          </div>
          <div className="space-y-1">
            {materialBreakdown.map(b => (
              <div key={b.code} className="flex items-center justify-between bg-muted/20 rounded px-3 py-1.5 text-xs">
                <span className="font-mono text-foreground">{b.code}</span>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">{b.sheets} sheet{b.sheets !== 1 ? "s" : ""} × £{Number(b.costPerSheet).toFixed(2)}</span>
                  <span className="font-mono font-bold text-foreground">{fmt(b.subtotal)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-end px-3 pt-1 text-[10px] font-mono text-muted-foreground">
              incl. waste factor per material
            </div>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>Quote (ex VAT)</label>
            <input type="number" step="0.01" className={inputClass} value={form.quote_value_ex_vat} onChange={e => setForm(f => ({ ...f, quote_value_ex_vat: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className={labelClass}>Material Cost Override</label>
            <input type="number" step="0.01" className={inputClass} value={form.material_cost_override} onChange={e => setForm(f => ({ ...f, material_cost_override: e.target.value }))} placeholder={autoMaterialCost > 0 ? `Auto: £${autoMaterialCost.toFixed(2)}` : "Override"} />
            {autoMaterialCost > 0 && !hasOverride && (
              <p className="text-[9px] font-mono text-muted-foreground mt-0.5">Using auto-calculated cost</p>
            )}
            {hasOverride && autoMaterialCost > 0 && (
              <button type="button" onClick={() => setForm(f => ({ ...f, material_cost_override: "" }))} className="text-[9px] font-mono text-primary hover:underline mt-0.5">Clear override → use auto ({fmt(autoMaterialCost)})</button>
            )}
          </div>
          <div>
            <label className={labelClass}>Labour Cost</label>
            <input type="number" step="0.01" className={inputClass} value={form.labour_cost_override} onChange={e => setForm(f => ({ ...f, labour_cost_override: e.target.value }))} placeholder="Override" />
          </div>
          <div>
            <label className={labelClass}>Overhead Allocation</label>
            <input type="number" step="0.01" className={inputClass} value={form.overhead_allocation_override} onChange={e => setForm(f => ({ ...f, overhead_allocation_override: e.target.value }))} placeholder="Override" />
          </div>
          <div>
            <label className={labelClass}>Customer</label>
            <select className={inputClass} value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
              <option value="">None</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Revenue Status</label>
            <select className={inputClass} value={form.revenue_status} onChange={e => setForm(f => ({ ...f, revenue_status: e.target.value }))}>
              {["quoted", "confirmed", "in_progress", "invoiced", "paid", "cancelled"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className={labelClass}>Notes</label>
            <input className={inputClass} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Financial notes…" />
          </div>
        </div>
      )}

      {/* Deposit Tracking */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <DollarSign size={13} className="text-primary" />
          <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">Deposit Tracking</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {canEdit ? (
            <>
              <div>
                <label className={labelClass}>Deposit Required</label>
                <input type="number" step="0.01" className={inputClass} value={form.deposit_required} onChange={e => setForm(f => ({ ...f, deposit_required: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className={labelClass}>Deposit Received</label>
                <input type="number" step="0.01" className={inputClass} value={form.deposit_received} onChange={e => setForm(f => ({ ...f, deposit_received: e.target.value }))} placeholder="0.00" />
              </div>
            </>
          ) : (
            <>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-[10px] font-mono text-muted-foreground uppercase">Required</p>
                <p className="text-lg font-mono font-bold text-foreground">{fmt(depositRequired)}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-[10px] font-mono text-muted-foreground uppercase">Received</p>
                <p className="text-lg font-mono font-bold text-success">{fmt(depositReceived)}</p>
              </div>
            </>
          )}
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-[10px] font-mono text-muted-foreground uppercase">Remaining</p>
            <p className={cn("text-lg font-mono font-bold", depositRemaining <= 0 ? "text-success" : "text-warning")}>{fmt(depositRemaining)}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-[10px] font-mono text-muted-foreground uppercase">Status</p>
            <p className={cn("text-sm font-mono font-bold mt-1", depositRequired === 0 ? "text-muted-foreground" : depositReceived >= depositRequired ? "text-success" : depositReceived > 0 ? "text-warning" : "text-destructive")}>
              {depositRequired === 0 ? "N/A" : depositReceived >= depositRequired ? "Paid" : depositReceived > 0 ? "Partial" : "Unpaid"}
            </p>
          </div>
        </div>
      </div>

      {/* Linked invoices & bills */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Invoices */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Receipt size={13} className="text-primary" />
            <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">Linked Invoices ({invoices.length})</span>
          </div>
          {invoices.length === 0 ? (
            <p className="text-xs text-muted-foreground pl-5">No invoices linked to this job</p>
          ) : (
            <div className="space-y-1">
              {invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between bg-muted/20 rounded px-3 py-1.5 text-xs">
                  <span className="font-mono text-foreground">{inv.invoice_number}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{fmt(Number(inv.amount_ex_vat))}</span>
                    <span className={cn("font-mono text-[10px] px-1.5 py-0.5 rounded-full", inv.status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>{inv.status}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between px-3 pt-1 text-[10px] font-mono text-muted-foreground">
                <span>Total invoiced: {fmt(invoicedTotal)}</span>
                <span>Paid: {fmt(paidTotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Bills */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Wallet size={13} className="text-accent" />
            <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">Linked Bills ({bills.length})</span>
          </div>
          {bills.length === 0 ? (
            <p className="text-xs text-muted-foreground pl-5">No bills linked to this job</p>
          ) : (
            <div className="space-y-1">
              {bills.map(b => (
                <div key={b.id} className="flex items-center justify-between bg-muted/20 rounded px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-foreground">{b.bill_reference}</span>
                    <span className="text-muted-foreground">{b.category}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{fmt(Number(b.amount_ex_vat))}</span>
                    <span className={cn("font-mono text-[10px] px-1.5 py-0.5 rounded-full", b.status === "paid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>{b.status}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between px-3 pt-1 text-[10px] font-mono text-muted-foreground">
                <span>Total billed: {fmt(billsTotal)}</span>
                <span>Paid: {fmt(billsPaidTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
