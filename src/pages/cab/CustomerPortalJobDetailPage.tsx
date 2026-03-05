import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { getMilestoneIndex, PORTAL_MILESTONES, insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import {
  ShieldCheck, ArrowLeft, LogOut, CheckCircle2, Circle, Clock, Banknote, Lock, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

async function getPortalCustomer(userId: string, email: string) {
  const { data: link } = await (supabase.from("cab_customer_auth_links" as any) as any)
    .select("customer_id")
    .eq("auth_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (link) {
    const { data } = await (supabase.from("cab_customers") as any)
      .select("id, company_id, first_name, last_name")
      .eq("id", link.customer_id)
      .single();
    return data;
  }
  const { data } = await (supabase.from("cab_customers") as any)
    .select("id, company_id, first_name, last_name")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  return data;
}

export default function CustomerPortalJobDetailPage() {
  const { jobRef } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/portal/login"); return; }

    const customer = await getPortalCustomer(user.id, user.email!);
    if (!customer) { navigate("/portal/login"); return; }

    const { data: jobData } = await (supabase.from("cab_jobs") as any)
      .select("*")
      .eq("customer_id", customer.id)
      .eq("job_ref", jobRef)
      .single();

    if (!jobData) { setLoading(false); return; }
    setJob(jobData);

    const [quotesRes, invoicesRes] = await Promise.all([
      (supabase.from("cab_quotes") as any).select("*").eq("job_id", jobData.id).order("version", { ascending: false }),
      (supabase.from("cab_invoices") as any).select("*").eq("job_id", jobData.id).order("created_at"),
    ]);

    setQuotes(quotesRes.data ?? []);
    setInvoices(invoicesRes.data ?? []);

    // Track quote view (dedupe: 1 per day)
    const latestQuote = (quotesRes.data ?? [])[0];
    if (latestQuote && latestQuote.status === "sent") {
      const today = new Date().toISOString().split("T")[0];
      const { data: existingView } = await (supabase.from("cab_quote_views") as any)
        .select("id")
        .eq("quote_id", latestQuote.id)
        .gte("viewed_at", today + "T00:00:00Z")
        .limit(1)
        .maybeSingle();

      if (!existingView) {
        await (supabase.from("cab_quote_views") as any).insert({
          company_id: customer.company_id,
          quote_id: latestQuote.id,
          job_id: jobData.id,
        });
        await insertCabEvent({
          companyId: customer.company_id,
          eventType: "quote.viewed",
          jobId: jobData.id,
        });
        if (jobData.current_stage_key === "quote_sent") {
          await (supabase.from("cab_jobs") as any)
            .update({ current_stage_key: "quote_viewed" })
            .eq("id", jobData.id);
        }
      }
    }

    setLoading(false);
  }, [jobRef, navigate]);

  useEffect(() => { load(); }, [load]);

  const latestQuote = quotes[0];
  const canAccept = latestQuote?.status === "sent" && acceptTerms;

  const handleAcceptQuote = async () => {
    if (!latestQuote || !job) return;
    setAccepting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const customer = await getPortalCustomer(user!.id, user!.email!);
      if (!customer) throw new Error("Customer not found");

      // Accept quote
      await (supabase.from("cab_quote_acceptances") as any).insert({
        company_id: customer.company_id,
        quote_id: latestQuote.id,
        job_id: job.id,
        accepted_by_name: `${customer.first_name} ${customer.last_name}`,
      });

      await (supabase.from("cab_quotes") as any).update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      }).eq("id", latestQuote.id);

      // Set contract_value from quote max if not already set
      const contractValue = job.contract_value ?? latestQuote.price_max;
      await (supabase.from("cab_jobs") as any).update({
        contract_value: contractValue,
        contract_currency: latestQuote.currency || "GBP",
      }).eq("id", job.id);

      // Insert quote.accepted event
      await insertCabEvent({ companyId: customer.company_id, eventType: "quote.accepted", jobId: job.id });

      // Create deposit invoice (50% of contract_value)
      const depositAmount = Math.round(contractValue * 0.5 * 100) / 100;
      await (supabase.from("cab_invoices") as any).insert({
        company_id: customer.company_id,
        job_id: job.id,
        quote_id: latestQuote.id,
        milestone: "deposit",
        reference: `${job.job_ref}_DEP`,
        amount: depositAmount,
        currency: latestQuote.currency || "GBP",
        status: "due",
        issued_at: new Date().toISOString(),
      });

      await insertCabEvent({
        companyId: customer.company_id,
        eventType: "invoice.created",
        jobId: job.id,
        payload: { milestone: "deposit", amount: depositAmount },
      });

      // Update job state
      const nextAction = new Date();
      nextAction.setDate(nextAction.getDate() + 3);
      await (supabase.from("cab_jobs") as any).update({
        state: "awaiting_deposit_payment",
        current_stage_key: "deposit_due",
        estimated_next_action_at: nextAction.toISOString(),
      }).eq("id", job.id);

      toast({ title: "Quote accepted!", description: "Your deposit invoice has been created." });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center animate-pulse">
          <ShieldCheck size={16} className="text-primary-foreground" />
        </div>
      </div>
    );
  }

  if (!job) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Job not found</div>;
  }

  const milestoneIdx = getMilestoneIndex(job.current_stage_key);
  const contractVal = job.contract_value;

  // Determine payment unlock logic
  const depositUnlocked = ["deposit_due", "awaiting_deposit_payment"].includes(job.current_stage_key) || milestoneIdx >= 0;
  const preinstallUnlocked = milestoneIdx >= PORTAL_MILESTONES.findIndex(m => m.key === "cabinetry_assembled");
  const finalUnlocked = milestoneIdx >= PORTAL_MILESTONES.findIndex(m => m.key === "practical_completed");

  const paymentMilestones = [
    { key: "deposit", label: "Deposit (50%)", unlocked: depositUnlocked },
    { key: "preinstall", label: "Pre-Install (30%)", unlocked: preinstallUnlocked },
    { key: "final", label: "Final (20%)", unlocked: finalUnlocked },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/portal/jobs")} className="h-7 w-7 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground">
              <ArrowLeft size={14} />
            </button>
            <div>
              <span className="font-mono text-xs text-muted-foreground">{job.job_ref}</span>
              <h1 className="font-mono font-bold text-foreground text-sm">{job.job_title}</h1>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Contract summary */}
        {(contractVal || latestQuote) && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-mono text-sm font-bold text-foreground mb-2">Project Value</h2>
            <div className="grid grid-cols-2 gap-4">
              {contractVal && (
                <div>
                  <p className="text-xs text-muted-foreground">Agreed Contract</p>
                  <p className="text-lg font-mono font-bold text-foreground">£{Number(contractVal).toLocaleString()}</p>
                </div>
              )}
              {latestQuote && (
                <div>
                  <p className="text-xs text-muted-foreground">Quote Range</p>
                  <p className="text-sm font-mono text-muted-foreground">
                    £{latestQuote.price_min?.toLocaleString()} – £{latestQuote.price_max?.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-mono text-sm font-bold text-foreground mb-4">Project Timeline</h2>
          <div className="space-y-2">
            {PORTAL_MILESTONES.map((m, idx) => {
              const isDone = idx < milestoneIdx;
              const isCurrent = idx === milestoneIdx;
              return (
                <div key={m.key} className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-all",
                  isDone ? "border-primary/30 bg-primary/5" :
                  isCurrent ? "border-primary bg-primary/10 shadow-sm" :
                  "border-border bg-card opacity-50"
                )}>
                  {isDone ? <CheckCircle2 size={18} className="text-primary shrink-0" /> :
                   isCurrent ? <Clock size={18} className="text-primary shrink-0 animate-pulse" /> :
                   <Circle size={18} className="text-muted-foreground shrink-0" />}
                  <span className={cn("text-sm font-medium", isDone || isCurrent ? "text-foreground" : "text-muted-foreground")}>
                    {m.label}
                  </span>
                  {isCurrent && <Badge variant="default" className="ml-auto text-[10px]">Current</Badge>}
                </div>
              );
            })}
          </div>
          {job.estimated_next_action_at && (
            <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2">
              <Clock size={14} className="text-primary" />
              <span className="text-sm text-foreground">
                Next action expected: <strong>{formatDistanceToNow(new Date(job.estimated_next_action_at), { addSuffix: true })}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Payments */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-mono text-sm font-bold text-foreground mb-3">Payments</h2>
          <div className="space-y-2">
            {paymentMilestones.map(({ key, label, unlocked }) => {
              const inv = invoices.find(i => i.milestone === key);
              const isPaid = inv?.status === "paid";
              const isDue = inv?.status === "due";
              const isLocked = !inv && !unlocked;
              return (
                <div key={key} className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  isPaid ? "border-primary/30 bg-primary/5" :
                  isDue ? "border-amber-500/30 bg-amber-500/5" :
                  "border-border bg-muted/30 opacity-50"
                )}>
                  <div className="flex items-center gap-2">
                    {isPaid ? <CheckCircle2 size={16} className="text-primary" /> :
                     isDue ? <Banknote size={16} className="text-amber-500" /> :
                     <Lock size={16} className="text-muted-foreground" />}
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {inv && <span className="text-sm font-mono">£{Number(inv.amount).toLocaleString()}</span>}
                    <Badge variant={isPaid ? "default" : isDue ? "outline" : "secondary"}>
                      {isPaid ? "Paid" : isDue ? "Due" : "Locked"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quote + Accept */}
        {latestQuote && latestQuote.status === "sent" && (
          <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-4">
            <h2 className="font-mono text-sm font-bold text-foreground">Your Quote</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Price Range</p>
                <p className="text-lg font-mono font-bold text-foreground">
                  £{latestQuote.price_min?.toLocaleString()} – £{latestQuote.price_max?.toLocaleString()}
                </p>
              </div>
              {latestQuote.scope_summary && (
                <div>
                  <p className="text-xs text-muted-foreground">Scope</p>
                  <p className="text-sm text-foreground">{latestQuote.scope_summary}</p>
                </div>
              )}
            </div>
            {latestQuote.document_url && (
              <a href={latestQuote.document_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <FileText size={14} /> View Full Quote Document
              </a>
            )}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} />
                <span className="text-sm text-muted-foreground">I accept the terms and conditions</span>
              </div>
              <Button onClick={handleAcceptQuote} disabled={!canAccept || accepting} className="w-full">
                {accepting ? "Accepting…" : "Accept Quote"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
