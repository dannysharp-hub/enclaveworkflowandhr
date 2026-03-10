import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { deleteCabJob } from "@/lib/cabJobDelete";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import JobStatusBadge from "@/components/JobStatusBadge";
import JobDialog from "@/components/JobDialog";
import { Plus, Search, Hammer, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { JobStatus } from "@/types";

interface DbJob {
  id: string;
  job_ref: string;
  job_title: string;
  created_at: string;
  status: string;
  current_stage_key: string | null;
  contract_value: number | null;
  customer_id: string;
}

export default function JobsPage() {
  const { userRole, cabCompanyId } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<DbJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteJob, setDeleteJob] = useState<DbJob | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = userRole === "admin" || userRole === "engineer" || userRole === "supervisor";

  const fetchJobs = useCallback(async () => {
    if (!cabCompanyId) { setLoading(false); return; }
    const { data } = await supabase
      .from("cab_jobs")
      .select("id, job_ref, job_title, created_at, status, current_stage_key, contract_value, customer_id")
      .eq("company_id", cabCompanyId)
      .order("created_at", { ascending: false });
    setJobs((data as DbJob[]) ?? []);
    setLoading(false);
  }, [cabCompanyId]);

  const handleDeleteJob = useCallback(async () => {
    if (!deleteJob) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("cab_jobs").delete().eq("id", deleteJob.id);
      if (error) throw error;
      toast({ title: "Job deleted", description: `${deleteJob.job_ref} removed` });
      setDeleteJob(null);
      fetchJobs();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  }, [deleteJob, fetchJobs]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const filtered = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(j =>
      j.job_ref.toLowerCase().includes(q) ||
      j.job_title.toLowerCase().includes(q) ||
      j.status.toLowerCase().includes(q)
    );
  }, [jobs, search]);

  const formatCurrency = (val: number | null) =>
    val != null ? `£${val.toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : "—";

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("en-GB"); } catch { return iso; }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Jobs</h2>
          <p className="text-sm text-muted-foreground">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""} · {jobs.filter(j => j.status !== "closed").length} active
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus size={16} /> New Job
            </button>
          )}
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
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Job Ref</th>
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Created</th>
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Stage</th>
                  <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Contract Value</th>
                  {canManage && <th className="p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Build</th>}
                  {canManage && <th className="p-4"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(job => (
                  <tr key={job.id} className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => canManage && navigate(`/admin/jobs/${job.job_ref}`)}>
                    <td className="p-4 font-mono text-sm text-primary">{job.job_ref}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{job.job_title}</td>
                    <td className="p-4 text-sm text-muted-foreground hidden sm:table-cell">{formatDate(job.created_at)}</td>
                    <td className="p-4 text-sm text-muted-foreground">{job.current_stage_key?.replace(/_/g, " ") ?? "—"}</td>
                    <td className="p-4"><JobStatusBadge status={job.status as JobStatus} /></td>
                    <td className="p-4 text-right font-mono text-sm text-foreground hidden md:table-cell">{formatCurrency(job.contract_value)}</td>
                    {canManage && (
                      <td className="p-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/admin/jobs/${job.job_ref}`); }}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <JobDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={fetchJobs} />

      <AlertDialog open={!!deleteJob} onOpenChange={o => { if (!o) setDeleteJob(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">{deleteJob?.job_ref}</span> — {deleteJob?.job_title}? This action cannot be undone.
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
