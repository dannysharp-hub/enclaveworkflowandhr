import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Fire-and-forget: generate/replace the Job Card PDF in the job's Drive folder.
 */
export function regenerateJobCard(cabJobId: string): void {
  supabase.functions.invoke("generate-job-card-pdf", {
    body: { job_id: cabJobId },
  }).catch(() => {}); // silent — Drive may not be configured
}

/**
 * Manual regeneration with toast feedback for admin use.
 */
export async function regenerateJobCardWithFeedback(cabJobId: string): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-job-card-pdf", {
      body: { job_id: cabJobId },
    });

    if (error) {
      toast({
        title: "Job Card generation failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    if (!data?.ok) {
      const msg = data?.error || "Unknown error";
      const stage = data?.stage ? ` (at ${data.stage})` : "";
      toast({
        title: "Job Card generation failed",
        description: `${msg}${stage}`,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Job Card PDF regenerated", description: `Updated in Drive for ${data.job_ref}` });
  } catch (err: any) {
    toast({
      title: "Job Card generation failed",
      description: err?.message || "Network error",
      variant: "destructive",
    });
  }
}
