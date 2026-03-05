import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { insertCabEvent } from "@/lib/cabHelpers";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Truck, Camera, CheckCircle2, Play, ArrowLeft, MapPin, Calendar, Phone,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function InstallerJobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get assigned jobs in install-relevant stages
    const { data } = await (supabase.from("cab_jobs") as any)
      .select("*, cab_customers!cab_jobs_customer_id_fkey(first_name, last_name, phone, email, postcode, address_line_1, city)")
      .eq("install_assigned_to", user.id)
      .in("production_stage_key", ["ready_for_install", "installing", "install_complete"])
      .order("install_window_start", { ascending: true });

    setJobs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectJob = async (job: any) => {
    setSelectedJob(job);
    const cust = job.cab_customers;
    setCustomer(cust);

    // Load photos
    const { data: files } = await (supabase.from("cab_job_files") as any)
      .select("*")
      .eq("job_id", job.id)
      .eq("file_type", "install_photo")
      .order("created_at", { ascending: false });
    setPhotos(files ?? []);
  };

  const handleAddPhoto = async () => {
    if (!photoUrl.trim() || !selectedJob) return;
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase.from("cab_job_files") as any).insert({
      company_id: selectedJob.company_id,
      job_id: selectedJob.id,
      file_type: "install_photo",
      url: photoUrl.trim(),
      uploaded_by: user?.id,
    });
    setPhotoUrl("");
    toast({ title: "Photo added" });
    // Reload photos
    const { data: files } = await (supabase.from("cab_job_files") as any)
      .select("*").eq("job_id", selectedJob.id).eq("file_type", "install_photo").order("created_at", { ascending: false });
    setPhotos(files ?? []);
  };

  const handleMarkInstalling = async () => {
    if (!selectedJob) return;
    setActing(true);
    try {
      await insertCabEvent({
        companyId: selectedJob.company_id,
        eventType: "production.stage_changed",
        jobId: selectedJob.id,
        payload: { from: selectedJob.production_stage_key, to: "installing" },
      });
      toast({ title: "Marked as Installing" });
      setSelectedJob(null);
      load();
    } finally { setActing(false); }
  };

  const handleMarkComplete = async () => {
    if (!selectedJob) return;
    setActing(true);
    try {
      await insertCabEvent({
        companyId: selectedJob.company_id,
        eventType: "install.complete",
        jobId: selectedJob.id,
        payload: { completed_by: (await supabase.auth.getUser()).data.user?.id },
      });
      await insertCabEvent({
        companyId: selectedJob.company_id,
        eventType: "customer.signoff.requested",
        jobId: selectedJob.id,
      });
      toast({ title: "Install marked complete — sign-off requested" });
      setSelectedJob(null);
      load();
    } finally { setActing(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center animate-pulse">
          <Truck size={16} className="text-primary-foreground" />
        </div>
      </div>
    );
  }

  // Job detail view
  if (selectedJob) {
    const addr = selectedJob.property_address_json;
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <button onClick={() => setSelectedJob(null)} className="h-8 w-8 rounded-md flex items-center justify-center border border-border text-muted-foreground">
              <ArrowLeft size={16} />
            </button>
            <div>
              <span className="font-mono text-xs text-muted-foreground">{selectedJob.job_ref}</span>
              <h1 className="font-bold text-foreground text-sm">{selectedJob.job_title}</h1>
            </div>
            <Badge variant={selectedJob.production_stage_key === "installing" ? "default" : "secondary"} className="ml-auto text-[10px]">
              {selectedJob.production_stage_key.replace(/_/g, " ")}
            </Badge>
          </div>
        </header>

        <main className="max-w-lg mx-auto p-4 space-y-4">
          {/* Customer & Address */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="text-sm font-bold text-foreground">Customer</h3>
            <p className="text-sm text-foreground">{customer?.first_name} {customer?.last_name}</p>
            {customer?.phone && (
              <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-sm text-primary">
                <Phone size={14} /> {customer.phone}
              </a>
            )}
            {addr && (
              <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin size={14} className="mt-0.5 shrink-0" />
                <span>{addr.address} {addr.postcode}</span>
              </div>
            )}
          </div>

          {/* Install Window */}
          {(selectedJob.install_window_start || selectedJob.install_window_end) && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-2">
              <Calendar size={14} className="text-primary" />
              <span className="text-sm text-foreground">
                {selectedJob.install_window_start && format(new Date(selectedJob.install_window_start), "dd MMM yyyy HH:mm")}
                {selectedJob.install_window_end && ` – ${format(new Date(selectedJob.install_window_end), "HH:mm")}`}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {selectedJob.production_stage_key === "ready_for_install" && (
              <Button className="w-full" onClick={handleMarkInstalling} disabled={acting}>
                <Play size={14} /> {acting ? "Updating…" : "Start Installation"}
              </Button>
            )}
            {selectedJob.production_stage_key === "installing" && (
              <Button className="w-full" onClick={handleMarkComplete} disabled={acting}>
                <CheckCircle2 size={14} /> {acting ? "Updating…" : "Mark Install Complete"}
              </Button>
            )}
            {selectedJob.production_stage_key === "install_complete" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-500" />
                <span className="text-sm font-medium text-foreground">Installation complete — awaiting customer sign-off</span>
              </div>
            )}
          </div>

          {/* Photos */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Camera size={14} /> Install Photos
            </h3>
            <div className="flex gap-2">
              <Input
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="Paste photo URL…"
                className="text-xs"
              />
              <Button size="sm" onClick={handleAddPhoto} disabled={!photoUrl.trim()}>Add</Button>
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {photos.map(p => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                    className="rounded-lg border border-border bg-muted/30 p-2 text-xs text-primary hover:underline truncate">
                    📷 {p.url.split("/").pop()?.slice(0, 20) || "Photo"}
                  </a>
                ))}
              </div>
            )}
            {photos.length === 0 && <p className="text-xs text-muted-foreground">No photos uploaded yet.</p>}
          </div>
        </main>
      </div>
    );
  }

  // Jobs list
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <Truck size={20} className="text-primary" />
          <h1 className="font-bold text-foreground">My Installations</h1>
          <Badge variant="secondary" className="ml-auto">{jobs.length}</Badge>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-3">
        {jobs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Truck size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No installations assigned to you.</p>
          </div>
        )}

        {jobs.map(job => {
          const cust = job.cab_customers;
          return (
            <button
              key={job.id}
              onClick={() => selectJob(job)}
              className={cn(
                "w-full text-left rounded-lg border bg-card p-4 space-y-1 transition-all hover:shadow-md",
                job.production_stage_key === "installing" ? "border-primary shadow-sm" : "border-border"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-primary">{job.job_ref}</span>
                <Badge variant={job.production_stage_key === "installing" ? "default" : "secondary"} className="text-[10px]">
                  {job.production_stage_key.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="text-sm font-medium text-foreground">{job.job_title}</p>
              {cust && (
                <p className="text-xs text-muted-foreground">
                  {cust.first_name} {cust.last_name}
                  {cust.postcode && ` · ${cust.postcode}`}
                </p>
              )}
              {job.install_window_start && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar size={10} /> {format(new Date(job.install_window_start), "dd MMM yyyy")}
                </p>
              )}
            </button>
          );
        })}
      </main>
    </div>
  );
}
