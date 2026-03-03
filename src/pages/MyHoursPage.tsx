import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Clock, Play, Square, Coffee, Calendar, Palmtree, Plus, Banknote, Info, ChevronDown, ChevronUp } from "lucide-react";
import { format, startOfWeek, startOfMonth, differenceInMinutes, parseISO, eachDayOfInterval, endOfMonth } from "date-fns";

/* ─── Types ─── */
interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  approved: boolean;
}

interface HolidayRequest {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  reason: string | null;
  status: string;
  created_at: string;
}

interface PayProfile {
  pay_type: string;
  hourly_rate: number | null;
  salary_monthly: number | null;
  overtime_eligible: boolean;
  visible_to_staff: boolean;
}

interface PayrollSettings {
  enable_staff_pay_estimate: boolean;
  pay_currency: string;
  overtime_multiplier: number;
  include_overtime_in_estimate: boolean;
  rounding_rule: string;
}

/* ─── Helpers ─── */
function roundMinutes(mins: number, rule: string): number {
  if (rule === "nearest_5_minutes") return Math.round(mins / 5) * 5;
  if (rule === "nearest_15_minutes") return Math.round(mins / 15) * 15;
  return mins;
}

const STANDARD_HOURS_PER_DAY = 8;

/* ─── Page ─── */
export default function MyHoursPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [holidays, setHolidays] = useState<HolidayRequest[]>([]);
  const [payProfile, setPayProfile] = useState<PayProfile | null>(null);
  const [paySettings, setPaySettings] = useState<PayrollSettings | null>(null);
  const [profileData, setProfileData] = useState<{ holiday_allowance_days: number; holiday_balance_days: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockingIn, setClockingIn] = useState(false);
  const [breakMins, setBreakMins] = useState(0);
  const [roundingRule, setRoundingRule] = useState("none");

  // Holiday request form
  const [showHolForm, setShowHolForm] = useState(false);
  const [holForm, setHolForm] = useState({ start_date: "", end_date: "", reason: "" });
  const [holSaving, setHolSaving] = useState(false);

  // Expandable sections
  const [showHistory, setShowHistory] = useState(false);
  const [showHolList, setShowHolList] = useState(false);

  const activeEntry = useMemo(() => entries.find(e => !e.clock_out), [entries]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const monthStart = startOfMonth(new Date()).toISOString();

    const [entriesRes, settingsRes, holRes, profRes, payProfRes, paySetRes] = await Promise.all([
      supabase.from("time_entries").select("*").eq("staff_id", user.id).order("clock_in", { ascending: false }).limit(100),
      supabase.from("payroll_settings").select("rounding_rule").limit(1).maybeSingle(),
      supabase.from("holiday_requests").select("*").eq("staff_id", user.id).order("start_date", { ascending: false }).limit(50),
      supabase.from("profiles").select("holiday_allowance_days, holiday_balance_days").eq("user_id", user.id).single(),
      supabase.from("staff_pay_profiles").select("pay_type, hourly_rate, salary_monthly, overtime_eligible, visible_to_staff").eq("staff_id", user.id).maybeSingle(),
      supabase.from("payroll_settings").select("enable_staff_pay_estimate, pay_currency, overtime_multiplier, include_overtime_in_estimate, rounding_rule").limit(1).maybeSingle(),
    ]);
    setEntries((entriesRes.data as TimeEntry[]) ?? []);
    setRoundingRule(settingsRes.data?.rounding_rule ?? "none");
    setHolidays((holRes.data as HolidayRequest[]) ?? []);
    setProfileData(profRes.data as any);
    setPayProfile(payProfRes.data as PayProfile | null);
    setPaySettings(paySetRes.data as PayrollSettings | null);
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
    const { error } = await supabase.from("time_entries").update({ clock_out: new Date().toISOString(), break_minutes: breakMins }).eq("id", activeEntry.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Clocked Out", description: format(new Date(), "HH:mm") });
    setBreakMins(0);
    setClockingIn(false);
    fetchData();
  };

  const handleHolidaySubmit = async () => {
    if (!user || !holForm.start_date || !holForm.end_date) return;
    setHolSaving(true);
    const { error } = await supabase.from("holiday_requests").insert([{
      staff_id: user.id,
      start_date: holForm.start_date,
      end_date: holForm.end_date,
      reason: holForm.reason || null,
      type: "Holiday",
      status: "Pending",
    }]);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Holiday Requested" }); setShowHolForm(false); setHolForm({ start_date: "", end_date: "", reason: "" }); }
    setHolSaving(false);
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

  const todayHours = useMemo(() => entries.filter(e => e.clock_in.startsWith(todayStr)).reduce((sum, e) => sum + calcHours(e), 0), [entries, todayStr, roundingRule]);
  const weekHours = useMemo(() => entries.filter(e => parseISO(e.clock_in) >= weekStart).reduce((sum, e) => sum + calcHours(e), 0), [entries, weekStart, roundingRule]);
  const monthHours = useMemo(() => entries.filter(e => parseISO(e.clock_in) >= monthStart).reduce((sum, e) => sum + calcHours(e), 0), [entries, monthStart, roundingRule]);

  // Pay calculation
  const workingDaysSoFar = eachDayOfInterval({ start: startOfMonth(now), end: now }).filter(d => d.getDay() !== 0 && d.getDay() !== 6).length;
  const standardHoursThisPeriod = workingDaysSoFar * STANDARD_HOURS_PER_DAY;
  const overtimeHours = Math.max(0, monthHours - standardHoursThisPeriod);
  const standardHoursWorked = monthHours - overtimeHours;

  let grossEstimate: number | null = null;
  const showPay = paySettings?.enable_staff_pay_estimate && payProfile?.visible_to_staff;
  if (showPay && payProfile) {
    const currMult = paySettings?.overtime_multiplier ?? 1.5;
    if (payProfile.pay_type === "hourly" && payProfile.hourly_rate) {
      const rate = Number(payProfile.hourly_rate);
      grossEstimate = standardHoursWorked * rate + (payProfile.overtime_eligible && paySettings?.include_overtime_in_estimate ? overtimeHours * rate * currMult : 0);
    } else if (payProfile.pay_type === "salary" && payProfile.salary_monthly) {
      grossEstimate = Number(payProfile.salary_monthly);
    }
  }
  const currencySymbol = paySettings?.pay_currency === "USD" ? "$" : paySettings?.pay_currency === "EUR" ? "€" : "£";

  const completedEntries = entries.filter(e => e.clock_out);
  const holTaken = (profileData?.holiday_allowance_days ?? 0) - (profileData?.holiday_balance_days ?? 0);
  const upcomingHols = holidays.filter(h => h.status === "Approved" && h.start_date >= todayStr);

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">My HR</h2>
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-in max-w-lg mx-auto lg:max-w-none">
      <div>
        <h2 className="text-2xl font-mono font-bold text-foreground">My HR</h2>
        <p className="text-sm text-muted-foreground">{format(now, "EEEE, d MMMM yyyy")}</p>
      </div>

      {/* ──── Card 1: Clock ──── */}
      <div className="glass-panel rounded-xl p-5 space-y-4">
        <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Clock size={14} /> Clock</h3>
        {activeEntry ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <div className="status-dot status-active animate-pulse-glow" />
              <span>Clocked in since <strong>{format(parseISO(activeEntry.clock_in), "HH:mm")}</strong></span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Coffee size={14} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Break</span>
                <input type="number" min={0} max={120} value={breakMins} onChange={e => setBreakMins(parseInt(e.target.value) || 0)} className="w-16 h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground text-center" />
                <span className="text-xs text-muted-foreground">mins</span>
              </div>
            </div>
            <button onClick={handleClockOut} disabled={clockingIn} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-destructive text-sm font-bold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors">
              <Square size={16} /> Clock Out
            </button>
          </div>
        ) : (
          <button onClick={handleClockIn} disabled={clockingIn} className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-lg bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <Play size={18} /> Clock In
          </button>
        )}
        <p className="text-xs text-muted-foreground text-center">Today: <strong className="text-foreground">{todayHours.toFixed(1)}h</strong></p>
      </div>

      {/* ──── Card 2: My Hours ──── */}
      <div className="glass-panel rounded-xl p-5 space-y-3">
        <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Calendar size={14} /> My Hours</h3>
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Today" value={`${todayHours.toFixed(1)}h`} />
          <MiniStat label="This Week" value={`${weekHours.toFixed(1)}h`} accent />
          <MiniStat label="This Month" value={`${monthHours.toFixed(1)}h`} />
        </div>
        <button onClick={() => setShowHistory(!showHistory)} className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
          {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showHistory ? "Hide" : "Show"} History
        </button>
        {showHistory && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {completedEntries.slice(0, 20).map(e => (
              <div key={e.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-muted/30">
                <span className="font-medium text-foreground">{format(parseISO(e.clock_in), "dd MMM")}</span>
                <span className="text-muted-foreground font-mono">{format(parseISO(e.clock_in), "HH:mm")} – {e.clock_out ? format(parseISO(e.clock_out), "HH:mm") : "—"}</span>
                <span className="font-mono font-medium text-foreground">{calcHours(e).toFixed(1)}h</span>
                <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full", e.approved ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>{e.approved ? "✓" : "⏳"}</span>
              </div>
            ))}
            {completedEntries.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No entries yet</p>}
          </div>
        )}
      </div>

      {/* ──── Card 3: Holidays ──── */}
      <div className="glass-panel rounded-xl p-5 space-y-3">
        <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Palmtree size={14} /> Holidays</h3>
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Allowance" value={`${profileData?.holiday_allowance_days ?? 0}d`} />
          <MiniStat label="Taken" value={`${holTaken}d`} />
          <MiniStat label="Remaining" value={`${profileData?.holiday_balance_days ?? 0}d`} accent />
        </div>

        {upcomingHols.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-mono text-muted-foreground uppercase">Upcoming</p>
            {upcomingHols.slice(0, 3).map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-success/5">
                <span className="text-foreground">{format(parseISO(h.start_date), "dd MMM")} – {format(parseISO(h.end_date), "dd MMM")}</span>
                <span className="text-[9px] font-mono text-success bg-success/15 px-1.5 py-0.5 rounded-full">Approved</span>
              </div>
            ))}
          </div>
        )}

        {!showHolForm ? (
          <button onClick={() => setShowHolForm(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
            <Plus size={14} /> Request Holiday
          </button>
        ) : (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase">Start</label>
                <input type="date" value={holForm.start_date} onChange={e => setHolForm(f => ({ ...f, start_date: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase">End</label>
                <input type="date" value={holForm.end_date} onChange={e => setHolForm(f => ({ ...f, end_date: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground" />
              </div>
            </div>
            <input placeholder="Note (optional)" value={holForm.reason} onChange={e => setHolForm(f => ({ ...f, reason: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground" />
            <div className="flex gap-2">
              <button onClick={handleHolidaySubmit} disabled={holSaving || !holForm.start_date || !holForm.end_date} className="flex-1 px-3 py-2 rounded-md bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Submit</button>
              <button onClick={() => setShowHolForm(false)} className="px-3 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        <button onClick={() => setShowHolList(!showHolList)} className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
          {showHolList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showHolList ? "Hide" : "All"} Requests
        </button>
        {showHolList && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {holidays.map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-muted/30">
                <span className="text-foreground">{format(parseISO(h.start_date), "dd MMM")} – {format(parseISO(h.end_date), "dd MMM")}</span>
                <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full",
                  h.status === "Approved" ? "bg-success/15 text-success" :
                  h.status === "Rejected" ? "bg-destructive/15 text-destructive" :
                  "bg-warning/15 text-warning"
                )}>{h.status}</span>
              </div>
            ))}
            {holidays.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No requests</p>}
          </div>
        )}
      </div>

      {/* ──── Card 4: My Pay (optional) ──── */}
      {showPay && (
        <div className="glass-panel rounded-xl p-5 space-y-3">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Banknote size={14} /> My Pay</h3>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Standard" value={`${standardHoursWorked.toFixed(1)}h`} />
            {payProfile?.overtime_eligible && <MiniStat label="Overtime" value={`${overtimeHours.toFixed(1)}h`} accent={overtimeHours > 0} />}
            {grossEstimate !== null && <MiniStat label="Gross Est." value={`${currencySymbol}${grossEstimate.toFixed(0)}`} accent />}
          </div>
          <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 flex items-start gap-2">
            <Info size={12} className="text-warning shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground">Estimate only – final payroll may vary.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Components ─── */
function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/30">
      <p className={cn("text-lg font-mono font-bold", accent ? "text-primary" : "text-foreground")}>{value}</p>
      <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  );
}
