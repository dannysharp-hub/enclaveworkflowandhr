import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Check, Package } from "lucide-react";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName: string;
}

interface Capability {
  id?: string;
  material_brand: string;
  material_range: string;
  thickness_mm: string;
  sheet_size_key: string;
  category_supported: string;
  supports_veneer: boolean;
  supports_prefinished: boolean;
  supports_raw_mdf: boolean;
  supports_edge_band: boolean;
}

const categoryOptions = [
  { value: "", label: "Any" },
  { value: "panels", label: "Panels" },
  { value: "hardware", label: "Hardware" },
  { value: "lighting", label: "Lighting" },
  { value: "fixings", label: "Fixings" },
  { value: "legs", label: "Legs" },
  { value: "handles", label: "Handles" },
  { value: "finishing_oils", label: "Finishing/Oils" },
  { value: "paint_spray_subcontract", label: "Paint/Spray" },
  { value: "edgebanding", label: "Edgebanding" },
  { value: "other", label: "Other" },
];

const emptyCapability = (): Capability => ({
  material_brand: "",
  material_range: "",
  thickness_mm: "",
  sheet_size_key: "",
  category_supported: "",
  supports_veneer: false,
  supports_prefinished: false,
  supports_raw_mdf: true,
  supports_edge_band: false,
});

export default function SupplierCapabilitiesDialog({ open, onOpenChange, supplierId, supplierName }: Props) {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !supplierId) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase.from("supplier_capabilities") as any)
        .select("*")
        .eq("supplier_id", supplierId)
        .order("created_at");
      setCapabilities(
        (data ?? []).map((d: any) => ({
          id: d.id,
          material_brand: d.material_brand || "",
          material_range: d.material_range || "",
          thickness_mm: d.thickness_mm?.toString() || "",
          sheet_size_key: d.sheet_size_key || "",
          category_supported: d.category_supported || "",
          supports_veneer: d.supports_veneer,
          supports_prefinished: d.supports_prefinished,
          supports_raw_mdf: d.supports_raw_mdf,
          supports_edge_band: d.supports_edge_band,
        }))
      );
      setLoading(false);
    })();
  }, [open, supplierId]);

  const addRow = () => setCapabilities(c => [...c, emptyCapability()]);

  const updateRow = (idx: number, field: keyof Capability, value: any) => {
    setCapabilities(c => c.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeRow = async (idx: number) => {
    const row = capabilities[idx];
    if (row.id) {
      await (supabase.from("supplier_capabilities") as any).delete().eq("id", row.id);
    }
    setCapabilities(c => c.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const cap of capabilities) {
        const payload = {
          supplier_id: supplierId,
          material_brand: cap.material_brand || "Generic",
          material_range: cap.material_range || null,
          thickness_mm: cap.thickness_mm ? parseFloat(cap.thickness_mm) : null,
          sheet_size_key: cap.sheet_size_key || null,
          category_supported: cap.category_supported || null,
          supports_veneer: cap.supports_veneer,
          supports_prefinished: cap.supports_prefinished,
          supports_raw_mdf: cap.supports_raw_mdf,
          supports_edge_band: cap.supports_edge_band,
        };
        if (cap.id) {
          await (supabase.from("supplier_capabilities") as any).update(payload).eq("id", cap.id);
        } else {
          await (supabase.from("supplier_capabilities") as any).insert(payload);
        }
      }
      toast({ title: "Capabilities saved" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground flex items-center gap-2">
            <Package size={16} className="text-primary" /> Capabilities — {supplierName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {capabilities.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No capabilities defined. Add one to enable RFQ matching.</p>
            )}

            {capabilities.map((cap, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>
                    <label className={labelClass}>Category</label>
                    <select className={inputClass} value={cap.category_supported} onChange={e => updateRow(idx, "category_supported", e.target.value)}>
                      {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Brand</label>
                    <input className={inputClass} placeholder="e.g. Egger" value={cap.material_brand} onChange={e => updateRow(idx, "material_brand", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Range</label>
                    <input className={inputClass} placeholder="e.g. Eurodekor" value={cap.material_range} onChange={e => updateRow(idx, "material_range", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Thickness (mm)</label>
                    <input className={inputClass} placeholder="e.g. 18" value={cap.thickness_mm} onChange={e => updateRow(idx, "thickness_mm", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Sheet Size</label>
                    <input className={inputClass} placeholder="e.g. 2440x1220" value={cap.sheet_size_key} onChange={e => updateRow(idx, "sheet_size_key", e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {(["supports_raw_mdf", "supports_prefinished", "supports_veneer", "supports_edge_band"] as const).map(field => (
                    <label key={field} className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                      <input type="checkbox" className="rounded" checked={cap[field]} onChange={e => updateRow(idx, field, e.target.checked)} />
                      {field.replace("supports_", "").replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </label>
                  ))}
                  <button onClick={() => removeRow(idx)} className="ml-auto text-destructive hover:text-destructive/80">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">
                <Plus size={14} /> Add Capability
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 ml-auto">
                <Check size={14} /> Save
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
