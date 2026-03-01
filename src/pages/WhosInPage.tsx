import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Sun, Palmtree, Stethoscope, GraduationCap, Wrench, HardHat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";

interface Profile {
  user_id: string;
  full_name: string;
  department: string;
}

interface HolidayReq {
  staff_id: string;
  start_date: string;
  end_date: string;
  status: string;
  type: string;
}

interface CalEvent {
  assigned_staff_ids: string[] | null;
  start_datetime: string;
  end_datetime: string;
  event_type: string;
  title: string;
}

interface JobStage {
  assigned_staff_ids: string[] | null;
  status: string;
  stage_name: string;
  job_id: string;
}

type StaffStatus = "working" | "holiday" | "sick" | "training" | "install" | "unknown";

const STATUS_CONFIG: Record<StaffStatus, { label: string; color: string; icon: React.ElementType }> = {
  working: { label: "Working", color: "text-success", icon: HardHat },
  holiday: { label: "Holiday", color: "text-primary", icon: Palmtree },
  sick: { label: "Sick", color: "text-destructive", icon: Stethoscope },
  training: { label: "Training", color: "text-warning", icon: GraduationCap },
  install: { label: "Install", color: "text-accent", icon: Wrench },
  unknown: { label: "Unknown", color: "text-muted-foreground", icon: Users },
};

export default function WhosInPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [holidays, setHolidays] = useState<HolidayReq[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [stages, setStages] = useState<JobStage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [profRes, holRes, evRes, stRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, department").eq("active", true).order("full_name"),
      supabase.from("holiday_requests").select("staff_id, start_date, end_date, status, type"),
      supabase.from("calendar_events").select("assigned_staff_ids, start_datetime, end_datetime, event_type, title"),
      supabase.from("job_stages").select("assigned_staff_ids, status, stage_name, job_id").eq("status", "In Progress"),
    ]);
    setProfiles((profRes.data as Profile[]) ?? []);
    setHolidays((holRes.data as HolidayReq[]) ?? []);
    setEvents((evRes.data as CalEvent[]) ?? []);
    setStages((stRes.data as JobStage[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const today = new Date().toISOString().split("T")[0];
  const nowISO = new Date().toISOString();

  const staffStatuses = useMemo(() => {
    const map = new Map<string, { status: StaffStatus; detail: string }>();

    // Default everyone to working
    profiles.forEach(p => map.set(p.user_id, { status: "working", detail: "" }));

    // Check approved holidays/sick covering today
    holidays.filter(h => h.status === "Approved" && h.start_date <= today && h.end_date >= today).forEach(h => {
      if (h.type === "Sick" || h.type === "Appointment") {
        map.set(h.staff_id, { status: "sick", detail: h.type });
      } else {
        map.set(h.staff_id, { status: "holiday", detail: h.type });
      }
    });

    // Check calendar events for today (training, install)
    events.filter(e => {
      const start = e.start_datetime;
      const end = e.end_datetime;
      return start <= nowISO && end >= nowISO;
    }).forEach(e => {
      const ids = e.assigned_staff_ids ?? [];
      const type = e.event_type?.toLowerCase();
      ids.forEach(id => {
        if (type.includes("training") || type.includes("toolbox")) {
          map.set(id, { status: "training", detail: e.title });
        } else if (type.includes("install")) {
          map.set(id, { status: "install", detail: e.title });
        }
      });
    });

    return map;
  }, [profiles, holidays, events, today, nowISO]);

  const departments = useMemo(() => [...new Set(profiles.map(p => p.department))].sort(), [profiles]);

  const deptData = useMemo(() => {
    return departments.map(dept => {
      const deptStaff = profiles.filter(p => p.department === dept);
      const staffWithStatus = deptStaff.map(p => ({
        ...p,
        ...(staffStatuses.get(p.user_id) || { status: "working" as StaffStatus, detail: "" }),
      }));
      const working = staffWithStatus.filter(s => s.status === "working").length;
      const total = deptStaff.length;
      const coveragePct = total > 0 ? Math.round((working / total) * 100) : 100;
      return { dept, staff: staffWithStatus, working, total, coveragePct };
    });
  }, [departments, profiles, staffStatuses]);

  // Summary counts
  const summary = useMemo(() => {
    const counts: Record<StaffStatus, number> = { working: 0, holiday: 0, sick: 0, training: 0, install: 0, unknown: 0 };
    staffStatuses.forEach(v => counts[v.status]++);
    return counts;
  }, [staffStatuses]);

  // Active job stages for quick links
  const activeStages = useMemo(() => stages.slice(0, 5), [stages]);

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{[1,2,3,4,5].map(i => <div key={i} className="glass-panel rounded-lg p-4 h-20 animate-pulse" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Who's In Today</h2>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(["working", "holiday", "sick", "training", "install"] as StaffStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          return (
            <div key={s} className="glass-panel rounded-lg p-4 flex items-center gap-3">
              <div className={cn("h-9 w-9 rounded-md flex items-center justify-center shrink-0", s === "working" ? "bg-success/15" : s === "holiday" ? "bg-primary/15" : s === "sick" ? "bg-destructive/15" : s === "training" ? "bg-warning/15" : "bg-accent/15")}>
                <Icon size={16} className={cfg.color} />
              </div>
              <div>
                <p className="text-xl font-mono font-bold text-foreground">{summary[s]}</p>
                <p className="text-[10px] font-mono text-muted-foreground tracking-wide uppercase">{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Department boards */}
      <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {deptData.map(dd => (
          <div key={dd.dept} className="glass-panel rounded-lg">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono text-sm font-bold text-foreground">{dd.dept}</h3>
                <span className={cn(
                  "text-xs font-mono font-bold",
                  dd.coveragePct >= 80 ? "text-success" : dd.coveragePct >= 50 ? "text-warning" : "text-destructive"
                )}>{dd.working}/{dd.total} in</span>
              </div>
              <Progress value={dd.coveragePct} className="h-1.5" />
            </div>
            <div className="divide-y divide-border/30">
              {dd.staff.map(s => {
                const cfg = STATUS_CONFIG[s.status];
                const Icon = cfg.icon;
                return (
                  <div key={s.user_id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn("h-2 w-2 rounded-full shrink-0", s.status === "working" ? "bg-success" : s.status === "holiday" ? "bg-primary" : s.status === "sick" ? "bg-destructive" : s.status === "training" ? "bg-warning" : "bg-accent")} />
                      <p className="text-sm text-foreground truncate">{s.full_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <Icon size={12} className={cfg.color} />
                      <span className={cn("text-[10px] font-mono", cfg.color)}>{cfg.label}</span>
                    </div>
                  </div>
                );
              })}
              {dd.staff.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">No staff</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      {activeStages.length > 0 && (
        <div className="glass-panel rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-mono text-sm font-bold text-foreground">ACTIVE JOB STAGES</h3>
            <Link to="/workflow" className="text-xs text-primary hover:underline font-medium">Workflow →</Link>
          </div>
          <div className="divide-y divide-border/30">
            {activeStages.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-foreground">{s.stage_name}</span>
                <span className="text-xs text-muted-foreground font-mono">{(s.assigned_staff_ids ?? []).length} assigned</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
