import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Users, Clock, Palmtree, Download, Check, X, Pencil, ChevronDown, AlertTriangle, Search } from "lucide-react";
import { format, differenceInMinutes, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { exportToCsv, filterByDateRange } from "@/lib/csvExport";
import CsvExportButton from "@/components/CsvExportButton";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const tabClass = "px-4 py-2 text-sm font-medium rounded-t-md transition-colors";
const activeTab = "bg-card text-foreground border-b-2 border-primary";
const inactiveTab = "text-muted-foreground hover:text-foreground";

type Tab = "timesheets" | "holidays" | "staff" | "export";

export default function HrAdminPage() {
  const { userRole } = useAuth();
  const [tab, setTab] = useState<Tab>("timesheets");

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-mono font-bold text-foreground">HR Admin</h2>
        <p className="text-sm text-muted-foreground">Manage timesheets, holidays, staff & payroll</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: "timesheets", label: "Timesheets", icon: Clock },
          { key: "holidays", label: "Holidays", icon: Palmtree },
          { key: "staff", label: "Staff", icon: Users },
          { key: "export", label: "Export", icon: Download },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn(tabClass, tab === t.key ? activeTab : inactiveTab)}>
            <span className="flex items-center gap-1.5"><t.icon size={14} />{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "timesheets" && <TimesheetsTab />}
      {tab === "holidays" && <HolidaysTab />}
      {tab === "staff" && <StaffTab />}
      {tab === "export" && <ExportTab />}
    </div>
  );
}

/* ─── Timesheets Tab ─── */
function TimesheetsTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [anomalyCount, setAnomalyCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [entriesRes, profilesRes, anomalyRes] = await Promise.all([
      supabase.from("time_entries").select("*").gte("clock_in", `${dateFrom}T00:00:00`).lte("clock_in", `${dateTo}T23:59:59`).order("clock_in", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name"),
      supabase.from("clock_anomalies").select("id", { count: "exact", head: true }).eq("resolved", false),
    ]);
    setEntries(entriesRes.data ?? []);
    const pMap: Record<string, string> = {};
    (profilesRes.data ?? []).forEach((p: any) => { pMap[p.user_id] = p.full_name; });
    setProfiles(pMap);
    setAnomalyCount(anomalyRes.count ?? 0);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const calcHours = (e: any) => {
    if (!e.clock_out) return 0;
    return Math.max(0, differenceInMinutes(parseISO(e.clock_out), parseISO(e.clock_in)) - (e.break_minutes || 0)) / 60;
  };

  const filtered = entries.filter(e => {
    if (!search) return true;
    const name = profiles[e.staff_id] || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const missingClockOuts = entries.filter(e => !e.clock_out);

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {missingClockOuts.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-warning" />
          <span className="text-sm text-foreground"><strong>{missingClockOuts.length}</strong> missing clock-out{missingClockOuts.length > 1 ? "s" : ""}</span>
        </div>
      )}
      {anomalyCount > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-destructive" />
          <span className="text-sm text-foreground"><strong>{anomalyCount}</strong> unresolved clock anomal{anomalyCount > 1 ? "ies" : "y"} across all staff</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} className={cn(inputClass, "pl-9")} />
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground" />
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="glass-panel rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Staff</th>
                <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Date</th>
                <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">In</th>
                <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Out</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Break</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Total</th>
                <th className="text-center px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-2 font-medium text-foreground">{profiles[e.staff_id] || "Unknown"}</td>
                  <td className="px-4 py-2 text-foreground">{format(parseISO(e.clock_in), "dd MMM yyyy")}</td>
                  <td className="px-4 py-2 font-mono text-foreground">{format(parseISO(e.clock_in), "HH:mm")}</td>
                  <td className="px-4 py-2 font-mono text-foreground">{e.clock_out ? format(parseISO(e.clock_out), "HH:mm") : <span className="text-warning">Missing</span>}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{e.break_minutes || 0}m</td>
                  <td className="px-4 py-2 text-right font-mono font-medium text-foreground">{calcHours(e).toFixed(1)}h</td>
                  <td className="px-4 py-2 text-center">
                    <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full", e.approved ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>{e.approved ? "Approved" : "Pending"}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No entries found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Holidays Tab ─── */
function HolidaysTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("Pending");

  const load = useCallback(async () => {
    setLoading(true);
    const [reqRes, profRes] = await Promise.all([
      supabase.from("holiday_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name"),
    ]);
    setRequests(reqRes.data ?? []);
    const pMap: Record<string, string> = {};
    (profRes.data ?? []).forEach((p: any) => { pMap[p.user_id] = p.full_name; });
    setProfiles(pMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, status: "Approved" | "Rejected") => {
    const { error } = await supabase.from("holiday_requests").update({ status }).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: `Holiday ${status}` });
    load();
  };

  const filtered = requests.filter(r => filter === "All" || r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["Pending", "Approved", "Rejected", "All"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", filter === f ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground")}>{f}</button>
        ))}
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="glass-panel rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">{profiles[r.staff_id] || "Unknown"}</p>
                <p className="text-xs text-muted-foreground">{format(parseISO(r.start_date), "dd MMM yyyy")} – {format(parseISO(r.end_date), "dd MMM yyyy")} · {r.type}</p>
                {r.reason && <p className="text-xs text-muted-foreground mt-1 italic">{r.reason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full",
                  r.status === "Approved" ? "bg-success/15 text-success" :
                  r.status === "Rejected" ? "bg-destructive/15 text-destructive" :
                  "bg-warning/15 text-warning"
                )}>{r.status}</span>
                {r.status === "Pending" && (
                  <>
                    <button onClick={() => handleAction(r.id, "Approved")} className="h-8 w-8 rounded-md flex items-center justify-center bg-success/10 text-success hover:bg-success/20 transition-colors"><Check size={14} /></button>
                    <button onClick={() => handleAction(r.id, "Rejected")} className="h-8 w-8 rounded-md flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"><X size={14} /></button>
                  </>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No {filter.toLowerCase()} requests</p>}
        </div>
      )}
    </div>
  );
}

/* ─── Staff Tab ─── */
function StaffTab() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, department, employment_type, holiday_allowance_days, holiday_balance_days, hourly_rate, annual_salary").order("full_name");
      setStaff(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="h-32 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="glass-panel rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Name</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Dept</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Type</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Holiday Allow.</th>
            <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Holiday Rem.</th>
          </tr>
        </thead>
        <tbody>
          {staff.map(s => (
            <tr key={s.user_id} className="border-b border-border last:border-0 hover:bg-muted/10">
              <td className="px-4 py-2 font-medium text-foreground">{s.full_name}</td>
              <td className="px-4 py-2 text-muted-foreground">{s.department || "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{s.employment_type || "—"}</td>
              <td className="px-4 py-2 text-right text-foreground">{s.holiday_allowance_days}d</td>
              <td className="px-4 py-2 text-right text-foreground">{s.holiday_balance_days}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Export Tab ─── */
function ExportTab() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const handleExport = async (type: string) => {
    setExporting(true);
    try {
      if (type === "timesheets") {
        let q = supabase.from("time_entries").select("*").order("clock_in", { ascending: false });
        if (dateFrom) q = q.gte("clock_in", `${dateFrom}T00:00:00`);
        if (dateTo) q = q.lte("clock_in", `${dateTo}T23:59:59`);
        const { data: entries } = await q;
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name");
        const pMap: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { pMap[p.user_id] = p.full_name; });
        exportToCsv("timesheets", ["Staff", "Date", "Clock In", "Clock Out", "Break (mins)", "Total Hours", "Approved"], (entries ?? []).map((e: any) => {
          const hrs = e.clock_out ? Math.max(0, differenceInMinutes(parseISO(e.clock_out), parseISO(e.clock_in)) - (e.break_minutes || 0)) / 60 : 0;
          return [pMap[e.staff_id] || "Unknown", format(parseISO(e.clock_in), "yyyy-MM-dd"), format(parseISO(e.clock_in), "HH:mm"), e.clock_out ? format(parseISO(e.clock_out), "HH:mm") : "", e.break_minutes || 0, hrs.toFixed(2), e.approved ? "Yes" : "No"];
        }));
      } else if (type === "holidays") {
        const { data: hols } = await supabase.from("holiday_requests").select("*").order("start_date", { ascending: false });
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name");
        const pMap: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { pMap[p.user_id] = p.full_name; });
        exportToCsv("holidays", ["Staff", "Start", "End", "Type", "Status", "Reason"], (hols ?? []).map((h: any) => [pMap[h.staff_id] || "Unknown", h.start_date, h.end_date, h.type, h.status, h.reason || ""]));
      } else if (type === "payroll") {
        let q = supabase.from("time_entries").select("*").order("clock_in");
        if (dateFrom) q = q.gte("clock_in", `${dateFrom}T00:00:00`);
        if (dateTo) q = q.lte("clock_in", `${dateTo}T23:59:59`);
        const { data: entries } = await q;
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name");
        const pMap: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { pMap[p.user_id] = p.full_name; });

        // Aggregate per staff
        const staffHours: Record<string, { name: string; regular: number; overtime: number; totalMins: number }> = {};
        (entries ?? []).forEach((e: any) => {
          if (!e.clock_out) return;
          const mins = Math.max(0, differenceInMinutes(parseISO(e.clock_out), parseISO(e.clock_in)) - (e.break_minutes || 0));
          if (!staffHours[e.staff_id]) staffHours[e.staff_id] = { name: pMap[e.staff_id] || "Unknown", regular: 0, overtime: 0, totalMins: 0 };
          staffHours[e.staff_id].totalMins += mins;
        });

        const STANDARD_WEEKLY = 40 * 60; // mins
        Object.values(staffHours).forEach(s => {
          s.regular = Math.min(s.totalMins, STANDARD_WEEKLY) / 60;
          s.overtime = Math.max(0, s.totalMins - STANDARD_WEEKLY) / 60;
        });

        exportToCsv("payroll_summary", ["Staff", "Regular Hours", "Overtime Hours", "Total Hours"], Object.values(staffHours).map(s => [s.name, s.regular.toFixed(2), s.overtime.toFixed(2), (s.totalMins / 60).toFixed(2)]));
      }
      toast({ title: "Export Complete" });
    } catch (err: any) {
      toast({ title: "Export Error", description: err.message, variant: "destructive" });
    }
    setExporting(false);
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-lg p-5 space-y-4">
        <h3 className="font-mono text-sm font-bold text-foreground">Date Range (optional)</h3>
        <div className="flex gap-3">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground" />
          <span className="text-muted-foreground self-center">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { type: "timesheets", label: "Timesheets", desc: "Full time entry export" },
          { type: "holidays", label: "Holiday Report", desc: "All holiday requests" },
          { type: "payroll", label: "Payroll Summary", desc: "Staff hours aggregated" },
        ].map(exp => (
          <button key={exp.type} onClick={() => handleExport(exp.type)} disabled={exporting} className="glass-panel rounded-lg p-5 text-left hover:bg-muted/20 transition-colors disabled:opacity-50">
            <Download size={20} className="text-primary mb-2" />
            <p className="font-mono text-sm font-bold text-foreground">{exp.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{exp.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
