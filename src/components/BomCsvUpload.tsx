import { useState, useCallback, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, FileText, AlertTriangle, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BomCsvUploadProps {
  jobId: string;
  companyId: string;
  onSuccess: () => void;
}

interface ParsedPart {
  name: string;
  width: number | null;
  height: number | null;
  thickness: number | null;
  qty: number;
  material: string;
  valid: boolean;
}

const COLUMN_MAP: Record<string, keyof Pick<ParsedPart, "name" | "width" | "height" | "thickness" | "qty" | "material">> = {
  "part name": "name", "description": "name", "name": "name", "part": "name", "component": "name",
  "width": "width", "w": "width",
  "height": "height", "h": "height",
  "thickness": "thickness", "t": "thickness", "depth": "thickness", "d": "thickness",
  "quantity": "qty", "qty": "qty", "count": "qty",
  "material": "material", "board": "material", "sheet": "material",
};

function resolveColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    const field = COLUMN_MAP[key];
    if (field && !(field in map)) map[field] = i;
  });
  return map;
}

const TEMPLATE_CSV = `Part Name,Width,Height,Thickness,Quantity,Material
Base Panel,800,600,18,2,MFC White
Side Panel,600,720,18,4,MFC White
Shelf,760,400,18,6,MFC White
Door,397,715,18,4,Painted MDF
Drawer Front,797,140,18,3,Painted MDF
`;

export default function BomCsvUpload({ jobId, companyId, onSuccess }: BomCsvUploadProps) {
  const [parts, setParts] = useState<ParsedPart[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as string[][];
        if (rows.length < 2) {
          toast({ title: "CSV has no data rows", variant: "destructive" });
          return;
        }
        const colMap = resolveColumns(rows[0]);
        if (!("name" in colMap)) {
          toast({ title: "Could not detect a Name/Part Name/Description column", variant: "destructive" });
          return;
        }

        const parsed: ParsedPart[] = rows.slice(1).map(row => {
          const name = (colMap.name !== undefined ? row[colMap.name] : "")?.trim() || "";
          const width = colMap.width !== undefined ? parseFloat(row[colMap.width]) || null : null;
          const height = colMap.height !== undefined ? parseFloat(row[colMap.height]) || null : null;
          const thickness = colMap.thickness !== undefined ? parseFloat(row[colMap.thickness]) || null : null;
          const qty = colMap.qty !== undefined ? parseInt(row[colMap.qty]) || 1 : 1;
          const material = (colMap.material !== undefined ? row[colMap.material] : "")?.trim() || "";
          const valid = !!name && width !== null && height !== null && qty > 0;
          return { name, width, height, thickness, qty, material, valid };
        }).filter(p => p.name);

        setParts(parsed);
      },
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) parseFile(file);
    else toast({ title: "Please drop a .csv file", variant: "destructive" });
  }, [parseFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const validParts = parts.filter(p => p.valid);
  const invalidCount = parts.length - validParts.length;

  const handleImport = async () => {
    if (validParts.length === 0) return;
    setImporting(true);
    try {
      const items = validParts.map(p => ({
        job_id: jobId,
        company_id: companyId,
        name: p.name,
        spec: [
          p.width != null ? `W:${p.width}` : null,
          p.height != null ? `H:${p.height}` : null,
          p.thickness != null ? `T:${p.thickness}` : null,
        ].filter(Boolean).join(" "),
        qty: p.qty,
        category: p.material || "Sheet Material",
        status: "needed",
      }));

      const { error } = await (supabase.from("cab_buylist_items") as any).insert(items);
      if (error) throw error;

      toast({ title: `${items.length} parts imported` });
      setParts([]);
      setFileName(null);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bom-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setParts([]);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // No file selected yet — show drop zone
  if (parts.length === 0) {
    return (
      <div className="space-y-3">
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
          )}
        >
          <Upload size={28} className="text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drop a CSV file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Accepts .csv files with columns: Name, Width, Height, Thickness, Qty, Material
            </p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Download size={12} /> Download template CSV
        </button>
      </div>
    );
  }

  // Preview parsed parts
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{fileName}</span>
          <Badge variant="secondary" className="text-[10px]">{parts.length} rows</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={handleReset} className="h-7 w-7 p-0">
          <X size={14} />
        </Button>
      </div>

      {invalidCount > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
          <AlertTriangle size={14} className="text-destructive shrink-0" />
          <span className="text-xs text-destructive">
            {invalidCount} row{invalidCount > 1 ? "s" : ""} missing required fields (name, width, height, or qty) — will be skipped.
          </span>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-x-auto max-h-64 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">W × H × T (mm)</TableHead>
              <TableHead className="text-xs text-right">Qty</TableHead>
              <TableHead className="text-xs">Material</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parts.map((p, i) => (
              <TableRow key={i} className={cn(!p.valid && "opacity-40")}>
                <TableCell className="text-xs font-mono py-1.5">{p.name}</TableCell>
                <TableCell className="text-xs font-mono py-1.5">
                  {p.width ?? "—"} × {p.height ?? "—"} × {p.thickness ?? "—"}
                </TableCell>
                <TableCell className="text-xs font-mono py-1.5 text-right">{p.qty}</TableCell>
                <TableCell className="text-xs py-1.5">{p.material || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-2 justify-between">
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Download size={12} /> Download template CSV
        </button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleReset}>Cancel</Button>
          <Button size="sm" disabled={validParts.length === 0 || importing} onClick={handleImport}>
            {importing ? "Importing…" : `Import ${validParts.length} Parts`}
          </Button>
        </div>
      </div>
    </div>
  );
}
