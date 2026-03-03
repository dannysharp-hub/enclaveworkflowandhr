import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Download, FileSpreadsheet, Clock, Palmtree, Users, ShieldCheck, BarChart3 } from "lucide-react";
import { format, differenceInMinutes, parseISO } from "date-fns";
import { exportToCsv } from "@/lib/csvExport";

const inputClass = "h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground";

interface ExportOption {
  key: string;
  label: string;
  description: string;
  icon: typeof Clock;
  category: "hr" | "finance" | "operations";
}

const EXPORTS: ExportOption[] = [
  { key: "timesheets", label: "Timesheets", description: "Full time entry data with staff names, clock times, breaks, totals", icon: Clock, category: "hr" },
  { key: "payroll", label: "Payroll Summary", description: "Aggregated hours per staff: regular, overtime, total", icon: BarChart3, category: "hr" },
  { key: "holidays", label: "Holiday Report", description: "All holiday requests with status, dates, type", icon: Palmtree, category: "hr" },
  { key: "staff_hours", label: "Staff Hours Summary", description: "Per-staff monthly hours breakdown", icon: Users, category: "hr" },
  { key: "anomalies", label: "Clock Anomalies", description: "Missing clock-outs and resolution log", icon: ShieldCheck, category: "hr" },
  { key: "staff_directory", label: "Staff Directory", description: "Staff profiles, departments, employment type, holiday balances", icon: Users, category: "hr" },
];

export default function ExportCentrePage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [category, setCategory] = useState<"all" | "hr" | "finance" | "operations">("all");

  const getProfiles = async () => {
    const { data } = await supabase.from("profiles").select("user_id, full_name, department, employment_type, holiday_allowance_days, holiday_balance_days");
    const map: Record<string, any> = {};
    (data ?? []).forEach((p: any) => { map[p.user_id] = p; });
    return { list: data ?? [], map };
  };

  const handleExport = async (key: string) => {
    setExporting(key);
    try {
      const { list: profList, map: pMap } = await getProfiles();

      if (key === "timesheets") {
        let q = supabase.from("time_entries").select("*").order("clock_in", { ascending: false });
        if (dateFrom) q = q.gte("clock_in", `${dateFrom}T00:00:00`);
        if (dateTo) q = q.lte("clock_in", `${dateTo}T23:59:59`);
        const { data: entries } = await q;
        exportToCsv("timesheets", ["Staff", "Department", "Date", "Clock In", "Clock Out", "Break (mins)", "Total Hours", "Approved", "Notes"], (entries ?? []).map((e: any) => {
          const hrs = e.clock_out ? Math.max(0, differenceInMinutes(parseISO(e.clock_out), parseISO(e.clock_in)) - (e.break_minutes || 0)) / 60 : 0;
          const p = pMap[e.staff_id];
          return [p?.full_name || "Unknown", p?.department || "", format(parseISO(e.clock_in), "yyyy-MM-dd"), format(parseISO(e.clock_in), "HH:mm"), e.clock_out ? format(parseISO(e.clock_out), "HH:mm") : "MISSING", e.break_minutes || 0, hrs.toFixed(2), e.approved ? "Yes" : "No", e.notes || ""];
        }));
      }

      if (key === "payroll") {
        let q = supabase.from("time_entries").select("*").order("clock_in");
        if (dateFrom) q = q.gte("clock_in", `${dateFrom}T00:00:00`);
        if (dateTo) q = q.lte("clock_in", `${dateTo}T23:59:59`);
        const { data: entries } = await q;
        const agg: Record<string, { name: string; dept: string; mins: number }> = {};
        (entries ?? []).forEach((e: any) => {
          if (!e.clock_out) return;
          const mins = Math.max(0, differenceInMinutes(parseISO(e.clock_out), parseISO(e.clock_in)) - (e.break_minutes || 0));
          if (!agg[e.staff_id]) agg[e.staff_id] = { name: pMap[e.staff_id]?.full_name || "Unknown", dept: pMap[e.staff_id]?.department || "", mins: 0 };
          agg[e.staff_id].mins += mins;
        });
        const STANDARD = 40 * 60;
        exportToCsv("payroll_summary", ["Staff", "Department", "Regular Hours", "Overtime Hours", "Total Hours"], Object.values(agg).map(s => {
          const reg = Math.min(s.mins, STANDARD) / 60;
          const ot = Math.max(0, s.mins - STANDARD) / 60;
          return [s.name, s.dept, reg.toFixed(2), ot.toFixed(2), (s.mins / 60).toFixed(2)];
        }));
      }

      if (key === "holidays") {
        const { data: hols } = await supabase.from("holiday_requests").select("*").order("start_date", { ascending: false });
        exportToCsv("holiday_report", ["Staff", "Department", "Start", "End", "Type", "Status", "Reason", "Requested"], (hols ?? []).map((h: any) => {
          const p = pMap[h.staff_id];
          return [p?.full_name || "Unknown", p?.department || "", h.start_date, h.end_date, h.type, h.status, h.reason || "", format(parseISO(h.created_at), "yyyy-MM-dd")];
        }));
      }

      if (key === "staff_hours") {
        let q = supabase.from("time_entries").select("*").order("clock_in");
        if (dateFrom) q = q.gte("clock_in", `${dateFrom}T00:00:00`);
        if (dateTo) q = q.lte("clock_in", `${dateTo}T23:59:59`);
        const { data: entries } = await q;
        // Group by staff + date
        const daily: Record<string, Record<string, number>> = {};
        (entries ?? []).forEach((e: any) => {
          if (!e.clock_out) return;
          const mins = Math.max(0, differenceInMinutes(parseISO(e.clock_out), parseISO(e.clock_in)) - (e.break_minutes || 0));
          const day = format(parseISO(e.clock_in), "yyyy-MM-dd");
          if (!daily[e.staff_id]) daily[e.staff_id] = {};
          daily[e.staff_id][day] = (daily[e.staff_id][day] || 0) + mins;
        });
        const rows: any[][] = [];
        Object.entries(daily).forEach(([sid, days]) => {
          Object.entries(days).forEach(([day, mins]) => {
            const p = pMap[sid];
            rows.push([p?.full_name || "Unknown", p?.department || "", day, (mins / 60).toFixed(2)]);
          });
        });
        rows.sort((a, b) => `${a[0]}${a[2]}`.localeCompare(`${b[0]}${b[2]}`));
        exportToCsv("staff_hours_summary", ["Staff", "Department", "Date", "Hours"], rows);
      }

      if (key === "anomalies") {
        const { data: anomalies } = await supabase.from("clock_anomalies").select("*").order("detected_at", { ascending: false });
        exportToCsv("clock_anomalies", ["Staff", "Type", "Detected", "Resolved", "Resolution Type", "Resolved Clock Out", "Notes"], (anomalies ?? []).map((a: any) => {
          const p = pMap[a.staff_id];
          return [p?.full_name || "Unknown", a.anomaly_type, format(parseISO(a.detected_at), "yyyy-MM-dd HH:mm"), a.resolved ? "Yes" : "No", a.resolution_type || "", a.resolved_clock_out ? format(parseISO(a.resolved_clock_out), "HH:mm") : "", a.notes || ""];
        }));
      }

      if (key === "staff_directory") {
        exportToCsv("staff_directory", ["Name", "Department", "Employment Type", "Holiday Allowance", "Holiday Remaining"], profList.map((p: any) => [p.full_name, p.department || "", p.employment_type || "", p.holiday_allowance_days, p.holiday_balance_days]));
      }

      toast({ title: "Export Complete" });
    } catch (err: any) {
      toast({ title: "Export Error", description: err.message, variant: "destructive" });
    }
    setExporting(null);
  };

  const filtered = EXPORTS.filter(e => category === "all" || e.category === category);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-mono font-bold text-foreground">Export Centre</h2>
        <p className="text-sm text-muted-foreground">Download reports and data as CSV. All exports are tenant-scoped.</p>
      </div>

      {/* Date range */}
      <div className="glass-panel rounded-lg p-5">
        <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Date Range (optional)</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputClass} />
          <span className="text-muted-foreground text-sm">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputClass} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>
          )}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2">
        {(["all", "hr"] as const).map(c => (
          <button key={c} onClick={() => setCategory(c)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", category === c ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground")}>
            {c === "all" ? "All" : "HR"}
          </button>
        ))}
      </div>

      {/* Export cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(exp => (
          <button
            key={exp.key}
            onClick={() => handleExport(exp.key)}
            disabled={exporting !== null}
            className="glass-panel rounded-lg p-5 text-left hover:bg-muted/20 transition-colors disabled:opacity-50 group"
          >
            <div className="flex items-start justify-between mb-3">
              <exp.icon size={22} className="text-primary" />
              <Download size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="font-mono text-sm font-bold text-foreground">{exp.label}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{exp.description}</p>
            {exporting === exp.key && (
              <div className="mt-2 flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-muted-foreground">Generating...</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
