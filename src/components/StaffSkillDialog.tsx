import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const LEVELS = ["Trainee", "Competent", "Expert"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  staff: { user_id: string; full_name: string }[];
  skills: { id: string; name: string }[];
  editRecord?: { id: string; staff_id: string; skill_id: string; level: string; certification_expiry_date: string | null; notes: string | null } | null;
}

export default function StaffSkillDialog({ open, onOpenChange, onSuccess, staff, skills, editRecord }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    staff_id: "",
    skill_id: "",
    level: "Trainee" as string,
    certification_expiry_date: "",
    notes: "",
  });

  useEffect(() => {
    if (editRecord) {
      setForm({
        staff_id: editRecord.staff_id,
        skill_id: editRecord.skill_id,
        level: editRecord.level,
        certification_expiry_date: editRecord.certification_expiry_date || "",
        notes: editRecord.notes || "",
      });
    } else {
      setForm({ staff_id: "", skill_id: "", level: "Trainee", certification_expiry_date: "", notes: "" });
    }
  }, [editRecord, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        staff_id: form.staff_id,
        skill_id: form.skill_id,
        level: form.level,
        certification_expiry_date: form.certification_expiry_date || null,
        notes: form.notes || null,
        assigned_by: user?.id || null,
      };
      if (editRecord) {
        const { error } = await supabase.from("staff_skills").update(payload).eq("id", editRecord.id);
        if (error) throw error;
        toast({ title: "Skill assignment updated" });
      } else {
        const { error } = await supabase.from("staff_skills").insert(payload);
        if (error) throw error;
        toast({ title: "Skill assigned" });
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
          <DialogTitle className="font-mono text-foreground">{editRecord ? "Edit Assignment" : "Assign Skill"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>STAFF MEMBER</label>
              <select required value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))} className={selectClass} disabled={!!editRecord}>
                <option value="">Select...</option>
                {staff.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>SKILL</label>
              <select required value={form.skill_id} onChange={e => setForm(f => ({ ...f, skill_id: e.target.value }))} className={selectClass} disabled={!!editRecord}>
                <option value="">Select...</option>
                {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>COMPETENCY LEVEL</label>
              <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} className={selectClass}>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>CERT EXPIRY (OPTIONAL)</label>
              <input type="date" value={form.certification_expiry_date} onChange={e => setForm(f => ({ ...f, certification_expiry_date: e.target.value }))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>NOTES</label>
            <textarea maxLength={300} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" placeholder="Optional notes..." />
          </div>
          <button type="submit" disabled={loading} className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading ? "Saving..." : editRecord ? "Update" : "Assign Skill"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
