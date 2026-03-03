import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { updateAllJobReadiness, type ReadinessResult } from "@/lib/readinessEngine";
import ReadinessBadge from "@/components/ReadinessBadge";
import JobStatusBadge from "@/components/JobStatusBadge";
import CncQueuePressureWidget from "@/components/CncQueuePressureWidget";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Activity, RefreshCw, AlertTriangle, ShieldCheck, ShieldAlert, XCircle,
  Calendar, Filter, ChevronDown, Gauge, Layers, Clock, ArrowRight,
  TrendingUp, Cpu, Eye, EyeOff,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { JobStatus } from "@/types";
import { format, differenceInDays, addDays, eachDayOfInterval, isWeekend } from "date-fns";

// ── Types ──

interface JobWithReadiness {
  id: string;
  job_id: string;
  job_name: string;
  status: string;
  created_date: string;
  parts_count: number;
  sheets_estimated: number;
  readiness?: ReadinessResult;
  stages: { stage_name: string; status: string; due_date: string | null; created_at?: string; updated_at?: string }[];
  issues_count: number;
}

interface MachineConfig {
  id: string;
  name: string;
  department: string;
  default_available_hours_per_day: number;
  active: boolean;
}

const STATUS_ORDER: Record<string, number> = { not_ready: 0, at_risk: 1, ready: 2, production_safe: 3 };

const STAGE_COLOURS: Record<string, string> = {
  Design: "bg-info",
  Programming: "bg-accent",
  CNC: "bg-primary",
  Edgebanding: "bg-warning",
  Assembly: "bg-success",
  Spray: "bg-destructive/70",
  Install: "bg-primary/60",
};

// ── Main Component ──

export default function ProductionControlPage() {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobWithReadiness[]>([]);
  const [machines, setMachines] = useState<MachineConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    const [jobsRes, readinessRes, stagesRes, issuesRes, machinesRes] = await Promise.all([
      supabase.from("jobs").select("*").neq("status", "complete").order("created_date", { ascending: false }),
      (supabase.from("production_readiness_status") as any).select("*"),
      supabase.from("job_stages").select("job_id, stage_name, status, due_date, created_at, updated_at"),
      (supabase.from("job_issues") as any).select("job_id, status").eq("status", "open"),
      supabase.from("machine_config").select("*").eq("active", true),
    ]);

    const readinessMap = new Map<string, any>();
    (readinessRes.data ?? []).forEach((r: any) => readinessMap.set(r.job_id, r));

    const stagesMap = new Map<string, any[]>();
    (stagesRes.data ?? []).forEach((s: any) => {
      const arr = stagesMap.get(s.job_id) || [];
      arr.push(s);
      stagesMap.set(s.job_id, arr);
    });

    const issuesMap = new Map<string, number>();
    (issuesRes.data ?? []).forEach((i: any) => {
      issuesMap.set(i.job_id, (issuesMap.get(i.job_id) || 0) + 1);
    });

    const combined: JobWithReadiness[] = (jobsRes.data ?? []).map((j: any) => ({
      ...j,
      readiness: readinessMap.get(j.id),
      stages: stagesMap.get(j.id) || [],
      issues_count: issuesMap.get(j.id) || 0,
    }));

    setJobs(combined);
    setMachines(machinesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await updateAllJobReadiness();
    await load();
    setRefreshing(false);
  };

  const today = new Date().toISOString().split("T")[0];
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const allStages = useMemo(() => jobs.flatMap(j => j.stages.map(s => ({ ...s, jobId: j.id, jobCode: j.job_id, jobName: j.job_name }))), [jobs]);

  const stats = useMemo(() => ({
    total: jobs.length,
    notReady: jobs.filter(j => j.readiness?.readiness_status === "not_ready").length,
    atRisk: jobs.filter(j => j.readiness?.readiness_status === "at_risk").length,
    ready: jobs.filter(j => j.readiness?.readiness_status === "ready").length,
    safe: jobs.filter(j => j.readiness?.readiness_status === "production_safe").length,
    overdue: jobs.filter(j => j.stages.some(s => s.due_date && s.due_date < today && s.status !== "Done")).length,
    installThisWeek: jobs.filter(j => j.stages.some(s => s.stage_name === "Install" && s.due_date && s.due_date >= today && s.due_date <= weekEnd)).length,
    totalIssues: jobs.reduce((s, j) => s + j.issues_count, 0),
  }), [jobs, today, weekEnd]);

  const stageBottlenecks = useMemo(() => {
    const stageNames = [...new Set(allStages.map(s => s.stage_name))];
    return stageNames.map(name => {
      const stagesForName = allStages.filter(s => s.stage_name === name);
      const total = stagesForName.length;
      const inProgress = stagesForName.filter(s => s.status === "In Progress").length;
      const waiting = stagesForName.filter(s => s.status === "Not Started").length;
      const done = stagesForName.filter(s => s.status === "Done").length;
      const overdue = stagesForName.filter(s => s.due_date && s.due_date < today && s.status !== "Done").length;
      const utilPct = total > 0 ? Math.round(((inProgress + done) / total) * 100) : 0;
      return { name, total, inProgress, waiting, done, overdue, utilPct };
    }).sort((a, b) => b.waiting - a.waiting);
  }, [allStages, today]);

  const machineUtil = useMemo(() => {
    return machines.map(m => {
      const deptStages = allStages.filter(s => s.stage_name === m.department || s.stage_name === m.name);
      const active = deptStages.filter(s => s.status === "In Progress").length;
      const queued = deptStages.filter(s => s.status === "Not Started").length;
      const hoursPerDay = m.default_available_hours_per_day;
      const utilPct = hoursPerDay > 0 ? Math.min(100, Math.round((active / hoursPerDay) * 100)) : 0;
      return { ...m, active, queued, utilPct };
    });
  }, [machines, allStages]);

  const filtered = useMemo(() => {
    let list = [...jobs];
    if (filterStatus !== "all") {
      if (filterStatus === "no_score") list = list.filter(j => !j.readiness);
      else list = list.filter(j => j.readiness?.readiness_status === filterStatus);
    }
    list.sort((a, b) => {
      const aS = STATUS_ORDER[a.readiness?.readiness_status || "not_ready"] ?? 0;
      const bS = STATUS_ORDER[b.readiness?.readiness_status || "not_ready"] ?? 0;
      return aS - bS;
    });
    return list;
  }, [jobs, filterStatus]);

  // ── Gantt data ──
  const ganttDays = useMemo(() => {
    const start = new Date();
    return eachDayOfInterval({ start, end: addDays(start, 20) }).filter(d => !isWeekend(d));
  }, []);

  const ganttJobs = useMemo(() => {
    return jobs.filter(j => j.stages.some(s => s.due_date && s.status !== "Done")).slice(0, 15).map(j => {
      const activeStages = j.stages.filter(s => s.status !== "Done" && s.due_date);
      return { id: j.id, jobCode: j.job_id, jobName: j.job_name, stages: activeStages };
    });
  }, [jobs]);

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={20} className="text-primary" />
            <h1 className="text-2xl font-mono font-bold text-foreground">Production Control</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {stats.total} active jobs · {stats.totalIssues} open issues · {stats.overdue} with overdue stages
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Calculating…" : "Recalculate All"}
        </button>
      </div>

      {/* Readiness Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Production Safe" value={stats.safe} icon={ShieldCheck} variant="success" />
        <KPICard label="Ready" value={stats.ready} icon={ShieldCheck} variant="primary" />
        <KPICard label="At Risk" value={stats.atRisk} icon={AlertTriangle} variant="warning" />
        <KPICard label="Not Ready" value={stats.notReady} icon={XCircle} variant="danger" />
        <KPICard label="Overdue Stages" value={stats.overdue} icon={ShieldAlert} variant="danger" />
        <KPICard label="Install This Week" value={stats.installThisWeek} icon={Calendar} variant="primary" />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview" className="text-xs font-mono">Overview</TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs font-mono">Schedule</TabsTrigger>
          <TabsTrigger value="jobs" className="text-xs font-mono">Jobs</TabsTrigger>
        </TabsList>

        {/* ═══ Overview Tab ═══ */}
        <TabsContent value="overview" className="space-y-6">
          {/* CNC Queue Pressure */}
          <CncQueuePressureWidget />

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Stage Bottleneck Analysis */}
            <div className="glass-panel rounded-lg">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                  <Layers size={14} className="text-muted-foreground" /> STAGE PIPELINE
                </h2>
                <span className="text-[10px] font-mono text-muted-foreground">{stageBottlenecks.length} stages</span>
              </div>
              <div className="divide-y divide-border">
                {stageBottlenecks.map(s => (
                  <div key={s.name} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-medium text-foreground">{s.name}</span>
                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        {s.overdue > 0 && (
                          <span className="text-destructive flex items-center gap-0.5">
                            <Clock size={10} /> {s.overdue} overdue
                          </span>
                        )}
                        <span className="text-primary">{s.inProgress} active</span>
                        <span className="text-muted-foreground">{s.waiting} queued</span>
                        <span className="text-muted-foreground">{s.done} done</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={s.utilPct} className="h-1.5 flex-1" />
                      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{s.utilPct}%</span>
                    </div>
                  </div>
                ))}
                {stageBottlenecks.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">No stage data</div>
                )}
              </div>
            </div>

            {/* Machine Utilisation */}
            <div className="glass-panel rounded-lg">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                  <Cpu size={14} className="text-muted-foreground" /> MACHINE UTILISATION
                </h2>
                <span className="text-[10px] font-mono text-muted-foreground">{machines.length} machines</span>
              </div>
              {machineUtil.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No machines configured. Add machines in Settings.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {machineUtil.map(m => (
                    <div key={m.id} className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-mono font-medium text-foreground">{m.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{m.department}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-mono">
                          <span className="text-primary">{m.active} active</span>
                          <span className="text-muted-foreground">{m.queued} queued</span>
                          <span className="text-muted-foreground">{m.default_available_hours_per_day}h/day</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={m.utilPct}
                          className={cn("h-1.5 flex-1", m.utilPct > 85 && "[&>div]:bg-destructive")}
                        />
                        <span className={cn(
                          "text-[10px] font-mono w-8 text-right font-bold",
                          m.utilPct > 85 ? "text-destructive" : m.utilPct > 60 ? "text-warning" : "text-primary"
                        )}>
                          {m.utilPct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══ Schedule Tab (Gantt) ═══ */}
        <TabsContent value="schedule" className="space-y-4">
          <div className="glass-panel rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                <Calendar size={14} className="text-muted-foreground" /> PRODUCTION SCHEDULE
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Next 3 working weeks · {ganttJobs.length} jobs</p>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header row */}
                <div className="flex border-b border-border bg-muted/30">
                  <div className="w-44 shrink-0 p-2 text-[10px] font-mono font-bold text-muted-foreground uppercase">Job</div>
                  {ganttDays.map(d => (
                    <div key={d.toISOString()} className={cn(
                      "flex-1 p-1 text-center text-[9px] font-mono text-muted-foreground border-l border-border",
                      format(d, "yyyy-MM-dd") === today && "bg-primary/10 text-primary font-bold"
                    )}>
                      <div>{format(d, "EEE")}</div>
                      <div>{format(d, "dd")}</div>
                    </div>
                  ))}
                </div>

                {/* Job rows */}
                {ganttJobs.map(job => (
                  <div key={job.id} className="flex border-b border-border hover:bg-secondary/10 transition-colors cursor-pointer" onClick={() => navigate(`/jobs/${job.id}/builder`)}>
                    <div className="w-44 shrink-0 p-2">
                      <p className="text-[10px] font-mono text-primary truncate">{job.jobCode}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{job.jobName}</p>
                    </div>
                    <div className="flex flex-1 relative">
                      {ganttDays.map(d => (
                        <div key={d.toISOString()} className={cn(
                          "flex-1 border-l border-border min-h-[36px]",
                          format(d, "yyyy-MM-dd") === today && "bg-primary/5"
                        )} />
                      ))}
                      {/* Stage bars overlay */}
                      {job.stages.map((stage, idx) => {
                        if (!stage.due_date) return null;
                        const dueDate = new Date(stage.due_date);
                        const startDate = stage.created_at ? new Date(stage.created_at) : addDays(dueDate, -2);
                        const ganttStart = ganttDays[0];
                        const ganttEnd = ganttDays[ganttDays.length - 1];

                        // Calculate position as fraction of gantt range
                        const totalRange = ganttEnd.getTime() - ganttStart.getTime();
                        if (totalRange <= 0) return null;

                        const barStart = Math.max(0, (startDate.getTime() - ganttStart.getTime()) / totalRange);
                        const barEnd = Math.min(1, (dueDate.getTime() - ganttStart.getTime()) / totalRange);
                        if (barEnd < 0 || barStart > 1) return null;

                        const left = `${barStart * 100}%`;
                        const width = `${Math.max(3, (barEnd - barStart) * 100)}%`;
                        const isOverdue = dueDate < new Date() && stage.status !== "Done";

                        return (
                          <div
                            key={`${stage.stage_name}-${idx}`}
                            className={cn(
                              "absolute h-4 rounded-sm flex items-center px-1 text-[8px] font-mono text-white truncate",
                              isOverdue ? "bg-destructive" : (STAGE_COLOURS[stage.stage_name] || "bg-muted-foreground"),
                              stage.status === "Done" && "opacity-40"
                            )}
                            style={{ left, width, top: `${4 + idx * 8}px` }}
                            title={`${stage.stage_name} — due ${format(dueDate, "dd MMM")}`}
                          >
                            {stage.stage_name}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {ganttJobs.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">No scheduled stages with due dates</div>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="p-3 border-t border-border flex flex-wrap gap-3">
              {Object.entries(STAGE_COLOURS).map(([name, cls]) => (
                <div key={name} className="flex items-center gap-1.5">
                  <div className={cn("w-3 h-2 rounded-sm", cls)} />
                  <span className="text-[9px] font-mono text-muted-foreground">{name}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm bg-destructive" />
                <span className="text-[9px] font-mono text-muted-foreground">Overdue</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ═══ Jobs Tab ═══ */}
        <TabsContent value="jobs" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-mono text-foreground hover:bg-secondary/50 transition-colors">
              <Filter size={12} /> Filters <ChevronDown size={12} className={cn("transition-transform", showFilters && "rotate-180")} />
            </button>
            {showFilters && (
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="all">All Readiness</option>
                <option value="production_safe">Production Safe</option>
                <option value="ready">Ready</option>
                <option value="at_risk">At Risk</option>
                <option value="not_ready">Not Ready</option>
                <option value="no_score">Not Calculated</option>
              </select>
            )}
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">{filtered.length} jobs shown</span>
          </div>

          {/* Jobs Table */}
          <div className="glass-panel rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Job</th>
                    <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Name</th>
                    <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Status</th>
                    <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Readiness</th>
                    <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase hidden lg:table-cell">Stages</th>
                    <th className="text-center p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Issues</th>
                    <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase hidden md:table-cell">Blockers</th>
                    <th className="p-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(job => {
                    const r = job.readiness;
                    return (
                      <tr key={job.id} className="hover:bg-secondary/20 transition-colors cursor-pointer group" onClick={() => navigate(`/jobs/${job.id}/builder`)}>
                        <td className="p-3 font-mono text-sm text-primary">{job.job_id}</td>
                        <td className="p-3 text-sm font-medium text-foreground max-w-[200px] truncate">{job.job_name}</td>
                        <td className="p-3"><JobStatusBadge status={job.status as JobStatus} /></td>
                        <td className="p-3">
                          {r ? (
                            <ReadinessBadge score={r.readiness_score} status={r.readiness_status as any} compact />
                          ) : (
                            <span className="text-[10px] text-muted-foreground font-mono">—</span>
                          )}
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {job.stages.map(s => {
                              const isOverdue = s.due_date && s.due_date < today && s.status !== "Done";
                              const isDone = s.status === "Done";
                              return (
                                <span key={s.stage_name} className={cn(
                                  "text-[9px] font-mono px-1.5 py-0.5 rounded-full border",
                                  isDone ? "bg-primary/10 text-primary border-primary/20" :
                                  isOverdue ? "bg-destructive/10 text-destructive border-destructive/20" :
                                  s.status === "In Progress" ? "bg-warning/10 text-warning border-warning/20" :
                                  "bg-muted/50 text-muted-foreground border-border"
                                )}>
                                  {s.stage_name}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {job.issues_count > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
                              <AlertTriangle size={10} /> {job.issues_count}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          {r && (r as any).blockers?.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[250px]">
                              {((r as any).blockers || []).slice(0, 2).map((b: string, i: number) => (
                                <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-warning/10 text-warning truncate max-w-[120px]">{b}</span>
                              ))}
                              {((r as any).blockers || []).length > 2 && (
                                <span className="text-[9px] text-muted-foreground">+{(r as any).blockers.length - 2}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <ArrowRight size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">No jobs match the current filters.</div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Sub-components ──

function KPICard({ label, value, icon: Icon, variant }: {
  label: string; value: number; icon: any;
  variant: "success" | "primary" | "warning" | "danger";
}) {
  const colors = {
    success: "text-primary",
    primary: "text-primary",
    warning: "text-warning",
    danger: "text-destructive",
  };
  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between mb-1">
        <Icon size={16} className={colors[variant]} />
        <span className={cn("text-2xl font-mono font-bold", colors[variant])}>{value}</span>
      </div>
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}
