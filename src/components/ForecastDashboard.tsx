import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateForecast, forecastEventsToCsv, forecastSummaryToCsv, type ForecastSummary, type CashflowEvent, type ForecastAlert } from "@/lib/forecastEngine";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Download,
  ArrowUpRight, ArrowDownRight, ShieldAlert, Info, DollarSign, Calendar,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ReferenceLine,
} from "recharts";

const btnPrimary = "flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors";
const btnOutline = "flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium text-foreground hover:bg-secondary/50 disabled:opacity-50 transition-colors";

function formatGBP(v: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);
}

function SummaryCard({ label, value, sub, icon: Icon, trend }: { label: string; value: string; sub?: string; icon: any; trend?: "up" | "down" | "neutral" }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon size={14} className="text-muted-foreground" />
      </div>
      <p className={cn("text-lg font-mono font-bold", trend === "up" ? "text-emerald-500" : trend === "down" ? "text-destructive" : "text-foreground")}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function AlertItem({ alert }: { alert: ForecastAlert }) {
  const icon = alert.severity === "critical" ? ShieldAlert : alert.severity === "warning" ? AlertTriangle : Info;
  const Icon = icon;
  const colors = alert.severity === "critical" ? "border-destructive/30 bg-destructive/5 text-destructive" : alert.severity === "warning" ? "border-amber-500/30 bg-amber-500/5 text-amber-600" : "border-border bg-muted/30 text-muted-foreground";
  return (
    <div className={cn("flex items-start gap-2.5 p-3 rounded-md border text-xs", colors)}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{alert.message}</span>
    </div>
  );
}

function EventRow({ event }: { event: CashflowEvent }) {
  const isIn = event.event_type === "cash_in";
  return (
    <tr className="hover:bg-secondary/20 transition-colors text-xs">
      <td className="p-2.5 font-mono text-foreground">{event.event_date}</td>
      <td className="p-2.5">
        <span className={cn("inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full", isIn ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/15 text-destructive")}>
          {isIn ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          {isIn ? "IN" : "OUT"}
        </span>
      </td>
      <td className="p-2.5 text-foreground max-w-[200px] truncate">{event.description}</td>
      <td className="p-2.5 text-muted-foreground">{event.counterparty_name || "—"}</td>
      <td className="p-2.5 text-right font-mono text-foreground">{formatGBP(event.amount)}</td>
      <td className="p-2.5">
        <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full", event.confidence === "high" ? "bg-emerald-500/15 text-emerald-600" : event.confidence === "medium" ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground")}>
          {event.confidence}
        </span>
      </td>
    </tr>
  );
}

export default function ForecastDashboard() {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [forecast, setForecast] = useState<ForecastSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [viewPeriod, setViewPeriod] = useState<30 | 60 | 90>(90);

  const loadScenarios = useCallback(async () => {
    const [scRes, settingsRes] = await Promise.all([
      supabase.from("cashflow_scenarios").select("*").eq("active", true).order("created_at"),
      supabase.from("cashflow_settings").select("default_scenario_id").maybeSingle(),
    ]);
    const sc = (scRes.data ?? []) as any[];
    setScenarios(sc);
    const defaultId = (settingsRes.data as any)?.default_scenario_id;
    const pick = sc.find((s: any) => s.id === defaultId) || sc.find((s: any) => s.is_default) || sc[0];
    if (pick) setSelectedScenario(pick.id);
    setLoading(false);
  }, []);

  useEffect(() => { loadScenarios(); }, [loadScenarios]);

  const runForecast = useCallback(async () => {
    if (!selectedScenario) return;
    setGenerating(true);
    try {
      const result = await generateForecast(selectedScenario);
      setForecast(result);
    } catch (err: any) {
      toast({ title: "Forecast error", description: err.message, variant: "destructive" });
    } finally { setGenerating(false); }
  }, [selectedScenario]);

  useEffect(() => { if (selectedScenario) runForecast(); }, [selectedScenario, runForecast]);

  const exportCsv = (type: "events" | "summary") => {
    if (!forecast) return;
    const csv = type === "events" ? forecastEventsToCsv(forecast.events) : forecastSummaryToCsv(forecast);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `forecast-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Filter daily balances by view period
  const filteredBalances = forecast?.dailyBalances.slice(0, viewPeriod) ?? [];
  const chartData = filteredBalances.map(d => ({ ...d, date: d.date.slice(5) }));

  // Period inflows/outflows
  const periodInflows = viewPeriod === 30 ? forecast?.inflows30 : viewPeriod === 60 ? forecast?.inflows60 : forecast?.inflows90;
  const periodOutflows = viewPeriod === 30 ? forecast?.outflows30 : viewPeriod === 60 ? forecast?.outflows60 : forecast?.outflows90;
  const periodEnding = viewPeriod === 30 ? forecast?.endingBalance30 : viewPeriod === 60 ? forecast?.endingBalance60 : forecast?.endingBalance90;

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  if (scenarios.length === 0) {
    return (
      <div className="p-8 text-center rounded-lg border border-dashed border-border">
        <TrendingUp size={24} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Create a scenario in the Scenarios tab first to generate a forecast.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={selectedScenario}
          onChange={e => setSelectedScenario(e.target.value)}
        >
          {scenarios.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}{s.is_default ? " ★" : ""}</option>
          ))}
        </select>

        <div className="flex rounded-md border border-border overflow-hidden">
          {([30, 60, 90] as const).map(p => (
            <button key={p} onClick={() => setViewPeriod(p)} className={cn("px-3 py-1.5 text-xs font-mono transition-colors", viewPeriod === p ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary/50")}>
              {p}d
            </button>
          ))}
        </div>

        <button onClick={runForecast} disabled={generating} className={btnPrimary}>
          <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
          {generating ? "Generating…" : "Refresh"}
        </button>

        <div className="ml-auto flex gap-1.5">
          <button onClick={() => exportCsv("summary")} className={btnOutline}><Download size={12} /> Summary CSV</button>
          <button onClick={() => exportCsv("events")} className={btnOutline}><Download size={12} /> Events CSV</button>
        </div>
      </div>

      {forecast && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <SummaryCard label="Opening" value={formatGBP(forecast.openingBalance)} icon={DollarSign} />
            <SummaryCard label={`${viewPeriod}d Inflows`} value={formatGBP(periodInflows ?? 0)} icon={ArrowUpRight} trend="up" />
            <SummaryCard label={`${viewPeriod}d Outflows`} value={formatGBP(periodOutflows ?? 0)} icon={ArrowDownRight} trend="down" />
            <SummaryCard label={`${viewPeriod}d Ending`} value={formatGBP(periodEnding ?? 0)} icon={TrendingUp} trend={(periodEnding ?? 0) >= forecast.openingBalance ? "up" : "down"} />
            <SummaryCard label="Min Balance" value={formatGBP(forecast.minBalance)} sub={forecast.minBalanceDate} icon={TrendingDown} trend={forecast.minBalance < 0 ? "down" : "neutral"} />
            <SummaryCard label="Events" value={String(forecast.events.length)} sub={`${forecast.alerts.length} alerts`} icon={Calendar} />
          </div>

          {/* Alerts */}
          {forecast.alerts.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-mono text-xs font-bold text-foreground uppercase">Alerts</h4>
              <div className="grid gap-2">
                {forecast.alerts.map((a, i) => <AlertItem key={i} alert={a} />)}
              </div>
            </div>
          )}

          {/* Balance Chart */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h4 className="font-mono text-xs font-bold text-foreground uppercase mb-3">Projected Cash Balance</h4>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 8)} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatGBP(v)} labelFormatter={l => `Date: ${l}`} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="balance" stroke="hsl(var(--primary))" fill="url(#balGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Inflow/Outflow Bar Chart */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h4 className="font-mono text-xs font-bold text-foreground uppercase mb-3">Daily Inflows & Outflows</h4>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.filter(d => d.inflow > 0 || d.outflow > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatGBP(v)} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="inflow" name="Cash In" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="outflow" name="Cash Out" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Events Table */}
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border">
              <h4 className="font-mono text-xs font-bold text-foreground uppercase">Forecast Events ({forecast.events.length})</h4>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="text-left p-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase">Date</th>
                    <th className="text-left p-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase">Type</th>
                    <th className="text-left p-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase">Description</th>
                    <th className="text-left p-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase">Counterparty</th>
                    <th className="text-right p-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase">Amount</th>
                    <th className="text-left p-2.5 text-[10px] font-mono font-medium text-muted-foreground uppercase">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {forecast.events.map((e, i) => <EventRow key={i} event={e} />)}
                </tbody>
              </table>
              {forecast.events.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">No forecast events generated. Check that you have invoices, bills, or overheads in the system.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
