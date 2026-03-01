import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

const EVENT_TYPES = ["Production", "Install", "Meeting", "Holiday", "Sick", "Training", "Maintenance"] as const;

interface EventData {
  id: string;
  title: string;
  event_type: string;
  start_datetime: string;
  end_datetime: string;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  event?: EventData | null;
  defaultDate?: string;
}

export default function EventDialog({ open, onOpenChange, onSuccess, event, defaultDate }: Props) {
  const isEdit = !!event;
  const now = defaultDate || format(new Date(), "yyyy-MM-dd'T'HH:mm");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: event?.title ?? "",
    event_type: event?.event_type ?? "Production",
    start_datetime: event?.start_datetime ? event.start_datetime.slice(0, 16) : now,
    end_datetime: event?.end_datetime ? event.end_datetime.slice(0, 16) : now,
    notes: event?.notes ?? "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from("calendar_events")
          .update({
            title: form.title,
            event_type: form.event_type,
            start_datetime: form.start_datetime,
            end_datetime: form.end_datetime,
            notes: form.notes || null,
          })
          .eq("id", event!.id);
        if (error) throw error;
        toast({ title: "Event updated" });
      } else {
        const { error } = await supabase.from("calendar_events").insert({
          title: form.title,
          event_type: form.event_type,
          start_datetime: form.start_datetime,
          end_datetime: form.end_datetime,
          notes: form.notes || null,
        });
        if (error) throw error;
        toast({ title: "Event created", description: form.title });
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
    if (!event || !confirm("Delete this event?")) return;
    const { error } = await supabase.from("calendar_events").delete().eq("id", event.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event deleted" });
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
          <DialogTitle className="font-mono text-foreground">{isEdit ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>TITLE</label>
            <input type="text" required maxLength={100} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="CNC Cut — Job Name" />
          </div>
          <div>
            <label className={labelClass}>TYPE</label>
            <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))} className={selectClass}>
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>START</label>
              <input type="datetime-local" required value={form.start_datetime} onChange={e => setForm(f => ({ ...f, start_datetime: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>END</label>
              <input type="datetime-local" required value={form.end_datetime} onChange={e => setForm(f => ({ ...f, end_datetime: e.target.value }))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>NOTES</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} maxLength={500} rows={2} className={inputClass + " h-auto py-2"} placeholder="Optional notes..." />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="flex-1 h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Event"}
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
