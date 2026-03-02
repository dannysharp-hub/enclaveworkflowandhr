import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface MaterialType { id: string; name: string; }

interface ProductData {
  id: string;
  material_code: string;
  material_type_id: string | null;
  brand: string | null;
  colour_name: string | null;
  thickness_mm: number;
  sheet_length_mm: number;
  sheet_width_mm: number;
  grain_default: string | null;
  rotation_allowed_90_default: boolean;
  cost_per_sheet: number;
  currency: string;
  waste_factor_percent: number;
  active: boolean;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  product?: ProductData | null;
  types: MaterialType[];
}

export default function MaterialProductDialog({ open, onOpenChange, onSuccess, product, types }: Props) {
  const isEdit = !!product;
  const [loading, setLoading] = useState(false);

  const defaultForm = {
    material_code: "",
    material_type_id: types[0]?.id ?? "",
    brand: "",
    colour_name: "",
    thickness_mm: 18,
    sheet_length_mm: 2440,
    sheet_width_mm: 1220,
    grain_default: "" as string,
    rotation_allowed_90_default: true,
    cost_per_sheet: 0,
    currency: "GBP",
    waste_factor_percent: 10,
    active: true,
    notes: "",
  };

  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (open) {
      setForm(product ? {
        material_code: product.material_code,
        material_type_id: product.material_type_id ?? "",
        brand: product.brand ?? "",
        colour_name: product.colour_name ?? "",
        thickness_mm: product.thickness_mm,
        sheet_length_mm: product.sheet_length_mm,
        sheet_width_mm: product.sheet_width_mm,
        grain_default: product.grain_default ?? "",
        rotation_allowed_90_default: product.rotation_allowed_90_default,
        cost_per_sheet: product.cost_per_sheet,
        currency: product.currency,
        waste_factor_percent: product.waste_factor_percent,
        active: product.active,
        notes: product.notes ?? "",
      } : { ...defaultForm, material_type_id: types[0]?.id ?? "" });
    }
  }, [open, product]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        material_code: form.material_code,
        material_type_id: form.material_type_id || null,
        brand: form.brand || null,
        colour_name: form.colour_name || null,
        thickness_mm: form.thickness_mm,
        sheet_length_mm: form.sheet_length_mm,
        sheet_width_mm: form.sheet_width_mm,
        grain_default: form.grain_default || null,
        rotation_allowed_90_default: form.rotation_allowed_90_default,
        cost_per_sheet: form.cost_per_sheet,
        currency: form.currency,
        waste_factor_percent: form.waste_factor_percent,
        active: form.active,
        notes: form.notes || null,
      };

      if (isEdit) {
        const { error } = await supabase.from("material_products").update(payload).eq("id", product!.id);
        if (error) throw error;
        toast({ title: "Product updated" });
      } else {
        if (!form.material_code) throw new Error("Material code is required");
        const { error } = await supabase.from("material_products").insert(payload as any);
        if (error) throw error;
        toast({ title: "Product added", description: form.material_code });
      }
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-xs font-mono font-medium text-muted-foreground mb-1.5";
  const selectClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">{isEdit ? "Edit Product" : "Add Product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>CODE</label>
              <input type="text" required maxLength={50} value={form.material_code} onChange={e => setForm(f => ({ ...f, material_code: e.target.value.toUpperCase() }))} className={inputClass} placeholder="MDF_STD_18_2440x1220" disabled={isEdit} />
            </div>
            <div>
              <label className={labelClass}>TYPE</label>
              <select value={form.material_type_id} onChange={e => setForm(f => ({ ...f, material_type_id: e.target.value }))} className={selectClass}>
                <option value="">— None —</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>BRAND</label>
              <input type="text" maxLength={50} value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} className={inputClass} placeholder="Finsa" />
            </div>
            <div>
              <label className={labelClass}>COLOUR</label>
              <input type="text" maxLength={80} value={form.colour_name} onChange={e => setForm(f => ({ ...f, colour_name: e.target.value }))} className={inputClass} placeholder="White Matt" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>THICKNESS (mm)</label>
              <input type="number" required min={1} value={form.thickness_mm || ""} onChange={e => setForm(f => ({ ...f, thickness_mm: parseFloat(e.target.value) || 0 }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>LENGTH (mm)</label>
              <input type="number" required min={1} value={form.sheet_length_mm || ""} onChange={e => setForm(f => ({ ...f, sheet_length_mm: parseInt(e.target.value) || 0 }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>WIDTH (mm)</label>
              <input type="number" required min={1} value={form.sheet_width_mm || ""} onChange={e => setForm(f => ({ ...f, sheet_width_mm: parseInt(e.target.value) || 0 }))} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>GRAIN DEFAULT</label>
              <select value={form.grain_default} onChange={e => setForm(f => ({ ...f, grain_default: e.target.value }))} className={selectClass}>
                <option value="">None</option>
                <option value="length">Length</option>
                <option value="width">Width</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>COST/SHEET (£)</label>
              <input type="number" required min={0} step={0.01} value={form.cost_per_sheet || ""} onChange={e => setForm(f => ({ ...f, cost_per_sheet: parseFloat(e.target.value) || 0 }))} className={inputClass} placeholder="23.95" />
            </div>
            <div>
              <label className={labelClass}>WASTE %</label>
              <input type="number" min={0} max={100} step={1} value={form.waste_factor_percent} onChange={e => setForm(f => ({ ...f, waste_factor_percent: parseFloat(e.target.value) || 0 }))} className={inputClass} />
            </div>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.rotation_allowed_90_default} onChange={e => setForm(f => ({ ...f, rotation_allowed_90_default: e.target.checked }))} className="rounded border-input" />
              <span className="text-xs font-mono text-muted-foreground">ALLOW 90° ROTATION</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded border-input" />
              <span className="text-xs font-mono text-muted-foreground">ACTIVE</span>
            </label>
          </div>

          <div>
            <label className={labelClass}>NOTES</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputClass + " h-16 resize-none"} placeholder="Optional notes..." />
          </div>

          <button type="submit" disabled={loading} className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Product"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
