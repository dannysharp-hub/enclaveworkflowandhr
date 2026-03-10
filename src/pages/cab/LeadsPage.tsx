import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { getCabCompanyId, generateJobRef, insertCabEvent } from "@/lib/cabHelpers";
import { deleteCabJob } from "@/lib/cabJobDelete";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, ArrowRight, AlertTriangle, HardDrive, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface LeadJob {
  id: string;
  job_ref: string;
  job_title: string;
  room_type: string | null;
  state: string | null;
  current_stage_key: string | null;
  created_at: string;
  customer_id: string;
  status: string;
  cab_customers?: { first_name: string; last_name: string; phone: string | null; email: string | null };
}

const ACTIVE_STAGES = [
  "lead_captured", "ballpark_sent", "appointment_requested",
  "appointment_booked", "quote_sent", "quote_viewed", "awaiting_deposit", "project_confirmed",
];

const JOB_TYPES = ["Wardrobe", "Home Office", "Commercial Fit-out", "Other"] as const;
const SOURCES = ["Word of mouth", "Website", "Referral", "Social media", "Other"] as const;

export default function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadJob[]>([]);
  const [allActiveJobs, setAllActiveJobs] = useState<LeadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [deleteLead, setDeleteLead] = useState<LeadJob | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const cid = await getCabCompanyId();
    if (!cid) { navigate("/admin/bootstrap"); return; }
    setCompanyId(cid);

    const [leadsRes, activeRes] = await Promise.all([
      (supabase.from("cab_jobs") as any)
        .select("*, cab_customers(first_name, last_name, phone, email)")
        .eq("company_id", cid)
        .order("created_at", { ascending: false }),
      (supabase.from("cab_jobs") as any)
        .select("id, customer_id, job_ref, current_stage_key, status")
        .eq("company_id", cid)
        .in("current_stage_key", ACTIVE_STAGES)
        .neq("status", "closed")
        .neq("status", "cancelled"),
    ]);

    setLeads(leadsRes.data ?? []);
    setAllActiveJobs(activeRes.data ?? []);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const duplicateCustomerIds = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const j of allActiveJobs) {
      countMap.set(j.customer_id, (countMap.get(j.customer_id) || 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [cid, count] of countMap) {
      if (count > 1) dupes.add(cid);
    }
    return dupes;
  }, [allActiveJobs]);

  const dupJobRefs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const j of allActiveJobs) {
      if (duplicateCustomerIds.has(j.customer_id)) {
        const existing = map.get(j.customer_id) || [];
        existing.push(j.job_ref);
        map.set(j.customer_id, existing);
      }
    }
    return map;
  }, [allActiveJobs, duplicateCustomerIds]);

  const handleImportFromDrive = async () => {
    if (!companyId) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "scan_root_cab", company_id: companyId },
      });
      if (error) throw error;
      const { created = 0, skipped = 0, skipped_details = [], conflicts = [], total_folders_found = 0, folder_names = [] } = data || {};
      if (created === 0 && conflicts.length === 0) {
        const skipReasons = skipped_details.map((s: any) => `• ${s.folder}: ${s.reason}`).join("\n");
        toast({
          title: "No new projects found",
          description: `Found ${total_folders_found} folder(s) in Drive root.\n${skipped} skipped:\n${skipReasons || "None"}${conflicts.length ? `\nConflicts: ${conflicts.join(", ")}` : ""}`,
        });
        console.log("[Drive Import] Details:", { total_folders_found, folder_names, skipped_details, conflicts });
      } else {
        toast({
          title: `Imported ${created} project${created !== 1 ? "s" : ""} from Drive`,
          description: `${total_folders_found} folders found, ${skipped} skipped.${conflicts.length > 0 ? ` ${conflicts.length} conflict(s): ${conflicts[0]}` : ""}`,
        });
        console.log("[Drive Import] Details:", { total_folders_found, folder_names, skipped_details, conflicts });
        load();
      }
    } catch (err: any) {
      toast({ title: "Drive import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteLead = useCallback(async () => {
    if (!deleteLead) return;
    setDeleting(true);
    try {
      await deleteCabJob(deleteLead.id);
      toast({ title: "Job deleted", description: `${deleteLead.job_ref} removed` });
      setDeleteLead(null);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  }, [deleteLead, load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} active lead{leads.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleImportFromDrive} disabled={importing || !companyId}>
            {importing ? <Loader2 size={16} className="animate-spin" /> : <HardDrive size={16} />}
            {importing ? "Importing…" : "Import from Drive"}
          </Button>
          <Button onClick={() => setDialogOpen(true)}><Plus size={16} /> Create Lead</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
          No leads yet. Create one or share your enquiry form.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map(lead => {
                const isDuplicate = duplicateCustomerIds.has(lead.customer_id);
                const otherRefs = (dupJobRefs.get(lead.customer_id) || []).filter(r => r !== lead.job_ref);
                return (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/jobs/${lead.job_ref}`)}>
                    <TableCell className="font-mono text-xs">
                      {lead.job_ref}
                      {isDuplicate && (
                        <Badge variant="destructive" className="ml-1.5 text-[9px] px-1.5 py-0">
                          <AlertTriangle size={10} className="mr-0.5" /> DUP
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.cab_customers?.first_name} {lead.cab_customers?.last_name}
                      {isDuplicate && otherRefs.length > 0 && (
                        <span className="block text-[10px] text-destructive mt-0.5">
                          Also: {otherRefs.join(", ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{lead.room_type || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{lead.current_stage_key?.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{format(new Date(lead.created_at), "dd MMM HH:mm")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <ArrowRight size={14} className="text-muted-foreground" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteLead(lead); }}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateLeadDialog open={dialogOpen} onOpenChange={setDialogOpen} companyId={companyId} onSuccess={load} />

      <AlertDialog open={!!deleteLead} onOpenChange={o => { if (!o) setDeleteLead(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">{deleteLead?.job_ref}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLead} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Create Lead Dialog ─── */

interface LeadForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  postcode: string;
  jobType: string;
  notes: string;
  source: string;
}

const EMPTY_FORM: LeadForm = {
  firstName: "", lastName: "", phone: "", email: "",
  street: "", city: "", postcode: "",
  jobType: "", notes: "", source: "",
};

function CreateLeadDialog({ open, onOpenChange, companyId, onSuccess }: {
  open: boolean; onOpenChange: (o: boolean) => void; companyId: string | null; onSuccess: () => void;
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState<LeadForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState(false);

  const update = (key: keyof LeadForm, val: string) => {
    if (key === "phone" && val.trim()) setPhoneError(false);
    setForm(prev => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone.trim()) { setPhoneError(true); return; }
    if (!companyId) return;
    setSubmitting(true);
    try {
      const result = await submitLead(companyId, form);
      toast({
        title: result.reused ? "Lead merged into existing job" : "Lead created",
        description: result.reused ? `Reused ${result.jobRef} — duplicate enquiry merged` : `New job ${result.jobRef}`,
      });
      setForm({ ...EMPTY_FORM });
      onOpenChange(false);
      onSuccess();
      navigate(`/admin/jobs/${result.jobRef}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-mono">New Lead</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">Customer</legend>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">First Name *</Label><Input required value={form.firstName} onChange={e => update("firstName", e.target.value)} /></div>
              <div><Label className="text-xs">Last Name *</Label><Input required value={form.lastName} onChange={e => update("lastName", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Phone <span className="text-destructive">*</span></Label>
                <Input type="tel" required value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="07700 900000" className={phoneError ? "border-destructive" : ""} />
                {phoneError && <p className="text-xs text-destructive mt-1">Phone number is required</p>}
              </div>
              <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e => update("email", e.target.value)} placeholder="name@example.com" /></div>
            </div>
          </fieldset>

          {/* Property */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">Property Address</legend>
            <div><Label className="text-xs">Street</Label><Input value={form.street} onChange={e => update("street", e.target.value)} placeholder="123 High Street" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">City</Label><Input value={form.city} onChange={e => update("city", e.target.value)} /></div>
              <div><Label className="text-xs">Postcode</Label><Input value={form.postcode} onChange={e => update("postcode", e.target.value)} placeholder="AB1 2CD" /></div>
            </div>
          </fieldset>

          {/* Job details */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">Project Details</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Job Type *</Label>
                <Select value={form.jobType} onValueChange={v => update("jobType", v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {JOB_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">How they heard about us</Label>
                <Select value={form.source} onValueChange={v => update("source", v)}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes / Description</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={3}
                value={form.notes}
                onChange={e => update("notes", e.target.value)}
                placeholder="Brief description of what the customer needs…"
              />
            </div>
          </fieldset>

          <Button type="submit" disabled={submitting || !form.firstName || !form.lastName || !form.jobType} className="w-full">
            {submitting ? "Creating…" : "Create Lead"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Shared lead submission logic (used by admin form + public enquiry) ─── */

const ACTIVE_STAGES_CLIENT = [
  "lead_captured", "ballpark_sent", "appointment_requested",
  "appointment_booked", "quote_sent", "quote_viewed", "awaiting_deposit",
];

export async function submitLead(companyId: string, form: {
  firstName: string; lastName: string; phone: string; email: string;
  street?: string; city?: string; postcode: string;
  jobType?: string; notes: string; source?: string;
  // Legacy compat
  address?: string; roomType?: string; dimensions?: string;
}): Promise<{ jobId: string; jobRef: string; reused: boolean }> {
  const normEmail = form.email?.trim().toLowerCase() || "";
  const normPhone = form.phone?.replace(/[\s\-\(\)\.]/g, "") || "";
  const jobType = form.jobType || form.roomType || "Project";
  const street = form.street || form.address || "";
  const postcode = form.postcode || "";

  // Upsert customer (match by email or phone)
  let customerId: string | null = null;

  if (normEmail) {
    const { data: existing } = await (supabase.from("cab_customers") as any)
      .select("id").eq("company_id", companyId).ilike("email", normEmail).maybeSingle();
    if (existing) customerId = existing.id;
  }

  if (!customerId && normPhone) {
    const { data: existing } = await (supabase.from("cab_customers") as any)
      .select("id").eq("company_id", companyId).eq("phone", normPhone).maybeSingle();
    if (existing) customerId = existing.id;
  }

  if (customerId) {
    await (supabase.from("cab_customers") as any).update({
      first_name: form.firstName,
      last_name: form.lastName,
      phone: normPhone || null,
      email: normEmail || null,
      address_line_1: street || null,
      city: form.city || null,
      postcode: postcode || null,
    }).eq("id", customerId);
  } else {
    const { data: newCust, error: custErr } = await (supabase.from("cab_customers") as any)
      .insert({
        company_id: companyId,
        first_name: form.firstName,
        last_name: form.lastName,
        phone: normPhone || null,
        email: normEmail || null,
        address_line_1: street || null,
        city: form.city || null,
        postcode: postcode || null,
      }).select("id").single();
    if (custErr) throw custErr;
    customerId = newCust.id;
  }

  // Check for existing active job (within 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: activeJobs } = await (supabase.from("cab_jobs") as any)
    .select("id, job_ref, current_stage_key, room_type, property_address_json")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .in("current_stage_key", ACTIVE_STAGES_CLIENT)
    .neq("status", "closed")
    .neq("status", "cancelled")
    .gte("created_at", ninetyDaysAgo.toISOString())
    .order("created_at", { ascending: false });

  const activeCount = activeJobs?.length || 0;

  const isDiffProject = (j: any) => {
    if (!jobType || jobType === "Project") return false;
    const diffRoom = j.room_type && j.room_type.toLowerCase() !== jobType.toLowerCase();
    const existingPc = j.property_address_json?.postcode?.trim().toLowerCase() || "";
    const newPc = postcode?.trim().toLowerCase() || "";
    const diffAddr = newPc && existingPc && newPc !== existingPc;
    return !!(diffRoom && diffAddr);
  };

  if (activeCount > 1) {
    const latest = activeJobs![0];
    await insertCabEvent({
      companyId, eventType: "lead.possible_duplicate", jobId: latest.id, customerId: customerId!,
      payload: { room_type: jobType, active_job_count: activeCount, active_job_refs: activeJobs!.map((j: any) => j.job_ref), note: "Multiple active jobs — flagged" },
    });
    return { jobId: latest.id, jobRef: latest.job_ref, reused: true };
  }

  if (activeCount === 1 && !isDiffProject(activeJobs![0])) {
    const existingJob = activeJobs![0];
    await (supabase.from("cab_jobs") as any).update({
      room_type: jobType !== "Project" ? jobType : existingJob.room_type,
      property_address_json: street || postcode ? { address: street, city: form.city || "", postcode } : undefined,
      updated_at: new Date().toISOString(),
    }).eq("id", existingJob.id);

    await insertCabEvent({
      companyId, eventType: "lead.resubmitted", jobId: existingJob.id, customerId: customerId!,
      payload: { room_type: jobType, notes: form.notes, source: form.source || null, original_stage: existingJob.current_stage_key },
    });
    return { jobId: existingJob.id, jobRef: existingJob.job_ref, reused: true };
  }

  // Create new job
  const jobRef = await generateJobRef(companyId, form.firstName, form.lastName);

  const { data: job, error: jobErr } = await (supabase.from("cab_jobs") as any)
    .insert({
      company_id: companyId,
      customer_id: customerId,
      job_ref: jobRef,
      job_title: `${jobType} — ${form.lastName}`,
      room_type: jobType,
      status: "lead",
      state: "awaiting_ballpark",
      current_stage_key: "lead_captured",
      property_address_json: { address: street, city: form.city || "", postcode },
    }).select("id").single();

  if (jobErr) throw jobErr;

  await insertCabEvent({
    companyId, eventType: "lead.captured", jobId: job.id, customerId: customerId!,
    payload: { room_type: jobType, notes: form.notes, source: form.source || null },
  });

  return { jobId: job.id, jobRef, reused: false };
}
