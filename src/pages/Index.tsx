import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Wrench, CalendarDays, Recycle, AlertTriangle, ShieldCheck, GraduationCap,
  Clock, TrendingDown, ClipboardCheck, Receipt, Activity, ArrowRight,
  BarChart3, Kanban, Package, Users, Bug,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import JobStatusBadge from "@/components/JobStatusBadge";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useAuth } from "@/contexts/AuthContext";
import { format, differenceInDays } from "date-fns";
import type { JobStatus } from "@/types";

function daysUntilExpiry(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

export default function Dashboard() {
  const { flags } = useFeatureFlags();
  const { profile } = useAuth();
  const [stats, setStats] = useState({ activeJobs: 0, inProgressStages: 0, pendingHolidays: 0, availableRemnants: 0 });
  const [jobs, setJobs] = useState<any[]>([]);
  const [allStages, setAllStages] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [training, setTraining] = useState<any[]>([]);
  const [reviewsData, setReviewsData] = useState<any[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);
  const [overdueBills, setOverdueBills] = useState<any[]>([]);
  const [openIssues, setOpenIssues] = useState(0);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const baseFetches = await Promise.all([
        supabase.from("jobs").select("*").neq("status", "complete").order("created_date", { ascending: false }),
        supabase.from("job_stages").select("*"),
        supabase.from("holiday_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("remnants").select("id").eq("status", "available"),
        supabase.from("file_assets").select("*").eq("status", "active").eq("requires_acknowledgement", true),
        supabase.from("profiles").select("user_id, full_name, department, active").eq("active", true),
        supabase.from("file_read_receipts").select("*"),
        supabase.from("training_records").select("*"),
        supabase.from("reviews").select("*"),
        supabase.from("job_issues").select("id").eq("status", "open"),
      ]);
      const [jobsRes, stagesRes, holidaysRes, remnantsRes, filesRes, profilesRes, receiptsRes, trainingRes, reviewsRes, issuesRes] = baseFetches;

      const today = new Date().toISOString().split("T")[0];
      if (flags.enable_finance) {
        const [invRes, billRes] = await Promise.all([
          supabase.from("invoices").select("id, invoice_number, amount_ex_vat, vat_amount, amount_paid, status, due_date").neq("status", "paid").neq("status", "cancelled"),
          supabase.from("bills").select("id, bill_reference, amount_ex_vat, vat_amount, amount_paid, status, due_date").neq("status", "paid").neq("status", "cancelled"),
        ]);
        setOverdueInvoices((invRes.data ?? []).filter((i: any) => i.due_date < today));
        setOverdueBills((billRes.data ?? []).filter((b: any) => b.due_date < today));
      }

      // Recent activity: last 10 stage updates
      const recentStages = (stagesRes.data ?? [])
        .filter((s: any) => s.status === "Done")
        .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 8);

      const jobMap = new Map((jobsRes.data ?? []).map((j: any) => [j.id, j]));

      setRecentActivity(recentStages.map((s: any) => {
        const job = jobMap.get(s.job_id);
        return { ...s, job_code: job?.job_id || "", job_name: job?.job_name || "" };
      }));

      setJobs(jobsRes.data ?? []);
      setAllStages(stagesRes.data ?? []);
      setHolidays(holidaysRes.data ?? []);
      setFiles(filesRes.data ?? []);
      setProfiles(profilesRes.data ?? []);
      setReceipts(receiptsRes.data ?? []);
      setTraining(trainingRes.data ?? []);
      setReviewsData(reviewsRes.data ?? []);
      setOpenIssues((issuesRes.data ?? []).length);

      const inProgressStages = (stagesRes.data ?? []).filter((s: any) => s.status === "In Progress");
      setStats({
        activeJobs: jobsRes.data?.length ?? 0,
        inProgressStages: inProgressStages.length,
        pendingHolidays: (holidaysRes.data ?? []).filter((h: any) => h.status === "Pending").length,
        availableRemnants: remnantsRes.data?.length ?? 0,
      });
      setLoading(false);
    };
    load();
  }, [flags.enable_finance]);

  // === HR Metrics ===
  const hrMetrics = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const absentToday = holidays.filter(h => h.status === "Approved" && h.start_date <= today && h.end_date >= today).length;
    const totalStaff = profiles.length || 1;
    const absenceRate = Math.round((absentToday / totalStaff) * 100);

    const departments = [...new Set(profiles.map((p: any) => p.department))] as string[];
    const deptCoverage = departments.map(dept => {
      const deptStaff = profiles.filter((p: any) => p.department === dept);
      const deptStaffIds = new Set(deptStaff.map((p: any) => p.user_id));
      const absentInDept = holidays.filter(h => h.status === "Approved" && h.start_date <= today && h.end_date >= today && deptStaffIds.has(h.staff_id)).length;
      const available = deptStaff.length - absentInDept;
      const pct = deptStaff.length > 0 ? Math.round((available / deptStaff.length) * 100) : 100;
      return { dept, total: deptStaff.length, available, absent: absentInDept, pct };
    });

    const expiringCerts = training.filter(t => { const d = daysUntilExpiry(t.expiry_date); return d !== null && d >= 0 && d <= 90; }).length;
    const expiredCerts = training.filter(t => { const d = daysUntilExpiry(t.expiry_date); return d !== null && d < 0; }).length;

    let totalRequired = 0;
    let totalCompliant = 0;
    files.forEach((file: any) => {
      const targetStaff = profiles.filter((p: any) => {
        const deptMatch = !file.mandatory_for_departments?.length || file.mandatory_for_departments.includes(p.department);
        return deptMatch;
      });
      totalRequired += targetStaff.length;
      targetStaff.forEach((p: any) => {
        const receipt = receipts.find((r: any) => r.file_id === file.id && r.staff_id === p.user_id);
        if (receipt && receipt.acknowledged && receipt.file_version_at_read >= file.version) totalCompliant++;
      });
    });
    const compliancePct = totalRequired > 0 ? Math.round((totalCompliant / totalRequired) * 100) : 100;

    return { absenceRate, absentToday, deptCoverage, expiringCerts, expiredCerts, compliancePct };
  }, [holidays, profiles, training, files, receipts]);

  const reviewMetrics = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const overdue = reviewsData.filter(r => r.status === "Scheduled" && r.due_date < today).length;
    const upcoming = reviewsData.filter(r => {
      if (r.status !== "Scheduled") return false;
      const d = Math.ceil((new Date(r.due_date).getTime() - Date.now()) / 86400000);
      return d >= 0 && d <= 14;
    }).length;
    return { overdue, upcoming };
  }, [reviewsData]);

  // Stage progress per job
  const jobStageProgress = useMemo(() => {
    return jobs.slice(0, 5).map(job => {
      const jobStages = allStages.filter(s => s.job_id === job.id);
      const done = jobStages.filter(s => s.status === "Done").length;
      const total = jobStages.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const overdue = jobStages.filter(s => s.due_date && new Date(s.due_date) < new Date() && s.status !== "Done").length;
      return { ...job, stagesDone: done, stagesTotal: total, pct, overdue };
    });
  }, [jobs, allStages]);

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="glass-panel rounded-lg p-4 h-24 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            {greeting}, {profile?.full_name?.split(" ")[0] || "there"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, d MMMM yyyy")} · {stats.activeJobs} active jobs · {stats.inProgressStages} stages running
          </p>
        </div>
        <div className="flex gap-2">
          <QuickLink to="/my-work" icon={ClipboardCheck} label="My Work" />
          <QuickLink to="/workflow" icon={Kanban} label="Workflow" />
          <QuickLink to="/production" icon={Activity} label="Production" />
          <QuickLink to="/reports" icon={BarChart3} label="Reports" />
        </div>
      </div>

      {/* Production Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Active Jobs" value={stats.activeJobs} subtitle="In pipeline" icon={<Wrench size={18} />} variant="primary" />
        <StatCard title="In Progress" value={stats.inProgressStages} subtitle="Stages running" icon={<AlertTriangle size={18} />} variant="warning" />
        <StatCard title="Open Issues" value={openIssues} subtitle="Across all jobs" icon={<Bug size={18} />} variant={openIssues > 0 ? "warning" : "default"} />
        <StatCard title="Remnants" value={stats.availableRemnants} subtitle="Available offcuts" icon={<Recycle size={18} />} variant="accent" />
        <StatCard title="Pending" value={stats.pendingHolidays} subtitle="Holiday requests" icon={<CalendarDays size={18} />} />
      </div>

      {/* HR Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Absence Rate" value={`${hrMetrics.absenceRate}%`} subtitle={`${hrMetrics.absentToday} off today`} icon={<TrendingDown size={18} />} variant={hrMetrics.absenceRate > 20 ? "warning" : "default"} />
        <StatCard title="Compliance" value={`${hrMetrics.compliancePct}%`} subtitle="Doc acknowledgement" icon={<ShieldCheck size={18} />} variant={hrMetrics.compliancePct < 80 ? "warning" : "primary"} />
        <StatCard title="Cert Expiries" value={hrMetrics.expiringCerts + hrMetrics.expiredCerts} subtitle={hrMetrics.expiredCerts > 0 ? `${hrMetrics.expiredCerts} expired` : "Within 90 days"} icon={<GraduationCap size={18} />} variant={hrMetrics.expiredCerts > 0 ? "warning" : "default"} />
        <StatCard title="Reviews Due" value={reviewMetrics.overdue + reviewMetrics.upcoming} subtitle={reviewMetrics.overdue > 0 ? `${reviewMetrics.overdue} overdue` : "Upcoming 14 days"} icon={<ClipboardCheck size={18} />} variant={reviewMetrics.overdue > 0 ? "warning" : "default"} />
      </div>

      {/* Alert banners */}
      {(hrMetrics.expiringCerts > 0 || hrMetrics.expiredCerts > 0) && (
        <AlertBanner
          icon={Clock}
          variant={hrMetrics.expiredCerts > 0 ? "danger" : "warning"}
          link="/training"
          linkLabel="Training →"
        >
          {hrMetrics.expiredCerts > 0 && <span className="font-medium text-destructive">{hrMetrics.expiredCerts} expired certifications</span>}
          {hrMetrics.expiredCerts > 0 && hrMetrics.expiringCerts > 0 && " · "}
          {hrMetrics.expiringCerts > 0 && <span className="font-medium text-warning">{hrMetrics.expiringCerts} expiring within 90 days</span>}
        </AlertBanner>
      )}

      {reviewMetrics.overdue > 0 && (
        <AlertBanner icon={ClipboardCheck} variant="danger" link="/reviews" linkLabel="Reviews →">
          <span className="font-medium text-destructive">{reviewMetrics.overdue} overdue review{reviewMetrics.overdue !== 1 ? "s" : ""}</span>
          {reviewMetrics.upcoming > 0 && <> · <span className="font-medium text-warning">{reviewMetrics.upcoming} due within 14 days</span></>}
        </AlertBanner>
      )}

      {(overdueInvoices.length > 0 || overdueBills.length > 0) && (
        <AlertBanner icon={Receipt} variant="danger" link="/finance" linkLabel="Finance →">
          {overdueInvoices.length > 0 && (
            <span className="font-medium text-destructive">
              {overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? "s" : ""} (£{overdueInvoices.reduce((s: number, i: any) => s + (Number(i.amount_ex_vat) + Number(i.vat_amount) - Number(i.amount_paid || 0)), 0).toLocaleString()})
            </span>
          )}
          {overdueInvoices.length > 0 && overdueBills.length > 0 && " · "}
          {overdueBills.length > 0 && (
            <span className="font-medium text-warning">
              {overdueBills.length} overdue bill{overdueBills.length !== 1 ? "s" : ""} (£{overdueBills.reduce((s: number, b: any) => s + (Number(b.amount_ex_vat) + Number(b.vat_amount) - Number(b.amount_paid || 0)), 0).toLocaleString()})
            </span>
          )}
        </AlertBanner>
      )}

      {/* Main content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Active Jobs with stage progress */}
        <div className="lg:col-span-2 glass-panel rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-mono text-sm font-bold text-foreground">ACTIVE JOBS</h2>
            <Link to="/jobs" className="text-xs text-primary hover:underline font-medium">View all →</Link>
          </div>
          {jobStageProgress.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No active jobs</div>
          ) : (
            <div className="divide-y divide-border">
              {jobStageProgress.map((job: any) => (
                <Link key={job.id} to={`/jobs/${job.id}/builder`} className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors group">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{job.job_id}</span>
                      <JobStatusBadge status={job.status as JobStatus} />
                      {job.overdue > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                          {job.overdue} overdue
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-foreground">{job.job_name}</p>
                    {job.stagesTotal > 0 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <Progress value={job.pct} className="h-1.5 flex-1 max-w-40" />
                        <span className="text-[10px] font-mono text-muted-foreground">{job.stagesDone}/{job.stagesTotal}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4 flex items-center gap-3">
                    <div>
                      <p className="font-mono text-sm text-foreground">{job.parts_count} parts</p>
                      <p className="text-xs text-muted-foreground">{job.materials_count} materials</p>
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <div className="glass-panel rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-mono text-sm font-bold text-foreground">RECENT ACTIVITY</h2>
              <Activity size={14} className="text-muted-foreground" />
            </div>
            {recentActivity.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No recent activity</div>
            ) : (
              <div className="divide-y divide-border">
                {recentActivity.map((item: any) => (
                  <div key={item.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate">{item.stage_name} completed</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 ml-3">
                      {item.job_code} · {format(new Date(item.updated_at), "dd MMM HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Department Coverage */}
          {hrMetrics.deptCoverage.length > 0 && (
            <div className="glass-panel rounded-lg">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-mono text-sm font-bold text-foreground">COVERAGE TODAY</h2>
                <Link to="/whos-in" className="text-xs text-primary hover:underline font-medium">Who's In →</Link>
              </div>
              <div className="p-4 space-y-3">
                {hrMetrics.deptCoverage.map(d => (
                  <div key={d.dept} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-medium text-foreground">{d.dept}</span>
                      <span className={cn("text-[10px] font-mono font-bold", d.pct >= 80 ? "text-primary" : d.pct >= 50 ? "text-warning" : "text-destructive")}>
                        {d.available}/{d.total}
                      </span>
                    </div>
                    <Progress value={d.pct} className="h-1.5" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Holiday Requests */}
          <div className="glass-panel rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-mono text-sm font-bold text-foreground">HOLIDAYS</h2>
              <span className="text-xs text-warning font-mono">{stats.pendingHolidays} pending</span>
            </div>
            {holidays.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No requests</div>
            ) : (
              <div className="divide-y divide-border">
                {holidays.slice(0, 4).map((hr: any) => (
                  <div key={hr.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">{hr.type}</p>
                      <span className={cn_holiday(hr.status)}>{hr.status}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{hr.start_date} → {hr.end_date}</p>
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

// ── Sub-components ──

function QuickLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
      <Icon size={12} />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

function AlertBanner({ icon: Icon, variant, link, linkLabel, children }: { icon: any; variant: "danger" | "warning"; link: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg px-4 py-3 flex items-center gap-3", variant === "danger" ? "bg-destructive/10 border border-destructive/20" : "bg-warning/10 border border-warning/20")}>
      <Icon size={16} className={variant === "danger" ? "text-destructive" : "text-warning"} />
      <span className="text-sm text-foreground flex-1">{children}</span>
      <Link to={link} className="text-xs text-primary hover:underline font-medium shrink-0">{linkLabel}</Link>
    </div>
  );
}

function cn_holiday(status: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium";
  switch (status) {
    case "Approved": return `${base} bg-primary/15 text-primary`;
    case "Pending": return `${base} bg-warning/15 text-warning`;
    case "Rejected": return `${base} bg-destructive/15 text-destructive`;
    default: return `${base} bg-muted text-muted-foreground`;
  }
}
