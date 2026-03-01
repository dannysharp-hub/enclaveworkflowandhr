import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { FileText, Plus, CheckCircle2, Clock, Eye, ChevronDown, ChevronUp, Send, CheckSquare, Square, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Snapshot {
  id: string;
  version: number;
  status: string;
  snapshot_data: any;
  issued_at: string | null;
  issued_by: string | null;
  created_at: string;
  change_summary: string | null;
  template_id: string | null;
}

interface Template {
  id: string;
  name: string;
  department: string;
  description: string | null;
  is_default: boolean;
}

interface ChecklistItem {
  id: string;
  label: string;
  description: string | null;
  check_type: string;
  mandatory: boolean;
  sort_order: number;
}

interface ChecklistResult {
  id: string;
  checklist_item_id: string;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  value: string | null;
  notes: string | null;
}

interface Signoff {
  id: string;
  stage_name: string;
  signed_by: string;
  signed_at: string;
  notes: string | null;
  role_at_signing: string | null;
}

interface Props {
  jobId: string;
  jobCode: string;
  readOnly?: boolean;
}

export default function JobCardPanel({ jobId, jobCode, readOnly = false }: Props) {
  const { user, userRole, tenantId } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [changeSummary, setChangeSummary] = useState("");
  const [creating, setCreating] = useState(false);
  const [issuing, setIssuing] = useState<string | null>(null);

  // Active snapshot detail
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistResults, setChecklistResults] = useState<ChecklistResult[]>([]);
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  const [signoffStage, setSignoffStage] = useState("");
  const [signoffNotes, setSignoffNotes] = useState("");

  const fetchData = useCallback(async () => {
    const [snapRes, tmplRes] = await Promise.all([
      supabase.from("job_card_snapshots").select("*").eq("job_id", jobId).order("version", { ascending: false }),
      supabase.from("job_card_templates").select("id, name, department, description, is_default").eq("active", true).order("name"),
    ]);
    setSnapshots((snapRes.data as any[]) ?? []);
    const tmpls = (tmplRes.data as any[]) ?? [];
    setTemplates(tmpls);
    if (!selectedTemplateId && tmpls.length > 0) {
      const def = tmpls.find((t: Template) => t.is_default) || tmpls[0];
      setSelectedTemplateId(def.id);
    }
  }, [jobId, selectedTemplateId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadSnapshotDetail = useCallback(async (snapshotId: string) => {
    setViewingSnapshotId(snapshotId);
    const snap = snapshots.find(s => s.id === snapshotId);
    if (!snap?.template_id) {
      setChecklistItems([]);
      setChecklistResults([]);
      setSignoffs([]);
      return;
    }
    const [itemsRes, resultsRes, sigRes] = await Promise.all([
      supabase.from("job_checklist_items").select("*").eq("template_id", snap.template_id).eq("active", true).order("sort_order"),
      supabase.from("job_checklist_results").select("*").eq("snapshot_id", snapshotId),
      supabase.from("job_card_signoffs").select("*").eq("snapshot_id", snapshotId).order("signed_at"),
    ]);
    setChecklistItems((itemsRes.data as any[]) ?? []);
    setChecklistResults((resultsRes.data as any[]) ?? []);
    setSignoffs((sigRes.data as any[]) ?? []);
  }, [snapshots]);

  const createSnapshot = async () => {
    if (!selectedTemplateId || !user) return;
    setCreating(true);
    try {
      const nextVersion = snapshots.length > 0 ? snapshots[0].version + 1 : 1;
      // Supersede current issued snapshot
      const current = snapshots.find(s => s.status === "issued");
      if (current) {
        await supabase.from("job_card_snapshots").update({
          status: "superseded",
          superseded_at: new Date().toISOString(),
          superseded_by: user.id,
        }).eq("id", current.id);
      }
      const { data, error } = await supabase.from("job_card_snapshots").insert({
        job_id: jobId,
        tenant_id: tenantId,
        template_id: selectedTemplateId,
        version: nextVersion,
        status: "draft",
        snapshot_data: { job_code: jobCode, created_by: user.id },
        change_summary: changeSummary || null,
      }).select().single();
      if (error) throw error;

      // Pre-populate checklist results
      const { data: items } = await supabase.from("job_checklist_items")
        .select("id").eq("template_id", selectedTemplateId).eq("active", true);
      if (items && items.length > 0) {
        await supabase.from("job_checklist_results").insert(
          items.map((it: any) => ({
            snapshot_id: data.id,
            checklist_item_id: it.id,
            tenant_id: tenantId,
            checked: false,
          }))
        );
      }

      toast({ title: "Job card created", description: `Version ${nextVersion}` });
      setChangeSummary("");
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const issueSnapshot = async (snapshotId: string) => {
    if (!user) return;
    setIssuing(snapshotId);
    try {
      const { error } = await supabase.from("job_card_snapshots").update({
        status: "issued",
        issued_at: new Date().toISOString(),
        issued_by: user.id,
      }).eq("id", snapshotId);
      if (error) throw error;
      toast({ title: "Job card issued" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIssuing(null);
    }
  };

  const toggleCheck = async (resultId: string, currentChecked: boolean) => {
    if (!user) return;
    const now = new Date().toISOString();
    await supabase.from("job_checklist_results").update({
      checked: !currentChecked,
      checked_at: !currentChecked ? now : null,
      checked_by: !currentChecked ? user.id : null,
    }).eq("id", resultId);
    if (viewingSnapshotId) loadSnapshotDetail(viewingSnapshotId);
  };

  const addSignoff = async () => {
    if (!user || !viewingSnapshotId || !signoffStage) return;
    try {
      const { error } = await supabase.from("job_card_signoffs").insert({
        snapshot_id: viewingSnapshotId,
        tenant_id: tenantId,
        stage_name: signoffStage,
        signed_by: user.id,
        notes: signoffNotes || null,
        role_at_signing: userRole,
      });
      if (error) throw error;
      toast({ title: "Stage signed off", description: signoffStage });
      setSignoffStage("");
      setSignoffNotes("");
      loadSnapshotDetail(viewingSnapshotId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const activeSnapshot = snapshots.find(s => s.status === "issued");
  const draftSnapshots = snapshots.filter(s => s.status === "draft");
  const checkedCount = checklistResults.filter(r => r.checked).length;
  const mandatoryItems = checklistItems.filter(i => i.mandatory);
  const mandatoryDone = mandatoryItems.every(mi => {
    const result = checklistResults.find(r => r.checklist_item_id === mi.id);
    return result?.checked;
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "issued": return <CheckCircle2 size={14} className="text-primary" />;
      case "draft": return <Clock size={14} className="text-warning" />;
      default: return <Clock size={14} className="text-muted-foreground" />;
    }
  };

  return (
    <div className="glass-panel border-border rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-primary" />
          <span className="font-mono text-sm font-bold text-foreground">Job Cards</span>
          {activeSnapshot && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              v{activeSnapshot.version} ISSUED
            </span>
          )}
          {!activeSnapshot && snapshots.length > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {snapshots.length} draft{snapshots.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* Create new snapshot */}
          {!readOnly && templates.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground flex-1"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.department})</option>
                ))}
              </select>
              <input
                value={changeSummary}
                onChange={e => setChangeSummary(e.target.value)}
                placeholder="Change summary (optional)"
                className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground flex-1"
              />
              <button
                onClick={createSnapshot}
                disabled={creating}
                className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus size={14} /> {creating ? "Creating…" : "New Card"}
              </button>
            </div>
          )}

          {templates.length === 0 && (
            <p className="text-xs text-muted-foreground">No templates configured. Add templates in Settings.</p>
          )}

          {/* Snapshots list */}
          {snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No job cards yet</p>
          ) : (
            <div className="space-y-2">
              {snapshots.map(snap => (
                <div key={snap.id} className={cn(
                  "rounded-md border px-3 py-2.5",
                  viewingSnapshotId === snap.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/10"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusIcon(snap.status)}
                      <span className="font-mono text-sm font-medium text-foreground">v{snap.version}</span>
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">{snap.status}</span>
                      {snap.change_summary && (
                        <span className="text-xs text-muted-foreground">— {snap.change_summary}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {snap.status === "draft" && !readOnly && (
                        <button
                          onClick={() => issueSnapshot(snap.id)}
                          disabled={issuing === snap.id}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Send size={10} /> {issuing === snap.id ? "…" : "Issue"}
                        </button>
                      )}
                      <button
                        onClick={() => viewingSnapshotId === snap.id ? setViewingSnapshotId(null) : loadSnapshotDetail(snap.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground"
                      >
                        <Eye size={10} /> {viewingSnapshotId === snap.id ? "Close" : "View"}
                      </button>
                    </div>
                  </div>

                  {/* Detail view */}
                  {viewingSnapshotId === snap.id && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      {/* Checklist */}
                      {checklistItems.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Checklist</p>
                            <span className="text-[10px] font-mono text-muted-foreground">{checkedCount}/{checklistItems.length} complete</span>
                          </div>
                          <div className="space-y-1">
                            {checklistItems.map(item => {
                              const result = checklistResults.find(r => r.checklist_item_id === item.id);
                              const isChecked = result?.checked ?? false;
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => result && !readOnly && snap.status === "issued" && toggleCheck(result.id, isChecked)}
                                  disabled={readOnly || snap.status !== "issued"}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors",
                                    isChecked ? "text-foreground" : "text-muted-foreground",
                                    !readOnly && snap.status === "issued" && "hover:bg-muted/20 cursor-pointer"
                                  )}
                                >
                                  {isChecked ? <CheckSquare size={14} className="text-primary shrink-0" /> : <Square size={14} className="shrink-0" />}
                                  <span className={isChecked ? "line-through opacity-70" : ""}>{item.label}</span>
                                  {item.mandatory && <AlertTriangle size={10} className="text-warning shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Sign-offs */}
                      <div>
                        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Stage Sign-Offs</p>
                        {signoffs.length > 0 ? (
                          <div className="space-y-1">
                            {signoffs.map(s => (
                              <div key={s.id} className="flex items-center gap-2 px-2 py-1 text-xs">
                                <CheckCircle2 size={12} className="text-primary shrink-0" />
                                <span className="font-medium text-foreground">{s.stage_name}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground">{s.role_at_signing}</span>
                                <span className="text-muted-foreground">· {format(new Date(s.signed_at), "dd MMM HH:mm")}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No sign-offs yet</p>
                        )}

                        {/* Add sign-off */}
                        {!readOnly && snap.status === "issued" && (
                          <div className="flex gap-2 mt-2">
                            <input
                              value={signoffStage}
                              onChange={e => setSignoffStage(e.target.value)}
                              placeholder="Stage name"
                              className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground flex-1"
                            />
                            <input
                              value={signoffNotes}
                              onChange={e => setSignoffNotes(e.target.value)}
                              placeholder="Notes"
                              className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground flex-1"
                            />
                            <button
                              onClick={addSignoff}
                              disabled={!signoffStage}
                              className="flex items-center gap-1 h-8 px-2 rounded-md bg-primary text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                              <CheckCircle2 size={10} /> Sign Off
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Mandatory warning */}
                      {snap.status === "issued" && !mandatoryDone && mandatoryItems.length > 0 && (
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-destructive/10 text-xs text-destructive">
                          <AlertTriangle size={12} />
                          {mandatoryItems.filter(mi => !checklistResults.find(r => r.checklist_item_id === mi.id)?.checked).length} mandatory item(s) incomplete
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
