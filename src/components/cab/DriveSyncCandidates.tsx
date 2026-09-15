import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getCabCompanyId, insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FolderOpen, ExternalLink, FolderX, Plus, EyeOff, HardDrive } from "lucide-react";
import { format } from "date-fns";

interface Candidate {
  id: string;
  company_id: string;
  folder_name: string;
  folder_id: string;
  folder_url: string | null;
  status: string;
  job_ref: string | null;
  created_at: string;
}

export default function DriveSyncCandidates() {
  const { user, userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const [pending, setPending] = useState<Candidate[]>([]);
  const [missing, setMissing] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState<Candidate | null>(null);

  const load = useCallback(async () => {
    const { data } = await (supabase.from("drive_sync_candidates") as any)
      .select("*")
      .in("status", ["pending", "missing_folder"])
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data || []) as Candidate[];
    setPending(rows.filter(r => r.status === "pending"));
    setMissing(rows.filter(r => r.status === "missing_folder"));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleIgnore = async (c: Candidate) => {
    setBusy(c.id);
    try {
      const { error } = await (supabase.from("drive_sync_candidates") as any)
        .update({ status: "ignored", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", c.id);
      if (error) throw error;
      toast({ title: "Folder ignored", description: c.folder_name });
      setPending(prev => prev.filter(p => p.id !== c.id));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return null;
  if (pending.length === 0 && missing.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HardDrive size={14} className="text-primary" />
        <h2 className="text-sm font-mono font-bold text-foreground">Drive Folder Sync</h2>
      </div>

      {/* ─── Unmatched Drive folders awaiting review ─── */}
      {pending.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-card divide-y divide-border">
          <div className="px-4 py-2.5 flex items-center gap-2">
            <FolderOpen size={13} className="text-primary" />
            <span className="text-xs font-medium text-foreground">Drive folders with no matching job</span>
            <Badge variant="secondary" className="text-[10px]">{pending.length}</Badge>
          </div>
          {pending.map(c => (
            <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-sm text-foreground truncate">{c.folder_name}</div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                  <span>Found {format(new Date(c.created_at), "dd MMM yyyy HH:mm")}</span>
                  {c.folder_url && (
                    <a href={c.folder_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline">
                      Open in Drive <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" onClick={() => setCreating(c)} disabled={busy === c.id}>
                    <Plus size={12} /> Create job
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleIgnore(c)} disabled={busy === c.id}>
                    <EyeOff size={12} /> Ignore
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Jobs with no Drive folder (read-only) ─── */}
      {missing.length > 0 && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          <div className="px-4 py-2.5 flex items-center gap-2">
            <FolderX size={13} className="text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Jobs with no folder in Drive</span>
            <Badge variant="outline" className="text-[10px]">{missing.length}</Badge>
          </div>
          {missing.map(c => (
            <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-foreground truncate">{c.job_ref || c.folder_name}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                Last checked {format(new Date(c.created_at), "dd MMM yyyy")}
              </span>
            </div>
          ))}
        </div>
      )}

      <CreateJobFromFolderDialog
        candidate={creating}
        onClose={() => setCreating(null)}
        onCreated={() => { setCreating(null); load(); }}
      />
    </div>
  );
}

/* ─── Create job from a Drive folder (customer details entered by hand) ─── */

const JOB_TYPES = ["Wardrobe", "Home Office", "Commercial Fit-out", "Other"];

function CreateJobFromFolderDialog({ candidate, onClose, onCreated }: {
  candidate: Candidate | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [jobRef, setJobRef] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [jobType, setJobType] = useState("Wardrobe");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (candidate) {
      setJobRef(candidate.folder_name);
      setFirstName(""); setLastName(""); setPhone(""); setEmail(""); setJobType("Wardrobe");
    }
  }, [candidate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    setSubmitting(true);
    try {
      const companyId = candidate.company_id || (await getCabCompanyId());
      if (!companyId) throw new Error("No company found for this account");

      const normEmail = email.trim().toLowerCase();
      const normPhone = phone.replace(/[\s\-()\.]/g, "");

      // Find or create the customer — never guessed from the folder name
      let customerId: string | null = null;
      if (normEmail) {
        const { data } = await (supabase.from("cab_customers") as any)
          .select("id").eq("company_id", companyId).ilike("email", normEmail).maybeSingle();
        if (data) customerId = data.id;
      }
      if (!customerId && normPhone) {
        const { data } = await (supabase.from("cab_customers") as any)
          .select("id").eq("company_id", companyId).eq("phone", normPhone).maybeSingle();
        if (data) customerId = data.id;
      }
      if (!customerId) {
        const { data, error } = await (supabase.from("cab_customers") as any)
          .insert({
            company_id: companyId,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: normPhone || null,
            email: normEmail || null,
          }).select("id").single();
        if (error) throw error;
        customerId = data.id;
      }

      const { data: job, error: jobErr } = await (supabase.from("cab_jobs") as any)
        .insert({
          company_id: companyId,
          customer_id: customerId,
          job_ref: jobRef.trim(),
          job_title: `${jobType} — ${lastName.trim()}`,
          room_type: jobType,
          status: "lead",
          state: "awaiting_ballpark",
          current_stage_key: "lead_captured",
        }).select("id").single();
      if (jobErr) throw jobErr;

      // Link the Drive folder that started this
      const url = candidate.folder_url || `https://drive.google.com/drive/folders/${candidate.folder_id}`;
      await (supabase.from("cab_job_files") as any).upsert(
        { company_id: companyId, job_id: job.id, url, file_type: "drive_folder" },
        { onConflict: "job_id,url", ignoreDuplicates: true },
      );

      await (supabase.from("drive_sync_candidates") as any).update({
        status: "created",
        created_job_id: job.id,
        job_ref: jobRef.trim(),
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", candidate.id);

      await insertCabEvent({
        companyId,
        eventType: "lead.captured",
        jobId: job.id,
        customerId: customerId!,
        payload: { room_type: jobType, source: "drive_folder_sync", folder_name: candidate.folder_name },
      }).catch(() => {});

      toast({ title: "Job created", description: `${jobRef.trim()} linked to its Drive folder` });
      onCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!candidate} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-mono">Create Job from Drive Folder</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs">Job Ref *</Label>
            <Input required value={jobRef} onChange={e => setJobRef(e.target.value)} className="font-mono" />
            <p className="text-[10px] text-muted-foreground mt-1">Prefilled from the Drive folder name.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">First Name *</Label><Input required value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
            <div><Label className="text-xs">Last Name *</Label><Input required value={lastName} onChange={e => setLastName(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Phone *</Label><Input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 900000" /></div>
            <div><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">Job Type</Label>
            <select
              value={jobType}
              onChange={e => setJobType(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground"
            >
              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating…" : "Create Job"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
