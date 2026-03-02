import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPlus, Check, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: { id: string; name: string }[];
  onSuccess: () => void;
}

export default function SupplierInviteDialog({ open, onOpenChange, suppliers, onSuccess }: Props) {
  const { tenantId } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", supplier_id: "" });
  const [submitting, setSubmitting] = useState(false);

  const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase";

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.supplier_id || !tenantId) {
      toast({ title: "Fill all fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-supplier-portal", {
        body: {
          action: "invite_supplier",
          name: form.name,
          email: form.email,
          supplier_id: form.supplier_id,
          tenant_id: tenantId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Supplier invited", description: data.message });
      onOpenChange(false);
      setForm({ name: "", email: "", supplier_id: "" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground flex items-center gap-2">
            <UserPlus size={16} className="text-primary" /> Invite Supplier User
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Supplier *</label>
            <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} className={inputClass}>
              <option value="">Select supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Contact Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="John Smith" />
          </div>
          <div>
            <label className={labelClass}>Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputClass} placeholder="john@supplier.com" />
          </div>
          <p className="text-[10px] text-muted-foreground">They'll receive a password reset email to set up their portal access.</p>
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {submitting ? "Inviting…" : "Send Invite"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
