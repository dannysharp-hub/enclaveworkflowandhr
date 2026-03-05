import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCabCompanyId } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Zap, Send, RefreshCw, CalendarDays, Info } from "lucide-react";

const STAGE_KEYS = [
  "lead_captured",
  "ballpark_sent",
  "appointment_requested",
  "appointment_booked",
  "quote_sent",
  "quote_viewed",
  "deposit_due",
  "project_confirmed",
  "materials_ordered",
  "manufacturing_started",
  "cabinetry_assembled",
  "ready_for_installation",
  "install_booked",
  "installation_complete",
  "practical_completed",
  "closed_paid",
] as const;

export default function GhlSettingsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [pipelineId, setPipelineId] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [stageIds, setStageIds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ processed: number; errors: number } | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  // Site visit fields
  const [siteVisitCalendarId, setSiteVisitCalendarId] = useState("");
  const [siteVisitBookingUrl, setSiteVisitBookingUrl] = useState("");
  const [siteVisitRepName, setSiteVisitRepName] = useState("Alistair");

  const load = useCallback(async () => {
    const cid = await getCabCompanyId();
    if (!cid) return;
    setCompanyId(cid);

    const { data: company } = await (supabase.from("cab_companies") as any)
      .select("settings_json")
      .eq("id", cid)
      .single();

    const settings = company?.settings_json || {};
    setPipelineId(settings.ghl_pipeline_id || "");
    setCalendarId(settings.ghl_calendar_id || "");
    setStageIds(settings.ghl_stage_ids || {});
    setSiteVisitCalendarId(settings.site_visit_calendar_id || "");
    setSiteVisitBookingUrl(settings.site_visit_booking_url || "");
    setSiteVisitRepName(settings.site_visit_rep_name || "Alistair");

    const { data: jobData } = await (supabase.from("cab_jobs") as any)
      .select("id, job_ref, job_title")
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(20);
    setJobs(jobData || []);

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    setWebhookUrl(`https://${projectId}.supabase.co/functions/v1/ghl-webhook`);

    const { data: logs } = await (supabase.from("cab_ghl_sync_log") as any)
      .select("*")
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(10);
    setSyncLogs(logs || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { data: company } = await (supabase.from("cab_companies") as any)
        .select("settings_json")
        .eq("id", companyId)
        .single();

      const current = company?.settings_json || {};
      const updated = {
        ...current,
        ghl_pipeline_id: pipelineId,
        ghl_calendar_id: calendarId,
        ghl_stage_ids: stageIds,
        site_visit_calendar_id: siteVisitCalendarId,
        site_visit_booking_url: siteVisitBookingUrl,
        site_visit_rep_name: siteVisitRepName,
      };

      await (supabase.from("cab_companies") as any)
        .update({ settings_json: updated })
        .eq("id", companyId);

      toast({ title: "GHL settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("ghl-worker", {
        body: { company_id: companyId, limit: 0 },
      });

      if (res.error) throw new Error(res.error.message);
      setTestResult({ ok: true, message: "Connection successful — worker responded." });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleTestSync = async () => {
    if (!selectedJobId) {
      toast({ title: "Select a job first", variant: "destructive" });
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await supabase.functions.invoke("ghl-worker", {
        body: { company_id: companyId, job_id: selectedJobId, limit: 50 },
      });

      if (res.error) throw new Error(res.error.message);
      setSyncResult(res.data as { processed: number; errors: number });
      toast({ title: `Synced: ${res.data.processed} events processed, ${res.data.errors} errors` });
      load();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold font-mono text-foreground">GoHighLevel Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure pipeline mapping, stage IDs, site visit calendars, and test the sync worker.
        </p>
      </div>

      {/* Webhook URL */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h3 className="font-mono text-sm font-bold text-foreground">Webhook URL (for GHL)</h3>
        <p className="text-xs text-muted-foreground">
          Add this URL as a webhook in GHL → Settings → Webhooks for appointment events.
        </p>
        <code className="block text-xs bg-muted p-2 rounded font-mono break-all select-all">
          {webhookUrl}
        </code>
      </div>

      {/* Site Visit Calendar */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <CalendarDays size={14} className="text-primary" /> Site Visit Calendar
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rep Name</Label>
            <Input
              value={siteVisitRepName}
              onChange={(e) => setSiteVisitRepName(e.target.value)}
              placeholder="Alistair"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Site Visit Calendar ID</Label>
            <Input
              value={siteVisitCalendarId}
              onChange={(e) => setSiteVisitCalendarId(e.target.value)}
              placeholder="Paste GHL calendar ID"
              className="font-mono text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Booking URL (optional)</Label>
            <Input
              value={siteVisitBookingUrl}
              onChange={(e) => setSiteVisitBookingUrl(e.target.value)}
              placeholder="https://updates.physio-leads.com/widget/booking/<calendarId>"
              className="font-mono text-xs"
            />
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>
            Booking URL format: <code className="font-mono">https://updates.physio-leads.com/widget/booking/&lt;calendarId&gt;</code>.
            The GHL workflow triggered by <code className="font-mono">encl_appointment_requested</code> should send this link via SMS/email.
          </span>
        </div>
      </div>

      {/* GHL Workflow instructions */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="font-mono text-sm font-bold text-foreground">GHL Workflows to Create</h3>
        <div className="space-y-3 text-xs text-muted-foreground">
          <div className="border-l-2 border-primary/30 pl-3">
            <p className="font-bold text-foreground">1. Appointment Requested</p>
            <p>Trigger: Tag added = <code className="font-mono text-primary">encl_appointment_requested</code></p>
            <p>Action: Send SMS with booking link for the Site Visit calendar:</p>
            <p className="bg-muted p-2 rounded mt-1 font-mono text-[10px]">
              "Hi {"{{contact.first_name}}"}, thanks for requesting a design visit.{"\n"}
              Please choose a time that suits you here: {"{{calendar_link}}"}"
            </p>
          </div>
          <div className="border-l-2 border-primary/30 pl-3">
            <p className="font-bold text-foreground">2. Quote Follow-up</p>
            <p>Trigger: Tag added = <code className="font-mono text-primary">encl_quote_sent</code></p>
            <p>Actions: Day 1 SMS → Day 3 email → Day 7 call task</p>
          </div>
          <div className="border-l-2 border-primary/30 pl-3">
            <p className="font-bold text-foreground">3. Quote Viewed</p>
            <p>Trigger: Tag added = <code className="font-mono text-primary">encl_quote_viewed</code></p>
            <p>Action: Internal notification — "Quote viewed — follow up if needed"</p>
          </div>
          <div className="border-l-2 border-primary/30 pl-3">
            <p className="font-bold text-foreground">4. Appointment Booked Confirmation</p>
            <p>Trigger: Tag added = <code className="font-mono text-primary">encl_appointment_booked</code></p>
            <p>Action: Send SMS confirmation:</p>
            <p className="bg-muted p-2 rounded mt-1 font-mono text-[10px]">
              "Your site visit is booked for {"{{appointment_time}}"}. We'll see you then."
            </p>
            <p className="mt-1">Optional: Send email confirmation with appointment details.</p>
          </div>
        </div>
      </div>

      {/* Pipeline + Calendar */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="font-mono text-sm font-bold text-foreground">Pipeline Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Pipeline ID</Label>
            <Input
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              placeholder="Paste GHL pipeline ID"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Calendar ID (legacy/general)</Label>
            <Input
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              placeholder="Paste GHL calendar ID"
              className="font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {/* Stage ID mapping */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="font-mono text-sm font-bold text-foreground">Stage ID Mapping</h3>
        <p className="text-xs text-muted-foreground">
          Paste the GHL stage ID for each workflow stage from your pipeline.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STAGE_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <Label className="text-[10px] font-mono w-40 shrink-0">{key}</Label>
              <Input
                value={stageIds[key] || ""}
                onChange={(e) => setStageIds((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="stage ID"
                className="font-mono text-[10px] h-7"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Settings"}
        </Button>
        <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
          <Zap size={14} /> {testing ? "Testing…" : "Test Connection"}
        </Button>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${testResult.ok ? "border-green-500/30 bg-green-500/5 text-green-700" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
          {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {testResult.message}
        </div>
      )}

      {/* Test sync */}
      <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-4 space-y-3">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <Send size={14} className="text-amber-500" /> Test Sync
        </h3>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Select Job</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
            >
              <option value="">— select a job —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_ref} — {j.job_title}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleTestSync} disabled={syncing || !selectedJobId}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
        </div>
        {syncResult && (
          <div className="text-xs text-muted-foreground">
            Processed: <strong>{syncResult.processed}</strong> | Errors: <strong>{syncResult.errors}</strong>
          </div>
        )}
      </div>

      {/* Recent sync logs */}
      {syncLogs.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h3 className="font-mono text-sm font-bold text-foreground">Recent Sync Logs</h3>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {syncLogs.map((log) => (
              <div key={log.id} className="flex items-center gap-2 text-xs border-l-2 border-primary/30 pl-3 py-1">
                <Badge variant={log.success ? "default" : "destructive"} className="text-[9px]">
                  {log.success ? "OK" : "FAIL"}
                </Badge>
                <span className="font-mono text-muted-foreground">{log.action}</span>
                {log.error && <span className="text-destructive truncate max-w-48">{log.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
