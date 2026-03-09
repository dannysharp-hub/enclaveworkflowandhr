import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStageConfig } from "@/hooks/useStageConfig";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  GripVertical, User, Calendar, Filter, Search, ChevronDown,
  AlertTriangle, Clock, UserPlus, X,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

interface Stage {
  id: string;
  job_id: string;
  stage_name: string;
  status: string;
  assigned_staff_ids: string[] | null;
  due_date: string | null;
  notes: string | null;
  job_display?: string;
  priority?: number;
}

const STATUSES = ["Not Started", "In Progress", "Blocked", "Done"] as const;
const STATUS_COLORS: Record<string, string> = {
  "Not Started": "border-muted-foreground/30",
  "In Progress": "border-primary",
  "Blocked": "border-destructive",
  "Done": "border-success",
};
const STATUS_HEADER_COLORS: Record<string, string> = {
  "Not Started": "text-muted-foreground",
  "In Progress": "text-primary",
  "Blocked": "text-destructive",
  "Done": "text-success",
};

const BADGE_PALETTE = [
  "bg-info/15 text-info",
  "bg-accent/15 text-accent",
  "bg-primary/15 text-primary",
  "bg-warning/15 text-warning",
  "bg-success/15 text-success",
  "bg-destructive/15 text-destructive",
  "bg-muted text-muted-foreground",
];

export default function WorkflowPage() {
  const { userRole, cabCompanyId } = useAuth();
  const { stages: stageConfig, loading: stagesLoading } = useStageConfig();
  const [jobStages, setJobStages] = useState<Stage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [allStaff, setAllStaff] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [assigningStageId, setAssigningStageId] = useState<string | null>(null);

  const canManage = userRole === "admin" || userRole === "supervisor" || userRole === "engineer";

  const stageBadge = useMemo(() => {
    const map: Record<string, string> = {};
    stageConfig.forEach((sc, i) => {
      map[sc.stage_name] = BADGE_PALETTE[i % BADGE_PALETTE.length];
    });
    return map;
  }, [stageConfig]);

  const fetchData = useCallback(async () => {
    if (!cabCompanyId) { setLoading(false); return; }
    const [stagesRes, jobsRes, profilesRes] = await Promise.all([
      supabase.from("job_stages").select("*").order("created_at"),
      supabase.from("cab_jobs").select("id, job_ref, job_title").eq("company_id", cabCompanyId).neq("status", "closed"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);

    const jobMap = new Map((jobsRes.data ?? []).map((j: any) => [j.id, `${j.job_ref} — ${j.job_title}`]));
    const activeJobIds = new Set((jobsRes.data ?? []).map((j: any) => j.id));
    const profMap: Record<string, string> = {};
    const staffList: { id: string; name: string }[] = [];
    (profilesRes.data ?? []).forEach(p => {
      profMap[p.user_id] = p.full_name;
      staffList.push({ id: p.user_id, name: p.full_name });
    });
    setProfiles(profMap);
    setAllStaff(staffList.sort((a, b) => a.name.localeCompare(b.name)));

    setJobStages(
      (stagesRes.data ?? [])
        .filter(s => activeJobIds.has(s.job_id))
        .map(s => ({
          ...s,
          job_display: jobMap.get(s.job_id) || s.job_id,
        }))
    );
    setLoading(false);
  }, [cabCompanyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !canManage) return;
    const newStatus = result.destination.droppableId;
    const stageId = result.draggableId;
    const stage = jobStages.find(s => s.id === stageId);
    if (!stage) return;

    if (newStatus === "In Progress" && stage.assigned_staff_ids && stage.assigned_staff_ids.length > 0) {
      const warnings: string[] = [];
      for (const staffId of stage.assigned_staff_ids) {
        const { data } = await supabase.rpc("check_staff_stage_authorisation", {
          _staff_id: staffId,
          _stage_name: stage.stage_name,
        });
        const row = data?.[0];
        if (row && !row.authorised) {
          const missing = (row.missing_skills as any[]) ?? [];
          const staffName = profiles[staffId]?.split(" ")[0] || "Staff";
          const skillNames = missing.map((m: any) => `${m.skill_name} (needs ${m.required})`).join(", ");
          warnings.push(`${staffName}: missing ${skillNames}`);
        }
      }
      if (warnings.length > 0) {
        toast({ title: "⚠️ Machine Auth Warning", description: warnings.join(" · "), variant: "destructive" });
      }
    }

    setJobStages(prev => prev.map(s => (s.id === stageId ? { ...s, status: newStatus } : s)));

    const { error } = await supabase.from("job_stages").update({ status: newStatus }).eq("id", stageId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchData();
    }
  };

  const quickAssign = async (stageId: string, staffId: string) => {
    const stage = jobStages.find(s => s.id === stageId);
    if (!stage) return;
    const current = stage.assigned_staff_ids || [];
    if (current.includes(staffId)) return;
    const updated = [...current, staffId];

    setJobStages(prev => prev.map(s => s.id === stageId ? { ...s, assigned_staff_ids: updated } : s));
    setAssigningStageId(null);

    const { error } = await supabase.from("job_stages").update({ assigned_staff_ids: updated }).eq("id", stageId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchData();
    } else {
      toast({ title: "Staff assigned", description: `${profiles[staffId]} assigned` });
    }
  };

  const removeAssignment = async (stageId: string, staffId: string) => {
    const stage = jobStages.find(s => s.id === stageId);
    if (!stage) return;
    const updated = (stage.assigned_staff_ids || []).filter(id => id !== staffId);

    setJobStages(prev => prev.map(s => s.id === stageId ? { ...s, assigned_staff_ids: updated } : s));

    const { error } = await supabase.from("job_stages").update({ assigned_staff_ids: updated }).eq("id", stageId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchData();
    }
  };

  // ── Filtering ──
  const filtered = useMemo(() => {
    let list = [...jobStages];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s =>
        s.job_display?.toLowerCase().includes(q) ||
        s.stage_name.toLowerCase().includes(q) ||
        s.notes?.toLowerCase().includes(q)
      );
    }
    if (filterStage !== "all") list = list.filter(s => s.stage_name === filterStage);
    if (filterStaff !== "all") list = list.filter(s => s.assigned_staff_ids?.includes(filterStaff));

    // Sort: overdue first, then by due date
    const today = new Date().toISOString().split("T")[0];
    list.sort((a, b) => {
      const aOverdue = a.due_date && a.due_date < today && a.status !== "Done" ? -1 : 0;
      const bOverdue = b.due_date && b.due_date < today && b.status !== "Done" ? -1 : 0;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      return 0;
    });

    return list;
  }, [jobStages, searchQuery, filterStage, filterStaff]);

  const grouped = STATUSES.reduce(
    (acc, status) => {
      acc[status] = filtered.filter(s => s.status === status);
      return acc;
    },
    {} as Record<string, Stage[]>
  );

  const stageNames = useMemo(() => [...new Set(jobStages.map(s => s.stage_name))].sort(), [jobStages]);
  const assignedStaffIds = useMemo(() => {
    const ids = new Set<string>();
    jobStages.forEach(s => s.assigned_staff_ids?.forEach(id => ids.add(id)));
    return [...ids];
  }, [jobStages]);

  const today = new Date().toISOString().split("T")[0];
  const overdueCount = jobStages.filter(s => s.due_date && s.due_date < today && s.status !== "Done").length;
  const unassignedCount = jobStages.filter(s => s.status !== "Done" && (!s.assigned_staff_ids || s.assigned_staff_ids.length === 0)).length;

  const isLoading = loading || stagesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">Workflow Board</h2>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-panel rounded-lg p-4 h-64 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Workflow Board</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} stage{filtered.length !== 1 ? "s" : ""} across {new Set(filtered.map(s => s.job_id)).size} jobs
            {overdueCount > 0 && <span className="text-destructive ml-2">· {overdueCount} overdue</span>}
            {unassignedCount > 0 && <span className="text-warning ml-2">· {unassignedCount} unassigned</span>}
            {!canManage && " · View only"}
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search jobs, stages…"
            className="w-full h-8 pl-8 pr-3 rounded-md border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-mono text-foreground hover:bg-secondary/50 transition-colors">
          <Filter size={12} /> Filters <ChevronDown size={12} className={cn("transition-transform", showFilters && "rotate-180")} />
        </button>
        {showFilters && (
          <>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="all">All Stages</option>
              {stageNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="all">All Staff</option>
              {assignedStaffIds.map(id => <option key={id} value={id}>{profiles[id] || id}</option>)}
            </select>
          </>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {STATUSES.map(status => (
            <div key={status} className="glass-panel rounded-lg overflow-hidden">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <h3 className={cn("font-mono text-xs font-bold uppercase tracking-wider", STATUS_HEADER_COLORS[status])}>
                  {status}
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {grouped[status].length}
                </span>
              </div>

              <Droppable droppableId={status} isDropDisabled={!canManage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "p-2 space-y-2 min-h-[120px] transition-colors",
                      snapshot.isDraggingOver && "bg-primary/5"
                    )}
                  >
                    {grouped[status].map((stage, index) => {
                      const isOverdue = stage.due_date && stage.due_date < today && stage.status !== "Done";
                      const daysOverdue = isOverdue ? differenceInDays(new Date(), new Date(stage.due_date!)) : 0;
                      const isUnassigned = !stage.assigned_staff_ids || stage.assigned_staff_ids.length === 0;

                      return (
                        <Draggable key={stage.id} draggableId={stage.id} index={index} isDragDisabled={!canManage}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={cn(
                                "rounded-md border-l-2 bg-card p-3 transition-shadow",
                                isOverdue ? "border-destructive" : STATUS_COLORS[status],
                                snapshot.isDragging && "shadow-lg shadow-primary/10 ring-1 ring-primary/20"
                              )}
                            >
                              <div className="flex items-start gap-2">
                                {canManage && (
                                  <div {...provided.dragHandleProps} className="mt-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab">
                                    <GripVertical size={14} />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <span className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium",
                                      stageBadge[stage.stage_name] || "bg-muted text-muted-foreground"
                                    )}>
                                      {stage.stage_name}
                                    </span>
                                    {isOverdue && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-destructive">
                                        <AlertTriangle size={9} /> {daysOverdue}d late
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {stage.job_display}
                                  </p>
                                  {stage.notes && (
                                    <p className="text-[10px] text-muted-foreground/70 mt-1 truncate">
                                      {stage.notes}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {stage.assigned_staff_ids && stage.assigned_staff_ids.length > 0 ? (
                                      stage.assigned_staff_ids.map(id => (
                                        <span key={id} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted/50 rounded-full px-1.5 py-0.5 group/tag">
                                          <User size={9} />
                                          {profiles[id]?.split(" ")[0] || "?"}
                                          {canManage && (
                                            <button onClick={(e) => { e.stopPropagation(); removeAssignment(stage.id, id); }} className="opacity-0 group-hover/tag:opacity-100 ml-0.5 hover:text-destructive">
                                              <X size={8} />
                                            </button>
                                          )}
                                        </span>
                                      ))
                                    ) : (
                                      status !== "Done" && (
                                        <span className="text-[9px] font-mono text-warning/70 italic">Unassigned</span>
                                      )
                                    )}
                                    {canManage && status !== "Done" && (
                                      <Popover open={assigningStageId === stage.id} onOpenChange={open => setAssigningStageId(open ? stage.id : null)}>
                                        <PopoverTrigger asChild>
                                          <button className="inline-flex items-center gap-0.5 text-[9px] font-mono text-primary/70 hover:text-primary transition-colors" onClick={e => e.stopPropagation()}>
                                            <UserPlus size={10} /> Assign
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-48 p-1" align="start" onClick={e => e.stopPropagation()}>
                                          <div className="max-h-40 overflow-y-auto">
                                            {allStaff.filter(s => !(stage.assigned_staff_ids || []).includes(s.id)).map(s => (
                                              <button
                                                key={s.id}
                                                onClick={() => quickAssign(stage.id, s.id)}
                                                className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-muted/50 rounded-sm transition-colors"
                                              >
                                                {s.name}
                                              </button>
                                            ))}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                    {stage.due_date && (
                                      <div className={cn("flex items-center gap-1 text-[10px] ml-auto", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                                        <Calendar size={10} />
                                        <span>{format(new Date(stage.due_date), "dd MMM")}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                    {grouped[status].length === 0 && (
                      <p className="text-center text-[10px] text-muted-foreground/50 py-4 font-mono">
                        No stages
                      </p>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
