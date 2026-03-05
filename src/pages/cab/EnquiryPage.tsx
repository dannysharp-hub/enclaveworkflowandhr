import { useState } from "react";
import { submitLead } from "@/pages/cab/LeadsPage";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

/**
 * Public enquiry form — no auth required.
 * Uses a hardcoded company_id lookup (first cab_companies row) for now.
 * In production, this would resolve from subdomain or URL param.
 */
export default function EnquiryPage() {
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", address: "", postcode: "", roomType: "", dimensions: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // For now, look up the first company (public form)
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: company } = await (supabase.from("cab_companies") as any)
        .select("id")
        .limit(1)
        .single();

      if (!company) throw new Error("No company found");

      await submitLead(company.id, form);
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-primary/15 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} className="text-primary" />
          </div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Thank You!</h1>
          <p className="text-muted-foreground">We've received your enquiry and will be in touch shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-mono font-bold text-foreground">Get a Quote</h1>
          <p className="text-sm text-muted-foreground mt-1">Tell us about your project and we'll get back to you.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-6">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First Name *</Label><Input required value={form.firstName} onChange={e => update("firstName", e.target.value)} /></div>
            <div><Label>Last Name *</Label><Input required value={form.lastName} onChange={e => update("lastName", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone *</Label><Input required value={form.phone} onChange={e => update("phone", e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => update("email", e.target.value)} /></div>
          </div>
          <div><Label>Property Address</Label><Input value={form.address} onChange={e => update("address", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Postcode</Label><Input value={form.postcode} onChange={e => update("postcode", e.target.value)} /></div>
            <div><Label>Room Type</Label><Input value={form.roomType} onChange={e => update("roomType", e.target.value)} placeholder="e.g. Kitchen" /></div>
          </div>
          <div><Label>Rough Dimensions</Label><Input value={form.dimensions} onChange={e => update("dimensions", e.target.value)} placeholder="e.g. 4m x 3m L-shape" /></div>
          <div><Label>Notes</Label><textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Anything else we should know?" /></div>
          <Button type="submit" disabled={submitting} className="w-full">{submitting ? "Sending…" : "Submit Enquiry"}</Button>
        </form>
      </div>
    </div>
  );
}
