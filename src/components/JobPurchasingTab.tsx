import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { generateBuylistForJob, saveBuylistForJob, getBuylistForJob, getSprayItems } from "@/lib/buylistEngine";
import BomUploadSection from "@/components/BomUploadSection";
import { generateRfqsFromBuylist } from "@/lib/rfqEngine";
import { exportToCsv } from "@/lib/csvExport";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  FileText, Send, Upload, CheckCircle2, Plus, ChevronDown, ChevronRight,
  Package, Truck, Clock, Star, Paperclip, X, Eye, Mail, Loader2,
  ShoppingCart, AlertTriangle, Download, Lock, Unlock, Paintbrush,
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

const categoryLabels: Record<string, string> = {
  panels: "Panels", hardware: "Hardware", lighting: "Lighting", fixings: "Fixings",
  legs: "Legs", handles: "Handles", finishing_oils: "Finishing/Oils",
  paint_spray_subcontract: "Spray/Paint", edgebanding: "Edgebanding", other: "Other",
};

const categoryColors: Record<string, string> = {
  panels: "bg-primary/10 text-primary",
  hardware: "bg-chart-2/10 text-chart-2",
  lighting: "bg-chart-4/10 text-chart-4",
  fixings: "bg-chart-3/10 text-chart-3",
  paint_spray_subcontract: "bg-chart-5/10 text-chart-5",
  edgebanding: "bg-accent/10 text-accent-foreground",
  finishing_oils: "bg-chart-1/10 text-chart-1",
  handles: "bg-chart-2/10 text-chart-2",
  legs: "bg-chart-3/10 text-chart-3",
  other: "bg-muted text-muted-foreground",
};

interface Props {
  jobId: string;
  jobNumber?: string;
}

// ─── Purchase Orders Sub-Section ───
function PurchaseOrdersSection({ jobId, jobNumber, orderingEnabled, canManage }: { jobId: string; jobNumber?: string; orderingEnabled: boolean; canManage: boolean }) {
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase.from("purchase_orders") as any)
        .select("*, suppliers(name)")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      setPos(data ?? []);
      setLoading(false);
    })();
  }, [jobId]);

  const poStatusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-primary/15 text-primary",
    acknowledged: "bg-chart-2/15 text-chart-2",
    partially_received: "bg-chart-4/15 text-chart-4",
    received: "bg-chart-1/15 text-chart-1",
    cancelled: "bg-destructive/15 text-destructive",
  };

  const handleExportPOs = () => {
    const headers = ["PO Number", "Supplier", "Status", "Total (ex VAT)", "Expected Delivery", "Created"];
    const rows = pos.map((po: any) => [
      po.po_number, po.suppliers?.name || "—", po.status,
      po.total_ex_vat?.toFixed(2) || "0.00",
      po.expected_delivery_date || "—",
      format(new Date(po.created_at), "dd/MM/yyyy"),
    ]);
    exportToCsv(`purchase_orders_${jobNumber || jobId}`, headers, rows);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (pos.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Package size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">{orderingEnabled ? "No purchase orders yet. Convert RFQ quotes to POs." : "Ordering locked — awaiting deposit."}</p>
        {!orderingEnabled && <p className="text-[10px] mt-1 flex items-center justify-center gap-1"><Lock size={10} /> Deposit must be received before POs can be created.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button onClick={handleExportPOs} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground">
          <Download size={12} /> Export POs CSV
        </button>
      </div>
      <div className="space-y-2">
        {pos.map((po: any) => (
          <div key={po.id} className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package size={14} className="text-primary" />
              <span className="font-mono text-sm font-bold text-foreground">{po.po_number}</span>
              <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full", poStatusColors[po.status] || "bg-muted text-muted-foreground")}>
                {po.status?.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-muted-foreground">{po.suppliers?.name}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono font-bold text-foreground">£{po.total_ex_vat?.toFixed(2) || "0.00"}</span>
              {po.expected_delivery_date && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Truck size={12} /> {format(new Date(po.expected_delivery_date), "dd MMM")}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">{format(new Date(po.created_at), "dd MMM yyyy")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function JobPurchasingTab({ jobId, jobNumber }: Props) {
  const { user, userRole } = useAuth();
  const canManage = ["admin", "office", "supervisor"].includes(userRole || "");

  // Buylist state
  const [buylistItems, setBuylistItems] = useState<any[]>([]);
  const [buylistLoading, setBuylistLoading] = useState(true);
  const [generatingBuylist, setGeneratingBuylist] = useState(false);

  // Job state
  const [jobData, setJobData] = useState<any>(null);
  const [orderingEnabled, setOrderingEnabled] = useState(false);

  // RFQ state
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [rfqsLoading, setRfqsLoading] = useState(true);
  const [generatingRfqs, setGeneratingRfqs] = useState(false);

  // Automation state
  const [automating, setAutomating] = useState(false);
  const [automationResult, setAutomationResult] = useState<any>(null);

  // Quote/UI state
  const [expandedRfq, setExpandedRfq] = useState<string | null>(null);
  const [rfqLines, setRfqLines] = useState<Record<string, any[]>>({});
  const [rfqRecipients, setRfqRecipients] = useState<Record<string, any[]>>({});
  const [rfqAttachments, setRfqAttachments] = useState<Record<string, any[]>>({});

  // Quote dialog
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [activeRecipient, setActiveRecipient] = useState<any>(null);
  const [quoteForm, setQuoteForm] = useState({ total: "", leadDays: "", notes: "" });
  const [quoteFiles, setQuoteFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active tab
  const [activeSection, setActiveSection] = useState<"buylist" | "rfqs" | "orders">("buylist");

  // Load job data
  const loadJobData = useCallback(async () => {
    const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
    setJobData(data);
    setOrderingEnabled((data as any)?.ordering_enabled || false);
  }, [jobId]);

  // Load buylist
  const loadBuylist = useCallback(async () => {
    setBuylistLoading(true);
    const items = await getBuylistForJob(jobId);
    setBuylistItems(items);
    setBuylistLoading(false);
  }, [jobId]);

  // Load RFQs
  const loadRfqs = useCallback(async () => {
    setRfqsLoading(true);
    const { data } = await (supabase.from("rfq_requests") as any)
      .select("*").eq("job_id", jobId).order("created_at", { ascending: false });
    setRfqs(data ?? []);
    setRfqsLoading(false);
  }, [jobId]);

  useEffect(() => { loadJobData(); loadBuylist(); loadRfqs(); }, [loadJobData, loadBuylist, loadRfqs]);

  // ─── Hybrid Trigger: Accept Job → Edge Function does buylist + RFQs + notifications ───
  const handleAcceptAndAutomate = async () => {
    setAutomating(true);
    setAutomationResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("auto-purchasing", {
        body: { job_id: jobId, action: "accept_job" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAutomationResult(data);
      toast({
        title: "Purchasing automation complete",
        description: `${data.buylist_count || 0} buylist items, ${data.rfqs_created || 0} RFQ(s) to ${data.total_recipients || 0} suppliers${data.unmatched_count > 0 ? ` · ⚠ ${data.unmatched_count} unmatched` : ""}`,
      });
      if (data.unmatched_count > 0) {
        toast({ title: "⚠ Unmatched Items", description: "Some items have no matching suppliers. Check notifications.", variant: "destructive" });
      }
      loadJobData(); loadBuylist(); loadRfqs();
      setActiveSection("rfqs");
    } catch (err: any) {
      toast({ title: "Automation failed", description: err.message, variant: "destructive" });
    } finally { setAutomating(false); }
  };

  // Generate buylist
  const handleGenerateBuylist = async () => {
    setGeneratingBuylist(true);
    try {
      const lines = await generateBuylistForJob(jobId);
      if (lines.length === 0) {
        toast({ title: "No items found", description: "No parts or materials found for this job.", variant: "destructive" });
        return;
      }
      const result = await saveBuylistForJob(jobId, lines);
      toast({ title: `Buylist generated`, description: `${result.count} line items across ${[...new Set(lines.map(l => l.category))].length} categories` });
      loadBuylist();
      loadJobData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingBuylist(false);
    }
  };

  // Generate RFQs from buylist
  const handleGenerateRfqs = async () => {
    if (buylistItems.length === 0) {
      toast({ title: "Generate buylist first", variant: "destructive" });
      return;
    }
    setGeneratingRfqs(true);
    try {
      const result = await generateRfqsFromBuylist(jobId, buylistItems, user?.id);
      if (!result) {
        toast({ title: "No RFQs generated", variant: "destructive" });
        return;
      }
      toast({
        title: `${result.rfqsCreated} RFQ(s) created`,
        description: `${result.totalRecipients} suppliers matched${result.unmatchedItems.length > 0 ? `. ⚠ ${result.unmatchedItems.length} unmatched items` : ""}`,
      });
      if (result.unmatchedItems.length > 0) {
        toast({ title: "⚠ Unmatched Items", description: `${result.unmatchedItems.map(i => i.item_name).join(", ")}`, variant: "destructive" });
      }
      loadRfqs();
      setActiveSection("rfqs");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingRfqs(false);
    }
  };

  // Mark deposit received
  const handleDepositReceived = async () => {
    await supabase.from("jobs").update({
      ordering_enabled: true,
      deposit_received_at: new Date().toISOString(),
    } as any).eq("id", jobId);
    await (supabase.from("purchasing_audit_log") as any).insert({
      job_id: jobId, action: "deposit_received", entity_type: "job",
      details_json: { timestamp: new Date().toISOString() },
    });
    toast({ title: "Deposit received — ordering enabled" });
    loadJobData();
  };

  // Export buylist CSV
  const handleExportBuylist = () => {
    const headers = ["Category", "Item", "Brand", "SKU", "Qty", "Unit", "Spray Required", "Notes"];
    const rows = buylistItems.map((item: any) => [
      item.category, item.item_name, item.brand || "", item.sku_code || "",
      item.quantity, item.unit, item.is_spray_required ? "Yes" : "No", item.notes || "",
    ]);
    exportToCsv(`buylist_${jobNumber || jobId}`, headers, rows);
  };

  // RFQ detail loading
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
    if (expandedRfq === rfqId) { setExpandedRfq(null); } else {
      setExpandedRfq(rfqId);
      if (!rfqLines[rfqId]) loadRfqDetails(rfqId);
    }
  };

  const handleSendRfqEmails = async (rfqId: string) => {
    setSending(rfqId);
    try {
      const { data, error } = await supabase.functions.invoke("send-rfq-emails", { body: { rfq_id: rfqId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const sent = data?.sent || 0;
      toast({ title: `${sent} RFQ email(s) sent` });
      loadRfqDetails(rfqId); loadRfqs();
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally { setSending(null); }
  };

  const uploadQuoteFiles = async (rfqId: string, supplierId: string) => {
    for (const file of quoteFiles) {
      const path = `${rfqId}/${supplierId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("rfq-files").upload(path, file);
      if (uploadErr) continue;
      await (supabase.from("rfq_attachments") as any).insert({
        rfq_id: rfqId, supplier_id: supplierId, file_name: file.name,
        storage_ref: path, type: "supplier_quote_pdf", uploaded_by_staff_id: user?.id,
      });
    }
  };

  const recordQuote = async () => {
    if (!activeRecipient) return;
    setUploading(true);
    try {
      if (quoteFiles.length > 0) await uploadQuoteFiles(activeRecipient.rfq_id, activeRecipient.supplier_id);
      await (supabase.from("rfq_recipients") as any).update({
        quoted_total: quoteForm.total ? parseFloat(quoteForm.total) : null,
        quoted_lead_time_days: quoteForm.leadDays ? parseInt(quoteForm.leadDays) : null,
        quote_received_at: new Date().toISOString(),
      }).eq("id", activeRecipient.id);
      await (supabase.from("rfq_requests") as any).update({ status: "quotes_received" })
        .eq("id", activeRecipient.rfq_id).in("status", ["draft", "ready_to_send", "sent"]);
      toast({ title: "Quote recorded" });
      setQuoteDialogOpen(false); setQuoteFiles([]);
      loadRfqDetails(activeRecipient.rfq_id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const selectSupplier = async (recipient: any, rfqId: string) => {
    await (supabase.from("rfq_recipients") as any).update({ is_selected: false }).eq("rfq_id", rfqId);
    await (supabase.from("rfq_recipients") as any).update({ is_selected: true }).eq("id", recipient.id);
    await (supabase.from("rfq_requests") as any).update({ status: "supplier_selected" }).eq("id", rfqId);
    toast({ title: `Selected ${recipient.suppliers?.name}` });
    loadRfqDetails(rfqId); loadRfqs();
  };

  const convertToPo = async (rfqId: string, recipient: any) => {
    if (!orderingEnabled) {
      toast({ title: "Deposit required", description: "Ordering is not enabled until deposit is received.", variant: "destructive" });
      return;
    }
    try {
      const { data: settings } = await (supabase.from("purchasing_settings") as any).select("po_number_prefix, po_number_next_seq").limit(1).single();
      const prefix = settings?.po_number_prefix || "PO";
      const seq = settings?.po_number_next_seq || 1;
      const poNumber = `${prefix}-${String(seq).padStart(4, "0")}`;

      const { data: newPO, error } = await (supabase.from("purchase_orders") as any).insert({
        supplier_id: recipient.supplier_id, job_id: jobId, rfq_id: rfqId,
        po_number: poNumber, status: "draft",
        total_ex_vat: recipient.quoted_total || 0,
        expected_delivery_date: recipient.quoted_lead_time_days
          ? new Date(Date.now() + recipient.quoted_lead_time_days * 86400000).toISOString().split("T")[0] : null,
      }).select("id").single();
      if (error) throw error;

      const lines = rfqLines[rfqId] ?? [];
      if (lines.length > 0) {
        const totalQty = lines.reduce((s: number, l: any) => s + (l.quantity_sheets || l.quantity || 1), 0);
        const poItems = lines.map((line: any) => ({
          po_id: newPO.id,
          description: `${line.item_name || line.material_key}${line.colour_name ? ` – ${line.colour_name}` : ""}`,
          quantity: line.quantity_sheets || line.quantity || 1,
          unit_cost_ex_vat: recipient.quoted_total ? (recipient.quoted_total / totalQty) : 0,
          total_ex_vat: recipient.quoted_total ? (recipient.quoted_total * (line.quantity_sheets || line.quantity || 1) / totalQty) : 0,
          vat_rate: 20, job_cost_category: "materials",
        }));
        await (supabase.from("purchase_order_items") as any).insert(poItems);
      }
      if (settings) await (supabase.from("purchasing_settings") as any).update({ po_number_next_seq: seq + 1 }).eq("id", settings.id);
      await (supabase.from("rfq_requests") as any).update({ status: "converted_to_po" }).eq("id", rfqId);
      toast({ title: `PO ${poNumber} created` });
      loadRfqs();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const viewAttachment = async (att: any) => {
    const { data } = await supabase.storage.from("rfq-files").createSignedUrl(att.storage_ref, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // Group buylist by category
  const buylistByCategory = buylistItems.reduce((acc: Record<string, any[]>, item: any) => {
    const cat = item.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const sprayItemCount = buylistItems.filter((i: any) => i.is_spray_required || i.category === "paint_spray_subcontract").length;

  return (
    <div className="space-y-4">
      {/* Header + Automation + Deposit Status */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <Truck size={16} className="text-primary" /> Purchasing
        </h3>
        <div className="flex items-center gap-2">
          {/* Accept Job automation button — shown if job isn't accepted yet */}
          {canManage && jobData && !["accepted", "production_in_progress", "complete"].includes(jobData.status) && (
            <button onClick={handleAcceptAndAutomate} disabled={automating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-chart-2 text-xs font-medium text-white hover:bg-chart-2/90 disabled:opacity-50">
              {automating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {automating ? "Generating buylist & RFQs…" : "Accept Job & Generate RFQs"}
            </button>
          )}
          {!orderingEnabled ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] font-mono text-chart-4 bg-chart-4/10 px-2 py-1 rounded">
                <Lock size={12} /> Ordering locked — awaiting deposit
              </span>
              {canManage && (
                <button onClick={handleDepositReceived}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-chart-2 text-xs font-medium text-white hover:bg-chart-2/90">
                  <Unlock size={12} /> Confirm Deposit Received
                </button>
              )}
            </div>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-mono text-chart-2 bg-chart-2/10 px-2 py-1 rounded">
              <Unlock size={12} /> Ordering enabled
              {(jobData as any)?.deposit_received_at && ` · ${format(new Date((jobData as any).deposit_received_at), "dd MMM")}`}
            </span>
          )}
        </div>
      </div>

      {/* Automation result summary */}
      {automationResult && (
        <div className="rounded-lg border border-chart-2/30 bg-chart-2/5 px-4 py-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-mono font-bold text-chart-2">
            <CheckCircle2 size={14} /> Automation Complete
          </div>
          <div className="text-muted-foreground">
            {automationResult.buylist_count} buylist items · {automationResult.rfqs_created} RFQ(s) · {automationResult.total_recipients} supplier(s)
            {automationResult.unmatched_count > 0 && (
              <span className="text-destructive ml-2">⚠ {automationResult.unmatched_count} unmatched items</span>
            )}
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { key: "buylist" as const, label: "Buylist", icon: ShoppingCart, count: buylistItems.length },
          { key: "rfqs" as const, label: "RFQs", icon: FileText, count: rfqs.length },
          { key: "orders" as const, label: "Purchase Orders", icon: Package, count: 0 },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-mono border-b-2 -mb-px transition-colors",
              activeSection === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            <tab.icon size={14} /> {tab.label}
            {tab.count > 0 && <span className="text-[10px] bg-muted rounded-full px-1.5">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* BUYLIST SECTION */}
      {activeSection === "buylist" && (
        <div className="space-y-3">
          {/* BOM Upload from Inventor */}
          <BomUploadSection jobId={jobId} onBuylistRefresh={loadBuylist} />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {canManage && (
                <button onClick={handleGenerateBuylist} disabled={generatingBuylist}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {generatingBuylist ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {buylistItems.length > 0 ? "Regenerate Buylist" : "Generate Buylist"}
                </button>
              )}
              {buylistItems.length > 0 && canManage && (
                <button onClick={handleGenerateRfqs} disabled={generatingRfqs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/30 text-xs text-primary hover:bg-primary/10 disabled:opacity-50">
                  {generatingRfqs ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Generate & Route RFQs
                </button>
              )}
            </div>
            {buylistItems.length > 0 && (
              <button onClick={handleExportBuylist} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground">
                <Download size={12} /> Export CSV
              </button>
            )}
          </div>

          {buylistLoading ? (
            <div className="flex items-center justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : buylistItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No buylist generated yet. Click "Generate Buylist" to extract items from this job's parts.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {Object.entries(buylistByCategory).map(([cat, items]) => (
                  <span key={cat} className={cn("text-[10px] font-mono px-2 py-1 rounded-full", categoryColors[cat] || "bg-muted text-muted-foreground")}>
                    {categoryLabels[cat] || cat}: {(items as any[]).length}
                  </span>
                ))}
                {sprayItemCount > 0 && (
                  <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-chart-5/10 text-chart-5 flex items-center gap-1">
                    <Paintbrush size={10} /> {sprayItemCount} spray items
                  </span>
                )}
              </div>

              {/* Grouped tables */}
              {Object.entries(buylistByCategory).map(([cat, items]) => (
                <div key={cat} className="rounded-lg border border-border overflow-hidden">
                  <div className={cn("px-3 py-2 flex items-center justify-between", categoryColors[cat] || "bg-muted")}>
                    <span className="text-xs font-mono font-bold">{categoryLabels[cat] || cat}</span>
                    <span className="text-[10px] font-mono">{(items as any[]).length} items</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/20">
                      <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Item</th>
                      <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Brand</th>
                      <th className="text-right px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Qty</th>
                      <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Unit</th>
                      <th className="text-center px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Spray</th>
                    </tr></thead>
                    <tbody>
                      {(items as any[]).map((item: any) => (
                        <tr key={item.id} className="border-t border-border">
                          <td className="px-3 py-1.5 text-foreground">{item.item_name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{item.brand || "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono font-bold text-foreground">{item.quantity}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{item.unit}</td>
                          <td className="px-3 py-1.5 text-center">
                            {item.is_spray_required && <Paintbrush size={12} className="inline text-chart-5" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RFQ SECTION */}
      {activeSection === "rfqs" && (
        <div className="space-y-3">
          {rfqsLoading ? (
            <div className="flex items-center justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : rfqs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No RFQs yet. Generate from the buylist tab.</p>
          ) : (
            <div className="space-y-2">
              {rfqs.map(rfq => {
                const isExpanded = expandedRfq === rfq.id;
                const lines = rfqLines[rfq.id] ?? [];
                const recipients = rfqRecipients[rfq.id] ?? [];
                const attachments = rfqAttachments[rfq.id] ?? [];
                const hasPendingRecipients = recipients.some((r: any) => r.send_status === "pending");
                const isSending = sending === rfq.id;

                return (
                  <div key={rfq.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button onClick={() => toggleExpand(rfq.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/10">
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="font-mono text-sm font-bold text-foreground">{rfq.rfq_number}</span>
                        <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full", statusColors[rfq.status] || "bg-muted text-muted-foreground")}>
                          {rfq.status.replace(/_/g, " ")}
                        </span>
                        {rfq.supplier_group && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {rfq.supplier_group.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(rfq.created_at), "dd MMM yyyy")}
                        {rfq.required_by_date && ` · Due ${format(new Date(rfq.required_by_date), "dd MMM")}`}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border px-4 py-3 space-y-4">
                        {/* Send bar */}
                        {canManage && hasPendingRecipients && ["draft", "ready_to_send"].includes(rfq.status) && (
                          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Mail size={14} className="text-primary" />
                              <span className="text-xs text-foreground">{recipients.filter((r: any) => r.send_status === "pending").length} supplier(s) ready</span>
                            </div>
                            <button onClick={() => handleSendRfqEmails(rfq.id)} disabled={isSending}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                              {isSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                              {isSending ? "Sending…" : "Send RFQ Emails"}
                            </button>
                          </div>
                        )}

                        {/* Line items */}
                        <div>
                          <h4 className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider mb-2">Line Items</h4>
                          {lines.length === 0 ? <p className="text-xs text-muted-foreground">Loading…</p> : (
                            <div className="rounded border border-border overflow-hidden">
                              <table className="w-full text-xs">
                                <thead><tr className="bg-muted/30">
                                  <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Item</th>
                                  <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Category</th>
                                  <th className="text-right px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Qty</th>
                                  <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Unit</th>
                                </tr></thead>
                                <tbody>
                                  {lines.map((line: any) => (
                                    <tr key={line.id} className="border-t border-border">
                                      <td className="px-3 py-1.5 text-foreground">{line.item_name || line.material_key}</td>
                                      <td className="px-3 py-1.5">
                                        {line.category && <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", categoryColors[line.category])}>{categoryLabels[line.category]}</span>}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-mono font-bold text-foreground">{line.quantity_sheets || line.quantity}</td>
                                      <td className="px-3 py-1.5 text-muted-foreground">{line.unit || "sheets"}</td>
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
                          {recipients.length === 0 ? <p className="text-xs text-muted-foreground">No suppliers matched.</p> : (
                            <div className="space-y-1.5">
                              {recipients.map((r: any) => (
                                <div key={r.id} className={cn("rounded-lg border p-3 flex items-center justify-between",
                                  r.is_selected ? "border-primary bg-primary/5" : "border-border bg-card")}>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {r.suppliers?.is_preferred && <Star size={12} className="text-chart-4 fill-chart-4" />}
                                    <span className="text-sm font-medium text-foreground">{r.suppliers?.name}</span>
                                    <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                                      r.send_status === "sent" ? "bg-primary/15 text-primary" :
                                      r.send_status === "failed" ? "bg-destructive/15 text-destructive" :
                                      "bg-muted text-muted-foreground")}>{r.send_status}</span>
                                    {r.sent_at && <span className="text-[10px] text-muted-foreground font-mono">sent {format(new Date(r.sent_at), "dd MMM HH:mm")}</span>}
                                    {r.quote_received_at && <span className="text-[10px] text-chart-2 font-mono">£{r.quoted_total?.toFixed(2)} · {r.quoted_lead_time_days}d lead</span>}
                                    {r.is_selected && <span className="text-[10px] font-mono text-primary font-bold">✓ SELECTED</span>}
                                  </div>
                                  {canManage && (
                                    <div className="flex items-center gap-1.5">
                                      {!r.quote_received_at && (
                                        <button onClick={() => { setActiveRecipient(r); setQuoteForm({ total: "", leadDays: "", notes: "" }); setQuoteFiles([]); setQuoteDialogOpen(true); }}
                                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground">
                                          <Upload size={12} /> Record Quote
                                        </button>
                                      )}
                                      {r.quote_received_at && !r.is_selected && rfq.status !== "converted_to_po" && (
                                        <button onClick={() => selectSupplier(r, rfq.id)}
                                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20">
                                          <CheckCircle2 size={12} /> Select
                                        </button>
                                      )}
                                      {r.is_selected && rfq.status === "supplier_selected" && (
                                        <button onClick={() => convertToPo(rfq.id, r)} disabled={!orderingEnabled}
                                          className={cn("flex items-center gap-1 px-2 py-1 rounded text-[10px]",
                                            orderingEnabled ? "bg-chart-1/15 text-chart-1 hover:bg-chart-1/25" : "bg-muted text-muted-foreground cursor-not-allowed")}>
                                          {orderingEnabled ? <FileText size={12} /> : <Lock size={12} />}
                                          {orderingEnabled ? "Convert to PO" : "Deposit required"}
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
        </div>
      )}

      {/* ORDERS SECTION */}
      {activeSection === "orders" && (
        <PurchaseOrdersSection jobId={jobId} jobNumber={jobNumber} orderingEnabled={orderingEnabled} canManage={canManage} />
      )}

      {/* Record Quote Dialog */}
      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground text-sm flex items-center gap-2">
              <Upload size={16} className="text-primary" /> Record Quote
              {activeRecipient?.suppliers?.name && <span className="text-muted-foreground font-normal">— {activeRecipient.suppliers.name}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase">Total (£ ex VAT)</label>
                <input className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  type="number" step="0.01" value={quoteForm.total} onChange={e => setQuoteForm(f => ({ ...f, total: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase">Lead Time (days)</label>
                <input className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  type="number" value={quoteForm.leadDays} onChange={e => setQuoteForm(f => ({ ...f, leadDays: e.target.value }))} placeholder="e.g. 5" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase">Attach Files</label>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.eml" className="hidden"
                onChange={e => { setQuoteFiles(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full h-16 rounded-md border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground">
                <Paperclip size={16} /><span className="text-[10px] font-mono">Click to attach PDF, image, or email</span>
              </button>
              {quoteFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {quoteFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between rounded border border-border px-2 py-1.5 bg-muted/20">
                      <span className="text-xs text-foreground truncate">{f.name}</span>
                      <button onClick={() => setQuoteFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={recordQuote} disabled={!quoteForm.total || uploading}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><CheckCircle2 size={14} /> Save Quote</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}