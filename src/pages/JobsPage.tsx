import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import JobStatusBadge from "@/components/JobStatusBadge";
import { Plus, Search, Filter } from "lucide-react";
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
  const [jobs, setJobs] = useState<DbJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("jobs")
        .select("*")
        .order("created_date", { ascending: false });
      setJobs(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(
      j =>
        j.job_id.toLowerCase().includes(q) ||
        j.job_name.toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q)
    );
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
        <button className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          New Job
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
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
                  <th className="text-right p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Parts</th>
                  <th className="text-right p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Sheets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(job => (
                  <tr key={job.id} className="hover:bg-secondary/30 transition-colors cursor-pointer">
                    <td className="p-4 font-mono text-sm text-primary">{job.job_id}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{job.job_name}</td>
                    <td className="p-4 text-sm text-muted-foreground hidden sm:table-cell">{job.created_date}</td>
                    <td className="p-4"><JobStatusBadge status={job.status as JobStatus} /></td>
                    <td className="p-4 text-right font-mono text-sm text-foreground">{job.parts_count}</td>
                    <td className="p-4 text-right font-mono text-sm text-muted-foreground hidden md:table-cell">{job.sheets_estimated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
