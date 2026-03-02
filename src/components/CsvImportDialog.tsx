import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseCsv, CsvPart, CsvParseResult } from "@/lib/csvParser";
import { AlertCircle, AlertTriangle, CheckCircle2, Upload, Info } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (parts: CsvPart[]) => void;
}

export default function CsvImportDialog({ open, onOpenChange, onImport }: Props) {
  const [result, setResult] = useState<CsvParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setResult(parseCsv(text));
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!result) return;
    onImport(result.parts);
    onOpenChange(false);
    setResult(null);
    setFileName("");
  };

  const handleClose = (o: boolean) => {
    if (!o) { setResult(null); setFileName(""); }
    onOpenChange(o);
  };

  const parts = result?.parts ?? [];
  const errors = result?.errors ?? [];
  const warnings = result?.warnings ?? [];
  const summary = result?.summary;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass-panel border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">Import Parts from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            <Upload size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {fileName || "Click to select CSV file"}
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Supports: Part Number, QTY, Material, Grain, Dimensions (e.g. 323.5 X 2220 X 18.5)
            </p>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
          </div>

          {/* Import Summary */}
          {summary && (
            <div className="rounded-md border border-border bg-muted/20 p-3 grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-lg font-mono font-bold text-foreground">{summary.totalRows}</p>
                <p className="text-[10px] text-muted-foreground">Total Rows</p>
              </div>
              <div>
                <p className="text-lg font-mono font-bold text-primary">{summary.imported}</p>
                <p className="text-[10px] text-muted-foreground">Imported</p>
              </div>
              <div>
                <p className="text-lg font-mono font-bold text-destructive">{summary.skipped}</p>
                <p className="text-[10px] text-muted-foreground">Skipped</p>
              </div>
              <div>
                <p className="text-lg font-mono font-bold text-yellow-500">{summary.needsReview}</p>
                <p className="text-[10px] text-muted-foreground">Review</p>
              </div>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-1 max-h-32 overflow-y-auto">
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 space-y-1 max-h-32 overflow-y-auto">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Parts with flags */}
          {parts.length > 0 && (
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm text-foreground mb-2">
                <CheckCircle2 size={14} className="text-primary" />
                <span className="font-mono font-bold">{parts.length}</span> parts parsed
                <span className="text-muted-foreground">
                  ({parts.reduce((s, p) => s + p.quantity, 0)} total incl. qty)
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left py-1 font-mono">PART</th>
                      <th className="text-left py-1 font-mono">MATERIAL</th>
                      <th className="text-right py-1 font-mono">L×W</th>
                      <th className="text-center py-1 font-mono">GRAIN</th>
                      <th className="text-right py-1 font-mono">QTY</th>
                      <th className="text-center py-1 font-mono">OK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.slice(0, 30).map((p, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1 font-mono text-foreground">{p.part_id}</td>
                        <td className="py-1 text-muted-foreground truncate max-w-[80px]" title={p.product_code}>
                          {p.product_code === "UNASSIGNED" ? (
                            <span className="text-yellow-500">UNASSIGNED</span>
                          ) : p.product_code}
                        </td>
                        <td className="py-1 text-right font-mono text-muted-foreground">
                          {p.length_mm > 0 ? `${p.length_mm}×${p.width_mm}` : (
                            <span className="text-destructive">—</span>
                          )}
                        </td>
                        <td className="py-1 text-center font-mono text-muted-foreground">
                          {p.grain_required ? p.grain_axis : "—"}
                        </td>
                        <td className="py-1 text-right font-mono text-foreground">{p.quantity}</td>
                        <td className="py-1 text-center">
                          {p.flags.length === 0 ? (
                            <CheckCircle2 size={12} className="inline text-primary" />
                          ) : (
                            <span title={p.flags.join("\n")}>
                              <AlertTriangle size={12} className="inline text-yellow-500 cursor-help" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parts.length > 30 && (
                  <p className="text-[10px] text-muted-foreground mt-1">...and {parts.length - 30} more</p>
                )}
              </div>
            </div>
          )}

          {/* Modeller checklist hint */}
          {parts.length > 0 && summary && summary.needsReview > 0 && (
            <div className="rounded-md border border-border bg-muted/10 p-2 flex items-start gap-2">
              <Info size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <strong>Tip:</strong> Ask your modeller to ensure Part Number is unique, QTY is populated, Material contains your board code (e.g. "MDF18"), and Grain outputs only H / V / None.
              </p>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={parts.length === 0}
            className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Import {parts.length} Parts
            {summary && summary.needsReview > 0 && ` (${summary.needsReview} need review)`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
