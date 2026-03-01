import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateForecast, type ForecastSummary } from "@/lib/forecastEngine";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RefreshCw, GitCompareArrows, Check } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine,
} from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 65%, 60%)",
  "hsl(200, 80%, 50%)",
];

function formatGBP(v: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);
}

interface ScenarioResult {
  id: string;
  name: string;
  forecast: ForecastSummary;
}

export default function ScenarioComparison() {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<ScenarioResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [viewPeriod, setViewPeriod] = useState<30 | 60 | 90>(90);

  const loadScenarios = useCallback(async () => {
    const { data } = await supabase.from("cashflow_scenarios").select("*").eq("active", true).order("created_at");
    const sc = (data ?? []) as any[];
    setScenarios(sc);
    // Auto-select all (up to 4)
    setSelected(sc.slice(0, 4).map((s: any) => s.id));
    setLoading(false);
  }, []);

  useEffect(() => { loadScenarios(); }, [loadScenarios]);

  const toggleScenario = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev);
  };

  const runComparison = useCallback(async () => {
    if (selected.length === 0) return;
    setGenerating(true);
    try {
      const forecasts = await Promise.all(
        selected.map(async id => {
          const sc = scenarios.find((s: any) => s.id === id);
          const forecast = await generateForecast(id);
          return { id, name: sc?.name || "Unknown", forecast };
        })
      );
      setResults(forecasts);
    } catch (err: any) {
      toast({ title: "Comparison error", description: err.message, variant: "destructive" });
    } finally { setGenerating(false); }
  }, [selected, scenarios]);

  useEffect(() => { if (selected.length > 0 && scenarios.length > 0) runComparison(); }, [selected.length, scenarios.length]);

  // Build overlay chart data
  const chartData = (() => {
    if (results.length === 0) return [];
    const maxLen = viewPeriod;
    const baseBalances = results[0].forecast.dailyBalances.slice(0, maxLen);
    return baseBalances.map((d, i) => {
      const point: any = { date: d.date.slice(5) };
      results.forEach((r, ri) => {
        point[r.name] = r.forecast.dailyBalances[i]?.balance ?? null;
      });
      return point;
    });
  })();

  const getPeriodValues = (f: ForecastSummary, period: 30 | 60 | 90) => {
    const inflows = period === 30 ? f.inflows30 : period === 60 ? f.inflows60 : f.inflows90;
    const outflows = period === 30 ? f.outflows30 : period === 60 ? f.outflows60 : f.outflows90;
    const ending = period === 30 ? f.endingBalance30 : period === 60 ? f.endingBalance60 : f.endingBalance90;
    return { inflows, outflows, ending, net: inflows - outflows };
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  if (scenarios.length < 2) {
    return (
      <div className="p-8 text-center rounded-lg border border-dashed border-border">
        <GitCompareArrows size={24} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Create at least 2 scenarios to compare them side-by-side.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Scenario Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {scenarios.map((s: any, i: number) => (
            <button
              key={s.id}
              onClick={() => toggleScenario(s.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono border transition-colors",
                selected.includes(s.id)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary/50"
              )}
            >
              {selected.includes(s.id) && <Check size={12} />}
              {s.name}
            </button>
          ))}
        </div>

        <div className="flex rounded-md border border-border overflow-hidden">
          {([30, 60, 90] as const).map(p => (
            <button key={p} onClick={() => setViewPeriod(p)} className={cn("px-3 py-1.5 text-xs font-mono transition-colors", viewPeriod === p ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary/50")}>
              {p}d
            </button>
          ))}
        </div>

        <button onClick={runComparison} disabled={generating || selected.length === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
          {generating ? "Comparing…" : "Compare"}
        </button>
      </div>

      {results.length > 0 && (
        <>
          {/* Overlay Balance Chart */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h4 className="font-mono text-xs font-bold text-foreground uppercase mb-3">Balance Comparison</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 8)} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatGBP(v)} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                  {results.map((r, i) => (
                    <Line key={r.id} type="monotone" dataKey={r.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-mono font-medium text-muted-foreground uppercase">Metric</th>
                  {results.map((r, i) => (
                    <th key={r.id} className="text-right p-3 font-mono font-medium uppercase" style={{ color: COLORS[i % COLORS.length] }}>{r.name}</th>
                  ))}
                  {results.length >= 2 && <th className="text-right p-3 font-mono font-medium text-muted-foreground uppercase">Δ Best/Worst</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { label: "Opening Balance", getter: (f: ForecastSummary) => f.openingBalance },
                  { label: `${viewPeriod}d Inflows`, getter: (f: ForecastSummary) => getPeriodValues(f, viewPeriod).inflows },
                  { label: `${viewPeriod}d Outflows`, getter: (f: ForecastSummary) => getPeriodValues(f, viewPeriod).outflows },
                  { label: `${viewPeriod}d Net`, getter: (f: ForecastSummary) => getPeriodValues(f, viewPeriod).net },
                  { label: `${viewPeriod}d Ending Balance`, getter: (f: ForecastSummary) => getPeriodValues(f, viewPeriod).ending },
                  { label: "Minimum Balance", getter: (f: ForecastSummary) => f.minBalance },
                  { label: "Events Count", getter: (f: ForecastSummary) => f.events.length },
                  { label: "Alerts Count", getter: (f: ForecastSummary) => f.alerts.length },
                ].map(row => {
                  const values = results.map(r => row.getter(r.forecast));
                  const max = Math.max(...values);
                  const min = Math.min(...values);
                  const delta = max - min;
                  return (
                    <tr key={row.label} className="hover:bg-secondary/20 transition-colors">
                      <td className="p-3 font-mono text-foreground">{row.label}</td>
                      {results.map((r, i) => {
                        const v = row.getter(r.forecast);
                        const isBest = values.length > 1 && v === max && !row.label.includes("Outflows") && !row.label.includes("Alerts");
                        return (
                          <td key={r.id} className={cn("p-3 text-right font-mono", isBest ? "text-emerald-500 font-bold" : "text-foreground")}>
                            {typeof v === "number" && row.label !== "Events Count" && row.label !== "Alerts Count" ? formatGBP(v) : v}
                          </td>
                        );
                      })}
                      {results.length >= 2 && (
                        <td className="p-3 text-right font-mono text-muted-foreground">
                          {typeof values[0] === "number" && !row.label.includes("Count") ? formatGBP(delta) : delta}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Assumptions Diff */}
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <div className="p-4 border-b border-border">
              <h4 className="font-mono text-xs font-bold text-foreground uppercase">Assumptions Comparison</h4>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-mono font-medium text-muted-foreground uppercase">Assumption</th>
                  {results.map((r, i) => (
                    <th key={r.id} className="text-right p-3 font-mono font-medium uppercase" style={{ color: COLORS[i % COLORS.length] }}>{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.entries({
                  "Quote Conversion %": "probability_of_quote_conversion_percent",
                  "Days to Invoice": "average_days_to_invoice_after_stage_complete",
                  "Days to Pay": "average_days_to_pay_after_invoice_due",
                  "Late Payment %": "late_payment_probability_percent",
                  "Late Payment Days": "late_payment_extra_days",
                  "Deposit %": "deposit_probability_percent",
                  "Deposit Amount %": "deposit_percent_of_quote",
                  "Wage Buffer %": "wage_buffer_percent",
                  "Overhead Buffer %": "overhead_buffer_percent",
                  "Bill Slippage %": "bill_slippage_probability_percent",
                  "Bill Slippage Days": "bill_slippage_extra_days",
                }).map(([label, key]) => {
                  const vals = results.map(r => {
                    const sc = scenarios.find((s: any) => s.id === r.id);
                    return sc?.assumptions_json?.[key] ?? "—";
                  });
                  const allSame = vals.every(v => v === vals[0]);
                  return (
                    <tr key={key} className={cn("transition-colors", allSame ? "" : "bg-amber-500/5")}>
                      <td className="p-3 font-mono text-foreground">{label}</td>
                      {vals.map((v, i) => (
                        <td key={i} className={cn("p-3 text-right font-mono", allSame ? "text-muted-foreground" : "text-foreground font-bold")}>
                          {v}{typeof v === "number" && label.includes("%") ? "%" : ""}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
