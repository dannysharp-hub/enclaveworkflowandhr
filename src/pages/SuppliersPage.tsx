import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Plus, X, Check, Pencil, Search, UserPlus, Users, Activity, Star, Package } from "lucide-react";
import SupplierInviteDialog from "@/components/SupplierInviteDialog";
import SupplierCapabilitiesDialog from "@/components/SupplierCapabilitiesDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

export default function SuppliersPage() {
  const { userRole } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", email: "", rfq_email: "", phone: "", address: "", lead_time_days_default: "", min_order_value: "", notes: "", is_preferred: false });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [portalUsersOpen, setPortalUsersOpen] = useState(false);
  const [portalUsers, setPortalUsers] = useState<any[]>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [capsOpen, setCapsOpen] = useState(false);
  const [capsSupplier, setCapsSupplier] = useState<{ id: string; name: string } | null>(null);

  const canManage = userRole === "admin" || userRole === "office";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        email: form.email || null,
        rfq_email: form.rfq_email || null,
        phone: form.phone || null,
        address: form.address || null,
        lead_time_days_default: form.lead_time_days_default ? parseInt(form.lead_time_days_default) : null,
        min_order_value: form.min_order_value ? parseFloat(form.min_order_value) : null,
        notes: form.notes || null,
        is_preferred: form.is_preferred,
      };
      if (editId) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(payload);
        if (error) throw error;
      }
      toast({ title: editId ? "Supplier updated" : "Supplier created" });
      setAdding(false); setEditId(null); load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (s: any) => {
    await supabase.from("suppliers").update({ active: !s.active }).eq("id", s.id);
    load();
  };

  const togglePreferred = async (s: any) => {
    await supabase.from("suppliers").update({ is_preferred: !s.is_preferred } as any).eq("id", s.id);
    load();
  };

  const viewPortalUsers = async () => {
    const { data } = await (supabase.from("supplier_users") as any).select("*, suppliers(name)").order("created_at", { ascending: false });
    setPortalUsers(data ?? []);
    setPortalUsersOpen(true);
  };

  const viewActivity = async () => {
    const { data } = await (supabase.from("supplier_activity_log") as any)
      .select("*, supplier_users(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    setActivityLog(data ?? []);
    setActivityOpen(true);
  };

  const openCapabilities = (s: any) => {
    setCapsSupplier({ id: s.id, name: s.name });
    setCapsOpen(true);
  };

  const startEdit = (s: any) => {
    setEditId(s.id);
    setAdding(true);
    setForm({
      name: s.name,
      email: s.email || "",
      rfq_email: s.rfq_email || "",
      phone: s.phone || "",
      address: s.address || "",
      lead_time_days_default: s.lead_time_days_default?.toString() || "",
      min_order_value: s.min_order_value?.toString() || "",
      notes: s.notes || "",
      is_preferred: s.is_preferred || false,
    });
  };

  const filtered = suppliers.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="space-y-6 animate-slide-in"><h2 className="text-2xl font-mono font-bold text-foreground">Suppliers</h2><div className="h-40 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-mono font-bold text-foreground">Suppliers</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {canManage && (
            <>
              <button onClick={viewActivity} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">
                <Activity size={14} /> Activity
              </button>
              <button onClick={viewPortalUsers} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">
                <Users size={14} /> Portal Users
              </button>
              <button onClick={() => setInviteOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/30 text-xs text-primary hover:bg-primary/10">
                <UserPlus size={14} /> Invite to Portal
              </button>
            </>
          )}
          {!adding && <button onClick={() => { setAdding(true); setEditId(null); setForm({ name: "", email: "", rfq_email: "", phone: "", address: "", lead_time_days_default: "", min_order_value: "", notes: "", is_preferred: false }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus size={14} /> Add Supplier</button>}
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className={cn(inputClass, "pl-9")} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {adding && (
        <div className="glass-panel rounded-lg p-5 space-y-4">
          <h3 className="font-mono text-sm font-bold text-foreground">{editId ? "Edit" : "New"} Supplier</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className={labelClass}>Email</label><input className={inputClass} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><label className={labelClass}>RFQ Email</label><input className={inputClass} placeholder="For quotes" value={form.rfq_email} onChange={e => setForm(f => ({ ...f, rfq_email: e.target.value }))} /></div>
            <div><label className={labelClass}>Phone</label><input className={inputClass} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className={labelClass}>Address</label><input className={inputClass} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div><label className={labelClass}>Lead Time (days)</label><input className={inputClass} type="number" value={form.lead_time_days_default} onChange={e => setForm(f => ({ ...f, lead_time_days_default: e.target.value }))} /></div>
            <div><label className={labelClass}>Min Order (£)</label><input className={inputClass} type="number" step="0.01" value={form.min_order_value} onChange={e => setForm(f => ({ ...f, min_order_value: e.target.value }))} /></div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={form.is_preferred} onChange={e => setForm(f => ({ ...f, is_preferred: e.target.checked }))} />
                <Star size={14} className={form.is_preferred ? "text-chart-4 fill-chart-4" : ""} /> Preferred
              </label>
            </div>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea className={cn(inputClass, "h-16 resize-none")} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.name} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Check size={14} /> {editId ? "Update" : "Create"}</button>
            <button onClick={() => { setAdding(false); setEditId(null); }} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Name</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">RFQ Email</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Phone</th>
            <th className="text-center px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Pref</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                <td className="px-4 py-2 font-medium text-foreground">{s.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.rfq_email || s.email || "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.phone || "—"}</td>
                <td className="px-4 py-2 text-center">
                  <button onClick={() => togglePreferred(s)} className="p-1">
                    <Star size={14} className={cn(s.is_preferred ? "text-chart-4 fill-chart-4" : "text-muted-foreground/30")} />
                  </button>
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => toggleActive(s)} className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono cursor-pointer", s.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{s.active ? "Active" : "Inactive"}</button>
                </td>
                <td className="px-4 py-2 flex items-center gap-1">
                  <button onClick={() => openCapabilities(s)} className="p-1 text-muted-foreground hover:text-foreground" title="Capabilities"><Package size={14} /></button>
                  <button onClick={() => startEdit(s)} className="p-1 text-muted-foreground hover:text-foreground" title="Edit"><Pencil size={14} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No suppliers</td></tr>}
          </tbody>
        </table>
      </div>

      <SupplierInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} suppliers={suppliers.filter(s => s.active)} onSuccess={load} />

      {capsSupplier && (
        <SupplierCapabilitiesDialog open={capsOpen} onOpenChange={setCapsOpen} supplierId={capsSupplier.id} supplierName={capsSupplier.name} />
      )}

      {/* Portal Users Dialog */}
      <Dialog open={portalUsersOpen} onOpenChange={setPortalUsersOpen}>
        <DialogContent className="sm:max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground flex items-center gap-2">
              <Users size={16} className="text-primary" /> Supplier Portal Users
            </DialogTitle>
          </DialogHeader>
          {portalUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No portal users yet.</p>
          ) : (
            <div className="space-y-2">
              {portalUsers.map(u => (
                <div key={u.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.name}</p>
                    <p className="text-[10px] text-muted-foreground">{u.email} · {u.suppliers?.name} · {u.supplier_role}</p>
                  </div>
                  <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                    u.active && u.portal_access_enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {u.active && u.portal_access_enabled ? "Active" : "Disabled"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Activity Log Dialog */}
      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="sm:max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground flex items-center gap-2">
              <Activity size={16} className="text-primary" /> Supplier Activity Log
            </DialogTitle>
          </DialogHeader>
          {activityLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {activityLog.map(a => (
                <div key={a.id} className="rounded-lg border border-border bg-card p-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-foreground">
                      <span className="font-medium">{a.supplier_users?.name || "Unknown"}</span>
                      {" — "}
                      <span className="text-muted-foreground">{a.action.replace(/_/g, " ")}</span>
                    </p>
                    <span className="text-[10px] text-muted-foreground">{format(new Date(a.created_at), "dd MMM HH:mm")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
