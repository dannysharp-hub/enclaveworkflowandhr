import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import JobStatusBadge from "@/components/JobStatusBadge";
import ReadinessBadge from "@/components/ReadinessBadge";
import JobDialog from "@/components/JobDialog";
import { Plus, Search, Hammer, AlertTriangle, RefreshCw, Trash2, FolderDown, FileSearch } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { cn } from "@/lib/utils";
import { updateAllJobReadiness, type ReadinessResult } from "@/lib/readinessEngine";
import type { JobStatus } from "@/types";

interface DbJob {
  id: string;
  job_id: string;
  job_name: string;
  created_date: string;
  status: string;
  parts_count: number;
  materials_count: number;
  sheets_estimated: number;
}

export default function JobsPage() {
  const { userRole } = useAuth();
  const { flags } = useFeatureFlags();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<DbJob[]>([]);
  const [jobOverdues, setJobOverdues] = useState<Map<string, { overdueInvoices: number; overdueBills: number }>>(new Map());
  const [readiness, setReadiness] = useState<Map<string, ReadinessResult>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshingReadiness, setRefreshingReadiness] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scanningBoms, setScanningBoms] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editJob, setEditJob] = useState<DbJob | null>(null);
  const [deleteJob, setDeleteJob] = useState<DbJob | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = userRole === "admin" || userRole === "engineer" || userRole === "supervisor";

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase.from("jobs").select("*").order("created_date", { ascending: false });
    setJobs(data ?? []);

    // Load cached readiness
    const { data: rData } = await (supabase.from("production_readiness_status") as any).select("*");
    const rMap = new Map<string, ReadinessResult>();
    (rData ?? []).forEach((r: any) => rMap.set(r.job_id, r));
    setReadiness(rMap);

    if (flags.enable_finance) {
      const today = new Date().toISOString().split("T")[0];
      const [invRes, billRes] = await Promise.all([
        supabase.from("invoices").select("id, job_id, due_date, status").neq("status", "paid").neq("status", "cancelled").not("job_id", "is", null),
        supabase.from("bills").select("id, job_id, due_date, status").neq("status", "paid").neq("status", "cancelled").not("job_id", "is", null),
      ]);
      const map = new Map<string, { overdueInvoices: number; overdueBills: number }>();
      (invRes.data ?? []).filter((i: any) => i.due_date < today).forEach((i: any) => {
        const existing = map.get(i.job_id) || { overdueInvoices: 0, overdueBills: 0 };
        existing.overdueInvoices++;
        map.set(i.job_id, existing);
      });
      (billRes.data ?? []).filter((b: any) => b.due_date < today).forEach((b: any) => {
        const existing = map.get(b.job_id) || { overdueInvoices: 0, overdueBills: 0 };
        existing.overdueBills++;
        map.set(b.job_id, existing);
      });
      setJobOverdues(map);
    }

    setLoading(false);
  }, [flags.enable_finance]);

  const refreshReadiness = useCallback(async () => {
    setRefreshingReadiness(true);
    try {
      const results = await updateAllJobReadiness();
      const rMap = new Map<string, ReadinessResult>();
      results.forEach(r => rMap.set(r.job_id, r));
      setReadiness(rMap);
    } finally { setRefreshingReadiness(false); }
  }, []);

  const handleDeleteJob = useCallback(async () => {
    if (!deleteJob) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("jobs").delete().eq("id", deleteJob.id);
      if (error) throw error;
      toast({ title: "Job deleted", description: `${deleteJob.job_id} removed` });
      setDeleteJob(null);
      fetchJobs();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  }, [deleteJob, fetchJobs]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const importFromDrive = useCallback(async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "import_jobs_from_drive" },
      });
      if (error) throw error;
      toast({
        title: "Drive Import Complete",
        description: `${data.created} jobs created, ${data.skipped} skipped, ${data.unmatched?.length || 0} folders didn't match pattern`,
      });
      if (data.unmatched?.length > 0) {
        console.log("Unmatched folders:", data.unmatched);
      }
      fetchJobs();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally { setImporting(false); }
  }, [fetchJobs]);

  const scanAllBoms = useCallback(async () => {
    setScanningBoms(true);
    try {
      // Get all jobs with drive links and scan them one by one
      const { data: jobList } = await supabase.from("job_drive_links").select("job_id");
      if (!jobList || jobList.length === 0) {
        toast({ title: "No linked jobs", description: "No jobs are linked to Drive folders yet." });
        setScanningBoms(false);
        return;
      }
      let scanned = 0;
      let bomImported = 0;
      const errors: string[] = [];
      for (const link of jobList) {
        try {
          const { data, error } = await supabase.functions.invoke("google-drive-auth", {
            body: { action: "scan_single_job", job_id: link.job_id },
          });
          if (error) throw error;
          scanned++;
          if (data?.bom_imported) bomImported++;
        } catch (err: any) {
          errors.push(link.job_id);
        }
      }
      toast({
        title: "BOM Scan Complete",
        description: `${scanned} jobs scanned, ${bomImported} BOMs imported${errors.length ? `, ${errors.length} errors` : ""}`,
      });
      fetchJobs();
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally { setScanningBoms(false); }
  }, [fetchJobs]);

  const filtered = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(j => j.job_id.toLowerCase().includes(q) || j.job_name.toLowerCase().includes(q) || j.status.toLowerCase().includes(q));
  }, [jobs, search]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">CNC Jobs</h2>
          <p className="text-sm text-muted-foreground">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""} · {jobs.filter(j => j.status !== "complete").length} active
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus size={16} /> New Job
            </button>
          )}
          {canManage && (
            <button onClick={importFromDrive} disabled={importing} className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50">
              <FolderDown size={14} className={importing ? "animate-pulse" : ""} />
              {importing ? "Importing…" : "Import from Drive"}
            </button>
          )}
          {canManage && (
            <button onClick={scanAllBoms} disabled={scanningBoms} className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50">
              <FileSearch size={14} className={scanningBoms ? "animate-pulse" : ""} />
              {scanningBoms ? "Scanning…" : "Scan BOMs"}
            </button>
          )}
          <button onClick={refreshReadiness} disabled={refreshingReadiness} className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={refreshingReadiness ? "animate-spin" : ""} />
            {refreshingReadiness ? "Calculating…" : "Readiness"}
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search jobs..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      </div>

      <div className="glass-panel rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading jobs...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {search ? "No jobs matching your search" : "No jobs yet. Click New Job to get started."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Job ID</th>
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Date</th>
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Readiness</th>
                  <th className="text-right p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Parts</th>
                  <th className="text-right p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Sheets</th>
                  {canManage && <th className="p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Build</th>}
                  {canManage && <th className="p-4"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(job => {
                  const overdue = jobOverdues.get(job.id);
                  const r = readiness.get(job.id);
                  return (
                  <tr key={job.id} className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => canManage && setEditJob(job)}>
                    <td className="p-4 font-mono text-sm text-primary">
                      <div className="flex items-center gap-2">
                        {job.job_id}
                        {overdue && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-mono font-medium">
                            <AlertTriangle size={10} />
                            {overdue.overdueInvoices > 0 && `${overdue.overdueInvoices} inv`}
                            {overdue.overdueInvoices > 0 && overdue.overdueBills > 0 && " · "}
                            {overdue.overdueBills > 0 && `${overdue.overdueBills} bill`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-sm font-medium text-foreground">{job.job_name}</td>
                    <td className="p-4 text-sm text-muted-foreground hidden sm:table-cell">{job.created_date}</td>
                    <td className="p-4"><JobStatusBadge status={job.status as JobStatus} /></td>
                    <td className="p-4">
                      {r ? (
                        <ReadinessBadge score={r.readiness_score} status={r.readiness_status as any} compact />
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-mono">—</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-mono text-sm text-foreground">{job.parts_count}</td>
                    <td className="p-4 text-right font-mono text-sm text-muted-foreground hidden md:table-cell">{job.sheets_estimated}</td>
                    {canManage && (
                      <td className="p-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}/builder`); }}
                          className="flex items-center gap-1 h-7 px-2 rounded border border-primary/30 text-xs font-mono text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Hammer size={12} /> Build
                        </button>
                      </td>
                    )}
                    {canManage && (
                      <td className="p-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteJob(job); }}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <JobDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={fetchJobs} />
      {editJob && <JobDialog open={!!editJob} onOpenChange={o => { if (!o) setEditJob(null); }} onSuccess={fetchJobs} job={editJob} />}

      <AlertDialog open={!!deleteJob} onOpenChange={o => { if (!o) setDeleteJob(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">{deleteJob?.job_id}</span> — {deleteJob?.job_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteJob} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
