import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface Skill {
  id: string;
  name: string;
  category: string;
  requires_certification: boolean;
  default_expiry_period_months: number | null;
  description: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editSkill?: Skill | null;
}

const CATEGORIES = ["CNC", "Assembly", "Spray", "Install", "Safety", "General", "Machinery", "Logistics"] as const;

export default function SkillDialog({ open, onOpenChange, onSuccess, editSkill }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "General",
    requires_certification: false,
    default_expiry_period_months: "",
    description: "",
  });

  useEffect(() => {
    if (editSkill) {
      setForm({
        name: editSkill.name,
        category: editSkill.category,
        requires_certification: editSkill.requires_certification,
        default_expiry_period_months: editSkill.default_expiry_period_months?.toString() || "",
        description: editSkill.description || "",
      });
    } else {
      setForm({ name: "", category: "General", requires_certification: false, default_expiry_period_months: "", description: "" });
    }
  }, [editSkill, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        requires_certification: form.requires_certification,
        default_expiry_period_months: form.default_expiry_period_months ? parseInt(form.default_expiry_period_months) : null,
        description: form.description || null,
      };
      if (editSkill) {
        const { error } = await supabase.from("skills").update(payload).eq("id", editSkill.id);
        if (error) throw error;
        toast({ title: "Skill updated" });
      } else {
        const { error } = await supabase.from("skills").insert(payload);
        if (error) throw error;
        toast({ title: "Skill added", description: form.name });
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
          <DialogTitle className="font-mono text-foreground">{editSkill ? "Edit Skill" : "Add Skill"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>SKILL NAME</label>
            <input type="text" required maxLength={100} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="CNC Router Operation" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>CATEGORY</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={selectClass}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>EXPIRY (MONTHS)</label>
              <input type="number" min={1} max={120} value={form.default_expiry_period_months} onChange={e => setForm(f => ({ ...f, default_expiry_period_months: e.target.value }))} className={inputClass} placeholder="Optional" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="req-cert" checked={form.requires_certification} onChange={e => setForm(f => ({ ...f, requires_certification: e.target.checked }))} className="rounded border-input" />
            <label htmlFor="req-cert" className="text-sm text-foreground">Requires certification</label>
          </div>
          <div>
            <label className={labelClass}>DESCRIPTION</label>
            <textarea maxLength={300} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" placeholder="Optional description..." />
          </div>
          <button type="submit" disabled={loading} className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading ? "Saving..." : editSkill ? "Update Skill" : "Add Skill"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
