import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import {
  ShieldCheck, ArrowLeft, LogOut, CheckCircle2, Clock, Circle,
  AlertTriangle, Camera, Send, FileText, Calendar, Wrench,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STAGE_DISPLAY_ORDER = ["Design", "CNC", "Edgebanding", "Assembly", "Spray", "Install Scheduled", "Installed"];

export default function ClientPortalJobPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [clientUser, setClientUser] = useState<any>(null);
  const [portalSettings, setPortalSettings] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [snagOpen, setSnagOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/portal/login"); return; }

    const { data: cu } = await (supabase.from("client_users") as any)
      .select("id, name, customer_id, tenant_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!cu) { navigate("/portal/login"); return; }
    setClientUser(cu);

    // Fetch portal settings
    const { data: settings } = await (supabase.from("client_portal_settings") as any)
      .select("*")
      .eq("tenant_id", cu.tenant_id)
      .maybeSingle();
    setPortalSettings(settings);

    // Log activity
    await (supabase.from("client_activity_log") as any).insert({
      client_user_id: cu.id,
      action: "client_viewed_job",
      job_id: jobId,
      tenant_id: cu.tenant_id,
    });

    const [jobRes, stagesRes, docsRes, issuesRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", jobId).single(),
      supabase.from("job_stages").select("*").eq("job_id", jobId).order("created_at"),
      (supabase.from("client_job_documents") as any).select("*, file_assets(id, title, category, file_reference)").eq("job_id", jobId).eq("visible_to_client", true),
      supabase.from("job_issues").select("*").eq("job_id", jobId!),
    ]);

    setJob(jobRes.data);
    setStages(stagesRes.data ?? []);
    setDocuments(docsRes.data ?? []);
    setIssues((issuesRes.data ?? []).filter((i: any) => i.category === "snag"));
    setLoading(false);
  }, [jobId, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login");
  };

  if (loading || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center animate-pulse">
          <ShieldCheck size={16} className="text-primary-foreground" />
        </div>
      </div>
    );
  }

  const done = stages.filter(s => s.status === "Done").length;
  const total = stages.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const installStage = stages.find(s => s.stage_name === "Install" || s.stage_name === "Install Scheduled");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/portal/dashboard")} className="h-7 w-7 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground">
              <ArrowLeft size={14} />
            </button>
            <div>
              <span className="font-mono text-xs text-muted-foreground">{job.job_id}</span>
              <h1 className="font-mono font-bold text-foreground text-sm">{job.job_name}</h1>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Summary */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-mono font-bold text-foreground">Project Summary</h2>
            <span className="text-sm font-mono text-primary">{pct}% complete</span>
          </div>
          <Progress value={pct} className="h-2 mb-3" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <MiniStat label="Parts" value={job.parts_count} />
            <MiniStat label="Materials" value={job.materials_count} />
            <MiniStat label="Stages Done" value={`${done}/${total}`} />
            {installStage?.due_date && <MiniStat label="Install Date" value={format(new Date(installStage.due_date), "dd MMM")} />}
          </div>
        </div>

        <Tabs defaultValue="progress" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="progress" className="text-xs font-mono">Progress</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs font-mono">Documents</TabsTrigger>
            {portalSettings?.allow_snag_submission && (
              <TabsTrigger value="snags" className="text-xs font-mono">Snags</TabsTrigger>
            )}
          </TabsList>

          {/* Progress Tab */}
          <TabsContent value="progress" className="space-y-2">
            {stages.map((stage, idx) => {
              const isDone = stage.status === "Done";
              const isActive = stage.status === "In Progress";
              return (
                <div key={stage.id} className={cn(
                  "rounded-lg border p-3 flex items-center gap-3",
                  isDone ? "border-primary/30 bg-primary/5" :
                  isActive ? "border-primary/50 bg-primary/10" :
                  "border-border bg-card"
                )}>
                  <div className="shrink-0">
                    {isDone ? <CheckCircle2 size={18} className="text-primary" /> :
                     isActive ? <Clock size={18} className="text-primary animate-pulse" /> :
                     <Circle size={18} className="text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", isDone || isActive ? "text-foreground" : "text-muted-foreground")}>
                      {stage.stage_name}
                    </p>
                    {stage.notes && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{stage.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {isDone && stage.updated_at && (
                      <span className="text-[10px] font-mono text-primary">{format(new Date(stage.updated_at), "dd MMM")}</span>
                    )}
                    {stage.due_date && !isDone && (
                      <span className="text-[10px] font-mono text-muted-foreground">Due {format(new Date(stage.due_date), "dd MMM")}</span>
                    )}
                  </div>
                </div>
              );
            })}
            {stages.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">No stages set up yet</p>
            )}
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-2">
            {documents.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">No documents shared yet</p>
            ) : (
              documents.map((doc: any) => (
                <div key={doc.id} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                  <FileText size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.file_assets?.title || "Document"}</p>
                    <p className="text-[10px] text-muted-foreground">{doc.file_assets?.category} · Shared {format(new Date(doc.shared_at), "dd MMM yyyy")}</p>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* Snags Tab */}
          {portalSettings?.allow_snag_submission && (
            <TabsContent value="snags" className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-sm font-bold text-foreground">Reported Snags</h3>
                <button
                  onClick={() => setSnagOpen(true)}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <AlertTriangle size={12} /> Report Snag
                </button>
              </div>
              {issues.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No snags reported</p>
              ) : (
                issues.map((issue: any) => (
                  <div key={issue.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-foreground">{issue.title}</p>
                      <span className={cn(
                        "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                        issue.status === "open" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
                      )}>
                        {issue.status}
                      </span>
                    </div>
                    {issue.description && <p className="text-xs text-muted-foreground">{issue.description}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(issue.reported_at), "dd MMM yyyy HH:mm")}</p>
                  </div>
                ))
              )}
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Snag Dialog */}
      <SnagDialog
        open={snagOpen}
        onOpenChange={setSnagOpen}
        jobId={jobId!}
        clientUser={clientUser}
        onSuccess={load}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <p className="text-lg font-mono font-bold text-foreground">{value}</p>
      <p className="text-[10px] font-mono text-muted-foreground">{label}</p>
    </div>
  );
}

function SnagDialog({ open, onOpenChange, jobId, clientUser, onSuccess }: {
  open: boolean; onOpenChange: (o: boolean) => void; jobId: string; clientUser: any; onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from("job_issues").insert({
        job_id: jobId,
        title,
        description,
        category: "snag",
        severity: "medium",
        reported_by: clientUser.id,
        tenant_id: clientUser.tenant_id,
      });
      if (error) throw error;

      // Log activity
      await (supabase.from("client_activity_log") as any).insert({
        client_user_id: clientUser.id,
        action: "client_uploaded_snag",
        job_id: jobId,
        tenant_id: clientUser.tenant_id,
      });

      toast({ title: "Snag reported", description: "We'll review it shortly." });
      setTitle("");
      setDescription("");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">Report a Snag</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-medium text-muted-foreground mb-1.5">TITLE</label>
            <input type="text" required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} className={inputClass} placeholder="Brief description of the issue" />
          </div>
          <div>
            <label className="block text-xs font-mono font-medium text-muted-foreground mb-1.5">DETAILS</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={4} className={inputClass + " h-auto py-2"} placeholder="Describe the issue in detail..." />
          </div>
          <button type="submit" disabled={submitting} className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {submitting ? "Submitting…" : "Submit Snag"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
