import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCabCompanyId } from "@/lib/cabHelpers";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

export default function ProfitWatchPage() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [alertsByJob, setAlertsByJob] = useState<Map<string, any[]>>(new Map());
  const [jobs, setJobs] = useState<Map<string, any>>(new Map());
  const [customers, setCustomers] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => { getCabCompanyId().then(setCompanyId); }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: alerts } = await (supabase.from("cab_job_alerts") as any)
      .select("*").eq("company_id", companyId).eq("is_resolved", false)
      .order("created_at", { ascending: false });

    if (!alerts?.length) {
      setAlertsByJob(new Map());
      setLoading(false);
      return;
    }

    const jobIds = [...new Set(alerts.map((a: any) => a.job_id))];
    const { data: jobRows } = await (supabase.from("cab_jobs") as any)
      .select("id, job_ref, job_title, contract_value, forecast_margin_pct, customer_id")
      .in("id", jobIds);

    const jobMap = new Map((jobRows || []).map((j: any) => [j.id, j]));
    const custIds = [...new Set((jobRows || []).map((j: any) => j.customer_id).filter(Boolean))];
    const { data: custRows } = custIds.length
      ? await (supabase.from("cab_customers") as any).select("id, first_name, last_name").in("id", custIds)
      : { data: [] };
    const custMap = new Map((custRows || []).map((c: any) => [c.id, c]));

    const grouped = new Map<string, any[]>();
    for (const a of alerts) {
      if (!grouped.has(a.job_id)) grouped.set(a.job_id, []);
      grouped.get(a.job_id)!.push(a);
    }

    setJobs(jobMap as Map<string, any>);
    setCustomers(custMap as Map<string, any>);
    setAlertsByJob(grouped);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Sort: critical first, then by date
  const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sortedJobIds = [...alertsByJob.entries()]
    .sort(([, aAlerts], [, bAlerts]) => {
      const aMax = Math.min(...aAlerts.map(a => severityRank[a.severity] ?? 3));
      const bMax = Math.min(...bAlerts.map(a => severityRank[a.severity] ?? 3));
      if (aMax !== bMax) return aMax - bMax;
      return new Date(bAlerts[0].created_at).getTime() - new Date(aAlerts[0].created_at).getTime();
    })
    .map(([jobId]) => jobId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-mono font-bold text-foreground flex items-center gap-2">
          <AlertTriangle size={18} className="text-destructive" /> Profit Watch
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Unresolved profitability alerts across all jobs</p>
      </div>

      {loading ? (
        <div className="h-20 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedJobIds.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <TrendingUp size={24} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-sm text-muted-foreground">No active profit alerts. All jobs are within budget.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedJobIds.map(jobId => {
            const job = jobs.get(jobId);
            const jobAlerts = alertsByJob.get(jobId) || [];
            const customer = job?.customer_id ? customers.get(job.customer_id) : null;
            const highestSeverity = jobAlerts.reduce((h, a) =>
              (severityRank[a.severity] ?? 3) < (severityRank[h] ?? 3) ? a.severity : h, "info");

            return (
              <div
                key={jobId}
                onClick={() => job && navigate(`/admin/jobs/${job.job_ref}`)}
                className="rounded-lg border border-border bg-card p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-foreground">{job?.job_ref || "—"}</span>
                    {customer && (
                      <span className="text-xs text-muted-foreground">{customer.first_name} {customer.last_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {job?.contract_value != null && (
                      <span className="text-xs font-mono text-muted-foreground">£{Number(job.contract_value).toLocaleString()}</span>
                    )}
                    {job?.forecast_margin_pct != null && (
                      <span className={`text-xs font-mono font-bold flex items-center gap-0.5 ${
                        Number(job.forecast_margin_pct) >= 35 ? "text-emerald-600" :
                        Number(job.forecast_margin_pct) >= 25 ? "text-amber-600" : "text-red-600"
                      }`}>
                        {Number(job.forecast_margin_pct) >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {Number(job.forecast_margin_pct).toFixed(1)}%
                      </span>
                    )}
                    <Badge variant={highestSeverity === "critical" ? "destructive" : "outline"} className="text-[9px]">
                      {jobAlerts.length} alert{jobAlerts.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  {jobAlerts.slice(0, 3).map(a => (
                    <p key={a.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        a.severity === "critical" ? "bg-destructive" : a.severity === "warning" ? "bg-amber-500" : "bg-primary"
                      }`} />
                      {a.message}
                    </p>
                  ))}
                  {jobAlerts.length > 3 && (
                    <p className="text-[10px] text-muted-foreground">+{jobAlerts.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
