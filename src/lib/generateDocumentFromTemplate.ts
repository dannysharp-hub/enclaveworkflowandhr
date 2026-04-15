import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type DocumentType =
  | "quote"
  | "sign_off"
  | "invoice_deposit"
  | "invoice_progress"
  | "invoice_final"
  | "fitter_form";

const DOC_LABELS: Record<DocumentType, string> = {
  quote: "Quote",
  sign_off: "Design Sign-Off",
  invoice_deposit: "Deposit Invoice",
  invoice_progress: "Progress Invoice",
  invoice_final: "Final Invoice",
  fitter_form: "Fitter Form",
};

/**
 * Generate a document from a Drive template.
 * Shows toast on success or failure.
 */
export function fireDocumentGeneration(jobId: string, documentType: DocumentType): void {
  const label = DOC_LABELS[documentType] || documentType;

  supabase.functions
    .invoke("generate-document-from-template", {
      body: { job_id: jobId, document_type: documentType },
    })
    .then(({ data, error }) => {
      if (error) {
        console.error(`[DocGen] ${documentType} failed:`, error.message);
        toast({
          title: `${label} generation failed`,
          description: error.message,
          variant: "destructive",
        });
      } else if (!data?.ok) {
        const msg = data?.error || "Unknown error";
        const stage = data?.stage ? ` (at ${data.stage})` : "";
        // "skipped" means no Drive folder — not a real error
        if (data?.skipped) {
          console.log(`[DocGen] ${documentType} skipped: ${msg}`);
          return;
        }
        console.error(`[DocGen] ${documentType}: ${msg}${stage}`);
        toast({
          title: `${label} generation failed`,
          description: `${msg}${stage}`,
          variant: "destructive",
        });
      } else {
        console.log(`[DocGen] ${documentType} created:`, data.file_name);
        toast({ title: `${label} created in Drive`, description: data.file_name });
      }
    })
    .catch((err) => {
      console.error(`[DocGen] ${documentType} exception:`, err);
      toast({
        title: `${label} generation failed`,
        description: err?.message || "Network error",
        variant: "destructive",
      });
    });
}
