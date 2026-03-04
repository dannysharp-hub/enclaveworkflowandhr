import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const STATUSES = ["draft", "validated", "exported", "cutting", "complete"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  job?: { id: string; job_id: string; job_name: string; status: string; sheets_estimated: number } | null;
}

export default function JobDialog({ open, onOpenChange, onSuccess, job }: Props) {
  const { user } = useAuth();
  const isEdit = !!job;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    job_id: job?.job_id ?? "",
    job_name: job?.job_name ?? "",
    status: job?.status ?? "draft",
    sheets_estimated: job?.sheets_estimated ?? 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from("jobs")
          .update({ job_name: form.job_name, status: form.status, sheets_estimated: form.sheets_estimated })
          .eq("id", job!.id);
        if (error) throw error;
        toast({ title: "Job updated" });
      } else {
        const { data: newJob, error } = await supabase.from("jobs").insert({
          job_id: form.job_id,
          job_name: form.job_name,
          status: form.status,
          sheets_estimated: form.sheets_estimated,
          created_by: user?.id,
        }).select("id").single();
        if (error) throw error;
        toast({ title: "Job created", description: `${form.job_id} — ${form.job_name}` });

        // Auto-create Drive folder (fire & forget)
        if (newJob?.id) {
          supabase.functions.invoke("google-drive-auth", {
            body: { action: "create_job_folder", job_id: newJob.id },
          }).catch(() => {}); // silent — Drive may not be configured
        }
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
          <DialogTitle className="font-mono text-foreground">{isEdit ? "Edit Job" : "New Job"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>JOB ID</label>
            <input
              type="text"
              required
              maxLength={20}
              disabled={isEdit}
              value={form.job_id}
              onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}
              className={inputClass}
              placeholder="J2024-006"
            />
          </div>
          <div>
            <label className={labelClass}>JOB NAME</label>
            <input
              type="text"
              required
              maxLength={100}
              value={form.job_name}
              onChange={e => setForm(f => ({ ...f, job_name: e.target.value }))}
              className={inputClass}
              placeholder="Kitchen renovation"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>STATUS</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={selectClass}>
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>SHEETS EST.</label>
              <input
                type="number"
                min={0}
                value={form.sheets_estimated}
                onChange={e => setForm(f => ({ ...f, sheets_estimated: parseInt(e.target.value) || 0 }))}
                className={inputClass}
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Job"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
