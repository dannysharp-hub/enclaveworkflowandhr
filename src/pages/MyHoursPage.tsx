import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Clock, Play, Square, Coffee, Calendar } from "lucide-react";
import { format, startOfWeek, startOfMonth, differenceInMinutes, parseISO } from "date-fns";

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  approved: boolean;
}

function roundMinutes(mins: number, rule: string): number {
  if (rule === "nearest_5_minutes") return Math.round(mins / 5) * 5;
  if (rule === "nearest_15_minutes") return Math.round(mins / 15) * 15;
  return mins;
}

export default function MyHoursPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clockingIn, setClockingIn] = useState(false);
  const [breakMins, setBreakMins] = useState(0);
  const [roundingRule, setRoundingRule] = useState("none");

  const activeEntry = useMemo(() => entries.find(e => !e.clock_out), [entries]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [entriesRes, settingsRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("staff_id", user.id)
        .order("clock_in", { ascending: false })
        .limit(100),
      supabase.from("payroll_settings").select("rounding_rule").limit(1).maybeSingle(),
    ]);
    setEntries((entriesRes.data as TimeEntry[]) ?? []);
    setRoundingRule(settingsRes.data?.rounding_rule ?? "none");
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClockIn = async () => {
    if (!user) return;
    setClockingIn(true);
    const { error } = await supabase.from("time_entries").insert([{ staff_id: user.id, clock_in: new Date().toISOString(), tenant_id: "00000000-0000-0000-0000-000000000001" }]);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Clocked In", description: format(new Date(), "HH:mm") });
    setClockingIn(false);
    fetchData();
  };

  const handleClockOut = async () => {
    if (!activeEntry) return;
    setClockingIn(true);
    const { error } = await supabase.from("time_entries").update({
      clock_out: new Date().toISOString(),
      break_minutes: breakMins,
    }).eq("id", activeEntry.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Clocked Out", description: format(new Date(), "HH:mm") });
    setBreakMins(0);
    setClockingIn(false);
    fetchData();
  };

  const calcHours = (entry: TimeEntry): number => {
    if (!entry.clock_out) return 0;
    const raw = differenceInMinutes(parseISO(entry.clock_out), parseISO(entry.clock_in)) - entry.break_minutes;
    return roundMinutes(Math.max(0, raw), roundingRule) / 60;
  };

  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const todayHours = useMemo(() =>
    entries.filter(e => e.clock_in.startsWith(todayStr)).reduce((sum, e) => sum + calcHours(e), 0),
    [entries, todayStr, roundingRule]
  );
  const weekHours = useMemo(() =>
    entries.filter(e => parseISO(e.clock_in) >= weekStart).reduce((sum, e) => sum + calcHours(e), 0),
    [entries, weekStart, roundingRule]
  );
  const monthHours = useMemo(() =>
    entries.filter(e => parseISO(e.clock_in) >= monthStart).reduce((sum, e) => sum + calcHours(e), 0),
    [entries, monthStart, roundingRule]
  );

  const completedEntries = entries.filter(e => e.clock_out);

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">My Hours</h2>
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-mono font-bold text-foreground">My Hours</h2>
        <p className="text-sm text-muted-foreground">{format(now, "EEEE, d MMMM yyyy")}</p>
      </div>

      {/* Clock In/Out */}
      <div className="glass-panel rounded-lg p-6">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {activeEntry ? (
            <>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <div className="status-dot status-active animate-pulse-glow" />
                <span>Clocked in since <strong>{format(parseISO(activeEntry.clock_in), "HH:mm")}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Coffee size={14} className="text-muted-foreground" />
                <label className="text-xs text-muted-foreground">Break (mins):</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={breakMins}
                  onChange={e => setBreakMins(parseInt(e.target.value) || 0)}
                  className="w-16 h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                />
              </div>
              <button
                onClick={handleClockOut}
                disabled={clockingIn}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-destructive text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                <Square size={14} /> Clock Out
              </button>
            </>
          ) : (
            <button
              onClick={handleClockIn}
              disabled={clockingIn}
              className="flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Play size={14} /> Clock In
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard icon={Clock} label="TODAY" value={`${todayHours.toFixed(1)}h`} />
        <SummaryCard icon={Calendar} label="THIS WEEK" value={`${weekHours.toFixed(1)}h`} accent />
        <SummaryCard icon={Calendar} label="THIS MONTH" value={`${monthHours.toFixed(1)}h`} />
      </div>

      {/* History */}
      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-mono text-sm font-bold text-foreground">Attendance History</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Date</th>
              <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">In</th>
              <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Out</th>
              <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Break</th>
              <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Total</th>
              <th className="text-center px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {completedEntries.map(e => {
              const hours = calcHours(e);
              return (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-2 font-medium text-foreground">{format(parseISO(e.clock_in), "dd MMM yyyy")}</td>
                  <td className="px-4 py-2 text-foreground font-mono">{format(parseISO(e.clock_in), "HH:mm")}</td>
                  <td className="px-4 py-2 text-foreground font-mono">{e.clock_out ? format(parseISO(e.clock_out), "HH:mm") : "—"}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{e.break_minutes}m</td>
                  <td className="px-4 py-2 text-right font-mono font-medium text-foreground">{hours.toFixed(1)}h</td>
                  <td className="px-4 py-2 text-center">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium",
                      e.approved ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                    )}>
                      {e.approved ? "Approved" : "Pending"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {completedEntries.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No history yet. Clock in to start tracking.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-panel rounded-lg p-4 text-center">
      <Icon size={16} className={accent ? "text-primary mx-auto mb-1" : "text-muted-foreground mx-auto mb-1"} />
      <p className={cn("text-2xl font-mono font-bold", accent ? "text-primary" : "text-foreground")}>{value}</p>
      <p className="text-[10px] font-mono text-muted-foreground tracking-wide">{label}</p>
    </div>
  );
}
