import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle2, Clock, Wrench, Package, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { format, subDays, differenceInDays, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";

const COLOURS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(var(--secondary))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
];

interface JobRow {
  id: string;
  job_id: string;
  status: string;
  created_date: string;
  parts_count: number;
  materials_count: number;
}

interface StageRow {
  id: string;
  job_id: string;
  stage_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  due_date: string | null;
}

interface IssueRow {
  id: string;
  job_id: string;
  severity: string;
  status: string;
  category: string;
  reported_at: string;
  resolved_at: string | null;
}

export default function ReportsPage() {
  const { flags } = useFeatureFlags();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [invoiceTotals, setInvoiceTotals] = useState<{ month: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const sixMonthsAgo = subMonths(new Date(), 6).toISOString();

      const jobsP = supabase.from("jobs").select("id, job_id, status, created_date, parts_count, materials_count");
      const stagesP = supabase.from("job_stages").select("id, job_id, stage_name, status, created_at, updated_at, due_date");
      const issuesP = supabase.from("job_issues").select("id, job_id, severity, status, category, reported_at, resolved_at");

      const [jobsRes, stagesRes, issuesRes] = await Promise.all([jobsP, stagesP, issuesP]);

      let invoiceData: any[] = [];
      if (flags.enable_finance) {
        const invRes = await supabase.from("invoices").select("id, amount_ex_vat, issue_date, status").gte("issue_date", sixMonthsAgo.slice(0, 10));
        invoiceData = (invRes.data as any[]) ?? [];
      }
      setJobs((jobsRes.data as any[]) ?? []);
      setStages((stagesRes.data as any[]) ?? []);
      setIssues((issuesRes.data as any[]) ?? []);

      // Aggregate invoice totals by month
      if (flags.enable_finance && invoiceData.length > 0) {
        const invoices = invoiceData;
        const months = eachMonthOfInterval({ start: subMonths(new Date(), 5), end: new Date() });
        const monthlyTotals = months.map(m => {
          const start = startOfMonth(m);
          const end = endOfMonth(m);
          const total = invoices
            .filter((inv: any) => {
              const d = new Date(inv.issue_date);
              return d >= start && d <= end;
            })
            .reduce((sum: number, inv: any) => sum + Number(inv.amount_ex_vat), 0);
          return { month: format(m, "MMM yy"), total: Math.round(total) };
        });
        setInvoiceTotals(monthlyTotals);
      }

      setLoading(false);
    };
    load();
  }, [flags.enable_finance]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center animate-pulse">
          <span className="font-mono text-sm font-bold text-primary-foreground">E</span>
        </div>
      </div>
    );
  }

  // ── Computed stats ──
  const jobsByStatus = ["draft", "in_progress", "review", "complete", "installed"].map(status => ({
    status: status.replace("_", " "),
    count: jobs.filter(j => j.status === status).length,
  })).filter(d => d.count > 0);

  const overdueStages = stages.filter(s => s.due_date && new Date(s.due_date) < new Date() && s.status !== "Done");

  const completedStages = stages.filter(s => s.status === "Done");
  const avgCycleTime = completedStages.length > 0
    ? Math.round(completedStages.reduce((sum, s) => sum + differenceInDays(new Date(s.updated_at), new Date(s.created_at)), 0) / completedStages.length)
    : 0;

  const stageCycleTimes = Object.entries(
    completedStages.reduce((acc, s) => {
      if (!acc[s.stage_name]) acc[s.stage_name] = [];
      acc[s.stage_name].push(differenceInDays(new Date(s.updated_at), new Date(s.created_at)));
      return acc;
    }, {} as Record<string, number[]>)
  ).map(([name, times]) => ({
    stage: name,
    avgDays: Math.round(times.reduce((a, b) => a + b, 0) / times.length * 10) / 10,
  })).sort((a, b) => b.avgDays - a.avgDays);

  const openIssues = issues.filter(i => i.status === "open");
  const resolvedIssues = issues.filter(i => i.status === "resolved");
  const avgResolutionDays = resolvedIssues.length > 0
    ? Math.round(resolvedIssues.filter(i => i.resolved_at).reduce((sum, i) => sum + differenceInDays(new Date(i.resolved_at!), new Date(i.reported_at)), 0) / resolvedIssues.length * 10) / 10
    : 0;

  const issuesBySeverity = ["critical", "high", "medium", "low"].map(sev => ({
    severity: sev,
    open: openIssues.filter(i => i.severity === sev).length,
    resolved: resolvedIssues.filter(i => i.severity === sev).length,
  })).filter(d => d.open + d.resolved > 0);

  const issuesByCategory = Object.entries(
    issues.reduce((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);

  const totalParts = jobs.reduce((s, j) => s + j.parts_count, 0);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-xl font-mono font-bold text-foreground flex items-center gap-2">
          <BarChart3 size={20} className="text-primary" /> Reports & Analytics
        </h1>
        <p className="text-sm text-muted-foreground">Operational insights across jobs, stages, and issues</p>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPI icon={Wrench} label="TOTAL JOBS" value={jobs.length} />
        <KPI icon={Package} label="TOTAL PARTS" value={totalParts} />
        <KPI icon={CheckCircle2} label="COMPLETED" value={jobs.filter(j => j.status === "complete" || j.status === "installed").length} accent />
        <KPI icon={Clock} label="AVG CYCLE" value={`${avgCycleTime}d`} />
        <KPI icon={AlertTriangle} label="OPEN ISSUES" value={openIssues.length} danger={openIssues.length > 0} />
        <KPI icon={TrendingUp} label="AVG RESOLUTION" value={`${avgResolutionDays}d`} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Jobs by Status */}
        <div className="glass-panel border-border rounded-lg p-4">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Jobs by Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={jobsByStatus} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="status" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stage Cycle Times */}
        <div className="glass-panel border-border rounded-lg p-4">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Avg Stage Cycle Time (days)</h3>
          {stageCycleTimes.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stageCycleTimes} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={80} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="avgDays" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No completed stages yet</p>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Issues by Severity */}
        <div className="glass-panel border-border rounded-lg p-4">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Issues by Severity</h3>
          {issuesBySeverity.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={issuesBySeverity} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="severity" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="open" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No issues recorded</p>
          )}
        </div>

        {/* Issues by Category */}
        <div className="glass-panel border-border rounded-lg p-4">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Issues by Category</h3>
          {issuesByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={issuesByCategory} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={70} label={({ category, count }) => `${category} (${count})`} labelLine={false} fontSize={10}>
                  {issuesByCategory.map((_, i) => <Cell key={i} fill={COLOURS[i % COLOURS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No issues recorded</p>
          )}
        </div>

        {/* Revenue trend (finance gated) */}
        <div className="glass-panel border-border rounded-lg p-4">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Revenue (6 months)</h3>
          {flags.enable_finance && invoiceTotals.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={invoiceTotals} margin={{ top: 0, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`£${Number(v).toLocaleString()}`, "Revenue"]} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              {flags.enable_finance ? "No invoice data" : "Enable Finance module"}
            </p>
          )}
        </div>
      </div>

      {/* Overdue stages table */}
      {overdueStages.length > 0 && (
        <div className="glass-panel border-border rounded-lg overflow-hidden">
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
    </div>
  );
}

function KPI({ icon: Icon, label, value, accent, danger }: { icon: any; label: string; value: string | number; accent?: boolean; danger?: boolean }) {
  return (
    <div className="glass-panel border-border rounded-lg p-4 text-center">
      <Icon size={16} className={danger ? "text-destructive mx-auto mb-1" : accent ? "text-primary mx-auto mb-1" : "text-muted-foreground mx-auto mb-1"} />
      <p className={`text-2xl font-mono font-bold ${danger ? "text-destructive" : accent ? "text-primary" : "text-foreground"}`}>{value}</p>
      <p className="text-[10px] font-mono text-muted-foreground tracking-wide">{label}</p>
    </div>
  );
}
