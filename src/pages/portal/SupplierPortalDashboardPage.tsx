import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Truck, LogOut, Package, CheckCircle2, Clock, AlertTriangle, Send, Calendar,
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

    // Log activity
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
    const { data } = await (supabase.from("purchase_order_items") as any)
      .select("*")
      .eq("po_id", po.id);
    setPOItems(data ?? []);

    // Log view
    if (supplierUser) {
      await (supabase.from("supplier_activity_log") as any).insert({
        supplier_user_id: supplierUser.id,
        action: "supplier_viewed_po",
        po_id: po.id,
        tenant_id: supplierUser.tenant_id,
      });
    }
  };

  const handleAcknowledge = async () => {
    if (!selectedPO) return;
    setActionLoading(true);
    await (supabase.from("purchase_orders") as any)
      .update({ status: "acknowledged" })
      .eq("id", selectedPO.id);
    toast({ title: "Order acknowledged" });
    setSelectedPO(null);
    load();
    setActionLoading(false);
  };

  const handleConfirmDelivery = async () => {
    if (!selectedPO) return;
    const date = prompt("Confirm delivery date (YYYY-MM-DD):", format(new Date(), "yyyy-MM-dd"));
    if (!date) return;
    setActionLoading(true);
    await (supabase.from("purchase_orders") as any)
      .update({ confirmed_delivery_date: date, status: "acknowledged" })
      .eq("id", selectedPO.id);

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
    load();
    setActionLoading(false);
  };

  const handleProposeDate = async () => {
    if (!selectedPO) return;
    const date = prompt("Propose alternative delivery date (YYYY-MM-DD):");
    if (!date) return;
    setActionLoading(true);
    await (supabase.from("purchase_orders") as any)
      .update({ confirmed_delivery_date: date, notes: (selectedPO.notes || "") + `\n[Supplier proposed: ${date}]` })
      .eq("id", selectedPO.id);
    toast({ title: "Alternative date proposed" });
    setSelectedPO(null);
    load();
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
                  <button
                    onClick={handleAcknowledge}
                    disabled={actionLoading}
                    className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={14} /> Confirm Order
                  </button>
                  <button
                    onClick={handleConfirmDelivery}
                    disabled={actionLoading}
                    className="w-full h-10 rounded-md border border-primary text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Calendar size={14} /> Confirm Delivery Date
                  </button>
                  <button
                    onClick={handleProposeDate}
                    disabled={actionLoading}
                    className="w-full h-10 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Clock size={14} /> Propose Alternative Date
                  </button>
                </div>
              )}

              {selectedPO.status === "acknowledged" && (
                <div className="pt-2 border-t border-border">
                  <button
                    onClick={handleConfirmDelivery}
                    disabled={actionLoading}
                    className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send size={14} /> Update Delivery Date
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
