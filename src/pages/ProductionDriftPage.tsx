import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Activity, AlertTriangle, Clock, TrendingUp, TrendingDown,
  CheckCircle, XCircle, BarChart3, Download, Plus,
} from "lucide-react";
import { exportToCsv } from "@/lib/csvExport";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const REASON_CATEGORIES = [
  "material_issue", "design_change", "client_change", "machine_downtime",
  "staff_shortage", "rework", "underestimation", "other",
] as const;

const REASON_LABELS: Record<string, string> = {
  material_issue: "Material Issue",
  design_change: "Design Change",
  client_change: "Client Change",
  machine_downtime: "Machine Downtime",
  staff_shortage: "Staff Shortage",
  rework: "Rework",
  underestimation: "Underestimation",
  other: "Other",
};

const DRIFT_COLORS: Record<string, string> = {
  on_track: "hsl(150 60% 40%)",
  drifting: "hsl(45 90% 50%)",
  overrun_risk: "hsl(0 72% 50%)",
};

const DRIFT_LABELS: Record<string, string> = {
  on_track: "On Track",
  drifting: "Drifting",
  overrun_risk: "Overrun Risk",
};

export default function ProductionDriftPage() {
  const [driftData, setDriftData] = useState<any[]>([]);
  const [timePlans, setTimePlans] = useState<any[]>([]);
  const [timeActuals, setTimeActuals] = useState<any[]>([]);
  const [driftReasons, setDriftReasons] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Drift reason dialog
  const [reasonDialog, setReasonDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState("");
  const [reasonCategory, setReasonCategory] = useState("other");
  const [reasonNotes, setReasonNotes] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [driftRes, planRes, actualRes, reasonRes, jobRes, settingsRes] = await Promise.all([
        supabase.from("job_drift_status").select("*"),
        supabase.from("job_time_plans").select("*"),
        supabase.from("job_time_actuals").select("*"),
        supabase.from("drift_reasons").select("*"),
        supabase.from("jobs").select("id, job_id, job_name, status"),
        supabase.from("drift_settings").select("*").limit(1).maybeSingle(),
      ]);
      setDriftData(driftRes.data ?? []);
      setTimePlans(planRes.data ?? []);
      setTimeActuals(actualRes.data ?? []);
      setDriftReasons(reasonRes.data ?? []);
      setJobs(jobRes.data ?? []);
      setSettings(settingsRes.data);
      setLoading(false);
    };
    load();
  }, []);

  const jobMap = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);

  // KPI calculations
  const totalDrift = driftData.length;
  const onTrack = driftData.filter(d => d.drift_status === "on_track").length;
  const drifting = driftData.filter(d => d.drift_status === "drifting").length;
  const overrun = driftData.filter(d => d.drift_status === "overrun_risk").length;

  const avgCncVariance = driftData.length > 0
    ? driftData.reduce((s, d) => s + Number(d.cnc_variance_percent || 0), 0) / driftData.length
    : 0;
  const avgInstallVariance = driftData.length > 0
    ? driftData.reduce((s, d) => s + Number(d.install_variance_percent || 0), 0) / driftData.length
    : 0;

  // Pie data
  const pieData = [
    { name: "On Track", value: onTrack, fill: DRIFT_COLORS.on_track },
    { name: "Drifting", value: drifting, fill: DRIFT_COLORS.drifting },
    { name: "Overrun Risk", value: overrun, fill: DRIFT_COLORS.overrun_risk },
  ].filter(d => d.value > 0);

  // Top reason categories
  const reasonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    driftReasons.forEach(r => {
      counts[r.reason_category] = (counts[r.reason_category] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([cat, count]) => ({ category: REASON_LABELS[cat] || cat, count }))
      .sort((a, b) => b.count - a.count);
  }, [driftReasons]);

  // Job drift table with enrichment
  const enrichedDrift = useMemo(() => {
    return driftData.map(d => {
      const job = jobMap.get(d.job_id);
      const plan = timePlans.find(p => p.job_id === d.job_id);
      const actual = timeActuals.find(a => a.job_id === d.job_id);
      return {
        ...d,
        job_ref: job?.job_id || "?",
        job_name: job?.job_name || "Unknown",
        planned_total: plan ? Number(plan.planned_total_hours) : 0,
        actual_total: actual ? Number(actual.actual_total_hours) : 0,
      };
    }).sort((a, b) => Number(b.total_variance_percent) - Number(a.total_variance_percent));
  }, [driftData, jobMap, timePlans, timeActuals]);

  // Bar chart — top 10 by variance
  const barData = enrichedDrift.slice(0, 10).map(d => ({
    job_id: d.job_ref,
    variance: Number(d.total_variance_percent),
    fill: d.drift_status === "overrun_risk"
      ? DRIFT_COLORS.overrun_risk
      : d.drift_status === "drifting"
        ? DRIFT_COLORS.drifting
        : DRIFT_COLORS.on_track,
  }));

  const handleLogReason = async () => {
    if (!selectedJobId || !selectedStage) return;
    const { error } = await supabase.from("drift_reasons").insert({
      job_id: selectedJobId,
      stage_name: selectedStage,
      reason_category: reasonCategory,
      notes: reasonNotes || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Drift reason logged" });
      setReasonDialog(false);
      setReasonNotes("");
      // Refresh reasons
      const { data } = await supabase.from("drift_reasons").select("*");
      setDriftReasons(data ?? []);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">Production Drift</h2>
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
          <h2 className="text-2xl font-mono font-bold text-foreground">Production Drift & Time Control</h2>
          <p className="text-sm text-muted-foreground">
            Thresholds: ⚠ {settings?.warning_threshold_percent ?? 10}% | 🔴 {settings?.critical_threshold_percent ?? 20}%
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToCsv("drift_summary",
              ["Job ID", "Job Name", "Status", "CNC Var %", "Assembly Var %", "Install Var %", "Total Var %", "Primary Stage"],
              enrichedDrift.map(d => [d.job_ref, d.job_name, d.drift_status, d.cnc_variance_percent, d.assembly_variance_percent, d.install_variance_percent, d.total_variance_percent, d.primary_overrun_stage || ""])
            )}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Download size={14} /> Export Drift
          </button>
          <button
            onClick={() => exportToCsv("drift_reasons",
              ["Job ID", "Stage", "Category", "Notes", "Logged At"],
              driftReasons.map(r => {
                const job = jobMap.get(r.job_id);
                return [job?.job_id || "?", r.stage_name, r.reason_category, r.notes || "", format(new Date(r.logged_at), "yyyy-MM-dd HH:mm")];
              })
            )}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Download size={14} /> Export Reasons
          </button>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">On Track</span>
            <CheckCircle size={16} className="text-success" />
          </div>
          <p className="text-xl font-mono font-bold text-success">{totalDrift > 0 ? ((onTrack / totalDrift) * 100).toFixed(0) : 0}%</p>
          <p className="text-[10px] text-muted-foreground">{onTrack} jobs</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Drifting</span>
            <AlertTriangle size={16} className="text-warning" />
          </div>
          <p className="text-xl font-mono font-bold text-warning">{totalDrift > 0 ? ((drifting / totalDrift) * 100).toFixed(0) : 0}%</p>
          <p className="text-[10px] text-muted-foreground">{drifting} jobs</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Overrun Risk</span>
            <XCircle size={16} className="text-destructive" />
          </div>
          <p className="text-xl font-mono font-bold text-destructive">{totalDrift > 0 ? ((overrun / totalDrift) * 100).toFixed(0) : 0}%</p>
          <p className="text-[10px] text-muted-foreground">{overrun} jobs</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Avg CNC Var</span>
            <Activity size={16} className="text-info" />
          </div>
          <p className={cn("text-xl font-mono font-bold", avgCncVariance > 10 ? "text-warning" : "text-foreground")}>{avgCncVariance.toFixed(1)}%</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Avg Install Var</span>
            <Clock size={16} className="text-info" />
          </div>
          <p className={cn("text-xl font-mono font-bold", avgInstallVariance > 10 ? "text-warning" : "text-foreground")}>{avgInstallVariance.toFixed(1)}%</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Pie */}
        <div className="glass-panel rounded-lg p-5 space-y-3">
          <h3 className="font-mono text-sm font-bold text-foreground">Drift Distribution</h3>
          {pieData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 14% 20%)", borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No drift data yet</p>
          )}
          <div className="flex gap-4 justify-center text-[10px]">
            {Object.entries(DRIFT_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DRIFT_COLORS[key] }} />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Variance Bar */}
        <div className="glass-panel rounded-lg p-5 space-y-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" />
            <h3 className="font-mono text-sm font-bold text-foreground">Top 10 — Total Variance %</h3>
          </div>
          {barData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 60 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215 12% 50%)" }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="job_id" tick={{ fontSize: 10, fill: "hsl(210 20% 90%)" }} width={55} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(220 18% 12%)", border: "1px solid hsl(220 14% 20%)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`${v.toFixed(1)}%`, "Variance"]}
                  />
                  <Bar dataKey="variance" radius={[0, 4, 4, 0]}>
                    {barData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No drift data yet</p>
          )}
        </div>
      </div>

      {/* Top Drift Reasons */}
      {reasonCounts.length > 0 && (
        <div className="glass-panel rounded-lg p-5 space-y-3">
          <h3 className="font-mono text-sm font-bold text-foreground">Top Drift Reason Categories</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {reasonCounts.slice(0, 4).map((rc) => (
              <div key={rc.category} className="p-3 rounded-md bg-muted/30">
                <p className="text-[10px] font-mono text-muted-foreground uppercase">{rc.category}</p>
                <p className="text-lg font-mono font-bold text-foreground">{rc.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Job Drift Table */}
      <div className="glass-panel rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown size={16} className="text-primary" />
            <h3 className="font-mono text-sm font-bold text-foreground">Job Drift Details</h3>
          </div>
        </div>
        {enrichedDrift.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Job</th>
                  <th className="text-left px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
                  <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Planned h</th>
                  <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Actual h</th>
                  <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">CNC %</th>
                  <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Assembly %</th>
                  <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Install %</th>
                  <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Total %</th>
                  <th className="text-left px-3 py-2 font-mono text-[10px] text-muted-foreground uppercase">Primary Stage</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {enrichedDrift.map(d => (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium text-foreground">{d.job_ref}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium",
                        d.drift_status === "on_track" && "bg-success/20 text-success",
                        d.drift_status === "drifting" && "bg-warning/20 text-warning",
                        d.drift_status === "overrun_risk" && "bg-destructive/20 text-destructive",
                      )}>
                        {DRIFT_LABELS[d.drift_status] || d.drift_status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{d.planned_total.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{d.actual_total.toFixed(1)}</td>
                    <td className={cn("px-3 py-2 text-right", Number(d.cnc_variance_percent) > 10 ? "text-warning" : "text-muted-foreground")}>
                      {Number(d.cnc_variance_percent).toFixed(1)}%
                    </td>
                    <td className={cn("px-3 py-2 text-right", Number(d.assembly_variance_percent) > 10 ? "text-warning" : "text-muted-foreground")}>
                      {Number(d.assembly_variance_percent).toFixed(1)}%
                    </td>
                    <td className={cn("px-3 py-2 text-right", Number(d.install_variance_percent) > 10 ? "text-warning" : "text-muted-foreground")}>
                      {Number(d.install_variance_percent).toFixed(1)}%
                    </td>
                    <td className={cn("px-3 py-2 text-right font-medium",
                      d.drift_status === "overrun_risk" ? "text-destructive" : d.drift_status === "drifting" ? "text-warning" : "text-success"
                    )}>
                      {Number(d.total_variance_percent).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.primary_overrun_stage || "—"}</td>
                    <td className="px-3 py-2">
                      {d.drift_status !== "on_track" && (
                        <button
                          onClick={() => {
                            setSelectedJobId(d.job_id);
                            setSelectedStage(d.primary_overrun_stage || "CNC");
                            setReasonDialog(true);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Plus size={12} /> Reason
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No drift data — drift status will populate as jobs progress through production.</p>
        )}
      </div>

      {/* Log Drift Reason Dialog */}
      <Dialog open={reasonDialog} onOpenChange={setReasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono">Log Drift Reason</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase mb-1 block">Stage</label>
              <Select value={selectedStage} onValueChange={setSelectedStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["CNC", "Assembly", "Spray", "Install"].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase mb-1 block">Reason Category</label>
              <Select value={reasonCategory} onValueChange={setReasonCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASON_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{REASON_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase mb-1 block">Notes</label>
              <Textarea value={reasonNotes} onChange={e => setReasonNotes(e.target.value)} placeholder="Details..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialog(false)}>Cancel</Button>
            <Button onClick={handleLogReason}>Save Reason</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
