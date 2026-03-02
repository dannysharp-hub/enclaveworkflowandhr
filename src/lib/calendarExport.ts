import { supabase } from "@/integrations/supabase/client";
import { exportToCsv } from "@/lib/csvExport";
import { toast } from "@/hooks/use-toast";

export async function exportCalendarEvents() {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .order("start_datetime", { ascending: false });

  if (error) {
    toast({ title: "Export failed", description: error.message, variant: "destructive" });
    return;
  }

  const headers = [
    "ID", "Title", "Event Type", "Start", "End", "Notes",
    "Job ID", "Assigned Staff IDs", "Created At",
  ];
  const rows = (data || []).map(e => [
    e.id, e.title, e.event_type, e.start_datetime, e.end_datetime,
    e.notes, e.job_id, (e.assigned_staff_ids || []).join(";"), e.created_at,
  ]);
  exportToCsv("CalendarEvents", headers, rows);
  toast({ title: "Exported", description: `${rows.length} events` });
}

export async function exportCalendarSyncLinks() {
  const { data, error } = await supabase
    .from("calendar_sync_links")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    toast({ title: "Export failed", description: error.message, variant: "destructive" });
    return;
  }

  const headers = [
    "ID", "App Event ID", "Google Calendar ID", "Google Event ID",
    "Sync Status", "Last Synced At", "Error Message", "Direction", "Created At",
  ];
  const rows = (data || []).map(l => [
    l.id, l.app_event_id, l.google_calendar_id, l.google_event_id,
    l.sync_status, l.last_synced_at, l.error_message, l.direction_last_sync, l.created_at,
  ]);
  exportToCsv("CalendarSyncLinks", headers, rows);
  toast({ title: "Exported", description: `${rows.length} sync links` });
}

export async function exportCalendarSyncQueue() {
  const { data, error } = await supabase
    .from("calendar_sync_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    toast({ title: "Export failed", description: error.message, variant: "destructive" });
    return;
  }

  const headers = [
    "ID", "App Event ID", "Action", "Priority", "Status",
    "Attempts", "Max Attempts", "Last Error", "Run After", "Created At",
  ];
  const rows = (data || []).map(q => [
    q.id, q.app_event_id, q.action, q.priority, q.status,
    q.attempts, q.max_attempts, q.last_error, q.run_after, q.created_at,
  ]);
  exportToCsv("CalendarSyncQueue", headers, rows);
  toast({ title: "Exported", description: `${rows.length} queue items` });
}

export async function exportCalendarSyncAudit() {
  const { data, error } = await supabase
    .from("calendar_sync_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    toast({ title: "Export failed", description: error.message, variant: "destructive" });
    return;
  }

  const headers = [
    "ID", "Action", "App Event ID", "Google Event ID",
    "Actor Staff ID", "Created At",
  ];
  const rows = (data || []).map(a => [
    a.id, a.action, a.app_event_id, a.google_event_id,
    a.actor_staff_id, a.created_at,
  ]);
  exportToCsv("CalendarSyncAudit", headers, rows);
  toast({ title: "Exported", description: `${rows.length} audit entries` });
}
