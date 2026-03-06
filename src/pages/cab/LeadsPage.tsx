import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { getCabCompanyId, generateJobRef, insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRight, AlertTriangle } from "lucide-react";
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

export default function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadJob[]>([]);
  const [allActiveJobs, setAllActiveJobs] = useState<LeadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cid = await getCabCompanyId();
    if (!cid) { navigate("/admin/bootstrap"); return; }
    setCompanyId(cid);

    const [leadsRes, activeRes] = await Promise.all([
      (supabase.from("cab_jobs") as any)
        .select("*, cab_customers(first_name, last_name, phone, email)")
        .eq("company_id", cid)
        .eq("status", "lead")
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

  // Build a set of customer_ids that have >1 active job (duplicates)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} active lead{leads.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus size={16} /> Create Lead</Button>
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
                    <TableCell><Badge variant="outline" className="text-[10px]">{lead.current_stage_key?.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{format(new Date(lead.created_at), "dd MMM HH:mm")}</TableCell>
                    <TableCell><ArrowRight size={14} className="text-muted-foreground" /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateLeadDialog open={dialogOpen} onOpenChange={setDialogOpen} companyId={companyId} onSuccess={load} />
    </div>
  );
}

function CreateLeadDialog({ open, onOpenChange, companyId, onSuccess }: {
  open: boolean; onOpenChange: (o: boolean) => void; companyId: string | null; onSuccess: () => void;
}) {
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", address: "", postcode: "", roomType: "", dimensions: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSubmitting(true);
    try {
      const result = await submitLead(companyId, form);
      toast({
        title: result.reused ? "Lead merged into existing job" : "Lead created",
        description: result.reused ? `Reused ${result.jobRef} — duplicate enquiry merged` : `New job ${result.jobRef}`,
      });
      setForm({ firstName: "", lastName: "", phone: "", email: "", address: "", postcode: "", roomType: "", dimensions: "", notes: "" });
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-mono">Create Lead</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First Name *</Label><Input required value={form.firstName} onChange={e => update("firstName", e.target.value)} /></div>
            <div><Label>Last Name *</Label><Input required value={form.lastName} onChange={e => update("lastName", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => update("phone", e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => update("email", e.target.value)} /></div>
          </div>
          <div><Label>Address</Label><Input value={form.address} onChange={e => update("address", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Postcode</Label><Input value={form.postcode} onChange={e => update("postcode", e.target.value)} /></div>
            <div><Label>Room Type</Label><Input value={form.roomType} onChange={e => update("roomType", e.target.value)} placeholder="e.g. Kitchen" /></div>
          </div>
          <div><Label>Rough Dimensions</Label><Input value={form.dimensions} onChange={e => update("dimensions", e.target.value)} placeholder="e.g. 4m x 3m L-shape" /></div>
          <div><Label>Notes</Label><textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={form.notes} onChange={e => update("notes", e.target.value)} /></div>
          <Button type="submit" disabled={submitting} className="w-full">{submitting ? "Creating…" : "Create Lead"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ACTIVE_STAGES_CLIENT = [
  "lead_captured", "ballpark_sent", "appointment_requested",
  "appointment_booked", "quote_sent", "quote_viewed", "awaiting_deposit",
];

/** Shared lead submission logic (used by admin form + public enquiry) — now idempotent */
export async function submitLead(companyId: string, form: {
  firstName: string; lastName: string; phone: string; email: string;
  address: string; postcode: string; roomType: string; dimensions: string; notes: string;
}): Promise<{ jobId: string; jobRef: string; reused: boolean }> {
  const normEmail = form.email?.trim().toLowerCase() || "";
  const normPhone = form.phone?.trim() || "";

  // Upsert customer (match by email or phone)
  let customerId: string | null = null;

  if (normEmail) {
    const { data: existing } = await (supabase.from("cab_customers") as any)
      .select("id")
      .eq("company_id", companyId)
      .ilike("email", normEmail)
      .maybeSingle();
    if (existing) customerId = existing.id;
  }

  if (!customerId && normPhone) {
    const { data: existing } = await (supabase.from("cab_customers") as any)
      .select("id")
      .eq("company_id", companyId)
      .eq("phone", normPhone)
      .maybeSingle();
    if (existing) customerId = existing.id;
  }

  if (customerId) {
    await (supabase.from("cab_customers") as any).update({
      first_name: form.firstName,
      last_name: form.lastName,
      phone: normPhone || null,
      email: normEmail || null,
      address_line_1: form.address || null,
      postcode: form.postcode || null,
    }).eq("id", customerId);
  } else {
    const { data: newCust, error: custErr } = await (supabase.from("cab_customers") as any)
      .insert({
        company_id: companyId,
        first_name: form.firstName,
        last_name: form.lastName,
        phone: normPhone || null,
        email: normEmail || null,
        address_line_1: form.address || null,
        postcode: form.postcode || null,
      })
      .select("id")
      .single();
    if (custErr) throw custErr;
    customerId = newCust.id;
  }

  // Check for existing active job
  const { data: existingJob } = await (supabase.from("cab_jobs") as any)
    .select("id, job_ref, current_stage_key")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .in("current_stage_key", ACTIVE_STAGES_CLIENT)
    .neq("status", "closed")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingJob) {
    // Reuse — update fields + emit resubmitted event
    await (supabase.from("cab_jobs") as any).update({
      room_type: form.roomType || existingJob.room_type,
      property_address_json: form.address || form.postcode ? { address: form.address, postcode: form.postcode } : undefined,
      updated_at: new Date().toISOString(),
    }).eq("id", existingJob.id);

    await insertCabEvent({
      companyId,
      eventType: "lead.resubmitted",
      jobId: existingJob.id,
      customerId: customerId!,
      payload: {
        room_type: form.roomType,
        rough_dimensions: form.dimensions,
        notes: form.notes,
        note: "Duplicate enquiry merged via admin form",
        original_stage: existingJob.current_stage_key,
      },
    });

    return { jobId: existingJob.id, jobRef: existingJob.job_ref, reused: true };
  }

  // No active job → create new
  const jobRef = await generateJobRef(companyId, form.firstName, form.lastName);

  const { data: job, error: jobErr } = await (supabase.from("cab_jobs") as any)
    .insert({
      company_id: companyId,
      customer_id: customerId,
      job_ref: jobRef,
      job_title: `${form.roomType || "Project"} – ${form.firstName} ${form.lastName}`,
      room_type: form.roomType || null,
      status: "lead",
      state: "awaiting_ballpark",
      current_stage_key: "lead_captured",
      property_address_json: {
        address: form.address,
        postcode: form.postcode,
      },
    })
    .select("id")
    .single();

  if (jobErr) throw jobErr;

  await insertCabEvent({
    companyId,
    eventType: "lead.created",
    jobId: job.id,
    customerId: customerId!,
    payload: {
      room_type: form.roomType,
      rough_dimensions: form.dimensions,
      notes: form.notes,
    },
  });

  return { jobId: job.id, jobRef, reused: false };
}
