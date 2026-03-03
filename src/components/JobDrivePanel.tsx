import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  HardDrive, ExternalLink, RefreshCw, Loader2, FileText, Image, FileCode,
  FileSpreadsheet, File, Film, Search, Filter, Upload, Eye, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DriveFile {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  detected_type: string;
  detected_stage: string;
  drive_web_view_link: string | null;
  drive_modified_time: string | null;
  status: string;
}

interface DriveLink {
  id: string;
  drive_folder_id: string;
  drive_folder_name: string;
  drive_folder_url: string;
  last_indexed_at: string | null;
}

const typeIcons: Record<string, React.ReactNode> = {
  dxf: <FileCode size={14} className="text-primary" />,
  cad: <FileCode size={14} className="text-blue-400" />,
  proposal: <FileText size={14} className="text-green-400" />,
  cost_sheet: <FileSpreadsheet size={14} className="text-amber-400" />,
  photo: <Image size={14} className="text-purple-400" />,
  video: <Film size={14} className="text-pink-400" />,
  bom: <FileSpreadsheet size={14} className="text-green-500" />,
  pdf: <FileText size={14} className="text-red-400" />,
  cnc_output: <FileCode size={14} className="text-orange-400" />,
  other: <File size={14} className="text-muted-foreground" />,
};

const typeLabels: Record<string, string> = {
  dxf: "DXF",
  cad: "CAD",
  proposal: "Proposal",
  cost_sheet: "Cost Sheet",
  photo: "Photo/Media",
  video: "Video",
  bom: "BOM",
  pdf: "PDF",
  cnc_output: "CNC Output",
  other: "Other",
};

const stageLabels: Record<string, string> = {
  sales: "Sales",
  design: "Design",
  production: "Production",
  install: "Install",
  finance: "Finance",
  unknown: "—",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function JobDrivePanel({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const [link, setLink] = useState<DriveLink | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [fileOpens, setFileOpens] = useState<Record<string, { count: number; staffIds: string[] }>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "get_job_link", job_id: jobId },
      });
      if (error) throw error;
      setLink(data.link);
      setFiles(data.files || []);

      // Load read receipts for these files
      if (data.files?.length > 0) {
        const { data: opensData } = await supabase.functions.invoke("google-drive-auth", {
          body: { action: "get_file_opens", job_id: jobId },
        });
        if (opensData?.opens) {
          const grouped: Record<string, { count: number; staffIds: string[] }> = {};
          for (const o of opensData.opens) {
            if (!grouped[o.drive_file_id]) grouped[o.drive_file_id] = { count: 0, staffIds: [] };
            grouped[o.drive_file_id].count++;
            if (!grouped[o.drive_file_id].staffIds.includes(o.opened_by_staff_id)) {
              grouped[o.drive_file_id].staffIds.push(o.opened_by_staff_id);
            }
          }
          setFileOpens(grouped);
        }
      }
    } catch {
      // No link — that's fine
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "index_job_files", job_id: jobId },
      });
      if (error) throw error;
      toast({ title: "Files indexed", description: `${data.indexed} files found` });
      fetchData();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-20 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!link) return null; // No Drive link for this job — don't show panel

  const filteredFiles = files.filter(f => {
    if (search && !f.file_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && f.detected_type !== typeFilter) return false;
    if (stageFilter !== "all" && f.detected_stage !== stageFilter) return false;
    return true;
  });

  const dxfFiles = files.filter(f => f.detected_type === "dxf");
  const uniqueTypes = [...new Set(files.map(f => f.detected_type))];
  const uniqueStages = [...new Set(files.map(f => f.detected_stage))];

  return (
    <div className="glass-panel border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <HardDrive size={16} className="text-primary" />
          <h3 className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">
            Documents (Drive)
          </h3>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
            {files.length} files
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={link.drive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink size={12} />
            Open in Drive
          </a>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Sync
          </button>
        </div>
      </div>

      {/* DXF Banner */}
      {dxfFiles.length > 0 && (
        <div className="px-4 py-2 bg-primary/5 border-b border-primary/10 flex items-center gap-2">
          <FileCode size={14} className="text-primary" />
          <span className="text-xs text-foreground">
            <strong>{dxfFiles.length} DXF file{dxfFiles.length > 1 ? "s" : ""}</strong> detected —
            add to Job Parts for nesting
          </span>
        </div>
      )}

      {/* Filters */}
      {files.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-[240px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full h-7 pl-7 pr-3 rounded border border-input bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="h-7 rounded border border-input bg-card px-2 text-xs text-foreground"
          >
            <option value="all">All Types</option>
            {uniqueTypes.map(t => (
              <option key={t} value={t}>{typeLabels[t] || t}</option>
            ))}
          </select>
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="h-7 rounded border border-input bg-card px-2 text-xs text-foreground"
          >
            <option value="all">All Stages</option>
            {uniqueStages.map(s => (
              <option key={s} value={s}>{stageLabels[s] || s}</option>
            ))}
          </select>
        </div>
      )}

      {/* Files List */}
      {filteredFiles.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <File size={24} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">
            {files.length === 0 ? "No files indexed yet. Click Sync to scan." : "No files match your filters."}
          </p>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 sticky top-0">
                <th className="text-left px-3 py-2 font-mono text-[10px] text-muted-foreground">FILE</th>
                <th className="text-left px-3 py-2 font-mono text-[10px] text-muted-foreground">TYPE</th>
                <th className="text-left px-3 py-2 font-mono text-[10px] text-muted-foreground">STAGE</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground">SIZE</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] text-muted-foreground">MODIFIED</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map(file => (
                <tr key={file.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {typeIcons[file.detected_type] || typeIcons.other}
                      <span className="text-foreground truncate max-w-[200px]" title={file.file_name}>
                        {file.file_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      "inline-block px-1.5 py-0.5 rounded text-[10px] font-mono",
                      file.detected_type === "dxf" ? "bg-primary/10 text-primary" :
                      file.detected_type === "cad" ? "bg-blue-500/10 text-blue-400" :
                      "bg-muted/30 text-muted-foreground"
                    )}>
                      {typeLabels[file.detected_type] || file.detected_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {stageLabels[file.detected_stage] || file.detected_stage}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatBytes(file.file_size_bytes)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {file.drive_modified_time
                      ? new Date(file.drive_modified_time).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right flex items-center justify-end gap-2">
                    {fileOpens[file.id] && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={`Opened by ${fileOpens[file.id].staffIds.length} person(s), ${fileOpens[file.id].count} total opens`}>
                        <Users size={10} /> {fileOpens[file.id].staffIds.length}
                      </span>
                    )}
                    {file.drive_web_view_link && (
                      <a
                        href={file.drive_web_view_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          // Record read receipt
                          supabase.functions.invoke("google-drive-auth", {
                            body: {
                              action: "record_file_open",
                              drive_file_id: file.id,
                              job_id: jobId,
                              file_name: file.file_name,
                            },
                          }).catch(() => {});
                        }}
                        className="text-primary hover:underline text-[10px]"
                      >
                        Open
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {link.last_indexed_at && (
        <div className="px-4 py-1.5 border-t border-border bg-muted/10">
          <p className="text-[10px] text-muted-foreground">
            Last indexed: {new Date(link.last_indexed_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
