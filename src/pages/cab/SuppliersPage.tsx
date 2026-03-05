import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCabCompanyId } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, X, Check, Search, Truck } from "lucide-react";

const CATEGORIES = ["panels", "hardware", "lighting", "fixings", "handles", "legs", "spray", "consumables", "other"];

export default function CabSuppliersPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", notes: "", categories: [] as string[] });

  const load = useCallback(async () => {
    const cid = await getCabCompanyId();
    if (!cid) return;
    setCompanyId(cid);
    const { data } = await (supabase.from("cab_suppliers") as any)
      .select("*").eq("company_id", cid).eq("is_active", true).order("name");
    setSuppliers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => setForm({ name: "", email: "", phone: "", address: "", notes: "", categories: [] });

  const toggleCategory = (cat: string) => {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat) ? f.categories.filter(c => c !== cat) : [...f.categories, cat],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = { ...form, company_id: companyId! };
      if (editId) {
        const { company_id: _, ...updatePayload } = payload;
        await (supabase.from("cab_suppliers") as any).update(updatePayload).eq("id", editId);
      } else {
        await (supabase.from("cab_suppliers") as any).insert(payload);
      }
      toast({ title: editId ? "Supplier updated" : "Supplier added" });
      setAdding(false); setEditId(null); resetForm(); load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const filtered = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.email || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Truck size={20} /> Suppliers</h1>
        <Button size="sm" onClick={() => { setAdding(true); setEditId(null); resetForm(); }}><Plus size={14} /> Add Supplier</Button>
      </div>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="font-mono text-sm font-bold text-foreground">{editId ? "Edit" : "New"} Supplier</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label className="text-xs">Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          </div>
          <div>
            <Label className="text-xs">Categories</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => toggleCategory(cat)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors ${form.categories.includes(cat) ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/50"}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div><Label className="text-xs">Notes</Label><textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}><Check size={14} /> {editId ? "Update" : "Add"}</Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setEditId(null); }}><X size={14} /> Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(s => (
          <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
            <div>
              <span className="font-medium text-foreground">{s.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{s.email}</span>
              {s.phone && <span className="ml-2 text-xs text-muted-foreground">{s.phone}</span>}
              <div className="flex gap-1 mt-1">
                {(s.categories || []).map((c: string) => (
                  <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                ))}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => {
              setEditId(s.id); setAdding(true);
              setForm({ name: s.name, email: s.email || "", phone: s.phone || "", address: s.address || "", notes: s.notes || "", categories: s.categories || [] });
            }}><Pencil size={14} /></Button>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No suppliers yet.</p>}
      </div>
    </div>
  );
}
