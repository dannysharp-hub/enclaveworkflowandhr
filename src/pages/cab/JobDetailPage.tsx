import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { getCabCompanyId, getCabCompany, insertCabEvent, estimatePostcodeDistance } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QuoteBuilder from "@/components/QuoteBuilder";
import JobPurchasingTab from "@/components/cab/JobPurchasingTab";
import JobProfitabilityTab from "@/components/cab/JobProfitabilityTab";
import StagePipeline from "@/components/cab/StagePipeline";
import NextActionsPanel from "@/components/cab/NextActionsPanel";
import { format } from "date-fns";
import {
  ArrowLeft, Send, CalendarPlus, FileText, CheckCircle2, Banknote,
  Package, Cog, Hammer, Truck, ClipboardCheck, Star, AlertTriangle, RefreshCw,
  CalendarDays, Calendar, Copy, Factory, ChevronRight, UserPlus, Link, RotateCcw,
  Users, ExternalLink,
} from "lucide-react";


export default function JobDetailPage() {
  const { jobRef } = useParams();
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [lastSyncLogs, setLastSyncLogs] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [emitting, setEmitting] = useState<string | null>(null);
  const [ghlSyncing, setGhlSyncing] = useState(false);
  const [installAssigning, setInstallAssigning] = useState(false);

  const load = useCallback(async () => {
    const cid = await getCabCompanyId();
    if (!cid) return;
    setCompanyId(cid);

    const companyData = await getCabCompany(cid);
    setCompany(companyData);

    const { data: jobData } = await (supabase.from("cab_jobs") as any)
      .select("*")
      .eq("company_id", cid)
      .eq("job_ref", jobRef)
      .single();

    if (!jobData) { navigate("/admin/leads"); return; }
    setJob(jobData);

    const [custRes, quotesRes, invRes, eventsRes, apptRes, teamRes, syncLogRes] = await Promise.all([
      (supabase.from("cab_customers") as any).select("*").eq("id", jobData.customer_id).single(),
      (supabase.from("cab_quotes") as any).select("*").eq("job_id", jobData.id).order("version", { ascending: false }),
      (supabase.from("cab_invoices") as any).select("*").eq("job_id", jobData.id).order("created_at"),
      (supabase.from("cab_events") as any).select("*").eq("job_id", jobData.id).order("created_at", { ascending: false }).limit(20),
      (supabase.from("cab_appointments") as any).select("*").eq("job_id", jobData.id).order("start_at", { ascending: true }),
      (supabase.from("cab_company_memberships") as any).select("user_id, role").eq("company_id", cid),
      (supabase.from("cab_ghl_sync_log") as any).select("*").eq("job_id", jobData.id).order("created_at", { ascending: false }).limit(3),
    ]);

    setCustomer(custRes.data);
    setQuotes(quotesRes.data ?? []);
    setInvoices(invRes.data ?? []);
    setEvents(eventsRes.data ?? []);
    setAppointments(apptRes.data ?? []);
    setTeamMembers(teamRes.data ?? []);
    setLastSyncLogs(syncLogRes.data ?? []);
    setLoading(false);
  }, [jobRef, navigate]);

  useEffect(() => { load(); }, [load]);

  const updateJob = async (updates: Record<string, any>) => {
    await (supabase.from("cab_jobs") as any).update(updates).eq("id", job.id);
  };

  // Ballpark state
  const [ballparkMin, setBallparkMin] = useState("");
  const [ballparkMax, setBallparkMax] = useState("");
  const [ballparkCustomerMsg, setBallparkCustomerMsg] = useState("");
  const [ballparkInternalNotes, setBallparkInternalNotes] = useState("");
  const [ballparkSaving, setBallparkSaving] = useState(false);
  const [ballparkSending, setBallparkSending] = useState(false);

  // Populate ballpark fields when job loads
  useEffect(() => {
    if (job) {
      setBallparkMin(job.ballpark_min?.toString() || "");
      setBallparkMax(job.ballpark_max?.toString() || "");
      setBallparkCustomerMsg(job.ballpark_customer_message || "");
      setBallparkInternalNotes(job.ballpark_internal_notes || "");
    }
  }, [job]);

  const handleSaveBallpark = async () => {
    if (!ballparkMin || !ballparkMax) {
      toast({ title: "Enter min and max values", variant: "destructive" });
      return;
    }
    setBallparkSaving(true);
    try {
      await updateJob({
        ballpark_min: parseFloat(ballparkMin),
        ballpark_max: parseFloat(ballparkMax),
        ballpark_customer_message: ballparkCustomerMsg || null,
        ballpark_internal_notes: ballparkInternalNotes || null,
        ballpark_currency: "GBP",
      });
      await insertCabEvent({
        companyId: companyId!,
        eventType: "ballpark.created",
        jobId: job.id,
        payload: {
          min: parseFloat(ballparkMin),
          max: parseFloat(ballparkMax),
          currency: "GBP",
          customer_message: ballparkCustomerMsg || null,
        },
      });
      toast({ title: "Ballpark saved" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBallparkSaving(false);
    }
  };

  const handleSendBallpark = async () => {
    if (!ballparkMin || !ballparkMax) {
      toast({ title: "Enter min and max prices before sending", variant: "destructive" });
      return;
    }
    setBallparkSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await updateJob({
        ballpark_min: parseFloat(ballparkMin),
        ballpark_max: parseFloat(ballparkMax),
        ballpark_customer_message: ballparkCustomerMsg || null,
        ballpark_internal_notes: ballparkInternalNotes || null,
        ballpark_currency: "GBP",
        ballpark_sent_at: new Date().toISOString(),
        ballpark_sent_by: user?.id || null,
        current_stage_key: "ballpark_sent",
        state: "awaiting_appointment_request",
      });
      await insertCabEvent({
        companyId: companyId!,
        eventType: "ballpark.sent",
        jobId: job.id,
        payload: {
          min: parseFloat(ballparkMin),
          max: parseFloat(ballparkMax),
          currency: "GBP",
          customer_message: ballparkCustomerMsg || null,
        },
      });
      toast({ title: "Ballpark sent to customer", description: "Job moved to awaiting_appointment_request" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBallparkSending(false);
    }
  };

  const APPOINTMENT_ALLOWED_STAGES = ["ballpark_sent", "appointment_requested", "appointment_booked"];

  const handleRequestAppointment = async () => {
    if (!APPOINTMENT_ALLOWED_STAGES.includes(job?.current_stage_key || "")) {
      toast({ title: "Send ballpark first", description: "Appointment booking is only available after a ballpark has been sent.", variant: "destructive" });
      return;
    }
    setEmitting("appointment_request");
    try {
      const settings = company?.settings_json || {};
      const repName = settings.site_visit_rep_name || "Alistair";
      const calId = settings.site_visit_calendar_id || "";

      const jobPostcode = job.property_address_json?.postcode;
      if (jobPostcode && company?.base_postcode && company?.service_radius_miles) {
        const dist = estimatePostcodeDistance(company.base_postcode, jobPostcode);
        if (dist !== null && dist > company.service_radius_miles) {
          await insertCabEvent({
            companyId: companyId!,
            eventType: "appointment.requested_out_of_area",
            jobId: job.id,
            payload: { distance_miles: Math.round(dist), postcode: jobPostcode },
          });
          toast({
            title: "Outside service area",
            description: `${jobPostcode} is ~${Math.round(dist)} miles away (limit: ${company.service_radius_miles}mi). Manual review required.`,
            variant: "destructive",
          });
          load();
          setEmitting(null);
          return;
        }
      }

      const nextAction = new Date();
      nextAction.setDate(nextAction.getDate() + 3);

      const baseUrl = settings.site_visit_booking_url
        || (calId ? `https://api.leadconnectorhq.com/widget/booking/${calId}` : "");
      const bookingUrl = baseUrl
        ? `${baseUrl}?job_ref=${encodeURIComponent(job.job_ref)}`
        : "";

      const { data: { user } } = await supabase.auth.getUser();

      // 1) Update job fields
      await updateJob({
        assigned_rep_name: repName,
        assigned_rep_calendar_id: calId,
        booking_url: bookingUrl || null,
        appointment_requested_at: new Date().toISOString(),
        appointment_requested_by: user?.id || null,
        current_stage_key: "appointment_requested",
        state: "awaiting_appointment_booking",
        estimated_next_action_at: nextAction.toISOString(),
      });
      console.log("[Request Appointment] Job updated:", { bookingUrl, calId, repName, jobRef: job.job_ref });

      // 2) Insert cab_events
      const eventPayload = { rep_name: repName, calendar_id: calId, booking_url: bookingUrl, job_ref: job.job_ref };
      await insertCabEvent({
        companyId: companyId!,
        eventType: "appointment.requested",
        jobId: job.id,
        payload: eventPayload,
      });
      console.log("[Request Appointment] Event inserted:", eventPayload);

      // 3) Auto-trigger GHL sync so the event is processed immediately
      try {
        const syncRes = await supabase.functions.invoke("ghl-worker", {
          body: { company_id: companyId, job_id: job.id },
        });
        console.log("[Request Appointment] GHL sync result:", syncRes.data);
        const syncData = syncRes.data || {};
        toast({
          title: "Appointment requested & synced to GHL",
          description: `Processed: ${syncData.processed || 0}, Errors: ${syncData.errors || 0}`,
        });
      } catch (syncErr: any) {
        console.error("[Request Appointment] GHL sync failed:", syncErr);
        toast({ title: "Event created but GHL sync failed", description: syncErr.message, variant: "destructive" });
      }

      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEmitting(null);
    }
  };

  const handleMarkDepositPaid = async (invoiceId: string, method: string) => {
    if (method === "stripe") {
      toast({ title: "Stripe integration coming soon", description: "Use bank transfer for now.", variant: "destructive" });
      return;
    }
    const inv = invoices.find((i: any) => i.id === invoiceId);
    if (!inv) return;

    await (supabase.from("cab_invoices") as any).update({
      status: "paid", paid_at: new Date().toISOString(), payment_method: method,
    }).eq("id", invoiceId);

    await (supabase.from("cab_payments") as any).insert({
      company_id: companyId!,
      invoice_id: invoiceId,
      job_id: job.id,
      method,
      amount: inv.amount,
    });

    // Emit invoice.paid (triggers DB state machine) + deposit.paid for GHL
    await insertCabEvent({
      companyId: companyId!, eventType: "invoice.paid", jobId: job.id,
      payload: { milestone: inv.milestone, method, invoice_id: invoiceId, amount: inv.amount },
    });

    if (inv.milestone === "deposit") {
      await insertCabEvent({
        companyId: companyId!, eventType: "deposit.paid", jobId: job.id,
        payload: { invoice_id: invoiceId, amount: inv.amount, method, job_ref: job.job_ref },
      });
    }

    toast({ title: "Payment recorded" });
    load();
  };


  const handleSendBookingLink = async () => {
    if (!APPOINTMENT_ALLOWED_STAGES.includes(job?.current_stage_key || "")) {
      toast({ title: "Send ballpark first", description: "Booking link can only be sent after a ballpark has been sent.", variant: "destructive" });
      return;
    }
    setEmitting("booking_link");
    try {
      const calId = job.assigned_rep_calendar_id || company?.settings_json?.site_visit_calendar_id || "";
      const bookingUrl = calId
        ? `https://updates.physio-leads.com/widget/booking/${calId}?job_ref=${encodeURIComponent(job.job_ref)}`
        : "";

      await insertCabEvent({
        companyId: companyId!,
        eventType: "appointment.requested",
        jobId: job.id,
        payload: {
          rep_name: job.assigned_rep_name || company?.settings_json?.site_visit_rep_name || "Alistair",
          calendar_id: calId,
          booking_url: bookingUrl,
          job_ref: job.job_ref,
          test: true,
        },
      });
      toast({ title: "Booking link event emitted — GHL workflow will send SMS" });
      await new Promise(r => setTimeout(r, 300));
      await load();
    } finally {
      setEmitting(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const stageKey = job?.current_stage_key;
  const settings = company?.settings_json || {};
  const nextAppointment = appointments.find(a => a.status === "booked" && new Date(a.start_at) > new Date());

  const CONFIRMED_STAGES = ["project_confirmed", "materials_ordered", "manufacturing_started", "cabinetry_assembled", "ready_for_installation", "install_booked", "installation_complete", "practical_completed", "closed_paid"];
  const isProjectConfirmed = CONFIRMED_STAGES.includes(stageKey || "");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/leads")}><ArrowLeft size={16} /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{job.job_ref}</span>
            <Badge variant="outline">{job.status}</Badge>
            <Badge variant="secondary" className="text-[10px]">{stageKey?.replace(/_/g, " ")}</Badge>
            {job.contract_value && (
              <Badge variant="default" className="text-[10px]">£{Number(job.contract_value).toLocaleString()}</Badge>
            )}
            {isProjectConfirmed && (
              <Badge className="text-[10px] bg-emerald-600 text-white">PROJECT CONFIRMED</Badge>
            )}
            {events.some((e: any) => e.event_type === "lead.resubmitted") && (
              <Badge className="text-[10px] bg-amber-500 text-white">REUSED LEAD</Badge>
            )}
            {events.some((e: any) => e.event_type === "lead.possible_duplicate") && (
              <Badge variant="destructive" className="text-[10px]">⚠ POSSIBLE DUPLICATE</Badge>
            )}
          </div>
          <h1 className="text-xl font-bold text-foreground">{job.job_title}</h1>
          {(job.ghl_contact_id || job.ghl_opportunity_id) && (
            <div className="flex gap-2 mt-1 flex-wrap">
              {job.ghl_contact_id && <span className="text-[10px] font-mono text-muted-foreground">GHL Contact: {job.ghl_contact_id}</span>}
              {job.ghl_opportunity_id && <span className="text-[10px] font-mono text-muted-foreground">GHL Opp: {job.ghl_opportunity_id}</span>}
            </div>
          )}
        </div>
      </div>

      <StagePipeline currentStageKey={stageKey} />
      <NextActionsPanel
        job={job}
        companyId={companyId!}
        stageKey={stageKey}
        onRefresh={load}
        onRequestAppointment={handleRequestAppointment}
        emitting={emitting}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-mono text-sm font-bold text-foreground mb-2">Customer</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Name:</span> {customer?.first_name} {customer?.last_name}</div>
              <div><span className="text-muted-foreground">Phone:</span> {customer?.phone || "—"}</div>
              <div><span className="text-muted-foreground">Email:</span> {customer?.email || "—"}</div>
              <div><span className="text-muted-foreground">Postcode:</span> {customer?.postcode || "—"}</div>
            </div>
          </div>

          {/* Property */}
          {job.property_address_json && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-mono text-sm font-bold text-foreground mb-2">Property</h3>
              <p className="text-sm text-muted-foreground">
                {job.property_address_json.address} {job.property_address_json.postcode}
              </p>
              {job.room_type && <p className="text-sm mt-1"><span className="text-muted-foreground">Room:</span> {job.room_type}</p>}
            </div>
          )}

          {/* Appointments */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
              <Calendar size={14} className="text-primary" /> Appointments
            </h3>
            {appointments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No appointments booked yet.</p>
            ) : (
              <div className="space-y-2">
                {appointments.map(appt => (
                  <div key={appt.id} className="flex items-center justify-between p-2 rounded border border-border">
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {format(new Date(appt.start_at), "EEEE d MMMM yyyy 'at' HH:mm")}
                      </span>
                      {appt.end_at && (
                        <span className="text-xs text-muted-foreground ml-2">
                          – {format(new Date(appt.end_at), "HH:mm")}
                        </span>
                      )}
                      <span className="block text-[10px] font-mono text-muted-foreground capitalize">{appt.type}</span>
                    </div>
                    <Badge variant={appt.status === "booked" ? "default" : appt.status === "completed" ? "secondary" : "outline"}>
                      {appt.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            {nextAppointment && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground">Next site visit</p>
                <p className="text-sm font-mono font-bold text-primary">
                  {format(new Date(nextAppointment.start_at), "EEEE d MMMM yyyy 'at' HH:mm")}
                </p>
              </div>
            )}
          </div>

          {/* Ballpark Card */}
          <div data-section="ballpark" className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                <Banknote size={14} className="text-primary" /> Ballpark Estimate
              </h3>
              {job.ballpark_sent_at && (
                <Badge variant="default" className="text-[10px] gap-1">
                  <CheckCircle2 size={10} /> Sent {format(new Date(job.ballpark_sent_at), "dd MMM HH:mm")}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Min (£) *</Label>
                <Input type="number" step="0.01" value={ballparkMin} onChange={e => setBallparkMin(e.target.value)} placeholder="8000" className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Max (£) *</Label>
                <Input type="number" step="0.01" value={ballparkMax} onChange={e => setBallparkMax(e.target.value)} placeholder="12000" className="font-mono text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Customer Message (shown on portal)</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                rows={2}
                value={ballparkCustomerMsg}
                onChange={e => setBallparkCustomerMsg(e.target.value)}
                placeholder="Based on the details provided, we estimate your project at…"
              />
            </div>
            <div>
              <Label className="text-xs">Internal Notes (admin only)</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                rows={2}
                value={ballparkInternalNotes}
                onChange={e => setBallparkInternalNotes(e.target.value)}
                placeholder="Complexity notes, risk flags…"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSendBallpark}
                disabled={ballparkSending}
              >
                <Send size={12} />
                {ballparkSending ? "Sending…" : "Send Ballpark to Customer"}
              </Button>
            </div>
          </div>

          {/* Appointment Request Status */}
          {(job.appointment_requested_at || job.booking_url) && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
              <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" /> Appointment Requested
              </h3>
              {job.appointment_requested_at && (
                <p className="text-xs text-muted-foreground">
                  Requested at: <span className="font-mono text-foreground">{format(new Date(job.appointment_requested_at), "dd MMM yyyy HH:mm")}</span>
                </p>
              )}
              {job.booking_url && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Booking URL:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[10px] bg-muted p-2 rounded font-mono break-all select-all">{job.booking_url}</code>
                    <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" onClick={() => { navigator.clipboard.writeText(job.booking_url); toast({ title: "Copied" }); }}>
                      <Copy size={12} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="font-mono text-sm font-bold text-foreground">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {APPOINTMENT_ALLOWED_STAGES.includes(stageKey || "") && (
                <Button size="sm" onClick={handleRequestAppointment} disabled={emitting === "appointment_request"}>
                  <CalendarPlus size={14} /> {emitting === "appointment_request" ? "Requesting…" : "Request Appointment"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={ghlSyncing}
                onClick={async () => {
                  setGhlSyncing(true);
                  try {
                    const res = await supabase.functions.invoke("ghl-worker", {
                      body: { company_id: companyId, job_id: job.id },
                    });
                    if (res.error) throw new Error(res.error.message);
                    toast({ title: `GHL sync: ${res.data.processed} processed, ${res.data.errors} errors` });
                    load();
                  } catch (err: any) {
                    toast({ title: "GHL sync failed", description: err.message, variant: "destructive" });
                  } finally {
                    setGhlSyncing(false);
                  }
                }}
              >
                <RefreshCw size={14} className={ghlSyncing ? "animate-spin" : ""} />
                {ghlSyncing ? "Syncing…" : "Sync to GHL"}
              </Button>
            </div>
          </div>

          {/* Production Actions — unlocked after project confirmed */}
          {isProjectConfirmed && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" /> Production Actions
              </h3>
              <p className="text-xs text-muted-foreground">Deposit received — production pipeline is now available.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => toast({ title: "Buy list generation coming soon" })}>
                  <Package size={12} /> Generate Buy List
                </Button>
                <Button size="sm" variant="outline" onClick={() => toast({ title: "RFQ sending coming soon" })}>
                  <Send size={12} /> Send RFQs
                </Button>
                <Button size="sm" variant="outline" onClick={() => toast({ title: "Purchase orders coming soon" })}>
                  <FileText size={12} /> Create Purchase Orders
                </Button>
                <Button size="sm" variant="outline" onClick={() => toast({ title: "BOM upload coming soon" })}>
                  <Cog size={12} /> Upload BOM
                </Button>
              </div>
            </div>
          )}

          {/* Production Stage + Installer Assignment — only after project confirmed */}
          {isProjectConfirmed && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-4">
              <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                <Factory size={14} className="text-primary" /> Production Stage
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs font-mono">
                  {(job.production_stage_key || "not_ready").replace(/_/g, " ")}
                </Badge>
                {job.production_stage_key !== "not_ready" && (
                  <span className="text-[10px] text-muted-foreground">
                    Use the <a href="/admin/production" className="text-primary hover:underline">Production Board</a> to move stages
                  </span>
                )}
              </div>

              {/* Workshop Job Cross-Link */}
              {job.legacy_job_id ? (
                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1 mb-1">
                    <Hammer size={12} /> Workshop Job
                  </h4>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate(`/jobs/${job.legacy_job_id}/builder`)}>
                    Open Workshop Job <ChevronRight size={12} />
                  </Button>
                </div>
              ) : job.production_stage_key === "ready_for_production" && (
                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1 mb-1">
                    <Hammer size={12} /> Workshop Handoff
                  </h4>
                  <p className="text-[10px] text-muted-foreground mb-1">No workshop job linked yet. Create one manually:</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={emitting !== null}
                    onClick={async () => {
                      setEmitting("handoff");
                      try {
                        await insertCabEvent({
                          companyId: companyId!,
                          eventType: "job.ready_for_production",
                          jobId: job.id,
                          payload: { manual: true },
                        });
                        toast({ title: "Workshop job creation triggered" });
                        // Wait a moment for the trigger to fire
                        setTimeout(() => { load(); setEmitting(null); }, 1500);
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                        setEmitting(null);
                      }
                    }}
                  >
                    <Factory size={12} /> {emitting === "handoff" ? "Creating…" : "Create Workshop Job"}
                  </Button>
                </div>
              )}

              {/* Assign Installer */}
              <div className="border-t border-border pt-3 space-y-2">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
                  <UserPlus size={12} /> Assign Installer
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Installer</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                      value={job.install_assigned_to || ""}
                      onChange={async (e) => {
                        const userId = e.target.value || null;
                        setInstallAssigning(true);
                        await (supabase.from("cab_jobs") as any).update({ install_assigned_to: userId }).eq("id", job.id);
                        if (userId) {
                          await insertCabEvent({ companyId: companyId!, eventType: "install.assigned", jobId: job.id, payload: { assigned_to: userId } });
                        }
                        toast({ title: userId ? "Installer assigned" : "Installer unassigned" });
                        setInstallAssigning(false);
                        load();
                      }}
                      disabled={installAssigning}
                    >
                      <option value="">— Unassigned —</option>
                      {teamMembers.map((m: any) => (
                        <option key={m.user_id} value={m.user_id}>{m.user_id} ({m.role})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px]">Install Window Start</Label>
                    <Input
                      type="datetime-local"
                      className="text-xs"
                      value={job.install_window_start ? new Date(job.install_window_start).toISOString().slice(0, 16) : ""}
                      onChange={async (e) => {
                        await (supabase.from("cab_jobs") as any).update({
                          install_window_start: e.target.value ? new Date(e.target.value).toISOString() : null,
                        }).eq("id", job.id);
                        load();
                      }}
                    />
                  </div>
                </div>
                {job.install_completed_at && (
                  <p className="text-xs text-emerald-600">✔ Install completed {format(new Date(job.install_completed_at), "dd MMM yyyy HH:mm")}</p>
                )}
                {job.customer_signoff_at && (
                  <p className="text-xs text-emerald-600">✔ Customer signed off {format(new Date(job.customer_signoff_at), "dd MMM yyyy HH:mm")}</p>
                )}
              </div>
            </div>
          )}

          {/* Quote Builder */}
          <div data-section="quote-builder">
            <QuoteBuilder companyId={companyId!} job={job} onRefresh={load} />
          </div>

          {/* Purchasing Tab — only after project confirmed */}
          {isProjectConfirmed && (
            <JobPurchasingTab companyId={companyId!} job={job} onRefresh={load} />
          )}

          {/* Profitability Tab — only after project confirmed */}
          {isProjectConfirmed && (
            <JobProfitabilityTab companyId={companyId!} job={job} onRefresh={load} />
          )}

          {/* Site Visit Debug Panel */}
          {(() => {
            const siteCalId = job.assigned_rep_calendar_id || settings.site_visit_calendar_id || "";
            const jobBookingUrl = siteCalId
              ? `https://updates.physio-leads.com/widget/booking/${siteCalId}?job_ref=${encodeURIComponent(job.job_ref)}`
              : "";
            return (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                  <CalendarDays size={14} className="text-primary" /> Site Visit Booking
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Rep:</span>{" "}
                    <span className="font-mono">{job.assigned_rep_name || settings.site_visit_rep_name || "Alistair"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Calendar ID:</span>{" "}
                    <span className="font-mono">{siteCalId || "not set"}</span>
                  </div>
                </div>
                {jobBookingUrl && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Booking Link (includes job_ref):</span>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[10px] bg-muted p-2 rounded font-mono break-all select-all">
                        {jobBookingUrl}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 h-7 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(jobBookingUrl);
                          toast({ title: "Booking link copied" });
                        }}
                      >
                        <Copy size={12} /> Copy
                      </Button>
                    </div>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={emitting !== null || !APPOINTMENT_ALLOWED_STAGES.includes(job?.current_stage_key || "")}
                  onClick={handleSendBookingLink}
                  className="text-xs"
                >
                  <Send size={12} />
                  {emitting === "booking_link" ? "Sending…" : "Send Booking Link Now (test)"}
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Inserts an <code className="font-mono">appointment.requested</code> event with booking URL. GHL workflow sends the SMS.
                  {!APPOINTMENT_ALLOWED_STAGES.includes(job?.current_stage_key || "") && (
                    <span className="text-destructive font-bold ml-1">⚠ Send ballpark first to enable.</span>
                  )}
                </p>
              </div>
            );
          })()}


          {/* Quotes */}
          {quotes.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-mono text-sm font-bold text-foreground mb-2">Quotes</h3>
              <div className="space-y-2">
                {quotes.map(q => (
                  <div key={q.id} className="flex items-center justify-between p-2 rounded border border-border">
                    <div>
                      <span className="font-mono text-xs">v{q.version}</span>
                      <span className="ml-2 text-sm">£{q.price_min?.toLocaleString()}–£{q.price_max?.toLocaleString()}</span>
                    </div>
                    <Badge variant={q.status === "accepted" ? "default" : "outline"}>{q.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invoices */}
          {invoices.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-mono text-sm font-bold text-foreground mb-2">Invoices</h3>
              <div className="space-y-2">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded border border-border">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs">{inv.reference}</span>
                      <span className="text-sm font-mono font-medium">£{Number(inv.amount).toLocaleString()}</span>
                      <Badge className="text-[10px]" variant={inv.status === "paid" ? "default" : "outline"}>{inv.status}</Badge>
                      <span className="text-xs text-muted-foreground capitalize">{inv.milestone}</span>
                      {inv.paid_at && <span className="text-[10px] text-muted-foreground">Paid {format(new Date(inv.paid_at), "dd MMM")}</span>}
                    </div>
                    {inv.status === "due" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleMarkDepositPaid(inv.id, "bank_transfer")}>
                          <Banknote size={12} /> Mark Paid (Bank)
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleMarkDepositPaid(inv.id, "stripe")}>
                          <CheckCircle2 size={12} /> Pay Online
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column — GHL Admin + Event log */}
        <div className="space-y-4">
          {/* GHL Admin Actions */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
              <Link size={14} className="text-primary" /> GHL Admin
            </h3>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Contact:</span>
                {job.ghl_contact_id ? (
                  <span className="font-mono text-foreground">{job.ghl_contact_id}</span>
                ) : (
                  <span className="text-amber-600 font-medium">Not synced</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Opportunity:</span>
                {job.ghl_opportunity_id ? (
                  <span className="font-mono text-foreground">{job.ghl_opportunity_id}</span>
                ) : (
                  <span className="text-amber-600 font-medium">Not linked</span>
                )}
              </div>
            </div>
            {/* Last sync results */}
            {lastSyncLogs.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Last Sync</span>
                {lastSyncLogs.map((log: any) => (
                  <div key={log.id} className="text-[11px] rounded bg-muted/50 px-2 py-1.5 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${log.success ? "bg-emerald-500" : "bg-destructive"}`} />
                      <span className="font-mono font-medium text-foreground">{log.action}</span>
                      <span className="text-muted-foreground ml-auto">{format(new Date(log.created_at), "dd MMM HH:mm")}</span>
                    </div>
                    {log.error && <p className="text-destructive text-[10px] truncate" title={log.error}>{log.error}</p>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {/* Sync Contact */}
              <Button
                size="sm"
                variant="outline"
                className="text-xs justify-start"
                disabled={ghlSyncing}
                onClick={async () => {
                  setGhlSyncing(true);
                  try {
                    const res = await supabase.functions.invoke("ghl-worker", {
                      body: { company_id: companyId, job_id: job.id, action: "sync_contact" },
                    });
                    const result = res.data;
                    toast({ title: "Contact synced to GHL", description: `${result?.contact_action}: ${result?.ghl_contact_id}` });
                    await load();
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setGhlSyncing(false);
                  }
                }}
              >
                <Users size={12} /> {ghlSyncing ? "Syncing…" : "Sync Contact to GHL"}
              </Button>
              {/* Link Opportunity */}
              <Button
                size="sm"
                variant="outline"
                className="text-xs justify-start"
                disabled={ghlSyncing}
                onClick={async () => {
                  setGhlSyncing(true);
                  try {
                    const res = await supabase.functions.invoke("ghl-worker", {
                      body: { company_id: companyId, job_id: job.id, action: "link_opportunity" },
                    });
                    const result = res.data;
                    if (result?.linked) {
                      toast({ title: "GHL opportunity linked", description: `ID: ${result.ghl_opportunity_id} (found ${result.search_count} in pipeline)` });
                    } else {
                      toast({ title: "No existing opportunity found", description: result?.message || "Will create on next sync", variant: "destructive" });
                    }
                    await load();
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setGhlSyncing(false);
                  }
                }}
              >
                <Link size={12} /> {ghlSyncing ? "Searching…" : "Link Existing GHL Opportunity"}
              </Button>
              {/* Repair Contact */}
              <Button
                size="sm"
                variant="outline"
                className="text-xs justify-start"
                disabled={ghlSyncing}
                onClick={async () => {
                  setGhlSyncing(true);
                  try {
                    const res = await supabase.functions.invoke("ghl-worker", {
                      body: { company_id: companyId, job_id: job.id, action: "repair_contacts" },
                    });
                    const result = res.data;
                    toast({ title: "Contact repair complete", description: `${result?.repaired || 0} job(s) repaired` });
                    await load();
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setGhlSyncing(false);
                  }
                }}
              >
                <RotateCcw size={12} /> {ghlSyncing ? "Repairing…" : "Repair Contact + Relink Opp"}
              </Button>
              {/* Requeue Events */}
              <Button
                size="sm"
                variant="outline"
                className="text-xs justify-start"
                disabled={ghlSyncing}
                onClick={async () => {
                  setGhlSyncing(true);
                  try {
                    const res = await supabase.functions.invoke("ghl-worker", {
                      body: { company_id: companyId, job_id: job.id, action: "requeue_latest" },
                    });
                    const result = res.data;
                    toast({ title: "Events requeued", description: `${result?.requeued || 0} latest events requeued: ${(result?.event_types || []).join(", ")}` });
                    await load();
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setGhlSyncing(false);
                  }
                }}
              >
                <RotateCcw size={12} /> {ghlSyncing ? "Requeuing…" : "Requeue Latest Events"}
              </Button>
              {/* Open GHL links */}
              {job.ghl_contact_id && (
                <a
                  href={`https://app.gohighlevel.com/contacts/detail/${job.ghl_contact_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink size={12} /> Open GHL Contact
                </a>
              )}
              {job.ghl_opportunity_id && (
                <a
                  href={`https://app.gohighlevel.com/opportunities/${job.ghl_opportunity_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink size={12} /> Open GHL Opportunity
                </a>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-mono text-sm font-bold text-foreground mb-3">Event Log</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.map(ev => (
                <div key={ev.id} className="text-xs border-l-2 border-primary/30 pl-3 py-1">
                  <span className="font-mono text-primary">{ev.event_type}</span>
                  <Badge variant={ev.status === "success" ? "default" : ev.status === "failed" ? "destructive" : "outline"} className="ml-2 text-[9px]">{ev.status}</Badge>
                  <span className="block text-muted-foreground">{format(new Date(ev.created_at), "dd MMM HH:mm")}</span>
                </div>
              ))}
              {events.length === 0 && <p className="text-muted-foreground text-xs">No events yet</p>}
            </div>
          </div>

          {job.estimated_next_action_at && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">Next action expected</p>
              <p className="text-sm font-mono font-bold text-primary">{format(new Date(job.estimated_next_action_at), "dd MMM yyyy")}</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
