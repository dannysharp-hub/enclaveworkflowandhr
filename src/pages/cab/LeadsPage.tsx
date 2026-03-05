import { useState, useEffect, useCallback } from "react";
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
import { Plus, ArrowRight } from "lucide-react";
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
  cab_customers?: { first_name: string; last_name: string; phone: string | null; email: string | null };
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cid = await getCabCompanyId();
    if (!cid) { navigate("/admin/bootstrap"); return; }
    setCompanyId(cid);

    const { data } = await (supabase.from("cab_jobs") as any)
      .select("*, cab_customers(first_name, last_name, phone, email)")
      .eq("company_id", cid)
      .eq("status", "lead")
      .order("created_at", { ascending: false });

    setLeads(data ?? []);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

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
              {leads.map(lead => (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/admin/jobs/${lead.job_ref}`)}>
                  <TableCell className="font-mono text-xs">{lead.job_ref}</TableCell>
                  <TableCell>{lead.cab_customers?.first_name} {lead.cab_customers?.last_name}</TableCell>
                  <TableCell>{lead.room_type || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{lead.current_stage_key?.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{format(new Date(lead.created_at), "dd MMM HH:mm")}</TableCell>
                  <TableCell><ArrowRight size={14} className="text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
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
      await submitLead(companyId, form);
      toast({ title: "Lead created" });
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

/** Shared lead submission logic (used by admin form + public enquiry) */
export async function submitLead(companyId: string, form: {
  firstName: string; lastName: string; phone: string; email: string;
  address: string; postcode: string; roomType: string; dimensions: string; notes: string;
}) {
  // Upsert customer (match by email or phone)
  let customerId: string | null = null;

  if (form.email) {
    const { data: existing } = await (supabase.from("cab_customers") as any)
      .select("id")
      .eq("company_id", companyId)
      .eq("email", form.email)
      .maybeSingle();
    if (existing) customerId = existing.id;
  }

  if (!customerId && form.phone) {
    const { data: existing } = await (supabase.from("cab_customers") as any)
      .select("id")
      .eq("company_id", companyId)
      .eq("phone", form.phone)
      .maybeSingle();
    if (existing) customerId = existing.id;
  }

  if (customerId) {
    await (supabase.from("cab_customers") as any).update({
      first_name: form.firstName,
      last_name: form.lastName,
      phone: form.phone || null,
      email: form.email || null,
      address_line_1: form.address || null,
      postcode: form.postcode || null,
    }).eq("id", customerId);
  } else {
    const { data: newCust, error: custErr } = await (supabase.from("cab_customers") as any)
      .insert({
        company_id: companyId,
        first_name: form.firstName,
        last_name: form.lastName,
        phone: form.phone || null,
        email: form.email || null,
        address_line_1: form.address || null,
        postcode: form.postcode || null,
      })
      .select("id")
      .single();
    if (custErr) throw custErr;
    customerId = newCust.id;
  }

  // Generate job ref
  const jobRef = await generateJobRef(companyId, form.firstName, form.lastName);

  // Create job
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

  // Event
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

  return { jobId: job.id, jobRef };
}
