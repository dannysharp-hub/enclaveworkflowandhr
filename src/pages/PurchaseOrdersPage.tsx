import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Package, Plus, Truck, CheckCircle2, Clock, AlertTriangle,
  Send, FileText, ArrowRight, Search, Filter, MessageSquare,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PO {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  confirmed_delivery_date: string | null;
  total_ex_vat: number;
  vat_amount: number;
  total_inc_vat: number;
  notes: string | null;
  supplier_id: string;
  job_id: string | null;
  suppliers?: { name: string };
  jobs?: { job_name: string; job_id: string } | null;
}

interface POItem {
  id: string;
  description: string;
  quantity: number;
  unit_cost_ex_vat: number;
  total_ex_vat: number;
  vat_rate: number;
  job_cost_category: string;
  received_quantity: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-warning/15 text-warning",
  acknowledged: "bg-primary/15 text-primary",
  partially_received: "bg-warning/15 text-warning",
  received: "bg-primary/15 text-primary",
  cancelled: "bg-destructive/15 text-destructive",
};

export default function PurchaseOrdersPage() {
  const { userRole } = useAuth();
  const [pos, setPos] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailPO, setDetailPO] = useState<PO | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const canManage = userRole === "admin" || userRole === "office" || userRole === "supervisor";

  const load = useCallback(async () => {
    const [poRes, suppRes, jobRes] = await Promise.all([
      (supabase.from("purchase_orders") as any).select("*, suppliers(name), jobs(job_name, job_id)").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
      supabase.from("jobs").select("id, job_name, job_id").order("created_at", { ascending: false }).limit(100),
    ]);
    setPos(poRes.data ?? []);
    setSuppliers(suppRes.data ?? []);
    setJobs(jobRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = pos.filter(po => {
    if (filterStatus !== "all" && po.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return po.po_number.toLowerCase().includes(s) ||
        po.suppliers?.name?.toLowerCase().includes(s) ||
        po.jobs?.job_name?.toLowerCase().includes(s);
    }
    return true;
  });

  const totalValue = filtered.reduce((s, p) => s + Number(p.total_ex_vat), 0);
  const pendingCount = pos.filter(p => ["draft", "sent"].includes(p.status)).length;
  const overdueCount = pos.filter(p =>
    p.expected_delivery_date && new Date(p.expected_delivery_date) < new Date() &&
    !["received", "cancelled"].includes(p.status)
  ).length;

  if (loading) {
    return (
      <div className="space-y-4 animate-slide-in">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="rounded-lg border border-border bg-card p-4 h-20 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground flex items-center gap-2">
            <Package size={20} className="text-primary" /> Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground">Manage supplier orders and track deliveries</p>
        </div>
        {canManage && (
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus size={14} /> New PO
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="TOTAL POs" value={pos.length} />
        <KPI label="TOTAL VALUE" value={`£${Math.round(totalValue).toLocaleString()}`} variant="primary" />
        <KPI label="PENDING" value={pendingCount} variant="warning" />
        <KPI label="OVERDUE" value={overdueCount} variant={overdueCount > 0 ? "danger" : "default"} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search PO number, supplier, job..."
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="partially_received">Partially Received</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* PO Table */}
      <div className="glass-panel rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No purchase orders found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">PO #</th>
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">SUPPLIER</th>
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">JOB</th>
                  <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">VALUE</th>
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">DELIVERY</th>
                  <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">STATUS</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(po => {
                  const isOverdue = po.expected_delivery_date && new Date(po.expected_delivery_date) < new Date() && !["received", "cancelled"].includes(po.status);
                  return (
                    <tr key={po.id} className="border-b border-border last:border-0 hover:bg-secondary/20 cursor-pointer" onClick={() => setDetailPO(po)}>
                      <td className="px-4 py-2 font-mono font-medium text-foreground">{po.po_number}</td>
                      <td className="px-4 py-2 text-foreground">{po.suppliers?.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{po.jobs?.job_id || "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-foreground">£{Number(po.total_ex_vat).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        {po.expected_delivery_date ? (
                          <span className={cn("text-[10px] font-mono", isOverdue ? "text-destructive font-bold" : "text-muted-foreground")}>
                            {isOverdue && "⚠ "}{format(new Date(po.expected_delivery_date), "dd MMM")}
                          </span>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full", STATUS_COLORS[po.status] || "bg-muted text-muted-foreground")}>
                          {po.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <ArrowRight size={14} className="text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create PO Dialog */}
      <CreatePODialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        suppliers={suppliers}
        jobs={jobs}
        onSuccess={load}
      />

      {/* PO Detail Dialog */}
      <PODetailDialog
        po={detailPO}
        onClose={() => setDetailPO(null)}
        onUpdate={load}
        canManage={canManage}
      />
    </div>
  );
}

// ── Create PO Dialog ──
function CreatePODialog({ open, onOpenChange, suppliers, jobs, onSuccess }: {
  open: boolean; onOpenChange: (o: boolean) => void; suppliers: any[]; jobs: any[]; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    supplier_id: "",
    job_id: "",
    expected_delivery_date: "",
    notes: "",
  });
  const [items, setItems] = useState([{ description: "", quantity: 1, unit_cost_ex_vat: 0, vat_rate: 20, job_cost_category: "materials" }]);
  const [submitting, setSubmitting] = useState(false);

  const addItem = () => setItems(prev => [...prev, { description: "", quantity: 1, unit_cost_ex_vat: 0, vat_rate: 20, job_cost_category: "materials" }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: any) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  const totalExVat = items.reduce((s, i) => s + i.quantity * i.unit_cost_ex_vat, 0);
  const vatAmount = items.reduce((s, i) => s + i.quantity * i.unit_cost_ex_vat * (i.vat_rate / 100), 0);

  const handleSubmit = async () => {
    if (!form.supplier_id) { toast({ title: "Select a supplier", variant: "destructive" }); return; }
    if (items.some(i => !i.description.trim())) { toast({ title: "All items need descriptions", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      // Get next PO number
      const { data: settings } = await (supabase.from("purchasing_settings") as any).select("po_number_prefix, po_number_next_seq").limit(1).maybeSingle();
      const prefix = settings?.po_number_prefix || "PO";
      const seq = settings?.po_number_next_seq || 1;
      const poNumber = `${prefix}-${String(seq).padStart(4, "0")}`;

      const { data: newPO, error: poErr } = await (supabase.from("purchase_orders") as any).insert({
        supplier_id: form.supplier_id,
        job_id: form.job_id || null,
        po_number: poNumber,
        expected_delivery_date: form.expected_delivery_date || null,
        notes: form.notes || null,
        total_ex_vat: totalExVat,
        vat_amount: vatAmount,
        total_inc_vat: totalExVat + vatAmount,
      }).select("id").single();
      if (poErr) throw poErr;

      // Insert items
      const poItems = items.map(i => ({
        po_id: newPO.id,
        description: i.description,
        quantity: i.quantity,
        unit_cost_ex_vat: i.unit_cost_ex_vat,
        total_ex_vat: i.quantity * i.unit_cost_ex_vat,
        vat_rate: i.vat_rate,
        job_cost_category: i.job_cost_category,
      }));
      const { error: itemErr } = await (supabase.from("purchase_order_items") as any).insert(poItems);
      if (itemErr) throw itemErr;

      // Increment sequence
      if (settings) {
        await (supabase.from("purchasing_settings") as any).update({ po_number_next_seq: seq + 1 }).eq("id", settings.id);
      }

      toast({ title: "PO Created", description: poNumber });
      onOpenChange(false);
      setForm({ supplier_id: "", job_id: "", expected_delivery_date: "", notes: "" });
      setItems([{ description: "", quantity: 1, unit_cost_ex_vat: 0, vat_rate: 20, job_cost_category: "materials" }]);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground flex items-center gap-2">
            <Package size={16} className="text-primary" /> Create Purchase Order
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>SUPPLIER *</label>
              <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} className={inputClass}>
                <option value="">Select supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>JOB (OPTIONAL)</label>
              <select value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))} className={inputClass}>
                <option value="">No linked job</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_id} — {j.job_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>EXPECTED DELIVERY</label>
              <input type="date" value={form.expected_delivery_date} onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>NOTES</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputClass} placeholder="Optional notes" />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelClass}>LINE ITEMS</label>
              <button onClick={addItem} className="text-[10px] font-mono text-primary hover:text-primary/80">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <label className="text-[9px] font-mono text-muted-foreground">Description</label>}
                    <input value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} className={inputClass} placeholder="Item description" />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="text-[9px] font-mono text-muted-foreground">Qty</label>}
                    <input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="text-[9px] font-mono text-muted-foreground">Unit Cost</label>}
                    <input type="number" min={0} step={0.01} value={item.unit_cost_ex_vat} onChange={e => updateItem(idx, "unit_cost_ex_vat", Number(e.target.value))} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="text-[9px] font-mono text-muted-foreground">Category</label>}
                    <select value={item.job_cost_category} onChange={e => updateItem(idx, "job_cost_category", e.target.value)} className={inputClass}>
                      <option value="materials">Materials</option>
                      <option value="worktops">Worktops</option>
                      <option value="appliances">Appliances</option>
                      <option value="subcontractor">Subcontractor</option>
                      <option value="spray">Spray</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="col-span-1 text-right font-mono text-xs text-foreground py-2">
                    £{(item.quantity * item.unit_cost_ex_vat).toFixed(0)}
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-destructive text-[10px] hover:text-destructive/80">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-4 text-xs font-mono">
              <span className="text-muted-foreground">Ex VAT: <strong className="text-foreground">£{totalExVat.toFixed(2)}</strong></span>
              <span className="text-muted-foreground">VAT: <strong className="text-foreground">£{vatAmount.toFixed(2)}</strong></span>
              <span className="text-primary font-bold">Total: £{(totalExVat + vatAmount).toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Purchase Order"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── PO Detail Dialog ──
function PODetailDialog({ po, onClose, onUpdate, canManage }: {
  po: PO | null; onClose: () => void; onUpdate: () => void; canManage: boolean;
}) {
  const [items, setItems] = useState<POItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"items" | "messages" | "delivery">("items");
  const [messages, setMessages] = useState<any[]>([]);
  const [deliveryEvents, setDeliveryEvents] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  useEffect(() => {
    if (!po) return;
    setLoading(true);
    setTab("items");
    Promise.all([
      (supabase.from("purchase_order_items") as any).select("*").eq("po_id", po.id),
      (supabase.from("supplier_po_messages") as any).select("*").eq("po_id", po.id).order("created_at", { ascending: true }),
      (supabase.from("po_delivery_events") as any).select("*").eq("po_id", po.id).order("event_date", { ascending: false }),
    ]).then(([itemsRes, msgsRes, eventsRes]) => {
      setItems(itemsRes.data ?? []);
      setMessages(msgsRes.data ?? []);
      setDeliveryEvents(eventsRes.data ?? []);
      setLoading(false);
    });
  }, [po]);

  // Realtime messages
  useEffect(() => {
    if (!po) return;
    const channel = supabase
      .channel(`admin-po-msgs-${po.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "supplier_po_messages", filter: `po_id=eq.${po.id}` },
        (payload: any) => setMessages(prev => [...prev, payload.new])
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [po?.id]);

  if (!po) return null;

  const handleStatusChange = async (newStatus: string) => {
    await (supabase.from("purchase_orders") as any).update({ status: newStatus }).eq("id", po.id);
    toast({ title: `PO ${newStatus.replace("_", " ")}` });
    onUpdate();
    onClose();
  };

  const handleReceiveItem = async (item: POItem) => {
    const qty = prompt(`Received quantity for "${item.description}" (ordered: ${item.quantity}):`, String(item.quantity));
    if (qty === null) return;
    const received = Number(qty);
    const newStatus = received >= item.quantity ? "received" : received > 0 ? "partial" : "pending";
    await (supabase.from("purchase_order_items") as any).update({ received_quantity: received, status: newStatus }).eq("id", item.id);
    const updatedItems = items.map(i => i.id === item.id ? { ...i, received_quantity: received, status: newStatus } : i);
    const allReceived = updatedItems.every(i => i.status === "received" || (i.id === item.id && newStatus === "received"));
    if (allReceived) { await handleStatusChange("received"); }
    else if (updatedItems.some(i => i.status === "partial") || received > 0) {
      await (supabase.from("purchase_orders") as any).update({ status: "partially_received" }).eq("id", po.id);
      onUpdate();
    }
    setItems(updatedItems);
    toast({ title: "Item updated" });
  };

  const handleCreateDiscrepancyIssue = async (item: POItem) => {
    if (!po.job_id) { toast({ title: "No job linked to this PO" }); return; }
    await supabase.from("job_issues").insert({
      job_id: po.job_id,
      title: `Material discrepancy: ${item.description}`,
      description: `Ordered ${item.quantity}, received ${item.received_quantity}. PO: ${po.po_number}`,
      category: "material_issue",
      severity: "medium",
      reported_by: (await supabase.auth.getUser()).data.user!.id,
    } as any);
    toast({ title: "Discrepancy issue created" });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    setSendingMsg(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user!.id).single();
    await (supabase.from("supplier_po_messages") as any).insert({
      po_id: po.id,
      sender_type: "staff",
      sender_id: user!.id,
      sender_name: profile?.full_name || user!.email || "Staff",
      message: newMessage.trim(),
    });
    setNewMessage("");
    setSendingMsg(false);
  };

  const tabClass = (t: string) => cn(
    "px-3 py-1.5 text-xs font-mono rounded-md transition-colors",
    tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
  );

  return (
    <Dialog open={!!po} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground flex items-center gap-2">
            <FileText size={16} className="text-primary" /> {po.po_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
            <button className={tabClass("items")} onClick={() => setTab("items")}>Order</button>
            <button className={tabClass("delivery")} onClick={() => setTab("delivery")}>
              Delivery {deliveryEvents.length > 0 && `(${deliveryEvents.length})`}
            </button>
            <button className={tabClass("messages")} onClick={() => setTab("messages")}>
              <MessageSquare size={12} className="inline mr-1" />Messages {messages.length > 0 && `(${messages.length})`}
            </button>
          </div>

          {tab === "items" && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground">SUPPLIER</span>
                  <p className="font-medium text-foreground">{po.suppliers?.name}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground">STATUS</span>
                  <p><span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full", STATUS_COLORS[po.status])}>{po.status.replace("_", " ")}</span></p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground">ORDER DATE</span>
                  <p className="text-foreground">{format(new Date(po.order_date), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground">EXPECTED DELIVERY</span>
                  <p className="text-foreground">{po.expected_delivery_date ? format(new Date(po.expected_delivery_date), "dd MMM yyyy") : "—"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-muted-foreground">TOTAL EX VAT</span>
                  <p className="font-mono font-bold text-foreground">£{Number(po.total_ex_vat).toLocaleString()}</p>
                </div>
                {po.jobs && (
                  <div>
                    <span className="text-[10px] font-mono text-muted-foreground">JOB</span>
                    <p className="text-foreground">{po.jobs.job_id} — {po.jobs.job_name}</p>
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <h4 className="text-[10px] font-mono font-bold text-muted-foreground mb-2">LINE ITEMS</h4>
                {loading ? (
                  <p className="text-xs text-muted-foreground">Loading...</p>
                ) : (
                  <div className="space-y-2">
                    {items.map(item => (
                      <div key={item.id} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.description}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">
                              {item.quantity} × £{Number(item.unit_cost_ex_vat).toFixed(2)} = £{Number(item.total_ex_vat).toFixed(2)} · {item.job_cost_category}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={cn(
                              "text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                              item.status === "received" ? "bg-primary/15 text-primary" :
                              item.status === "partial" ? "bg-warning/15 text-warning" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {item.received_quantity}/{item.quantity} received
                            </span>
                          </div>
                        </div>
                        {canManage && item.status !== "received" && (
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => handleReceiveItem(item)} className="text-[10px] font-mono text-primary hover:text-primary/80">✓ Receive</button>
                            {item.received_quantity > 0 && item.received_quantity < item.quantity && (
                              <button onClick={() => handleCreateDiscrepancyIssue(item)} className="text-[10px] font-mono text-destructive hover:text-destructive/80">⚠ Flag Discrepancy</button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              {canManage && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {po.status === "draft" && (
                    <button onClick={() => handleStatusChange("sent")} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90">
                      <Send size={12} /> Send to Supplier
                    </button>
                  )}
                  {po.status !== "cancelled" && po.status !== "received" && (
                    <button onClick={() => handleStatusChange("cancelled")} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-destructive/30 text-xs text-destructive hover:bg-destructive/10">
                      Cancel PO
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Delivery Tab */}
          {tab === "delivery" && (
            <div className="space-y-3">
              {deliveryEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No delivery updates from supplier yet.</p>
              ) : (
                <div className="space-y-0">
                  {deliveryEvents.map((evt, i) => (
                    <div key={evt.id} className="flex gap-3 relative">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full border border-border bg-card flex items-center justify-center z-10">
                          {evt.event_type === "dispatched" ? <Send size={10} className="text-primary" /> :
                           evt.event_type === "delivered" ? <CheckCircle2 size={10} className="text-primary" /> :
                           evt.event_type === "delayed" ? <AlertTriangle size={10} className="text-destructive" /> :
                           <Clock size={10} className="text-muted-foreground" />}
                        </div>
                        {i < deliveryEvents.length - 1 && <div className="w-px flex-1 bg-border" />}
                      </div>
                      <div className="pb-3">
                        <p className="text-xs font-medium text-foreground">{evt.notes}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(evt.event_date), "dd MMM yyyy HH:mm")} · {evt.created_by_name} ({evt.created_by_type})
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages Tab */}
          {tab === "messages" && (
            <div className="space-y-3">
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {messages.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No messages. Send one to the supplier.</p>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={cn(
                    "rounded-lg p-2.5 max-w-[85%]",
                    msg.sender_type === "staff" ? "ml-auto bg-primary/10 border border-primary/20" : "bg-muted/40 border border-border"
                  )}>
                    <p className="text-xs text-foreground">{msg.message}</p>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {msg.sender_name} · {format(new Date(msg.created_at), "dd MMM HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSendMessage()}
                    className="flex-1 h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Message supplier..." />
                  <button onClick={handleSendMessage} disabled={sendingMsg || !newMessage.trim()}
                    className="h-9 w-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center">
                    <Send size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KPI({ label, value, variant = "default" }: { label: string; value: string | number; variant?: "default" | "primary" | "warning" | "danger" }) {
  const colors = { default: "text-foreground", primary: "text-primary", warning: "text-warning", danger: "text-destructive" };
  return (
    <div className="glass-panel rounded-lg p-4 text-center">
      <p className={cn("text-2xl font-mono font-bold", colors[variant])}>{value}</p>
      <p className="text-[10px] font-mono text-muted-foreground tracking-wide">{label}</p>
    </div>
  );
}
