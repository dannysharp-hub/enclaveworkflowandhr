import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Wrench, Activity, ArrowRight, BarChart3, Kanban,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import { Link, Navigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { getCabCompanyId } from "@/lib/cabHelpers";

function useLandingRedirect(): string | null {
  const { userRole, loading } = useAuth();
  if (loading) return null;
  switch (userRole) {
    case "supervisor": return "/workflow";
    case "office": return "/production";
    default: return null;
  }
}

function DashboardRouter() {
  const redirect = useLandingRedirect();
  if (redirect) return <Navigate to={redirect} replace />;
  return <DashboardContent />;
}

export default DashboardRouter;

function DashboardContent() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const companyId = await getCabCompanyId();
      if (!companyId) { setLoading(false); return; }

      const [jobsRes, eventsRes] = await Promise.all([
        (supabase.from("cab_jobs") as any)
          .select("*, cab_customers(first_name, last_name)")
          .eq("company_id", companyId)
          .neq("status", "closed")
          .order("created_at", { ascending: false }),
        (supabase.from("cab_events") as any)
          .select("id, event_type, created_at, job_id, payload_json")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      setJobs(jobsRes.data ?? []);
      setRecentEvents(eventsRes.data ?? []);
      setLoading(false);
    };
    load();
  }, []);

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

  const activeJobs = jobs.length;
  const inProduction = jobs.filter(j => ["in_production", "manufacturing"].includes(j.production_stage_key)).length;
  const awaitingInstall = jobs.filter(j => j.production_stage_key === "ready_to_install" || j.production_stage_key === "install").length;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            {greeting}, {profile?.full_name?.split(" ")[0] || "there"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, d MMMM yyyy")} · {activeJobs} active jobs
          </p>
        </div>
        <div className="flex gap-2">
          <QuickLink to="/workflow" icon={Kanban} label="Workflow" />
          <QuickLink to="/admin/production" icon={Activity} label="Production" />
          <QuickLink to="/admin/leads" icon={BarChart3} label="Jobs" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard title="Active Jobs" value={activeJobs} subtitle="In pipeline" icon={<Wrench size={18} />} variant="primary" />
        <StatCard title="In Production" value={inProduction} subtitle="Manufacturing" icon={<Activity size={18} />} variant="warning" />
        <StatCard title="Awaiting Install" value={awaitingInstall} subtitle="Ready / installing" icon={<Wrench size={18} />} variant="accent" />
      </div>

      {/* Main content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Active Jobs list */}
        <div className="lg:col-span-2 glass-panel rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-mono text-sm font-bold text-foreground">ACTIVE JOBS</h2>
            <Link to="/admin/leads" className="text-xs text-primary hover:underline font-medium">View all →</Link>
          </div>
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No active jobs</div>
          ) : (
            <div className="divide-y divide-border">
              {jobs.slice(0, 8).map((job: any) => {
                const customerName = job.cab_customers
                  ? `${job.cab_customers.first_name} ${job.cab_customers.last_name}`
                  : "Unknown";
                return (
                  <Link key={job.id} to={`/admin/jobs/${job.id}`} className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors group">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{job.job_ref}</span>
                        <span className={cn(
                          "text-[10px] font-mono px-1.5 py-0.5 rounded",
                          job.status === "active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {job.production_stage_key?.replace(/_/g, " ") || job.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-foreground">{job.job_title}</p>
                      <p className="text-xs text-muted-foreground">{customerName}</p>
                    </div>
                    <ArrowRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-4" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="space-y-6">
          <div className="glass-panel rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-mono text-sm font-bold text-foreground">RECENT ACTIVITY</h2>
              <Activity size={14} className="text-muted-foreground" />
            </div>
            {recentEvents.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No recent activity</div>
            ) : (
              <div className="divide-y divide-border">
                {recentEvents.map((evt: any) => (
                  <div key={evt.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate">
                        {evt.event_type.replace(/\./g, " · ")}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 ml-3">
                      {format(new Date(evt.created_at), "dd MMM HH:mm")}
                    </p>
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
