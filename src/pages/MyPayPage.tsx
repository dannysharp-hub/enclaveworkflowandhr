import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Banknote, Clock, TrendingUp, Info } from "lucide-react";
import { startOfMonth, endOfMonth, differenceInMinutes, parseISO, format, eachDayOfInterval } from "date-fns";

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
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
  pay_frequency: string;
  include_overtime_in_estimate: boolean;
  overtime_multiplier: number;
  rounding_rule: string;
}

const STANDARD_HOURS_PER_DAY = 8;

export default function MyPayPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [payProfile, setPayProfile] = useState<PayProfile | null>(null);
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const monthStart = startOfMonth(new Date()).toISOString();
    const monthEnd = endOfMonth(new Date()).toISOString();

    const [entriesRes, profileRes, settingsRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id, clock_in, clock_out, break_minutes")
        .eq("staff_id", user.id)
        .gte("clock_in", monthStart)
        .lte("clock_in", monthEnd)
        .order("clock_in"),
      supabase
        .from("staff_pay_profiles")
        .select("pay_type, hourly_rate, salary_monthly, overtime_eligible, visible_to_staff")
        .eq("staff_id", user.id)
        .maybeSingle(),
      supabase.from("payroll_settings").select("*").limit(1).maybeSingle(),
    ]);

    setEntries((entriesRes.data as TimeEntry[]) ?? []);
    setPayProfile(profileRes.data as PayProfile | null);
    setSettings(settingsRes.data as PayrollSettings | null);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const calcMinutes = (entry: TimeEntry): number => {
    if (!entry.clock_out) return 0;
    return Math.max(0, differenceInMinutes(parseISO(entry.clock_out), parseISO(entry.clock_in)) - entry.break_minutes);
  };

  const totalMinutes = useMemo(() => entries.reduce((sum, e) => sum + calcMinutes(e), 0), [entries]);
  const totalHours = totalMinutes / 60;

  // Calculate working days in this month for standard hours
  const now = new Date();
  const monthDays = eachDayOfInterval({ start: startOfMonth(now), end: now });
  const workingDaysSoFar = monthDays.filter(d => {
    const day = d.getDay();
    return day !== 0 && day !== 6;
  }).length;
  const standardHoursThisPeriod = workingDaysSoFar * STANDARD_HOURS_PER_DAY;
  const overtimeHours = Math.max(0, totalHours - standardHoursThisPeriod);
  const standardHoursWorked = totalHours - overtimeHours;

  const currency = settings?.pay_currency ?? "GBP";
  const currencySymbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency;
  const overtimeMultiplier = settings?.overtime_multiplier ?? 1.5;

  let grossEstimate: number | null = null;
  let showRates = false;

  if (payProfile && payProfile.visible_to_staff) {
    showRates = true;
    if (payProfile.pay_type === "hourly" && payProfile.hourly_rate) {
      const rate = Number(payProfile.hourly_rate);
      const stdPay = standardHoursWorked * rate;
      const otPay = payProfile.overtime_eligible && settings?.include_overtime_in_estimate
        ? overtimeHours * rate * overtimeMultiplier
        : 0;
      grossEstimate = stdPay + otPay;
    } else if (payProfile.pay_type === "salary" && payProfile.salary_monthly) {
      grossEstimate = Number(payProfile.salary_monthly);
    }
  }

  const daysLogged = new Set(entries.filter(e => e.clock_out).map(e => e.clock_in.split("T")[0])).size;

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">My Pay</h2>
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!settings?.enable_staff_pay_estimate) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">My Pay</h2>
        <div className="glass-panel rounded-lg p-12 text-center">
          <Info size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Pay estimates are not currently enabled. Contact your admin for more info.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-mono font-bold text-foreground">My Pay</h2>
        <p className="text-sm text-muted-foreground">
          {format(startOfMonth(now), "d MMM")} — {format(now, "d MMM yyyy")} · {settings.pay_frequency} pay
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PayCard icon={Clock} label="HOURS WORKED" value={`${totalHours.toFixed(1)}h`} />
        <PayCard icon={Clock} label="STANDARD" value={`${standardHoursWorked.toFixed(1)}h`} />
        {payProfile?.overtime_eligible && (
          <PayCard icon={TrendingUp} label="OVERTIME" value={`${overtimeHours.toFixed(1)}h`} accent={overtimeHours > 0} />
        )}
        {grossEstimate !== null && showRates && (
          <PayCard icon={Banknote} label="GROSS EST." value={`${currencySymbol}${grossEstimate.toFixed(2)}`} accent />
        )}
      </div>

      {/* Breakdown */}
      {showRates && payProfile && (
        <div className="glass-panel rounded-lg p-6 space-y-4">
          <h3 className="font-mono text-sm font-bold text-foreground">Pay Breakdown</h3>
          <div className="space-y-2 text-sm">
            {payProfile.pay_type === "hourly" && payProfile.hourly_rate && (
              <>
                <Row label="Standard hours" value={`${standardHoursWorked.toFixed(1)}h × ${currencySymbol}${Number(payProfile.hourly_rate).toFixed(2)}`} result={`${currencySymbol}${(standardHoursWorked * Number(payProfile.hourly_rate)).toFixed(2)}`} />
                {payProfile.overtime_eligible && settings?.include_overtime_in_estimate && overtimeHours > 0 && (
                  <Row label={`Overtime (×${overtimeMultiplier})`} value={`${overtimeHours.toFixed(1)}h × ${currencySymbol}${(Number(payProfile.hourly_rate) * overtimeMultiplier).toFixed(2)}`} result={`${currencySymbol}${(overtimeHours * Number(payProfile.hourly_rate) * overtimeMultiplier).toFixed(2)}`} />
                )}
                <div className="border-t border-border pt-2 flex justify-between font-mono font-bold text-foreground">
                  <span>Gross Estimate</span>
                  <span>{currencySymbol}{grossEstimate?.toFixed(2)}</span>
                </div>
              </>
            )}
            {payProfile.pay_type === "salary" && (
              <>
                <Row label="Monthly salary" value="" result={`${currencySymbol}${Number(payProfile.salary_monthly).toFixed(2)}`} />
                <Row label="Days logged" value="" result={`${daysLogged} days`} />
                <Row label="Total hours" value="" result={`${totalHours.toFixed(1)}h`} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 flex items-start gap-2">
        <Info size={16} className="text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          <strong>Estimated gross pay.</strong> Final payroll may differ. This does not include tax, NI, pension, or other deductions.
        </p>
      </div>
    </div>
  );
}

function PayCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-panel rounded-lg p-4 text-center">
      <Icon size={16} className={accent ? "text-primary mx-auto mb-1" : "text-muted-foreground mx-auto mb-1"} />
      <p className={cn("text-2xl font-mono font-bold", accent ? "text-primary" : "text-foreground")}>{value}</p>
      <p className="text-[10px] font-mono text-muted-foreground tracking-wide">{label}</p>
    </div>
  );
}

function Row({ label, value, result }: { label: string; value: string; result: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <div className="flex items-center gap-4">
        {value && <span className="text-xs">{value}</span>}
        <span className="font-mono font-medium text-foreground">{result}</span>
      </div>
    </div>
  );
}
