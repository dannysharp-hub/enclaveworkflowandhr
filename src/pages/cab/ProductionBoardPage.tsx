import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCabCompanyId, insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Factory, ChevronRight, ChevronLeft, RefreshCw, GripVertical,
} from "lucide-react";

const PRODUCTION_STAGES = [
  { key: "ready_for_production", label: "Ready", color: "bg-blue-500" },
  { key: "cnc_machining", label: "CNC", color: "bg-violet-500" },
  { key: "manual_machining", label: "Manual", color: "bg-purple-500" },
  { key: "edge_banding", label: "Edge Band", color: "bg-indigo-500" },
  { key: "assembly", label: "Assembly", color: "bg-sky-500" },
  { key: "packaging", label: "Packaging", color: "bg-teal-500" },
  { key: "ready_for_install", label: "Ready Install", color: "bg-amber-500" },
  { key: "installing", label: "Installing", color: "bg-orange-500" },
  { key: "install_complete", label: "Complete", color: "bg-emerald-500" },
] as const;

interface JobCard {
  id: string;
  job_ref: string;
  job_title: string;
  production_stage_key: string;
  contract_value: number | null;
  estimated_next_action_at: string | null;
  customer_first_name: string;
  customer_last_name: string;
  customer_postcode: string | null;
  company_id: string;
}

export default function ProductionBoardPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cid = await getCabCompanyId();
    if (!cid) return;
    setCompanyId(cid);

    const stageKeys = PRODUCTION_STAGES.map(s => s.key);
    const { data } = await (supabase.from("cab_jobs") as any)
      .select("id, job_ref, job_title, production_stage_key, contract_value, estimated_next_action_at, company_id, customer_id")
      .eq("company_id", cid)
      .in("production_stage_key", stageKeys)
      .order("updated_at", { ascending: false });

    if (!data || data.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    // Fetch customer names
    const customerIds = [...new Set(data.map((j: any) => j.customer_id))];
    const { data: customers } = await (supabase.from("cab_customers") as any)
      .select("id, first_name, last_name, postcode")
      .in("id", customerIds);

    const custMap = new Map((customers ?? []).map((c: any) => [c.id, c]));

    setJobs(data.map((j: any) => {
      const c: any = custMap.get(j.customer_id) || {};
      return {
        ...j,
        customer_first_name: c.first_name || "",
        customer_last_name: c.last_name || "",
        customer_postcode: c.postcode || null,
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const moveJob = async (job: JobCard, direction: 1 | -1) => {
    const currentIdx = PRODUCTION_STAGES.findIndex(s => s.key === job.production_stage_key);
    const newIdx = currentIdx + direction;
    if (newIdx < 0 || newIdx >= PRODUCTION_STAGES.length) return;

    const fromStage = PRODUCTION_STAGES[currentIdx].key;
    const toStage = PRODUCTION_STAGES[newIdx].key;

    setMoving(job.id);
    try {
      await insertCabEvent({
        companyId: job.company_id,
        eventType: "production.stage_changed",
        jobId: job.id,
        payload: { from: fromStage, to: toStage },
      });

      // Also emit specific milestone events
      if (toStage === "cnc_machining") {
        await insertCabEvent({ companyId: job.company_id, eventType: "manufacturing.started", jobId: job.id });
      } else if (toStage === "packaging") {
        await insertCabEvent({ companyId: job.company_id, eventType: "cabinetry.assembled", jobId: job.id });
      } else if (toStage === "ready_for_install") {
        await insertCabEvent({ companyId: job.company_id, eventType: "ready.for_install", jobId: job.id });
      } else if (toStage === "install_complete") {
        await insertCabEvent({ companyId: job.company_id, eventType: "install.complete", jobId: job.id });
      }

      // Optimistic update
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, production_stage_key: toStage } : j
      ));

      toast({ title: `${job.job_ref} → ${PRODUCTION_STAGES[newIdx].label}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setMoving(null);
    }
  };

  const jobsByStage = useMemo(() => {
    const map: Record<string, JobCard[]> = {};
    PRODUCTION_STAGES.forEach(s => { map[s.key] = []; });
    jobs.forEach(j => {
      if (map[j.production_stage_key]) map[j.production_stage_key].push(j);
    });
    return map;
  }, [jobs]);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Factory size={20} /> Production Board
        </h1>
        <Button size="sm" variant="outline" onClick={() => { setLoading(true); load(); }}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {PRODUCTION_STAGES.map((stage) => {
          const stageJobs = jobsByStage[stage.key] || [];
          return (
            <div key={stage.key} className="min-w-[220px] w-[220px] flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-2.5 h-2.5 rounded-full", stage.color)} />
                <span className="text-xs font-mono font-bold text-foreground uppercase">{stage.label}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{stageJobs.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[100px] rounded-lg border border-border bg-muted/20 p-2">
                {stageJobs.map(job => {
                  const stageIdx = PRODUCTION_STAGES.findIndex(s => s.key === job.production_stage_key);
                  return (
                    <div key={job.id} className="rounded-lg border border-border bg-card p-3 space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-primary">{job.job_ref}</span>
                        {job.contract_value && (
                          <span className="text-[10px] font-mono text-muted-foreground">£{Number(job.contract_value).toLocaleString()}</span>
                        )}
                      </div>
                      <p className="text-xs text-foreground leading-tight truncate">{job.job_title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {job.customer_first_name} {job.customer_last_name}
                        {job.customer_postcode && ` · ${job.customer_postcode}`}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <Button
                          size="sm" variant="ghost" className="h-6 w-6 p-0"
                          disabled={stageIdx === 0 || moving === job.id}
                          onClick={() => moveJob(job, -1)}
                        >
                          <ChevronLeft size={14} />
                        </Button>
                        <GripVertical size={12} className="text-muted-foreground" />
                        <Button
                          size="sm" variant="ghost" className="h-6 w-6 p-0"
                          disabled={stageIdx === PRODUCTION_STAGES.length - 1 || moving === job.id}
                          onClick={() => moveJob(job, 1)}
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {stageJobs.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
