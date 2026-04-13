import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getCabCompanyId, getCabCompany, insertCabEvent, estimatePostcodeDistance } from "@/lib/cabHelpers";
import { deleteCabJob } from "@/lib/cabJobDelete";
import { buildInvoiceEmailHtml } from "@/lib/invoiceEmailTemplate";
import { toast } from "@/hooks/use-toast";
import { regenerateJobCard } from "@/lib/jobCardHelper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import DriveQuoteAttach from "@/components/DriveQuoteAttach";
import CompletionPhotos from "@/components/cab/CompletionPhotos";
import QuoteBuilder from "@/components/QuoteBuilder";
import JobPurchasingTab from "@/components/cab/JobPurchasingTab";
import RfqGenerator from "@/components/cab/RfqGenerator";
import JobProfitabilityTab from "@/components/cab/JobProfitabilityTab";
import StagePipeline from "@/components/cab/StagePipeline";
import NextActionsPanel from "@/components/cab/NextActionsPanel";
import { format } from "date-fns";
import {
  ArrowLeft, Send, CalendarPlus, FileText, CheckCircle2, Banknote,
  Package, Cog, Hammer, Truck, ClipboardCheck, Star, AlertTriangle, RefreshCw,
  CalendarDays, Calendar, Copy, Factory, ChevronRight, UserPlus, Link, RotateCcw,
  Users, ExternalLink, Trash2,
  Pencil, Check, X as XIcon, Camera, Loader2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export default function JobDetailPage() {
  const { userRole } = useAuth();
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
  const [linkingDrive, setLinkingDrive] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [installCompleteOpen, setInstallCompleteOpen] = useState(false);
  const [installCompleteSending, setInstallCompleteSending] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dfUploading, setDfUploading] = useState(false);
  const [dfSending, setDfSending] = useState(false);
  const [icFitterNotes, setIcFitterNotes] = useState("");
  const [icSignoffUploading, setIcSignoffUploading] = useState(false);
  const [icCompleting, setIcCompleting] = useState(false);
  const [scheduledTasks, setScheduledTasks] = useState<any[]>([]);
  const [reviewSending, setReviewSending] = useState(false);

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

    const [custRes, quotesRes, invRes, eventsRes, apptRes, teamRes, syncLogRes, scheduledTasksRes] = await Promise.all([
      (supabase.from("cab_customers") as any).select("*").eq("id", jobData.customer_id).single(),
      (supabase.from("cab_quotes") as any).select("*").eq("job_id", jobData.id).order("version", { ascending: false }),
      (supabase.from("cab_invoices") as any).select("*").eq("job_id", jobData.id).order("created_at"),
      (supabase.from("cab_events") as any).select("*").eq("job_id", jobData.id).order("created_at", { ascending: false }).limit(20),
      (supabase.from("cab_appointments") as any).select("*").eq("job_id", jobData.id).order("start_at", { ascending: true }),
      (supabase.from("cab_company_memberships") as any).select("user_id, role").eq("company_id", cid),
      (supabase.from("cab_ghl_sync_log") as any).select("*").eq("job_id", jobData.id).order("created_at", { ascending: false }).limit(3),
      (supabase.from("scheduled_tasks") as any).select("*").eq("job_id", jobData.id).order("created_at", { ascending: false }),
    ]);

    setCustomer(custRes.data);
    setQuotes(quotesRes.data ?? []);
    setInvoices(invRes.data ?? []);
    setEvents(eventsRes.data ?? []);
    setAppointments(apptRes.data ?? []);
    setTeamMembers(teamRes.data ?? []);
    setLastSyncLogs(syncLogRes.data ?? []);
    setScheduledTasks(scheduledTasksRes.data ?? []);
    setLoading(false);
  }, [jobRef, navigate]);

  useEffect(() => { load(); }, [load]);

  const updateJob = async (updates: Record<string, any>) => {
    await (supabase.from("cab_jobs") as any).update(updates).eq("id", job.id);
    regenerateJobCard(job.id);
    // Sync job.json to Drive in the background
    if (job?.drive_folder_id) {
      supabase.functions.invoke("write-job-json", { body: { job_id: job.id } })
        .catch((e) => console.warn("[write-job-json] sync failed:", e));
    }
  };

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const saveCustomerField = async (field: string) => {
    if (!customer) return;
    const { error } = await (supabase.from("cab_customers") as any)
      .update({ [field]: editValue || null })
      .eq("id", customer.id);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Customer updated" });
      setCustomer({ ...customer, [field]: editValue || null });
    }
    setEditingField(null);
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
      const baseUrl = company?.settings_json?.site_visit_booking_url
        || (calId ? `https://api.leadconnectorhq.com/widget/booking/${calId}` : "");
      const bookingUrl = baseUrl
        ? `${baseUrl}?job_ref=${encodeURIComponent(job.job_ref)}`
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
        {userRole === "admin" && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} className="flex items-center gap-1.5">
            <Trash2 size={14} /> Delete
          </Button>
        )}
      </div>

      <StagePipeline currentStageKey={stageKey} />

      {/* Add to Production Board button */}
      {!job.production_stage && ['deposit_received', 'project_confirmed', 'materials_ordered', 'manufacturing_started', 'cabinetry_assembled', 'ready_for_installation', 'ready_for_install'].includes(stageKey) && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-foreground flex items-center gap-2"><Factory size={14} /> This job is not on the Production Board yet</p>
            <p className="text-xs text-muted-foreground">Add it to start tracking production stages</p>
          </div>
          <Button size="sm" onClick={async () => {
            console.log("[ProductionBoard] Adding job to board:", { jobId: job.id, companyId, job_ref: job.job_ref });
            const { data: updateData, error: updateError } = await (supabase.from("cab_jobs") as any)
              .update({ production_stage: "materials_ordered", updated_at: new Date().toISOString() })
              .eq("id", job.id)
              .eq("company_id", companyId)
              .select();
            console.log("[ProductionBoard] Update result:", { data: updateData, error: updateError });
            if (updateError) {
              toast({ title: "Error", description: updateError.message, variant: "destructive" });
              return;
            }
            await insertCabEvent({ companyId: companyId!, eventType: "production.started", jobId: job.id, payload: { job_ref: job.job_ref } });
            toast({ title: "Job added to Production Board" });
            load();
          }}>
            <Factory size={14} className="mr-1.5" /> Add to Production Board
          </Button>
        </div>
      )}

      <NextActionsPanel
        job={job}
        companyId={companyId!}
        stageKey={stageKey}
        onRefresh={load}
        onRequestAppointment={handleRequestAppointment}
        onMarkInstallComplete={() => setInstallCompleteOpen(true)}
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
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Phone:</span>
                {editingField === "phone" ? (
                  <span className="flex items-center gap-1">
                    <Input className="h-6 text-xs w-32" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && saveCustomerField("phone")} />
                    <button onClick={() => saveCustomerField("phone")} className="text-primary hover:text-primary/80"><Check size={14} /></button>
                    <button onClick={() => setEditingField(null)} className="text-muted-foreground hover:text-foreground"><XIcon size={14} /></button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">{customer?.phone || "—"}<button onClick={() => startEdit("phone", customer?.phone)} className="text-muted-foreground hover:text-foreground"><Pencil size={12} /></button></span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Email:</span>
                {editingField === "email" ? (
                  <span className="flex items-center gap-1">
                    <Input className="h-6 text-xs w-44" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && saveCustomerField("email")} />
                    <button onClick={() => saveCustomerField("email")} className="text-primary hover:text-primary/80"><Check size={14} /></button>
                    <button onClick={() => setEditingField(null)} className="text-muted-foreground hover:text-foreground"><XIcon size={14} /></button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">{customer?.email || "—"}<button onClick={() => startEdit("email", customer?.email)} className="text-muted-foreground hover:text-foreground"><Pencil size={12} /></button></span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Postcode:</span>
                {editingField === "postcode" ? (
                  <span className="flex items-center gap-1">
                    <Input className="h-6 text-xs w-24" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && saveCustomerField("postcode")} />
                    <button onClick={() => saveCustomerField("postcode")} className="text-primary hover:text-primary/80"><Check size={14} /></button>
                    <button onClick={() => setEditingField(null)} className="text-muted-foreground hover:text-foreground"><XIcon size={14} /></button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">{customer?.postcode || "—"}<button onClick={() => startEdit("postcode", customer?.postcode)} className="text-muted-foreground hover:text-foreground"><Pencil size={12} /></button></span>
                )}
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Contract Value</Label>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-sm font-mono text-muted-foreground">£</span>
                  <Input
                    type="number"
                    step="0.01"
                    className="font-mono text-xs h-8 w-40"
                    defaultValue={job.contract_value ?? ""}
                    placeholder="0.00"
                    onBlur={async (e) => {
                      const val = e.target.value ? parseFloat(e.target.value) : null;
                      if (val !== job.contract_value) {
                        await updateJob({ contract_value: val });
                        setJob((prev: any) => ({ ...prev, contract_value: val }));
                        toast({ title: "Contract value saved" });
                      }
                    }}
                  />
                </div>
              </div>
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
              <RfqGenerator companyId={companyId!} job={job} onRefresh={load} />
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
                <RfqGenerator companyId={companyId!} job={job} onRefresh={load} />
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

              {/* Request Install Dates */}
              <div className="border-t border-border pt-3 space-y-2">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1">
                  <CalendarDays size={12} /> Install Date Booking
                </h4>
                {job.install_date && (
                  <p className="text-xs text-emerald-600 font-medium">
                    ✔ Install confirmed: {format(new Date(job.install_date + "T00:00:00"), "EEEE, d MMMM yyyy")}
                  </p>
                )}
                {!job.install_date && job.install_date_option_1 && (
                  <div className="space-y-1">
                    <p className="text-xs text-amber-600 font-medium">⏳ Customer submitted dates – awaiting confirmation</p>
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      <p>1st: {job.install_date_option_1}</p>
                      <p>2nd: {job.install_date_option_2}</p>
                      <p>3rd: {job.install_date_option_3}</p>
                    </div>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={emitting === "install_dates"}
                  onClick={async () => {
                    setEmitting("install_dates");
                    try {
                      const installToken = crypto.randomUUID();
                      await (supabase.from("cab_jobs") as any).update({
                        install_date_token: installToken,
                      }).eq("id", job.id);

                      const pageUrl = `${window.location.origin}/request-install-dates?job_ref=${encodeURIComponent(job.job_ref)}&token=${encodeURIComponent(installToken)}`;

                      const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <img src="https://taftcuryslgdkstzqrcy.supabase.co/storage/v1/object/public/assets/ec-logo.png" alt="Enclave Cabinetry" width="120" height="120" style="display:block;margin:0 auto;" />
  </td></tr>
  <tr><td style="padding:32px;">
    <h1 style="color:#1a1a2e;font-size:22px;margin:0 0 16px;">Choose Your Install Dates</h1>
    <p style="color:#333;font-size:15px;line-height:1.6;">Hi ${customer?.first_name || "there"},</p>
    <p style="color:#333;font-size:15px;line-height:1.6;">Your cabinetry for <strong>${job.job_ref} – ${job.job_title}</strong> is ready for installation! Please choose 3 preferred dates:</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${pageUrl}" style="display:inline-block;background:#1a1a2e;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;">Choose Install Dates</a>
    </div>
    <p style="color:#333;font-size:15px;line-height:1.6;">Questions? Call us on <strong>07944 608098</strong>.</p>
    <p style="color:#333;font-size:15px;">Kind regards,<br/><strong>The Enclave Cabinetry Team</strong></p>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px;text-align:center;">
    <p style="color:#999;font-size:12px;margin:0;">Enclave Cabinetry | 07944 608098</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;

                      if (customer?.email) {
                        await supabase.functions.invoke("send-email", {
                          body: {
                            to: customer.email,
                            subject: `Choose Your Install Dates – ${job.job_ref}`,
                            html,
                            replyTo: "danny@enclavecabinetry.com",
                          },
                        });
                      }

                      await insertCabEvent({
                        companyId: companyId!,
                        eventType: "install.dates_requested",
                        jobId: job.id,
                        payload: { token: installToken },
                      });

                      toast({ title: "Install date request sent to customer" });
                      load();
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    } finally {
                      setEmitting(null);
                    }
                  }}
                >
                  <Send size={12} />
                  {emitting === "install_dates" ? "Sending…" : "Request Install Dates"}
                </Button>
              </div>

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

          {/* Quote — Attach & Send from Drive */}
          <div data-section="quote-builder">
            <DriveQuoteAttach companyId={companyId!} job={job} customer={customer} onRefresh={load} />
          </div>

          {/* Manual Quote Builder */}
          <div data-section="manual-quote-builder">
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
            const baseBookingUrl = settings.site_visit_booking_url
              || (siteCalId ? `https://api.leadconnectorhq.com/widget/booking/${siteCalId}` : "");
            const jobBookingUrl = baseBookingUrl
              ? `${baseBookingUrl}?job_ref=${encodeURIComponent(job.job_ref)}`
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

          {/* Install Date Booking */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
              <CalendarDays size={14} className="text-primary" /> Install Date Booking
            </h3>
            {job.install_date && (
              <p className="text-xs text-green-700 font-medium">
                ✔ Install confirmed: {new Date(job.install_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            {!job.install_date && job.install_date_option_1 && (
              <p className="text-xs text-amber-700 font-medium">⏳ Customer submitted dates – awaiting confirmation</p>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={emitting === "install_dates"}
              className="text-xs"
              onClick={async () => {
                if (!customer?.email) {
                  toast({ title: "No customer email", description: "Add an email to the customer record first.", variant: "destructive" });
                  return;
                }
                setEmitting("install_dates");
                try {
                  const installToken = crypto.randomUUID();
                  await (supabase.from("cab_jobs") as any).update({ install_date_token: installToken, updated_at: new Date().toISOString() }).eq("id", job.id);

                  const publicUrl = `${window.location.origin}/request-install-dates?job_ref=${encodeURIComponent(job.job_ref)}&token=${encodeURIComponent(installToken)}`;

                  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#1a1a2e;padding:24px;text-align:center;"><img src="https://taftcuryslgdkstzqrcy.supabase.co/storage/v1/object/public/assets/ec-logo.png" alt="Enclave Cabinetry" width="120" height="120" style="display:block;margin:0 auto;"/></td></tr>
<tr><td style="padding:32px;">
<h1 style="color:#1a1a2e;font-size:22px;margin:0 0 16px;">Choose Your Install Dates</h1>
<p style="color:#333;font-size:15px;line-height:1.6;">Hi ${customer.first_name},</p>
<p style="color:#333;font-size:15px;line-height:1.6;">Great news – your cabinetry for <strong>${job.job_ref}</strong> (${job.job_title}) is ready for installation!</p>
<p style="color:#333;font-size:15px;line-height:1.6;">Please click below to choose 3 preferred install dates:</p>
<div style="text-align:center;margin:24px 0;">
<a href="${publicUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">Choose Install Dates</a>
</div>
<p style="color:#666;font-size:13px;">Or copy this link: ${publicUrl}</p>
<p style="color:#333;font-size:15px;line-height:1.6;">Questions? Call us on <strong>07944 608098</strong>.</p>
<p style="color:#333;font-size:15px;">Kind regards,<br/><strong>The Enclave Cabinetry Team</strong></p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px;text-align:center;"><p style="color:#999;font-size:12px;margin:0;">Enclave Cabinetry | 07944 608098</p></td></tr>
</table></td></tr></table></body></html>`;

                  await supabase.functions.invoke("send-email", {
                    body: { to: customer.email, subject: `Choose Your Install Dates – ${job.job_ref}`, html },
                  });

                  await (supabase.from("cab_events") as any).insert({
                    company_id: job.company_id,
                    event_type: "install.dates_requested",
                    job_id: job.id,
                    payload_json: { token: installToken },
                    status: "pending",
                  });

                  toast({ title: "Install date request sent", description: `Email sent to ${customer.email}` });
                  load();
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setEmitting(null);
                }
              }}
            >
              <Send size={12} />
              {emitting === "install_dates" ? "Sending…" : "Request Install Dates"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Emails the customer a link to choose 3 preferred install dates.
            </p>
          </div>

          {/* Google Drive */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
              <Link size={14} className="text-primary" /> Google Drive
            </h3>
            {job.drive_folder_id ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{job.drive_folder_name || job.drive_folder_id}</span>
                  <Badge variant="default" className="bg-green-600 text-white text-[10px] px-1.5 py-0">Linked</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://drive.google.com/drive/folders/${job.drive_folder_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink size={12} /> Open in Drive
                  </a>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={linkingDrive}
                className="text-xs h-8"
                onClick={async () => {
                  setLinkingDrive(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("create-drive-folder", {
                      body: {
                        job_id: job.id,
                        job_ref: job.job_ref,
                        customer_last_name: customer?.last_name || "unknown",
                      },
                    });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);
                    setJob((prev: any) => ({ ...prev, drive_folder_id: data.drive_folder_id, drive_folder_name: data.drive_folder_name }));
                    toast({ title: "Drive folder created", description: `Created "${data.drive_folder_name}"` });
                    // Write job.json to new folder
                    supabase.functions.invoke("write-job-json", { body: { job_id: job.id } })
                      .catch((e) => console.warn("[write-job-json] sync failed:", e));
                  } catch (err: any) {
                    toast({ title: "Failed to create folder", description: err.message, variant: "destructive" });
                  } finally {
                    setLinkingDrive(false);
                  }
                }}
              >
                {linkingDrive ? <RefreshCw size={12} className="animate-spin mr-1" /> : <Link size={12} className="mr-1" />}
                Create Drive Folder
              </Button>
            )}
          </div>

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

          {/* Site Visit 2 (Post-Deposit Technical Survey) */}
          {job && (() => {
            const SV2_VISIBLE_STAGES = ["awaiting_deposit", "deposit", "deposit_received", "design", "design_signed_off", "in_production", "manufacturing", "manufacturing_started", "project_confirmed", "materials_ordered", "cabinetry_assembled", "ready_to_install", "ready_for_installation", "install", "install_booked", "installation_complete", "complete", "practical_completed", "closed_paid"];
            if (!SV2_VISIBLE_STAGES.includes(stageKey || "")) return null;
            const isCompleted = !!job.site_visit_2_completed;
            return (
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-mono text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <ClipboardCheck size={14} className="text-primary" /> Site Visit 2 — Technical Survey
                </h3>
                <div className="space-y-3">
                  {isCompleted && (
                    <Badge variant="default" className="gap-1"><CheckCircle2 size={10} /> Completed</Badge>
                  )}

                  {/* Date picker */}
                  <div>
                    <Label className="text-xs">Site Visit 2 Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-xs", !job.site_visit_2_date && "text-muted-foreground")}>
                          <CalendarDays size={12} className="mr-2" />
                          {job.site_visit_2_date ? format(new Date(job.site_visit_2_date), "dd MMM yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={job.site_visit_2_date ? new Date(job.site_visit_2_date) : undefined}
                          onSelect={async (date: Date | undefined) => {
                            if (!date) return;
                            await (supabase.from("cab_jobs") as any).update({ site_visit_2_date: date.toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
                            toast({ title: "Site Visit 2 date saved" });
                            load();
                          }}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Notes */}
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <textarea
                      className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      defaultValue={job.site_visit_2_notes || ""}
                      placeholder="Technical survey notes…"
                      onBlur={async (e) => {
                        const val = e.target.value;
                        if (val !== (job.site_visit_2_notes || "")) {
                          await (supabase.from("cab_jobs") as any).update({ site_visit_2_notes: val, updated_at: new Date().toISOString() }).eq("id", job.id);
                          toast({ title: "Notes saved" });
                          load();
                        }
                      }}
                    />
                  </div>

                  {/* Mark complete */}
                  {!isCompleted && (
                    <Button size="sm" variant="outline" className="w-full" onClick={async () => {
                      const now = new Date().toISOString();
                      await (supabase.from("cab_jobs") as any).update({ site_visit_2_completed: true, updated_at: now }).eq("id", job.id);
                      if (companyId) {
                        await insertCabEvent({ companyId, eventType: "site_visit_2.completed", jobId: job.id, payload: { completed_at: now } });
                      }
                      toast({ title: "Site Visit 2 marked complete" });
                      load();
                    }}>
                      <CheckCircle2 size={12} className="mr-1" /> Mark Site Visit 2 Complete
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Design Sign-Off */}
          {job && (() => {
            const SIGNOFF_VISIBLE_STAGES = ["awaiting_deposit", "deposit", "deposit_received", "design", "design_signed_off", "in_production", "manufacturing", "manufacturing_started", "project_confirmed", "materials_ordered", "cabinetry_assembled", "ready_to_install", "ready_for_installation", "install", "install_booked", "installation_complete", "complete", "practical_completed", "closed_paid"];
            if (!SIGNOFF_VISIBLE_STAGES.includes(stageKey || "")) return null;
            const isSigned = !!job.customer_signoff_at;
            return (
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-mono text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <ClipboardCheck size={14} className="text-primary" /> Design Sign-Off
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={isSigned ? "default" : "outline"} className={isSigned ? "bg-emerald-600 text-white" : ""}>
                      {isSigned ? "Signed" : "Pending"}
                    </Badge>
                    {isSigned && job.customer_signoff_at && (
                      <span className="text-xs text-muted-foreground">Signed {format(new Date(job.customer_signoff_at), "dd MMM yyyy HH:mm")}</span>
                    )}
                  </div>
                  {job.sign_off_signature_url && (
                    <div className="flex items-center gap-2 text-xs">
                      <FileText size={12} className="text-muted-foreground" />
                      <a href={job.sign_off_signature_url} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate max-w-xs">
                        View signed document
                      </a>
                    </div>
                  )}
                  {!isSigned && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Attach signed document (optional)</Label>
                        <Input
                          type="file"
                          className="h-8 text-xs mt-1"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const path = `${job.id}/design-signoff-${Date.now()}.${file.name.split(".").pop()}`;
                            const { error: uploadErr } = await supabase.storage.from("install-signoffs").upload(path, file);
                            if (uploadErr) {
                              toast({ title: "Upload failed", description: uploadErr.message, variant: "destructive" });
                              return;
                            }
                            const { data: urlData } = supabase.storage.from("install-signoffs").getPublicUrl(path);
                            await updateJob({ sign_off_signature_url: urlData.publicUrl });
                            toast({ title: "Document attached" });
                            load();
                          }}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={async () => {
                          const now = new Date().toISOString();
                          await updateJob({
                            customer_signoff_at: now,
                            current_stage_key: "design_signed_off",
                          });
                          await insertCabEvent({
                            companyId: companyId!,
                            eventType: "design.signed_off",
                            jobId: job.id,
                            payload: { signed_at: now },
                          });
                          toast({ title: "Design sign-off recorded" });
                          load();
                        }}
                      >
                        <CheckCircle2 size={12} className="mr-1" /> Mark as Signed Off
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Payment Stages */}
          {job && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-mono text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Banknote size={14} className="text-primary" /> Payments
              </h3>
              {(() => {
                const cv = Number(job.contract_value) || 0;
                const stages = [
                  { key: "deposit", label: "Deposit (50%)", pct: 0.5, amount: job.deposit_amount, paidAt: job.deposit_paid_at, amountCol: "deposit_amount", paidCol: "deposit_paid_at", enabled: true },
                  { key: "progress", label: "Progress Payment (40%)", pct: 0.4, amount: job.progress_payment_amount, paidAt: job.progress_payment_paid_at, amountCol: "progress_payment_amount", paidCol: "progress_payment_paid_at", enabled: !!(Number(job.deposit_amount) > 0 && job.deposit_paid_at) },
                  { key: "final", label: "Final Payment (10%)", pct: 0.1, amount: job.final_payment_amount, paidAt: job.final_payment_paid_at, amountCol: "final_payment_amount", paidCol: "final_payment_paid_at", enabled: !!(Number(job.progress_payment_amount) > 0 && job.progress_payment_paid_at) },
                ];
                const handleMarkStagePaid = async (stage: typeof stages[0]) => {
                  const now = new Date().toISOString();
                  const update: any = { [stage.paidCol]: now };
                  // Auto-set amount from contract_value if not yet set
                  if (!stage.amount && cv > 0) {
                    update[stage.amountCol] = Math.round(cv * stage.pct * 100) / 100;
                  }
                  // If deposit, also push to production board
                   if (stage.key === "deposit") {
                     update.production_stage_key = "materials_ordered";
                     update.production_stage = "materials_ordered";
                   }
                  await (supabase.from("cab_jobs") as any).update(update).eq("id", job.id);
                  toast({ title: `${stage.label} marked as paid` });
                  // Fire production.started event for deposit
                  if (stage.key === "deposit" && companyId) {
                    insertCabEvent({
                      companyId,
                      eventType: "production.started",
                      jobId: job.id,
                      payload: { triggered_by: "deposit_paid" },
                    }).catch((e) => console.warn("[production.started] event failed:", e));
                  }
                  if (job.drive_folder_id) {
                    supabase.functions.invoke("write-job-json", { body: { job_id: job.id } })
                      .catch((e) => console.warn("[write-job-json] sync failed:", e));
                  }
                  load();
                };
                const handleSetAmounts = async () => {
                  if (cv <= 0) { toast({ title: "Set contract value first", variant: "destructive" }); return; }
                  await (supabase.from("cab_jobs") as any).update({
                    deposit_amount: Math.round(cv * 0.5 * 100) / 100,
                    progress_payment_amount: Math.round(cv * 0.4 * 100) / 100,
                    final_payment_amount: Math.round(cv * 0.1 * 100) / 100,
                  }).eq("id", job.id);
                  toast({ title: "Payment amounts calculated from contract value" });
                  load();
                };
                return (
                  <div className="space-y-3">
                    {cv > 0 && !job.deposit_amount && (
                      <Button size="sm" variant="outline" className="w-full" onClick={handleSetAmounts}>
                        <RefreshCw size={12} className="mr-1" /> Auto-calculate amounts from £{cv.toLocaleString()}
                      </Button>
                    )}
                    {stages.map((s, i) => (
                      <div key={s.key} className={`flex items-center justify-between p-3 rounded border ${s.paidAt ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"}`}>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            {s.paidAt ? <CheckCircle2 size={14} className="text-emerald-500" /> : <span className="text-muted-foreground text-xs">●</span>}
                            <span className="text-sm font-medium">{s.label}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">£{(Number(s.amount) || Math.round(cv * s.pct * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                            {s.paidAt && <span>· Paid {format(new Date(s.paidAt), "dd MMM yyyy")}</span>}
                          </div>
                        </div>
                        {!s.paidAt && (
                          <Button size="sm" variant="outline" disabled={!s.enabled} onClick={() => handleMarkStagePaid(s)}>
                            <Banknote size={12} className="mr-1" /> Mark as Paid
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Dry Fit & Progress Payment */}
          {job && (() => {
            const DRYFIT_VISIBLE_STAGES = ["assembly", "cabinetry_assembled", "ready_for_installation", "install_booked", "installation_complete", "practical_completed", "closed_paid"];
            const prodKey = job.production_stage_key || job.production_stage || "";
            if (!DRYFIT_VISIBLE_STAGES.includes(prodKey) && !DRYFIT_VISIBLE_STAGES.includes(stageKey || "")) return null;
            const isDryFitDone = !!job.dry_fit_completed;
            const photoUrls: string[] = job.dry_fit_photo_urls || [];

            const handleDfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              setDfUploading(true);
              try {
                const newUrls: string[] = [...photoUrls];
                for (const file of files) {
                  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
                  const path = `${job.id}/dry-fit/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                  const { error } = await supabase.storage.from("job-photos").upload(path, file, { contentType: file.type });
                  if (error) throw error;
                  const { data: urlData } = supabase.storage.from("job-photos").getPublicUrl(path);
                  newUrls.push(urlData.publicUrl);
                }
                await (supabase.from("cab_jobs") as any).update({ dry_fit_photo_urls: newUrls }).eq("id", job.id);
                toast({ title: `${files.length} photo(s) uploaded` });
                load();
              } catch (err: any) {
                toast({ title: "Upload failed", description: err.message, variant: "destructive" });
              } finally {
                setDfUploading(false);
                e.target.value = "";
              }
            };

            const handleDfComplete = async () => {
              const now = new Date().toISOString();
              await (supabase.from("cab_jobs") as any).update({ dry_fit_completed: true, dry_fit_completed_at: now }).eq("id", job.id);
              if (companyId) {
                insertCabEvent({ companyId, eventType: "dry_fit.completed", jobId: job.id, payload: {} }).catch(console.warn);
              }
              toast({ title: "Dry fit marked complete" });
              load();
            };

            const handleSendProgressInvoice = async () => {
              setDfSending(true);
              try {
                if (companyId) {
                  await insertCabEvent({ companyId, eventType: "invoice.progress_requested", jobId: job.id, payload: {} });
                }
                toast({ title: "Progress invoice requested" });
                load();
              } catch (err: any) {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              } finally {
                setDfSending(false);
              }
            };

            return (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                  <Hammer size={14} className="text-primary" /> Dry Fit & Progress Payment
                </h3>

                {/* Dry Fit Photos */}
                <div className="space-y-2">
                  <Label className="text-xs">Dry Fit Photos</Label>
                  {photoUrls.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {photoUrls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="aspect-square rounded-md overflow-hidden border border-border hover:border-primary/50 transition-colors">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  <label>
                    <Button size="sm" variant="outline" asChild disabled={dfUploading}>
                      <span className="cursor-pointer">
                        {dfUploading ? <><Loader2 size={14} className="animate-spin mr-1" /> Uploading…</> : <><Camera size={14} className="mr-1" /> Add Photos</>}
                      </span>
                    </Button>
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleDfUpload} />
                  </label>
                </div>

                {/* Dry Fit Completed */}
                <div className="flex items-center justify-between p-3 rounded border border-border">
                  <div className="flex items-center gap-2">
                    {isDryFitDone ? <CheckCircle2 size={14} className="text-emerald-500" /> : <span className="text-muted-foreground text-xs">●</span>}
                    <span className="text-sm font-medium">Dry Fit Complete</span>
                    {job.dry_fit_completed_at && <span className="text-[10px] text-muted-foreground">· {format(new Date(job.dry_fit_completed_at), "dd MMM yyyy")}</span>}
                  </div>
                  {!isDryFitDone && (
                    <Button size="sm" variant="outline" onClick={handleDfComplete}>
                      <CheckCircle2 size={12} className="mr-1" /> Mark Complete
                    </Button>
                  )}
                </div>

                {/* Send Progress Invoice */}
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!isDryFitDone || !!job.progress_payment_paid_at || dfSending}
                  onClick={handleSendProgressInvoice}
                >
                  <Send size={12} className="mr-1" /> {dfSending ? "Sending…" : "Send Progress Invoice"}
                </Button>
                {!isDryFitDone && <p className="text-[10px] text-muted-foreground">Complete dry fit to enable progress invoice</p>}
                {isDryFitDone && job.progress_payment_paid_at && <p className="text-[10px] text-emerald-600">Progress payment already received</p>}
              </div>
            );
          })()}

          {/* Installation & Completion */}
          {job && (() => {
            const IC_VISIBLE_STAGES = ["install", "installing", "ready_for_install", "install_complete", "installation_complete", "practical_completed", "closed_paid", "complete"];
            const icProdKey = job.production_stage_key || job.production_stage || "";
            if (!IC_VISIBLE_STAGES.includes(icProdKey) && !IC_VISIBLE_STAGES.includes(stageKey || "")) return null;

            const isInstallDone = !!job.install_completed_at;
            const hasSignoff = !!job.final_signoff_url;
            const canComplete = isInstallDone && hasSignoff;

            const handleIcInstallComplete = async () => {
              const now = new Date().toISOString();
              await (supabase.from("cab_jobs") as any).update({ install_completed_at: now }).eq("id", job.id);
              if (companyId) insertCabEvent({ companyId, eventType: "install.completed", jobId: job.id, payload: {} }).catch(console.warn);
              toast({ title: "Installation marked complete" });
              load();
            };

            const handleIcFitterNotes = async () => {
              await (supabase.from("cab_jobs") as any).update({ fitter_notes: icFitterNotes }).eq("id", job.id);
              toast({ title: "Fitter notes saved" });
            };

            const handleIcSignoffUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setIcSignoffUploading(true);
              try {
                const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
                const path = `${job.id}/signoff/${Date.now()}.${ext}`;
                const { error } = await supabase.storage.from("install-signoffs").upload(path, file, { contentType: file.type });
                if (error) throw error;
                const { data: urlData } = supabase.storage.from("install-signoffs").getPublicUrl(path);
                await (supabase.from("cab_jobs") as any).update({ final_signoff_url: urlData.publicUrl }).eq("id", job.id);

                // Try uploading to Drive if linked
                if (job.drive_folder_id) {
                  try {
                    const { uploadToDrive } = await import("@/lib/driveUpload");
                    await uploadToDrive(job.id, `SignOff_${job.job_ref}.${ext}`, file, "Sign-Off", file.type);
                  } catch (driveErr) {
                    console.warn("Drive upload failed (non-blocking):", driveErr);
                  }
                }

                toast({ title: "Sign-off document uploaded" });
                load();
              } catch (err: any) {
                toast({ title: "Upload failed", description: err.message, variant: "destructive" });
              } finally {
                setIcSignoffUploading(false);
                e.target.value = "";
              }
            };

            const handleMarkJobComplete = async () => {
              setIcCompleting(true);
              try {
                await (supabase.from("cab_jobs") as any).update({
                  status: "complete",
                  production_stage_key: "complete",
                  production_stage: "complete",
                  updated_at: new Date().toISOString(),
                }).eq("id", job.id);
                if (companyId) {
                  await insertCabEvent({ companyId, eventType: "job.completed", jobId: job.id, payload: {} });
                  await insertCabEvent({ companyId, eventType: "invoice.final_requested", jobId: job.id, payload: {} });
                }
                toast({ title: "Job marked complete — final invoice requested" });
                load();
              } catch (err: any) {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              } finally {
                setIcCompleting(false);
              }
            };

            return (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                  <ClipboardCheck size={14} className="text-primary" /> Installation & Completion
                </h3>

                {/* Installation Date (read-only) */}
                {job.install_date && (
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarDays size={14} className="text-muted-foreground" />
                    <span className="text-muted-foreground">Install Date:</span>
                    <span className="font-medium">{format(new Date(job.install_date), "dd MMM yyyy")}</span>
                  </div>
                )}

                {/* Installation Complete */}
                <div className="flex items-center justify-between p-3 rounded border border-border">
                  <div className="flex items-center gap-2">
                    {isInstallDone ? <CheckCircle2 size={14} className="text-emerald-500" /> : <span className="text-muted-foreground text-xs">●</span>}
                    <span className="text-sm font-medium">Installation Complete</span>
                    {job.install_completed_at && <span className="text-[10px] text-muted-foreground">· {format(new Date(job.install_completed_at), "dd MMM yyyy")}</span>}
                  </div>
                  {!isInstallDone && (
                    <Button size="sm" variant="outline" onClick={handleIcInstallComplete}>
                      <CheckCircle2 size={12} className="mr-1" /> Mark Complete
                    </Button>
                  )}
                </div>

                {/* Fitter Notes */}
                <div className="space-y-1">
                  <Label className="text-xs">Fitter Notes</Label>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Notes from the installation team…"
                    defaultValue={job.fitter_notes || ""}
                    onChange={(e) => setIcFitterNotes(e.target.value)}
                    onBlur={() => {
                      if (icFitterNotes && icFitterNotes !== (job.fitter_notes || "")) handleIcFitterNotes();
                    }}
                  />
                </div>

                {/* Final Sign-Off Document */}
                <div className="space-y-2">
                  <Label className="text-xs">Final Sign-Off Document</Label>
                  {hasSignoff && (
                    <a href={job.final_signoff_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary underline flex items-center gap-1">
                      <FileText size={12} /> View uploaded document
                    </a>
                  )}
                  <label>
                    <Button size="sm" variant="outline" asChild disabled={icSignoffUploading}>
                      <span className="cursor-pointer">
                        {icSignoffUploading ? <><Loader2 size={14} className="animate-spin mr-1" /> Uploading…</> : <><FileText size={14} className="mr-1" /> {hasSignoff ? "Replace Document" : "Upload Document"}</>}
                      </span>
                    </Button>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleIcSignoffUpload} />
                  </label>
                </div>

                {/* Mark Job Complete */}
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!canComplete || icCompleting}
                  onClick={handleMarkJobComplete}
                >
                  <Star size={12} className="mr-1" /> {icCompleting ? "Completing…" : "Mark Job Complete"}
                </Button>
                {!canComplete && (
                  <p className="text-[10px] text-muted-foreground">
                    {!isInstallDone && "Mark installation complete"}
                    {!isInstallDone && !hasSignoff && " and "}
                    {!hasSignoff && "upload sign-off document"}
                    {" to enable"}
                  </p>
                )}
              </div>
            );
          })()}
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

      {/* Completion Photos */}
      {["awaiting_signoff", "complete", "closed", "closed_paid", "installation_complete", "practical_completed"].includes(stageKey || "") && companyId && (
        <CompletionPhotos jobId={job.id} companyId={companyId} />
      )}

      {/* Install Complete Confirmation Dialog */}
      <Dialog open={installCompleteOpen} onOpenChange={setInstallCompleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Install Complete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Send sign-off request to <span className="font-medium text-foreground">{customer?.email || "customer"}</span>?
          </p>
          <p className="text-xs text-muted-foreground">
            The customer will receive an email with a link to digitally sign off the installation.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setInstallCompleteOpen(false)} disabled={installCompleteSending}>
              Cancel
            </Button>
            <Button size="sm" disabled={installCompleteSending || !customer?.email} onClick={async () => {
              setInstallCompleteSending(true);
              try {
                const signOffToken = crypto.randomUUID();
                console.log("[InstallComplete] Generated sign_off_token:", signOffToken);
                console.log("[InstallComplete] Job ID:", job.id, "Company ID:", companyId);

                // Save token and update stage
                const { data: updateData, error: updateError } = await (supabase.from("cab_jobs") as any).update({
                  sign_off_token: signOffToken,
                  current_stage_key: "awaiting_signoff",
                  state: "installed_pending_signoff",
                  updated_at: new Date().toISOString(),
                }).eq("id", job.id).eq("company_id", companyId).select("id, sign_off_token");

                console.log("[InstallComplete] Update result:", { data: updateData, error: updateError });

                if (updateError) throw new Error(`Failed to save token: ${updateError.message}`);

                // Verify token was saved
                const { data: verifyData } = await (supabase.from("cab_jobs") as any)
                  .select("sign_off_token").eq("id", job.id).single();
                console.log("[InstallComplete] Verified token in DB:", verifyData?.sign_off_token);

                const savedToken = verifyData?.sign_off_token;
                if (!savedToken) {
                  throw new Error("sign_off_token was not saved to the database — aborting email send");
                }

                // Build URL with the verified token
                const signOffUrl = `https://enclaveworkflowandhr.lovable.app/sign-off?job_ref=${encodeURIComponent(job.job_ref)}&token=${savedToken}`;
                console.log("[InstallComplete] Sign-off URL:", signOffUrl);

                // Insert event
                await insertCabEvent({
                  companyId: companyId!,
                  eventType: "install.complete_requested",
                  jobId: job.id,
                  payload: { job_ref: job.job_ref, customer_email: customer?.email },
                });

                // Send sign-off email
                await supabase.functions.invoke("send-email", {
                  body: {
                    to: customer.email,
                    subject: `Installation Complete — Please Sign Off — ${job.job_ref}`,
                    replyTo: "danny@enclavecabinetry.com",
                    html: `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #1a1a1a;">Installation Complete</h2>
                        <p>Hi ${customer.first_name},</p>
                        <p>Your installation is now complete. Please take a moment to sign off your project using the link below.</p>
                        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
                          <p style="margin: 4px 0;"><strong>Job:</strong> ${job.job_ref} — ${job.job_title}</p>
                        </div>
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="${signOffUrl}" style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                            Sign Off Installation
                          </a>
                        </div>
                        <p>If you have any questions please call us on 07944608098.</p>
                        <p>Kind regards,<br/>Enclave Cabinetry</p>
                      </div>
                    `,
                  },
                });

                toast({ title: "Sign-off request sent", description: `Email sent to ${customer.email}` });
                setInstallCompleteOpen(false);
                load();
              } catch (err: any) {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              } finally {
                setInstallCompleteSending(false);
              }
            }}>
              {installCompleteSending ? "Sending…" : "Send Sign-Off Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Job - admin only */}
      {userRole === "admin" && job && (
        <>
           <div className="border-t border-border pt-8 mt-8 space-y-3">
            <Button variant="destructive" onClick={() => setDeleteOpen(true)} className="flex items-center gap-2">
              <Trash2 size={16} /> Delete Job
            </Button>
          </div>

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Job</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this job? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteLoading}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    setDeleteLoading(true);
                    try {
                      await deleteCabJob(job.id);
                      toast({ title: "Job deleted" });
                      navigate("/admin/leads");
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    } finally { setDeleteLoading(false); }
                  }}
                >
                  {deleteLoading ? "Deleting…" : "Delete Job"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

    </div>
  );
}
