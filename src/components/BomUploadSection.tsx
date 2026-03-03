import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Upload, FileText, Loader2, CheckCircle2, AlertTriangle,
  Paintbrush, RefreshCw, ChevronDown, ChevronRight, Info,
} from "lucide-react";

interface Props {
  jobId: string;
  onBuylistRefresh: () => void;
}

interface BomUpload {
  id: string;
  file_name: string;
  bom_revision: number;
  parse_status: string;
  parse_error: string | null;
  uploaded_at: string;
}

interface ParseResult {
  bom_revision: number;
  bom_items_count: number;
  buylist_items_count: number;
  spray_items_count: number;
  category_counts: Record<string, number>;
  errors: string[];
}

const categoryLabels: Record<string, string> = {
  panels: "Panels", hardware: "Hardware", lighting: "Lighting", fixings: "Fixings",
  legs: "Legs", handles: "Handles", finishing_oils: "Finishing/Oils",
  paint_spray_subcontract: "Spray/Paint", edgebanding: "Edgebanding", other: "Other",
};

export default function BomUploadSection({ jobId, onBuylistRefresh }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [uploads, setUploads] = useState<BomUpload[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadUploads = useCallback(async () => {
    const { data } = await (supabase.from("job_bom_uploads") as any)
      .select("id, file_name, bom_revision, parse_status, parse_error, uploaded_at")
      .eq("job_id", jobId)
      .order("bom_revision", { ascending: false });
    setUploads(data ?? []);
  }, [jobId]);

  useEffect(() => { loadUploads(); }, [loadUploads]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    setParseResult(null);

    try {
      const text = await file.text();
      const { data, error } = await supabase.functions.invoke("parse-bom-csv", {
        body: { job_id: jobId, csv_text: text, file_name: file.name },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setParseResult(data);
      toast({
        title: `BOM Rev ${data.bom_revision} imported`,
        description: `${data.bom_items_count} items parsed, ${data.buylist_items_count} buylist lines, ${data.spray_items_count} spray items`,
      });
      loadUploads();
      onBuylistRefresh();
    } catch (err: any) {
      toast({ title: "BOM import failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const latestRevision = uploads[0]?.bom_revision ?? 0;

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-xs font-medium text-accent-foreground hover:bg-accent/80 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {latestRevision > 0 ? "Re-upload BOM (new revision)" : "Upload Inventor BOM (CSV)"}
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />

        {latestRevision > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
            Current Rev: {latestRevision}
          </span>
        )}

        {uploads.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            History ({uploads.length})
          </button>
        )}
      </div>

      {/* Source of truth notice */}
      <div className="rounded-md border border-border bg-muted/10 p-2 flex items-start gap-2">
        <Info size={14} className="text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong>Inventor is the source of truth.</strong> BOM data is imported as-is. To fix categories or spray tagging, update the BOM in Inventor and re-upload.
        </p>
      </div>

      {/* Parse result summary */}
      {parseResult && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-primary">
            <CheckCircle2 size={14} /> BOM Rev {parseResult.bom_revision} Parsed
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-lg font-mono font-bold text-foreground">{parseResult.bom_items_count}</p>
              <p className="text-[10px] text-muted-foreground">BOM Items</p>
            </div>
            <div>
              <p className="text-lg font-mono font-bold text-primary">{parseResult.buylist_items_count}</p>
              <p className="text-[10px] text-muted-foreground">Buylist Lines</p>
            </div>
            <div>
              <p className="text-lg font-mono font-bold text-chart-5">{parseResult.spray_items_count}</p>
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Paintbrush size={10} /> Spray</p>
            </div>
            <div>
              <p className="text-lg font-mono font-bold text-destructive">{parseResult.errors.length}</p>
              <p className="text-[10px] text-muted-foreground">Errors</p>
            </div>
          </div>

          {/* Category breakdown */}
          {Object.keys(parseResult.category_counts).length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {Object.entries(parseResult.category_counts).map(([cat, count]) => (
                <span key={cat} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {categoryLabels[cat] || cat}: {count}
                </span>
              ))}
            </div>
          )}

          {/* Errors */}
          {parseResult.errors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 max-h-24 overflow-y-auto space-y-1">
              {parseResult.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] text-destructive">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload history */}
      {showHistory && uploads.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Rev</th>
                <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">File</th>
                <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Status</th>
                <th className="text-left px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono font-bold text-foreground">{u.bom_revision}</td>
                  <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[150px]">{u.file_name}</td>
                  <td className="px-3 py-1.5">
                    <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                      u.parse_status === "parsed" ? "bg-primary/15 text-primary" :
                      u.parse_status === "failed" ? "bg-destructive/15 text-destructive" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {u.parse_status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground text-[10px]">
                    {new Date(u.uploaded_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
