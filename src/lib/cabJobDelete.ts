import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes a cab_job and all associated records in the correct order.
 */
export async function deleteCabJob(jobId: string): Promise<void> {
  const runDelete = async (query: PromiseLike<{ error: any }>, label: string) => {
    const { error } = await query;
    if (error) throw new Error(`Failed to delete ${label}: ${error.message}`);
  };

  // 1. Delete sync logs
  await runDelete((supabase.from("cab_ghl_sync_log") as any).delete().eq("job_id", jobId), "cab_ghl_sync_log");

  // 2. Delete events
  await runDelete((supabase.from("cab_events") as any).delete().eq("job_id", jobId), "cab_events");

  // 3. Delete quote items then quotes
  const { data: jobQuotes, error: quotesFetchError } = await (supabase.from("cab_quotes") as any)
    .select("id")
    .eq("job_id", jobId);
  if (quotesFetchError) throw new Error(`Failed to load cab_quotes: ${quotesFetchError.message}`);

  if (jobQuotes?.length) {
    const qIds = jobQuotes.map((q: any) => q.id);
    await runDelete((supabase.from("cab_quote_items") as any).delete().in("quote_id", qIds), "cab_quote_items");
  }
  await runDelete((supabase.from("cab_quotes") as any).delete().eq("job_id", jobId), "cab_quotes");

  // 4. Delete appointments by cab_jobs.id before deleting the job
  await runDelete((supabase.from("cab_appointments") as any).delete().eq("job_id", jobId), "cab_appointments");

  // 5. Delete buylist items
  await runDelete((supabase.from("cab_buylist_items") as any).delete().eq("job_id", jobId), "cab_buylist_items");

  // 6. Delete job files (drive folder links, etc.)
  await runDelete((supabase.from("cab_job_files") as any).delete().eq("job_id", jobId), "cab_job_files");

  // 7. Delete the job itself
  await runDelete((supabase.from("cab_jobs") as any).delete().eq("id", jobId), "cab_jobs");
}
