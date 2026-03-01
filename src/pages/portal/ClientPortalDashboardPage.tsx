import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ShieldCheck, Wrench, Clock, CheckCircle2, ArrowRight, LogOut,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ClientJob {
  id: string;
  job_id: string;
  job_name: string;
  status: string;
  stages: { stage_name: string; status: string; due_date: string | null }[];
}

export default function ClientPortalDashboardPage() {
  const navigate = useNavigate();
  const [clientUser, setClientUser] = useState<any>(null);
  const [jobs, setJobs] = useState<ClientJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/portal/login"); return; }

    const { data: cu } = await (supabase.from("client_users") as any)
      .select("id, name, customer_id, tenant_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!cu) { navigate("/portal/login"); return; }
    setClientUser(cu);

    // Log activity
    await (supabase.from("client_activity_log") as any).insert({
      client_user_id: cu.id,
      action: "client_viewed_dashboard",
      tenant_id: cu.tenant_id,
    });

    // Fetch jobs for this customer
    const { data: financials } = await supabase.from("job_financials")
      .select("job_id")
      .eq("customer_id", cu.customer_id);

    const jobIds = (financials ?? []).map((f: any) => f.job_id);
    if (jobIds.length === 0) { setLoading(false); return; }

    const [jobsRes, stagesRes] = await Promise.all([
      supabase.from("jobs").select("id, job_id, job_name, status").in("id", jobIds),
      supabase.from("job_stages").select("job_id, stage_name, status, due_date").in("job_id", jobIds),
    ]);

    const stagesMap = new Map<string, any[]>();
    (stagesRes.data ?? []).forEach((s: any) => {
      const arr = stagesMap.get(s.job_id) || [];
      arr.push(s);
      stagesMap.set(s.job_id, arr);
    });

    setJobs((jobsRes.data ?? []).map((j: any) => ({
      ...j,
      stages: stagesMap.get(j.id) || [],
    })));
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center animate-pulse">
          <ShieldCheck size={16} className="text-primary-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-primary" />
            <h1 className="font-mono font-bold text-foreground">Client Portal</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{clientUser?.name}</span>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        <div>
          <h2 className="text-xl font-mono font-bold text-foreground">Your Projects</h2>
          <p className="text-sm text-muted-foreground">{jobs.length} active project{jobs.length !== 1 ? "s" : ""}</p>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <Wrench size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No projects found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => {
              const done = job.stages.filter(s => s.status === "Done").length;
              const total = job.stages.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const currentStage = job.stages.find(s => s.status === "In Progress");

              return (
                <div
                  key={job.id}
                  onClick={() => navigate(`/portal/job/${job.id}`)}
                  className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">{job.job_id}</span>
                      <h3 className="text-sm font-medium text-foreground">{job.job_name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={job.status} />
                      <ArrowRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="text-[10px] font-mono text-muted-foreground">{pct}%</span>
                  </div>
                  {currentStage && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <Clock size={10} className="text-primary" />
                      <span className="text-[10px] font-mono text-primary">Currently: {currentStage.stage_name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; cls: string }> = {
    draft: { label: "Planning", cls: "bg-muted text-muted-foreground" },
    in_progress: { label: "In Production", cls: "bg-primary/15 text-primary" },
    review: { label: "Review", cls: "bg-warning/15 text-warning" },
    complete: { label: "Complete", cls: "bg-primary/15 text-primary" },
    installed: { label: "Installed", cls: "bg-primary/15 text-primary" },
  };
  const c = configs[status] || configs.draft;
  return (
    <span className={cn("text-[10px] font-mono font-medium px-2 py-0.5 rounded-full", c.cls)}>
      {c.label}
    </span>
  );
}
