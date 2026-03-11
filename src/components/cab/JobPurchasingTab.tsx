import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Plus, Send, Check, Package, Truck, ClipboardCheck, AlertTriangle, FileText, X,
} from "lucide-react";

const CATEGORIES = ["panels", "hardware", "lighting", "fixings", "handles", "legs", "spray", "consumables", "other"];
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  rfq_sent: "bg-blue-500/15 text-blue-600",
  quoted: "bg-amber-500/15 text-amber-600",
  ordered: "bg-primary/15 text-primary",
  delivered: "bg-emerald-500/15 text-emerald-600",
  checked_ok: "bg-emerald-600/15 text-emerald-700",
  issue: "bg-destructive/15 text-destructive",
};

interface Props {
  companyId: string;
  job: any;
  onRefresh: () => void;
}

export default function JobPurchasingTab({ companyId, job, onRefresh }: Props) {
  const [buylistItems, setBuylistItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [rfqItems, setRfqItems] = useState<any[]>([]);
  const [supplierQuotes, setSupplierQuotes] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [poItems, setPoItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Add item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ category: "other", name: "", spec: "", qty: "1", unit: "pcs", target_cost: "" });

  // RFQ form
  const [showRfqForm, setShowRfqForm] = useState(false);
  const [rfqSupplierId, setRfqSupplierId] = useState("");
  const [rfqSelectedItems, setRfqSelectedItems] = useState<string[]>([]);

  // Quote response form
  const [showQuoteForm, setShowQuoteForm] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState({ total_price: "", lead_time_days: "", notes: "", attachment_url: "" });

  // Category filter
  const [catFilter, setCatFilter] = useState("all");

  const load = useCallback(async () => {
    const [blRes, supRes, rfqRes, riRes, sqRes, poRes, poiRes] = await Promise.all([
      (supabase.from("cab_buylist_items") as any).select("*").eq("job_id", job.id).order("created_at"),
      (supabase.from("cab_suppliers") as any).select("*").eq("company_id", companyId).eq("is_active", true).order("name"),
      (supabase.from("cab_rfqs") as any).select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
      (supabase.from("cab_rfq_items") as any).select("*").eq("company_id", companyId),
      (supabase.from("cab_supplier_quotes") as any).select("*").eq("company_id", companyId),
      (supabase.from("cab_purchase_orders") as any).select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
      (supabase.from("cab_purchase_order_items") as any).select("*").eq("company_id", companyId),
    ]);
    setBuylistItems(blRes.data ?? []);
    setSuppliers(supRes.data ?? []);
    setRfqs(rfqRes.data ?? []);
    setRfqItems(riRes.data ?? []);
    setSupplierQuotes(sqRes.data ?? []);
    setPos(poRes.data ?? []);
    setPoItems(poiRes.data ?? []);
    setLoading(false);
  }, [companyId, job.id]);

  useEffect(() => { load(); }, [load]);

  // Add buylist item
  const handleAddItem = async () => {
    if (!itemForm.name.trim()) return;
    await (supabase.from("cab_buylist_items") as any).insert({
      company_id: companyId, job_id: job.id,
      category: itemForm.category, name: itemForm.name, spec: itemForm.spec || null,
      qty: parseFloat(itemForm.qty) || 1, unit: itemForm.unit || null,
      target_cost: itemForm.target_cost ? parseFloat(itemForm.target_cost) : null,
    });
    toast({ title: "Item added to buy list" });
    setShowAddItem(false);
    setItemForm({ category: "other", name: "", spec: "", qty: "1", unit: "pcs", target_cost: "" });
    load();
  };

  // Create RFQ
  const handleCreateRfq = async () => {
    if (!rfqSupplierId || rfqSelectedItems.length === 0) {
      toast({ title: "Select supplier and items", variant: "destructive" }); return;
    }
    const { data: refData } = await supabase.rpc("cab_next_rfq_ref", { _company_id: companyId } as any);
    const rfqRef = refData as string;

    const { data: rfq, error } = await (supabase.from("cab_rfqs") as any).insert({
      company_id: companyId, job_id: job.id, supplier_id: rfqSupplierId, rfq_ref: rfqRef,
    }).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    const items = rfqSelectedItems.map(id => {
      const bl = buylistItems.find(b => b.id === id);
      return { company_id: companyId, rfq_id: rfq.id, buylist_item_id: id, qty: bl?.qty || 1, spec_snapshot: bl?.spec || null };
    });
    await (supabase.from("cab_rfq_items") as any).insert(items);
    await insertCabEvent({ companyId, eventType: "rfq.created", jobId: job.id, payload: { rfq_ref: rfqRef, supplier_id: rfqSupplierId } });

    toast({ title: `RFQ ${rfqRef} created` });
    setShowRfqForm(false); setRfqSupplierId(""); setRfqSelectedItems([]);
    load();
  };

  // Mark RFQ sent
  const handleSendRfq = async (rfq: any) => {
    await (supabase.from("cab_rfqs") as any).update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", rfq.id);
    // Update buylist items to rfq_sent
    const itemIds = rfqItems.filter(ri => ri.rfq_id === rfq.id).map(ri => ri.buylist_item_id);
    if (itemIds.length) {
      await (supabase.from("cab_buylist_items") as any).update({ status: "rfq_sent" }).in("id", itemIds);
    }
    await insertCabEvent({ companyId, eventType: "rfq.sent", jobId: job.id, payload: { rfq_ref: rfq.rfq_ref } });
    toast({ title: "RFQ marked as sent" }); load();
  };

  // Record supplier quote response
  const handleRecordQuote = async (rfqId: string) => {
    const rfq = rfqs.find(r => r.id === rfqId);
    if (!rfq) return;
    await (supabase.from("cab_supplier_quotes") as any).insert({
      company_id: companyId, rfq_id: rfqId, supplier_id: rfq.supplier_id,
      total_price: quoteForm.total_price ? parseFloat(quoteForm.total_price) : null,
      lead_time_days: quoteForm.lead_time_days ? parseInt(quoteForm.lead_time_days) : null,
      notes: quoteForm.notes || null, attachment_url: quoteForm.attachment_url || null,
    });
    await (supabase.from("cab_rfqs") as any).update({ status: "responded", responded_at: new Date().toISOString() }).eq("id", rfqId);
    const itemIds = rfqItems.filter(ri => ri.rfq_id === rfqId).map(ri => ri.buylist_item_id);
    if (itemIds.length) {
      await (supabase.from("cab_buylist_items") as any).update({ status: "quoted" }).in("id", itemIds);
    }
    await insertCabEvent({ companyId, eventType: "rfq.responded", jobId: job.id, payload: { rfq_ref: rfq.rfq_ref } });
    toast({ title: "Supplier quote recorded" });
    setShowQuoteForm(null); setQuoteForm({ total_price: "", lead_time_days: "", notes: "", attachment_url: "" });
    load();
  };

  // Award supplier + create PO
  const handleAwardAndCreatePO = async (rfq: any) => {
    const { data: poRef } = await supabase.rpc("cab_next_po_ref", { _company_id: companyId } as any);

    const { data: po, error } = await (supabase.from("cab_purchase_orders") as any).insert({
      company_id: companyId, job_id: job.id, supplier_id: rfq.supplier_id, po_ref: poRef as string,
    }).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    const items = rfqItems.filter(ri => ri.rfq_id === rfq.id);
    const sq = supplierQuotes.find(q => q.rfq_id === rfq.id);
    const poInsertItems = items.map(ri => ({
      company_id: companyId, po_id: po.id, buylist_item_id: ri.buylist_item_id, qty: ri.qty,
    }));
    await (supabase.from("cab_purchase_order_items") as any).insert(poInsertItems);

    await (supabase.from("cab_rfqs") as any).update({ status: "awarded" }).eq("id", rfq.id);
    const itemIds = items.map(ri => ri.buylist_item_id);
    if (itemIds.length) {
      await (supabase.from("cab_buylist_items") as any).update({ chosen_supplier_id: rfq.supplier_id }).in("id", itemIds);
    }

    await insertCabEvent({ companyId, eventType: "supplier.awarded", jobId: job.id, payload: { rfq_ref: rfq.rfq_ref, po_ref: poRef } });
    await insertCabEvent({ companyId, eventType: "po.created", jobId: job.id, payload: { po_ref: poRef } });
    toast({ title: `PO ${poRef} created` }); load();
  };

  // PO actions
  const handlePOAction = async (po: any, action: "ordered" | "delivered" | "closed") => {
    const updates: any = { status: action };
    if (action === "ordered") updates.ordered_at = new Date().toISOString();
    if (action === "delivered") updates.delivered_at = new Date().toISOString();
    await (supabase.from("cab_purchase_orders") as any).update(updates).eq("id", po.id);

    if (action === "ordered") {
      const items = poItems.filter(pi => pi.po_id === po.id);
      const ids = items.map(pi => pi.buylist_item_id);
      if (ids.length) await (supabase.from("cab_buylist_items") as any).update({ status: "ordered" }).in("id", ids);
      await insertCabEvent({ companyId, eventType: "po.ordered", jobId: job.id, payload: { po_ref: po.po_ref } });
    }
    if (action === "delivered") {
      const items = poItems.filter(pi => pi.po_id === po.id);
      const ids = items.map(pi => pi.buylist_item_id);
      if (ids.length) await (supabase.from("cab_buylist_items") as any).update({ status: "delivered" }).in("id", ids);
      await insertCabEvent({ companyId, eventType: "materials.delivered", jobId: job.id, payload: { po_ref: po.po_ref } });
    }
    toast({ title: `PO ${po.po_ref} → ${action}` }); load(); onRefresh();
  };

  // Mark buylist item checked_ok or issue
  const handleItemCheck = async (itemId: string, status: "checked_ok" | "issue") => {
    await (supabase.from("cab_buylist_items") as any).update({ status }).eq("id", itemId);
    const eventType = status === "checked_ok" ? "materials.checked_ok" : "materials.issue_logged";
    await insertCabEvent({ companyId, eventType, jobId: job.id, payload: { buylist_item_id: itemId } });
    toast({ title: status === "checked_ok" ? "Item checked OK" : "Issue logged" });
    load(); onRefresh();
  };

  const supplierName = (id: string) => suppliers.find(s => s.id === id)?.name || "—";

  const filteredItems = buylistItems.filter(i => catFilter === "all" || i.category === catFilter);

  if (loading) return <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const checkedCount = buylistItems.filter(i => i.status === "checked_ok").length;
  const totalCount = buylistItems.length;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <Package size={14} className="text-primary" /> Purchasing
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">{checkedCount}/{totalCount} checked</Badge>
          )}
        </h3>
        <Button size="sm" onClick={() => setShowAddItem(true)}><Plus size={12} /> Add Item</Button>
      </div>

      {/* Add item form */}
      {showAddItem && (
        <div className="rounded border border-border p-3 space-y-2 bg-muted/10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <Label className="text-[10px]">Category</Label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><Label className="text-[10px]">Name *</Label><Input className="h-9 text-xs" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label className="text-[10px]">Spec</Label><Input className="h-9 text-xs" value={itemForm.spec} onChange={e => setItemForm(f => ({ ...f, spec: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-1">
              <div><Label className="text-[10px]">Qty</Label><Input type="number" className="h-9 text-xs" value={itemForm.qty} onChange={e => setItemForm(f => ({ ...f, qty: e.target.value }))} /></div>
              <div><Label className="text-[10px]">Unit</Label><Input className="h-9 text-xs" value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} /></div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddItem} disabled={!itemForm.name.trim()}><Check size={12} /> Add</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddItem(false)}><X size={12} /></Button>
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-1 flex-wrap">
        <button onClick={() => setCatFilter("all")} className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${catFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>All</button>
        {CATEGORIES.map(c => {
          const count = buylistItems.filter(i => i.category === c).length;
          if (!count) return null;
          return (
            <button key={c} onClick={() => setCatFilter(c)} className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${catFilter === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
              {c} ({count})
            </button>
          );
        })}
      </div>

      {/* Buy list table */}
      {filteredItems.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left p-2 font-mono text-[10px] text-muted-foreground">Part Number</th>
                <th className="text-left p-2 font-mono text-[10px] text-muted-foreground">Material</th>
                <th className="text-right p-2 font-mono text-[10px] text-muted-foreground">Qty</th>
                <th className="text-right p-2 font-mono text-[10px] text-muted-foreground">Width</th>
                <th className="text-right p-2 font-mono text-[10px] text-muted-foreground">Length</th>
                <th className="text-right p-2 font-mono text-[10px] text-muted-foreground">Thickness</th>
                <th className="text-left p-2 font-mono text-[10px] text-muted-foreground">Status</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="p-2">
                    <span className="font-medium text-foreground font-mono">{item.spec || "—"}</span>
                    <span className="block text-muted-foreground text-[10px]">{item.name}</span>
                  </td>
                  <td className="p-2 text-muted-foreground">{item.category !== "general" ? item.category : "—"}</td>
                  <td className="p-2 text-right font-mono">{Number(item.qty)}</td>
                  <td className="p-2 text-right font-mono text-muted-foreground">{item.width ?? "—"}</td>
                  <td className="p-2 text-right font-mono text-muted-foreground">{item.length ?? "—"}</td>
                  <td className="p-2 text-right font-mono text-muted-foreground">{item.thickness ?? "—"}</td>
                  <td className="p-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono ${STATUS_COLORS[item.status] || STATUS_COLORS.pending}`}>
                      {item.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-2">
                    {item.status === "delivered" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => handleItemCheck(item.id, "checked_ok")}>
                          <ClipboardCheck size={10} /> OK
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-destructive" onClick={() => handleItemCheck(item.id, "issue")}>
                          <AlertTriangle size={10} /> Issue
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {buylistItems.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No buy list items yet. Add items to get started.</p>
      )}

      {/* RFQ Section */}
      {buylistItems.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <h4 className="font-mono text-xs font-bold text-foreground">RFQs</h4>
            <Button size="sm" variant="outline" onClick={() => setShowRfqForm(true)}><Send size={12} /> Create RFQ</Button>
          </div>

          {showRfqForm && (
            <div className="rounded border border-border p-3 space-y-2 bg-muted/10">
              <div>
                <Label className="text-[10px]">Supplier</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={rfqSupplierId} onChange={e => setRfqSupplierId(e.target.value)}>
                  <option value="">Select…</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[10px]">Select items</Label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {buylistItems.filter(i => ["pending", "rfq_sent"].includes(i.status)).map(item => (
                    <label key={item.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={rfqSelectedItems.includes(item.id)}
                        onChange={() => setRfqSelectedItems(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])} />
                      {item.name} ({item.category}) × {Number(item.qty)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateRfq} disabled={!rfqSupplierId || rfqSelectedItems.length === 0}><Check size={12} /> Create</Button>
                <Button size="sm" variant="outline" onClick={() => { setShowRfqForm(false); setRfqSelectedItems([]); }}><X size={12} /></Button>
              </div>
            </div>
          )}

          {rfqs.map(rfq => {
            const items = rfqItems.filter(ri => ri.rfq_id === rfq.id);
            const quote = supplierQuotes.find(sq => sq.rfq_id === rfq.id);
            return (
              <div key={rfq.id} className="rounded border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold">{rfq.rfq_ref}</span>
                    <span className="text-xs text-muted-foreground">→ {supplierName(rfq.supplier_id)}</span>
                    <Badge variant={rfq.status === "awarded" ? "default" : "outline"} className="text-[10px]">{rfq.status}</Badge>
                  </div>
                  <div className="flex gap-1">
                    {rfq.status === "draft" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSendRfq(rfq)}>
                        <Send size={10} /> Send
                      </Button>
                    )}
                    {rfq.status === "sent" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                        setShowQuoteForm(rfq.id);
                        setQuoteForm({ total_price: "", lead_time_days: "", notes: "", attachment_url: "" });
                      }}>
                        <FileText size={10} /> Record Response
                      </Button>
                    )}
                    {rfq.status === "responded" && (
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleAwardAndCreatePO(rfq)}>
                        <Check size={10} /> Award & Create PO
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {items.length} items
                  {rfq.sent_at && <span className="ml-2">Sent {format(new Date(rfq.sent_at), "dd MMM")}</span>}
                  {rfq.responded_at && <span className="ml-2">Responded {format(new Date(rfq.responded_at), "dd MMM")}</span>}
                </div>
                {quote && (
                  <div className="text-xs bg-muted/20 rounded p-2 space-y-0.5">
                    {quote.total_price && <div>Price: <span className="font-mono font-bold">£{Number(quote.total_price).toLocaleString()}</span></div>}
                    {quote.lead_time_days && <div>Lead time: {quote.lead_time_days} days</div>}
                    {quote.notes && <div className="text-muted-foreground">{quote.notes}</div>}
                  </div>
                )}

                {showQuoteForm === rfq.id && (
                  <div className="rounded border border-border p-2 space-y-2 bg-muted/10">
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px]">Total Price (£)</Label><Input className="h-8 text-xs" type="number" value={quoteForm.total_price} onChange={e => setQuoteForm(f => ({ ...f, total_price: e.target.value }))} /></div>
                      <div><Label className="text-[10px]">Lead Time (days)</Label><Input className="h-8 text-xs" type="number" value={quoteForm.lead_time_days} onChange={e => setQuoteForm(f => ({ ...f, lead_time_days: e.target.value }))} /></div>
                    </div>
                    <div><Label className="text-[10px]">Notes</Label><Input className="h-8 text-xs" value={quoteForm.notes} onChange={e => setQuoteForm(f => ({ ...f, notes: e.target.value }))} /></div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleRecordQuote(rfq.id)}><Check size={10} /> Save</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuoteForm(null)}><X size={10} /></Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Purchase Orders */}
      {pos.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border">
          <h4 className="font-mono text-xs font-bold text-foreground">Purchase Orders</h4>
          {pos.map(po => {
            const items = poItems.filter(pi => pi.po_id === po.id);
            return (
              <div key={po.id} className="rounded border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold">{po.po_ref}</span>
                    <span className="text-xs text-muted-foreground">→ {supplierName(po.supplier_id)}</span>
                    <Badge variant={po.status === "delivered" ? "default" : "outline"} className="text-[10px]">{po.status}</Badge>
                  </div>
                  <div className="flex gap-1">
                    {po.status === "draft" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handlePOAction(po, "ordered")}>
                        <Truck size={10} /> Mark Ordered
                      </Button>
                    )}
                    {po.status === "ordered" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handlePOAction(po, "delivered")}>
                        <Package size={10} /> Mark Delivered
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {items.length} items
                  {po.ordered_at && <span className="ml-2">Ordered {format(new Date(po.ordered_at), "dd MMM")}</span>}
                  {po.delivered_at && <span className="ml-2">Delivered {format(new Date(po.delivered_at), "dd MMM")}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
