import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wrench, CalendarDays, Recycle, FileText, AlertTriangle } from "lucide-react";
import StatCard from "@/components/StatCard";
import JobStatusBadge from "@/components/JobStatusBadge";
import { Link } from "react-router-dom";
import type { JobStatus } from "@/types";

export default function Dashboard() {
  const [stats, setStats] = useState({
    activeJobs: 0,
    inProgressStages: 0,
    pendingHolidays: 0,
    availableRemnants: 0,
  });
  const [jobs, setJobs] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [jobsRes, stagesRes, holidaysRes, remnantsRes, filesRes] = await Promise.all([
        supabase.from("jobs").select("*").neq("status", "complete").order("created_date", { ascending: false }),
        supabase.from("job_stages").select("*").eq("status", "In Progress"),
        supabase.from("holiday_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("remnants").select("id").eq("status", "available"),
        supabase.from("file_assets").select("*").eq("status", "active").eq("requires_acknowledgement", true),
      ]);

      setJobs(jobsRes.data ?? []);
      setHolidays(holidaysRes.data ?? []);
      setFiles(filesRes.data ?? []);
      setStats({
        activeJobs: jobsRes.data?.length ?? 0,
        inProgressStages: stagesRes.data?.length ?? 0,
        pendingHolidays: (holidaysRes.data ?? []).filter((h: any) => h.status === "Pending").length,
        availableRemnants: remnantsRes.data?.length ?? 0,
      });
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-panel rounded-lg p-4 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Jobs" value={stats.activeJobs} subtitle="In pipeline" icon={<Wrench size={18} />} variant="primary" />
        <StatCard title="In Progress" value={stats.inProgressStages} subtitle="Stages running" icon={<AlertTriangle size={18} />} variant="warning" />
        <StatCard title="Remnants" value={stats.availableRemnants} subtitle="Available offcuts" icon={<Recycle size={18} />} variant="accent" />
        <StatCard title="Pending" value={stats.pendingHolidays} subtitle="Holiday requests" icon={<CalendarDays size={18} />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-mono text-sm font-bold text-foreground">ACTIVE JOBS</h2>
            <Link to="/jobs" className="text-xs text-primary hover:underline font-medium">View all →</Link>
          </div>
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No active jobs</div>
          ) : (
            <div className="divide-y divide-border">
              {jobs.slice(0, 5).map((job: any) => (
                <div key={job.id} className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{job.job_id}</span>
                      <JobStatusBadge status={job.status as JobStatus} />
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-foreground">{job.job_name}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-mono text-sm text-foreground">{job.parts_count} parts</p>
                    <p className="text-xs text-muted-foreground">{job.sheets_estimated} sheets est.</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-mono text-sm font-bold text-foreground">HOLIDAY REQUESTS</h2>
              <span className="text-xs text-warning font-mono">{stats.pendingHolidays} pending</span>
            </div>
            {holidays.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No requests</div>
            ) : (
              <div className="divide-y divide-border">
                {holidays.slice(0, 4).map((hr: any) => (
                  <div key={hr.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">{hr.type}</p>
                      <span className={cn_holiday(hr.status)}>{hr.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {hr.start_date} → {hr.end_date}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-panel rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-mono text-sm font-bold text-foreground">COMPLIANCE</h2>
              <Link to="/documents" className="text-xs text-primary hover:underline font-medium">View →</Link>
            </div>
            {files.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No compliance docs</div>
            ) : (
              <div className="divide-y divide-border">
                {files.slice(0, 3).map((file: any) => (
                  <div key={file.id} className="p-4">
                    <p className="text-sm font-medium text-foreground truncate">{file.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{file.category} · v{file.version}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function cn_holiday(status: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium";
  switch (status) {
    case "Approved": return `${base} bg-success/15 text-success`;
    case "Pending": return `${base} bg-warning/15 text-warning`;
    case "Rejected": return `${base} bg-destructive/15 text-destructive`;
    default: return `${base} bg-muted text-muted-foreground`;
  }
}
