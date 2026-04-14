import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget: generate/replace the Job Card PDF in the job's Drive folder.
 */
export function regenerateJobCard(cabJobId: string): void {
  supabase.functions.invoke("generate-job-card-pdf", {
    body: { job_id: cabJobId },
  }).catch(() => {}); // silent — Drive may not be configured
}
