import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { generateRfqForJob } from "@/lib/rfqEngine";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  FileText, Send, Upload, CheckCircle2, Plus, ChevronDown, ChevronRight,
  Package, Truck, Clock, Star, Paperclip, X, Eye,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready_to_send: "bg-accent/20 text-accent-foreground",
  sent: "bg-primary/15 text-primary",
  quotes_received: "bg-chart-4/20 text-chart-4",
  supplier_selected: "bg-chart-2/20 text-chart-2",
  converted_to_po: "bg-chart-1/20 text-chart-1",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

interface Props {
  jobId: string;
  jobNumber?: string;
}

export default function JobPurchasingTab({ jobId, jobNumber }: Props) {
  const { user, userRole } = useAuth();
  const canManage = ["admin", "office", "supervisor"].includes(userRole || "");
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedRfq, setExpandedRfq] = useState<string | null>(null);
  const [rfqLines, setRfqLines] = useState<Record<string, any[]>>({});
  const [rfqRecipients, setRfqRecipients] = useState<Record<string, any[]>>({});
  const [rfqAttachments, setRfqAttachments] = useState<Record<string, any[]>>({});
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [activeRecipient, setActiveRecipient] = useState<any>(null);
  const [quoteForm, setQuoteForm] = useState({ total: "", leadDays: "", notes: "" });
  const [quoteFiles, setQuoteFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRfqs = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from("rfq_requests") as any)
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setRfqs(data ?? []);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { loadRfqs(); }, [loadRfqs]);

  const loadRfqDetails = async (rfqId: string) => {
    const [{ data: lines }, { data: recipients }, { data: attachments }] = await Promise.all([
      (supabase.from("rfq_line_items") as any).select("*").eq("rfq_id", rfqId).order("created_at"),
      (supabase.from("rfq_recipients") as any).select("*, suppliers(name, rfq_email, is_preferred)").eq("rfq_id", rfqId).order("created_at"),
      (supabase.from("rfq_attachments") as any).select("*").eq("rfq_id", rfqId).order("created_at", { ascending: false }),
    ]);
    setRfqLines(prev => ({ ...prev, [rfqId]: lines ?? [] }));
    setRfqRecipients(prev => ({ ...prev, [rfqId]: recipients ?? [] }));
    setRfqAttachments(prev => ({ ...prev, [rfqId]: attachments ?? [] }));
  };

  const toggleExpand = (rfqId: string) => {
    if (expandedRfq === rfqId) {
      setExpandedRfq(null);
    } else {
      setExpandedRfq(rfqId);
      if (!rfqLines[rfqId]) loadRfqDetails(rfqId);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateRfqForJob(jobId, user?.id);
      if (!result) {
        toast({ title: "No materials", description: "No buylist items found for this job.", variant: "destructive" });
        return;
      }
      toast({ title: `RFQ ${result.rfqNumber} created`, description: `${result.lineCount} line items, ${result.recipientCount} suppliers matched` });
      loadRfqs();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const uploadQuoteFiles = async (rfqId: string, supplierId: string): Promise<void> => {
    for (const file of quoteFiles) {
      const path = `${rfqId}/${supplierId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("rfq-files").upload(path, file);
      if (uploadErr) {
        console.error("Upload error:", uploadErr);
        continue;
      }
      await (supabase.from("rfq_attachments") as any).insert({
        rfq_id: rfqId,
        supplier_id: supplierId,
        file_name: file.name,
        storage_ref: path,
        type: "supplier_quote_pdf",
        uploaded_by_staff_id: user?.id,
      });
    }
  };

  const recordQuote = async () => {
    if (!activeRecipient) return;
    setUploading(true);
    try {
      // Upload attachments first
      if (quoteFiles.length > 0) {
        await uploadQuoteFiles(activeRecipient.rfq_id, activeRecipient.supplier_id);
      }

      await (supabase.from("rfq_recipients") as any)
        .update({
          quoted_total: quoteForm.total ? parseFloat(quoteForm.total) : null,
          quoted_lead_time_days: quoteForm.leadDays ? parseInt(quoteForm.leadDays) : null,
          quote_received_at: new Date().toISOString(),
        })
        .eq("id", activeRecipient.id);

      // Update RFQ status if first quote
      await (supabase.from("rfq_requests") as any)
        .update({ status: "quotes_received" })
        .eq("id", activeRecipient.rfq_id)
        .in("status", ["draft", "ready_to_send", "sent"]);

      toast({ title: "Quote recorded", description: quoteFiles.length > 0 ? `${quoteFiles.length} file(s) attached` : undefined });
      setQuoteDialogOpen(false);
      setQuoteFiles([]);
      loadRfqDetails(activeRecipient.rfq_id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const selectSupplier = async (recipient: any, rfqId: string) => {
    try {
      await (supabase.from("rfq_recipients") as any)
        .update({ is_selected: false })
        .eq("rfq_id", rfqId);
      await (supabase.from("rfq_recipients") as any)
        .update({ is_selected: true })
        .eq("id", recipient.id);
      await (supabase.from("rfq_requests") as any)
        .update({ status: "supplier_selected" })
        .eq("id", rfqId);

      toast({ title: `Selected ${recipient.suppliers?.name}` });
      loadRfqDetails(rfqId);
      loadRfqs();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const convertToPo = async (rfqId: string, recipient: any) => {
    try {
      const { data: settings } = await (supabase.from("purchasing_settings") as any).select("po_number_prefix, po_number_next_seq").limit(1).single();
      const prefix = settings?.po_number_prefix || "PO";
      const seq = settings?.po_number_next_seq || 1;
      const poNumber = `${prefix}-${String(seq).padStart(4, "0")}`;

      // Create PO
      const { data: newPO, error } = await (supabase.from("purchase_orders") as any).insert({
        supplier_id: recipient.supplier_id,
        job_id: jobId,
        rfq_id: rfqId,
        po_number: poNumber,
        status: "draft",
        total_ex_vat: recipient.quoted_total || 0,
        expected_delivery_date: recipient.quoted_lead_time_days
          ? new Date(Date.now() + recipient.quoted_lead_time_days * 86400000).toISOString().split("T")[0]
          : null,
      }).select("id").single();

      if (error) throw error;

      // Copy RFQ line items to PO line items
      const lines = rfqLines[rfqId] ?? [];
      if (lines.length > 0) {
        const poItems = lines.map((line: any) => ({
          po_id: newPO.id,
          description: `${line.material_key}${line.colour_name ? ` – ${line.colour_name}` : ""} (${line.thickness_mm}mm, ${line.sheet_size_key})`,
          quantity: line.quantity_sheets,
          unit_cost_ex_vat: recipient.quoted_total ? (recipient.quoted_total / lines.reduce((s: number, l: any) => s + l.quantity_sheets, 0)) : 0,
          total_ex_vat: recipient.quoted_total ? (recipient.quoted_total * line.quantity_sheets / lines.reduce((s: number, l: any) => s + l.quantity_sheets, 0)) : 0,
          vat_rate: 20,
          job_cost_category: "materials",
        }));
        await (supabase.from("purchase_order_items") as any).insert(poItems);
      }

      // Update PO sequence
      if (settings) {
        await (supabase.from("purchasing_settings") as any)
          .update({ po_number_next_seq: seq + 1 })
          .eq("id", settings.id);
      }

      // Update RFQ status
      await (supabase.from("rfq_requests") as any)
        .update({ status: "converted_to_po" })
        .eq("id", rfqId);

      toast({ title: `Purchase Order ${poNumber} created`, description: `${lines.length} line items copied from RFQ` });
      loadRfqs();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const viewAttachment = async (attachment: any) => {
    const { data } = await supabase.storage.from("rfq-files").createSignedUrl(attachment.storage_ref, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <Truck size={16} className="text-primary" /> Purchasing / RFQs
        </h3>
        {canManage && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus size={14} /> {generating ? "Generating…" : "Generate RFQ from Buylist"}
          </button>
        )}
      </div>

      {rfqs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No RFQs yet. Generate one from the buylist.</p>
      ) : (
        <div className="space-y-2">
          {rfqs.map(rfq => {
            const isExpanded = expandedRfq === rfq.id;
            const lines = rfqLines[rfq.id] ?? [];
            const recipients = rfqRecipients[rfq.id] ?? [];
            const attachments = rfqAttachments[rfq.id] ?? [];

            return (
              <div key={rfq.id} className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  onClick={() => toggleExpand(rfq.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/10"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="font-mono text-sm font-bold text-foreground">{rfq.rfq_number}</span>
                    <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full", statusColors[rfq.status] || "bg-muted text-muted-foreground")}>
                      {rfq.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(rfq.created_at), "dd MMM yyyy")}
                    {rfq.required_by_date && ` · Due ${format(new Date(rfq.required_by_date), "dd MMM")}`}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-4">
                    {/* Line items */}
                    <div>
                      <h4 className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider mb-2">Line Items</h4>
                      {lines.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Loading…</p>
                      ) : (
                        <div className="rounded border border-border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-muted/30">
                                <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Material</th>
                                <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Colour</th>
                                <th className="text-right px-3 py-1.5 font-mono text-[10px] text-muted-foreground">THK</th>
                                <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Size</th>
                                <th className="text-right px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((line: any) => (
                                <tr key={line.id} className="border-t border-border">
                                  <td className="px-3 py-1.5 text-foreground">{line.material_key}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{line.colour_name || "—"}</td>
                                  <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{line.thickness_mm}mm</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{line.sheet_size_key}</td>
                                  <td className="px-3 py-1.5 text-right font-mono font-bold text-foreground">{line.quantity_sheets}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Recipients / Suppliers */}
                    <div>
                      <h4 className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider mb-2">Suppliers</h4>
                      {recipients.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No suppliers matched.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {recipients.map((r: any) => (
                            <div key={r.id} className={cn(
                              "rounded-lg border p-3 flex items-center justify-between",
                              r.is_selected ? "border-primary bg-primary/5" : "border-border bg-card"
                            )}>
                              <div className="flex items-center gap-2 flex-wrap">
                                {r.suppliers?.is_preferred && <Star size={12} className="text-chart-4 fill-chart-4" />}
                                <span className="text-sm font-medium text-foreground">{r.suppliers?.name}</span>
                                <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                                  r.send_status === "sent" ? "bg-primary/15 text-primary" :
                                  r.send_status === "failed" ? "bg-destructive/15 text-destructive" :
                                  "bg-muted text-muted-foreground"
                                )}>
                                  {r.send_status}
                                </span>
                                {r.quote_received_at && (
                                  <span className="text-[10px] text-chart-2 font-mono">
                                    £{r.quoted_total?.toFixed(2)} · {r.quoted_lead_time_days}d lead
                                  </span>
                                )}
                                {r.is_selected && (
                                  <span className="text-[10px] font-mono text-primary font-bold">✓ SELECTED</span>
                                )}
                              </div>
                              {canManage && (
                                <div className="flex items-center gap-1.5">
                                  {!r.quote_received_at && (
                                    <button
                                      onClick={() => { setActiveRecipient(r); setQuoteForm({ total: "", leadDays: "", notes: "" }); setQuoteFiles([]); setQuoteDialogOpen(true); }}
                                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground"
                                    >
                                      <Upload size={12} /> Record Quote
                                    </button>
                                  )}
                                  {r.quote_received_at && !r.is_selected && rfq.status !== "converted_to_po" && (
                                    <button
                                      onClick={() => selectSupplier(r, rfq.id)}
                                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20"
                                    >
                                      <CheckCircle2 size={12} /> Select
                                    </button>
                                  )}
                                  {r.is_selected && rfq.status === "supplier_selected" && (
                                    <button
                                      onClick={() => convertToPo(rfq.id, r)}
                                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-chart-1/15 text-chart-1 hover:bg-chart-1/25"
                                    >
                                      <FileText size={12} /> Convert to PO
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Attachments */}
                    {attachments.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider mb-2">Attachments</h4>
                        <div className="space-y-1">
                          {attachments.map((att: any) => (
                            <div key={att.id} className="flex items-center justify-between rounded border border-border px-3 py-2 bg-card">
                              <div className="flex items-center gap-2">
                                <Paperclip size={12} className="text-muted-foreground" />
                                <span className="text-xs text-foreground">{att.file_name}</span>
                                <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{att.type.replace(/_/g, " ")}</span>
                              </div>
                              <button onClick={() => viewAttachment(att)} className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1">
                                <Eye size={12} /> View
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Record Quote Dialog */}
      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground text-sm flex items-center gap-2">
              <Upload size={16} className="text-primary" /> Record Quote
              {activeRecipient?.suppliers?.name && (
                <span className="text-muted-foreground font-normal">— {activeRecipient.suppliers.name}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase">Total (£ ex VAT)</label>
                <input
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  type="number"
                  step="0.01"
                  value={quoteForm.total}
                  onChange={e => setQuoteForm(f => ({ ...f, total: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase">Lead Time (days)</label>
                <input
                  className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  type="number"
                  value={quoteForm.leadDays}
                  onChange={e => setQuoteForm(f => ({ ...f, leadDays: e.target.value }))}
                  placeholder="e.g. 5"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase">Notes</label>
              <textarea
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={2}
                value={quoteForm.notes}
                onChange={e => setQuoteForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any notes from supplier…"
              />
            </div>

            {/* File upload */}
            <div>
              <label className="block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase">Attach Quote Files</label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.eml"
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  setQuoteFiles(prev => [...prev, ...files]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-16 rounded-md border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Paperclip size={16} />
                <span className="text-[10px] font-mono">Click to attach PDF, image, or email</span>
              </button>
              {quoteFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {quoteFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between rounded border border-border px-2 py-1.5 bg-muted/20">
                      <span className="text-xs text-foreground truncate">{f.name}</span>
                      <button onClick={() => setQuoteFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={recordQuote}
              disabled={!quoteForm.total || uploading}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} /> Save Quote{quoteFiles.length > 0 && ` (${quoteFiles.length} files)`}
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
