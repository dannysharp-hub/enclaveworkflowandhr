import { useState, useRef } from "react";
import { useApprovalGate } from "@/hooks/useApprovalGate";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { buildInvoiceEmailHtml } from "@/lib/invoiceEmailTemplate";
import { fireDocumentGeneration } from "@/lib/generateDocumentFromTemplate";
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
  onMarkInstallComplete?: () => void;
  emitting: string | null;
}

export default function NextActionsPanel({
  job, companyId, stageKey, onRefresh, onRequestAppointment, onMarkInstallComplete, emitting,
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
  const [orderMaterialsOpen, setOrderMaterialsOpen] = useState(false);
  const [orderMaterialsSaving, setOrderMaterialsSaving] = useState(false);
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

  const handleRequestDeposit = async () => {
    if (!job.contract_value || job.contract_value <= 0) {
      toast({ title: "Please add a contract value before requesting the deposit", variant: "destructive" });
      return;
    }
    setActing(true);
    try {
      console.log("[RequestDeposit] Button clicked for job:", job.id, job.job_ref);

      console.log("[RequestDeposit] Updating job stage to awaiting_deposit...");
      const { error: jobErr } = await (supabase.from("cab_jobs") as any).update({
        current_stage_key: "awaiting_deposit",
        state: "awaiting_deposit",
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      if (jobErr) throw new Error(`Job update failed: ${jobErr.message}`);
      console.log("[RequestDeposit] Job stage updated OK");

      console.log("[RequestDeposit] Inserting cab_event...");
      await insertCabEvent({ companyId, eventType: "deposit.requested", jobId: job.id, payload: { job_ref: job.job_ref } });
      console.log("[RequestDeposit] Event inserted OK");

      console.log("[RequestDeposit] Fetching customer:", job.customer_id);
      const { data: customers } = await (supabase.from("cab_customers") as any)
        .select("*").eq("id", job.customer_id).limit(1);
      const customer = customers?.[0];
      console.log("[RequestDeposit] Customer:", customer?.email, customer?.first_name, customer?.last_name);

      if (customer?.email) {
        const contractValue = job.contract_value || 0;
        const depAmount = (contractValue * 0.50).toFixed(2);
        const customerFullName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Customer";
        const jobRefNum = job.job_ref?.replace(/[^0-9]/g, "") || job.job_ref;

        console.log("[RequestDeposit] Building deposit email HTML...");
        const depositHtml = await buildInvoiceEmailHtml({
          invoiceNumber: `DEP-${jobRefNum}`,
          customerName: customerFullName,
          customerFirstName: customer.first_name || "there",
          jobRef: job.job_ref,
          jobTitle: job.job_title || job.job_ref,
          milestone: "deposit",
          amount: Number(depAmount).toLocaleString("en-GB", { minimumFractionDigits: 2 }),
          paymentReference: job.job_ref,
        });

        console.log("[RequestDeposit] Calling send-email edge function...");
        const { data: emailRes, error: emailErr } = await supabase.functions.invoke("send-email", {
          body: {
            to: customer.email,
            subject: `Deposit Invoice — Enclave Cabinetry — ${job.job_ref}`,
            html: depositHtml,
            replyTo: "danny@enclavecabinetry.com",
          },
        });
        console.log("[RequestDeposit] Email response:", JSON.stringify(emailRes), "error:", emailErr);

        if (emailErr) {
          toast({ title: "Deposit requested but email failed", description: emailErr.message, variant: "destructive" });
        } else {
          toast({ title: "Deposit invoice sent", description: `Email sent to ${customer.email}` });
        }
      } else {
        console.log("[RequestDeposit] No customer email — skipping email");
        toast({ title: "Deposit requested", description: "No customer email on file — no invoice sent", variant: "destructive" });
      }

      console.log("[RequestDeposit] Sending notification to Danny...");
      await supabase.functions.invoke("send-email", {
        body: {
          to: "danny@enclavecabinetry.com",
          subject: `Deposit Requested — ${job.job_ref}`,
          html: `<p>Deposit invoice has been sent for ${job.job_ref} (${job.job_title}).</p>`,
          replyTo: "danny@enclavecabinetry.com",
        },
      });

      onRefresh();
    } catch (err: any) {
      console.error("[RequestDeposit] Error:", err);
      toast({ title: "Request Deposit failed", description: err.message, variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleResendDepositInvoice = async () => {
    if (!job.contract_value || job.contract_value <= 0) {
      toast({ title: "Please add a contract value before requesting the deposit", variant: "destructive" });
      return;
    }
    setActing(true);
    try {
      console.log("[ResendDeposit] Resending deposit invoice for job:", job.id, job.job_ref);
      const { data: customers } = await (supabase.from("cab_customers") as any)
        .select("*").eq("id", job.customer_id).limit(1);
      const customer = customers?.[0];
      if (!customer?.email) {
        toast({ title: "No customer email on file", variant: "destructive" });
        return;
      }
      const contractValue = job.contract_value || 0;
      const depAmount = (contractValue * 0.50).toFixed(2);
      const customerFullName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Customer";
      const jobRefNum = job.job_ref?.replace(/[^0-9]/g, "") || job.job_ref;
      const depositHtml = await buildInvoiceEmailHtml({
        invoiceNumber: `DEP-${jobRefNum}`,
        customerName: customerFullName,
        customerFirstName: customer.first_name || "there",
        jobRef: job.job_ref,
        jobTitle: job.job_title || job.job_ref,
        milestone: "deposit",
        amount: Number(depAmount).toLocaleString("en-GB", { minimumFractionDigits: 2 }),
        paymentReference: job.job_ref,
      });
      const { error: emailErr } = await supabase.functions.invoke("send-email", {
        body: {
          to: customer.email,
          subject: `Deposit Invoice — Enclave Cabinetry — ${job.job_ref}`,
          html: depositHtml,
          replyTo: "danny@enclavecabinetry.com",
        },
      });
      if (emailErr) {
        toast({ title: "Email failed", description: emailErr.message, variant: "destructive" });
      } else {
        toast({ title: "Deposit invoice resent", description: `Email sent to ${customer.email}` });
      }
    } catch (err: any) {
      console.error("[ResendDeposit] Error:", err);
      toast({ title: "Resend failed", description: err.message, variant: "destructive" });
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

      // Fire-and-forget: generate deposit invoice from template
      fireDocumentGeneration(job.id, "invoice_deposit");

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
    if (!bomPreview || bomPreview.length < 2 || !bomFile) return;
    setBomSaving(true);
    try {
      // Re-read full file (preview may be truncated to 20 rows)
      const text = await bomFile.text();
      const allLines = text.split("\n").filter(l => l.trim()).map(l => l.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
      if (allLines.length < 2) { setBomSaving(false); return; }

      const headers = allLines[0];
      const headersLower = headers.map(h => h.toLowerCase().trim());
      const partNumIdx = headersLower.findIndex(h => h === "part number");
      const nameIdx = headersLower.findIndex(h => h === "filename");
      const qtyIdx = headersLower.findIndex(h => h === "qty");
      const matIdx = headersLower.findIndex(h => h === "material");
      const grainIdx = headersLower.findIndex(h => h === "grain");
      const widthIdx = headersLower.findIndex(h => h === "width");
      const lengthIdx = headersLower.findIndex(h => h === "length");
      const thicknessIdx = headersLower.findIndex(h => h === "thickness");
      const unitQtyIdx = headersLower.findIndex(h => h === "unit qty");

      const dataRows = allLines.slice(1);
      const items = dataRows.map(row => {
        const partNumber = partNumIdx >= 0 ? row[partNumIdx]?.trim() || "" : "";
        const fileName = nameIdx >= 0 ? row[nameIdx]?.trim() || "" : "";
        const qty = qtyIdx >= 0 ? parseInt(row[qtyIdx]) || 1 : 1;
        const material = matIdx >= 0 ? row[matIdx]?.trim() || "" : "";
        const grain = grainIdx >= 0 ? row[grainIdx]?.trim() || null : null;
        const width = widthIdx >= 0 ? parseFloat(row[widthIdx]) || null : null;
        const length = lengthIdx >= 0 ? parseFloat(row[lengthIdx]) || null : null;
        const thickness = thicknessIdx >= 0 ? parseFloat(row[thicknessIdx]) || null : null;
        const unitQty = unitQtyIdx >= 0 ? parseFloat(row[unitQtyIdx]) || null : null;

        const name = fileName || partNumber || "Unnamed";
        const spec = partNumber || null;

        return {
          company_id: companyId,
          job_id: job.id,
          name,
          qty,
          category: material || "general",
          spec,
          status: "needed",
          grain,
          width,
          length,
          thickness,
          unit_qty: unitQty,
        };
      }).filter(i => i.name && i.name !== "Unnamed");

      if (items.length === 0) {
        toast({ title: "No valid items found in CSV", variant: "destructive" });
        setBomSaving(false);
        return;
      }

      // Delete existing buylist items for this job first
      await (supabase.from("cab_buylist_items") as any).delete().eq("job_id", job.id);

      // Insert new items
      const { error } = await (supabase.from("cab_buylist_items") as any).insert(items);
      if (error) throw error;

      // Emit bom.uploaded event
      await insertCabEvent({
        companyId, eventType: "bom.uploaded", jobId: job.id,
        payload: { parts_count: items.length, filename: bomFile.name },
      });

      toast({ title: `BOM imported — ${items.length} parts loaded` });
      setBomDialogOpen(false);
      setBomFile(null);
      setBomPreview(null);
      onRefresh();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
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
            <Button size="sm" disabled={disabled} onClick={handleRequestDeposit}>
              <Banknote size={14} /> Request Deposit
            </Button>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => scrollTo("[data-section='quote-builder']")}>
              <FileText size={14} /> Revise Quote
            </Button>
          </>
        );

      case "awaiting_deposit":
        return (
          <>
            <Button size="sm" disabled={disabled} onClick={() => setDepositOpen(true)}>
              <Banknote size={14} /> Mark Deposit Received
            </Button>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={handleResendDepositInvoice}>
              <Send size={14} /> Resend Deposit Invoice
            </Button>
          </>
        );

      case "project_confirmed":
        return (
          <>
            <Button size="sm" disabled={disabled} onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Upload BOM / Parts List
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleBomFileSelect} />
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setOrderMaterialsOpen(true)}>
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

      case "ready_for_install":
      case "install_booked":
        return (
          <>
            <Button size="sm" disabled={disabled} onClick={() => onMarkInstallComplete?.()}>
              <ClipboardCheck size={14} /> Mark Install Complete
            </Button>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => navigate(`/jobs/${job.id}/install-signoff`)}>
              <Eye size={14} /> View Legacy Sign-off
            </Button>
          </>
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
                  {bomSaving ? "Importing…" : "Import BOM"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Order Materials Confirmation Dialog */}
      <Dialog open={orderMaterialsOpen} onOpenChange={setOrderMaterialsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Order Materials</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Mark all materials as ordered? This will move the job to the Materials Ordered stage.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setOrderMaterialsOpen(false)} disabled={orderMaterialsSaving}>
              Cancel
            </Button>
            <Button size="sm" disabled={orderMaterialsSaving} onClick={async () => {
              setOrderMaterialsSaving(true);
              try {
                await (supabase.from("cab_jobs") as any).update({
                  current_stage_key: "materials_ordered",
                  updated_at: new Date().toISOString(),
                }).eq("id", job.id);

                await (supabase.from("cab_buylist_items") as any)
                  .update({ status: "ordered", updated_at: new Date().toISOString() })
                  .eq("job_id", job.id);

                await insertCabEvent({
                  companyId, eventType: "materials.ordered", jobId: job.id,
                  payload: { job_ref: job.job_ref },
                });

                toast({ title: "Materials marked as ordered" });
                setOrderMaterialsOpen(false);
                onRefresh();
              } catch (err: any) {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              } finally {
                setOrderMaterialsSaving(false);
              }
            }}>
              {orderMaterialsSaving ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
