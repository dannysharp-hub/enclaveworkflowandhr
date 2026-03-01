import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseCsv, CsvPart } from "@/lib/csvParser";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (parts: CsvPart[]) => void;
}

export default function CsvImportDialog({ open, onOpenChange, onImport }: Props) {
  const [parts, setParts] = useState<CsvPart[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseCsv(text);
      setParts(result.parts);
      setErrors(result.errors);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    onImport(parts);
    onOpenChange(false);
    setParts([]);
    setErrors([]);
    setFileName("");
  };

  const handleClose = (o: boolean) => {
    if (!o) { setParts([]); setErrors([]); setFileName(""); }
    onOpenChange(o);
  };

  const inputClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground";

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
              Expected: Part ID, Product Code, Length, Width, Qty
            </p>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
          </div>

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

          {parts.length > 0 && (
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm text-foreground mb-2">
                <CheckCircle2 size={14} className="text-primary" />
                <span className="font-mono font-bold">{parts.length}</span> parts parsed
                <span className="text-muted-foreground">
                  ({parts.reduce((s, p) => s + p.quantity, 0)} total incl. qty)
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left py-1 font-mono">PART</th>
                      <th className="text-left py-1 font-mono">PRODUCT</th>
                      <th className="text-right py-1 font-mono">L×W</th>
                      <th className="text-right py-1 font-mono">QTY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.slice(0, 20).map((p, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1 font-mono text-foreground">{p.part_id}</td>
                        <td className="py-1 text-muted-foreground">{p.product_code}</td>
                        <td className="py-1 text-right font-mono text-muted-foreground">{p.length_mm}×{p.width_mm}</td>
                        <td className="py-1 text-right font-mono text-foreground">{p.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parts.length > 20 && (
                  <p className="text-[10px] text-muted-foreground mt-1">...and {parts.length - 20} more</p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={parts.length === 0}
            className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Import {parts.length} Parts
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
