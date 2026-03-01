import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Plus, X, Check, Pencil } from "lucide-react";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";
const CATEGORIES = ["rent","utilities","insurance","software","vehicle","finance","other"];
const FREQUENCIES = ["weekly","monthly","quarterly","annual"];

export default function OverheadsPage() {
  const [overheads, setOverheads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", category: "other", frequency: "monthly", amount: 0, next_due_date: "", active: true });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("overheads").select("*").order("name");
    setOverheads(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        frequency: form.frequency,
        amount: form.amount,
        next_due_date: form.next_due_date || null,
        active: form.active,
      };
      if (editId) {
        const { error } = await supabase.from("overheads").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("overheads").insert(payload);
        if (error) throw error;
      }
      toast({ title: editId ? "Overhead updated" : "Overhead created" });
      setAdding(false); setEditId(null); load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (o: any) => {
    await supabase.from("overheads").update({ active: !o.active }).eq("id", o.id);
    load();
  };

  const resetForm = () => setForm({ name: "", category: "other", frequency: "monthly", amount: 0, next_due_date: "", active: true });

  const monthlyEquivalent = (o: any) => {
    const a = Number(o.amount);
    switch (o.frequency) {
      case "weekly": return a * 52 / 12;
      case "quarterly": return a / 3;
      case "annual": return a / 12;
      default: return a;
    }
  };

  const totalMonthly = overheads.filter(o => o.active).reduce((s, o) => s + monthlyEquivalent(o), 0);

  if (loading) return <div className="space-y-6 animate-slide-in"><h2 className="text-2xl font-mono font-bold text-foreground">Overheads</h2><div className="h-40 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Overheads</h2>
          <p className="text-sm text-muted-foreground">Total monthly: £{totalMonthly.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</p>
        </div>
        {!adding && <button onClick={() => { setAdding(true); setEditId(null); resetForm(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus size={14} /> Add Overhead</button>}
      </div>

      {adding && (
        <div className="glass-panel rounded-lg p-5 space-y-4">
          <h3 className="font-mono text-sm font-bold text-foreground">{editId ? "Edit" : "New"} Overhead</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className={labelClass}>Name</label><input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Workshop Rent" /></div>
            <div><label className={labelClass}>Category</label>
              <select className={inputClass} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Frequency</label>
              <select className={inputClass} value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Amount (£)</label><input type="number" step="0.01" className={inputClass} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div>
            <div><label className={labelClass}>Next Due Date</label><input type="date" className={inputClass} value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.name} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Check size={14} /> {editId ? "Update" : "Create"}</button>
            <button onClick={() => { setAdding(false); setEditId(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Name</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Category</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Frequency</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Amount</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Monthly Equiv</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Next Due</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {overheads.map(o => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                <td className="px-4 py-2 font-medium text-foreground">{o.name}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{o.category}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{o.frequency}</td>
                <td className="px-4 py-2 text-right text-foreground">£{Number(o.amount).toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">£{monthlyEquivalent(o).toLocaleString("en-GB", { maximumFractionDigits: 0 })}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{o.next_due_date || "—"}</td>
                <td className="px-4 py-2">
                  <button onClick={() => toggleActive(o)} className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono cursor-pointer", o.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{o.active ? "Active" : "Inactive"}</button>
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => { setEditId(o.id); setAdding(true); setForm({ name: o.name, category: o.category, frequency: o.frequency, amount: Number(o.amount), next_due_date: o.next_due_date || "", active: o.active }); }} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                </td>
              </tr>
            ))}
            {overheads.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No overheads configured</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
