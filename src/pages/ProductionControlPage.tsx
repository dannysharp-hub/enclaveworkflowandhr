import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { updateAllJobReadiness, type ReadinessResult } from "@/lib/readinessEngine";
import ReadinessBadge from "@/components/ReadinessBadge";
import JobStatusBadge from "@/components/JobStatusBadge";
import { cn } from "@/lib/utils";
import {
  Activity, RefreshCw, AlertTriangle, ShieldCheck, ShieldAlert, XCircle,
  Calendar, Wrench, Filter, ChevronDown,
} from "lucide-react";
import type { JobStatus } from "@/types";

interface JobWithReadiness {
  id: string;
  job_id: string;
  job_name: string;
  status: string;
  created_date: string;
  parts_count: number;
  sheets_estimated: number;
  readiness?: ReadinessResult;
  stages: { stage_name: string; status: string; due_date: string | null }[];
  issues_count: number;
}

const STATUS_ORDER: Record<string, number> = { not_ready: 0, at_risk: 1, ready: 2, production_safe: 3 };

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between mb-1">
        <Icon size={16} className={color} />
        <span className={cn("text-2xl font-mono font-bold", color)}>{value}</span>
      </div>
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

export default function ProductionControlPage() {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobWithReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    const [jobsRes, readinessRes, stagesRes, issuesRes] = await Promise.all([
      supabase.from("jobs").select("*").neq("status", "complete").order("created_date", { ascending: false }),
      (supabase.from("production_readiness_status") as any).select("*"),
      supabase.from("job_stages").select("job_id, stage_name, status, due_date"),
      (supabase.from("job_issues") as any).select("job_id, status").eq("status", "open"),
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
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await updateAllJobReadiness();
    await load();
    setRefreshing(false);
  };

  // Derive stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    return {
      total: jobs.length,
      notReady: jobs.filter(j => j.readiness?.readiness_status === "not_ready").length,
      atRisk: jobs.filter(j => j.readiness?.readiness_status === "at_risk").length,
      ready: jobs.filter(j => j.readiness?.readiness_status === "ready").length,
      safe: jobs.filter(j => j.readiness?.readiness_status === "production_safe").length,
      noScore: jobs.filter(j => !j.readiness).length,
      overdue: jobs.filter(j => j.stages.some(s => s.due_date && s.due_date < today && s.status !== "Done")).length,
      installThisWeek: jobs.filter(j => j.stages.some(s => s.stage_name === "Install" && s.due_date && s.due_date >= today && s.due_date <= weekEnd)).length,
      totalIssues: jobs.reduce((s, j) => s + j.issues_count, 0),
    };
  }, [jobs]);

  // Filter
  const filtered = useMemo(() => {
    let list = [...jobs];
    if (filterStatus !== "all") {
      if (filterStatus === "no_score") list = list.filter(j => !j.readiness);
      else list = list.filter(j => j.readiness?.readiness_status === filterStatus);
    }
    if (filterDept !== "all") {
      list = list.filter(j => j.stages.some(s => s.stage_name === filterDept));
    }
    // Sort: at_risk first, then not_ready, ready, safe
    list.sort((a, b) => {
      const aS = STATUS_ORDER[a.readiness?.readiness_status || "not_ready"] ?? 0;
      const bS = STATUS_ORDER[b.readiness?.readiness_status || "not_ready"] ?? 0;
      return aS - bS;
    });
    return list;
  }, [jobs, filterStatus, filterDept]);

  const today = new Date().toISOString().split("T")[0];

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading production data…</div>;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={20} className="text-primary" />
            <h2 className="text-2xl font-mono font-bold text-foreground">Production Control</h2>
          </div>
          <p className="text-sm text-muted-foreground">{stats.total} active jobs · {stats.totalIssues} open issues</p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Calculating…" : "Recalculate All"}
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Production Safe" value={stats.safe} color="text-emerald-500" icon={ShieldCheck} />
        <StatCard label="Ready" value={stats.ready} color="text-primary" icon={ShieldCheck} />
        <StatCard label="At Risk" value={stats.atRisk} color="text-amber-500" icon={AlertTriangle} />
        <StatCard label="Not Ready" value={stats.notReady} color="text-destructive" icon={XCircle} />
        <StatCard label="Overdue Stages" value={stats.overdue} color="text-destructive" icon={ShieldAlert} />
        <StatCard label="Install This Week" value={stats.installThisWeek} color="text-primary" icon={Calendar} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-mono text-foreground hover:bg-secondary/50 transition-colors">
          <Filter size={12} /> Filters <ChevronDown size={12} className={cn("transition-transform", showFilters && "rotate-180")} />
        </button>

        {showFilters && (
          <>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="all">All Readiness</option>
              <option value="production_safe">Production Safe</option>
              <option value="ready">Ready</option>
              <option value="at_risk">At Risk</option>
              <option value="not_ready">Not Ready</option>
              <option value="no_score">Not Calculated</option>
            </select>
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="all">All Departments</option>
              <option value="CNC">CNC</option>
              <option value="Edgebanding">Edgebanding</option>
              <option value="Assembly">Assembly</option>
              <option value="Spray">Spray</option>
              <option value="Install">Install</option>
            </select>
          </>
        )}
      </div>

      {/* Jobs Table */}
      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Job</th>
                <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Name</th>
                <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Status</th>
                <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Readiness</th>
                <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase hidden lg:table-cell">Stages</th>
                <th className="text-center p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase">Issues</th>
                <th className="text-left p-3 text-[10px] font-mono font-medium text-muted-foreground uppercase hidden md:table-cell">Blockers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(job => {
                const r = job.readiness;
                const overdueStages = job.stages.filter(s => s.due_date && s.due_date < today && s.status !== "Done");
                return (
                  <tr key={job.id} className="hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => navigate(`/jobs/${job.id}/builder`)}>
                    <td className="p-3 font-mono text-sm text-primary">{job.job_id}</td>
                    <td className="p-3 text-sm font-medium text-foreground">{job.job_name}</td>
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
                              isDone ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                              isOverdue ? "bg-destructive/10 text-destructive border-destructive/20" :
                              s.status === "In Progress" ? "bg-primary/10 text-primary border-primary/20" :
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
                            <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 truncate max-w-[120px]">{b}</span>
                          ))}
                          {((r as any).blockers || []).length > 2 && (
                            <span className="text-[9px] text-muted-foreground">+{(r as any).blockers.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
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
    </div>
  );
}
