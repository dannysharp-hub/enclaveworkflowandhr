import { supabase } from "@/integrations/supabase/client";

export type DocumentType =
  | "quote"
  | "sign_off"
  | "invoice_deposit"
  | "invoice_progress"
  | "invoice_final"
  | "fitter_form";

/**
 * Fire-and-forget: copies a Drive template into the job folder
 * and populates placeholders with real data.
 * Logs errors to console but never throws.
 */
export function fireDocumentGeneration(jobId: string, documentType: DocumentType): void {
  supabase.functions
    .invoke("generate-document-from-template", {
      body: { job_id: jobId, document_type: documentType },
    })
    .then(({ data, error }) => {
      if (error) {
        console.warn(`[DocGen] ${documentType} failed:`, error.message);
      } else if (!data?.ok) {
        console.warn(`[DocGen] ${documentType}:`, data?.error || "unknown error");
      } else {
        console.log(`[DocGen] ${documentType} created:`, data.file_name);
      }
    })
    .catch((err) => {
      console.warn(`[DocGen] ${documentType} exception:`, err);
    });
}
