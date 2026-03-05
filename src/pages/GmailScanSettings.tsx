import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Mail, RefreshCw, Loader2, CheckCircle2, AlertTriangle,
  FileText, Eye, ThumbsUp, ThumbsDown, Search,
} from "lucide-react";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

interface ScanSettings {
  enabled: boolean;
  scan_frequency_minutes: number;
  last_scan_at: string | null;
  require_review: boolean;
  auto_file_threshold: number;
}

interface ExtractedDocument {
  id: string;
  file_name: string;
  mime_type: string;
  document_type: string;
  ai_confidence: number;
  ai_matched_job_id: string | null;
  ai_match_reason: string | null;
  ai_extracted_data: Record<string, any>;
  storage_path: string | null;
  status: string;
  created_at: string;
  gmail_scanned_emails: {
    subject: string;
    sender_email: string;
    sender_name: string;
    received_at: string;
  };
}

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  statement: "Statement",
  remittance: "Remittance",
  quote: "Quote",
  purchase_order: "Purchase Order",
  credit_note: "Credit Note",
  receipt: "Receipt",
  unknown: "Unknown",
};

export default function GmailScanSettings() {
  const { session } = useAuth();
  const [settings, setSettings] = useState<ScanSettings | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalScanned, setTotalScanned] = useState(0);
  const [documents, setDocuments] = useState<ExtractedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [hasGmailScope, setHasGmailScope] = useState(false);
  const reviewPanelRef = useCallback((node: HTMLDivElement | null) => {
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      // Check Google connection status
      const { data: statusData } = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "status" },
      });
      const connected = statusData?.settings?.is_connected || false;
      setGoogleConnected(connected);

      if (connected) {
        const scopes = statusData?.settings?.granted_scopes || [];
        setHasGmailScope(Array.isArray(scopes) && scopes.some((s: string) => s.includes("gmail.readonly")));
      }

      // Get Gmail scan settings
      const { data, error } = await supabase.functions.invoke("scan-gmail", {
        body: { action: "get_settings" },
      });
      if (error) throw error;
      setSettings(data.settings);
      setPendingCount(data.pending_review || 0);
      setTotalScanned(data.total_scanned || 0);
    } catch {
      setSettings({ enabled: false, scan_frequency_minutes: 60, last_scan_at: null, require_review: true, auto_file_threshold: 0.85 });
    }
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-gmail", {
        body: { action: "scan" },
      });
      if (error) throw error;
      if (data.needs_scope) {
        toast({ title: "Gmail Access Required", description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: "Scan Complete", description: `Scanned ${data.scanned} emails, found ${data.new_documents} new documents` });
      fetchStatus();
    } catch (err: any) {
      toast({ title: "Scan Error", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const handleUpdateSettings = async (updates: Partial<ScanSettings>) => {
    try {
      const { error } = await supabase.functions.invoke("scan-gmail", {
        body: { action: "update_settings", ...updates },
      });
      if (error) throw error;
      setSettings(s => s ? { ...s, ...updates } : s);
      toast({ title: "Settings updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-gmail", {
        body: { action: "get_documents", status: "pending" },
      });
      if (error) throw error;
      setDocuments(data.documents || []);
      setShowDocuments(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleReview = async (docId: string, decision: "approve" | "reject", jobId?: string) => {
    try {
      const { error } = await supabase.functions.invoke("scan-gmail", {
        body: { action: "review_document", document_id: docId, decision, job_id: jobId },
      });
      if (error) throw error;
      setDocuments(docs => docs.filter(d => d.id !== docId));
      setPendingCount(c => Math.max(0, c - 1));
      toast({ title: decision === "approve" ? "Document filed" : "Document rejected" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRequestGmailScope = async () => {
    try {
      const redirectUri = window.location.origin + "/settings";
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "initiate_gmail", redirect_uri: redirectUri },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="h-20 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
        <Mail size={16} className="text-primary" />
        Gmail Document Scanner
      </h3>

      {/* Connection Status */}
      {!googleConnected ? (
        <div className="glass-panel rounded-lg p-5 max-w-2xl">
          <div className="flex items-center gap-3">
            <AlertTriangle size={16} className="text-warning shrink-0" />
            <p className="text-sm text-muted-foreground">
              Connect your Google account first (above) before enabling Gmail scanning.
            </p>
          </div>
        </div>
      ) : !hasGmailScope ? (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <div className="flex items-center gap-3">
            <AlertTriangle size={16} className="text-warning shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Gmail Access Required</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your Google account is connected but Gmail read access hasn't been granted yet. 
                Click below to add Gmail permissions.
              </p>
            </div>
          </div>
          <button
            onClick={handleRequestGmailScope}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Mail size={14} />
            Grant Gmail Access
          </button>
        </div>
      ) : (
        <>
          {/* Scanner Controls */}
          <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Email Scanner</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Scans your inbox for invoices, bills, statements, quotes & purchase orders
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.enabled || false}
                  onChange={e => handleUpdateSettings({ enabled: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-xs font-medium text-foreground">Enabled</span>
              </label>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase">Total Scanned</p>
                <p className="text-sm font-medium text-foreground mt-1">{totalScanned}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase">Pending Review</p>
                <p className="text-sm font-medium text-foreground mt-1 flex items-center gap-1.5">
                  {pendingCount}
                  {pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground uppercase">Last Scan</p>
                <p className="text-sm font-medium text-foreground mt-1">
                  {settings?.last_scan_at ? new Date(settings.last_scan_at).toLocaleString() : "Never"}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Scan Now
              </button>
              {pendingCount > 0 && (
                <button
                  onClick={loadDocuments}
                  disabled={loadingDocs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {loadingDocs ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  Review Documents ({pendingCount})
                </button>
              )}
            </div>
          </div>

          {/* Settings */}
          <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
            <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Scanner Settings</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Auto-file Confidence Threshold</label>
                <select
                  className={inputClass}
                  value={settings?.auto_file_threshold || 0.85}
                  onChange={e => handleUpdateSettings({ auto_file_threshold: parseFloat(e.target.value) })}
                >
                  <option value="0.95">95% (Very strict)</option>
                  <option value="0.85">85% (Recommended)</option>
                  <option value="0.75">75% (Moderate)</option>
                  <option value="0.60">60% (Relaxed)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Require Manual Review</label>
                <select
                  className={inputClass}
                  value={settings?.require_review ? "yes" : "no"}
                  onChange={e => handleUpdateSettings({ require_review: e.target.value === "yes" })}
                >
                  <option value="yes">Yes – always review</option>
                  <option value="no">No – auto-file above threshold</option>
                </select>
              </div>
            </div>
          </div>

          {/* Document Review Panel */}
          {showDocuments && (
            <div ref={reviewPanelRef} className="glass-panel rounded-lg p-5 space-y-4 max-w-3xl">
              <div className="flex items-center justify-between">
                <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">
                  Documents Pending Review
                </h4>
                <button onClick={() => setShowDocuments(false)} className="text-xs text-muted-foreground hover:text-foreground">
                  Close
                </button>
              </div>

              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No documents pending review</p>
              ) : (
                <div className="space-y-3">
                  {documents.map(doc => (
                    <div key={doc.id} className="rounded-lg border border-border p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <FileText size={18} className="text-primary shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{doc.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                              From: {doc.gmail_scanned_emails?.sender_name || doc.gmail_scanned_emails?.sender_email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Subject: {doc.gmail_scanned_emails?.subject}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                            {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                            {Math.round((doc.ai_confidence || 0) * 100)}% confident
                          </span>
                        </div>
                      </div>

                      {doc.ai_match_reason && (
                        <p className="text-xs text-muted-foreground italic pl-8">
                          AI: {doc.ai_match_reason}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pl-8">
                        <button
                          onClick={async () => {
                            if (!doc.storage_path) return;
                            const { data, error } = await supabase.storage
                              .from("documents")
                              .createSignedUrl(doc.storage_path, 300);
                            if (error || !data?.signedUrl) {
                              toast({ title: "Error", description: "Could not generate preview link", variant: "destructive" });
                              return;
                            }
                            window.open(data.signedUrl, "_blank");
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20"
                        >
                          <Eye size={12} /> View
                        </button>
                        <button
                          onClick={() => handleReview(doc.id, "approve", doc.ai_matched_job_id || undefined)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-success/10 text-success text-xs font-medium hover:bg-success/20"
                        >
                          <ThumbsUp size={12} /> Approve & File
                        </button>
                        <button
                          onClick={() => handleReview(doc.id, "reject")}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20"
                        >
                          <ThumbsDown size={12} /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
