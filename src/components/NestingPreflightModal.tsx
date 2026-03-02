import { useState, useRef } from "react";
import { AlertTriangle, Download, Upload, CheckCircle2, X, Edit2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  DimIssue,
  ValidationResult,
  exportMissingDimsCsv,
  parseDimsCsv,
  DimUpdate,
} from "@/lib/dimensionValidation";

interface PartData {
  part_id: string;
  product_code: string;
  length_mm: number;
  width_mm: number;
  quantity: number;
  grain_required: boolean;
  grain_axis: string | null;
  rotation_allowed: string | null;
  dxf_file_reference: string | null;
  library_part_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validation: ValidationResult;
  parts: PartData[];
  onUpdateParts: (updates: { part_id: string; changes: Record<string, any> }[]) => void;
}

type TabMode = "issues" | "bulk" | "csv";

export default function NestingPreflightModal({ open, onOpenChange, validation, parts, onUpdateParts }: Props) {
  const [tab, setTab] = useState<TabMode>("issues");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWidth, setBulkWidth] = useState("");
  const [bulkHeight, setBulkHeight] = useState("");
  const [bulkGrain, setBulkGrain] = useState<string>("");
  const [bulkRotation, setBulkRotation] = useState<string>("");
  const [csvDiff, setCsvDiff] = useState<DimUpdate[] | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const issuesWithMissing = validation.issues.filter(i => i.missing_fields.length > 0 || i.blockers.length > 0);
  const issuesWithWarnings = validation.issues.filter(i => i.warnings.length > 0 && i.missing_fields.length === 0 && i.blockers.length === 0);

  const toggleSelect = (partId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  };

  const selectAllMissing = () => {
    setSelected(new Set(issuesWithMissing.map(i => i.part_id)));
  };

  const applyBulk = () => {
    if (selected.size === 0) {
      toast({ title: "No parts selected", variant: "destructive" });
      return;
    }
    const updates: { part_id: string; changes: Record<string, any> }[] = [];
    for (const partId of selected) {
      const changes: Record<string, any> = {};
      const w = parseFloat(bulkWidth);
      const h = parseFloat(bulkHeight);
      if (!isNaN(w) && w > 0) changes.length_mm = w;
      if (!isNaN(h) && h > 0) changes.width_mm = h;
      if (bulkGrain === "true") changes.grain_required = true;
      if (bulkGrain === "false") changes.grain_required = false;
      if (bulkRotation) changes.rotation_allowed = bulkRotation;
      if (Object.keys(changes).length > 0) {
        updates.push({ part_id: partId, changes });
      }
    }
    if (updates.length > 0) {
      onUpdateParts(updates);
      toast({ title: "Bulk update applied", description: `${updates.length} parts updated` });
      setSelected(new Set());
      setBulkWidth("");
      setBulkHeight("");
    }
  };

  const handleExportCsv = () => {
    const csv = exportMissingDimsCsv(issuesWithMissing);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "missing_dimensions.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseDimsCsv(text, parts as any);
      setCsvDiff(result.updates);
      setCsvErrors(result.errors);
    };
    reader.readAsText(file);
  };

  const applyCsvDiff = () => {
    if (!csvDiff || csvDiff.length === 0) return;
    const updates = csvDiff.map(u => ({
      part_id: u.part_id,
      changes: Object.fromEntries(u.changes.map(c => [c.field, c.new_value])),
    }));
    onUpdateParts(updates);
    toast({ title: "CSV import applied", description: `${updates.length} parts updated` });
    setCsvDiff(null);
    setCsvErrors([]);
  };

  const inputClass = "h-7 rounded border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full";
  const selectClass = "h-7 rounded border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full appearance-none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-destructive" />
            Pre-Flight Validation
          </DialogTitle>
          <DialogDescription>
            Fix missing or invalid dimensions before running the nesting engine.
          </DialogDescription>
        </DialogHeader>

        {/* Summary Banner */}
        <div className="flex gap-3 text-xs font-mono">
          {validation.totalMissing > 0 && (
            <span className="px-2 py-1 rounded bg-destructive/10 text-destructive">
              {validation.totalMissing} missing data
            </span>
          )}
          {validation.totalBlockers > 0 && (
            <span className="px-2 py-1 rounded bg-destructive/10 text-destructive">
              {validation.totalBlockers} blockers
            </span>
          )}
          {validation.totalWarnings > 0 && (
            <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-600">
              {validation.totalWarnings} warnings
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["issues", "bulk", "csv"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-mono transition-colors border-b-2 ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "issues" ? "Issues" : t === "bulk" ? "Bulk Fix" : "CSV Import"}
            </button>
          ))}
        </div>

        {/* Issues Tab */}
        {tab === "issues" && (
          <div className="space-y-3">
            {issuesWithMissing.length > 0 && (
              <div>
                <h4 className="text-xs font-mono font-bold text-destructive mb-2">
                  ❌ Blocking Issues ({issuesWithMissing.length})
                </h4>
                <div className="overflow-x-auto border border-border rounded">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left px-2 py-1.5 font-mono text-muted-foreground">PART</th>
                        <th className="text-left px-2 py-1.5 font-mono text-muted-foreground">PRODUCT</th>
                        <th className="text-center px-2 py-1.5 font-mono text-muted-foreground">DXF</th>
                        <th className="text-right px-2 py-1.5 font-mono text-muted-foreground">W</th>
                        <th className="text-right px-2 py-1.5 font-mono text-muted-foreground">H</th>
                        <th className="text-right px-2 py-1.5 font-mono text-muted-foreground">QTY</th>
                        <th className="text-left px-2 py-1.5 font-mono text-muted-foreground">MISSING</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issuesWithMissing.map(i => (
                        <tr key={i.part_id} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="px-2 py-1.5 font-mono font-bold text-foreground">{i.part_id}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{i.product_code || "—"}</td>
                          <td className="px-2 py-1.5 text-center">{i.dxf_present ? "✓" : "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                            {i.width_mm > 0 ? i.width_mm : <span className="text-destructive">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                            {i.height_mm > 0 ? i.height_mm : <span className="text-destructive">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">{i.quantity || <span className="text-destructive">—</span>}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-wrap gap-1">
                              {i.missing_fields.map(f => (
                                <span key={f} className="px-1 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-mono">{f}</span>
                              ))}
                              {i.blockers.map((b, idx) => (
                                <span key={idx} className="px-1 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-mono">{b}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {issuesWithWarnings.length > 0 && (
              <div>
                <h4 className="text-xs font-mono font-bold text-yellow-600 mb-2">
                  ⚠️ Warnings ({issuesWithWarnings.length})
                </h4>
                <div className="space-y-1">
                  {issuesWithWarnings.map(i => (
                    <div key={i.part_id} className="flex items-center gap-2 px-2 py-1 rounded bg-yellow-500/5 text-xs">
                      <span className="font-mono font-bold text-foreground">{i.part_id}</span>
                      <span className="text-yellow-600">{i.warnings.join("; ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={issuesWithMissing.length === 0}>
                <Download size={14} /> Export Missing CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTab("bulk")}>
                <Edit2 size={14} /> Bulk Fix
              </Button>
            </div>
          </div>
        )}

        {/* Bulk Fix Tab */}
        {tab === "bulk" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">
                {selected.size} part{selected.size !== 1 ? "s" : ""} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={selectAllMissing} className="text-xs h-7">
                  Select all missing
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-xs h-7">
                  Clear
                </Button>
              </div>
            </div>

            {/* Selection Table */}
            <div className="overflow-x-auto border border-border rounded max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50">
                  <tr className="border-b border-border">
                    <th className="px-2 py-1.5 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === issuesWithMissing.length && issuesWithMissing.length > 0}
                        onChange={() => {
                          if (selected.size === issuesWithMissing.length) setSelected(new Set());
                          else selectAllMissing();
                        }}
                        className="rounded border-input"
                      />
                    </th>
                    <th className="text-left px-2 py-1.5 font-mono text-muted-foreground">PART</th>
                    <th className="text-right px-2 py-1.5 font-mono text-muted-foreground">W</th>
                    <th className="text-right px-2 py-1.5 font-mono text-muted-foreground">H</th>
                    <th className="text-center px-2 py-1.5 font-mono text-muted-foreground">GRAIN</th>
                    <th className="text-center px-2 py-1.5 font-mono text-muted-foreground">ROTATE</th>
                  </tr>
                </thead>
                <tbody>
                  {issuesWithMissing.map(i => (
                    <tr key={i.part_id} className={`border-b border-border/30 cursor-pointer hover:bg-muted/10 ${selected.has(i.part_id) ? "bg-primary/5" : ""}`}
                      onClick={() => toggleSelect(i.part_id)}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={selected.has(i.part_id)} readOnly className="rounded border-input" />
                      </td>
                      <td className="px-2 py-1.5 font-mono font-bold text-foreground">{i.part_id}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{i.width_mm > 0 ? i.width_mm : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{i.height_mm > 0 ? i.height_mm : "—"}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{i.grain_required ? "Yes" : "No"}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{i.rotation_allowed || "any"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bulk Values */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded border border-border bg-muted/10">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground mb-1 block">Width (mm)</label>
                <input value={bulkWidth} onChange={e => setBulkWidth(e.target.value)} type="number" className={inputClass} placeholder="e.g. 600" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground mb-1 block">Height (mm)</label>
                <input value={bulkHeight} onChange={e => setBulkHeight(e.target.value)} type="number" className={inputClass} placeholder="e.g. 300" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground mb-1 block">Grain Required</label>
                <select value={bulkGrain} onChange={e => setBulkGrain(e.target.value)} className={selectClass}>
                  <option value="">— keep —</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground mb-1 block">Rotation</label>
                <select value={bulkRotation} onChange={e => setBulkRotation(e.target.value)} className={selectClass}>
                  <option value="">— keep —</option>
                  <option value="any">Any</option>
                  <option value="none">None</option>
                  <option value="90">90°</option>
                </select>
              </div>
            </div>

            <Button size="sm" onClick={applyBulk} disabled={selected.size === 0}>
              Apply to {selected.size} selected
            </Button>
          </div>
        )}

        {/* CSV Import Tab */}
        {tab === "csv" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleExportCsv}>
                <Download size={14} /> Export Template
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Upload CSV
              </Button>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
            </div>

            {csvErrors.length > 0 && (
              <div className="rounded border border-destructive/30 bg-destructive/5 p-2 space-y-1">
                {csvErrors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle size={12} /> {e}
                  </p>
                ))}
              </div>
            )}

            {csvDiff && csvDiff.length > 0 && (
              <div>
                <h4 className="text-xs font-mono font-bold text-foreground mb-2">
                  Preview Changes ({csvDiff.length} parts)
                </h4>
                <div className="overflow-x-auto border border-border rounded max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr className="border-b border-border">
                        <th className="text-left px-2 py-1.5 font-mono text-muted-foreground">PART</th>
                        <th className="text-left px-2 py-1.5 font-mono text-muted-foreground">MATCHED BY</th>
                        <th className="text-left px-2 py-1.5 font-mono text-muted-foreground">FIELD</th>
                        <th className="text-right px-2 py-1.5 font-mono text-muted-foreground">OLD</th>
                        <th className="text-right px-2 py-1.5 font-mono text-muted-foreground">NEW</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvDiff.flatMap(u =>
                        u.changes.map((c, ci) => (
                          <tr key={`${u.part_id}-${ci}`} className="border-b border-border/30">
                            <td className="px-2 py-1.5 font-mono font-bold text-foreground">{ci === 0 ? u.part_id : ""}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{ci === 0 ? u.matched_by : ""}</td>
                            <td className="px-2 py-1.5 font-mono text-muted-foreground">{c.field}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{String(c.old_value)}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-primary font-bold">{String(c.new_value)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={applyCsvDiff}>
                    <CheckCircle2 size={14} /> Confirm & Apply
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setCsvDiff(null); setCsvErrors([]); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {csvDiff && csvDiff.length === 0 && csvErrors.length === 0 && (
              <p className="text-xs text-muted-foreground">No changes detected in uploaded CSV.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
