import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, AlertTriangle, Circle, Calendar, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

interface MyStage {
  id: string;
  job_id: string;
  stage_name: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  job_display?: string;
}

const STATUS_OPTIONS = ["Not Started", "In Progress", "Blocked", "Done"] as const;
const STATUS_ICONS: Record<string, React.ReactNode> = {
  "Not Started": <Circle size={14} className="text-muted-foreground" />,
  "In Progress": <Clock size={14} className="text-primary" />,
  "Blocked": <AlertTriangle size={14} className="text-destructive" />,
  "Done": <CheckCircle2 size={14} className="text-success" />,
};
const STAGE_BADGE: Record<string, string> = {
  Design: "bg-info/15 text-info",
  Programming: "bg-accent/15 text-accent",
  CNC: "bg-primary/15 text-primary",
  Edgebanding: "bg-warning/15 text-warning",
  Assembly: "bg-success/15 text-success",
  Spray: "bg-destructive/15 text-destructive",
  Install: "bg-muted text-muted-foreground",
};

export default function MyWorkPage() {
  const { user } = useAuth();
  const [stages, setStages] = useState<MyStage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;

    // Fetch all stages, then filter client-side for assigned ones
    // (array contains filter via Supabase)
    const { data: stagesData } = await supabase
      .from("job_stages")
      .select("*")
      .contains("assigned_staff_ids", [user.id])
      .order("created_at");

    const jobIds = [...new Set((stagesData ?? []).map(s => s.job_id))];

    let jobMap = new Map<string, string>();
    if (jobIds.length > 0) {
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, job_id, job_name")
        .in("id", jobIds);
      jobMap = new Map((jobsData ?? []).map(j => [j.id, `${j.job_id} — ${j.job_name}`]));
    }

    setStages(
      (stagesData ?? []).map(s => ({
        ...s,
        job_display: jobMap.get(s.job_id) || s.job_id,
      }))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateStatus = async (stageId: string, newStatus: string) => {
    setStages(prev =>
      prev.map(s => (s.id === stageId ? { ...s, status: newStatus } : s))
    );

    const { error } = await supabase
      .from("job_stages")
      .update({ status: newStatus })
      .eq("id", stageId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchData();
    } else {
      toast({ title: "Updated", description: `Status changed to ${newStatus}` });
    }
  };

  const active = stages.filter(s => s.status !== "Done");
  const completed = stages.filter(s => s.status === "Done");

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">My Work</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-panel rounded-lg p-4 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">My Work</h2>
          <p className="text-sm text-muted-foreground">
            {active.length} active · {completed.length} completed
          </p>
        </div>
        <Link
          to="/workflow"
          className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
        >
          Full board <ChevronRight size={12} />
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATUS_OPTIONS.map(status => {
          const count = stages.filter(s => s.status === status).length;
          return (
            <div key={status} className="glass-panel rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                {STATUS_ICONS[status]}
              </div>
              <p className="text-xl font-mono font-bold text-foreground">{count}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{status}</p>
            </div>
          );
        })}
      </div>

      {/* Active tasks */}
      {active.length === 0 ? (
        <div className="glass-panel rounded-lg p-12 text-center">
          <CheckCircle2 size={32} className="mx-auto text-success mb-3" />
          <p className="text-sm text-muted-foreground">No active tasks assigned to you</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Tasks</h3>
          <div className="space-y-2">
            {active.map(stage => (
              <div key={stage.id} className="glass-panel rounded-lg p-4 hover:border-primary/20 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium",
                        STAGE_BADGE[stage.stage_name] || "bg-muted text-muted-foreground"
                      )}>
                        {stage.stage_name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{stage.job_display}</span>
                    </div>
                    {stage.notes && (
                      <p className="text-xs text-muted-foreground/70 mt-1.5">{stage.notes}</p>
                    )}
                    {stage.due_date && (
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                        <Calendar size={10} />
                        <span>Due {stage.due_date}</span>
                      </div>
                    )}
                  </div>
                  <select
                    value={stage.status}
                    onChange={e => updateStatus(stage.id, e.target.value)}
                    className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer min-w-[110px]"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Completed ({completed.length})
          </h3>
          <div className="space-y-2 opacity-60">
            {completed.map(stage => (
              <div key={stage.id} className="glass-panel rounded-lg p-3 flex items-center gap-3">
                <CheckCircle2 size={14} className="text-success shrink-0" />
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium",
                  STAGE_BADGE[stage.stage_name] || "bg-muted text-muted-foreground"
                )}>
                  {stage.stage_name}
                </span>
                <span className="text-xs text-muted-foreground truncate">{stage.job_display}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
