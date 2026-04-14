import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  FileText, Send, HardDrive, CheckCircle2, RefreshCw, Loader2, X, Mail, ExternalLink,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface DriveFile {
  id: string;
  file_name: string;
  mime_type: string | null;
  drive_web_view_link: string | null;
}

interface DriveQuoteAttachProps {
  companyId: string;
  job: any;
  customer: any;
  onRefresh: () => void;
}

export default function DriveQuoteAttach({ companyId, job, customer, onRefresh }: DriveQuoteAttachProps) {
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const ensureAcceptanceToken = async (quoteId: string): Promise<string> => {
    const { data: existing, error: fetchErr } = await (supabase.from("cab_quotes") as any)
      .select("acceptance_token")
      .eq("id", quoteId)
      .single();
    if (fetchErr) throw new Error("Failed to fetch quote: " + fetchErr.message);

    if (existing?.acceptance_token) return existing.acceptance_token;

    const newToken = crypto.randomUUID();
    const { data: updated, error: updateErr } = await (supabase.from("cab_quotes") as any)
      .update({ acceptance_token: newToken })
      .eq("id", quoteId)
      .select("acceptance_token")
      .single();
    if (updateErr) throw new Error("Failed to save token: " + updateErr.message);
    if (!updated?.acceptance_token) throw new Error("Token was not saved — possible RLS issue.");
    return updated.acceptance_token;
  };

  const buildQuoteEmailHtml = (firstName: string, acceptUrl: string) => `<p>Hi ${firstName},</p>
<p>Thank you for taking the time to meet with us. Your quote has been prepared and we'd love to get your project underway.</p>
<p>When you are ready to proceed, click the button below to accept your quote and we will be in touch to confirm your project start date.</p>
<p><a href="${acceptUrl}" style="display:inline-block;background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Accept Quote</a></p>
<p>If you have any questions please reply to this email or call us on 07944608098.</p>
<p>Kind regards,<br/>Enclave Cabinetry</p>`;

  const sendQuoteEmail = async (token: string) => {
    if (!customer?.email) throw new Error("No customer email on file.");
    if (!token) throw new Error("Cannot send email without acceptance token.");

    const firstName = customer.first_name || "there";
    const acceptUrl = `https://enclaveworkflowandhr.lovable.app/accept-quote?job_ref=${encodeURIComponent(job.job_ref)}&token=${token}`;

    const { error } = await supabase.functions.invoke("send-email", {
      body: {
        to: customer.email,
        subject: `Your quote from Enclave Cabinetry — ${job.job_ref}`,
        html: buildQuoteEmailHtml(firstName, acceptUrl),
        replyTo: "danny@enclavecabinetry.com",
      },
    });
    if (error) throw error;
  };

  const generateQuotePdf = async (quoteId: string): Promise<{ drive_file_id?: string; file_name?: string }> => {
    const { data, error } = await supabase.functions.invoke("generate-quote-pdf", {
      body: { quote_id: quoteId, job_id: job.id },
    });
    if (error) throw new Error("PDF generation failed: " + error.message);
    if (!data?.ok) throw new Error(data?.error || "PDF generation returned an error");
    return { drive_file_id: data.drive_file_id, file_name: data.file_name };
  };

  const handleDownloadPdf = async () => {
    if (!quote) {
      toast({ title: "No quote to download", variant: "destructive" });
      return;
    }
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-quote-pdf", {
        body: { quote_id: quote.id, job_id: job.id, download: true },
      });
      if (error) throw error;

      // The response is a blob when download=true
      const blob = data instanceof Blob ? data : new Blob([JSON.stringify(data)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quote_v${quote.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Quote PDF downloaded" });
    } catch (err: any) {
      console.error("Download failed:", err);
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!customer?.email) {
      toast({ title: "No email on file", description: "This customer has no email address.", variant: "destructive" });
      return;
    }
    if (!quote) {
      toast({ title: "No quote found", variant: "destructive" });
      return;
    }
    setResending(true);
    try {
      const token = await ensureAcceptanceToken(quote.id);
      await sendQuoteEmail(token);
      const customerName = `${customer.first_name} ${customer.last_name}`;
      toast({ title: `Quote re-sent to ${customerName}` });
      loadQuote();
    } catch (err: any) {
      console.error("Resend email failed:", err);
      toast({ title: "Failed to re-send email", description: err.message, variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const loadQuote = useCallback(async () => {
    await (supabase.from("cab_quotes") as any)
      .delete()
      .eq("job_id", job.id)
      .eq("status", "draft")
      .is("drive_file_id", null);

    const { data: quotes } = await (supabase.from("cab_quotes") as any)
      .select("*")
      .eq("job_id", job.id)
      .order("version", { ascending: false })
      .limit(1);

    const q = quotes?.[0] || null;
    setQuote(q);

    if (q?.drive_file_id && q?.drive_filename) {
      setSelectedFile({
        id: q.drive_file_id,
        file_name: q.drive_filename,
        mime_type: "application/pdf",
        drive_web_view_link: null,
      });
    } else {
      setSelectedFile(null);
    }
    setLoading(false);
  }, [job.id]);

  useEffect(() => { loadQuote(); }, [loadQuote]);

  const openPicker = async () => {
    setPickerOpen(true);
    setLoadingFiles(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "get_job_link", job_id: job.id },
      });
      if (error) throw error;
      const allFiles: DriveFile[] = (data.files || []).filter(
        (f: any) => f.mime_type === "application/pdf" || f.file_name?.toLowerCase().endsWith(".pdf")
      );
      setDriveFiles(allFiles);
    } catch (err: any) {
      toast({ title: "Could not load Drive files", description: err.message, variant: "destructive" });
      setDriveFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleSelectFile = (file: DriveFile) => {
    setSelectedFile(file);
    setPickerOpen(false);
  };

  const handleSaveDraft = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      if (quote) {
        await (supabase.from("cab_quotes") as any)
          .update({
            drive_file_id: selectedFile.id,
            drive_filename: selectedFile.file_name,
            status: "draft",
          })
          .eq("id", quote.id);
      } else {
        await (supabase.from("cab_quotes") as any)
          .insert({
            company_id: companyId,
            job_id: job.id,
            version: 1,
            status: "draft",
            drive_file_id: selectedFile.id,
            drive_filename: selectedFile.file_name,
            currency: job.ballpark_currency || "GBP",
          });
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
    setSending(true);
    try {
      // Ensure a quote record exists
      let quoteId = quote?.id;
      if (!quoteId) {
        const { data: inserted, error: insertErr } = await (supabase.from("cab_quotes") as any)
          .insert({
            company_id: companyId,
            job_id: job.id,
            version: 1,
            status: "draft",
            currency: job.ballpark_currency || "GBP",
          })
          .select("id")
          .single();
        if (insertErr) throw new Error("Failed to create quote: " + insertErr.message);
        quoteId = inserted.id;
      }

      // Generate PDF and save to Drive
      setGeneratingPdf(true);
      let pdfResult: { drive_file_id?: string; file_name?: string } = {};
      try {
        pdfResult = await generateQuotePdf(quoteId);
      } catch (pdfErr: any) {
        console.warn("[DriveQuoteAttach] PDF generation failed, continuing with send:", pdfErr.message);
      }
      setGeneratingPdf(false);

      // Use generated file or fall back to manually selected file
      const driveFileId = pdfResult.drive_file_id || selectedFile?.id || quote?.drive_file_id;
      const driveFileName = pdfResult.file_name || selectedFile?.file_name || quote?.drive_filename;

      const acceptanceToken = crypto.randomUUID();

      // Update quote to sent
      const { data: updated, error: updateErr } = await (supabase.from("cab_quotes") as any)
        .update({
          ...(driveFileId ? { drive_file_id: driveFileId, drive_filename: driveFileName } : {}),
          status: "sent",
          sent_at: new Date().toISOString(),
          acceptance_token: acceptanceToken,
        })
        .eq("id", quoteId)
        .select("acceptance_token")
        .single();
      if (updateErr) throw new Error("Quote update failed: " + updateErr.message);
      if (!updated?.acceptance_token) throw new Error("Token not saved after update.");

      // Emit event
      await insertCabEvent({
        companyId,
        eventType: "quote.sent",
        jobId: job.id,
        customerId: job.customer_id,
        payload: {
          job_ref: job.job_ref,
          drive_file_id: driveFileId,
          drive_filename: driveFileName,
        },
      });

      // Update job stage
      const nextAction = new Date();
      nextAction.setDate(nextAction.getDate() + 7);
      await (supabase.from("cab_jobs") as any).update({
        status: "quoted",
        state: "awaiting_quote_acceptance",
        current_stage_key: "quote_sent",
        estimated_next_action_at: nextAction.toISOString(),
      }).eq("id", job.id);

      const customerName = customer
        ? `${customer.first_name} ${customer.last_name}`
        : "customer";

      // Send email
      if (customer?.email) {
        try {
          await sendQuoteEmail(acceptanceToken);
          toast({ title: `Quote emailed to ${customerName}` });
        } catch (emailErr: any) {
          console.error("Email send failed:", emailErr);
          toast({ title: "Quote saved but email failed", description: emailErr.message, variant: "destructive" });
        }
      } else {
        toast({ title: `Quote sent to ${customerName}`, description: "No email on file — email was not sent." });
      }

      loadQuote();
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading quote…</p>
      </div>
    );
  }

  const isSent = quote && ["sent", "viewed", "accepted"].includes(quote.status);
  const isAccepted = quote?.status === "accepted";
  const isDraft = !quote || quote.status === "draft";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <FileText size={14} className="text-primary" /> Quote
          {quote?.version && <span className="text-muted-foreground font-normal">v{quote.version}</span>}
        </h3>
        <div className="flex items-center gap-2">
          {quote && (
            <>
              <Badge variant={isAccepted ? "default" : isSent ? "secondary" : "outline"}>
                {quote.status}
              </Badge>
              {isAccepted && quote.accepted_at && (
                <Badge variant="default" className="text-[10px] gap-1">
                  <CheckCircle2 size={10} /> Accepted {format(new Date(quote.accepted_at), "dd MMM")}
                </Badge>
              )}
            </>
          )}
          {quote && (
            <Button size="sm" variant="ghost" onClick={handleDownloadPdf} disabled={downloading} className="h-7 px-2">
              {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            </Button>
          )}
        </div>
      </div>

      {/* Sent info */}
      {quote?.sent_at && (
        <p className="text-xs text-muted-foreground">
          Sent {format(new Date(quote.sent_at), "dd MMM yyyy 'at' HH:mm")}
        </p>
      )}

      {/* Selected file display */}
      {selectedFile && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
          <FileText size={16} className="text-destructive shrink-0" />
          <span className="text-sm font-mono truncate flex-1">{selectedFile.file_name}</span>
          {isDraft && (
            <button onClick={() => setSelectedFile(null)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* PDF generation status */}
      {generatingPdf && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Generating quote PDF…
        </div>
      )}

      {/* Actions */}
      {isDraft && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={openPicker}>
            <HardDrive size={12} /> {selectedFile ? "Change File" : "Attach Quote from Drive"}
          </Button>

          {selectedFile && (
            <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={saving}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
              {saving ? "Saving…" : "Save Draft"}
            </Button>
          )}

          <Button size="sm" onClick={handleSendQuote} disabled={sending}>
            <Send size={12} /> {sending ? "Sending…" : "Send Quote to Customer"}
          </Button>
        </div>
      )}

      {/* Already sent — option to resend */}
      {isSent && !isAccepted && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Quote has been sent. It will be updated to "viewed" when the customer opens it on the portal.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={openPicker}>
              <HardDrive size={12} /> Change File
            </Button>
            <Button size="sm" variant="outline" onClick={handleSendQuote} disabled={sending}>
              <RefreshCw size={12} /> {sending ? "Sending…" : "Send Again"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleResendEmail} disabled={resending}>
              <Mail size={12} /> {resending ? "Sending…" : "Re-send Email"}
            </Button>
          </div>
        </div>
      )}

      {/* Accepted summary */}
      {isAccepted && quote.accepted_at && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
          <p className="text-xs font-bold text-foreground">Quote Accepted</p>
          <p className="text-xs text-muted-foreground">
            Accepted on {format(new Date(quote.accepted_at), "dd MMM yyyy 'at' HH:mm")}
          </p>
        </div>
      )}

      {/* Drive File Picker Dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <HardDrive size={16} /> Select Quote PDF
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {loadingFiles && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
            {!loadingFiles && driveFiles.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No PDF files found in this job's Drive folder.
              </p>
            )}
            {!loadingFiles && driveFiles.map((f) => (
              <button
                key={f.id}
                onClick={() => handleSelectFile(f)}
                className="w-full flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
              >
                <FileText size={16} className="text-destructive shrink-0" />
                <span className="text-sm font-mono truncate">{f.file_name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
