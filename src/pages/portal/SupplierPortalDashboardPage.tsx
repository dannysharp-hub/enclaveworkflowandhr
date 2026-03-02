import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Truck, LogOut, Package, CheckCircle2, Clock, AlertTriangle, Send, Calendar,
  MessageSquare, FileText, MapPin, ChevronDown, ChevronUp, Upload, Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function SupplierPortalDashboardPage() {
  const navigate = useNavigate();
  const [supplierUser, setSupplierUser] = useState<any>(null);
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [poItems, setPOItems] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // New state for enhanced features
  const [messages, setMessages] = useState<any[]>([]);
  const [deliveryEvents, setDeliveryEvents] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"details" | "messages" | "delivery" | "documents">("details");
  const [deliveryDateInput, setDeliveryDateInput] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/supplier/login"); return; }

    const { data: su } = await (supabase.from("supplier_users") as any)
      .select("id, name, supplier_id, tenant_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!su) { navigate("/supplier/login"); return; }
    setSupplierUser(su);

    await (supabase.from("supplier_activity_log") as any).insert({
      supplier_user_id: su.id,
      action: "supplier_logged_in",
      tenant_id: su.tenant_id,
    });

    const { data: poData } = await (supabase.from("purchase_orders") as any)
      .select("*, jobs(job_id, job_name)")
      .eq("supplier_id", su.supplier_id)
      .neq("status", "draft")
      .order("created_at", { ascending: false });

    setPos(poData ?? []);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const openPO = async (po: any) => {
    setSelectedPO(po);
    setActiveTab("details");
    setDeliveryDateInput(po.confirmed_delivery_date || po.expected_delivery_date || "");
    setDeliveryNotes("");

    const [itemsRes, msgsRes, eventsRes, docsRes] = await Promise.all([
      (supabase.from("purchase_order_items") as any).select("*").eq("po_id", po.id),
      (supabase.from("supplier_po_messages") as any).select("*").eq("po_id", po.id).order("created_at", { ascending: true }),
      (supabase.from("po_delivery_events") as any).select("*").eq("po_id", po.id).order("event_date", { ascending: false }),
      (supabase.from("supplier_po_documents") as any).select("*").eq("po_id", po.id).order("created_at", { ascending: false }),
    ]);

    setPOItems(itemsRes.data ?? []);
    setMessages(msgsRes.data ?? []);
    setDeliveryEvents(eventsRes.data ?? []);
    setDocuments(docsRes.data ?? []);

    if (supplierUser) {
      await (supabase.from("supplier_activity_log") as any).insert({
        supplier_user_id: supplierUser.id,
        action: "supplier_viewed_po",
        po_id: po.id,
        tenant_id: supplierUser.tenant_id,
      });
    }
  };

  // Subscribe to realtime messages
  useEffect(() => {
    if (!selectedPO) return;
    const channel = supabase
      .channel(`po-messages-${selectedPO.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "supplier_po_messages", filter: `po_id=eq.${selectedPO.id}` },
        (payload: any) => setMessages(prev => [...prev, payload.new])
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedPO?.id]);

  const handleAcknowledge = async () => {
    if (!selectedPO) return;
    setActionLoading(true);
    await (supabase.from("purchase_orders") as any).update({ status: "acknowledged" }).eq("id", selectedPO.id);
    await addDeliveryEvent("update", "Order acknowledged by supplier");
    toast({ title: "Order acknowledged" });
    setSelectedPO(null);
    load();
    setActionLoading(false);
  };

  const handleConfirmDelivery = async () => {
    if (!selectedPO || !deliveryDateInput) {
      toast({ title: "Please select a delivery date", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    await (supabase.from("purchase_orders") as any)
      .update({ confirmed_delivery_date: deliveryDateInput, status: "acknowledged" })
      .eq("id", selectedPO.id);
    await addDeliveryEvent("update", `Delivery date confirmed: ${format(new Date(deliveryDateInput), "dd MMM yyyy")}${deliveryNotes ? ` — ${deliveryNotes}` : ""}`);

    if (supplierUser) {
      await (supabase.from("supplier_activity_log") as any).insert({
        supplier_user_id: supplierUser.id,
        action: "supplier_confirmed_delivery",
        po_id: selectedPO.id,
        tenant_id: supplierUser.tenant_id,
      });
    }

    toast({ title: "Delivery date confirmed" });
    setSelectedPO(null);
    setShowDatePicker(false);
    load();
    setActionLoading(false);
  };

  const handleDispatch = async () => {
    if (!selectedPO) return;
    setActionLoading(true);
    await addDeliveryEvent("dispatched", deliveryNotes || "Order dispatched");
    toast({ title: "Dispatch logged" });
    setDeliveryNotes("");
    // Refresh events
    const { data } = await (supabase.from("po_delivery_events") as any).select("*").eq("po_id", selectedPO.id).order("event_date", { ascending: false });
    setDeliveryEvents(data ?? []);
    setActionLoading(false);
  };

  const addDeliveryEvent = async (eventType: string, notes: string) => {
    if (!selectedPO || !supplierUser) return;
    await (supabase.from("po_delivery_events") as any).insert({
      po_id: selectedPO.id,
      tenant_id: supplierUser.tenant_id,
      event_type: eventType,
      notes,
      created_by_type: "supplier",
      created_by_name: supplierUser.name,
    });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedPO || !supplierUser) return;
    setActionLoading(true);
    await (supabase.from("supplier_po_messages") as any).insert({
      po_id: selectedPO.id,
      tenant_id: supplierUser.tenant_id,
      sender_type: "supplier",
      sender_id: supplierUser.id,
      sender_name: supplierUser.name,
      message: newMessage.trim(),
    });
    setNewMessage("");
    setActionLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/supplier/login");
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

  const pending = pos.filter(p => p.status === "sent");
  const active = pos.filter(p => ["acknowledged", "partially_received"].includes(p.status));
  const completed = pos.filter(p => p.status === "received");

  const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const tabClass = (t: string) => cn(
    "px-3 py-1.5 text-xs font-mono rounded-md transition-colors",
    activeTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
  );

  const EVENT_ICONS: Record<string, React.ReactNode> = {
    dispatched: <Send size={12} className="text-primary" />,
    in_transit: <Truck size={12} className="text-warning" />,
    delivered: <CheckCircle2 size={12} className="text-primary" />,
    delayed: <AlertTriangle size={12} className="text-destructive" />,
    update: <Clock size={12} className="text-muted-foreground" />,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Truck size={14} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-mono font-bold text-foreground text-sm">Supplier Portal</h1>
              <p className="text-[10px] text-muted-foreground">{supplierUser?.name}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-center">
            <p className="text-2xl font-mono font-bold text-warning">{pending.length}</p>
            <p className="text-[10px] font-mono text-muted-foreground">AWAITING RESPONSE</p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
            <p className="text-2xl font-mono font-bold text-primary">{active.length}</p>
            <p className="text-[10px] font-mono text-muted-foreground">ACTIVE</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-2xl font-mono font-bold text-foreground">{completed.length}</p>
            <p className="text-[10px] font-mono text-muted-foreground">COMPLETED</p>
          </div>
        </div>

        {/* Pending action required */}
        {pending.length > 0 && (
          <div>
            <h2 className="font-mono text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              <AlertTriangle size={14} className="text-warning" /> Action Required
            </h2>
            <div className="space-y-2">
              {pending.map(po => (
                <button key={po.id} onClick={() => openPO(po)} className="w-full text-left rounded-lg border border-warning/30 bg-warning/5 p-3 hover:bg-warning/10 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-medium text-foreground">{po.po_number}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {po.jobs?.job_id && `Job: ${po.jobs.job_id} · `}
                        Delivery by: {po.expected_delivery_date ? format(new Date(po.expected_delivery_date), "dd MMM yyyy") : "TBC"}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-foreground">£{Number(po.total_ex_vat).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* All POs */}
        <div>
          <h2 className="font-mono text-sm font-bold text-foreground mb-2">All Orders</h2>
          <div className="space-y-2">
            {pos.map(po => (
              <button key={po.id} onClick={() => openPO(po)} className="w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-secondary/20 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono font-medium text-foreground">{po.po_number}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(po.order_date), "dd MMM yyyy")} · {po.status.replace("_", " ")}
                      {messages.length > 0 && " · "}{messages.length > 0 && <MessageSquare size={10} className="inline" />}
                    </p>
                  </div>
                  <span className="font-mono text-sm text-foreground">£{Number(po.total_ex_vat).toLocaleString()}</span>
                </div>
              </button>
            ))}
            {pos.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No purchase orders</p>}
          </div>
        </div>
      </main>

      {/* PO Detail Dialog */}
      <Dialog open={!!selectedPO} onOpenChange={() => setSelectedPO(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground">{selectedPO?.po_number}</DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4">
              {/* Tabs */}
              <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
                <button className={tabClass("details")} onClick={() => setActiveTab("details")}>Details</button>
                <button className={tabClass("delivery")} onClick={() => setActiveTab("delivery")}>
                  Delivery {deliveryEvents.length > 0 && <span className="ml-1 text-[9px]">({deliveryEvents.length})</span>}
                </button>
                <button className={tabClass("messages")} onClick={() => setActiveTab("messages")}>
                  Messages {messages.length > 0 && <span className="ml-1 text-[9px]">({messages.length})</span>}
                </button>
                <button className={tabClass("documents")} onClick={() => setActiveTab("documents")}>
                  Docs {documents.length > 0 && <span className="ml-1 text-[9px]">({documents.length})</span>}
                </button>
              </div>

              {/* Details Tab */}
              {activeTab === "details" && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground">ORDER DATE</span>
                      <p className="text-foreground">{format(new Date(selectedPO.order_date), "dd MMM yyyy")}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground">EXPECTED DELIVERY</span>
                      <p className="text-foreground">{selectedPO.expected_delivery_date ? format(new Date(selectedPO.expected_delivery_date), "dd MMM yyyy") : "TBC"}</p>
                    </div>
                    {selectedPO.confirmed_delivery_date && (
                      <div>
                        <span className="text-[10px] font-mono text-muted-foreground">CONFIRMED DELIVERY</span>
                        <p className="text-primary font-medium">{format(new Date(selectedPO.confirmed_delivery_date), "dd MMM yyyy")}</p>
                      </div>
                    )}
                    {selectedPO.delivery_address && (
                      <div className="col-span-2">
                        <span className="text-[10px] font-mono text-muted-foreground">DELIVERY ADDRESS</span>
                        <p className="text-foreground">{selectedPO.delivery_address}</p>
                      </div>
                    )}
                  </div>

                  {/* Items */}
                  <div>
                    <h4 className="text-[10px] font-mono font-bold text-muted-foreground mb-2">ITEMS</h4>
                    <div className="space-y-1">
                      {poItems.map((item: any) => (
                        <div key={item.id} className="rounded-md border border-border bg-muted/30 p-2 flex items-center justify-between">
                          <div>
                            <p className="text-sm text-foreground">{item.description}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">{item.quantity} × £{Number(item.unit_cost_ex_vat).toFixed(2)}</p>
                          </div>
                          <span className="font-mono text-sm text-foreground">£{Number(item.total_ex_vat).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-right font-mono text-sm">
                      <span className="text-muted-foreground">Total: </span>
                      <span className="font-bold text-primary">£{Number(selectedPO.total_inc_vat).toLocaleString()}</span>
                    </div>
                  </div>

                  {selectedPO.notes && (
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground">NOTES</span>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{selectedPO.notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {selectedPO.status === "sent" && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-border">
                      <button onClick={handleAcknowledge} disabled={actionLoading}
                        className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                        <CheckCircle2 size={14} /> Confirm Order
                      </button>
                      <button onClick={() => { setShowDatePicker(true); setActiveTab("delivery"); }} disabled={actionLoading}
                        className="w-full h-10 rounded-md border border-primary text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50 flex items-center justify-center gap-2">
                        <Calendar size={14} /> Confirm Delivery Date
                      </button>
                    </div>
                  )}

                  {selectedPO.status === "acknowledged" && (
                    <div className="pt-2 border-t border-border">
                      <button onClick={() => { setShowDatePicker(true); setActiveTab("delivery"); }} disabled={actionLoading}
                        className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
                        <Send size={14} /> Update Delivery Date
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Delivery Tab */}
              {activeTab === "delivery" && (
                <div className="space-y-4">
                  {/* Delivery date picker */}
                  <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                    <h4 className="text-[10px] font-mono font-bold text-muted-foreground">DELIVERY DATE</h4>
                    <input type="date" value={deliveryDateInput} onChange={e => setDeliveryDateInput(e.target.value)} className={inputClass} />
                    <input value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} className={inputClass} placeholder="Notes (optional)" />
                    <div className="flex gap-2">
                      <button onClick={handleConfirmDelivery} disabled={actionLoading || !deliveryDateInput}
                        className="flex-1 h-9 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                        <Calendar size={12} /> Confirm Date
                      </button>
                      <button onClick={handleDispatch} disabled={actionLoading}
                        className="flex-1 h-9 rounded-md border border-border text-xs text-foreground hover:bg-secondary/20 disabled:opacity-50 flex items-center justify-center gap-1.5">
                        <Send size={12} /> Log Dispatch
                      </button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div>
                    <h4 className="text-[10px] font-mono font-bold text-muted-foreground mb-2">DELIVERY TIMELINE</h4>
                    {deliveryEvents.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No delivery updates yet</p>
                    ) : (
                      <div className="space-y-0">
                        {deliveryEvents.map((evt, i) => (
                          <div key={evt.id} className="flex gap-3 relative">
                            <div className="flex flex-col items-center">
                              <div className="w-6 h-6 rounded-full border border-border bg-card flex items-center justify-center z-10">
                                {EVENT_ICONS[evt.event_type] || EVENT_ICONS.update}
                              </div>
                              {i < deliveryEvents.length - 1 && <div className="w-px flex-1 bg-border" />}
                            </div>
                            <div className="pb-4">
                              <p className="text-xs font-medium text-foreground">{evt.notes}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(evt.event_date), "dd MMM yyyy HH:mm")} · {evt.created_by_name}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Messages Tab */}
              {activeTab === "messages" && (
                <div className="space-y-3">
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {messages.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Start the conversation.</p>
                    )}
                    {messages.map(msg => (
                      <div key={msg.id} className={cn(
                        "rounded-lg p-2.5 max-w-[85%]",
                        msg.sender_type === "supplier" ? "ml-auto bg-primary/10 border border-primary/20" : "bg-muted/40 border border-border"
                      )}>
                        <p className="text-xs text-foreground">{msg.message}</p>
                        <p className="text-[9px] text-muted-foreground mt-1">
                          {msg.sender_name} · {format(new Date(msg.created_at), "dd MMM HH:mm")}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSendMessage()}
                      className={cn(inputClass, "flex-1")} placeholder="Type a message..." />
                    <button onClick={handleSendMessage} disabled={actionLoading || !newMessage.trim()}
                      className="h-9 w-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center">
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Documents Tab */}
              {activeTab === "documents" && (
                <div className="space-y-3">
                  {documents.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No documents shared on this order yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {documents.map(doc => (
                        <div key={doc.id} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                          <FileText size={16} className="text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{doc.file_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {doc.uploaded_by_name} · {format(new Date(doc.created_at), "dd MMM yyyy")}
                              {doc.file_size_bytes && ` · ${(doc.file_size_bytes / 1024).toFixed(0)} KB`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
