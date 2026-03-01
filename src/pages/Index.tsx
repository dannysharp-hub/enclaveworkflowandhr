import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wrench, CalendarDays, Recycle, AlertTriangle, ShieldCheck, GraduationCap, Users, Clock, TrendingDown } from "lucide-react";
import StatCard from "@/components/StatCard";
import JobStatusBadge from "@/components/JobStatusBadge";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { JobStatus } from "@/types";

function daysUntilExpiry(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

export default function Dashboard() {
  const [stats, setStats] = useState({ activeJobs: 0, inProgressStages: 0, pendingHolidays: 0, availableRemnants: 0 });
  const [jobs, setJobs] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [jobsRes, stagesRes, holidaysRes, remnantsRes, filesRes, profilesRes, receiptsRes, trainingRes] = await Promise.all([
        supabase.from("jobs").select("*").neq("status", "complete").order("created_date", { ascending: false }),
        supabase.from("job_stages").select("*").eq("status", "In Progress"),
        supabase.from("holiday_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("remnants").select("id").eq("status", "available"),
        supabase.from("file_assets").select("*").eq("status", "active").eq("requires_acknowledgement", true),
        supabase.from("profiles").select("user_id, full_name, department, active").eq("active", true),
        supabase.from("file_read_receipts").select("*"),
        supabase.from("training_records").select("*"),
      ]);

      setJobs(jobsRes.data ?? []);
      setHolidays(holidaysRes.data ?? []);
      setFiles(filesRes.data ?? []);
      setProfiles(profilesRes.data ?? []);
      setReceipts(receiptsRes.data ?? []);
      setTraining(trainingRes.data ?? []);
      setStats({
        activeJobs: jobsRes.data?.length ?? 0,
        inProgressStages: stagesRes.data?.length ?? 0,
        pendingHolidays: (holidaysRes.data ?? []).filter((h: any) => h.status === "Pending").length,
        availableRemnants: remnantsRes.data?.length ?? 0,
      });
      setLoading(false);
    };
    load();
  }, []);

  // === HR Metrics ===
  const hrMetrics = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // Absence rate: approved holidays/sick covering today / total active staff
    const absentToday = holidays.filter(h =>
      h.status === "Approved" && h.start_date <= today && h.end_date >= today
    ).length;
    const totalStaff = profiles.length || 1;
    const absenceRate = Math.round((absentToday / totalStaff) * 100);

    // Department coverage: for each dept, count absent staff today
    const departments = [...new Set(profiles.map((p: any) => p.department))] as string[];
    const deptCoverage = departments.map(dept => {
      const deptStaff = profiles.filter((p: any) => p.department === dept);
      const deptStaffIds = new Set(deptStaff.map((p: any) => p.user_id));
      const absentInDept = holidays.filter(h =>
        h.status === "Approved" && h.start_date <= today && h.end_date >= today && deptStaffIds.has(h.staff_id)
      ).length;
      const available = deptStaff.length - absentInDept;
      const pct = deptStaff.length > 0 ? Math.round((available / deptStaff.length) * 100) : 100;
      return { dept, total: deptStaff.length, available, absent: absentInDept, pct };
    });

    // Certification expiries from training records
    const expiringCerts = training.filter(t => {
      const d = daysUntilExpiry(t.expiry_date);
      return d !== null && d >= 0 && d <= 90;
    }).length;
    const expiredCerts = training.filter(t => {
      const d = daysUntilExpiry(t.expiry_date);
      return d !== null && d < 0;
    }).length;

    // Compliance: for each mandatory file, check acknowledgements
    let totalRequired = 0;
    let totalCompliant = 0;
    files.forEach((file: any) => {
      const targetStaff = profiles.filter((p: any) => {
        const deptMatch = !file.mandatory_for_departments?.length || file.mandatory_for_departments.includes(p.department);
        const roleMatch = !file.mandatory_for_roles?.length; // simplified – role data not in profiles
        return deptMatch && roleMatch;
      });
      totalRequired += targetStaff.length;
      targetStaff.forEach((p: any) => {
        const receipt = receipts.find((r: any) => r.file_id === file.id && r.staff_id === p.user_id);
        if (receipt && receipt.acknowledged && receipt.file_version_at_read >= file.version) {
          totalCompliant++;
        }
      });
    });
    const compliancePct = totalRequired > 0 ? Math.round((totalCompliant / totalRequired) * 100) : 100;

    return { absenceRate, absentToday, deptCoverage, expiringCerts, expiredCerts, compliancePct };
  }, [holidays, profiles, training, files, receipts]);

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="glass-panel rounded-lg p-4 h-24 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Production Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Jobs" value={stats.activeJobs} subtitle="In pipeline" icon={<Wrench size={18} />} variant="primary" />
        <StatCard title="In Progress" value={stats.inProgressStages} subtitle="Stages running" icon={<AlertTriangle size={18} />} variant="warning" />
        <StatCard title="Remnants" value={stats.availableRemnants} subtitle="Available offcuts" icon={<Recycle size={18} />} variant="accent" />
        <StatCard title="Pending" value={stats.pendingHolidays} subtitle="Holiday requests" icon={<CalendarDays size={18} />} />
      </div>

      {/* HR Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Absence Rate" value={`${hrMetrics.absenceRate}%`} subtitle={`${hrMetrics.absentToday} off today`} icon={<TrendingDown size={18} />} variant={hrMetrics.absenceRate > 20 ? "warning" : "default"} />
        <StatCard title="Compliance" value={`${hrMetrics.compliancePct}%`} subtitle="Document acknowledgement" icon={<ShieldCheck size={18} />} variant={hrMetrics.compliancePct < 80 ? "warning" : "primary"} />
        <StatCard title="Cert Expiries" value={hrMetrics.expiringCerts + hrMetrics.expiredCerts} subtitle={hrMetrics.expiredCerts > 0 ? `${hrMetrics.expiredCerts} expired` : "Within 90 days"} icon={<GraduationCap size={18} />} variant={hrMetrics.expiredCerts > 0 ? "warning" : "default"} />
        <StatCard title="Staff Active" value={profiles.length} subtitle={`${hrMetrics.absentToday} absent`} icon={<Users size={18} />} variant="accent" />
      </div>

      {/* Department Coverage */}
      {hrMetrics.deptCoverage.length > 0 && (
        <div className="glass-panel rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-mono text-sm font-bold text-foreground">DEPARTMENT COVERAGE TODAY</h2>
            <Link to="/staff" className="text-xs text-primary hover:underline font-medium">Staff →</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 p-4">
            {hrMetrics.deptCoverage.map(d => (
              <div key={d.dept} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-foreground">{d.dept}</span>
                  <span className={cn(
                    "text-[10px] font-mono font-bold",
                    d.pct >= 80 ? "text-success" : d.pct >= 50 ? "text-warning" : "text-destructive"
                  )}>{d.available}/{d.total}</span>
                </div>
                <Progress value={d.pct} className="h-2" />
                {d.absent > 0 && (
                  <p className="text-[10px] text-muted-foreground">{d.absent} absent</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expiring Certifications */}
      {(hrMetrics.expiringCerts > 0 || hrMetrics.expiredCerts > 0) && (
        <div className={cn(
          "rounded-lg px-4 py-3 flex items-center gap-3",
          hrMetrics.expiredCerts > 0 ? "bg-destructive/10 border border-destructive/20" : "bg-warning/10 border border-warning/20"
        )}>
          <Clock size={16} className={hrMetrics.expiredCerts > 0 ? "text-destructive" : "text-warning"} />
          <span className="text-sm text-foreground">
            {hrMetrics.expiredCerts > 0 && <span className="font-medium text-destructive">{hrMetrics.expiredCerts} expired certifications</span>}
            {hrMetrics.expiredCerts > 0 && hrMetrics.expiringCerts > 0 && " · "}
            {hrMetrics.expiringCerts > 0 && <span className="font-medium text-warning">{hrMetrics.expiringCerts} expiring within 90 days</span>}
          </span>
          <Link to="/training" className="ml-auto text-xs text-primary hover:underline font-medium">View →</Link>
        </div>
      )}

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
              <Link to="/compliance" className="text-xs text-primary hover:underline font-medium">View →</Link>
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
