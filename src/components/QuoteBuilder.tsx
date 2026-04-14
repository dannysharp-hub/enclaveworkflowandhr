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
  Plus, Trash2, Save, Send, FileText, Eye, CheckCircle2,
} from "lucide-react";

interface QuoteItem {
  id?: string;
  name: string;
  description: string;
  qty: number;
  unit_price: number;
  sort_order: number;
}

interface QuoteBuilderProps {
  companyId: string;
  job: any;
  onRefresh: () => void;
}

export default function QuoteBuilder({ companyId, job, onRefresh }: QuoteBuilderProps) {
  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [scope, setScope] = useState("");
  const [terms, setTerms] = useState("Standard terms and conditions apply. 50% deposit due on acceptance, 30% pre-installation, 20% on completion.");
  const [priceOverride, setPriceOverride] = useState("");
  const [viewCount, setViewCount] = useState(0);
  const [acceptance, setAcceptance] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadQuote = useCallback(async () => {
    // Get latest quote for this job
    const { data: quotes } = await (supabase.from("cab_quotes") as any)
      .select("*")
      .eq("job_id", job.id)
      .order("version", { ascending: false })
      .limit(1);

    const q = quotes?.[0] || null;
    setQuote(q);

    if (q) {
      setScope(q.scope_markdown || q.scope_summary || "");
      setTerms(q.terms_markdown || "Standard terms and conditions apply. 50% deposit due on acceptance, 30% pre-installation, 20% on completion.");
      setPriceOverride(q.price_max?.toString() || "");

      // Load items
      const { data: itemsData } = await (supabase.from("cab_quote_items") as any)
        .select("*")
        .eq("quote_id", q.id)
        .order("sort_order");
      setItems(
        (itemsData || []).map((i: any) => ({
          id: i.id,
          name: i.name,
          description: i.description || "",
          qty: Number(i.qty),
          unit_price: Number(i.unit_price),
          sort_order: i.sort_order,
        }))
      );

      // Load view count
      const { count } = await (supabase.from("cab_quote_views") as any)
        .select("id", { count: "exact", head: true })
        .eq("quote_id", q.id);
      setViewCount(count || 0);

      // Load acceptance
      const { data: acc } = await (supabase.from("cab_quote_acceptances") as any)
        .select("*")
        .eq("quote_id", q.id)
        .limit(1)
        .maybeSingle();
      setAcceptance(acc);
    } else {
      setItems([]);
      setScope("");
      setViewCount(0);
      setAcceptance(null);
    }
    setLoading(false);
  }, [job.id]);

  useEffect(() => { loadQuote(); }, [loadQuote]);

  const calculatedTotal = items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);
  const effectiveMax = priceOverride ? parseFloat(priceOverride) : calculatedTotal;

  const handleCreateQuote = async () => {
    setSaving(true);
    try {
      const existingCount = quote ? quote.version : 0;
      const { data: newQuote, error } = await (supabase.from("cab_quotes") as any)
        .insert({
          company_id: companyId,
          job_id: job.id,
          version: existingCount + 1,
          status: "draft",
          price_min: 0,
          price_max: 0,
          currency: job.ballpark_currency || "GBP",
          scope_markdown: "",
          terms_markdown: terms,
        })
        .select()
        .single();
      if (error) throw error;
      setQuote(newQuote);
      toast({ title: "Quote draft created" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = () => {
    setItems([...items, { name: "", description: "", qty: 1, unit_price: 0, sort_order: items.length }]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: keyof QuoteItem, value: string | number) => {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSaveDraft = async () => {
    if (!quote) return;
    setSaving(true);
    try {
      // Update quote
      await (supabase.from("cab_quotes") as any)
        .update({
          price_min: calculatedTotal,
          price_max: effectiveMax,
          scope_markdown: scope,
          scope_summary: scope.slice(0, 500),
          terms_markdown: terms,
        })
        .eq("id", quote.id);

      // Delete old items, insert new
      await (supabase.from("cab_quote_items") as any).delete().eq("quote_id", quote.id);

      if (items.length > 0) {
        const toInsert = items.map((item, idx) => ({
          company_id: companyId,
          quote_id: quote.id,
          name: item.name,
          description: item.description || null,
          qty: item.qty,
          unit_price: item.unit_price,
          sort_order: idx,
        }));
        await (supabase.from("cab_quote_items") as any).insert(toInsert);
      }

      toast({ title: "Quote draft saved" });
      loadQuote();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSendQuote = async () => {
    if (!quote) return;
    if (items.length === 0 && !effectiveMax) {
      toast({ title: "Add items or set a price first", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      // Save first
      await (supabase.from("cab_quotes") as any)
        .update({
          price_min: calculatedTotal,
          price_max: effectiveMax,
          scope_markdown: scope,
          scope_summary: scope.slice(0, 500),
          terms_markdown: terms,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", quote.id);

      // Save items
      await (supabase.from("cab_quote_items") as any).delete().eq("quote_id", quote.id);
      if (items.length > 0) {
        const toInsert = items.map((item, idx) => ({
          company_id: companyId,
          quote_id: quote.id,
          name: item.name,
          description: item.description || null,
          qty: item.qty,
          unit_price: item.unit_price,
          sort_order: idx,
        }));
        await (supabase.from("cab_quote_items") as any).insert(toInsert);
      }

      // Emit event
      await insertCabEvent({
        companyId,
        eventType: "quote.sent",
        jobId: job.id,
        payload: { quote_id: quote.id, job_ref: job.job_ref, price_max: effectiveMax },
      });

      // Update job state
      const nextAction = new Date();
      nextAction.setDate(nextAction.getDate() + 7);
      await (supabase.from("cab_jobs") as any).update({
        status: "quoted",
        state: "awaiting_quote_acceptance",
        current_stage_key: "quote_sent",
        estimated_next_action_at: nextAction.toISOString(),
      }).eq("id", job.id);

      toast({ title: "Quote sent to customer" });

      // Save quote PDF to Drive folder (fire-and-forget, don't block the send)
      supabase.functions.invoke("save-quote-to-drive", {
        body: { quote_id: quote.id, job_id: job.id },
      }).then(({ error: driveErr }) => {
        if (driveErr) console.error("[QuoteBuilder] save-quote-to-drive failed:", driveErr.message);
        else console.log("[QuoteBuilder] Quote saved to Drive folder");
      });

      loadQuote();
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="rounded-lg border border-border bg-card p-4"><p className="text-sm text-muted-foreground">Loading quote…</p></div>;
  }

  // No quote yet — offer to create
  if (!quote) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <FileText size={14} className="text-primary" /> Quote
        </h3>
        <p className="text-xs text-muted-foreground">No quote created yet for this job.</p>
        <Button size="sm" onClick={handleCreateQuote} disabled={saving}>
          <Plus size={12} /> {saving ? "Creating…" : "Create Quote"}
        </Button>
      </div>
    );
  }

  const isSent = ["sent", "viewed", "accepted"].includes(quote.status);
  const isAccepted = quote.status === "accepted";
  const isEditable = quote.status === "draft";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <FileText size={14} className="text-primary" /> Quote v{quote.version}
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant={isAccepted ? "default" : isSent ? "secondary" : "outline"}>
            {quote.status}
          </Badge>
          {isSent && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Eye size={10} /> {viewCount} view{viewCount !== 1 ? "s" : ""}
            </span>
          )}
          {isAccepted && acceptance && (
            <Badge variant="default" className="text-[10px] gap-1">
              <CheckCircle2 size={10} /> Accepted {format(new Date(acceptance.accepted_at), "dd MMM")}
            </Badge>
          )}
        </div>
      </div>

      {/* Sent info */}
      {quote.sent_at && (
        <p className="text-xs text-muted-foreground">
          Sent {format(new Date(quote.sent_at), "dd MMM yyyy 'at' HH:mm")}
        </p>
      )}

      {/* Line items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold">Line Items</Label>
          {isEditable && (
            <Button size="sm" variant="ghost" onClick={handleAddItem} className="h-6 text-xs">
              <Plus size={10} /> Add Item
            </Button>
          )}
        </div>

        {items.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No items yet. Add items or set a total price below.</p>
        )}

        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-start">
            <div className="col-span-4">
              <Input
                placeholder="Item name"
                value={item.name}
                onChange={e => handleItemChange(idx, "name", e.target.value)}
                disabled={!isEditable}
                className="text-xs h-8"
              />
            </div>
            <div className="col-span-3">
              <Input
                placeholder="Description"
                value={item.description}
                onChange={e => handleItemChange(idx, "description", e.target.value)}
                disabled={!isEditable}
                className="text-xs h-8"
              />
            </div>
            <div className="col-span-1">
              <Input
                type="number"
                step="1"
                value={item.qty}
                onChange={e => handleItemChange(idx, "qty", parseFloat(e.target.value) || 0)}
                disabled={!isEditable}
                className="text-xs h-8 font-mono"
              />
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                step="0.01"
                value={item.unit_price}
                onChange={e => handleItemChange(idx, "unit_price", parseFloat(e.target.value) || 0)}
                disabled={!isEditable}
                className="text-xs h-8 font-mono"
              />
            </div>
            <div className="col-span-1 flex items-center justify-end h-8">
              <span className="text-xs font-mono text-muted-foreground">£{(item.qty * item.unit_price).toLocaleString()}</span>
            </div>
            <div className="col-span-1 flex items-center justify-end h-8">
              {isEditable && (
                <Button size="sm" variant="ghost" onClick={() => handleRemoveItem(idx)} className="h-6 w-6 p-0">
                  <Trash2 size={12} className="text-destructive" />
                </Button>
              )}
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <div className="flex justify-end border-t border-border pt-2">
            <span className="text-sm font-mono font-bold">
              Items Total: £{calculatedTotal.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Price override */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Quote Price (£) {items.length > 0 ? "(override)" : "*"}</Label>
          <Input
            type="number"
            step="0.01"
            value={priceOverride}
            onChange={e => setPriceOverride(e.target.value)}
            disabled={!isEditable}
            placeholder={calculatedTotal ? calculatedTotal.toString() : "Enter price"}
            className="font-mono text-xs"
          />
        </div>
        <div className="flex items-end">
          <p className="text-xs text-muted-foreground">
            Effective quote: <strong className="font-mono">£{effectiveMax.toLocaleString()}</strong>
          </p>
        </div>
      </div>

      {/* Scope */}
      <div>
        <Label className="text-xs">Scope of Works</Label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          rows={4}
          value={scope}
          onChange={e => setScope(e.target.value)}
          disabled={!isEditable}
          placeholder="Full kitchen supply and installation including…"
        />
      </div>

      {/* Terms */}
      <div>
        <Label className="text-xs">Terms &amp; Conditions</Label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          rows={3}
          value={terms}
          onChange={e => setTerms(e.target.value)}
          disabled={!isEditable}
          placeholder="Payment terms, warranty, etc."
        />
      </div>

      {/* Actions */}
      {isEditable && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={saving}>
            <Save size={12} /> {saving ? "Saving…" : "Save Draft"}
          </Button>
          <Button size="sm" onClick={handleSendQuote} disabled={sending || (!effectiveMax && items.length === 0)}>
            <Send size={12} /> {sending ? "Sending…" : "Send Quote to Customer"}
          </Button>
        </div>
      )}

      {/* Accepted summary */}
      {isAccepted && acceptance && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
          <p className="text-xs font-bold text-foreground">Quote Accepted</p>
          <p className="text-xs text-muted-foreground">
            By: {acceptance.accepted_by_name} on {format(new Date(acceptance.accepted_at), "dd MMM yyyy 'at' HH:mm")}
          </p>
          {acceptance.terms_version && (
            <p className="text-[10px] text-muted-foreground">Terms version: {acceptance.terms_version}</p>
          )}
        </div>
      )}

      {/* New version after acceptance / if sent */}
      {isSent && !isAccepted && (
        <p className="text-xs text-muted-foreground">
          Quote has been sent. It will be updated to "viewed" when the customer opens it on the portal.
        </p>
      )}
    </div>
  );
}
