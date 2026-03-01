import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Plus, X, Check, Pencil, Search } from "lucide-react";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "" });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { name: form.name, email: form.email || null, phone: form.phone || null, address: form.address || null };
      if (editId) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(payload);
        if (error) throw error;
      }
      toast({ title: editId ? "Supplier updated" : "Supplier created" });
      setAdding(false); setEditId(null); load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (s: any) => {
    await supabase.from("suppliers").update({ active: !s.active }).eq("id", s.id);
    load();
  };

  const filtered = suppliers.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="space-y-6 animate-slide-in"><h2 className="text-2xl font-mono font-bold text-foreground">Suppliers</h2><div className="h-40 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-mono font-bold text-foreground">Suppliers</h2>
        {!adding && <button onClick={() => { setAdding(true); setEditId(null); setForm({ name: "", email: "", phone: "", address: "" }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus size={14} /> Add Supplier</button>}
      </div>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className={cn(inputClass, "pl-9")} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {adding && (
        <div className="glass-panel rounded-lg p-5 space-y-4">
          <h3 className="font-mono text-sm font-bold text-foreground">{editId ? "Edit" : "New"} Supplier</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className={labelClass}>Name</label><input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className={labelClass}>Email</label><input className={inputClass} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><label className={labelClass}>Phone</label><input className={inputClass} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className={labelClass}>Address</label><input className={inputClass} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
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
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Email</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Phone</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                <td className="px-4 py-2 font-medium text-foreground">{s.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.email || "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.phone || "—"}</td>
                <td className="px-4 py-2">
                  <button onClick={() => toggleActive(s)} className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono cursor-pointer", s.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{s.active ? "Active" : "Inactive"}</button>
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => { setEditId(s.id); setAdding(true); setForm({ name: s.name, email: s.email || "", phone: s.phone || "", address: s.address || "" }); }} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No suppliers</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
