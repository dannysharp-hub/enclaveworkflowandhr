import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes a cab_job and all associated records in dependency order.
 * Every FK referencing cab_jobs must be cleaned up before the job row.
 */
export async function deleteCabJob(jobId: string): Promise<void> {
  const del = async (table: string, column = "job_id") => {
    const { error } = await (supabase.from(table) as any).delete().eq(column, jobId);
    if (error) {
      console.error(`[cabJobDelete] Failed to delete from ${table}:`, error.message);
      throw new Error(`Failed to delete ${table}: ${error.message}`);
    }
  };

  // --- Leaf tables first (no other FK points at them) ---

  // 1. Appointments
  await del("cab_appointments");

  // 2. Events (referenced by cab_ghl_sync_log.event_id)
  await del("cab_ghl_sync_log");
  await del("cab_events");

  // 3. Job files
  await del("cab_job_files");

  // 4. Purchase order items → purchase orders (PO items FK to POs)
  const { data: pos } = await (supabase.from("cab_purchase_orders") as any)
    .select("id").eq("job_id", jobId);
  if (pos?.length) {
    const poIds = pos.map((p: any) => p.id);
    await (supabase.from("cab_purchase_order_items") as any).delete().in("po_id", poIds);
  }
  await del("cab_purchase_orders");

  // 5. Buylist items (referenced by cab_purchase_order_items.buylist_item_id — already gone)
  await del("cab_buylist_items");

  // 6. RFQs
  await del("cab_rfqs");

  // 7. Quote acceptances & views → quote items → quotes
  await del("cab_quote_acceptances");
  await del("cab_quote_views");
  const { data: quotes } = await (supabase.from("cab_quotes") as any)
    .select("id").eq("job_id", jobId);
  if (quotes?.length) {
    const qIds = quotes.map((q: any) => q.id);
    await (supabase.from("cab_quote_items") as any).delete().in("quote_id", qIds);
  }
  await del("cab_quotes");

  // 8. Payments (FK to cab_invoices) → invoices
  await del("cab_payments");
  await del("cab_invoices");

  // 9. Job cost lines & alerts
  await del("cab_job_cost_lines");
  await del("cab_job_alerts");

  // 10. Finally delete the job itself
  await del("cab_jobs", "id");
}
