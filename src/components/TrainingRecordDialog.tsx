import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const TRAINING_TYPES = ["Machine Training", "H&S", "Fire Safety", "Toolbox Talk", "First Aid", "Manual Handling", "Induction", "Other"] as const;

interface StaffOption {
  user_id: string;
  full_name: string;
}

interface DocOption {
  id: string;
  title: string;
}

interface TrainingRecord {
  id: string;
  staff_id: string;
  training_type: string;
  title: string;
  completed_date: string;
  trainer_name: string | null;
  expiry_date: string | null;
  linked_document_id: string | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  staff: StaffOption[];
  documents: DocOption[];
  editRecord?: TrainingRecord | null;
}

export default function TrainingRecordDialog({ open, onOpenChange, onSuccess, staff, documents, editRecord }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    staff_id: "",
    training_type: "Machine Training",
    title: "",
    completed_date: new Date().toISOString().split("T")[0],
    trainer_name: "",
    expiry_date: "",
    linked_document_id: "",
    notes: "",
  });

  useEffect(() => {
    if (editRecord) {
      setForm({
        staff_id: editRecord.staff_id,
        training_type: editRecord.training_type,
        title: editRecord.title,
        completed_date: editRecord.completed_date,
        trainer_name: editRecord.trainer_name || "",
        expiry_date: editRecord.expiry_date || "",
        linked_document_id: editRecord.linked_document_id || "",
        notes: editRecord.notes || "",
      });
    } else {
      setForm({
        staff_id: "",
        training_type: "Machine Training",
        title: "",
        completed_date: new Date().toISOString().split("T")[0],
        trainer_name: "",
        expiry_date: "",
        linked_document_id: "",
        notes: "",
      });
    }
  }, [editRecord, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        staff_id: form.staff_id,
        training_type: form.training_type,
        title: form.title,
        completed_date: form.completed_date,
        trainer_name: form.trainer_name || null,
        expiry_date: form.expiry_date || null,
        linked_document_id: form.linked_document_id || null,
        notes: form.notes || null,
        created_by: user?.id || null,
      };

      if (editRecord) {
        const { error } = await supabase.from("training_records").update(payload).eq("id", editRecord.id);
        if (error) throw error;
        toast({ title: "Training record updated" });
      } else {
        const { error } = await supabase.from("training_records").insert(payload);
        if (error) throw error;
        toast({ title: "Training record added", description: form.title });
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
      <DialogContent className="glass-panel border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">{editRecord ? "Edit Training Record" : "Add Training Record"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>STAFF MEMBER</label>
              <select required value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))} className={selectClass}>
                <option value="">Select...</option>
                {staff.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>TRAINING TYPE</label>
              <select value={form.training_type} onChange={e => setForm(f => ({ ...f, training_type: e.target.value }))} className={selectClass}>
                {TRAINING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>TITLE / DESCRIPTION</label>
            <input type="text" required maxLength={200} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="CNC Router Operation Level 2" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>COMPLETED DATE</label>
              <input type="date" required value={form.completed_date} onChange={e => setForm(f => ({ ...f, completed_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>EXPIRY DATE (OPTIONAL)</label>
              <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>TRAINER NAME</label>
            <input type="text" maxLength={100} value={form.trainer_name} onChange={e => setForm(f => ({ ...f, trainer_name: e.target.value }))} className={inputClass} placeholder="John Smith" />
          </div>

          <div>
            <label className={labelClass}>LINKED DOCUMENT (OPTIONAL)</label>
            <select value={form.linked_document_id} onChange={e => setForm(f => ({ ...f, linked_document_id: e.target.value }))} className={selectClass}>
              <option value="">None</option>
              {documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>NOTES</label>
            <textarea maxLength={500} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" placeholder="Additional notes..." />
          </div>

          <button type="submit" disabled={loading} className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading ? "Saving..." : editRecord ? "Update Record" : "Add Record"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
