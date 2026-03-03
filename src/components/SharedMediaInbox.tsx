import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Image, RefreshCw, Loader2, CheckCircle2, ExternalLink, Search,
} from "lucide-react";

interface MediaItem {
  id: string;
  drive_file_id: string;
  file_name: string;
  mime_type: string | null;
  drive_web_view_link: string | null;
  job_id: string | null;
  status: string;
  auto_matched: boolean;
  match_reason: string | null;
  created_at: string;
}

interface Job {
  id: string;
  job_id: string;
  job_name: string | null;
}

export default function SharedMediaInbox() {
  const { userRole } = useAuth();
  const canManage = ["admin", "office", "supervisor"].includes(userRole || "");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Record<string, string>>({});

  const loadMedia = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("google-drive-auth", {
      body: { action: "get_unassigned_media" },
    });
    if (!error) setMedia(data?.media || []);
    setLoading(false);
  }, []);

  const loadJobs = useCallback(async () => {
    const { data } = await supabase.from("jobs").select("id, job_id, job_name").order("job_id", { ascending: false }).limit(200);
    setJobs((data as Job[]) || []);
  }, []);

  useEffect(() => { loadMedia(); loadJobs(); }, [loadMedia, loadJobs]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "scan_shared_media" },
      });
      if (error) throw error;
      toast({
        title: "Media scan complete",
        description: `${data.total} files found, ${data.auto_matched} auto-matched, ${data.unassigned} unassigned`,
      });
      loadMedia();
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const handleAssign = async (mediaId: string) => {
    const jobId = selectedJob[mediaId];
    if (!jobId) return;
    setAssigning(mediaId);
    try {
      const { error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "assign_media", media_id: mediaId, job_id: jobId },
      });
      if (error) throw error;
      toast({ title: "Media assigned to job" });
      setMedia(prev => prev.filter(m => m.id !== mediaId));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  const filtered = media.filter(m =>
    !search || m.file_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <Image size={16} className="text-primary" />
          Unassigned Media
          {media.length > 0 && (
            <span className="text-[10px] font-mono bg-chart-4/10 text-chart-4 px-2 py-0.5 rounded-full">
              {media.length}
            </span>
          )}
        </h3>
        {canManage && (
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Scan Shared Folder
          </button>
        )}
      </div>

      {media.length > 5 && (
        <div className="relative max-w-[240px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search files..."
            className="w-full h-7 pl-7 pr-3 rounded border border-input bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Image size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No unassigned media. Scan the shared folder to check for new uploads.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Image size={14} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground truncate" title={item.file_name}>
                  {item.file_name}
                </span>
                {item.drive_web_view_link && (
                  <a href={item.drive_web_view_link} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 shrink-0">
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selectedJob[item.id] || ""}
                    onChange={e => setSelectedJob(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="h-7 rounded border border-input bg-card px-2 text-xs text-foreground max-w-[180px]"
                  >
                    <option value="">Assign to job…</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id}>{j.job_id} — {j.job_name || "Untitled"}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAssign(item.id)}
                    disabled={!selectedJob[item.id] || assigning === item.id}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {assigning === item.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                    Assign
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
