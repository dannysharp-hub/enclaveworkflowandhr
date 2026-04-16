import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import SignaturePad from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, CheckCircle2, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface FitterSignOffPanelProps {
  job: any;
  customer: any;
  companyId: string;
  onComplete: () => void;
}

const LOGO_URL = "https://taftcuryslgdkstzqrcy.supabase.co/storage/v1/object/public/assets/ec-logo.png";

export default function FitterSignOffPanel({ job, customer, companyId, onComplete }: FitterSignOffPanelProps) {
  const { user } = useAuth();
  const [installComplete, setInstallComplete] = useState(false);
  const [siteClean, setSiteClean] = useState(false);
  const [snagging, setSnagging] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isFitterSigned = !!job.fitter_signed_at;
  const allChecked = installComplete && siteClean && !!signatureData;

  // Read-only locked view
  if (isFitterSigned) {
    const checklist = job.fitter_checklist_json || {};
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
        <h4 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-500" /> Fitter Sign-Off — Complete
        </h4>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>✔ Installation complete</p>
          <p>✔ Site left clean and tidy</p>
          {checklist.snagging && <p className="mt-2"><span className="font-medium text-foreground">Snagging:</span> {checklist.snagging}</p>}
          <p className="mt-2">Signed by <span className="font-medium text-foreground">{job.fitter_signed_by}</span> · {format(new Date(job.fitter_signed_at), "dd MMM yyyy HH:mm")}</p>
        </div>
        {job.fitter_signature_url && (
          <img src={job.fitter_signature_url} alt="Fitter signature" className="h-16 border border-border rounded bg-white p-1" />
        )}
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!allChecked) return;
    setSubmitting(true);
    try {
      const fitterName = user?.user_metadata?.full_name || user?.email || "Fitter";
      const now = new Date().toISOString();
      const signOffToken = crypto.randomUUID();

      // Save fitter sign-off data + generate sign-off token for customer
      const { error: updateError } = await (supabase.from("cab_jobs") as any).update({
        fitter_signature_url: signatureData,
        fitter_signed_by: fitterName,
        fitter_signed_at: now,
        fitter_checklist_json: {
          installation_complete: true,
          site_clean_and_tidy: true,
          snagging: snagging.trim() || null,
        },
        sign_off_token: signOffToken,
        current_stage_key: "awaiting_signoff",
        state: "installed_pending_signoff",
        updated_at: now,
      }).eq("id", job.id);

      if (updateError) throw updateError;

      // Verify token saved
      const { data: verify } = await (supabase.from("cab_jobs") as any)
        .select("sign_off_token").eq("id", job.id).single();
      if (!verify?.sign_off_token) throw new Error("Token was not saved — aborting");

      // Insert event
      await insertCabEvent({
        companyId,
        eventType: "fitter.signed_off",
        jobId: job.id,
        payload: { fitter: fitterName, snagging: snagging.trim() || null },
      });

      // Send customer sign-off email
      if (customer?.email) {
        const signOffUrl = `https://cabinetrycommand.com/sign-off?job_ref=${encodeURIComponent(job.job_ref)}&token=${verify.sign_off_token}`;

        const address = job.property_address_json
          ? [job.property_address_json.line1, job.property_address_json.line2, job.property_address_json.city, job.property_address_json.postcode].filter(Boolean).join(", ")
          : "";

        await supabase.functions.invoke("send-email", {
          body: {
            to: customer.email,
            subject: `Your Enclave Cabinetry Installation — Please Sign Off`,
            replyTo: "info@enclavecabinetry.com",
            html: buildCustomerSignOffEmail({
              firstName: customer.first_name || "there",
              jobRef: job.job_ref,
              jobTitle: job.job_title,
              signOffUrl,
            }),
          },
        });
      }

      toast({ title: "Fitter sign-off submitted", description: "Customer sign-off email sent" });
      onComplete();
    } catch (err: any) {
      console.error("Fitter sign-off error:", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h4 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
        <ClipboardCheck size={14} className="text-primary" /> Fitter Sign-Off
      </h4>

      {/* Checklist */}
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox checked={installComplete} onCheckedChange={(v) => setInstallComplete(!!v)} />
          <span className="text-sm">Installation complete</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox checked={siteClean} onCheckedChange={(v) => setSiteClean(!!v)} />
          <span className="text-sm">Site left clean and tidy</span>
        </label>
      </div>

      {/* Snagging notes */}
      <div className="space-y-1">
        <Label className="text-xs">Any issues to note? (optional)</Label>
        <textarea
          className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          placeholder="Snagging items, minor adjustments needed…"
          value={snagging}
          onChange={(e) => setSnagging(e.target.value)}
        />
      </div>

      {/* Signature */}
      <div className="space-y-1">
        <Label className="text-xs">Fitter Signature *</Label>
        <SignaturePad onSignature={setSignatureData} />
      </div>

      {/* Submit */}
      <Button
        className="w-full"
        disabled={!allChecked || submitting}
        onClick={handleSubmit}
      >
        {submitting ? <Loader2 size={14} className="animate-spin mr-2" /> : <CheckCircle2 size={14} className="mr-2" />}
        {submitting ? "Submitting…" : "Submit Fitter Sign-Off"}
      </Button>

      {!allChecked && (
        <p className="text-[10px] text-muted-foreground">
          Complete all checklist items and sign above to submit
        </p>
      )}
    </div>
  );
}

function buildCustomerSignOffEmail({ firstName, jobRef, jobTitle, signOffUrl }: {
  firstName: string; jobRef: string; jobTitle: string; signOffUrl: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: #1B2A4A; padding: 24px; text-align: center;">
        <img src="https://taftcuryslgdkstzqrcy.supabase.co/storage/v1/object/public/assets/ec-logo.png" alt="Enclave Cabinetry" style="height: 48px;" />
      </div>
      <div style="padding: 32px 24px;">
        <h2 style="color: #1B2A4A; margin: 0 0 16px;">Your Installation is Complete</h2>
        <p style="color: #333; line-height: 1.6;">Hi ${firstName},</p>
        <p style="color: #333; line-height: 1.6;">Your installation is complete! Please take a moment to sign off your project using the link below.</p>
        <div style="background: #f8f7f4; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #C9A96E;">
          <p style="margin: 4px 0; color: #333;"><strong>Job:</strong> ${jobRef}</p>
          <p style="margin: 4px 0; color: #333;"><strong>Project:</strong> ${jobTitle}</p>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${signOffUrl}" style="background: #C9A96E; color: #1B2A4A; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 16px;">
            Sign Off Your Installation
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">If you have any questions please call us on <a href="tel:07944608098" style="color: #C9A96E;">07944 608098</a>.</p>
        <p style="color: #333;">Kind regards,<br/><strong>Enclave Cabinetry</strong></p>
      </div>
      <div style="background: #1B2A4A; padding: 16px; text-align: center;">
        <p style="color: #C9A96E; font-size: 12px; margin: 0;">Enclave Cabinetry · 07944 608098 · info@enclavecabinetry.com</p>
      </div>
    </div>
  `;
}
