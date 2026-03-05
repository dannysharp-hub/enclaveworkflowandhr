import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Calendar, Link2, Unlink, RefreshCw, CheckCircle2, AlertTriangle,
  XCircle, Loader2, ChevronDown, ChevronUp, Settings2, Download,
} from "lucide-react";
import {
  exportCalendarEvents, exportCalendarSyncLinks,
  exportCalendarSyncQueue, exportCalendarSyncAudit,
} from "@/lib/calendarExport";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

const EVENT_TYPES = [
  { key: "install", label: "Installs" },
  { key: "holiday", label: "Staff Holidays" },
  { key: "production", label: "Production Blocks" },
  { key: "meeting", label: "Meetings" },
  { key: "maintenance", label: "Maintenance" },
  { key: "training", label: "Training" },
];

interface GoogleCalendar {
  id: string;
  summary: string;
  description: string;
  primary: boolean;
  accessRole: string;
  backgroundColor: string;
}

interface IntegrationSettings {
  is_connected: boolean;
  google_user_email: string | null;
  status: string;
  sync_mode: string;
  conflict_policy: string;
  default_timezone: string;
  last_health_check_at: string | null;
  last_error_message: string | null;
}

interface CalendarMapping {
  id: string;
  event_type: string;
  google_calendar_id: string;
  google_calendar_name: string;
  enabled: boolean;
}

export default function GoogleIntegrationSettings() {
  const { session, tenantId } = useAuth();
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [mappings, setMappings] = useState<CalendarMapping[]>([]);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [callbackStatus, setCallbackStatus] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "status" },
      });
      if (error) throw error;
      setSettings(data.settings || { is_connected: false, status: "disconnected" });
      setQueueCount(data.queue_count || 0);
    } catch {
      setSettings({ is_connected: false, status: "disconnected", google_user_email: null, sync_mode: "one_way_app_to_google", conflict_policy: "app_wins", default_timezone: "Europe/London", last_health_check_at: null, last_error_message: null });
    }
    setLoading(false);
  }, [session]);

  const fetchMappings = useCallback(async () => {
    const { data } = await supabase
      .from("google_calendar_mappings")
      .select("*")
      .order("event_type");
    setMappings((data as CalendarMapping[]) || []);
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchMappings();
  }, [fetchStatus, fetchMappings]);

  // Handle OAuth callback - wait for session to be ready
  useEffect(() => {
    // Read from URL first, then fallback to sessionStorage (persisted by SettingsPage)
    const params = new URLSearchParams(window.location.search);
    let code = params.get("code");
    let state = params.get("state");
    const errorParam = params.get("error");
    
    // Google returned an error instead of a code
    if (errorParam) {
      const errorDesc = params.get("error_description") || errorParam;
      setCallbackStatus(`Google error: ${errorDesc}`);
      toast({ title: "Google Connection Failed", description: errorDesc, variant: "destructive" });
      window.history.replaceState({}, "", "/settings");
      return;
    }
    
    // Fallback: read from sessionStorage if not in URL
    if (!code || !state) {
      code = sessionStorage.getItem("google_oauth_code");
      state = sessionStorage.getItem("google_oauth_state");
    }
    
    console.log("[GoogleAuth] useEffect fired", { 
      codeFromUrl: params.get("code")?.substring(0, 10), 
      codeFromStorage: sessionStorage.getItem("google_oauth_code")?.substring(0, 10),
      hasCode: !!code, 
      hasState: !!state, 
      hasSession: !!session?.access_token 
    });
    
    if (!code || !state) return;
    
    // Wait until Supabase session is restored before calling edge function
    if (!session?.access_token) {
      setCallbackStatus("Waiting for authentication session...");
      return;
    }
    
    // Clear sessionStorage to prevent re-processing
    sessionStorage.removeItem("google_oauth_code");
    sessionStorage.removeItem("google_oauth_state");
    
    setCallbackStatus("Exchanging authorization code...");
    let cancelled = false;
    (async () => {
      setConnecting(true);
      try {
        const redirectUri = window.location.origin + "/settings";
        console.log("[GoogleAuth] Calling callback with redirect_uri:", redirectUri);
        
        const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
          body: { action: "callback", code, redirect_uri: redirectUri },
        });
        
        if (cancelled) return;
        
        if (error) {
          let detail = error.message;
          try {
            if ('context' in error && (error as any).context?.body) {
              const body = await (error as any).context.body.json?.() || (error as any).context.body;
              detail = JSON.stringify(body);
            }
          } catch {}
          throw new Error(detail);
        }
        
        if (data?.error) {
          throw new Error(data.error + (data.detail ? `: ${data.detail}` : ''));
        }
        
        setCallbackStatus(null);
        toast({ title: "Google Connected", description: `Connected as ${data.email}` });
        window.history.replaceState({}, "", "/settings");
        fetchStatus();
      } catch (err: any) {
        if (cancelled) return;
        const msg = err.message || "Unknown error during token exchange";
        console.error("[GoogleAuth] Callback error:", msg);
        setCallbackStatus(`Error: ${msg}`);
        toast({ title: "Connection Failed", description: msg, variant: "destructive" });
      } finally {
        if (!cancelled) setConnecting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.access_token]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectUri = window.location.origin + "/settings";
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "initiate", redirect_uri: redirectUri },
      });
      if (error) throw error;
      // Navigate in the same window so auth session + code stay together
      window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google Account? All calendar mappings, Drive links and sync links will be removed.")) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      toast({ title: "Google Disconnected" });
      setSettings({ ...settings!, is_connected: false, status: "disconnected", google_user_email: null });
      setMappings([]);
      setCalendars([]);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleLoadCalendars = async () => {
    setLoadingCalendars(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-list", {});
      if (error) throw error;
      setCalendars(data.calendars || []);
    } catch (err: any) {
      toast({ title: "Error loading calendars", description: err.message, variant: "destructive" });
    } finally {
      setLoadingCalendars(false);
    }
  };

  const handleSetMapping = async (eventType: string, googleCalendarId: string, googleCalendarName: string) => {
    try {
      const existing = mappings.find(m => m.event_type === eventType);
      if (existing) {
        if (!googleCalendarId) {
          await supabase.from("google_calendar_mappings").delete().eq("id", existing.id);
        } else {
          await supabase.from("google_calendar_mappings").update({
            google_calendar_id: googleCalendarId,
            google_calendar_name: googleCalendarName,
          }).eq("id", existing.id);
        }
      } else if (googleCalendarId) {
        await supabase.from("google_calendar_mappings").insert({
          tenant_id: tenantId,
          event_type: eventType,
          google_calendar_id: googleCalendarId,
          google_calendar_name: googleCalendarName,
          enabled: true,
        } as any);
      }
      fetchMappings();
      toast({ title: "Mapping saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRunSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {});
      if (error) throw error;
      toast({ title: "Sync Complete", description: `Processed: ${data.processed}, Failed: ${data.failed}` });
      fetchStatus();
    } catch (err: any) {
      toast({ title: "Sync Error", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateSettings = async (updates: Partial<IntegrationSettings>) => {
    try {
      const { error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "update_settings", ...updates },
      });
      if (error) throw error;
      setSettings(s => s ? { ...s, ...updates } : s);
      toast({ title: "Settings updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const statusIcon = {
    healthy: <CheckCircle2 size={16} className="text-success" />,
    needs_auth: <AlertTriangle size={16} className="text-warning" />,
    error: <XCircle size={16} className="text-destructive" />,
    disconnected: <XCircle size={16} className="text-muted-foreground" />,
  };

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
       <Calendar size={16} className="text-primary" />
        Google Account
      </h3>

      {/* ─── Callback Status Banner ─── */}
      {callbackStatus && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 max-w-2xl">
          <p className="text-sm font-medium text-warning flex items-center gap-2">
            {callbackStatus.startsWith("Error") || callbackStatus.startsWith("Google error") 
              ? <AlertTriangle size={16} /> 
              : <Loader2 size={16} className="animate-spin" />}
            {callbackStatus}
          </p>
        </div>
      )}

      {/* ─── Connection Card ─── */}
      <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {statusIcon[settings?.status as keyof typeof statusIcon] || statusIcon.disconnected}
            <div>
              <p className="text-sm font-medium text-foreground">
                {settings?.is_connected ? "Connected" : "Not Connected"}
              </p>
              {settings?.google_user_email && (
                <p className="text-xs text-muted-foreground">{settings.google_user_email}</p>
              )}
            </div>
          </div>

          {settings?.is_connected ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Connect Google Account
            </button>
          )}
        </div>

        {settings?.status === "needs_auth" && (
          <div className="rounded-md bg-warning/10 border border-warning/30 p-3">
            <p className="text-xs text-warning">
              Authentication expired. Please reconnect your Google account.
            </p>
          </div>
        )}

        {settings?.last_error_message && settings.status === "error" && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
            <p className="text-xs text-destructive">{settings.last_error_message}</p>
          </div>
        )}
      </div>

      {/* ─── Calendar Mappings ─── */}
      {settings?.is_connected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <div className="flex items-center justify-between">
            <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Calendar Mappings</h4>
            <button
              onClick={handleLoadCalendars}
              disabled={loadingCalendars}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {loadingCalendars ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Load Calendars
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Map each event type to a Google Calendar. Load calendars first, then assign.
          </p>

          <div className="space-y-3">
            {EVENT_TYPES.map(({ key, label }) => {
              const mapping = mappings.find(m => m.event_type === key);
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-foreground w-32 shrink-0">{label}</span>
                  {calendars.length > 0 ? (
                    <select
                      className={cn(inputClass, "flex-1")}
                      value={mapping?.google_calendar_id || ""}
                      onChange={e => {
                        const cal = calendars.find(c => c.id === e.target.value);
                        handleSetMapping(key, e.target.value, cal?.summary || "");
                      }}
                    >
                      <option value="">— None —</option>
                      {calendars.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.summary} {c.primary ? "(Primary)" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {mapping ? mapping.google_calendar_name : "Not mapped"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Health Panel ─── */}
      {settings?.is_connected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Sync Health</h4>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase">Status</p>
              <div className="flex items-center gap-1.5 mt-1">
                {statusIcon[settings.status as keyof typeof statusIcon]}
                <span className="text-sm font-medium text-foreground capitalize">{settings.status}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase">Queued Items</p>
              <p className="text-sm font-medium text-foreground mt-1">{queueCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase">Last Sync</p>
              <p className="text-sm font-medium text-foreground mt-1">
                {settings.last_health_check_at
                  ? new Date(settings.last_health_check_at).toLocaleString()
                  : "Never"}
              </p>
            </div>
          </div>

          <button
            onClick={handleRunSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Run Sync Now
          </button>
        </div>
      )}

      {/* ─── Advanced Settings ─── */}
      {settings?.is_connected && (
        <div className="glass-panel rounded-lg max-w-2xl overflow-hidden">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs font-mono font-bold text-foreground uppercase tracking-wider hover:bg-muted/20 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Settings2 size={14} />
              Advanced Settings
            </span>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showAdvanced && (
            <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
              <div>
                <label className={labelClass}>Sync Mode</label>
                <select
                  className={inputClass}
                  value={settings.sync_mode}
                  onChange={e => handleUpdateSettings({ sync_mode: e.target.value })}
                >
                  <option value="one_way_app_to_google">One-way (App → Google)</option>
                  <option value="two_way">Two-way (App ↔ Google)</option>
                </select>
                {settings.sync_mode === "two_way" && (
                  <p className="text-[10px] text-warning mt-1">
                    ⚠ Two-way sync may create conflicts. Choose a conflict policy below.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Conflict Policy</label>
                <select
                  className={inputClass}
                  value={settings.conflict_policy}
                  onChange={e => handleUpdateSettings({ conflict_policy: e.target.value })}
                >
                  <option value="app_wins">App wins (recommended)</option>
                  <option value="google_wins">Google wins</option>
                  <option value="manual_review">Manual review</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Default Timezone</label>
                <input
                  className={inputClass}
                  value={settings.default_timezone}
                  onChange={e => handleUpdateSettings({ default_timezone: e.target.value })}
                  placeholder="Europe/London"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Exports ─── */}
      {settings?.is_connected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Exports</h4>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Calendar Events", fn: exportCalendarEvents },
              { label: "Sync Links", fn: exportCalendarSyncLinks },
              { label: "Sync Queue", fn: exportCalendarSyncQueue },
              { label: "Audit Log", fn: exportCalendarSyncAudit },
            ].map(({ label, fn }) => (
              <button
                key={label}
                onClick={fn}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Download size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
