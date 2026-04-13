import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCabCompanyId, insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Factory, ChevronRight, ChevronLeft, RefreshCw,
} from "lucide-react";
import { buildInvoiceEmailHtml } from "@/lib/invoiceEmailTemplate";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PRODUCTION_COLUMNS = [
  { key: "materials_ordered", label: "Materials Ordered", color: "bg-blue-500" },
  { key: "materials_received", label: "Materials Received", color: "bg-indigo-500" },
  { key: "cnc_prep", label: "CNC Prep", color: "bg-violet-500" },
  { key: "cnc_ready", label: "CNC Ready", color: "bg-purple-500" },
  { key: "assembly", label: "Assembly", color: "bg-sky-500" },
  { key: "qc_check", label: "QC Check", color: "bg-teal-500" },
  { key: "ready_for_install", label: "Ready for Install", color: "bg-emerald-500" },
] as const;

interface ProdCard {
  id: string;
  job_ref: string;
  job_title: string;
  production_stage: string;
  contract_value: number | null;
  company_id: string;
  customer_id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string | null;
  room_type: string | null;
  deposit_received_at: string | null;
}

export default function ProductionBoardPage() {
  const [jobs, setJobs] = useState<ProdCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState<{ job: ProdCard; toKey: string } | null>(null);

  const load = useCallback(async () => {
    const cid = await getCabCompanyId();
    if (!cid) return;

    console.log("[ProductionBoard] company_id:", cid);

    const stageKeys = [
      "materials_ordered",
      "materials_received",
      "cnc_prep",
      "cnc_ready",
      "assembly",
      "qc_check",
      "ready_for_install",
    ];

    const queryDebug = `SELECT id, job_ref, job_title, production_stage, contract_value, company_id, customer_id, room_type, updated_at FROM cab_jobs WHERE company_id = '${cid}' AND (production_stage IS NOT NULL OR current_stage_key IN ('${stageKeys.join("', '")}')) ORDER BY updated_at DESC`;
    console.log("[ProductionBoard] exact query:", queryDebug);

    const { data, error } = await (supabase.from("cab_jobs") as any)
      .select("id, job_ref, job_title, production_stage, production_stage_key, contract_value, company_id, customer_id, room_type, updated_at")
      .eq("company_id", cid)
      .or(`production_stage.not.is.null,production_stage_key.in.(${stageKeys.join(",")}),current_stage_key.in.(${stageKeys.join(",")})`)
      .order("updated_at", { ascending: false });

    console.log("[ProductionBoard] board query result:", { data, error });

    const { data: stageRows, error: stageRowsError } = await (supabase.from("cab_jobs") as any)
      .select("job_ref, current_stage_key, production_stage")
      .eq("company_id", cid)
      .order("updated_at", { ascending: false });

    console.log("[ProductionBoard] stage snapshot by company:", { data: stageRows, error: stageRowsError });
    const debugJob = (stageRows ?? []).find((row: any) => row.job_ref === "009_alistairwood");
    console.log("[ProductionBoard] 009_alistairwood stage values:", debugJob ?? "not found");

    if (!data || data.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    const customerIds = [...new Set(data.map((j: any) => j.customer_id))];
    const { data: customers } = await (supabase.from("cab_customers") as any)
      .select("id, first_name, last_name, email")
      .in("id", customerIds);

    const custMap = new Map((customers ?? []).map((c: any) => [c.id, c]));

    // Get deposit paid dates from events
    const jobIds = data.map((j: any) => j.id);
    const { data: depositEvents } = await (supabase.from("cab_events") as any)
      .select("job_id, created_at")
      .in("job_id", jobIds)
      .eq("event_type", "deposit.paid")
      .order("created_at", { ascending: true });

    const depositMap = new Map((depositEvents ?? []).map((e: any) => [e.job_id, e.created_at]));

    setJobs(data.map((j: any) => {
      const c: any = custMap.get(j.customer_id) || {};
      // Resolve effective production stage: prefer production_stage, fall back to production_stage_key
      const effectiveStage = j.production_stage || (stageKeys.includes(j.production_stage_key) ? j.production_stage_key : null);
      return {
        ...j,
        production_stage: effectiveStage,
        customer_first_name: c.first_name || "",
        customer_last_name: c.last_name || "",
        customer_email: c.email || null,
        deposit_received_at: depositMap.get(j.id) || null,
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const daysSinceDeposit = (dateStr: string | null) => {
    if (!dateStr) return null;
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const moveJob = async (job: ProdCard, direction: 1 | -1) => {
    const currentIdx = PRODUCTION_COLUMNS.findIndex(s => s.key === job.production_stage);
    const newIdx = currentIdx + direction;
    if (newIdx < 0 || newIdx >= PRODUCTION_COLUMNS.length) return;
    const toKey = PRODUCTION_COLUMNS[newIdx].key;

    if (toKey === "ready_for_install") {
      setConfirmMove({ job, toKey });
      return;
    }

    await executeMove(job, toKey);
  };

  const executeMove = async (job: ProdCard, toKey: string) => {
    setMoving(job.id);
    try {
      // Update production_stage
      await (supabase.from("cab_jobs") as any)
        .update({ production_stage: toKey, updated_at: new Date().toISOString() })
        .eq("id", job.id);

      // Insert stage change event
      await insertCabEvent({
        companyId: job.company_id,
        eventType: "production.stage_changed",
        jobId: job.id,
        payload: { from: job.production_stage, to: toKey },
      });

      // If moving to ready_for_install, update current_stage_key and send emails
      if (toKey === "ready_for_install") {
        await (supabase.from("cab_jobs") as any)
          .update({ current_stage_key: "ready_for_install" })
          .eq("id", job.id);

        await insertCabEvent({
          companyId: job.company_id,
          eventType: "job.ready_for_install",
          jobId: job.id,
        });

        // Send customer email
        const paymentDue = job.contract_value ? (job.contract_value * 0.40).toFixed(2) : "0.00";
        const custFullName = `${job.customer_first_name} ${job.customer_last_name}`.trim();

        const customerHtml = await buildInvoiceEmailHtml({
          invoiceNumber: `INS-${job.job_ref}`,
          customerName: custFullName,
          customerFirstName: job.customer_first_name,
          jobRef: job.job_ref,
          jobTitle: job.job_title || job.job_ref,
          milestone: "preinstall",
          amount: Number(paymentDue).toLocaleString("en-GB", { minimumFractionDigits: 2 }),
          paymentReference: `${job.job_ref}-INSTALL`,
        });

        if (job.customer_email) {
          await supabase.functions.invoke("send-email", {
            body: {
              to: job.customer_email,
              subject: `Pre-Install Invoice — Enclave Cabinetry — ${job.job_ref}`,
              html: customerHtml,
              replyTo: "danny@enclavecabinetry.com",
            },
          });
        }

        // Send notification to danny
        const custName = `${job.customer_first_name} ${job.customer_last_name}`.trim();
        await supabase.functions.invoke("send-email", {
          body: {
            to: "danny@enclavecabinetry.com",
            subject: `Ready for Install — ${job.job_ref} — ${custName}`,
            html: `<p>${custName} job ${job.job_ref} is ready for install. Pre-install invoice has been sent.</p><p>Log in to view: <a href="https://enclaveworkflowandhr.lovable.app/admin/leads">https://enclaveworkflowandhr.lovable.app/admin/leads</a></p>`,
          },
        });

        toast({ title: `${job.job_ref} → Ready for Install`, description: "Pre-install invoice email sent" });
      } else {
        const label = PRODUCTION_COLUMNS.find(c => c.key === toKey)?.label || toKey;
        toast({ title: `${job.job_ref} → ${label}` });
      }

      // Optimistic update
      setJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, production_stage: toKey } : j
      ));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setMoving(null);
    }
  };

  const jobsByStage = useMemo(() => {
    const map: Record<string, ProdCard[]> = {};
    PRODUCTION_COLUMNS.forEach(s => { map[s.key] = []; });
    jobs.forEach(j => {
      if (map[j.production_stage]) map[j.production_stage].push(j);
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
        {PRODUCTION_COLUMNS.map((col) => {
          const colJobs = jobsByStage[col.key] || [];
          return (
            <div key={col.key} className="min-w-[220px] w-[220px] flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-2.5 h-2.5 rounded-full", col.color)} />
                <span className="text-xs font-mono font-bold text-foreground uppercase">{col.label}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{colJobs.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[100px] rounded-lg border border-border bg-muted/20 p-2">
                {colJobs.map(job => {
                  const stageIdx = PRODUCTION_COLUMNS.findIndex(s => s.key === job.production_stage);
                  const days = daysSinceDeposit(job.deposit_received_at);
                  return (
                    <div key={job.id} className="rounded-lg border border-border bg-card p-3 space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-primary">{job.job_ref}</span>
                        {job.contract_value != null && (
                          <span className="text-[10px] font-mono text-muted-foreground">£{Number(job.contract_value).toLocaleString()}</span>
                        )}
                      </div>
                      <p className="text-xs text-foreground leading-tight truncate">
                        {job.customer_first_name} {job.customer_last_name}
                      </p>
                      {job.room_type && (
                        <p className="text-[10px] text-muted-foreground truncate">{job.room_type}</p>
                      )}
                      {days !== null && (
                        <p className="text-[10px] font-mono text-muted-foreground">{days}d since deposit</p>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <Button
                          size="sm" variant="ghost" className="h-6 w-6 p-0"
                          disabled={stageIdx === 0 || moving === job.id}
                          onClick={() => moveJob(job, -1)}
                        >
                          <ChevronLeft size={14} />
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-6 w-6 p-0"
                          disabled={stageIdx === PRODUCTION_COLUMNS.length - 1 || moving === job.id}
                          onClick={() => moveJob(job, 1)}
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {colJobs.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm Ready for Install dialog */}
      <AlertDialog open={!!confirmMove} onOpenChange={() => setConfirmMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Ready for Install?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <strong>{confirmMove?.job.job_ref}</strong> as ready for install and send a pre-install invoice email to the customer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (confirmMove) {
                await executeMove(confirmMove.job, confirmMove.toKey);
                setConfirmMove(null);
              }
            }}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
