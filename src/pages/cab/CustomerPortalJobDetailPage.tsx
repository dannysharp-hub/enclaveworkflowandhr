import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { useCompanyBySlug } from "@/hooks/useCompanyBySlug";
import { getMilestoneIndex, PORTAL_MILESTONES, insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import {
  ShieldCheck, ArrowLeft, LogOut, CheckCircle2, Circle, Clock, Banknote, Lock, FileText, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

async function getPortalCustomer(userId: string, email: string, companyId: string) {
  const { data: link } = await (supabase.from("cab_customer_auth_links" as any) as any)
    .select("customer_id")
    .eq("auth_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (link) {
    const { data } = await (supabase.from("cab_customers") as any)
      .select("id, company_id, first_name, last_name")
      .eq("id", link.customer_id)
      .eq("company_id", companyId)
      .single();
    return data;
  }
  const { data } = await (supabase.from("cab_customers") as any)
    .select("id, company_id, first_name, last_name")
    .eq("email", email)
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
  return data;
}

export default function CustomerPortalJobDetailPage() {
  const { companySlug, jobRef } = useParams();
  const navigate = useNavigate();
  const { company, loading: companyLoading, error: companyError } = useCompanyBySlug(companySlug);
  const [job, setJob] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [quoteItems, setQuoteItems] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [signoffAccepted, setSignoffAccepted] = useState(false);
  const [signingOff, setSigningOff] = useState(false);
  const [customerData, setCustomerData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!company) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate(`/portal/${companySlug}/login`); return; }

    const customer = await getPortalCustomer(user.id, user.email!, company.id);
    if (!customer) { navigate(`/portal/${companySlug}/login`); return; }
    setCustomerId(customer.id);
    setCustomerData(customer);

    const { data: jobData } = await (supabase.from("cab_jobs") as any)
      .select("*")
      .eq("customer_id", customer.id)
      .eq("job_ref", jobRef)
      .single();

    if (!jobData) { setLoading(false); return; }
    setJob(jobData);

    const [quotesRes, invoicesRes, apptRes] = await Promise.all([
      (supabase.from("cab_quotes") as any).select("*").eq("job_id", jobData.id).order("version", { ascending: false }),
      (supabase.from("cab_invoices") as any).select("*").eq("job_id", jobData.id).order("created_at"),
      (supabase.from("cab_appointments") as any).select("*").eq("job_id", jobData.id).eq("status", "booked").order("start_at"),
    ]);

    setQuotes(quotesRes.data ?? []);
    setInvoices(invoicesRes.data ?? []);
    setAppointments(apptRes.data ?? []);

    // Load quote items for the latest quote
    const latestQuote = (quotesRes.data ?? [])[0];
    if (latestQuote) {
      const { data: qItems } = await (supabase.from("cab_quote_items") as any)
        .select("*")
        .eq("quote_id", latestQuote.id)
        .order("sort_order");
      setQuoteItems(qItems ?? []);
    }

    // View tracking: dedupe by day
    if (latestQuote && (latestQuote.status === "sent" || latestQuote.status === "viewed")) {
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
          payload: { quote_id: latestQuote.id },
        });
        // Update status from sent -> viewed
        if (latestQuote.status === "sent") {
          await (supabase.from("cab_quotes") as any)
            .update({ status: "viewed" })
            .eq("id", latestQuote.id);
          await (supabase.from("cab_jobs") as any)
            .update({ current_stage_key: "quote_viewed" })
            .eq("id", jobData.id);
        }
      }
    }

    setLoading(false);
  }, [jobRef, company, companySlug, navigate]);

  useEffect(() => { if (company) load(); }, [company, load]);

  const latestQuote = quotes[0];
  const canAccept = (latestQuote?.status === "sent" || latestQuote?.status === "viewed") && acceptTerms;

  const handleAcceptQuote = async () => {
    if (!latestQuote || !job || !company) return;
    setAccepting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const customer = await getPortalCustomer(user!.id, user!.email!, company.id);
      if (!customer) throw new Error("Customer not found");

      await (supabase.from("cab_quote_acceptances") as any).insert({
        company_id: customer.company_id,
        quote_id: latestQuote.id,
        job_id: job.id,
        accepted_by_name: `${customer.first_name} ${customer.last_name}`,
        terms_version: latestQuote.terms_markdown ? `v${latestQuote.version}` : null,
        terms_url: null,
      });

      await (supabase.from("cab_quotes") as any).update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      }).eq("id", latestQuote.id);

      const contractValue = job.contract_value ?? latestQuote.price_max;
      await (supabase.from("cab_jobs") as any).update({
        contract_value: contractValue,
        contract_currency: latestQuote.currency || "GBP",
      }).eq("id", job.id);

      await insertCabEvent({ companyId: customer.company_id, eventType: "quote.accepted", jobId: job.id, payload: { quote_id: latestQuote.id, contract_value: contractValue } });

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

  if (!job) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Job not found</div>;
  }

  const milestoneIdx = getMilestoneIndex(job.current_stage_key);
  const contractVal = job.contract_value;

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
            <button onClick={() => navigate(`/portal/${companySlug}/jobs`)} className="h-7 w-7 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground">
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
        {/* Ballpark Estimate — only shown after sent */}
        {job.ballpark_sent_at && job.ballpark_min != null && job.ballpark_max != null && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h2 className="font-mono text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              <Banknote size={14} className="text-primary" /> Ballpark Estimate
            </h2>
            <p className="text-2xl font-mono font-bold text-foreground">
              £{Number(job.ballpark_min).toLocaleString()} – £{Number(job.ballpark_max).toLocaleString()}
            </p>
            {job.ballpark_customer_message && (
              <p className="text-sm text-muted-foreground mt-2">{job.ballpark_customer_message}</p>
            )}
            <p className="text-xs text-muted-foreground mt-3 italic">
              Final price confirmed after a design visit and detailed quote.
            </p>
          </div>
        )}

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

        {/* Book your design visit CTA — shown after ballpark sent, before appointment booked */}
        {job.ballpark_sent_at && appointments.length === 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <h2 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
              <Calendar size={14} className="text-primary" /> Book Your Design Visit
            </h2>
            <p className="text-sm text-muted-foreground">
              We'd love to visit your home to discuss the project in detail and finalise the design.
            </p>
            {job.booking_url ? (
              <a
                href={job.booking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Calendar size={14} /> Choose a Date &amp; Time
              </a>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                We'll text you a booking link shortly.
              </p>
            )}
          </div>
        )}

        {appointments.length > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h2 className="font-mono text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              <Calendar size={14} className="text-primary" /> Site Visit Booked
            </h2>
            {appointments.map(appt => (
              <div key={appt.id} className="flex items-center gap-3">
                <div>
                  <p className="text-lg font-mono font-bold text-primary">
                    {format(new Date(appt.start_at), "EEEE d MMMM yyyy")}
                  </p>
                  <p className="text-sm font-mono text-foreground">
                    {format(new Date(appt.start_at), "HH:mm")}
                    {appt.end_at && ` – ${format(new Date(appt.end_at), "HH:mm")}`}
                  </p>
                </div>
                <Badge variant="default" className="ml-auto">Confirmed</Badge>
              </div>
            ))}
          </div>
        )}

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

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-mono text-sm font-bold text-foreground mb-3">Payments</h2>
          <div className="space-y-2">
            {paymentMilestones.map(({ key, label, unlocked }) => {
              const inv = invoices.find(i => i.milestone === key);
              const isPaid = inv?.status === "paid";
              const isDue = inv?.status === "due";
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

        {/* Enhanced Quote Section */}
        {latestQuote && ["sent", "viewed", "accepted"].includes(latestQuote.status) && (
          <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                <FileText size={14} className="text-primary" /> Your Quote
              </h2>
              <div className="flex items-center gap-2">
                <Badge variant={latestQuote.status === "accepted" ? "default" : "secondary"}>
                  {latestQuote.status === "accepted" ? "Accepted" : `v${latestQuote.version}`}
                </Badge>
                {latestQuote.sent_at && (
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(latestQuote.sent_at), "dd MMM yyyy")}
                  </span>
                )}
              </div>
            </div>

            {/* Quote price */}
            <div>
              <p className="text-xs text-muted-foreground">Total Price</p>
              <p className="text-2xl font-mono font-bold text-foreground">
                £{Number(latestQuote.price_max).toLocaleString()}
              </p>
            </div>

            {/* Item breakdown */}
            {quoteItems.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-foreground">Breakdown</p>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 font-medium text-muted-foreground">Item</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Qty</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Price</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quoteItems.map((item: any) => (
                        <tr key={item.id} className="border-t border-border">
                          <td className="p-2">
                            <span className="font-medium text-foreground">{item.name}</span>
                            {item.description && <span className="block text-muted-foreground">{item.description}</span>}
                          </td>
                          <td className="p-2 text-right font-mono text-muted-foreground">{Number(item.qty)}</td>
                          <td className="p-2 text-right font-mono text-muted-foreground">£{Number(item.unit_price).toLocaleString()}</td>
                          <td className="p-2 text-right font-mono font-medium text-foreground">£{(Number(item.qty) * Number(item.unit_price)).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Scope */}
            {(latestQuote.scope_markdown || latestQuote.scope_summary) && (
              <div>
                <p className="text-xs font-bold text-foreground mb-1">Scope of Works</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {latestQuote.scope_markdown || latestQuote.scope_summary}
                </p>
              </div>
            )}

            {latestQuote.document_url && (
              <a href={latestQuote.document_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <FileText size={14} /> View Full Quote Document
              </a>
            )}

            {/* Terms & acceptance */}
            {latestQuote.status !== "accepted" && (
              <div className="border-t border-border pt-4 space-y-3">
                {latestQuote.terms_markdown && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs font-bold text-foreground mb-1">Terms &amp; Conditions</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{latestQuote.terms_markdown}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Checkbox checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} />
                  <span className="text-sm text-muted-foreground">I accept the quote and agree to the terms and conditions</span>
                </div>
                <Button onClick={handleAcceptQuote} disabled={!canAccept || accepting} className="w-full">
                  {accepting ? "Accepting…" : "Accept Quote & Proceed"}
                </Button>
              </div>
            )}

            {latestQuote.status === "accepted" && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-primary" />
                <span className="text-sm text-foreground font-medium">Quote accepted — thank you!</span>
              </div>
            )}
          </div>
        )}

        {/* Customer Sign-Off Card — visible when awaiting_signoff or install_completed_at set */}
        {(job.current_stage_key === 'awaiting_signoff' || (job.install_completed_at && !job.customer_signoff_at)) && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <h2 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 size={14} className="text-primary" /> Confirm Installation
            </h2>
            <p className="text-sm text-muted-foreground">
              Your installation has been completed. Please review the work and confirm you're happy.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox checked={signoffAccepted} onCheckedChange={(v) => setSignoffAccepted(!!v)} />
              <span className="text-sm text-muted-foreground">
                I confirm the installation is complete and I'm happy with the work
              </span>
            </div>
            <Button
              className="w-full"
              disabled={!signoffAccepted || signingOff}
              onClick={async () => {
                setSigningOff(true);
                try {
                  await insertCabEvent({
                    companyId: company!.id,
                    eventType: "customer.signoff.completed",
                    jobId: job.id,
                    payload: {
                      signed_by: customerData ? `${customerData.first_name} ${customerData.last_name}` : "Customer",
                    },
                  });
                  toast({ title: "Thank you!", description: "Your sign-off has been recorded." });
                  load();
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setSigningOff(false);
                }
              }}
            >
              {signingOff ? "Submitting…" : "Confirm & Sign Off"}
            </Button>
          </div>
        )}

        {/* Signed off confirmation */}
        {job.customer_signoff_at && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-foreground">Installation Signed Off</p>
              <p className="text-xs text-muted-foreground">
                Signed off on {format(new Date(job.customer_signoff_at), "dd MMMM yyyy")}
              </p>
            </div>
          </div>
        )}

        {/* Deposit payment instructions */}
        {invoices.some((i: any) => i.milestone === "deposit" && i.status === "due") && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <h2 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
              <Banknote size={14} className="text-amber-500" /> Deposit Payment Due
            </h2>
            {invoices.filter((i: any) => i.milestone === "deposit" && i.status === "due").map((inv: any) => (
              <div key={inv.id}>
                <p className="text-2xl font-mono font-bold text-foreground">£{Number(inv.amount).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Reference: <span className="font-mono">{inv.reference}</span></p>
              </div>
            ))}
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <p className="text-xs font-bold text-foreground">Bank Transfer Details</p>
              <p className="text-xs text-muted-foreground">Please use your job reference as the payment reference.</p>
              <p className="text-xs text-muted-foreground">We'll confirm receipt and begin your project once payment clears.</p>
            </div>
            <Button variant="secondary" disabled className="w-full opacity-60">
              <Banknote size={14} /> Pay Online — Coming Soon
            </Button>
          </div>
        )}

        {/* Project Confirmed message */}
        {invoices.some((i: any) => i.milestone === "deposit" && i.status === "paid") && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-500" />
              <h2 className="font-mono text-sm font-bold text-foreground">Project Confirmed</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Your project has been confirmed and is now moving into production planning.
            </p>
            {invoices.filter((i: any) => i.milestone === "deposit" && i.status === "paid").map((inv: any) => (
              <div key={inv.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Deposit paid: <span className="font-mono font-medium text-foreground">£{Number(inv.amount).toLocaleString()}</span></span>
                {inv.paid_at && <span>on {format(new Date(inv.paid_at), "dd MMM yyyy")}</span>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
