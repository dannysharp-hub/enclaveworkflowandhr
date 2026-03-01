import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Plus, X, Check, Pencil, Search } from "lucide-react";
import { format } from "date-fns";
import { exportToCsv, filterByDateRange } from "@/lib/csvExport";
import CsvExportButton from "@/components/CsvExportButton";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info/15 text-info",
  part_paid: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  overdue: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  amount_ex_vat: number;
  vat_amount: number;
  amount_paid: number;
  customer_id: string;
  job_id: string | null;
  payment_received_date: string | null;
  payment_method: string | null;
  reference: string | null;
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    invoice_number: "", customer_id: "", job_id: "", issue_date: format(new Date(), "yyyy-MM-dd"),
    due_date: "", amount_ex_vat: 0, vat_amount: 0, status: "draft", reference: "",
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [invRes, custRes, jobRes] = await Promise.all([
      supabase.from("invoices").select("*").order("issue_date", { ascending: false }),
      supabase.from("customers").select("id, name").eq("active", true),
      supabase.from("jobs").select("id, job_id, job_name"),
    ]);
    setInvoices((invRes.data as any) ?? []);
    setCustomers(custRes.data ?? []);
    setJobs(jobRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        invoice_number: form.invoice_number,
        customer_id: form.customer_id,
        job_id: form.job_id || null,
        issue_date: form.issue_date,
        due_date: form.due_date,
        amount_ex_vat: form.amount_ex_vat,
        vat_amount: form.vat_amount,
        status: form.status,
        reference: form.reference || null,
        created_by_staff_id: user?.id || null,
      };
      if (editId) {
        const { error } = await supabase.from("invoices").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("invoices").insert(payload);
        if (error) throw error;
      }
      toast({ title: editId ? "Invoice updated" : "Invoice created" });
      setAdding(false); setEditId(null); load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const markPaid = async (inv: Invoice) => {
    await supabase.from("invoices").update({
      status: "paid",
      amount_paid: Number(inv.amount_ex_vat) + Number(inv.vat_amount),
      payment_received_date: format(new Date(), "yyyy-MM-dd"),
    }).eq("id", inv.id);
    load();
  };

  const custName = (id: string) => customers.find(c => c.id === id)?.name || "—";
  const jobCode = (id: string | null) => { if (!id) return "—"; const j = jobs.find(j => j.id === id); return j ? j.job_id : "—"; };

  const filtered = invoices.filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (search && !i.invoice_number.toLowerCase().includes(search.toLowerCase()) && !custName(i.customer_id).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const resetForm = () => setForm({ invoice_number: "", customer_id: customers[0]?.id || "", job_id: "", issue_date: format(new Date(), "yyyy-MM-dd"), due_date: "", amount_ex_vat: 0, vat_amount: 0, status: "draft", reference: "" });

  if (loading) return <div className="space-y-6 animate-slide-in"><h2 className="text-2xl font-mono font-bold text-foreground">Invoices</h2><div className="h-40 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-mono font-bold text-foreground">Invoices</h2>
        <div className="flex gap-2">
          <CsvExportButton onExport={(from, to) => {
            const data = filterByDateRange(invoices, "issue_date", from, to);
            exportToCsv("invoices", ["Invoice #","Customer","Job","Issue Date","Due Date","Amount Ex VAT","VAT","Paid","Status"], data.map(i => [i.invoice_number, custName(i.customer_id), jobCode(i.job_id), i.issue_date, i.due_date, i.amount_ex_vat, i.vat_amount, i.amount_paid, i.status]));
          }} />
          {!adding && <button onClick={() => { setAdding(true); setEditId(null); resetForm(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus size={14} /> New Invoice</button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(inputClass, "pl-9")} placeholder="Search invoices…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={cn(inputClass, "w-36")} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          {["draft","sent","part_paid","paid","overdue","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
        </select>
      </div>

      {/* Add/Edit form */}
      {adding && (
        <div className="glass-panel rounded-lg p-5 space-y-4">
          <h3 className="font-mono text-sm font-bold text-foreground">{editId ? "Edit" : "New"} Invoice</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className={labelClass}>Invoice #</label><input className={inputClass} value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="INV-001" /></div>
            <div><label className={labelClass}>Customer</label>
              <select className={inputClass} value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                <option value="">Select…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Job (optional)</label>
              <select className={inputClass} value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}>
                <option value="">None</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_id} — {j.job_name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Status</label>
              <select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {["draft","sent","part_paid","paid","overdue","cancelled"].map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Issue Date</label><input type="date" className={inputClass} value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} /></div>
            <div><label className={labelClass}>Due Date</label><input type="date" className={inputClass} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
            <div><label className={labelClass}>Amount (ex VAT)</label><input type="number" step="0.01" className={inputClass} value={form.amount_ex_vat} onChange={e => setForm(f => ({ ...f, amount_ex_vat: parseFloat(e.target.value) || 0 }))} /></div>
            <div><label className={labelClass}>VAT Amount</label><input type="number" step="0.01" className={inputClass} value={form.vat_amount} onChange={e => setForm(f => ({ ...f, vat_amount: parseFloat(e.target.value) || 0 }))} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.invoice_number || !form.customer_id || !form.due_date} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Check size={14} /> {editId ? "Update" : "Create"}</button>
            <button onClick={() => { setAdding(false); setEditId(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass-panel rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Invoice #</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Customer</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Job</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Issue</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Due</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Ex VAT</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Paid</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {filtered.map(inv => (
              <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                <td className="px-4 py-2 font-medium text-foreground">{inv.invoice_number}</td>
                <td className="px-4 py-2 text-muted-foreground">{custName(inv.customer_id)}</td>
                <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{jobCode(inv.job_id)}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{inv.issue_date}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{inv.due_date}</td>
                <td className="px-4 py-2 text-right text-foreground">£{Number(inv.amount_ex_vat).toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-success">£{Number(inv.amount_paid).toLocaleString()}</td>
                <td className="px-4 py-2"><span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono font-medium", STATUS_COLORS[inv.status] || "bg-muted text-muted-foreground")}>{inv.status.replace("_", " ")}</span></td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => { setEditId(inv.id); setAdding(true); setForm({ invoice_number: inv.invoice_number, customer_id: inv.customer_id, job_id: inv.job_id || "", issue_date: inv.issue_date, due_date: inv.due_date, amount_ex_vat: Number(inv.amount_ex_vat), vat_amount: Number(inv.vat_amount), status: inv.status, reference: inv.reference || "" }); }} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                    {inv.status !== "paid" && inv.status !== "cancelled" && (
                      <button onClick={() => markPaid(inv)} className="px-2 py-0.5 text-[10px] font-mono rounded bg-success/15 text-success hover:bg-success/25">Paid</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No invoices found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
