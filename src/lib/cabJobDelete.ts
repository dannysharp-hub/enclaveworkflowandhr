import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes a cab_job and all associated records in the correct order.
 */
export async function deleteCabJob(jobId: string): Promise<void> {
  // 1. Delete sync logs
  await (supabase.from("cab_ghl_sync_log") as any).delete().eq("job_id", jobId);

  // 2. Delete events
  await supabase.from("cab_events").delete().eq("job_id", jobId);

  // 3. Delete quote items then quotes
  const { data: jobQuotes } = await supabase.from("cab_quotes").select("id").eq("job_id", jobId);
  if (jobQuotes?.length) {
    const qIds = jobQuotes.map((q: any) => q.id);
    await (supabase.from("cab_quote_items") as any).delete().in("quote_id", qIds);
  }
  await supabase.from("cab_quotes").delete().eq("job_id", jobId);

  // 4. Delete appointments
  await supabase.from("cab_appointments").delete().eq("job_id", jobId);

  // 5. Delete buylist items
  await supabase.from("cab_buylist_items").delete().eq("job_id", jobId);

  // 6. Delete job files (drive folder links, etc.)
  await (supabase.from("cab_job_files") as any).delete().eq("job_id", jobId);

  // 7. Delete the job itself
  const { error } = await supabase.from("cab_jobs").delete().eq("id", jobId);
  if (error) throw error;
}
