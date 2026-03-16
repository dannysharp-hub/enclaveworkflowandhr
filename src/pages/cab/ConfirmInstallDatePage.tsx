import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function ConfirmInstallDatePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const dateChoice = params.get("date");

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{ success: boolean; formatted?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!token || !dateChoice) {
      setResult({ success: false, error: "Invalid confirmation link." });
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("install-date-confirm", {
          body: { token, date_choice: dateChoice },
        });

        if (error) {
          setResult({ success: false, error: "Failed to confirm date. Please try again." });
        } else if (data?.error) {
          if (data.install_date) {
            // Already confirmed
            const d = new Date(data.install_date + "T00:00:00").toLocaleDateString("en-GB", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            });
            setResult({ success: true, formatted: d });
          } else {
            setResult({ success: false, error: data.error });
          }
        } else {
          setResult({ success: true, formatted: data.formatted });
        }
      } catch (err: any) {
        setResult({ success: false, error: err.message || "Something went wrong." });
      } finally {
        setLoading(false);
      }
    })();
  }, [token, dateChoice]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-gray-400 mx-auto" />
          <p className="text-gray-500">Confirming install date...</p>
        </div>
      </div>
    );
  }

  if (result?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900">Install Date Confirmed!</h1>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-lg font-bold text-green-800">{result.formatted}</p>
            <p className="text-sm text-green-700 mt-1">Team arrives at 8:00 AM</p>
          </div>
          <p className="text-gray-600">The customer has been notified.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md text-center space-y-4">
        <XCircle className="h-16 w-16 text-red-400 mx-auto" />
        <h1 className="text-xl font-bold text-gray-900">Unable to Confirm</h1>
        <p className="text-red-600">{result?.error}</p>
        <p className="text-sm text-gray-500">Contact danny@enclavecabinetry.com for help.</p>
      </div>
    </div>
  );
}
