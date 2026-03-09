import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { insertCabEvent } from "@/lib/cabHelpers";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { GripVertical, Search, Clock } from "lucide-react";
import { differenceInDays } from "date-fns";

/* ─── Stage column definitions ─── */
const COLUMNS = [
  { label: "Enquiry", keys: ["lead_captured"], primary: "lead_captured", color: "border-[hsl(var(--info))]", header: "text-[hsl(var(--info))]" },
  { label: "Ballpark", keys: ["ballpark_sent"], primary: "ballpark_sent", color: "border-[hsl(210,70%,55%)]", header: "text-[hsl(210,70%,55%)]" },
  { label: "Survey", keys: ["appointment_booked", "appointment_requested"], primary: "appointment_booked", color: "border-[hsl(var(--accent))]", header: "text-[hsl(var(--accent))]" },
  { label: "Quoted", keys: ["quote_sent", "quote_viewed"], primary: "quote_sent", color: "border-[hsl(260,50%,55%)]", header: "text-[hsl(260,50%,55%)]" },
  { label: "Deposit", keys: ["awaiting_deposit"], primary: "awaiting_deposit", color: "border-[hsl(var(--warning))]", header: "text-[hsl(var(--warning))]" },
  { label: "Production", keys: ["project_confirmed", "in_production", "materials_ordered", "manufacturing_started", "cabinetry_assembled", "ready_for_installation"], primary: "project_confirmed", color: "border-[hsl(var(--primary))]", header: "text-[hsl(var(--primary))]" },
  { label: "Install", keys: ["install_booked", "installation_complete", "awaiting_signoff"], primary: "install_booked", color: "border-[hsl(160,55%,45%)]", header: "text-[hsl(160,55%,45%)]" },
  { label: "Complete", keys: ["install_completed", "practical_completed", "closed", "closed_paid"], primary: "closed", color: "border-[hsl(var(--success))]", header: "text-[hsl(var(--success))]" },
] as const;

interface JobCard {
  id: string;
  job_ref: string;
  job_title: string;
  current_stage_key: string | null;
  updated_at: string;
  customer_name: string;
  company_id: string;
}

function columnForStage(key: string | null): number {
  if (!key) return 0;
  const idx = COLUMNS.findIndex(c => (c.keys as readonly string[]).includes(key));
  return idx === -1 ? 0 : idx;
}

export default function WorkflowPage() {
  const { cabCompanyId } = useAuth();
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    if (!cabCompanyId) { setLoading(false); return; }

    const { data: jobsData } = await (supabase.from("cab_jobs") as any)
      .select("id, job_ref, job_title, current_stage_key, updated_at, company_id, customer_id")
      .eq("company_id", cabCompanyId)
      .neq("status", "closed")
      .order("updated_at", { ascending: false });

    if (!jobsData || jobsData.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    // Also fetch closed jobs that are in "complete" column stages
    const { data: closedData } = await (supabase.from("cab_jobs") as any)
      .select("id, job_ref, job_title, current_stage_key, updated_at, company_id, customer_id")
      .eq("company_id", cabCompanyId)
      .eq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(20);

    const allJobs = [...(jobsData || []), ...(closedData || [])];

    const customerIds = [...new Set(allJobs.map((j: any) => j.customer_id).filter(Boolean))];
    const { data: customers } = await (supabase.from("cab_customers") as any)
      .select("id, first_name, last_name")
      .in("id", customerIds);

    const custMap = new Map((customers ?? []).map((c: any) => [c.id, `${c.first_name} ${c.last_name}`]));

    setJobs(allJobs.map((j: any) => ({
      id: j.id,
      job_ref: j.job_ref,
      job_title: j.job_title,
      current_stage_key: j.current_stage_key,
      updated_at: j.updated_at,
      customer_name: (custMap.get(j.customer_id) as string) || "",
      company_id: j.company_id,
    })));
    setLoading(false);
  }, [cabCompanyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!searchQuery) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter(j =>
      j.job_ref.toLowerCase().includes(q) ||
      j.job_title.toLowerCase().includes(q) ||
      j.customer_name.toLowerCase().includes(q)
    );
  }, [jobs, searchQuery]);

  const grouped = useMemo(() => {
    const map: Record<number, JobCard[]> = {};
    COLUMNS.forEach((_, i) => { map[i] = []; });
    filtered.forEach(j => {
      const col = columnForStage(j.current_stage_key);
      map[col].push(j);
    });
    return map;
  }, [filtered]);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const destColIdx = parseInt(result.destination.droppableId);
    const jobId = result.draggableId;
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    const fromStage = job.current_stage_key || "lead_captured";
    const toStage = COLUMNS[destColIdx].primary;
    if (fromStage === toStage) return;

    // Optimistic update
    setJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, current_stage_key: toStage, updated_at: new Date().toISOString() } : j
    ));

    try {
      await (supabase.from("cab_jobs") as any)
        .update({ current_stage_key: toStage, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      await insertCabEvent({
        companyId: job.company_id,
        eventType: "stage.moved",
        jobId: job.id,
        payload: { from_stage: fromStage, to_stage: toStage },
      });

      toast({ title: `${job.job_ref} → ${COLUMNS[destColIdx].label}` });
    } catch (err: any) {
      toast({ title: "Error moving job", description: err.message, variant: "destructive" });
      fetchData();
    }
  };

  if (loading) {
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
            {filtered.length} job{filtered.length !== 1 ? "s" : ""} across {COLUMNS.length} stages
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search jobs…"
            className="w-full h-8 pl-8 pr-3 rounded-md border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          {COLUMNS.map((col, colIdx) => {
            const colJobs = grouped[colIdx] || [];
            return (
              <div key={col.label} className="min-w-[220px] w-[220px] flex-shrink-0 glass-panel rounded-lg overflow-hidden">
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <h3 className={cn("font-mono text-xs font-bold uppercase tracking-wider", col.header)}>
                    {col.label}
                  </h3>
                  <span className="text-[10px] font-mono text-muted-foreground">{colJobs.length}</span>
                </div>

                <Droppable droppableId={String(colIdx)}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "p-2 space-y-2 min-h-[120px] transition-colors",
                        snapshot.isDraggingOver && "bg-primary/5"
                      )}
                    >
                      {colJobs.map((job, index) => {
                        const daysSinceUpdate = differenceInDays(new Date(), new Date(job.updated_at));

                        return (
                          <Draggable key={job.id} draggableId={job.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "rounded-md border-l-2 bg-card p-3 transition-shadow",
                                  col.color,
                                  snapshot.isDragging && "shadow-lg shadow-primary/10 ring-1 ring-primary/20"
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  <div {...provided.dragHandleProps} className="mt-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab">
                                    <GripVertical size={14} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-mono text-xs font-bold text-primary">{job.job_ref}</span>
                                    <p className="text-xs text-foreground leading-tight truncate mt-0.5">{job.job_title}</p>
                                    {job.customer_name && (
                                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{job.customer_name}</p>
                                    )}
                                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                                      <Clock size={9} />
                                      <span>{daysSinceUpdate === 0 ? "Today" : `${daysSinceUpdate}d ago`}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {colJobs.length === 0 && (
                        <p className="text-center text-[10px] text-muted-foreground/50 py-4 font-mono">Empty</p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
