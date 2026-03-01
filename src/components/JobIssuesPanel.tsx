import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle, Plus, X, Check, Clock, User, ChevronDown, ChevronUp,
  MessageSquare, Camera,
} from "lucide-react";

interface Issue {
  id: string;
  title: string;
  description: string | null;
  category: string;
  severity: string;
  status: string;
  stage_name: string | null;
  reported_by: string;
  assigned_to: string | null;
  reported_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  photos: string[];
}

interface JobIssuesPanelProps {
  jobId: string;
  jobCode: string;
  readOnly?: boolean;
}

const SEVERITY_CONFIG: Record<string, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  high: { label: "High", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  medium: { label: "Medium", cls: "bg-primary/15 text-primary border-primary/30" },
  low: { label: "Low", cls: "bg-muted text-muted-foreground border-border" },
};

const CATEGORIES = ["quality", "missing_info", "material", "design", "scheduling", "damage", "other"];

export default function JobIssuesPanel({ jobId, jobCode, readOnly }: JobIssuesPanelProps) {
  const { user, tenantId } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [severity, setSeverity] = useState("medium");
  const [stageName, setStageName] = useState("");

  // Resolve state
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const load = useCallback(async () => {
    const { data } = await (supabase.from("job_issues") as any)
      .select("*")
      .eq("job_id", jobId)
      .order("reported_at", { ascending: false });
    setIssues((data ?? []) as Issue[]);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !user || !tenantId) return;
    setSubmitting(true);
    const { error } = await (supabase.from("job_issues") as any).insert([{
      job_id: jobId,
      tenant_id: tenantId,
      title: title.trim(),
      description: description.trim() || null,
      category,
      severity,
      stage_name: stageName || null,
      reported_by: user.id,
    }]);
    if (error) { toast.error(error.message); }
    else {
      toast.success("Issue reported");
      setTitle(""); setDescription(""); setCategory("other"); setSeverity("medium"); setStageName("");
      setShowForm(false);
      await load();
    }
    setSubmitting(false);
  };

  const handleResolve = async (issueId: string) => {
    if (!user) return;
    const { error } = await (supabase.from("job_issues") as any)
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        resolution_notes: resolutionNotes.trim() || null,
      })
      .eq("id", issueId);
    if (error) { toast.error(error.message); }
    else {
      toast.success("Issue resolved");
      setResolvingId(null);
      setResolutionNotes("");
      await load();
    }
  };

  const openCount = issues.filter(i => i.status === "open").length;

  return (
    <div className="glass-panel border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className={openCount > 0 ? "text-amber-500" : "text-muted-foreground"} />
          <h3 className="font-mono text-sm font-bold text-foreground">Issues</h3>
          {openCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
              {openCount} open
            </span>
          )}
        </div>
        {!readOnly && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs font-medium text-foreground hover:bg-secondary/50 transition-colors">
            {showForm ? <X size={12} /> : <Plus size={12} />}
            {showForm ? "Cancel" : "Report Issue"}
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="p-4 border-b border-border bg-muted/20 space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Issue title *" required
            className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" rows={2}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          <div className="grid grid-cols-3 gap-2">
            <select value={severity} onChange={e => setSeverity(e.target.value)}
              className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground">
              {CATEGORIES.map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
            <select value={stageName} onChange={e => setStageName(e.target.value)}
              className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground">
              <option value="">No stage</option>
              <option value="CNC">CNC</option>
              <option value="Edgebanding">Edgebanding</option>
              <option value="Assembly">Assembly</option>
              <option value="Spray">Spray</option>
              <option value="Install">Install</option>
            </select>
          </div>
          <button type="submit" disabled={submitting}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            <Plus size={12} /> {submitting ? "Saving…" : "Create Issue"}
          </button>
        </form>
      )}

      {/* Issues List */}
      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : issues.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No issues reported</div>
      ) : (
        <div className="divide-y divide-border">
          {issues.map(issue => {
            const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.medium;
            const isExpanded = expandedId === issue.id;
            const isResolving = resolvingId === issue.id;
            return (
              <div key={issue.id} className="group">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/20 transition-colors"
                >
                  <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full border shrink-0", sev.cls)}>
                    {sev.label}
                  </span>
                  <span className={cn("text-sm flex-1 truncate", issue.status === "resolved" ? "text-muted-foreground line-through" : "text-foreground")}>
                    {issue.title}
                  </span>
                  {issue.stage_name && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{issue.stage_name}</span>
                  )}
                  {issue.status === "resolved" ? (
                    <Check size={12} className="text-emerald-500 shrink-0" />
                  ) : (
                    <Clock size={12} className="text-muted-foreground shrink-0" />
                  )}
                  {isExpanded ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {issue.description && <p className="text-xs text-muted-foreground">{issue.description}</p>}
                    <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground font-mono">
                      <span>Category: {issue.category.replace("_", " ")}</span>
                      <span>·</span>
                      <span>Reported: {new Date(issue.reported_at).toLocaleDateString()}</span>
                      {issue.resolved_at && (
                        <>
                          <span>·</span>
                          <span>Resolved: {new Date(issue.resolved_at).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                    {issue.resolution_notes && (
                      <div className="text-xs bg-emerald-500/10 border border-emerald-500/20 rounded p-2 text-emerald-600">
                        <strong>Resolution:</strong> {issue.resolution_notes}
                      </div>
                    )}

                    {issue.status === "open" && !readOnly && (
                      <>
                        {isResolving ? (
                          <div className="space-y-2">
                            <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                              placeholder="Resolution notes (optional)" rows={2}
                              className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                            <div className="flex gap-2">
                              <button onClick={() => handleResolve(issue.id)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700 transition-colors">
                                <Check size={10} /> Resolve
                              </button>
                              <button onClick={() => { setResolvingId(null); setResolutionNotes(""); }}
                                className="px-2.5 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setResolvingId(issue.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs font-medium text-foreground hover:bg-secondary/50 transition-colors">
                            <Check size={10} /> Mark Resolved
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
