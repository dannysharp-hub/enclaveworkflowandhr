import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Upload, CheckCircle2, AlertTriangle, Link2, FileQuestion,
  ChevronDown, X, Loader2
} from "lucide-react";
import JSZip from "jszip";

interface PartRef {
  part_id: string;
  id?: string;
}

interface DxfMatch {
  filename: string;
  file: File;
  base_part_id: string;
  matched_part_id: string | null;
  status: "matched" | "unmatched";
  suggestions: string[];
  manual_assignment: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  parts: PartRef[];
  onDxfLinked: (updates: { part_id: string; dxf_file_reference: string }[]) => void;
}

/**
 * Derive base part ID from a DXF filename.
 * Strips extension, then strips trailing _<number> suffix.
 * e.g. "CabinetDoor_1.dxf" → "CabinetDoor"
 *      "Panel.dxf" → "Panel"
 */
function deriveBasePartId(filename: string): string {
  // Remove path separators (handle zip paths like "Material/Grain-H/Part_1.dxf")
  const basename = filename.split(/[/\\]/).pop() || filename;
  // Remove .dxf extension
  let name = basename.replace(/\.dxf$/i, "");
  // Strip trailing _<digits>
  name = name.replace(/_\d+$/, "");
  return name;
}

/**
 * Simple fuzzy match: check if candidate contains query or vice versa,
 * or if they share a significant substring.
 */
function fuzzyMatch(query: string, candidate: string): number {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.8;
  // Check for common prefix
  let common = 0;
  for (let i = 0; i < Math.min(q.length, c.length); i++) {
    if (q[i] === c[i]) common++;
    else break;
  }
  if (common > 3) return common / Math.max(q.length, c.length);
  return 0;
}

export default function BulkDxfUploadDialog({ open, onOpenChange, jobId, parts, onDxfLinked }: Props) {
  const [matches, setMatches] = useState<DxfMatch[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const partIds = parts.map(p => p.part_id);

  const processFiles = useCallback(async (files: File[]) => {
    setProcessing(true);
    const dxfFiles: { filename: string; file: File }[] = [];

    for (const file of files) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        // Extract DXFs from zip
        try {
          const zip = await JSZip.loadAsync(file);
          const entries = Object.entries(zip.files).filter(
            ([name]) => name.toLowerCase().endsWith(".dxf") && !name.startsWith("__MACOSX")
          );
          for (const [name, entry] of entries) {
            if (!entry.dir) {
              const blob = await entry.async("blob");
              const dxfFile = new File([blob], name.split("/").pop() || name, { type: "application/dxf" });
              dxfFiles.push({ filename: name, file: dxfFile });
            }
          }
        } catch (err) {
          toast({ title: "Failed to read ZIP", description: (err as Error).message, variant: "destructive" });
        }
      } else if (file.name.toLowerCase().endsWith(".dxf")) {
        dxfFiles.push({ filename: file.name, file });
      }
    }

    // Match each DXF to a part
    const results: DxfMatch[] = dxfFiles.map(({ filename, file }) => {
      const baseId = deriveBasePartId(filename);
      // Exact match (case-insensitive)
      const exactMatch = partIds.find(pid => pid.toLowerCase() === baseId.toLowerCase());

      if (exactMatch) {
        return {
          filename,
          file,
          base_part_id: baseId,
          matched_part_id: exactMatch,
          status: "matched" as const,
          suggestions: [],
          manual_assignment: null,
        };
      }

      // Fuzzy suggestions
      const scored = partIds
        .map(pid => ({ pid, score: fuzzyMatch(baseId, pid) }))
        .filter(s => s.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return {
        filename,
        file,
        base_part_id: baseId,
        matched_part_id: null,
        status: "unmatched" as const,
        suggestions: scored.map(s => s.pid),
        manual_assignment: null,
      };
    });

    setMatches(results);
    setProcessing(false);
  }, [partIds]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processFiles(files);
  }, [processFiles]);

  const handleManualAssign = useCallback((filename: string, partId: string) => {
    setMatches(prev => prev.map(m =>
      m.filename === filename
        ? { ...m, manual_assignment: partId, matched_part_id: partId, status: "matched" as const }
        : m
    ));
  }, []);

  const handleUnassign = useCallback((filename: string) => {
    setMatches(prev => prev.map(m =>
      m.filename === filename
        ? { ...m, manual_assignment: null, matched_part_id: null, status: "unmatched" as const }
        : m
    ));
  }, []);

  const handleUpload = useCallback(async () => {
    const toUpload = matches.filter(m => m.matched_part_id);
    if (toUpload.length === 0) return;

    setUploading(true);
    const linkedUpdates: { part_id: string; dxf_file_reference: string }[] = [];

    try {
      for (const match of toUpload) {
        const safeName = match.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${jobId}/${match.matched_part_id}/${safeName}`;

        const { error: uploadErr } = await supabase.storage
          .from("dxf-files")
          .upload(path, match.file, { upsert: true });

        if (uploadErr) {
          console.error(`Upload failed for ${match.filename}:`, uploadErr);
          continue;
        }

        linkedUpdates.push({
          part_id: match.matched_part_id!,
          dxf_file_reference: path,
        });
      }

      onDxfLinked(linkedUpdates);
      toast({
        title: "DXFs uploaded",
        description: `${linkedUpdates.length} of ${toUpload.length} files linked to parts`,
      });
      onOpenChange(false);
      setMatches([]);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [matches, jobId, onDxfLinked, onOpenChange]);

  const handleClose = (o: boolean) => {
    if (!o) { setMatches([]); }
    onOpenChange(o);
  };

  const matchedCount = matches.filter(m => m.status === "matched").length;
  const unmatchedCount = matches.filter(m => m.status === "unmatched").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass-panel border-border sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">Bulk Upload DXFs</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            <Upload size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Click to select DXF files or a ZIP archive
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Supports Inventor export: Material\Grain-H\PartNumber_1.dxf
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".dxf,.zip"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {processing && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 size={16} className="animate-spin" /> Processing files…
            </div>
          )}

          {/* Summary */}
          {matches.length > 0 && (
            <div className="rounded-md border border-border bg-muted/20 p-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-mono font-bold text-foreground">{matches.length}</p>
                <p className="text-[10px] text-muted-foreground">Total DXFs</p>
              </div>
              <div>
                <p className="text-lg font-mono font-bold text-primary">{matchedCount}</p>
                <p className="text-[10px] text-muted-foreground">Matched</p>
              </div>
              <div>
                <p className="text-lg font-mono font-bold text-yellow-500">{unmatchedCount}</p>
                <p className="text-[10px] text-muted-foreground">Unmatched</p>
              </div>
            </div>
          )}

          {/* Matched files */}
          {matchedCount > 0 && (
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm text-foreground mb-2">
                <CheckCircle2 size={14} className="text-primary" />
                <span className="font-mono font-bold">Matched DXFs</span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {matches.filter(m => m.status === "matched").map(m => (
                  <div key={m.filename} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                    <span className="font-mono text-muted-foreground truncate max-w-[200px]" title={m.filename}>
                      {m.filename.split(/[/\\]/).pop()}
                    </span>
                    <div className="flex items-center gap-2">
                      <Link2 size={10} className="text-primary" />
                      <span className="font-mono text-foreground">{m.matched_part_id}</span>
                      {m.manual_assignment && (
                        <button onClick={() => handleUnassign(m.filename)} className="text-muted-foreground hover:text-destructive">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unmatched files */}
          {unmatchedCount > 0 && (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
              <div className="flex items-center gap-2 text-sm text-foreground mb-2">
                <FileQuestion size={14} className="text-yellow-500" />
                <span className="font-mono font-bold">Unmatched DXFs</span>
                <span className="text-[10px] text-muted-foreground ml-auto">Assign manually below</span>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {matches.filter(m => m.status === "unmatched").map(m => (
                  <div key={m.filename} className="rounded border border-border bg-background/50 p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-foreground truncate max-w-[180px]" title={m.filename}>
                        {m.filename.split(/[/\\]/).pop()}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        derived: <span className="font-mono">{m.base_part_id}</span>
                      </span>
                    </div>
                    <div className="relative">
                      <select
                        value={m.manual_assignment || ""}
                        onChange={(e) => {
                          if (e.target.value) handleManualAssign(m.filename, e.target.value);
                        }}
                        className="w-full h-8 pl-2 pr-8 text-xs rounded border border-border bg-background text-foreground font-mono appearance-none"
                      >
                        <option value="">— Select part —</option>
                        {m.suggestions.length > 0 && (
                          <optgroup label="Suggestions">
                            {m.suggestions.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="All Parts">
                          {partIds.map(pid => (
                            <option key={pid} value={pid}>{pid}</option>
                          ))}
                        </optgroup>
                      </select>
                      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload button */}
          {matches.length > 0 && (
            <button
              onClick={handleUpload}
              disabled={matchedCount === 0 || uploading}
              className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading && <Loader2 size={14} className="animate-spin" />}
              Upload & Link {matchedCount} DXF{matchedCount !== 1 ? "s" : ""}
              {unmatchedCount > 0 && ` (${unmatchedCount} skipped)`}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
