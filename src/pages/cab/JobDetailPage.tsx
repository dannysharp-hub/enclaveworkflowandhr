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
import { format } from "date-fns";
import {
  ArrowLeft, Send, CalendarPlus, FileText, CheckCircle2, Banknote,
  Package, Cog, Hammer, Truck, ClipboardCheck, Star, AlertTriangle, RefreshCw,
  CalendarDays, Calendar, Copy,
} from "lucide-react";

/* ─── Testing event buttons ─── */
const TEST_EVENTS = [
  { eventType: "ballpark.sent", label: "Ballpark Sent (test)", icon: Send },
  { eventType: "materials.ordered", label: "Materials Ordered", icon: Package },
  { eventType: "cnc.started", label: "CNC Started", icon: Cog },
  { eventType: "job.assembled", label: "Job Assembled", icon: Hammer },
  { eventType: "install.booked", label: "Install Booked", icon: Truck },
  { eventType: "install.completed", label: "Install Completed", icon: ClipboardCheck },
  { eventType: "job.practical_completed", label: "Practical Complete", icon: Star },
] as const;

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
  const [loading, setLoading] = useState(true);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [emitting, setEmitting] = useState<string | null>(null);
  const [ghlSyncing, setGhlSyncing] = useState(false);

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

    const [custRes, quotesRes, invRes, eventsRes, apptRes] = await Promise.all([
      (supabase.from("cab_customers") as any).select("*").eq("id", jobData.customer_id).single(),
      (supabase.from("cab_quotes") as any).select("*").eq("job_id", jobData.id).order("version", { ascending: false }),
      (supabase.from("cab_invoices") as any).select("*").eq("job_id", jobData.id).order("created_at"),
      (supabase.from("cab_events") as any).select("*").eq("job_id", jobData.id).order("created_at", { ascending: false }).limit(20),
      (supabase.from("cab_appointments") as any).select("*").eq("job_id", jobData.id).order("start_at", { ascending: true }),
    ]);

    setCustomer(custRes.data);
    setQuotes(quotesRes.data ?? []);
    setInvoices(invRes.data ?? []);
    setEvents(eventsRes.data ?? []);
    setAppointments(apptRes.data ?? []);
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
      toast({ title: "Save ballpark first", variant: "destructive" });
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
        return;
      }
    }

    const nextAction = new Date();
    nextAction.setDate(nextAction.getDate() + 3);

    const bookingUrl = calId
      ? `https://updates.physio-leads.com/widget/booking/${calId}?job_ref=${encodeURIComponent(job.job_ref)}`
      : "";

    const { data: { user } } = await supabase.auth.getUser();

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

    await insertCabEvent({
      companyId: companyId!,
      eventType: "appointment.requested",
      jobId: job.id,
      payload: { rep_name: repName, calendar_id: calId, booking_url: bookingUrl, job_ref: job.job_ref },
    });

    toast({ title: "Appointment requested — GHL will send booking link" });
    load();
  };

  const handleMarkDepositPaid = async (invoiceId: string, method: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
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

    await insertCabEvent({
      companyId: companyId!, eventType: "invoice.paid", jobId: job.id,
      payload: { milestone: inv.milestone, method },
    });

    toast({ title: "Payment recorded" });
    load();
  };

  const handleEmitTestEvent = async (eventType: string) => {
    setEmitting(eventType);
    try {
      await insertCabEvent({ companyId: companyId!, eventType, jobId: job.id });
      toast({ title: `Event emitted: ${eventType}` });
      await new Promise(r => setTimeout(r, 300));
      await load();
    } finally {
      setEmitting(null);
    }
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
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
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
              <Button size="sm" variant="outline" onClick={handleSaveBallpark} disabled={ballparkSaving}>
                {ballparkSaving ? "Saving…" : "Save Ballpark"}
              </Button>
              <Button
                size="sm"
                onClick={handleSendBallpark}
                disabled={ballparkSending || !ballparkMin || !ballparkMax || !!job.ballpark_sent_at}
              >
                <Send size={12} />
                {ballparkSending ? "Sending…" : job.ballpark_sent_at ? "Already Sent" : "Send Ballpark to Customer"}
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="font-mono text-sm font-bold text-foreground">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {stageKey === "ballpark_sent" && (
                <Button size="sm" onClick={handleRequestAppointment}><CalendarPlus size={14} /> Request Appointment</Button>
              )}
              {["appointment_requested", "ballpark_sent", "lead_captured", "quote_viewed"].includes(stageKey) && (
                <Button size="sm" variant="outline" onClick={() => setQuoteDialogOpen(true)}><FileText size={14} /> Create/Send Quote</Button>
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

          {/* Test event emitters */}
          {job.status !== "closed" && (
            <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-4 space-y-3">
              <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" /> Testing: Emit Events
              </h3>
              <p className="text-xs text-muted-foreground">These trigger the event-driven state machine via the DB trigger.</p>
              <div className="flex flex-wrap gap-2">
                {TEST_EVENTS.map(({ eventType, label, icon: Icon }) => (
                  <Button
                    key={eventType}
                    size="sm"
                    variant="outline"
                    disabled={emitting !== null}
                    onClick={() => handleEmitTestEvent(eventType)}
                    className="text-xs"
                  >
                    <Icon size={12} /> {emitting === eventType ? "…" : label}
                  </Button>
                ))}
              </div>
            </div>
          )}

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
                {invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded border border-border">
                    <div>
                      <span className="font-mono text-xs">{inv.reference}</span>
                      <span className="ml-2 text-sm">£{Number(inv.amount).toLocaleString()}</span>
                      <Badge className="ml-2" variant={inv.status === "paid" ? "default" : "outline"}>{inv.status}</Badge>
                      <span className="ml-2 text-xs text-muted-foreground capitalize">{inv.milestone}</span>
                    </div>
                    {inv.status === "due" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleMarkDepositPaid(inv.id, "bank")}>
                          <Banknote size={12} /> Bank
                        </Button>
                        <Button size="sm" onClick={() => handleMarkDepositPaid(inv.id, "stripe")}>
                          <CheckCircle2 size={12} /> Stripe
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column — Event log */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-mono text-sm font-bold text-foreground mb-3">Event Log</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.map(ev => (
                <div key={ev.id} className="text-xs border-l-2 border-primary/30 pl-3 py-1">
                  <span className="font-mono text-primary">{ev.event_type}</span>
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

      <CreateQuoteDialog
        open={quoteDialogOpen}
        onOpenChange={setQuoteDialogOpen}
        companyId={companyId!}
        job={job}
        currentVersion={quotes.length}
        onSuccess={load}
      />
    </div>
  );
}

function CreateQuoteDialog({ open, onOpenChange, companyId, job, currentVersion, onSuccess }: {
  open: boolean; onOpenChange: (o: boolean) => void; companyId: string; job: any; currentVersion: number; onSuccess: () => void;
}) {
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [scope, setScope] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await (supabase.from("cab_quotes") as any).insert({
        company_id: companyId,
        job_id: job.id,
        version: currentVersion + 1,
        status: "sent",
        price_min: parseFloat(priceMin),
        price_max: parseFloat(priceMax),
        scope_summary: scope || null,
        document_url: docUrl || null,
        sent_at: new Date().toISOString(),
      });

      await insertCabEvent({ companyId, eventType: "quote.sent", jobId: job.id });

      const nextAction = new Date();
      nextAction.setDate(nextAction.getDate() + 7);
      await (supabase.from("cab_jobs") as any).update({
        status: "quoted",
        state: "awaiting_acceptance",
        current_stage_key: "quote_sent",
        estimated_next_action_at: nextAction.toISOString(),
      }).eq("id", job.id);

      toast({ title: "Quote sent" });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-mono">Send Quote</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Price Min (£) *</Label><Input required type="number" step="0.01" value={priceMin} onChange={e => setPriceMin(e.target.value)} /></div>
            <div><Label>Price Max (£) *</Label><Input required type="number" step="0.01" value={priceMax} onChange={e => setPriceMax(e.target.value)} /></div>
          </div>
          <div><Label>Scope Summary</Label><textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={scope} onChange={e => setScope(e.target.value)} /></div>
          <div><Label>Document URL</Label><Input value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="https://..." /></div>
          <Button type="submit" disabled={submitting} className="w-full">{submitting ? "Sending…" : "Send Quote"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
