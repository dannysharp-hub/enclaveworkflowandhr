import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SignaturePad from "@/components/SignaturePad";
import { Loader2, CheckCircle2 } from "lucide-react";

const LOGO_URL = "https://taftcuryslgdkstzqrcy.supabase.co/storage/v1/object/public/assets/ec-logo.png";

export default function PublicSignOffPage() {
  console.log("[PublicSignOffPage] Component mounted — this page is PUBLIC, no auth required");
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
        .select("id, job_ref, job_title, customer_id, company_id, sign_off_token, sign_off_completed_at, contract_value, contract_currency, room_type, property_address_json, fitter_checklist_json, fitter_signed_by, fitter_signed_at, deposit_amount, deposit_paid_at, progress_payment_amount, progress_payment_paid_at")
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
      }

      setJob(jobData);

      const { data: custData } = await (supabase.from("cab_customers") as any)
        .select("first_name, last_name, email, address_line_1, address_line_2, city, postcode")
        .eq("id", jobData.customer_id)
        .single();
      setCustomer(custData);
      setLoading(false);
    })();
  }, [jobRef, token]);

  const handleSubmit = async () => {
    if (!signatureData || !job) return;
    setSubmitting(true);

    try {
      const customerName = customer ? `${customer.first_name} ${customer.last_name}` : "Customer";
      const now = new Date().toISOString();

      // Save customer signature and mark complete
      const { error: updateError } = await (supabase.from("cab_jobs") as any)
        .update({
          sign_off_signature_url: signatureData,
          sign_off_completed_at: now,
          customer_signoff_at: now,
          current_stage_key: "practical_completed",
          state: "awaiting_final_payment",
          updated_at: now,
        })
        .eq("id", job.id)
        .eq("sign_off_token", token);

      if (updateError) throw updateError;

      // Insert event
      await (supabase.from("cab_events") as any).insert({
        company_id: job.company_id,
        event_type: "customer.signoff.completed",
        job_id: job.id,
        payload_json: {
          signed_by: customerName,
          signed_at: now,
        },
        status: "pending",
      });

      // Generate completion certificate via edge function
      try {
        await supabase.functions.invoke("generate-completion-certificate", {
          body: { job_id: job.id },
        });
      } catch (certErr) {
        console.warn("Certificate generation failed (non-blocking):", certErr);
      }

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8f7f4" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "#C9A96E" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f8f7f4" }}>
        <div className="max-w-md text-center space-y-4">
          <img src={LOGO_URL} alt="Enclave Cabinetry" className="h-12 mx-auto" />
          <h1 className="text-xl font-bold" style={{ color: "#1B2A4A" }}>Sign-Off Unavailable</h1>
          <p className="text-sm" style={{ color: "#666" }}>{error}</p>
          <p className="text-sm" style={{ color: "#666" }}>Call us on <a href="tel:07944608098" style={{ color: "#C9A96E" }} className="underline">07944 608098</a></p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f8f7f4" }}>
        <div className="max-w-md text-center space-y-4">
          <img src={LOGO_URL} alt="Enclave Cabinetry" className="h-12 mx-auto" />
          <CheckCircle2 size={56} className="mx-auto" style={{ color: "#C9A96E" }} />
          <h1 className="text-xl font-bold" style={{ color: "#1B2A4A" }}>Thank You!</h1>
          <p className="text-sm" style={{ color: "#666" }}>
            Your sign-off has been recorded. A completion certificate will be sent to {customer?.email || "your email"} shortly.
          </p>
          <p className="text-sm" style={{ color: "#666" }}>
            It has been a pleasure working with you.
          </p>
          <p className="text-xs mt-4" style={{ color: "#999" }}>Enclave Cabinetry · 07944 608098</p>
        </div>
      </div>
    );
  }

  // Build address string
  const address = job.property_address_json
    ? [job.property_address_json.line1, job.property_address_json.line2, job.property_address_json.city, job.property_address_json.postcode].filter(Boolean).join(", ")
    : customer ? [customer.address_line_1, customer.address_line_2, customer.city, customer.postcode].filter(Boolean).join(", ") : "";

  // Payment summary
  const contractValue = job.contract_value || 0;
  const depositPct = 50;
  const progressPct = 40;
  const finalPct = 10;
  const depositAmt = (contractValue * depositPct / 100);
  const progressAmt = (contractValue * progressPct / 100);
  const finalAmt = (contractValue * finalPct / 100);
  const fmtGBP = (v: number) => `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fitterChecklist = job.fitter_checklist_json || {};

  return (
    <div className="min-h-screen" style={{ background: "#f8f7f4" }}>
      {/* Header */}
      <div style={{ background: "#1B2A4A" }} className="py-6 px-4 text-center">
        <img src={LOGO_URL} alt="Enclave Cabinetry" className="h-12 mx-auto" />
      </div>

      <div className="max-w-lg mx-auto p-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold" style={{ color: "#1B2A4A" }}>Installation Sign-Off</h1>
          <p className="text-sm" style={{ color: "#666" }}>Please review and sign below to confirm completion</p>
        </div>

        {/* Job details */}
        <div className="rounded-lg p-4 space-y-2" style={{ background: "#fff", border: "1px solid #e5e2dc" }}>
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "#C9A96E" }}>Project Details</h3>
          {customer && (
            <div className="text-sm"><span style={{ color: "#999" }}>Customer:</span> <span style={{ color: "#1B2A4A" }} className="font-medium">{customer.first_name} {customer.last_name}</span></div>
          )}
          <div className="text-sm"><span style={{ color: "#999" }}>Job Ref:</span> <span className="font-mono font-bold" style={{ color: "#1B2A4A" }}>{job.job_ref}</span></div>
          <div className="text-sm"><span style={{ color: "#999" }}>Project:</span> <span style={{ color: "#1B2A4A" }}>{job.job_title}</span></div>
          {job.room_type && <div className="text-sm"><span style={{ color: "#999" }}>Room:</span> <span style={{ color: "#1B2A4A" }}>{job.room_type}</span></div>}
          {address && <div className="text-sm"><span style={{ color: "#999" }}>Address:</span> <span style={{ color: "#1B2A4A" }}>{address}</span></div>}
        </div>

        {/* Payment summary */}
        {contractValue > 0 && (
          <div className="rounded-lg p-4 space-y-2" style={{ background: "#fff", border: "1px solid #e5e2dc" }}>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "#C9A96E" }}>Payment Summary</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span style={{ color: "#666" }}>50% Deposit</span>
                <span className="flex items-center gap-2">
                  <span style={{ color: "#1B2A4A" }} className="font-medium">{fmtGBP(depositAmt)}</span>
                  {job.deposit_paid_at ? <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#dcfce7", color: "#16a34a" }}>Paid</span> : <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#fef3c7", color: "#d97706" }}>Due</span>}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "#666" }}>40% Progress</span>
                <span className="flex items-center gap-2">
                  <span style={{ color: "#1B2A4A" }} className="font-medium">{fmtGBP(progressAmt)}</span>
                  {job.progress_payment_paid_at ? <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#dcfce7", color: "#16a34a" }}>Paid</span> : <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#fef3c7", color: "#d97706" }}>Due</span>}
                </span>
              </div>
              <div className="border-t pt-1.5" style={{ borderColor: "#e5e2dc" }}>
                <div className="flex justify-between text-sm font-bold">
                  <span style={{ color: "#1B2A4A" }}>10% Final Balance</span>
                  <span style={{ color: "#C9A96E" }}>{fmtGBP(finalAmt)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fitter / Installer notes */}
        {fitterChecklist.snagging && (
          <div className="rounded-lg p-4 space-y-2" style={{ background: "#fff", border: "1px solid #e5e2dc" }}>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "#C9A96E" }}>Installer Notes</h3>
            <p className="text-sm" style={{ color: "#333" }}>{fitterChecklist.snagging}</p>
          </div>
        )}

        {/* Sign-off text */}
        <p className="text-sm leading-relaxed" style={{ color: "#333" }}>
          By signing below you confirm that the installation has been completed to your satisfaction.
        </p>

        {/* Signature pad */}
        <div className="rounded-lg p-4" style={{ background: "#fff", border: "1px solid #e5e2dc" }}>
          <SignaturePad onSignature={setSignatureData} />
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !signatureData}
          style={{
            background: signatureData && !submitting ? "#C9A96E" : "#ccc",
            color: signatureData && !submitting ? "#1B2A4A" : "#999",
          }}
          className="w-full flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-bold transition-opacity disabled:opacity-60"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {submitting ? "Submitting…" : "Sign & Complete"}
        </button>

        <p className="text-xs text-center" style={{ color: "#999" }}>
          Questions? Call <a href="tel:07944608098" style={{ color: "#C9A96E" }} className="underline">07944 608098</a>
        </p>
      </div>

      {/* Footer */}
      <div style={{ background: "#1B2A4A" }} className="py-4 px-4 text-center mt-8">
        <p style={{ color: "#C9A96E" }} className="text-xs">Enclave Cabinetry · 07944 608098 · info@enclavecabinetry.com</p>
      </div>
    </div>
  );
}
