import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import {
  BarChart3, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  Wrench, Package, DollarSign, PoundSterling, Percent, ArrowUpRight, ArrowDownRight,
  Users, Download, Calendar, Sparkles,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
  ComposedChart,
} from "recharts";
import {
  format, differenceInDays, startOfMonth, endOfMonth, eachMonthOfInterval,
  subMonths, startOfWeek, eachWeekOfInterval, subWeeks, subDays, isWithinInterval,
} from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { exportToCsv } from "@/lib/csvExport";

const COLOURS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--secondary-foreground))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--primary) / 0.6)",
];

const chartTooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

const axisTick = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

type DatePreset = "7d" | "30d" | "90d" | "6m" | "12m";

function getDateRange(preset: DatePreset) {
  const now = new Date();
  const map: Record<DatePreset, Date> = {
    "7d": subDays(now, 7),
    "30d": subDays(now, 30),
    "90d": subDays(now, 90),
    "6m": subMonths(now, 6),
    "12m": subMonths(now, 12),
  };
  return { from: map[preset], to: now };
}

export default function ReportsPage() {
  const { flags } = useFeatureFlags();
  const [jobs, setJobs] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [financials, setFinancials] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");

  const { from: rangeFrom, to: rangeTo } = useMemo(() => getDateRange(datePreset), [datePreset]);

  const inRange = useCallback((dateStr: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= rangeFrom && d <= rangeTo;
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [jobsRes, stagesRes, issuesRes, timeRes, staffRes] = await Promise.all([
        supabase.from("jobs").select("id, job_id, job_name, status, created_date, parts_count, materials_count"),
        supabase.from("job_stages").select("id, job_id, stage_name, status, created_at, updated_at, due_date"),
        supabase.from("job_issues").select("id, job_id, severity, status, category, reported_at, resolved_at"),
        supabase.from("time_entries").select("id, staff_id, date, hours, stage_name, job_id"),
        supabase.from("profiles").select("user_id, full_name, department, role"),
      ]);

      setJobs(jobsRes.data ?? []);
      setStages(stagesRes.data ?? []);
      setIssues(issuesRes.data ?? []);
      setTimeEntries(timeRes.data ?? []);
      setStaff(staffRes.data ?? []);

      if (flags.enable_finance) {
        const [finRes, invRes, billRes] = await Promise.all([
          supabase.from("job_financials").select("*"),
          supabase.from("invoices").select("id, amount_ex_vat, vat_amount, amount_paid, issue_date, status, job_id"),
          supabase.from("bills").select("id, amount_ex_vat, vat_amount, amount_paid, issue_date, status, job_id, category"),
        ]);
        setFinancials(finRes.data ?? []);
        setInvoices(invRes.data ?? []);
        setBills(billRes.data ?? []);
      }

      setLoading(false);
    };
    load();
  }, [flags.enable_finance]);

  // ── Filtered data ──
  const filteredJobs = useMemo(() => jobs.filter(j => inRange(j.created_date)), [jobs, inRange]);
  const filteredStages = useMemo(() => stages.filter(s => inRange(s.updated_at)), [stages, inRange]);
  const filteredIssues = useMemo(() => issues.filter(i => inRange(i.reported_at)), [issues, inRange]);
  const filteredTimeEntries = useMemo(() => timeEntries.filter(t => inRange(t.date)), [timeEntries, inRange]);

  // ── Computed metrics ──
  const completedStages = useMemo(() => filteredStages.filter(s => s.status === "Done"), [filteredStages]);
  const openIssues = useMemo(() => filteredIssues.filter(i => i.status === "open"), [filteredIssues]);
  const resolvedIssues = useMemo(() => filteredIssues.filter(i => i.status === "resolved"), [filteredIssues]);

  const avgCycleTime = useMemo(() => {
    if (completedStages.length === 0) return 0;
    return Math.round(completedStages.reduce((sum, s) =>
      sum + differenceInDays(new Date(s.updated_at), new Date(s.created_at)), 0) / completedStages.length);
  }, [completedStages]);

  const avgResolutionDays = useMemo(() => {
    const resolved = resolvedIssues.filter(i => i.resolved_at);
    if (resolved.length === 0) return 0;
    return Math.round(resolved.reduce((sum, i) =>
      sum + differenceInDays(new Date(i.resolved_at), new Date(i.reported_at)), 0) / resolved.length * 10) / 10;
  }, [resolvedIssues]);

  const completedJobs = useMemo(() => filteredJobs.filter(j => j.status === "complete" || j.status === "installed"), [filteredJobs]);
  const totalParts = useMemo(() => filteredJobs.reduce((s, j) => s + j.parts_count, 0), [filteredJobs]);

  // ── Previous period comparison ──
  const prevRange = useMemo(() => {
    const duration = rangeTo.getTime() - rangeFrom.getTime();
    return { from: new Date(rangeFrom.getTime() - duration), to: new Date(rangeFrom.getTime()) };
  }, [rangeFrom, rangeTo]);

  const inPrevRange = useCallback((dateStr: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= prevRange.from && d <= prevRange.to;
  }, [prevRange]);

  const prevCompletedJobs = useMemo(() => jobs.filter(j => inPrevRange(j.created_date) && (j.status === "complete" || j.status === "installed")).length, [jobs, inPrevRange]);
  const prevParts = useMemo(() => jobs.filter(j => inPrevRange(j.created_date)).reduce((s, j) => s + j.parts_count, 0), [jobs, inPrevRange]);
  const prevIssues = useMemo(() => issues.filter(i => inPrevRange(i.reported_at) && i.status === "open").length, [issues, inPrevRange]);

  // ── Stage cycle times ──
  const stageCycleTimes = useMemo(() => {
    const grouped = completedStages.reduce((acc, s) => {
      if (!acc[s.stage_name]) acc[s.stage_name] = [];
      acc[s.stage_name].push(differenceInDays(new Date(s.updated_at), new Date(s.created_at)));
      return acc;
    }, {} as Record<string, number[]>);
    return Object.entries(grouped).map(([stage, times]) => ({
      stage,
      avgDays: Math.round((times as number[]).reduce((a: number, b: number) => a + b, 0) / (times as number[]).length * 10) / 10,
      count: (times as number[]).length,
    })).sort((a, b) => b.avgDays - a.avgDays);
  }, [completedStages]);

  // ── Jobs by status ──
  const jobsByStatus = useMemo(() =>
    ["draft", "in_progress", "review", "complete", "installed"].map(status => ({
      status: status.replace("_", " "),
      count: filteredJobs.filter(j => j.status === status).length,
    })).filter(d => d.count > 0)
  , [filteredJobs]);

  // ── Throughput: stages completed per week (last 12 weeks) ──
  const throughputData = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: subWeeks(new Date(), 11), end: new Date() });
    return weeks.map(w => {
      const weekStart = w;
      const weekEnd = new Date(w.getTime() + 7 * 86400000);
      const completed = completedStages.filter(s => {
        const d = new Date(s.updated_at);
        return d >= weekStart && d < weekEnd;
      }).length;
      return { week: format(w, "dd MMM"), stages: completed };
    });
  }, [completedStages]);

  // ── Issues ──
  const issuesBySeverity = useMemo(() =>
    ["critical", "high", "medium", "low"].map(sev => ({
      severity: sev,
      open: openIssues.filter(i => i.severity === sev).length,
      resolved: resolvedIssues.filter(i => i.severity === sev).length,
    })).filter(d => d.open + d.resolved > 0)
  , [openIssues, resolvedIssues]);

  const issuesByCategory = useMemo(() =>
    Object.entries(
      filteredIssues.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {} as Record<string, number>)
    ).map(([category, count]) => ({ category, count: count as number })).sort((a, b) => b.count - a.count)
  , [filteredIssues]);

  // ── Financial: job profitability ──
  const profitabilityData = useMemo(() => {
    if (!flags.enable_finance || financials.length === 0) return [];
    return financials.map(f => {
      const job = jobs.find(j => j.id === f.job_id);
      const jobInvoices = invoices.filter(i => i.job_id === f.job_id);
      const jobBills = bills.filter(b => b.job_id === f.job_id);
      const revenue = jobInvoices.reduce((s, i) => s + Number(i.amount_ex_vat), 0) || Number(f.quote_value_ex_vat);
      const costs = (Number(f.material_cost_override) || 0) + (Number(f.labour_cost_override) || 0) +
        (Number(f.overhead_allocation_override) || 0) + jobBills.reduce((s, b) => s + Number(b.amount_ex_vat), 0);
      const margin = revenue > 0 ? Math.round(((revenue - costs) / revenue) * 100) : 0;
      return {
        jobCode: job?.job_id || "Unknown",
        jobName: job?.job_name || "",
        revenue: Math.round(revenue),
        costs: Math.round(costs),
        profit: Math.round(revenue - costs),
        margin,
      };
    }).filter(d => d.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 15);
  }, [financials, jobs, invoices, bills, flags.enable_finance]);

  // ── Revenue trend ──
  const revenueTrend = useMemo(() => {
    if (!flags.enable_finance) return [];
    const months = eachMonthOfInterval({ start: subMonths(new Date(), 5), end: new Date() });
    return months.map(m => {
      const start = startOfMonth(m);
      const end = endOfMonth(m);
      const invTotal = invoices.filter(i => { const d = new Date(i.issue_date); return d >= start && d <= end; })
        .reduce((s, i) => s + Number(i.amount_ex_vat), 0);
      const billTotal = bills.filter(b => { const d = new Date(b.issue_date); return d >= start && d <= end; })
        .reduce((s, b) => s + Number(b.amount_ex_vat), 0);
      return { month: format(m, "MMM yy"), revenue: Math.round(invTotal), costs: Math.round(billTotal), profit: Math.round(invTotal - billTotal) };
    });
  }, [invoices, bills, flags.enable_finance]);

  // ── Finance KPIs ──
  const financeKPIs = useMemo(() => {
    if (!flags.enable_finance) return null;
    const totalRevenue = invoices.reduce((s, i) => s + Number(i.amount_ex_vat), 0);
    const totalCosts = bills.reduce((s, b) => s + Number(b.amount_ex_vat), 0);
    const outstanding = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled")
      .reduce((s, i) => s + Number(i.amount_ex_vat) + Number(i.vat_amount) - Number(i.amount_paid || 0), 0);
    const avgMargin = profitabilityData.length > 0
      ? Math.round(profitabilityData.reduce((s, d) => s + d.margin, 0) / profitabilityData.length)
      : 0;
    return { totalRevenue: Math.round(totalRevenue), totalCosts: Math.round(totalCosts), outstanding: Math.round(outstanding), avgMargin };
  }, [invoices, bills, profitabilityData, flags.enable_finance]);

  const overdueStages = useMemo(() => stages.filter(s => s.due_date && new Date(s.due_date) < new Date() && s.status !== "Done"), [stages]);

  // ── Staff / Productivity ──
  const totalHoursLogged = useMemo(() => filteredTimeEntries.reduce((s, t) => s + Number(t.hours || 0), 0), [filteredTimeEntries]);

  const hoursByStaff = useMemo(() => {
    const map = new Map<string, number>();
    filteredTimeEntries.forEach(t => {
      map.set(t.staff_id, (map.get(t.staff_id) || 0) + Number(t.hours || 0));
    });
    return Array.from(map.entries()).map(([staffId, hours]) => {
      const s = staff.find(p => p.user_id === staffId);
      return { name: s?.full_name || "Unknown", hours: Math.round(hours * 10) / 10, department: s?.department || "—" };
    }).sort((a, b) => b.hours - a.hours);
  }, [filteredTimeEntries, staff]);

  const hoursByDepartment = useMemo(() => {
    const map = new Map<string, number>();
    filteredTimeEntries.forEach(t => {
      const s = staff.find(p => p.user_id === t.staff_id);
      const dept = s?.department || "Other";
      map.set(dept, (map.get(dept) || 0) + Number(t.hours || 0));
    });
    return Array.from(map.entries()).map(([dept, hours]) => ({
      department: dept, hours: Math.round(hours * 10) / 10,
    })).sort((a, b) => b.hours - a.hours);
  }, [filteredTimeEntries, staff]);

  const hoursByStage = useMemo(() => {
    const map = new Map<string, number>();
    filteredTimeEntries.forEach(t => {
      const stage = t.stage_name || "Unassigned";
      map.set(stage, (map.get(stage) || 0) + Number(t.hours || 0));
    });
    return Array.from(map.entries()).map(([stage, hours]) => ({
      stage, hours: Math.round(hours * 10) / 10,
    })).sort((a, b) => b.hours - a.hours);
  }, [filteredTimeEntries]);

  // ── Export functions ──
  const exportOperations = useCallback(() => {
    exportToCsv("operations_report", [
      "Metric", "Value",
    ], [
      ["Total Jobs", filteredJobs.length],
      ["Total Parts", totalParts],
      ["Completed Jobs", completedJobs.length],
      ["Avg Cycle Time (days)", avgCycleTime],
      ["Overdue Stages", overdueStages.length],
      ...stageCycleTimes.map(s => [`Stage: ${s.stage} Avg Days`, s.avgDays]),
    ]);
  }, [filteredJobs, totalParts, completedJobs, avgCycleTime, overdueStages, stageCycleTimes]);

  const exportQuality = useCallback(() => {
    exportToCsv("quality_report", [
      "Metric", "Value",
    ], [
      ["Open Issues", openIssues.length],
      ["Resolved Issues", resolvedIssues.length],
      ["Avg Resolution Days", avgResolutionDays],
      ...issuesByCategory.map(c => [`Category: ${c.category}`, c.count]),
    ]);
  }, [openIssues, resolvedIssues, avgResolutionDays, issuesByCategory]);

  const exportStaff = useCallback(() => {
    exportToCsv("staff_productivity", [
      "Staff", "Department", "Hours",
    ], hoursByStaff.map(s => [s.name, s.department, s.hours]));
  }, [hoursByStaff]);

  const exportFinance = useCallback(() => {
    if (!profitabilityData.length) return;
    exportToCsv("finance_report", [
      "Job", "Name", "Revenue", "Costs", "Profit", "Margin %",
    ], profitabilityData.map(d => [d.jobCode, d.jobName, d.revenue, d.costs, d.profit, d.margin]));
  }, [profitabilityData]);

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="rounded-lg border border-border bg-card p-4 h-20 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground flex items-center gap-2">
            <BarChart3 size={20} className="text-primary" /> Reports & Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(rangeFrom, "dd MMM yyyy")} – {format(rangeTo, "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {(["7d", "30d", "90d", "6m", "12m"] as DatePreset[]).map(p => (
              <button
                key={p}
                onClick={() => setDatePreset(p)}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-mono font-medium rounded-md transition-colors",
                  datePreset === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="operations" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="operations" className="text-xs font-mono">Operations</TabsTrigger>
          <TabsTrigger value="staff" className="text-xs font-mono">Staff</TabsTrigger>
          {flags.enable_finance && <TabsTrigger value="finance" className="text-xs font-mono">Finance</TabsTrigger>}
          <TabsTrigger value="quality" className="text-xs font-mono">Quality</TabsTrigger>
        </TabsList>

        {/* ═══ Operations Tab ═══ */}
        <TabsContent value="operations" className="space-y-6">
          <div className="flex justify-end">
            <ExportBtn onClick={exportOperations} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI icon={Wrench} label="TOTAL JOBS" value={filteredJobs.length} delta={filteredJobs.length - jobs.filter(j => inPrevRange(j.created_date)).length} />
            <KPI icon={Package} label="TOTAL PARTS" value={totalParts} delta={totalParts - prevParts} />
            <KPI icon={CheckCircle2} label="COMPLETED" value={completedJobs.length} variant="primary" delta={completedJobs.length - prevCompletedJobs} />
            <KPI icon={Clock} label="AVG CYCLE" value={`${avgCycleTime}d`} />
            <KPI icon={AlertTriangle} label="OVERDUE STAGES" value={overdueStages.length} variant={overdueStages.length > 0 ? "danger" : "default"} />
            <KPI icon={TrendingUp} label="THROUGHPUT/WK" value={throughputData.length > 0 ? throughputData[throughputData.length - 1].stages : 0} variant="primary" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Jobs by Status">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={jobsByStatus} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="status" tick={axisTick} />
                  <YAxis allowDecimals={false} tick={axisTick} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Stage Throughput (12 Weeks)">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={throughputData} margin={{ top: 0, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={axisTick} />
                  <YAxis allowDecimals={false} tick={axisTick} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area type="monotone" dataKey="stages" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Avg Stage Cycle Time (days)">
            {stageCycleTimes.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stageCycleTimes} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={axisTick} />
                  <YAxis type="category" dataKey="stage" tick={axisTick} width={80} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: any) => [`${v} days`, "Avg"]} />
                  <Bar dataKey="avgDays" fill="hsl(var(--accent-foreground))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="No completed stages yet" />
            )}
          </ChartCard>

          {overdueStages.length > 0 && (
            <div className="glass-panel rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <AlertTriangle size={14} className="text-destructive" />
                <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider">Overdue Stages ({overdueStages.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">STAGE</th>
                      <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">STATUS</th>
                      <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">DUE</th>
                      <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">OVERDUE BY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueStages.slice(0, 20).map(s => (
                      <tr key={s.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-foreground">{s.stage_name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{s.status}</td>
                        <td className="px-4 py-2 text-muted-foreground">{format(new Date(s.due_date!), "dd MMM yyyy")}</td>
                        <td className="px-4 py-2 text-right text-destructive font-mono">{differenceInDays(new Date(), new Date(s.due_date!))}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ Staff / Productivity Tab ═══ */}
        <TabsContent value="staff" className="space-y-6">
          <div className="flex justify-end">
            <ExportBtn onClick={exportStaff} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI icon={Clock} label="HOURS LOGGED" value={Math.round(totalHoursLogged * 10) / 10} variant="primary" />
            <KPI icon={Users} label="ACTIVE STAFF" value={new Set(filteredTimeEntries.map(t => t.staff_id)).size} />
            <KPI icon={BarChart3} label="AVG HRS/PERSON" value={hoursByStaff.length > 0 ? Math.round(totalHoursLogged / hoursByStaff.length * 10) / 10 : 0} />
            <KPI icon={Wrench} label="STAGES COVERED" value={hoursByStage.length} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Hours by Department">
              {hoursByDepartment.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hoursByDepartment} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="department" tick={axisTick} />
                    <YAxis allowDecimals={false} tick={axisTick} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: any) => [`${v}h`, "Hours"]} />
                    <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="No time entries recorded" />
              )}
            </ChartCard>

            <ChartCard title="Hours by Stage">
              {hoursByStage.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={hoursByStage} dataKey="hours" nameKey="stage" cx="50%" cy="50%" outerRadius={70}
                      label={({ stage, hours }) => `${stage} (${hours}h)`} labelLine={false} fontSize={10}>
                      {hoursByStage.map((_, i) => <Cell key={i} fill={COLOURS[i % COLOURS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="No time entries recorded" />
              )}
            </ChartCard>
          </div>

          {/* Top staff table */}
          {hoursByStaff.length > 0 && (
            <div className="glass-panel rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider">Staff Hours Leaderboard</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">#</th>
                      <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">NAME</th>
                      <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">DEPARTMENT</th>
                      <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">HOURS</th>
                      <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">% OF TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoursByStaff.slice(0, 20).map((s, idx) => (
                      <tr key={s.name} className="border-b border-border last:border-0 hover:bg-secondary/20">
                        <td className="px-4 py-2 font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-2 font-medium text-foreground">{s.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{s.department}</td>
                        <td className="px-4 py-2 text-right font-mono text-primary">{s.hours}h</td>
                        <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                          {totalHoursLogged > 0 ? Math.round((s.hours / totalHoursLogged) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ Finance Tab ═══ */}
        {flags.enable_finance && (
          <TabsContent value="finance" className="space-y-6">
            <div className="flex justify-end">
              <ExportBtn onClick={exportFinance} />
            </div>
            {financeKPIs && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPI icon={PoundSterling} label="TOTAL REVENUE" value={`£${financeKPIs.totalRevenue.toLocaleString()}`} variant="primary" />
                <KPI icon={ArrowDownRight} label="TOTAL COSTS" value={`£${financeKPIs.totalCosts.toLocaleString()}`} />
                <KPI icon={ArrowUpRight} label="OUTSTANDING" value={`£${financeKPIs.outstanding.toLocaleString()}`} variant={financeKPIs.outstanding > 0 ? "warning" : "default"} />
                <KPI icon={Percent} label="AVG MARGIN" value={`${financeKPIs.avgMargin}%`} variant={financeKPIs.avgMargin >= 20 ? "primary" : "danger"} />
              </div>
            )}

            <ChartCard title="Revenue vs Costs (6 Months)">
              {revenueTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={revenueTrend} margin={{ top: 0, right: 10, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={axisTick} />
                    <YAxis tick={axisTick} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: any) => [`£${Number(v).toLocaleString()}`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue" />
                    <Bar dataKey="costs" fill="hsl(var(--destructive) / 0.6)" radius={[4, 4, 0, 0]} name="Costs" />
                    <Line type="monotone" dataKey="profit" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 3 }} name="Profit" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="No invoice/bill data" />
              )}
            </ChartCard>

            {profitabilityData.length > 0 && (
              <div className="glass-panel rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider">Job Profitability</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">JOB</th>
                        <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">NAME</th>
                        <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">REVENUE</th>
                        <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">COSTS</th>
                        <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">PROFIT</th>
                        <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">MARGIN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitabilityData.map(d => (
                        <tr key={d.jobCode} className="border-b border-border last:border-0 hover:bg-secondary/20">
                          <td className="px-4 py-2 font-mono text-primary">{d.jobCode}</td>
                          <td className="px-4 py-2 text-foreground max-w-[200px] truncate">{d.jobName}</td>
                          <td className="px-4 py-2 text-right font-mono text-foreground">£{d.revenue.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-mono text-muted-foreground">£{d.costs.toLocaleString()}</td>
                          <td className={cn("px-4 py-2 text-right font-mono font-medium", d.profit >= 0 ? "text-primary" : "text-destructive")}>
                            £{d.profit.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold",
                              d.margin >= 30 ? "bg-primary/15 text-primary" :
                              d.margin >= 15 ? "bg-warning/15 text-warning" :
                              "bg-destructive/15 text-destructive"
                            )}>
                              {d.margin}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        )}

        {/* ═══ Quality Tab ═══ */}
        <TabsContent value="quality" className="space-y-6">
          <div className="flex justify-end">
            <ExportBtn onClick={exportQuality} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI icon={AlertTriangle} label="OPEN ISSUES" value={openIssues.length} variant={openIssues.length > 0 ? "danger" : "default"} delta={openIssues.length - prevIssues} />
            <KPI icon={CheckCircle2} label="RESOLVED" value={resolvedIssues.length} variant="primary" />
            <KPI icon={Clock} label="AVG RESOLUTION" value={`${avgResolutionDays}d`} />
            <KPI icon={Percent} label="RESOLVE RATE" value={`${filteredIssues.length > 0 ? Math.round((resolvedIssues.length / filteredIssues.length) * 100) : 100}%`} variant="primary" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Issues by Severity">
              {issuesBySeverity.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={issuesBySeverity} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="severity" tick={axisTick} />
                    <YAxis allowDecimals={false} tick={axisTick} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="open" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="resolved" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="No issues recorded" />
              )}
            </ChartCard>

            <ChartCard title="Issues by Category">
              {issuesByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={issuesByCategory} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={70}
                      label={({ category, count }) => `${category} (${count})`} labelLine={false} fontSize={10}>
                      {issuesByCategory.map((_, i) => <Cell key={i} fill={COLOURS[i % COLOURS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="No issues recorded" />
              )}
            </ChartCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Sub-components ──

function KPI({ icon: Icon, label, value, variant = "default", delta }: {
  icon: any; label: string; value: string | number;
  variant?: "default" | "primary" | "danger" | "warning";
  delta?: number;
}) {
  const colors = {
    default: "text-foreground",
    primary: "text-primary",
    danger: "text-destructive",
    warning: "text-warning",
  };
  const iconColors = {
    default: "text-muted-foreground",
    primary: "text-primary",
    danger: "text-destructive",
    warning: "text-warning",
  };
  return (
    <div className="glass-panel rounded-lg p-4 text-center">
      <Icon size={16} className={cn(iconColors[variant], "mx-auto mb-1")} />
      <p className={cn("text-2xl font-mono font-bold", colors[variant])}>{value}</p>
      <p className="text-[10px] font-mono text-muted-foreground tracking-wide">{label}</p>
      {delta !== undefined && delta !== 0 && (
        <div className={cn("flex items-center justify-center gap-0.5 mt-1 text-[10px] font-mono", delta > 0 ? "text-primary" : "text-destructive")}>
          {delta > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          <span>{delta > 0 ? "+" : ""}{delta} vs prev</span>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-lg p-4">
      <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground text-center py-12">{text}</p>;
}

function ExportBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
    >
      <Download size={14} /> Export CSV
    </button>
  );
}
