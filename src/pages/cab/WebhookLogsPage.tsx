import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCabCompanyId } from "@/lib/cabHelpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface WebhookLog {
  id: string;
  created_at: string;
  source: string;
  event_type: string | null;
  status: string;
  job_ref: string | null;
  contact_id: string | null;
  email: string | null;
  phone: string | null;
  payload_json: any;
}

export default function WebhookLogsPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WebhookLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from("cab_webhook_logs") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusColor = (s: string) => {
    if (s === "matched") return "default";
    if (s === "error") return "destructive";
    return "secondary";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-mono text-foreground">Webhook Logs</h1>
          <p className="text-sm text-muted-foreground">Every inbound webhook hit is logged here for debugging.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-2 font-mono text-xs text-muted-foreground">Time</th>
              <th className="p-2 font-mono text-xs text-muted-foreground">Event</th>
              <th className="p-2 font-mono text-xs text-muted-foreground">Job Ref</th>
              <th className="p-2 font-mono text-xs text-muted-foreground">Email</th>
              <th className="p-2 font-mono text-xs text-muted-foreground">Phone</th>
              <th className="p-2 font-mono text-xs text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-xs">No webhook logs yet.</td></tr>
            )}
            {logs.map((log) => (
              <tr
                key={log.id}
                className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                onClick={() => setSelected(log)}
              >
                <td className="p-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(log.created_at), "MMM d HH:mm:ss")}
                </td>
                <td className="p-2 font-mono text-xs">{log.event_type || "—"}</td>
                <td className="p-2 font-mono text-xs text-primary">{log.job_ref || "—"}</td>
                <td className="p-2 text-xs truncate max-w-32">{log.email || "—"}</td>
                <td className="p-2 text-xs">{log.phone || "—"}</td>
                <td className="p-2">
                  <Badge variant={statusColor(log.status)} className="text-[9px]">{log.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              Webhook Payload — {selected?.event_type} — {selected?.created_at ? format(new Date(selected.created_at), "PPpp") : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 text-xs mb-4">
            <div><span className="text-muted-foreground">Source:</span> {selected?.source}</div>
            <div><span className="text-muted-foreground">Status:</span> {selected?.status}</div>
            <div><span className="text-muted-foreground">Job Ref:</span> {selected?.job_ref || "—"}</div>
            <div><span className="text-muted-foreground">Contact ID:</span> {selected?.contact_id || "—"}</div>
            <div><span className="text-muted-foreground">Email:</span> {selected?.email || "—"}</div>
            <div><span className="text-muted-foreground">Phone:</span> {selected?.phone || "—"}</div>
          </div>
          <pre className="text-[10px] font-mono bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
            {selected?.payload_json ? JSON.stringify(selected.payload_json, null, 2) : "No payload"}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
