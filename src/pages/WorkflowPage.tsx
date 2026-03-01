import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStageConfig } from "@/hooks/useStageConfig";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { GripVertical, User, Calendar } from "lucide-react";

interface Stage {
  id: string;
  job_id: string;
  stage_name: string;
  status: string;
  assigned_staff_ids: string[] | null;
  due_date: string | null;
  notes: string | null;
  job_display?: string;
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

// Dynamic badge colours based on index
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
  const { userRole } = useAuth();
  const { stages: stageConfig, loading: stagesLoading } = useStageConfig();
  const [jobStages, setJobStages] = useState<Stage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const canManage = userRole === "admin" || userRole === "supervisor" || userRole === "engineer";

  // Build a badge map from stage_config
  const stageBadge = useMemo(() => {
    const map: Record<string, string> = {};
    stageConfig.forEach((sc, i) => {
      map[sc.stage_name] = BADGE_PALETTE[i % BADGE_PALETTE.length];
    });
    return map;
  }, [stageConfig]);

  const fetchData = useCallback(async () => {
    const [stagesRes, jobsRes, profilesRes] = await Promise.all([
      supabase.from("job_stages").select("*").order("created_at"),
      supabase.from("jobs").select("id, job_id, job_name"),
      supabase.from("profiles").select("user_id, full_name"),
    ]);

    const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, `${j.job_id} — ${j.job_name}`]));
    const profMap: Record<string, string> = {};
    (profilesRes.data ?? []).forEach(p => { profMap[p.user_id] = p.full_name; });
    setProfiles(profMap);

    setJobStages(
      (stagesRes.data ?? []).map(s => ({
        ...s,
        job_display: jobMap.get(s.job_id) || s.job_id,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !canManage) return;
    const newStatus = result.destination.droppableId;
    const stageId = result.draggableId;
    const stage = jobStages.find(s => s.id === stageId);
    if (!stage) return;

    // Check machine auth when moving to "In Progress"
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
        toast({
          title: "⚠️ Machine Auth Warning",
          description: warnings.join(" · "),
          variant: "destructive",
        });
      }
    }

    // Optimistic update
    setJobStages(prev =>
      prev.map(s => (s.id === stageId ? { ...s, status: newStatus } : s))
    );

    const { error } = await supabase
      .from("job_stages")
      .update({ status: newStatus })
      .eq("id", stageId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      fetchData();
    }
  };

  const grouped = STATUSES.reduce(
    (acc, status) => {
      acc[status] = jobStages.filter(s => s.status === status);
      return acc;
    },
    {} as Record<string, Stage[]>
  );

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
      <div>
        <h2 className="text-2xl font-mono font-bold text-foreground">Workflow Board</h2>
        <p className="text-sm text-muted-foreground">
          {jobStages.length} stage{jobStages.length !== 1 ? "s" : ""} across {new Set(jobStages.map(s => s.job_id)).size} job{new Set(jobStages.map(s => s.job_id)).size !== 1 ? "s" : ""}
          {stageConfig.length > 0 && ` · ${stageConfig.length} configured stage type${stageConfig.length !== 1 ? "s" : ""}`}
          {!canManage && " · View only"}
        </p>
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
                    {grouped[status].map((stage, index) => (
                      <Draggable
                        key={stage.id}
                        draggableId={stage.id}
                        index={index}
                        isDragDisabled={!canManage}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              "rounded-md border-l-2 bg-card p-3 transition-shadow",
                              STATUS_COLORS[status],
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
                                <span className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium mb-1.5",
                                  stageBadge[stage.stage_name] || "bg-muted text-muted-foreground"
                                )}>
                                  {stage.stage_name}
                                </span>
                                <p className="text-xs text-muted-foreground truncate">
                                  {stage.job_display}
                                </p>
                                {stage.notes && (
                                  <p className="text-[10px] text-muted-foreground/70 mt-1 truncate">
                                    {stage.notes}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-2">
                                  {stage.assigned_staff_ids && stage.assigned_staff_ids.length > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <User size={10} />
                                      <span>
                                        {stage.assigned_staff_ids
                                          .map(id => profiles[id]?.split(" ")[0] || "?")
                                          .join(", ")}
                                      </span>
                                    </div>
                                  )}
                                  {stage.due_date && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Calendar size={10} />
                                      <span>{stage.due_date}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
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
