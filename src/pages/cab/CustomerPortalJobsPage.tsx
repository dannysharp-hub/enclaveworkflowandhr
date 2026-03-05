import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { useCompanyBySlug } from "@/hooks/useCompanyBySlug";
import { getMilestoneIndex, PORTAL_MILESTONES } from "@/lib/cabHelpers";
import { format, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, LogOut, ShieldCheck, Clock } from "lucide-react";

export default function CustomerPortalJobsPage() {
  const { companySlug } = useParams();
  const navigate = useNavigate();
  const { company, loading: companyLoading, error: companyError } = useCompanyBySlug(companySlug);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState("");

  const load = useCallback(async () => {
    if (!company) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate(`/portal/${companySlug}/login`); return; }

    let customer: any = null;
    const { data: profileLink } = await (supabase.from("cab_customer_auth_links" as any) as any)
      .select("customer_id")
      .eq("auth_user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (profileLink) {
      const { data: c } = await (supabase.from("cab_customers") as any)
        .select("id, first_name, last_name, company_id")
        .eq("id", profileLink.customer_id)
        .eq("company_id", company.id)
        .single();
      customer = c;
    } else {
      const { data: c } = await (supabase.from("cab_customers") as any)
        .select("id, first_name, last_name, company_id")
        .eq("email", user.email)
        .eq("company_id", company.id)
        .limit(1)
        .maybeSingle();
      customer = c;
    }

    if (!customer) { setLoading(false); return; }
    setCustomerName(`${customer.first_name} ${customer.last_name}`);

    const { data: jobsData } = await (supabase.from("cab_jobs") as any)
      .select("*")
      .eq("customer_id", customer.id)
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });

    setJobs(jobsData ?? []);
    setLoading(false);
  }, [company, companySlug, navigate]);

  useEffect(() => { if (company) load(); }, [company, load]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate(`/portal/${companySlug}/login`);
  };

  if (companyLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center animate-pulse">
          <ShieldCheck size={16} className="text-primary-foreground" />
        </div>
      </div>
    );
  }

  if (companyError) {
    return <div className="min-h-screen flex items-center justify-center text-destructive">{companyError}</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-primary" />
            <h1 className="font-mono font-bold text-foreground">{company?.name || "Your Projects"}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{customerName}</span>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {jobs.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
            No projects found for your account.
          </div>
        ) : (
          jobs.map(job => {
            const milestoneIdx = getMilestoneIndex(job.current_stage_key);
            const pct = milestoneIdx >= 0 ? Math.round(((milestoneIdx + 1) / PORTAL_MILESTONES.length) * 100) : 0;

            return (
              <div
                key={job.id}
                onClick={() => navigate(`/portal/${companySlug}/job/${job.job_ref}`)}
                className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">{job.job_ref}</span>
                    <h3 className="text-sm font-medium text-foreground">{job.job_title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{job.status}</Badge>
                    <ArrowRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <Progress value={pct} className="h-1.5 mb-2" />
                {job.estimated_next_action_at && (
                  <div className="flex items-center gap-1.5">
                    <Clock size={10} className="text-primary" />
                    <span className="text-[10px] font-mono text-primary">
                      Next action: {formatDistanceToNow(new Date(job.estimated_next_action_at), { addSuffix: true })}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
