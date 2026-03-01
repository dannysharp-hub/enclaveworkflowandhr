import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  CheckCircle2, Clock, AlertTriangle, Circle, Calendar, ChevronRight,
  Palmtree, Bug, Star, Wrench, ClipboardCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { format, differenceInDays, isPast } from "date-fns";

// ── Types ──
interface MyStage {
  id: string;
  job_id: string;
  stage_name: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  job_display?: string;
  job_code?: string;
}

interface MyIssue {
  id: string;
  title: string;
  severity: string;
  status: string;
  job_id: string;
  job_code?: string;
  reported_at: string;
}

interface MyReview {
  id: string;
  title: string;
  review_type: string;
  due_date: string;
  status: string;
}

// ── Constants ──
const STATUS_OPTIONS = ["Not Started", "In Progress", "Blocked", "Done"] as const;
const STATUS_ICONS: Record<string, React.ReactNode> = {
  "Not Started": <Circle size={14} className="text-muted-foreground" />,
  "In Progress": <Clock size={14} className="text-primary" />,
  "Blocked": <AlertTriangle size={14} className="text-destructive" />,
  "Done": <CheckCircle2 size={14} className="text-primary" />,
};
const STAGE_BADGE: Record<string, string> = {
  Design: "bg-info/15 text-info",
  Programming: "bg-accent/15 text-accent",
  CNC: "bg-primary/15 text-primary",
  Edgebanding: "bg-warning/15 text-warning",
  Assembly: "bg-primary/15 text-primary",
  Spray: "bg-destructive/15 text-destructive",
  Install: "bg-muted text-muted-foreground",
};
const SEV_BADGE: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive",
  high: "bg-warning/15 text-warning",
  medium: "bg-accent/15 text-accent-foreground",
  low: "bg-muted text-muted-foreground",
};

export default function MyWorkPage() {
  const { user, profile } = useAuth();
  const [stages, setStages] = useState<MyStage[]>([]);
  const [issues, setIssues] = useState<MyIssue[]>([]);
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [holidayBalance, setHolidayBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const [stagesRes, issuesRes, reviewsRes] = await Promise.all([
      supabase
        .from("job_stages")
        .select("*")
        .contains("assigned_staff_ids", [user.id])
        .order("created_at"),
      supabase
        .from("job_issues")
        .select("id, title, severity, status, job_id, reported_at")
        .eq("assigned_to", user.id)
        .eq("status", "open")
        .order("reported_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("id, title, review_type, due_date, status")
        .eq("staff_id", user.id)
        .in("status", ["Scheduled", "Overdue"])
        .order("due_date"),
    ]);

    // Get job codes
    const allJobIds = new Set<string>();
    (stagesRes.data ?? []).forEach(s => allJobIds.add(s.job_id));
    (issuesRes.data ?? []).forEach(i => allJobIds.add(i.job_id));

    let jobMap = new Map<string, { display: string; code: string }>();
    if (allJobIds.size > 0) {
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, job_id, job_name")
        .in("id", Array.from(allJobIds));
      jobMap = new Map((jobsData ?? []).map(j => [j.id, { display: `${j.job_id} — ${j.job_name}`, code: j.job_id }]));
    }

    setStages(
      (stagesRes.data ?? []).map(s => ({
        ...s,
        job_display: jobMap.get(s.job_id)?.display || s.job_id,
        job_code: jobMap.get(s.job_id)?.code || "",
      }))
    );
    setIssues(
      (issuesRes.data ?? []).map(i => ({
        ...i,
        job_code: jobMap.get(i.job_id)?.code || "",
      })) as MyIssue[]
    );
    setReviews((reviewsRes.data as any[]) ?? []);

    // Holiday balance from profile
    if (profile?.holiday_balance_days !== undefined) {
      setHolidayBalance(profile.holiday_balance_days);
    }

    setLoading(false);
  }, [user, profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateStatus = async (stageId: string, newStatus: string) => {
    setStages(prev => prev.map(s => (s.id === stageId ? { ...s, status: newStatus } : s)));
    const { error } = await supabase.from("job_stages").update({ status: newStatus }).eq("id", stageId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchData();
    } else {
      toast({ title: "Updated", description: `Status → ${newStatus}` });
    }
  };

  const active = stages.filter(s => s.status !== "Done");
  const completed = stages.filter(s => s.status === "Done");
  const overdue = active.filter(s => s.due_date && isPast(new Date(s.due_date)));
  const blocked = active.filter(s => s.status === "Blocked");

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">My Work</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="glass-panel rounded-lg p-4 h-20 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">My Work</h2>
          <p className="text-sm text-muted-foreground">
            {active.length} active · {issues.length} open issue{issues.length !== 1 ? "s" : ""} · {reviews.length} review{reviews.length !== 1 ? "s" : ""} due
          </p>
        </div>
        <Link to="/workflow" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
          Full board <ChevronRight size={12} />
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI icon={Wrench} label="ACTIVE TASKS" value={active.length} />
        <KPI icon={Clock} label="IN PROGRESS" value={active.filter(s => s.status === "In Progress").length} accent />
        <KPI icon={AlertTriangle} label="BLOCKED" value={blocked.length} danger={blocked.length > 0} />
        <KPI icon={Calendar} label="OVERDUE" value={overdue.length} danger={overdue.length > 0} />
        <KPI icon={Bug} label="OPEN ISSUES" value={issues.length} danger={issues.length > 0} />
        <KPI icon={Palmtree} label="HOLIDAY BAL" value={holidayBalance !== null ? `${holidayBalance}d` : "—"} />
      </div>

      {/* Overdue warning */}
      {overdue.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">{overdue.length} overdue stage{overdue.length > 1 ? "s" : ""}</p>
            <p className="text-xs text-destructive/80 mt-0.5">
              {overdue.map(s => `${s.job_code} ${s.stage_name}`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Assigned Issues */}
      {issues.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Bug size={12} /> Assigned Issues ({issues.length})
          </h3>
          <div className="space-y-1.5">
            {issues.map(issue => (
              <Link
                key={issue.id}
                to={`/jobs/${issue.job_id}/builder`}
                className="glass-panel rounded-lg p-3 flex items-center gap-3 hover:border-primary/20 transition-all block"
              >
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium", SEV_BADGE[issue.severity] || "bg-muted text-muted-foreground")}>
                  {issue.severity}
                </span>
                <span className="text-sm text-foreground flex-1 truncate">{issue.title}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{issue.job_code}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Reviews */}
      {reviews.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Star size={12} /> Upcoming Reviews ({reviews.length})
          </h3>
          <div className="space-y-1.5">
            {reviews.map(review => {
              const isOverdue = isPast(new Date(review.due_date));
              return (
                <Link
                  key={review.id}
                  to="/reviews"
                  className="glass-panel rounded-lg p-3 flex items-center gap-3 hover:border-primary/20 transition-all block"
                >
                  <ClipboardCheck size={14} className={isOverdue ? "text-destructive" : "text-primary"} />
                  <span className="text-sm text-foreground flex-1 truncate">{review.title}</span>
                  <span className={cn("text-[10px] font-mono", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                    {isOverdue ? `${differenceInDays(new Date(), new Date(review.due_date))}d overdue` : format(new Date(review.due_date), "dd MMM")}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Active tasks */}
      {active.length === 0 ? (
        <div className="glass-panel rounded-lg p-12 text-center">
          <CheckCircle2 size={32} className="mx-auto text-primary mb-3" />
          <p className="text-sm text-muted-foreground">No active tasks assigned to you</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Tasks</h3>
          <div className="space-y-2">
            {active.map(stage => {
              const isOverdue = stage.due_date && isPast(new Date(stage.due_date));
              return (
                <div key={stage.id} className={cn("glass-panel rounded-lg p-4 hover:border-primary/20 transition-all", isOverdue && "border-destructive/30")}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium", STAGE_BADGE[stage.stage_name] || "bg-muted text-muted-foreground")}>
                          {stage.stage_name}
                        </span>
                        <Link to={`/jobs/${stage.job_id}/builder`} className="text-xs text-muted-foreground truncate hover:text-primary">
                          {stage.job_display}
                        </Link>
                      </div>
                      {stage.notes && <p className="text-xs text-muted-foreground/70 mt-1.5">{stage.notes}</p>}
                      {stage.due_date && (
                        <div className={cn("flex items-center gap-1 mt-1.5 text-[10px]", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                          <Calendar size={10} />
                          <span>
                            {isOverdue
                              ? `Overdue by ${differenceInDays(new Date(), new Date(stage.due_date))} days`
                              : `Due ${format(new Date(stage.due_date), "dd MMM yyyy")}`}
                          </span>
                        </div>
                      )}
                    </div>
                    <select
                      value={stage.status}
                      onChange={e => updateStatus(stage.id, e.target.value)}
                      className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer min-w-[110px]"
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-wider">Completed ({completed.length})</h3>
          <div className="space-y-2 opacity-60">
            {completed.slice(0, 10).map(stage => (
              <div key={stage.id} className="glass-panel rounded-lg p-3 flex items-center gap-3">
                <CheckCircle2 size={14} className="text-primary shrink-0" />
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium", STAGE_BADGE[stage.stage_name] || "bg-muted text-muted-foreground")}>
                  {stage.stage_name}
                </span>
                <span className="text-xs text-muted-foreground truncate">{stage.job_display}</span>
              </div>
            ))}
            {completed.length > 10 && (
              <p className="text-[10px] text-muted-foreground text-center">+ {completed.length - 10} more</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, accent, danger }: { icon: any; label: string; value: string | number; accent?: boolean; danger?: boolean }) {
  return (
    <div className="glass-panel border-border rounded-lg p-3 text-center">
      <Icon size={14} className={danger ? "text-destructive mx-auto mb-1" : accent ? "text-primary mx-auto mb-1" : "text-muted-foreground mx-auto mb-1"} />
      <p className={cn("text-xl font-mono font-bold", danger ? "text-destructive" : accent ? "text-primary" : "text-foreground")}>{value}</p>
      <p className="text-[10px] font-mono text-muted-foreground tracking-wide">{label}</p>
    </div>
  );
}
