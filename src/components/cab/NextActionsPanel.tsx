import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Send, CalendarPlus, FileText, Banknote, Package,
  Truck, ClipboardCheck, CheckCircle2, Upload, Eye, ChevronRight,
} from "lucide-react";

interface NextActionsPanelProps {
  job: any;
  companyId: string;
  stageKey: string | null;
  onRefresh: () => void;
  onRequestAppointment: () => void;
  emitting: string | null;
}

export default function NextActionsPanel({
  job, companyId, stageKey, onRefresh, onRequestAppointment, emitting,
}: NextActionsPanelProps) {
  const navigate = useNavigate();
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositSaving, setDepositSaving] = useState(false);
  const [bomFile, setBomFile] = useState<File | null>(null);
  const [bomPreview, setBomPreview] = useState<string[][] | null>(null);
  const [bomSaving, setBomSaving] = useState(false);
  const [bomDialogOpen, setBomDialogOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const scrollTo = (selector: string) => {
    setTimeout(() => {
      document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const emitAndRefresh = async (eventType: string, payload?: Record<string, any>, updates?: Record<string, any>) => {
    setActing(true);
    try {
      if (updates) {
        await (supabase.from("cab_jobs") as any).update(updates).eq("id", job.id);
      }
      await insertCabEvent({ companyId, eventType, jobId: job.id, payload });
      toast({ title: `Action complete: ${eventType.replace(/\./g, " ")}` });
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleDepositReceived = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast({ title: "Enter a valid deposit amount", variant: "destructive" });
      return;
    }
    setDepositSaving(true);
    try {
      const amount = parseFloat(depositAmount);
      await (supabase.from("cab_jobs") as any).update({
        current_stage_key: "project_confirmed",
        state: "active_production",
        status: "active",
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);

      // Create deposit invoice
      await (supabase.from("cab_invoices") as any).insert({
        company_id: companyId,
        job_id: job.id,
        milestone: "deposit",
        reference: job.job_ref + "_DEP",
        amount,
        currency: job.contract_currency || "GBP",
        status: "paid",
        issued_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
        payment_method: "bank_transfer",
      });

      await insertCabEvent({
        companyId, eventType: "deposit.received", jobId: job.id,
        payload: { amount, job_ref: job.job_ref },
      });

      toast({ title: "Deposit recorded — project confirmed" });
      setDepositOpen(false);
      setDepositAmount("");
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDepositSaving(false);
    }
  };

  const handleBomFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBomFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter(l => l.trim()).map(l => l.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
      setBomPreview(lines.slice(0, 20));
      setBomDialogOpen(true);
    };
    reader.readAsText(file);
  };

  const handleBomSave = async () => {
    if (!bomPreview || bomPreview.length < 2) return;
    setBomSaving(true);
    try {
      const headers = bomPreview[0].map(h => h.toLowerCase());
      const nameIdx = headers.findIndex(h => h.includes("name") || h.includes("description") || h.includes("part"));
      const qtyIdx = headers.findIndex(h => h.includes("qty") || h.includes("quantity"));
      const catIdx = headers.findIndex(h => h.includes("category") || h.includes("cat"));
      const specIdx = headers.findIndex(h => h.includes("spec") || h.includes("specification"));

      if (nameIdx === -1) {
        toast({ title: "CSV must have a Name/Description column", variant: "destructive" });
        setBomSaving(false);
        return;
      }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target?.result as string;
        const allLines = text.split("\n").filter(l => l.trim()).map(l => l.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
        const dataRows = allLines.slice(1);

        const items = dataRows.map(row => ({
          company_id: companyId,
          job_id: job.id,
          name: row[nameIdx] || "Unnamed",
          qty: qtyIdx >= 0 ? parseInt(row[qtyIdx]) || 1 : 1,
          category: catIdx >= 0 ? row[catIdx] || "general" : "general",
          spec: specIdx >= 0 ? row[specIdx] || null : null,
          status: "pending",
        })).filter(i => i.name && i.name !== "Unnamed");

        if (items.length === 0) {
          toast({ title: "No valid items found in CSV", variant: "destructive" });
          setBomSaving(false);
          return;
        }

        const { error } = await (supabase.from("cab_buylist_items") as any).insert(items);
        if (error) throw error;

        toast({ title: `${items.length} items imported to buylist` });
        setBomDialogOpen(false);
        setBomFile(null);
        setBomPreview(null);
        onRefresh();
      };
      reader.readAsText(bomFile!);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBomSaving(false);
    }
  };

  const disabled = acting || emitting !== null;

  // Determine actions for current stage
  const renderActions = () => {
    const stage = stageKey || "lead_captured";

    switch (stage) {
      case "lead_captured":
        return (
          <Button size="sm" disabled={disabled} onClick={() => scrollTo("[data-section='ballpark']")}>
            <Send size={14} /> Send Ballpark
          </Button>
        );

      case "ballpark_sent":
        return (
          <>
            <Button size="sm" disabled={disabled} onClick={onRequestAppointment}>
              <CalendarPlus size={14} /> Book Survey
            </Button>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => scrollTo("[data-section='ballpark']")}>
              <Send size={14} /> Send Ballpark Again
            </Button>
          </>
        );

      case "appointment_booked":
        return (
          <>
            <Button size="sm" disabled={disabled} onClick={() => scrollTo("[data-section='quote-builder']")}>
              <FileText size={14} /> Build Final Quote
            </Button>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={onRequestAppointment}>
              <CalendarPlus size={14} /> Reschedule Survey
            </Button>
          </>
        );

      case "quote_sent":
      case "quote_viewed":
        return (
          <>
            <Button size="sm" disabled={disabled} onClick={() => emitAndRefresh(
              "deposit.requested",
              { job_ref: job.job_ref },
              { current_stage_key: "awaiting_deposit", state: "awaiting_deposit", updated_at: new Date().toISOString() }
            )}>
              <Banknote size={14} /> Request Deposit
            </Button>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => scrollTo("[data-section='quote-builder']")}>
              <FileText size={14} /> Revise Quote
            </Button>
          </>
        );

      case "awaiting_deposit":
        return (
          <Button size="sm" disabled={disabled} onClick={() => setDepositOpen(true)}>
            <Banknote size={14} /> Mark Deposit Received
          </Button>
        );

      case "project_confirmed":
        return (
          <>
            <Button size="sm" disabled={disabled} onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Upload BOM / Parts List
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleBomFileSelect} />
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => emitAndRefresh(
              "materials.ordered",
              { job_ref: job.job_ref },
              { current_stage_key: "in_production", state: "in_production", updated_at: new Date().toISOString() }
            )}>
              <Package size={14} /> Order Materials
            </Button>
          </>
        );

      case "in_production":
      case "materials_ordered":
      case "manufacturing_started":
      case "cabinetry_assembled":
      case "ready_for_installation":
        return (
          <Button size="sm" disabled={disabled} onClick={() => emitAndRefresh(
            "install.booked",
            { job_ref: job.job_ref },
            { current_stage_key: "install_booked", updated_at: new Date().toISOString() }
          )}>
            <Truck size={14} /> Mark Ready for Install
          </Button>
        );

      case "install_booked":
        return (
          <Button size="sm" disabled={disabled} onClick={() => navigate(`/jobs/${job.id}/install-signoff`)}>
            <ClipboardCheck size={14} /> Complete Install + Sign Off
          </Button>
        );

      case "install_completed":
      case "installation_complete":
      case "awaiting_signoff":
      case "practical_completed":
        return (
          <>
            <Button size="sm" disabled={disabled} onClick={() => emitAndRefresh(
              "invoice.raised",
              { job_ref: job.job_ref },
              { current_stage_key: "invoiced", updated_at: new Date().toISOString() }
            )}>
              <Banknote size={14} /> Raise Invoice
            </Button>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => navigate(`/jobs/${job.id}/install-signoff`)}>
              <Eye size={14} /> View Install Sign-off
            </Button>
          </>
        );

      case "closed":
      case "closed_paid":
        return (
          <div className="flex items-center gap-2">
            <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] text-xs gap-1">
              <CheckCircle2 size={12} /> Job Complete
            </Badge>
            {job.updated_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(job.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        );

      default:
        return <p className="text-xs text-muted-foreground">No actions available for this stage.</p>;
    }
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <ChevronRight size={14} className="text-primary" /> Next Steps
        </h3>
        <div className="flex flex-wrap gap-2">
          {renderActions()}
        </div>
      </div>

      {/* Deposit Dialog */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Deposit Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Deposit Amount (£)</Label>
              <Input
                type="number"
                step="0.01"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                placeholder={job.contract_value ? String(Math.round(job.contract_value * 0.5)) : "5000"}
                className="font-mono"
              />
              {job.contract_value && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Contract: £{Number(job.contract_value).toLocaleString()} · Suggested 50%: £{Math.round(job.contract_value * 0.5).toLocaleString()}
                </p>
              )}
            </div>
            <Button className="w-full" disabled={depositSaving} onClick={handleDepositReceived}>
              {depositSaving ? "Saving…" : "Confirm Deposit Received"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* BOM Preview Dialog */}
      <Dialog open={bomDialogOpen} onOpenChange={setBomDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>BOM CSV Preview</DialogTitle>
          </DialogHeader>
          {bomPreview && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted">
                      {bomPreview[0]?.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left font-mono text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bomPreview.slice(1).map((row, ri) => (
                      <tr key={ri} className="border-t border-border">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2 py-1 font-mono">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Showing first {Math.min(bomPreview.length - 1, 19)} rows. All rows will be imported.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setBomDialogOpen(false); setBomFile(null); setBomPreview(null); }}>
                  Cancel
                </Button>
                <Button size="sm" disabled={bomSaving} onClick={handleBomSave}>
                  {bomSaving ? "Importing…" : `Import ${bomFile?.name}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
