import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const STATUSES = ["available", "reserved", "used", "discarded"] as const;
const GRAIN_DIRS = ["length", "width"] as const;

interface RemnantData {
  id: string;
  material_code: string;
  thickness_mm: number;
  colour_name: string;
  length_mm: number;
  width_mm: number;
  grain_direction: string;
  location: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  remnant?: RemnantData | null;
}

export default function RemnantDialog({ open, onOpenChange, onSuccess, remnant }: Props) {
  const isEdit = !!remnant;
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState<{ material_code: string; display_name: string; thickness_mm: number; colour_name: string; grain_direction: string }[]>([]);
  const [form, setForm] = useState({
    material_code: remnant?.material_code ?? "",
    thickness_mm: remnant?.thickness_mm ?? 18,
    colour_name: remnant?.colour_name ?? "",
    length_mm: remnant?.length_mm ?? 0,
    width_mm: remnant?.width_mm ?? 0,
    grain_direction: remnant?.grain_direction ?? "length",
    location: remnant?.location ?? "",
    status: remnant?.status ?? "available",
  });

  useEffect(() => {
    supabase.from("materials").select("material_code, display_name, thickness_mm, colour_name, grain_direction").eq("active", true).then(({ data }) => {
      setMaterials(data ?? []);
    });
  }, []);

  const onMaterialChange = (code: string) => {
    const mat = materials.find(m => m.material_code === code);
    setForm(f => ({
      ...f,
      material_code: code,
      thickness_mm: mat?.thickness_mm ?? f.thickness_mm,
      colour_name: mat?.colour_name ?? f.colour_name,
      grain_direction: mat?.grain_direction ?? f.grain_direction,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("remnants").update({
          length_mm: form.length_mm,
          width_mm: form.width_mm,
          location: form.location,
          status: form.status,
          grain_direction: form.grain_direction,
        }).eq("id", remnant!.id);
        if (error) throw error;
        toast({ title: "Remnant updated" });
      } else {
        if (!form.material_code) throw new Error("Select a material");
        const { error } = await supabase.from("remnants").insert({
          material_code: form.material_code,
          thickness_mm: form.thickness_mm,
          colour_name: form.colour_name,
          length_mm: form.length_mm,
          width_mm: form.width_mm,
          grain_direction: form.grain_direction,
          location: form.location,
          status: form.status,
        });
        if (error) throw error;
        toast({ title: "Remnant added", description: `${form.colour_name} ${form.length_mm}×${form.width_mm}mm` });
      }
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!remnant || !confirm("Delete this remnant?")) return;
    const { error } = await supabase.from("remnants").delete().eq("id", remnant.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Remnant deleted" });
      onOpenChange(false);
      onSuccess();
    }
  };

  const inputClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-xs font-mono font-medium text-muted-foreground mb-1.5";
  const selectClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">{isEdit ? "Edit Remnant" : "Add Remnant"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <label className={labelClass}>MATERIAL</label>
              <select value={form.material_code} onChange={e => onMaterialChange(e.target.value)} className={selectClass} required>
                <option value="">Select material...</option>
                {materials.map(m => <option key={m.material_code} value={m.material_code}>{m.display_name}</option>)}
              </select>
              {materials.length === 0 && <p className="text-[10px] text-warning mt-1">No materials in database. Add materials first.</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>LENGTH (mm)</label>
              <input type="number" required min={1} value={form.length_mm || ""} onChange={e => setForm(f => ({ ...f, length_mm: parseInt(e.target.value) || 0 }))} className={inputClass} placeholder="800" />
            </div>
            <div>
              <label className={labelClass}>WIDTH (mm)</label>
              <input type="number" required min={1} value={form.width_mm || ""} onChange={e => setForm(f => ({ ...f, width_mm: parseInt(e.target.value) || 0 }))} className={inputClass} placeholder="600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>GRAIN</label>
              <select value={form.grain_direction} onChange={e => setForm(f => ({ ...f, grain_direction: e.target.value }))} className={selectClass}>
                {GRAIN_DIRS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>STATUS</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={selectClass}>
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>LOCATION</label>
            <input type="text" maxLength={50} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className={inputClass} placeholder="Rack A3" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="flex-1 h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Remnant"}
            </button>
            {isEdit && (
              <button type="button" onClick={handleDelete} className="h-10 px-4 rounded-md border border-destructive text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
                Delete
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
