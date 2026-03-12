import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { buildInvoiceEmailHtml } from "@/lib/invoiceEmailTemplate";

export default function AcceptQuotePage() {
  console.log("[AcceptQuotePage] Component mounted — this page is PUBLIC, no auth required");
  const [params] = useSearchParams();
  const jobRef = params.get("job_ref");
  const token = params.get("token");
  console.log("[AcceptQuotePage] jobRef:", jobRef, "token:", token);

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteData, setQuoteData] = useState<any>(null);
  const [jobData, setJobData] = useState<any>(null);
  const [customerData, setCustomerData] = useState<any>(null);

  useEffect(() => {
    if (!jobRef || !token) {
      setError("Invalid link — missing job reference or token.");
      setLoading(false);
      return;
    }
    validateToken();
  }, [jobRef, token]);

  const validateToken = async () => {
    try {
      // Find the quote by acceptance_token
      const { data: quotes, error: qErr } = await (supabase.from("cab_quotes") as any)
        .select("*")
        .eq("acceptance_token", token)
        .limit(1);

      if (qErr) throw qErr;
      const quote = quotes?.[0];
      if (!quote) {
        setError("This link is invalid or has already been used.");
        setLoading(false);
        return;
      }

      if (quote.status === "accepted") {
        setAccepted(true);
      }

      setQuoteData(quote);

      // Get job
      const { data: jobs } = await (supabase.from("cab_jobs") as any)
        .select("*")
        .eq("id", quote.job_id)
        .limit(1);
      const job = jobs?.[0];
      setJobData(job);

      // Get customer
      if (job?.customer_id) {
        const { data: customers } = await (supabase.from("cab_customers") as any)
          .select("*")
          .eq("id", job.customer_id)
          .limit(1);
        setCustomerData(customers?.[0] || null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!quoteData || !jobData) return;
    setAccepting(true);
    try {
      const now = new Date().toISOString();

      // 1. Update quote status
      await (supabase.from("cab_quotes") as any)
        .update({ status: "accepted", accepted_at: now })
        .eq("id", quoteData.id);

      // 2. Update job stage
      await (supabase.from("cab_jobs") as any)
        .update({
          current_stage_key: "awaiting_deposit",
          state: "awaiting_deposit",
          status: "quoted",
          updated_at: now,
        })
        .eq("id", jobData.id);

      // 3. Insert cab_event
      await (supabase.from("cab_events") as any)
        .insert({
          company_id: jobData.company_id,
          event_type: "quote.accepted",
          job_id: jobData.id,
          customer_id: jobData.customer_id,
          payload_json: { job_ref: jobData.job_ref, quote_id: quoteData.id },
        });

      // 4. Send deposit invoice email
      if (customerData?.email) {
        const contractValue = jobData.contract_value || 0;
        const depositAmount = (contractValue * 0.50).toFixed(2);
        const customerFullName = customerData
          ? `${customerData.first_name} ${customerData.last_name}`.trim()
          : "Customer";

        const depositHtml = await buildInvoiceEmailHtml({
          invoiceNumber: `DEP-${jobData.job_ref}`,
          customerName: customerFullName,
          customerFirstName: customerData.first_name || "there",
          jobRef: jobData.job_ref,
          jobTitle: jobData.job_title || jobData.job_ref,
          milestone: "deposit",
          amount: Number(depositAmount).toLocaleString("en-GB", { minimumFractionDigits: 2 }),
          paymentReference: jobData.job_ref,
        });

        await supabase.functions.invoke("send-email", {
          body: {
            to: customerData.email,
            subject: `Deposit Invoice — Enclave Cabinetry — ${jobData.job_ref}`,
            html: depositHtml,
            replyTo: "danny@enclavecabinetry.com",
          },
        });
      }

      // 5. Notify Danny
      const customerName = customerData
        ? `${customerData.first_name} ${customerData.last_name}`
        : "Customer";

      await supabase.functions.invoke("send-email", {
        body: {
          to: "danny@enclavecabinetry.com",
          subject: `Quote Accepted — ${jobData.job_ref} — ${customerName}`,
          html: `<p>${customerName} has accepted their quote for ${jobData.job_ref}.</p>
<p>The job has moved to Awaiting Deposit stage.</p>
<p><a href="https://enclaveworkflowandhr.lovable.app/admin/leads">Log in to view</a></p>`,
          replyTo: "danny@enclavecabinetry.com",
        },
      });

      setAccepted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900">Quote Accepted</h1>
          <p className="text-gray-600">
            Your quote has been accepted.
            {customerData?.email && (
              <> Your deposit invoice has been sent to <strong>{customerData.email}</strong>.</>
            )}
          </p>
          <p className="text-sm text-gray-500">You can close this page.</p>
        </div>
      </div>
    );
  }

  const customerName = customerData
    ? `${customerData.first_name} ${customerData.last_name}`
    : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Thank you for choosing Enclave Cabinetry
        </h1>
        <div className="rounded-lg border border-gray-200 p-6 space-y-2 text-left">
          <p className="text-sm text-gray-500">Job</p>
          <p className="font-mono font-bold text-gray-900">
            {jobData?.job_ref} — {jobData?.job_title}
          </p>
          {customerName && (
            <>
              <p className="text-sm text-gray-500 mt-3">Customer</p>
              <p className="font-medium text-gray-900">{customerName}</p>
            </>
          )}
        </div>
        <Button
          size="lg"
          className="w-full"
          onClick={handleAccept}
          disabled={accepting}
        >
          {accepting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Accepting…
            </>
          ) : (
            "Accept Quote"
          )}
        </Button>
        <p className="text-xs text-gray-400">
          By clicking Accept Quote you confirm your agreement to proceed.
        </p>
      </div>
    </div>
  );
}
