import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Plus, X, Check, Pencil, Search, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { exportToCsv, filterByDateRange } from "@/lib/csvExport";
import CsvExportButton from "@/components/CsvExportButton";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";
const STATUS_COLORS: Record<string, string> = {
  unpaid: "bg-warning/15 text-warning",
  part_paid: "bg-info/15 text-info",
  paid: "bg-success/15 text-success",
  overdue: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};
const CATEGORIES = ["materials","worktops","appliances","subcontractor","transport","rent","utilities","software","other"];

export default function BillsPage() {
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    bill_reference: "", supplier_id: "", job_id: "", issue_date: format(new Date(), "yyyy-MM-dd"),
    due_date: "", amount_ex_vat: 0, vat_amount: 0, status: "unpaid", category: "other", notes: "",
  });

  const load = async () => {
    setLoading(true);
    const [bRes, sRes, jRes] = await Promise.all([
      supabase.from("bills").select("*").order("issue_date", { ascending: false }),
      supabase.from("suppliers").select("id, name").eq("active", true),
      supabase.from("jobs").select("id, job_id, job_name"),
    ]);
    setBills(bRes.data ?? []);
    setSuppliers(sRes.data ?? []);
    setJobs(jRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        bill_reference: form.bill_reference,
        supplier_id: form.supplier_id,
        job_id: form.job_id || null,
        issue_date: form.issue_date,
        due_date: form.due_date,
        amount_ex_vat: form.amount_ex_vat,
        vat_amount: form.vat_amount,
        status: form.status,
        category: form.category,
        notes: form.notes || null,
      };
      if (editId) {
        const { error } = await supabase.from("bills").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bills").insert(payload);
        if (error) throw error;
      }
      toast({ title: editId ? "Bill updated" : "Bill created" });
      setAdding(false); setEditId(null); load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const markPaid = async (bill: any) => {
    await supabase.from("bills").update({
      status: "paid",
      amount_paid: Number(bill.amount_ex_vat) + Number(bill.vat_amount),
      payment_date: format(new Date(), "yyyy-MM-dd"),
    }).eq("id", bill.id);
    load();
  };

  const supplierName = (id: string) => suppliers.find(s => s.id === id)?.name || "—";
  const jobCode = (id: string | null) => { if (!id) return "—"; const j = jobs.find(j => j.id === id); return j ? j.job_id : "—"; };

  const filtered = bills.filter(b => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (search && !b.bill_reference.toLowerCase().includes(search.toLowerCase()) && !supplierName(b.supplier_id).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const resetForm = () => setForm({ bill_reference: "", supplier_id: suppliers[0]?.id || "", job_id: "", issue_date: format(new Date(), "yyyy-MM-dd"), due_date: "", amount_ex_vat: 0, vat_amount: 0, status: "unpaid", category: "other", notes: "" });

  if (loading) return <div className="space-y-6 animate-slide-in"><h2 className="text-2xl font-mono font-bold text-foreground">Bills</h2><div className="h-40 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-mono font-bold text-foreground">Bills</h2>
        <div className="flex gap-2">
          <CsvExportButton onExport={(from, to) => {
            const data = filterByDateRange(bills, "issue_date", from, to);
            exportToCsv("bills", ["Reference","Supplier","Job","Category","Issue Date","Due Date","Amount Ex VAT","VAT","Paid","Status"], data.map(b => [b.bill_reference, supplierName(b.supplier_id), jobCode(b.job_id), b.category, b.issue_date, b.due_date, b.amount_ex_vat, b.vat_amount, b.amount_paid, b.status]));
          }} />
          {!adding && <button onClick={() => { setAdding(true); setEditId(null); resetForm(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus size={14} /> New Bill</button>}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(inputClass, "pl-9")} placeholder="Search bills…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={cn(inputClass, "w-36")} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          {["unpaid","part_paid","paid","overdue","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
        </select>
      </div>

      {adding && (
        <div className="glass-panel rounded-lg p-5 space-y-4">
          <h3 className="font-mono text-sm font-bold text-foreground">{editId ? "Edit" : "New"} Bill</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className={labelClass}>Reference</label><input className={inputClass} value={form.bill_reference} onChange={e => setForm(f => ({ ...f, bill_reference: e.target.value }))} placeholder="BILL-001" /></div>
            <div><label className={labelClass}>Supplier</label>
              <select className={inputClass} value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                <option value="">Select…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Job (optional)</label>
              <select className={inputClass} value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}>
                <option value="">None</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_id} — {j.job_name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Category</label>
              <select className={inputClass} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Issue Date</label><input type="date" className={inputClass} value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} /></div>
            <div><label className={labelClass}>Due Date</label><input type="date" className={inputClass} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
            <div><label className={labelClass}>Amount (ex VAT)</label><input type="number" step="0.01" className={inputClass} value={form.amount_ex_vat} onChange={e => setForm(f => ({ ...f, amount_ex_vat: parseFloat(e.target.value) || 0 }))} /></div>
            <div><label className={labelClass}>VAT Amount</label><input type="number" step="0.01" className={inputClass} value={form.vat_amount} onChange={e => setForm(f => ({ ...f, vat_amount: parseFloat(e.target.value) || 0 }))} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.bill_reference || !form.supplier_id || !form.due_date} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Check size={14} /> {editId ? "Update" : "Create"}</button>
            <button onClick={() => { setAdding(false); setEditId(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Ref</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Supplier</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Job</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Category</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Due</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Ex VAT</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Paid</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Pandle</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                <td className="px-4 py-2 font-medium text-foreground">{b.bill_reference}</td>
                <td className="px-4 py-2 text-muted-foreground">{supplierName(b.supplier_id)}</td>
                <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{jobCode(b.job_id)}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{b.category}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{b.due_date}</td>
                <td className="px-4 py-2 text-right text-foreground">£{Number(b.amount_ex_vat).toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-success">£{Number(b.amount_paid || 0).toLocaleString()}</td>
                <td className="px-4 py-2"><span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-medium", STATUS_COLORS[b.status] || "bg-muted text-muted-foreground")}>{b.status.replace("_", " ")}</span></td>
                <td className="px-4 py-2">
                  {b.pandle_exported ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-success/15 text-success" title={b.pandle_exported_at ? `Exported ${b.pandle_exported_at}` : undefined}>
                      <FileSpreadsheet size={10} /> Exported
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => { setEditId(b.id); setAdding(true); setForm({ bill_reference: b.bill_reference, supplier_id: b.supplier_id, job_id: b.job_id || "", issue_date: b.issue_date, due_date: b.due_date, amount_ex_vat: Number(b.amount_ex_vat), vat_amount: Number(b.vat_amount), status: b.status, category: b.category, notes: b.notes || "" }); }} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                    {b.status !== "paid" && b.status !== "cancelled" && (
                      <button onClick={() => markPaid(b)} className="px-2 py-0.5 text-[10px] font-mono rounded bg-success/15 text-success hover:bg-success/25">Paid</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No bills found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
