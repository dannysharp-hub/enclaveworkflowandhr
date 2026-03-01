import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const CATEGORIES = ["SOP", "Safety", "Machine", "HR", "JobPack", "Template", "Other"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function DocumentDialog({ open, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "SOP" as string,
    requires_acknowledgement: false,
    acknowledgement_type: "open_only" as string,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("file_assets").insert({
        title: form.title,
        category: form.category,
        requires_acknowledgement: form.requires_acknowledgement,
        acknowledgement_type: form.requires_acknowledgement ? form.acknowledgement_type : "open_only",
        uploaded_by: user?.id,
        version: 1,
        status: "active",
      });
      if (error) throw error;
      toast({ title: "Document added", description: form.title });
      setForm({ title: "", category: "SOP", requires_acknowledgement: false, acknowledgement_type: "open_only" });
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
          <DialogTitle className="font-mono text-foreground">Add Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>TITLE</label>
            <input type="text" required maxLength={200} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="CNC Safety Procedures" />
          </div>
          <div>
            <label className={labelClass}>CATEGORY</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={selectClass}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="req-ack"
              checked={form.requires_acknowledgement}
              onChange={e => setForm(f => ({ ...f, requires_acknowledgement: e.target.checked }))}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <label htmlFor="req-ack" className="text-sm text-foreground">Requires acknowledgement</label>
          </div>
          {form.requires_acknowledgement && (
            <div>
              <label className={labelClass}>ACKNOWLEDGEMENT TYPE</label>
              <select value={form.acknowledgement_type} onChange={e => setForm(f => ({ ...f, acknowledgement_type: e.target.value }))} className={selectClass}>
                <option value="open_only">Open only</option>
                <option value="open_and_confirm">Open and confirm</option>
              </select>
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading ? "Adding..." : "Add Document"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
