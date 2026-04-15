import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import CsvExportButton from "@/components/CsvExportButton";
import { exportToCsv, filterByDateRange } from "@/lib/csvExport";

const ACTION_LABELS: Record<string, string> = {
  login: "Logged in",
  logout: "Logged out",
  page_visited: "Visited page",
  job_viewed: "Viewed job",
  job_created: "Created job",
  job_edited: "Edited job",
  job_deleted: "Deleted job",
  document_opened: "Opened document",
  stage_changed: "Changed stage",
  payment_marked: "Marked payment",
  drive_folder_opened: "Opened Drive folder",
  settings_accessed: "Accessed settings",
};

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const { data } = await (supabase.from("user_activity_log") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    setLogs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const uniqueUsers = [...new Map(logs.map(l => [l.user_id, l.user_name])).entries()];
  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const filtered = logs.filter(l => {
    if (filterUser !== "all" && l.user_id !== filterUser) return false;
    if (filterAction !== "all" && l.action !== filterAction) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${l.user_name} ${l.action} ${l.resource_name || ""} ${l.resource_type || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const describeAction = (log: any) => {
    const label = ACTION_LABELS[log.action] || log.action;
    const name = log.resource_name ? ` "${log.resource_name}"` : "";
    const type = log.resource_type && log.resource_type !== "page" ? ` (${log.resource_type})` : "";
    let extra = "";
    if (log.action === "stage_changed" && log.metadata_json) {
      extra = ` from ${log.metadata_json.from} → ${log.metadata_json.to}`;
    }
    if (log.action === "job_edited" && log.metadata_json?.field) {
      extra = ` [${log.metadata_json.field}]`;
    }
    return `${label}${name}${type}${extra}`;
  };

  const handleExport = (from: string | null, to: string | null) => {
    const data = filterByDateRange(filtered, "created_at" as any, from, to);
    exportToCsv("activity_log", ["Timestamp", "User", "Role", "Action", "Detail"], data.map(l => [
      format(new Date(l.created_at), "yyyy-MM-dd HH:mm:ss"),
      l.user_name,
      l.user_role,
      l.action,
      describeAction(l),
    ]));
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading activity log…</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Activity Log</h1>
          <p className="text-sm text-muted-foreground">Track all user actions across the platform</p>
        </div>
        <CsvExportButton onExport={handleExport} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-[200px]"
        />
        <Select value={filterUser} onValueChange={setFilterUser}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {uniqueUsers.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name || "Unknown"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {uniqueActions.map(a => (
              <SelectItem key={a} value={a}>{ACTION_LABELS[a] || a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No activity found</TableCell></TableRow>
            ) : filtered.map(log => (
              <TableRow key={log.id}>
                <TableCell className="text-xs whitespace-nowrap">{format(new Date(log.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                <TableCell className="text-sm font-medium">{log.user_name}</TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{log.user_role}</Badge></TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{ACTION_LABELS[log.action] || log.action}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{describeAction(log)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">Showing {filtered.length} of {logs.length} entries (max 1,000)</p>
    </div>
  );
}
