import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Clock } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";

interface AnomalyEntry {
  entryId: string;
  clockIn: string;
}

/**
 * Detects unresolved missing clock-outs and prompts staff to resolve them.
 * Renders as a modal overlay when anomalies are found.
 */
export default function ClockAnomalyPrompt() {
  const { user } = useAuth();
  const [anomaly, setAnomaly] = useState<AnomalyEntry | null>(null);
  const [resolveTime, setResolveTime] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    detectAnomalies();
  }, [user]);

  const detectAnomalies = async () => {
    if (!user) return;

    // Find time entries with no clock_out that are older than today (yesterday or earlier)
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

    const { data: openEntries } = await supabase
      .from("time_entries")
      .select("id, clock_in")
      .eq("staff_id", user.id)
      .is("clock_out", null)
      .lt("clock_in", `${yesterday}T23:59:59`)
      .order("clock_in", { ascending: false })
      .limit(1);

    if (!openEntries || openEntries.length === 0) return;

    const entry = openEntries[0];

    // Check if there's already an unresolved anomaly for this entry
    const { data: existing } = await supabase
      .from("clock_anomalies")
      .select("id")
      .eq("time_entry_id", entry.id)
      .eq("resolved", false)
      .limit(1);

    // Create anomaly record if none exists
    if (!existing || existing.length === 0) {
      await supabase.from("clock_anomalies").insert({
        staff_id: user.id,
        time_entry_id: entry.id,
        anomaly_type: "missing_clock_out",
        tenant_id: "00000000-0000-0000-0000-000000000001",
      });
    }

    setAnomaly({ entryId: entry.id, clockIn: entry.clock_in });

    // Default resolve time to clock_in + 8 hours
    const clockInDate = parseISO(entry.clock_in);
    const defaultOut = new Date(clockInDate.getTime() + 8 * 60 * 60 * 1000);
    setResolveTime(format(defaultOut, "HH:mm"));
  };

  const handleResolve = async (type: "manual_time" | "standard_shift_end") => {
    if (!anomaly || !user) return;
    setSaving(true);

    try {
      // Calculate clock_out time
      const clockInDate = parseISO(anomaly.clockIn);
      let clockOut: Date;

      if (type === "manual_time" && resolveTime) {
        const [h, m] = resolveTime.split(":").map(Number);
        clockOut = new Date(clockInDate);
        clockOut.setHours(h, m, 0, 0);
        // If time is before clock_in, assume next day
        if (clockOut <= clockInDate) {
          clockOut.setDate(clockOut.getDate() + 1);
        }
      } else {
        // Standard shift end: clock_in + 8 hours
        clockOut = new Date(clockInDate.getTime() + 8 * 60 * 60 * 1000);
      }

      // Update the time entry
      const { error: updateError } = await supabase
        .from("time_entries")
        .update({ clock_out: clockOut.toISOString() })
        .eq("id", anomaly.entryId);

      if (updateError) throw updateError;

      // Resolve the anomaly
      const { error: resolveError } = await supabase
        .from("clock_anomalies")
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_clock_out: clockOut.toISOString(),
          resolution_type: type,
          notes: notes || null,
        })
        .eq("time_entry_id", anomaly.entryId)
        .eq("resolved", false);

      if (resolveError) throw resolveError;

      toast({ title: "Clock-out resolved", description: `Set to ${format(clockOut, "HH:mm")}` });
      setAnomaly(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (!anomaly) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md glass-panel rounded-xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-warning/15 flex items-center justify-center">
            <AlertTriangle size={20} className="text-warning" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold text-foreground">Missing Clock-Out</h3>
            <p className="text-xs text-muted-foreground">You didn't clock out on {format(parseISO(anomaly.clockIn), "dd MMM yyyy")}</p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/30 p-3 flex items-center gap-3">
          <Clock size={16} className="text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Clocked in at</p>
            <p className="font-mono font-bold text-foreground">{format(parseISO(anomaly.clockIn), "HH:mm")} on {format(parseISO(anomaly.clockIn), "EEEE")}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">What time did you finish?</label>
          <input
            type="time"
            value={resolveTime}
            onChange={e => setResolveTime(e.target.value)}
            className="w-full h-11 rounded-md border border-input bg-card px-3 text-lg font-mono text-foreground text-center"
          />
        </div>

        <input
          placeholder="Add a note (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />

        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleResolve("manual_time")}
            disabled={saving || !resolveTime}
            className="w-full px-4 py-3 rounded-lg bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Confirm Time
          </button>
          <button
            onClick={() => handleResolve("standard_shift_end")}
            disabled={saving}
            className="w-full px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            Use Standard Shift (8 hours)
          </button>
        </div>
      </div>
    </div>
  );
}
