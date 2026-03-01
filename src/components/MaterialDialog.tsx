import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface MaterialData {
  id: string;
  material_code: string;
  display_name: string;
  thickness_mm: number;
  sheet_length_mm: number;
  sheet_width_mm: number;
  grain_direction: string;
  colour_name: string;
  cost_per_sheet: number | null;
  active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  material?: MaterialData | null;
}

const GRAIN_DIRS = ["length", "width"] as const;

export default function MaterialDialog({ open, onOpenChange, onSuccess, material }: Props) {
  const isEdit = !!material;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    material_code: material?.material_code ?? "",
    display_name: material?.display_name ?? "",
    thickness_mm: material?.thickness_mm ?? 18,
    sheet_length_mm: material?.sheet_length_mm ?? 2440,
    sheet_width_mm: material?.sheet_width_mm ?? 1220,
    grain_direction: material?.grain_direction ?? "length",
    colour_name: material?.colour_name ?? "",
    cost_per_sheet: material?.cost_per_sheet ?? null,
    active: material?.active ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        material_code: form.material_code,
        display_name: form.display_name,
        thickness_mm: form.thickness_mm,
        sheet_length_mm: form.sheet_length_mm,
        sheet_width_mm: form.sheet_width_mm,
        grain_direction: form.grain_direction,
        colour_name: form.colour_name,
        cost_per_sheet: form.cost_per_sheet,
        active: form.active,
      };

      if (isEdit) {
        const { error } = await supabase.from("materials").update(payload).eq("id", material!.id);
        if (error) throw error;
        toast({ title: "Material updated" });
      } else {
        if (!form.material_code || !form.display_name) throw new Error("Code and name required");
        const { error } = await supabase.from("materials").insert(payload);
        if (error) throw error;
        toast({ title: "Material added", description: form.display_name });
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
      <DialogContent className="glass-panel border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">{isEdit ? "Edit Material" : "Add Material"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>CODE</label>
              <input type="text" required maxLength={20} value={form.material_code} onChange={e => setForm(f => ({ ...f, material_code: e.target.value.toUpperCase() }))} className={inputClass} placeholder="WH18" disabled={isEdit} />
            </div>
            <div>
              <label className={labelClass}>COLOUR</label>
              <input type="text" required maxLength={50} value={form.colour_name} onChange={e => setForm(f => ({ ...f, colour_name: e.target.value }))} className={inputClass} placeholder="White" />
            </div>
          </div>
          <div>
            <label className={labelClass}>DISPLAY NAME</label>
            <input type="text" required maxLength={100} value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} className={inputClass} placeholder="White Melamine 18mm" />
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
              <label className={labelClass}>GRAIN</label>
              <select value={form.grain_direction} onChange={e => setForm(f => ({ ...f, grain_direction: e.target.value }))} className={selectClass}>
                {GRAIN_DIRS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>COST/SHEET (£)</label>
              <input type="number" min={0} step={0.01} value={form.cost_per_sheet ?? ""} onChange={e => setForm(f => ({ ...f, cost_per_sheet: e.target.value ? parseFloat(e.target.value) : null }))} className={inputClass} placeholder="28.00" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="rounded border-input" />
                <span className="text-xs font-mono text-muted-foreground">ACTIVE</span>
              </label>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Material"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
