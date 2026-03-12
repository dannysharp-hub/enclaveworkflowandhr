import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCabCompanyId } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, X, Check, Search, Truck, ChevronDown, ChevronRight, Phone, MapPin } from "lucide-react";

const CATEGORIES = ["panels", "hardware", "lighting", "fixings", "handles", "legs", "spray", "consumables", "other"];

interface SupplierProduct {
  id: string;
  category: string;
  name: string;
  size: string;
  thickness: string;
  pack_rate: number | null;
  mixed_rate: number | null;
  loose_rate: number | null;
  pieces_per_pack: number | null;
}

export default function CabSuppliersPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", notes: "", categories: [] as string[] });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [products, setProducts] = useState<Record<string, SupplierProduct[]>>({});
  const [loadingProducts, setLoadingProducts] = useState<string | null>(null);

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

  const loadProducts = async (supplierId: string) => {
    if (products[supplierId]) return;
    setLoadingProducts(supplierId);
    const { data } = await (supabase.from("cab_supplier_products") as any)
      .select("*").eq("supplier_id", supplierId).order("category").order("thickness");
    setProducts(prev => ({ ...prev, [supplierId]: data ?? [] }));
    setLoadingProducts(null);
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadProducts(id);
    }
  };

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

  const groupProductsByCategory = (items: SupplierProduct[]) => {
    const groups: Record<string, SupplierProduct[]> = {};
    items.forEach(p => {
      const cat = p.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return groups;
  };

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
        {filtered.map(s => {
          const isExpanded = expandedId === s.id;
          const supplierProducts = products[s.id] || [];
          const grouped = groupProductsByCategory(supplierProducts);

          return (
            <div key={s.id} className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleExpand(s.id)}>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <div>
                    <span className="font-medium text-foreground">{s.name}</span>
                    {s.contact_phone && (
                      <span className="ml-3 text-xs text-muted-foreground inline-flex items-center gap-1"><Phone size={10} />{s.contact_phone}</span>
                    )}
                    {s.phone && !s.contact_phone && (
                      <span className="ml-3 text-xs text-muted-foreground inline-flex items-center gap-1"><Phone size={10} />{s.phone}</span>
                    )}
                    {s.address && (
                      <span className="ml-3 text-xs text-muted-foreground inline-flex items-center gap-1"><MapPin size={10} />{s.address}</span>
                    )}
                    <div className="flex gap-1 mt-1">
                      {(s.categories || []).map((c: string) => (
                        <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                    {s.notes && <p className="text-xs text-muted-foreground mt-1 italic">{s.notes}</p>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={(e) => {
                  e.stopPropagation();
                  setEditId(s.id); setAdding(true);
                  setForm({ name: s.name, email: s.email || s.contact_email || "", phone: s.phone || s.contact_phone || "", address: s.address || "", notes: s.notes || "", categories: s.categories || [] });
                }}><Pencil size={14} /></Button>
              </div>

              {isExpanded && (
                <div className="border-t border-border px-3 pb-3">
                  {loadingProducts === s.id ? (
                    <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
                  ) : supplierProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No products listed for this supplier.</p>
                  ) : (
                    Object.entries(grouped).map(([cat, items]) => (
                      <div key={cat} className="mt-3">
                        <h4 className="text-xs font-bold text-foreground font-mono mb-1.5 uppercase tracking-wider">{cat}</h4>
                        <div className="rounded-md border border-border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="text-xs h-8 px-2">Size</TableHead>
                                <TableHead className="text-xs h-8 px-2">Thickness</TableHead>
                                <TableHead className="text-xs h-8 px-2 text-right">Pack</TableHead>
                                <TableHead className="text-xs h-8 px-2 text-right">Mixed</TableHead>
                                <TableHead className="text-xs h-8 px-2 text-right">Loose</TableHead>
                                <TableHead className="text-xs h-8 px-2 text-right">Pcs/Pack</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map(p => (
                                <TableRow key={p.id}>
                                  <TableCell className="text-xs px-2 py-1.5">{p.size}</TableCell>
                                  <TableCell className="text-xs px-2 py-1.5 font-medium">{p.thickness}</TableCell>
                                  <TableCell className="text-xs px-2 py-1.5 text-right font-mono">{p.pack_rate != null ? `£${p.pack_rate.toFixed(2)}` : "—"}</TableCell>
                                  <TableCell className="text-xs px-2 py-1.5 text-right font-mono">{p.mixed_rate != null ? `£${p.mixed_rate.toFixed(2)}` : "—"}</TableCell>
                                  <TableCell className="text-xs px-2 py-1.5 text-right font-mono">{p.loose_rate != null ? `£${p.loose_rate.toFixed(2)}` : "—"}</TableCell>
                                  <TableCell className="text-xs px-2 py-1.5 text-right">{p.pieces_per_pack ?? "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No suppliers yet.</p>}
      </div>
    </div>
  );
}
