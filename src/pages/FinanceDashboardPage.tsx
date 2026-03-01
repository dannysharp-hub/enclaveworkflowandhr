import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, subMonths, addDays } from "date-fns";
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Receipt, Wallet, BadgePoundSterling, BarChart3, Download,
} from "lucide-react";
import { exportToCsv } from "@/lib/csvExport";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type DateRange = "this_month" | "last_month" | "custom";

interface KPI {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  color: string;
}

export default function FinanceDashboardPage() {
  const [range, setRange] = useState<DateRange>("this_month");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [wages, setWages] = useState<any[]>([]);
  const [jobFinancials, setJobFinancials] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (range === "last_month") {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    return { from: startOfMonth(now), to: endOfMonth(now) };
  }, [range]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [invRes, billRes, wageRes, jfRes, jobRes] = await Promise.all([
        supabase.from("invoices").select("*"),
        supabase.from("bills").select("*"),
        supabase.from("wage_plans").select("*"),
        supabase.from("job_financials").select("*"),
        supabase.from("jobs").select("id, job_id, job_name"),
      ]);
      setInvoices(invRes.data ?? []);
      setBills(billRes.data ?? []);
      setWages(wageRes.data ?? []);
      setJobFinancials(jfRes.data ?? []);
      setJobs(jobRes.data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= from && d <= to;
  };

  // Cashflow
  const cashReceived = invoices.filter(i => inRange(i.payment_received_date)).reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const now = new Date();
  const next30 = addDays(now, 30);
  const cashExpected = invoices.filter(i => {
    if (i.status === "paid" || i.status === "cancelled") return false;
    const due = new Date(i.due_date);
    return due >= now && due <= next30;
  }).reduce((s, i) => s + (Number(i.amount_ex_vat) + Number(i.vat_amount) - Number(i.amount_paid || 0)), 0);
  const billsDue = bills.filter(b => {
    if (b.status === "paid" || b.status === "cancelled") return false;
    const due = new Date(b.due_date);
    return due >= now && due <= next30;
  }).reduce((s, b) => s + (Number(b.amount_ex_vat) + Number(b.vat_amount) - Number(b.amount_paid || 0)), 0);
  const wagesExpected = wages.filter(w => {
    const end = new Date(w.period_end);
    return end >= now && end <= next30;
  }).reduce((s, w) => s + Number(w.total_wages_expected || 0), 0);
  const netProjected = cashExpected - billsDue - wagesExpected;

  // Sales
  const salesInvoiced = invoices.filter(i => inRange(i.issue_date)).reduce((s, i) => s + Number(i.amount_ex_vat), 0);
  const salesPaid = invoices.filter(i => inRange(i.payment_received_date)).reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const outstanding = invoices.filter(i => !["paid", "cancelled"].includes(i.status)).reduce((s, i) => s + (Number(i.amount_ex_vat) + Number(i.vat_amount) - Number(i.amount_paid || 0)), 0);
  const overdue = invoices.filter(i => i.status === "overdue" || (!["paid", "cancelled"].includes(i.status) && new Date(i.due_date) < now));
  const overdueValue = overdue.reduce((s, i) => s + (Number(i.amount_ex_vat) + Number(i.vat_amount) - Number(i.amount_paid || 0)), 0);

  // Bills summary
  const billsIssued = bills.filter(b => inRange(b.issue_date)).reduce((s, b) => s + Number(b.amount_ex_vat), 0);
  const billsPaid = bills.filter(b => inRange(b.payment_date)).reduce((s, b) => s + Number(b.amount_paid || 0), 0);
  const billsOutstanding = bills.filter(b => !["paid", "cancelled"].includes(b.status)).reduce((s, b) => s + (Number(b.amount_ex_vat) + Number(b.vat_amount) - Number(b.amount_paid || 0)), 0);
  const overdueBills = bills.filter(b => !["paid", "cancelled"].includes(b.status) && new Date(b.due_date) < now);

  // Job profitability
  const jobMap = new Map(jobs.map(j => [j.id, j]));
  const jobProfitData = jobFinancials.map(jf => {
    const job = jobMap.get(jf.job_id);
    const revenue = Number(jf.quote_value_ex_vat || 0);
    const linkedBills = bills.filter(b => b.job_id === jf.job_id).reduce((s, b) => s + Number(b.amount_ex_vat), 0);
    const materialCost = Number(jf.material_cost_override || 0);
    const labourCost = Number(jf.labour_cost_override || 0);
    const totalCost = materialCost + labourCost + linkedBills;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return {
      job_id: job?.job_id || "?",
      job_name: job?.job_name || "Unknown",
      revenue,
      totalCost,
      profit,
      margin,
    };
  }).filter(j => j.revenue > 0).sort((a, b) => b.revenue - a.revenue);

  const avgMargin = jobProfitData.length > 0 ? jobProfitData.reduce((s, j) => s + j.margin, 0) / jobProfitData.length : 0;
  const totalRevenue = invoices.reduce((s, i) => s + Number(i.amount_ex_vat), 0);
  const totalLabour = jobFinancials.reduce((s, jf) => s + Number(jf.labour_cost_override || 0), 0);
  const labourPct = totalRevenue > 0 ? (totalLabour / totalRevenue) * 100 : 0;

  const fmt = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const kpis: KPI[] = [
    { label: "Cash Received", value: fmt(cashReceived), icon: <DollarSign size={18} />, trend: "up", color: "text-success" },
    { label: "Expected Next 30d", value: fmt(cashExpected), icon: <ArrowUpRight size={18} />, color: "text-info" },
    { label: "Bills Due 30d", value: fmt(billsDue), icon: <ArrowDownRight size={18} />, trend: "down", color: "text-warning" },
    { label: "Net Projected", value: fmt(netProjected), icon: netProjected >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />, color: netProjected >= 0 ? "text-success" : "text-destructive" },
  ];

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">Finance Dashboard</h2>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="glass-panel rounded-lg p-6 h-28 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Finance Dashboard</h2>
          <p className="text-sm text-muted-foreground">{format(from, "d MMM yyyy")} — {format(to, "d MMM yyyy")}</p>
        </div>
        <div className="flex items-center gap-3">
        <button
          onClick={() => {
            exportToCsv("job_profitability", ["Job ID","Job Name","Revenue","Total Cost","Profit","Margin %"], jobProfitData.map(j => [j.job_id, j.job_name, j.revenue, j.totalCost, j.profit, j.margin.toFixed(1)]));
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <Download size={14} /> Export Profitability
        </button>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["this_month", "last_month"] as DateRange[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                range === r ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r === "this_month" ? "This Month" : "Last Month"}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="glass-panel rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
              <span className={kpi.color}>{kpi.icon}</span>
            </div>
            <p className={cn("text-xl font-mono font-bold", kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales */}
        <div className="glass-panel rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-primary" />
            <h3 className="font-mono text-sm font-bold text-foreground">Sales</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] font-mono text-muted-foreground uppercase">Invoiced</p><p className="text-lg font-mono font-bold text-foreground">{fmt(salesInvoiced)}</p></div>
            <div><p className="text-[10px] font-mono text-muted-foreground uppercase">Paid</p><p className="text-lg font-mono font-bold text-success">{fmt(salesPaid)}</p></div>
            <div><p className="text-[10px] font-mono text-muted-foreground uppercase">Outstanding</p><p className="text-lg font-mono font-bold text-warning">{fmt(outstanding)}</p></div>
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase">Overdue</p>
              <p className="text-lg font-mono font-bold text-destructive">{fmt(overdueValue)}</p>
              {overdue.length > 0 && <p className="text-[10px] text-destructive">{overdue.length} invoice{overdue.length !== 1 ? "s" : ""}</p>}
            </div>
          </div>
        </div>

        {/* Bills */}
        <div className="glass-panel rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-accent" />
            <h3 className="font-mono text-sm font-bold text-foreground">Bills / Payables</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] font-mono text-muted-foreground uppercase">Issued</p><p className="text-lg font-mono font-bold text-foreground">{fmt(billsIssued)}</p></div>
            <div><p className="text-[10px] font-mono text-muted-foreground uppercase">Paid</p><p className="text-lg font-mono font-bold text-success">{fmt(billsPaid)}</p></div>
            <div><p className="text-[10px] font-mono text-muted-foreground uppercase">Outstanding</p><p className="text-lg font-mono font-bold text-warning">{fmt(billsOutstanding)}</p></div>
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase">Overdue</p>
              <p className="text-lg font-mono font-bold text-destructive">{fmt(overdueBills.reduce((s, b) => s + (Number(b.amount_ex_vat) + Number(b.vat_amount) - Number(b.amount_paid || 0)), 0))}</p>
              {overdueBills.length > 0 && <p className="text-[10px] text-destructive">{overdueBills.length} bill{overdueBills.length !== 1 ? "s" : ""}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-panel rounded-lg p-4">
          <p className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Avg Job Margin</p>
          <p className="text-xl font-mono font-bold text-foreground">{avgMargin.toFixed(1)}%</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <p className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Labour % of Revenue</p>
          <p className="text-xl font-mono font-bold text-foreground">{labourPct.toFixed(1)}%</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <p className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Wages Next 30d</p>
          <p className="text-xl font-mono font-bold text-foreground">{fmt(wagesExpected)}</p>
        </div>
      </div>

      {/* Job Profitability Chart */}
      {jobProfitData.length > 0 && (
        <div className="glass-panel rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" />
            <h3 className="font-mono text-sm font-bold text-foreground">Job Profitability — Top 10</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jobProfitData.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215 12% 50%)" }} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="job_id" tick={{ fontSize: 10, fill: "hsl(210 20% 90%)" }} width={70} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 14% 20%)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(210 20% 90%)" }}
                  formatter={(v: number) => [`£${v.toLocaleString()}`, ""]}
                />
                <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                  {jobProfitData.slice(0, 10).map((entry, idx) => (
                    <Cell key={idx} fill={entry.profit >= 0 ? "hsl(150 60% 40%)" : "hsl(0 72% 50%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border">
                <th className="text-left px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Job</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Revenue</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Cost</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Profit</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Margin</th>
              </tr></thead>
              <tbody>
                {jobProfitData.slice(0, 10).map(j => (
                  <tr key={j.job_id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium text-foreground">{j.job_id}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{fmt(j.revenue)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{fmt(j.totalCost)}</td>
                    <td className={cn("px-3 py-2 text-right font-medium", j.profit >= 0 ? "text-success" : "text-destructive")}>{fmt(j.profit)}</td>
                    <td className={cn("px-3 py-2 text-right", j.margin < 15 ? "text-destructive" : "text-muted-foreground")}>{j.margin.toFixed(1)}%</td>
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
