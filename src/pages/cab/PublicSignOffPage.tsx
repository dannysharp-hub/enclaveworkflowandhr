import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SignaturePad from "@/components/SignaturePad";
import { ClipboardCheck, Loader2, CheckCircle2 } from "lucide-react";

export default function PublicSignOffPage() {
  const [params] = useSearchParams();
  const jobRef = params.get("job_ref");
  const token = params.get("token");

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!jobRef || !token) {
      setError("Invalid sign-off link. Please contact Enclave Cabinetry.");
      setLoading(false);
      return;
    }

    (async () => {
      const { data: jobData } = await (supabase.from("cab_jobs") as any)
        .select("id, job_ref, job_title, customer_id, company_id, sign_off_token, sign_off_completed_at, contract_value, contract_currency")
        .eq("job_ref", jobRef)
        .eq("sign_off_token", token)
        .single();

      if (!jobData) {
        setError("This sign-off link is invalid or has expired.");
        setLoading(false);
        return;
      }

      if (jobData.sign_off_completed_at) {
        setDone(true);
        setJob(jobData);
        setLoading(false);
        return;
      }

      setJob(jobData);

      const { data: custData } = await (supabase.from("cab_customers") as any)
        .select("first_name, last_name, email")
        .eq("id", jobData.customer_id)
        .single();
      setCustomer(custData);
      setLoading(false);
    })();
  }, [jobRef, token]);

  const handleSubmit = async () => {
    if (!signatureData) return;
    if (!job) return;
    setSubmitting(true);

    try {
      // Save signature and mark complete
      const { error: updateError } = await (supabase.from("cab_jobs") as any)
        .update({
          sign_off_signature_url: signatureData,
          sign_off_completed_at: new Date().toISOString(),
          current_stage_key: "complete",
          status: "closed",
          state: "closed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("sign_off_token", token);

      if (updateError) throw updateError;

      // Insert event
      await (supabase.from("cab_events") as any).insert({
        company_id: job.company_id,
        event_type: "job.signed_off",
        job_id: job.id,
        payload_json: {
          signed_by: customer?.first_name + " " + customer?.last_name,
          signed_at: new Date().toISOString(),
        },
        status: "pending",
      });

      // Send final invoice email
      const finalAmount = job.contract_value ? (job.contract_value * 0.10).toFixed(2) : "TBC";
      const customerName = customer ? `${customer.first_name} ${customer.last_name}` : "Customer";

      if (customer?.email) {
        await supabase.functions.invoke("send-email", {
          body: {
            to: customer.email,
            subject: `Final Invoice — Enclave Cabinetry — ${job.job_ref}`,
            replyTo: "danny@enclavecabinetry.com",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1a1a1a;">Final Invoice</h2>
                <p>Hi ${customer.first_name},</p>
                <p>Thank you for signing off your installation. It has been a pleasure working with you.</p>
                <p>Please find your final payment details below.</p>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 4px 0;"><strong>Job Reference:</strong> ${job.job_ref}</p>
                  <p style="margin: 4px 0;"><strong>Final Payment Due:</strong> 10% of contract value = £${finalAmount}</p>
                </div>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 4px 0; font-weight: bold;">Payment Details:</p>
                  <p style="margin: 4px 0;">Account Name: Enclave Cabinetry</p>
                  <p style="margin: 4px 0;">Bank: Monzo</p>
                  <p style="margin: 4px 0;">Sort Code: 04-00-03</p>
                  <p style="margin: 4px 0;">Account Number: 75471656</p>
                  <p style="margin: 4px 0;">Reference: ${job.job_ref}-FINAL</p>
                </div>
                <p>If you have any questions please reply to this email or call us on 07944608098.</p>
                <p>Kind regards,<br/>Enclave Cabinetry<br/><span style="font-size: 12px; color: #888;">Company Reg: 16671033</span></p>
              </div>
            `,
          },
        });
      }

      // Notify danny
      await supabase.functions.invoke("send-email", {
        body: {
          to: "danny@enclavecabinetry.com",
          subject: `Job Signed Off — ${job.job_ref} — ${customerName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1a1a1a;">Job Signed Off</h2>
              <p>${customerName} has signed off ${job.job_ref}.</p>
              <p>Final invoice has been sent.</p>
              <p><a href="https://enclaveworkflowandhr.lovable.app/admin/leads" style="color: #2563eb;">Log in to view</a></p>
            </div>
          `,
        },
      });

      setDone(true);
    } catch (err: any) {
      console.error("Sign-off error:", err);
      alert(err.message || "Failed to submit sign-off");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <ClipboardCheck size={48} className="mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground">Sign-Off Unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">Call us on <a href="tel:07944608098" className="text-primary underline">07944 608098</a></p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
          <h1 className="text-xl font-bold text-foreground">Thank You!</h1>
          <p className="text-sm text-muted-foreground">
            Your sign-off has been recorded and your final invoice has been sent to {customer?.email || "your email"}.
            It has been a pleasure working with you.
          </p>
          <p className="text-xs text-muted-foreground mt-4">Enclave Cabinetry · 07944 608098</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <ClipboardCheck size={36} className="mx-auto text-primary" />
          <h1 className="text-xl font-bold text-foreground">Installation Sign-Off</h1>
          <p className="text-sm text-muted-foreground">Enclave Cabinetry</p>
        </div>

        {/* Job details */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Job:</span>{" "}
            <span className="font-mono font-bold text-foreground">{job.job_ref}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Project:</span>{" "}
            <span className="text-foreground">{job.job_title}</span>
          </div>
          {customer && (
            <div className="text-sm">
              <span className="text-muted-foreground">Customer:</span>{" "}
              <span className="text-foreground">{customer.first_name} {customer.last_name}</span>
            </div>
          )}
        </div>

        {/* Sign-off text */}
        <p className="text-sm text-foreground leading-relaxed">
          By signing below you confirm the installation has been completed to your satisfaction.
        </p>

        {/* Signature pad */}
        <div className="rounded-lg border border-border bg-card p-4">
          <SignaturePad onSignature={setSignatureData} />
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !signatureData}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {submitting ? "Submitting…" : "Submit Sign-Off"}
        </button>

        <p className="text-xs text-center text-muted-foreground">
          Questions? Call <a href="tel:07944608098" className="text-primary underline">07944 608098</a>
        </p>
      </div>
    </div>
  );
}
