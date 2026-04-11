import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon, Loader2, CheckCircle2 } from "lucide-react";

export default function RequestInstallDatesPage() {
  const [params] = useSearchParams();
  const jobRef = params.get("job_ref");
  const token = params.get("token");

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [date1, setDate1] = useState<Date | undefined>();
  const [date2, setDate2] = useState<Date | undefined>();
  const [date3, setDate3] = useState<Date | undefined>();

  useEffect(() => {
    if (!jobRef || !token) {
      setError("Invalid link. Please contact Enclave Cabinetry.");
      setLoading(false);
      return;
    }

    (async () => {
      const { data: jobData } = await (supabase.from("cab_jobs") as any)
        .select("id, job_ref, job_title, customer_id, company_id, install_date_token, install_date_option_1, install_date")
        .eq("job_ref", jobRef)
        .eq("install_date_token", token)
        .single();

      if (!jobData) {
        setError("This link is invalid or has expired.");
        setLoading(false);
        return;
      }

      if (jobData.install_date) {
        setDone(true);
        setJob(jobData);
        setLoading(false);
        return;
      }

      if (jobData.install_date_option_1) {
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
    if (!date1 || !date2 || !date3) return;
    setSubmitting(true);

    try {
      const toDateStr = (d: Date) => format(d, "yyyy-MM-dd");

      // Save the 3 dates
      const { error: updateErr } = await (supabase.from("cab_jobs") as any)
        .update({
          install_date_option_1: toDateStr(date1),
          install_date_option_2: toDateStr(date2),
          install_date_option_3: toDateStr(date3),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("install_date_token", token);

      if (updateErr) throw updateErr;

      // Send notification email to Danny via send-email edge function
      const baseUrl = window.location.origin;
      const confirmBase = `${baseUrl}/confirm-install-date?token=${encodeURIComponent(token!)}`;

      const formatDateNice = (d: Date) =>
        d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

      const html = buildNotificationHtml(
        customer?.first_name || "",
        customer?.last_name || "",
        job.job_ref,
        job.job_title,
        [
          { label: "First Choice", date: formatDateNice(date1), url: `${confirmBase}&date=1` },
          { label: "Second Choice", date: formatDateNice(date2), url: `${confirmBase}&date=2` },
          { label: "Third Choice", date: formatDateNice(date3), url: `${confirmBase}&date=3` },
        ],
      );

      await supabase.functions.invoke("send-email", {
        body: {
          to: "danny@enclavecabinetry.com",
          subject: `📅 Install Dates Submitted – ${job.job_ref}`,
          html,
        },
      });

      setDone(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center space-y-4">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="text-sm text-gray-500">Please contact Enclave Cabinetry on 07944 608098.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900">Thank You!</h1>
          <p className="text-gray-600">
            {job?.install_date
              ? `Your install is confirmed for ${new Date(job.install_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`
              : "Your preferred install dates have been submitted. We'll confirm your date shortly."}
          </p>
          <p className="text-sm text-gray-500">Any questions? Call us on 07944 608098.</p>
        </div>
      </div>
    );
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-6 pt-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <img src="https://taftcuryslgdkstzqrcy.supabase.co/storage/v1/object/public/assets/ec-logo.png" alt="Enclave Cabinetry" className="h-16 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900">Choose Your Install Dates</h1>
          <p className="text-gray-600">
            Hi {customer?.first_name}, please select 3 preferred dates for your installation.
          </p>
        </div>

        {/* Job info */}
        <div className="bg-white rounded-lg border p-4 space-y-1">
          <p className="text-sm text-gray-500">Job Reference</p>
          <p className="font-mono font-bold">{job.job_ref}</p>
          <p className="text-sm text-gray-700">{job.job_title}</p>
        </div>

        {/* Date pickers */}
        <div className="space-y-4">
          {[
            { label: "First Choice", value: date1, onChange: setDate1 },
            { label: "Second Choice", value: date2, onChange: setDate2 },
            { label: "Third Choice", value: date3, onChange: setDate3 },
          ].map(({ label, value, onChange }) => (
            <div key={label} className="bg-white rounded-lg border p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !value && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {value ? format(value, "EEEE, d MMMM yyyy") : "Select a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={value}
                    onSelect={onChange}
                    disabled={(date) => date < tomorrow || date.getDay() === 0}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          ))}
        </div>

        {/* Submit */}
        <Button
          className="w-full h-12 text-base"
          disabled={!date1 || !date2 || !date3 || submitting}
          onClick={handleSubmit}
        >
          {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Submit Preferred Dates"}
        </Button>

        <p className="text-xs text-center text-gray-400">
          Questions? Call 07944 608098
        </p>
      </div>
    </div>
  );
}

function buildNotificationHtml(
  firstName: string,
  lastName: string,
  jobRef: string,
  jobTitle: string,
  options: { label: string; date: string; url: string }[],
): string {
  const rows = options
    .map(
      (o) => `
    <tr>
      <td style="padding:12px;border-bottom:1px solid #eee;">
        <strong>${o.label}</strong><br/>
        <span style="font-size:16px;">${o.date}</span>
      </td>
      <td style="padding:12px;border-bottom:1px solid #eee;text-align:right;">
        <a href="${o.url}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">
          Confirm This Date
        </a>
      </td>
    </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
    <img src="https://taftcuryslgdkstzqrcy.supabase.co/storage/v1/object/public/assets/ec-logo.png" alt="Enclave Cabinetry" width="120" height="120" style="display:block;margin:0 auto;" />
  </td></tr>
  <tr><td style="padding:32px;">
    <h1 style="color:#1a1a2e;font-size:20px;margin:0 0 16px;">📅 Install Dates Submitted</h1>
    <p style="color:#333;font-size:15px;line-height:1.6;">
      <strong>${firstName} ${lastName}</strong> has submitted their preferred install dates for <strong>${jobRef}</strong> – ${jobTitle}.
    </p>
    <p style="color:#333;font-size:15px;line-height:1.6;">Click a button to confirm that date:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      ${rows}
    </table>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px;text-align:center;">
    <p style="color:#999;font-size:12px;margin:0;">Enclave Cabinetry</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
