import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Plus, X, Check, Pencil } from "lucide-react";
import { format } from "date-fns";
import { exportToCsv, filterByDateRange } from "@/lib/csvExport";
import CsvExportButton from "@/components/CsvExportButton";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

export default function WagesPage() {
  const [wages, setWages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ period_start: "", period_end: "", total_wages_expected: 0, total_wages_actual: "", notes: "" });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("wage_plans").select("*").order("period_start", { ascending: false });
    setWages(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        period_start: form.period_start,
        period_end: form.period_end,
        total_wages_expected: form.total_wages_expected,
        total_wages_actual: form.total_wages_actual ? parseFloat(form.total_wages_actual) : null,
        notes: form.notes || null,
      };
      if (editId) {
        const { error } = await supabase.from("wage_plans").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("wage_plans").insert(payload);
        if (error) throw error;
      }
      toast({ title: editId ? "Wage plan updated" : "Wage plan created" });
      setAdding(false); setEditId(null); load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const resetForm = () => setForm({ period_start: "", period_end: "", total_wages_expected: 0, total_wages_actual: "", notes: "" });

  if (loading) return <div className="space-y-6 animate-slide-in"><h2 className="text-2xl font-mono font-bold text-foreground">Wage Plans</h2><div className="h-40 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Wage Plans</h2>
          <p className="text-sm text-muted-foreground">Forecast and track wage costs per period</p>
        </div>
        <div className="flex gap-2">
          <CsvExportButton onExport={(from, to) => {
            const data = filterByDateRange(wages, "period_start", from, to);
            exportToCsv("wage_plans", ["Period Start","Period End","Expected","Actual","Variance","Notes"], data.map(w => {
              const exp = Number(w.total_wages_expected); const act = w.total_wages_actual != null ? Number(w.total_wages_actual) : null;
              return [w.period_start, w.period_end, exp, act, act != null ? act - exp : null, w.notes];
            }));
          }} />
          {!adding && <button onClick={() => { setAdding(true); setEditId(null); resetForm(); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus size={14} /> New Period</button>}
        </div>
      </div>

      {adding && (
        <div className="glass-panel rounded-lg p-5 space-y-4">
          <h3 className="font-mono text-sm font-bold text-foreground">{editId ? "Edit" : "New"} Wage Plan</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className={labelClass}>Period Start</label><input type="date" className={inputClass} value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} /></div>
            <div><label className={labelClass}>Period End</label><input type="date" className={inputClass} value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} /></div>
            <div><label className={labelClass}>Expected (£)</label><input type="number" step="0.01" className={inputClass} value={form.total_wages_expected} onChange={e => setForm(f => ({ ...f, total_wages_expected: parseFloat(e.target.value) || 0 }))} /></div>
            <div><label className={labelClass}>Actual (£)</label><input type="number" step="0.01" className={inputClass} value={form.total_wages_actual} onChange={e => setForm(f => ({ ...f, total_wages_actual: e.target.value }))} placeholder="Optional" /></div>
          </div>
          <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.period_start || !form.period_end} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Check size={14} /> {editId ? "Update" : "Create"}</button>
            <button onClick={() => { setAdding(false); setEditId(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Period</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Expected</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Actual</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Variance</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Notes</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {wages.map(w => {
              const expected = Number(w.total_wages_expected);
              const actual = w.total_wages_actual != null ? Number(w.total_wages_actual) : null;
              const variance = actual != null ? actual - expected : null;
              return (
                <tr key={w.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-2 font-medium text-foreground">{w.period_start} → {w.period_end}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">£{expected.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-foreground">{actual != null ? `£${actual.toLocaleString()}` : "—"}</td>
                  <td className={cn("px-4 py-2 text-right font-medium", variance != null && variance > 0 ? "text-destructive" : "text-success")}>{variance != null ? `${variance > 0 ? "+" : ""}£${variance.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs truncate max-w-[200px]">{w.notes || "—"}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => { setEditId(w.id); setAdding(true); setForm({ period_start: w.period_start, period_end: w.period_end, total_wages_expected: expected, total_wages_actual: actual != null ? String(actual) : "", notes: w.notes || "" }); }} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {wages.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No wage plans</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
