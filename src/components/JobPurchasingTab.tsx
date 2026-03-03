import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { generateRfqForJob } from "@/lib/rfqEngine";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  FileText, Send, Upload, CheckCircle2, Plus, ChevronDown, ChevronRight,
  Package, Truck, Clock, Star,
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
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [activeRecipient, setActiveRecipient] = useState<any>(null);
  const [quoteForm, setQuoteForm] = useState({ total: "", leadDays: "", notes: "" });

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
    const [{ data: lines }, { data: recipients }] = await Promise.all([
      (supabase.from("rfq_line_items") as any).select("*").eq("rfq_id", rfqId).order("created_at"),
      (supabase.from("rfq_recipients") as any).select("*, suppliers(name, rfq_email, is_preferred)").eq("rfq_id", rfqId).order("created_at"),
    ]);
    setRfqLines(prev => ({ ...prev, [rfqId]: lines ?? [] }));
    setRfqRecipients(prev => ({ ...prev, [rfqId]: recipients ?? [] }));
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

  const recordQuote = async () => {
    if (!activeRecipient) return;
    try {
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

      toast({ title: "Quote recorded" });
      setQuoteDialogOpen(false);
      loadRfqDetails(activeRecipient.rfq_id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const selectSupplier = async (recipient: any, rfqId: string) => {
    try {
      // Deselect all others
      await (supabase.from("rfq_recipients") as any)
        .update({ is_selected: false })
        .eq("rfq_id", rfqId);
      // Select this one
      await (supabase.from("rfq_recipients") as any)
        .update({ is_selected: true })
        .eq("id", recipient.id);
      // Update RFQ status
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
      // Get next PO number
      const { data: settings } = await (supabase.from("purchasing_settings") as any).select("po_number_prefix, po_number_next_seq").limit(1).single();
      const prefix = settings?.po_number_prefix || "PO";
      const seq = settings?.po_number_next_seq || 1;
      const poNumber = `${prefix}-${String(seq).padStart(4, "0")}`;

      // Create PO
      const { error } = await supabase.from("purchase_orders").insert({
        supplier_id: recipient.supplier_id,
        job_id: jobId,
        rfq_id: rfqId,
        po_number: poNumber,
        status: "draft",
        total_ex_vat: recipient.quoted_total || 0,
        expected_delivery_date: recipient.quoted_lead_time_days
          ? new Date(Date.now() + recipient.quoted_lead_time_days * 86400000).toISOString().split("T")[0]
          : null,
      } as any);

      if (error) throw error;

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

      toast({ title: `Purchase Order ${poNumber} created` });
      loadRfqs();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
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

            return (
              <div key={rfq.id} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Header */}
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

                {/* Expanded content */}
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
                                <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Brand</th>
                                <th className="text-right px-3 py-1.5 font-mono text-[10px] text-muted-foreground">THK</th>
                                <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Size</th>
                                <th className="text-right px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((line: any) => (
                                <tr key={line.id} className="border-t border-border">
                                  <td className="px-3 py-1.5 text-foreground">{line.material_key}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{line.brand || "—"}</td>
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

                    {/* Recipients */}
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
                              <div className="flex items-center gap-2">
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
                                      onClick={() => { setActiveRecipient(r); setQuoteForm({ total: "", leadDays: "", notes: "" }); setQuoteDialogOpen(true); }}
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Record Quote Dialog */}
      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground text-sm">Record Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase">Total (£ ex VAT)</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                type="number"
                step="0.01"
                value={quoteForm.total}
                onChange={e => setQuoteForm(f => ({ ...f, total: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase">Lead Time (days)</label>
              <input
                className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                type="number"
                value={quoteForm.leadDays}
                onChange={e => setQuoteForm(f => ({ ...f, leadDays: e.target.value }))}
              />
            </div>
            <button
              onClick={recordQuote}
              disabled={!quoteForm.total}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <CheckCircle2 size={14} /> Save Quote
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
