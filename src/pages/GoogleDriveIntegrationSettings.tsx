import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  HardDrive, Link2, Unlink, RefreshCw, CheckCircle2, AlertTriangle,
  XCircle, Loader2, ChevronDown, ChevronUp, Settings2, FolderOpen,
  FolderSearch, FileText, Upload, ToggleLeft,
} from "lucide-react";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

interface DriveSettings {
  is_connected: boolean;
  google_user_email: string | null;
  status: string;
  projects_root_folder_id: string | null;
  projects_root_folder_name: string | null;
  auto_create_jobs_from_folders: boolean;
  auto_index_files: boolean;
  auto_attach_dxfs: boolean;
  folder_name_pattern: string;
  job_number_parse_regex: string;
  sync_mode: string;
  polling_interval_minutes: number;
  auto_upload_exports: boolean;
  export_subfolder_cnc: string;
  export_subfolder_exports: string;
  export_subfolder_labels: string;
  export_subfolder_nesting: string;
  include_subfolders: boolean;
  detect_dxfs: boolean;
  detect_photos: boolean;
  detect_cost_sheets: boolean;
  last_sync_at: string | null;
  last_error_message: string | null;
}

interface DriveFolder {
  id: string;
  name: string;
}

const statusIcon: Record<string, React.ReactNode> = {
  healthy: <CheckCircle2 size={16} className="text-success" />,
  needs_auth: <AlertTriangle size={16} className="text-warning" />,
  error: <XCircle size={16} className="text-destructive" />,
  disconnected: <XCircle size={16} className="text-muted-foreground" />,
};

export default function GoogleDriveIntegrationSettings() {
  const { session } = useAuth();
  const [settings, setSettings] = useState<DriveSettings | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [autoLocating, setAutoLocating] = useState(false);

  // Folder picker
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);

  const fetchStatus = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const [driveRes, calRes] = await Promise.all([
        supabase.functions.invoke("google-drive-auth", { body: { action: "status" } }),
        supabase.functions.invoke("google-calendar-auth", { body: { action: "status" } }),
      ]);
      if (driveRes.error) throw driveRes.error;
      setSettings(driveRes.data.settings || null);
      setQueueCount(driveRes.data.queue_count || 0);
      setGoogleConnected(calRes.data?.settings?.is_connected === true);
    } catch {
      setSettings(null);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Handle Drive OAuth callback (incremental consent)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const stateRaw = params.get("state");
    if (!code || !stateRaw) return;
    
    let stateObj: any;
    try {
      stateObj = JSON.parse(atob(stateRaw));
    } catch { return; }
    if (stateObj.flow !== "drive_setup") return;
    
    // Clear URL immediately to prevent re-processing on re-renders
    window.history.replaceState({}, "", "/settings");
    
    // Wait for auth session
    if (!session?.access_token) return;
    
    let cancelled = false;
    (async () => {
      setConnecting(true);
      try {
        const redirectUri = "https://enclaveworkflowandhr.lovable.app/settings";
        const { data, error } = await supabase.functions.invoke("google-drive-auth", {
          body: { action: "drive_callback", code, redirect_uri: redirectUri },
        });
        if (cancelled) return;
        
        if (error) {
          let detail = error.message || "Unknown error";
          try {
            if ('context' in error && (error as any).context?.body) {
              const body = await (error as any).context.body.json?.();
              if (body?.error) detail = body.error + (body.detail ? `: ${body.detail}` : '');
            }
          } catch {}
          throw new Error(detail);
        }
        
        if (data?.error) {
          throw new Error(data.error + (data.detail ? `: ${data.detail}` : ''));
        }
        
        toast({ title: "Drive Connected", description: `Linked as ${data.email || "your Google account"}` });
        fetchStatus();
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || JSON.stringify(err) || "Unknown error";
        console.error("[DriveAuth] Callback error:", msg);
        toast({ title: "Drive Connection Failed", description: msg, variant: "destructive" });
      } finally {
        if (!cancelled) setConnecting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.access_token]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectUri = "https://enclaveworkflowandhr.lovable.app/settings";
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "setup", redirect_uri: redirectUri },
      });
      if (error) throw error;

      // If incremental consent is needed, redirect
      if (data.needs_consent && data.url) {
        window.location.href = data.url;
        return;
      }

      toast({ title: "Drive Connected", description: `Linked as ${data.email || "your Google account"}` });
      fetchStatus();
    } catch (err: any) {
      const msg = err?.message || "";
      const isNotConnected = msg.includes("Google not connected") || msg.includes("not connected");
      toast({
        title: isNotConnected ? "Google Not Connected" : "Connection Failed",
        description: isNotConnected
          ? "Please connect your Google Account above first, then return here to enable Drive."
          : msg,
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google Drive? All folder links and file index will be preserved but sync will stop.")) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      toast({ title: "Drive Disconnected" });
      fetchStatus();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const loadFolders = async (parentId?: string) => {
    setLoadingFolders(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "list_folders", parent_id: parentId || "root" },
      });
      if (error) throw error;
      setFolders(data.folders || []);
    } catch (err: any) {
      toast({ title: "Error loading folders", description: err.message, variant: "destructive" });
    } finally {
      setLoadingFolders(false);
    }
  };

  const openFolderPicker = () => {
    setShowFolderPicker(true);
    setFolderStack([]);
    loadFolders();
  };

  const navigateInto = (folder: DriveFolder) => {
    setFolderStack(s => [...s, folder]);
    loadFolders(folder.id);
  };

  const navigateBack = () => {
    const newStack = folderStack.slice(0, -1);
    setFolderStack(newStack);
    loadFolders(newStack.length > 0 ? newStack[newStack.length - 1].id : undefined);
  };

  const selectFolder = async (folder: DriveFolder) => {
    try {
      const { error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "set_root_folder", folder_id: folder.id, folder_name: folder.name },
      });
      if (error) throw error;
      toast({ title: "Root folder set", description: folder.name });
      setShowFolderPicker(false);
      fetchStatus();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRunSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "scan_root" },
      });
      if (error) throw error;
      toast({
        title: "Scan Complete",
        description: `Created: ${data.created}, Linked: ${data.linked}, Skipped: ${data.skipped}${data.conflicts?.length ? `, Conflicts: ${data.conflicts.length}` : ""}`,
      });
      fetchStatus();
    } catch (err: any) {
      toast({ title: "Sync Error", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateSetting = async (key: string, value: unknown) => {
    try {
      const { error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "update_settings", [key]: value },
      });
      if (error) throw error;
      setSettings(s => s ? { ...s, [key]: value } : s);
      toast({ title: "Setting updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const isConnected = settings?.is_connected;

  return (
    <div className="space-y-6">
      <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
        <HardDrive size={16} className="text-primary" />
        Google Drive Integration
      </h3>

      {/* ─── Connection Card ─── */}
      <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {statusIcon[settings?.status || "disconnected"]}
            <div>
              <p className="text-sm font-medium text-foreground">
                {isConnected ? "Connected" : "Not Connected"}
              </p>
              {settings?.google_user_email && (
                <p className="text-xs text-muted-foreground">{settings.google_user_email}</p>
              )}
            </div>
          </div>

          {isConnected ? (
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
              disabled={connecting || !googleConnected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Enable Drive
            </button>
          )}
        </div>

        {!isConnected && !googleConnected && (
          <div className="rounded-md bg-warning/10 border border-warning/30 p-3">
            <p className="text-xs text-warning">
              ⚠ You must connect your <strong>Google Account</strong> above first, then return here to enable Drive.
            </p>
          </div>
        )}

        {!isConnected && googleConnected && (
          <p className="text-xs text-muted-foreground">
            Google is connected. Click "Enable Drive" to start using Drive folders as project file storage.
          </p>
        )}

        {settings?.status === "error" && settings.last_error_message && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
            <p className="text-xs text-destructive">{settings.last_error_message}</p>
          </div>
        )}
      </div>

      {/* ─── Root Folder ─── */}
      {isConnected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Projects Root Folder</h4>

          {settings?.projects_root_folder_name ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-primary" />
                <span className="text-sm font-medium text-foreground">{settings.projects_root_folder_name}</span>
              </div>
              <button
                onClick={openFolderPicker}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <FolderSearch size={14} />
                Change
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={openFolderPicker}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <FolderSearch size={14} />
                Browse Folders
              </button>
              <button
                onClick={async () => {
                  setAutoLocating(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("google-drive-auth", {
                      body: { action: "auto_locate", search_name: "Jobs" },
                    });
                    if (error) throw error;
                    const found = data.folders || [];
                    if (found.length === 0) {
                      toast({ title: "Not found", description: "Could not find a 'Jobs' folder. Try browsing manually.", variant: "destructive" });
                    } else if (found.length === 1) {
                      // Auto-select it
                      await selectFolder({ id: found[0].id, name: found[0].name });
                    } else {
                      // Show results for user to pick
                      setFolders(found);
                      setShowFolderPicker(true);
                      setFolderStack([]);
                      toast({ title: `Found ${found.length} 'Jobs' folders`, description: "Select the correct one below." });
                    }
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setAutoLocating(false);
                  }
                }}
                disabled={autoLocating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {autoLocating ? <Loader2 size={14} className="animate-spin" /> : <FolderSearch size={14} />}
                Auto-locate "Jobs" Folder
              </button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Subfolders under this folder will be scanned for project folders (e.g. "1042 - Smith Kitchen").
            Use "Auto-locate" to search Shared Drives for your Jobs folder.
          </p>

          {/* Folder Picker */}
          {showFolderPicker && (
            <div className="border border-border rounded-md p-4 space-y-3 bg-card">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button onClick={() => { setFolderStack([]); loadFolders(); }} className="hover:text-foreground font-medium">Root</button>
                {folderStack.map((f, i) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <span>/</span>
                    <button
                      onClick={() => {
                        const newStack = folderStack.slice(0, i + 1);
                        setFolderStack(newStack);
                        loadFolders(f.id);
                      }}
                      className="hover:text-foreground font-medium"
                    >
                      {f.name}
                    </button>
                  </span>
                ))}
              </div>

              {loadingFolders ? (
                <div className="h-20 flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-primary" />
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {folderStack.length > 0 && (
                    <button
                      onClick={navigateBack}
                      className="w-full text-left px-3 py-2 rounded text-xs text-muted-foreground hover:bg-muted/30"
                    >
                      ← Back
                    </button>
                  )}
                  {folders.length === 0 && (
                    <p className="text-xs text-muted-foreground px-3 py-2">No subfolders found</p>
                  )}
                  {folders.map(f => (
                    <div key={f.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted/30 group">
                      <button
                        onClick={() => navigateInto(f)}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <FolderOpen size={14} className="text-muted-foreground" />
                        {f.name}
                      </button>
                      <button
                        onClick={() => selectFolder(f)}
                        className="text-xs font-medium text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowFolderPicker(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Auto Job Creation Rules ─── */}
      {isConnected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Auto Job Creation</h4>

          <ToggleRow
            label="Auto-create jobs from new folders"
            value={settings?.auto_create_jobs_from_folders ?? true}
            onChange={v => handleUpdateSetting("auto_create_jobs_from_folders", v)}
          />

          <div>
            <label className={labelClass}>Folder Name Pattern (Regex)</label>
            <input
              className={inputClass}
              value={settings?.folder_name_pattern || ""}
              onChange={e => handleUpdateSetting("folder_name_pattern", e.target.value)}
              placeholder="^[0-9]{3,6}\s*-\s*.+$"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              e.g. "1042 - Smith Kitchen" matches the default pattern
            </p>
          </div>
        </div>
      )}

      {/* ─── Indexing Options ─── */}
      {isConnected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">File Indexing</h4>

          <ToggleRow
            label="Auto-index files in job folders"
            value={settings?.auto_index_files ?? true}
            onChange={v => handleUpdateSetting("auto_index_files", v)}
          />
          <ToggleRow
            label="Include subfolders"
            value={settings?.include_subfolders ?? true}
            onChange={v => handleUpdateSetting("include_subfolders", v)}
          />
          <ToggleRow
            label="Detect DXF files"
            value={settings?.detect_dxfs ?? true}
            onChange={v => handleUpdateSetting("detect_dxfs", v)}
          />
          <ToggleRow
            label="Detect photos & media"
            value={settings?.detect_photos ?? true}
            onChange={v => handleUpdateSetting("detect_photos", v)}
          />
          <ToggleRow
            label="Detect cost sheets"
            value={settings?.detect_cost_sheets ?? true}
            onChange={v => handleUpdateSetting("detect_cost_sheets", v)}
          />
        </div>
      )}

      {/* ─── Export to Drive ─── */}
      {isConnected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Export to Drive</h4>

          <ToggleRow
            label="Auto-upload exports to Drive"
            value={settings?.auto_upload_exports ?? false}
            onChange={v => handleUpdateSetting("auto_upload_exports", v)}
          />

          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "export_subfolder_cnc", label: "CNC Output Folder" },
              { key: "export_subfolder_exports", label: "Exports Folder" },
              { key: "export_subfolder_labels", label: "Labels Folder" },
              { key: "export_subfolder_nesting", label: "Nesting Folder" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <input
                  className={inputClass}
                  value={(settings as any)?.[key] || ""}
                  onChange={e => handleUpdateSetting(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Shared Media Folder ─── */}
      {isConnected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Shared Media Folder</h4>
          <p className="text-xs text-muted-foreground">
            Set a shared photos/media folder. The app will auto-match media files to jobs by job number in the filename.
          </p>
          <ToggleRow
            label="Auto-link shared media to jobs"
            value={(settings as any)?.auto_link_shared_media ?? true}
            onChange={v => handleUpdateSetting("auto_link_shared_media", v)}
          />
        </div>
      )}

      {/* ─── BOM Auto-Import ─── */}
      {isConnected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">BOM Auto-Import</h4>
          <p className="text-xs text-muted-foreground">
            When a BOM CSV is detected in a job folder (by filename keywords), it will be automatically parsed and buylist generated.
          </p>
          <ToggleRow
            label="Auto-import BOM CSV on detection"
            value={(settings as any)?.auto_import_bom_on_detect ?? true}
            onChange={v => handleUpdateSetting("auto_import_bom_on_detect", v)}
          />
        </div>
      )}

      {/* ─── Health Panel ─── */}
      {isConnected && (
        <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
          <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Sync Health</h4>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase">Status</p>
              <div className="flex items-center gap-1.5 mt-1">
                {statusIcon[settings?.status || "disconnected"]}
                <span className="text-sm font-medium text-foreground capitalize">{settings?.status}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase">Queued Items</p>
              <p className="text-sm font-medium text-foreground mt-1">{queueCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase">Last Sync</p>
              <p className="text-sm font-medium text-foreground mt-1">
                {settings?.last_sync_at ? new Date(settings.last_sync_at).toLocaleString() : "Never"}
              </p>
            </div>
          </div>

          <button
            onClick={handleRunSync}
            disabled={syncing || !settings?.projects_root_folder_id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Scan Root & Sync Now
          </button>

          {!settings?.projects_root_folder_id && (
            <p className="text-[10px] text-warning">Set a root folder before scanning.</p>
          )}
        </div>
      )}

      {/* ─── Backfill Drive Folders ─── */}
      {isConnected && (
        <BackfillDriveFoldersPanel />
      )}

      {/* ─── Advanced ─── */}
      {isConnected && (
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
                <label className={labelClass}>Job Number Parse Regex</label>
                <input
                  className={inputClass}
                  value={settings?.job_number_parse_regex || ""}
                  onChange={e => handleUpdateSetting("job_number_parse_regex", e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Group 1 = job number, Group 2 = job name. Default: ^(\d&#123;3&#125;)_(.+)$ — e.g. "053_Chris-Mitchell_Wardrobes"
                </p>
              </div>

              <div>
                <label className={labelClass}>Sync Mode</label>
                <div className="flex items-center gap-3">
                  <select
                    className={cn(inputClass, "flex-1")}
                    value={settings?.sync_mode || "polling"}
                    onChange={e => handleUpdateSetting("sync_mode", e.target.value)}
                  >
                    <option value="polling">Polling (every 5 min via cron)</option>
                    <option value="push_notifications">Push Notifications (Google webhook)</option>
                  </select>
                  {settings?.sync_mode === "push_notifications" ? (
                    <button
                      onClick={async () => {
                        try {
                          const { error } = await supabase.functions.invoke("google-drive-auth", {
                            body: { action: "stop_watch" },
                          });
                          if (error) throw error;
                          toast({ title: "Watch stopped" });
                          fetchStatus();
                        } catch (err: any) {
                          toast({ title: "Error", description: err.message, variant: "destructive" });
                        }
                      }}
                      className="px-3 py-1.5 rounded-md border border-destructive text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      Stop Watch
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase.functions.invoke("google-drive-auth", {
                            body: { action: "start_watch" },
                          });
                          if (error) throw error;
                          toast({ title: "Watch started", description: `Expires: ${data.expiration ? new Date(parseInt(data.expiration)).toLocaleString() : "7 days"}` });
                          fetchStatus();
                        } catch (err: any) {
                          toast({ title: "Error", description: err.message, variant: "destructive" });
                        }
                      }}
                      className="px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Start Watch
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Push notifications receive real-time Drive changes via webhook. Polling runs every 5 minutes automatically.
                </p>
              </div>

              <div>
                <label className={labelClass}>Polling Interval (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  className={cn(inputClass, "w-24")}
                  value={settings?.polling_interval_minutes || 10}
                  onChange={e => handleUpdateSetting("polling_interval_minutes", parseInt(e.target.value) || 10)}
                />
              </div>

              <ToggleRow
                label="Auto-attach detected DXFs to job parts"
                value={settings?.auto_attach_dxfs ?? false}
                onChange={v => handleUpdateSetting("auto_attach_dxfs", v)}
              />
              <p className="text-[10px] text-warning -mt-2">
                ⚠ DXFs still require dimension/material validation before nesting.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Backfill Drive Folders Panel ───
function BackfillDriveFoldersPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ matched: number; total_unlinked_jobs: number; total_drive_folders: number; results: Array<{ job_ref: string; folder_name: string; status: string }> } | null>(null);

  const handleBackfill = async () => {
    if (!confirm("This will scan your Drive _Jobs folder and link matching folders to existing jobs. Continue?")) return;
    setRunning(true);
    setResults(null);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-drive-folders");
      if (error) throw error;
      if (!data.ok) throw new Error(data.error || "Backfill failed");
      setResults(data);
      toast({
        title: "Backfill Complete",
        description: `Matched ${data.matched} of ${data.total_unlinked_jobs} unlinked jobs (${data.total_drive_folders} Drive folders scanned)`,
      });
    } catch (err: any) {
      toast({ title: "Backfill Failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="glass-panel rounded-lg p-5 space-y-4 max-w-2xl">
      <h4 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">Backfill Drive Folders</h4>
      <p className="text-xs text-muted-foreground">
        Match existing jobs to their Drive folders by job number. Scans all folders in _Jobs and links any that match an unlinked job's numeric prefix.
      </p>

      <button
        onClick={handleBackfill}
        disabled={running}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <FolderSearch size={14} />}
        {running ? "Scanning…" : "Backfill Drive Folders"}
      </button>

      {results && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Scanned <strong>{results.total_drive_folders}</strong> folders · <strong>{results.matched}</strong> matched · <strong>{results.total_unlinked_jobs - results.matched}</strong> unmatched
          </p>
          {results.results.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground uppercase">Job Ref</th>
                    <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground uppercase">Drive Folder</th>
                    <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 font-mono">{r.job_ref}</td>
                      <td className="px-3 py-1.5">{r.folder_name}</td>
                      <td className="px-3 py-1.5">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium",
                          r.status === "linked" ? "bg-emerald-500/20 text-emerald-400" : "bg-destructive/20 text-destructive"
                        )}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Toggle Row Component ───
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          "relative w-10 h-5 rounded-full transition-colors",
          value ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
            value && "translate-x-5"
          )}
        />
      </button>
    </div>
  );
}
