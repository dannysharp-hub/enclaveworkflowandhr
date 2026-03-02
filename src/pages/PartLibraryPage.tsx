import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Upload, FileCheck, Trash2, Edit2, Save, X, Library, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useDxfExtraction } from "@/hooks/useDxfExtraction";
import DxfExtractionBadge from "@/components/DxfExtractionBadge";
import { extractFromDxfFile, DxfExtractionResult } from "@/lib/dxfExtractor";

interface LibraryPart {
  id: string;
  part_code: string;
  description: string | null;
  product_code: string | null;
  material_code: string | null;
  length_mm: number;
  width_mm: number;
  thickness_mm: number | null;
  grain_required: boolean;
  grain_axis: string | null;
  rotation_allowed: string | null;
  dxf_file_reference: string | null;
  tags: string[];
  version: number;
  active: boolean;
  bbox_width_mm: number | null;
  bbox_height_mm: number | null;
  bbox_source: string | null;
  bbox_confidence: string | null;
  bbox_extracted_at: string | null;
  extraction_notes: string | null;
}

const EMPTY_PART: Omit<LibraryPart, "id"> = {
  part_code: "",
  description: "",
  product_code: "",
  material_code: null,
  length_mm: 0,
  width_mm: 0,
  thickness_mm: null,
  grain_required: false,
  grain_axis: "L",
  rotation_allowed: "any",
  dxf_file_reference: null,
  tags: [],
  version: 1,
  active: true,
  bbox_width_mm: null,
  bbox_height_mm: null,
  bbox_source: null,
  bbox_confidence: null,
  bbox_extracted_at: null,
  extraction_notes: null,
};

export default function PartLibraryPage() {
  const [parts, setParts] = useState<LibraryPart[]>([]);
  const [materials, setMaterials] = useState<{ material_code: string; colour_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPart, setEditPart] = useState<Partial<LibraryPart> & typeof EMPTY_PART>(EMPTY_PART);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { flags } = useFeatureFlags();
  const [extractionResult, setExtractionResult] = useState<DxfExtractionResult | null>(null);
  const [useExtractedDims, setUseExtractedDims] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [partsRes, matsRes] = await Promise.all([
      supabase.from("part_library").select("*").eq("active", true).order("part_code"),
      supabase.from("material_products").select("material_code, colour_name").eq("active", true).order("material_code"),
    ]);
    setParts((partsRes.data as LibraryPart[]) ?? []);
    setMaterials((matsRes.data as any[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setEditId(null);
    setEditPart({ ...EMPTY_PART });
    setExtractionResult(null);
    setUseExtractedDims(false);
    setDialogOpen(true);
  };

  const openEdit = (p: LibraryPart) => {
    setEditId(p.id);
    setEditPart({ ...p });
    // If part has extraction data, reconstruct a result for display
    if (p.bbox_width_mm && p.bbox_height_mm) {
      setExtractionResult({
        bbox: {
          width_mm: p.bbox_width_mm,
          height_mm: p.bbox_height_mm,
          min_x: 0, min_y: 0,
          max_x: p.bbox_width_mm,
          max_y: p.bbox_height_mm,
        },
        bbox_confidence: (p.bbox_confidence as any) || "medium",
        polygon: null,
        polygon_confidence: null,
        outline_layer_used: null,
        notes: p.extraction_notes ? p.extraction_notes.split("; ") : [],
        entity_count: 0,
        has_closed_polylines: false,
        detected_units: "mm",
      });
      // If manual dims are 0, default to using extracted
      setUseExtractedDims(p.length_mm === 0 && p.width_mm === 0);
    } else {
      setExtractionResult(null);
      setUseExtractedDims(false);
    }
    setDialogOpen(true);
  };

  const handleDxfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editPart.part_code) return;
    setUploading(true);

    // Upload DXF file
    const path = `library/${editPart.part_code}.dxf`;
    const { error } = await supabase.storage.from("dxf-files").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    setEditPart(prev => ({ ...prev, dxf_file_reference: path }));

    // Auto-extract bounding box
    const result = await extractFromDxfFile(file, {
      enablePolygon: flags.enable_polygon_outline_extraction,
      defaultUnits: "mm",
    });
    setExtractionResult(result);

    if (result.bbox) {
      setEditPart(prev => ({
        ...prev,
        bbox_width_mm: result.bbox!.width_mm,
        bbox_height_mm: result.bbox!.height_mm,
        bbox_source: "dxf_extract",
        bbox_confidence: result.bbox_confidence,
        bbox_extracted_at: new Date().toISOString(),
        extraction_notes: result.notes.join("; ") || null,
      }));

      // Auto-fill manual dims if they're empty
      if (editPart.length_mm === 0 && editPart.width_mm === 0) {
        setEditPart(prev => ({
          ...prev,
          length_mm: result.bbox!.width_mm,
          width_mm: result.bbox!.height_mm,
        }));
        setUseExtractedDims(true);
      }
    }

    toast({ title: "DXF uploaded" });
    setUploading(false);
  };

  const handleReprocess = async () => {
    if (!editPart.dxf_file_reference) return;
    setReprocessing(true);

    try {
      const { data, error } = await supabase.storage.from("dxf-files").download(editPart.dxf_file_reference);
      if (error || !data) {
        toast({ title: "Cannot download DXF", variant: "destructive" });
        setReprocessing(false);
        return;
      }

      const file = new File([data], "reprocess.dxf");
      const result = await extractFromDxfFile(file, {
        enablePolygon: flags.enable_polygon_outline_extraction,
        defaultUnits: "mm",
      });
      setExtractionResult(result);

      if (result.bbox) {
        setEditPart(prev => ({
          ...prev,
          bbox_width_mm: result.bbox!.width_mm,
          bbox_height_mm: result.bbox!.height_mm,
          bbox_source: "dxf_extract",
          bbox_confidence: result.bbox_confidence,
          bbox_extracted_at: new Date().toISOString(),
          extraction_notes: result.notes.join("; ") || null,
        }));
      }
    } catch {
      toast({ title: "Reprocess failed", variant: "destructive" });
    } finally {
      setReprocessing(false);
    }
  };

  const handleSave = async () => {
    if (!editPart.part_code) {
      toast({ title: "Part code required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // If using extracted dims, apply them to length/width
      const finalLength = useExtractedDims && editPart.bbox_width_mm ? editPart.bbox_width_mm : editPart.length_mm;
      const finalWidth = useExtractedDims && editPart.bbox_height_mm ? editPart.bbox_height_mm : editPart.width_mm;

      const row: Record<string, any> = {
        part_code: editPart.part_code,
        description: editPart.description || null,
        product_code: editPart.product_code || null,
        material_code: editPart.material_code || null,
        length_mm: finalLength,
        width_mm: finalWidth,
        thickness_mm: editPart.thickness_mm,
        grain_required: editPart.grain_required,
        grain_axis: editPart.grain_axis,
        rotation_allowed: editPart.rotation_allowed,
        dxf_file_reference: editPart.dxf_file_reference,
        tags: editPart.tags,
        bbox_width_mm: editPart.bbox_width_mm,
        bbox_height_mm: editPart.bbox_height_mm,
        bbox_source: editPart.bbox_source,
        bbox_confidence: editPart.bbox_confidence,
        bbox_extracted_at: editPart.bbox_extracted_at,
        extraction_notes: editPart.extraction_notes,
      };

      if (editId) {
        const { error } = await supabase.from("part_library").update(row).eq("id", editId);
        if (error) throw error;

        // Audit log
        await supabase.from("dxf_extraction_log").insert({
          entity_type: "part_library",
          entity_id: editId,
          dxf_file_reference: editPart.dxf_file_reference,
          bbox_width_mm: editPart.bbox_width_mm,
          bbox_height_mm: editPart.bbox_height_mm,
          bbox_confidence: editPart.bbox_confidence,
          manual_override_exists: !useExtractedDims && finalLength > 0,
          notes: useExtractedDims ? "Using extracted dimensions" : "Manual dimensions preferred",
        } as any);
      } else {
        const { error } = await supabase.from("part_library").insert([{ ...row, part_code: editPart.part_code, tenant_id: "00000000-0000-0000-0000-000000000001" }] as any);
        if (error) throw error;
      }
      toast({ title: editId ? "Part updated" : "Part saved" });
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("part_library").update({ active: false }).eq("id", id);
    if (error) toast({ title: "Delete failed", variant: "destructive" });
    else {
      toast({ title: "Part archived" });
      fetchData();
    }
  };

  const filtered = parts.filter(p =>
    !search || p.part_code.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase()) ||
    p.product_code?.toLowerCase().includes(search.toLowerCase())
  );

  const inputClass = "h-8 rounded border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full";
  const selectClass = "h-8 rounded border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full appearance-none";

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-bold text-foreground flex items-center gap-2">
            <Library size={20} className="text-primary" /> Part Library
          </h2>
          <p className="text-sm text-muted-foreground">Reusable part definitions with DXF files & auto-extraction</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search parts..." className={`${inputClass} pl-8 w-48`} />
          </div>
          <Button size="sm" onClick={openNew}><Plus size={14} /> Add Part</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center animate-pulse">
            <span className="font-mono text-sm font-bold text-primary-foreground">E</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel border-border rounded-lg p-12 text-center">
          <Library size={40} className="mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm mb-3">No parts in library</p>
          <Button size="sm" onClick={openNew}><Plus size={14} /> Add First Part</Button>
        </div>
      ) : (
        <div className="glass-panel border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">CODE</th>
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">DESCRIPTION</th>
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">MATERIAL</th>
                  <th className="text-right px-3 py-2.5 font-mono text-[10px] text-muted-foreground">L×W (MANUAL)</th>
                  <th className="text-right px-3 py-2.5 font-mono text-[10px] text-muted-foreground">BBOX (DXF)</th>
                  <th className="text-center px-3 py-2.5 font-mono text-[10px] text-muted-foreground">CONF</th>
                  <th className="text-center px-3 py-2.5 font-mono text-[10px] text-muted-foreground">DXF</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const hasMismatch = p.bbox_width_mm && p.bbox_height_mm && p.length_mm > 0 && p.width_mm > 0 &&
                    (Math.abs(p.bbox_width_mm - p.length_mm) / p.length_mm > 0.02 ||
                     Math.abs(p.bbox_height_mm - p.width_mm) / p.width_mm > 0.02);

                  return (
                    <tr key={p.id} className={`border-b border-border/30 hover:bg-muted/10 transition-colors ${hasMismatch ? "bg-amber-500/5" : ""}`}>
                      <td className="px-3 py-2 font-mono text-xs font-bold text-foreground">{p.part_code}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.description || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.material_code || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{p.length_mm}×{p.width_mm}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                        {p.bbox_width_mm && p.bbox_height_mm
                          ? `${p.bbox_width_mm}×${p.bbox_height_mm}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.bbox_confidence ? (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            p.bbox_confidence === "high" ? "bg-primary/10 text-primary" :
                            p.bbox_confidence === "medium" ? "bg-amber-500/10 text-amber-600" :
                            "bg-destructive/10 text-destructive"
                          }`}>
                            {p.bbox_confidence}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.dxf_file_reference ? <FileCheck size={14} className="inline text-primary" /> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(p)} className="text-muted-foreground hover:text-primary transition-colors"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(p.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Part" : "Add Part to Library"}</DialogTitle>
            <DialogDescription>Define a reusable part with dimensions and CNC properties. Upload a DXF for automatic dimension extraction.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Part Code *</label>
              <input value={editPart.part_code} onChange={e => setEditPart(p => ({ ...p, part_code: e.target.value }))} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <input value={editPart.description || ""} onChange={e => setEditPart(p => ({ ...p, description: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Product Code</label>
              <input value={editPart.product_code || ""} onChange={e => setEditPart(p => ({ ...p, product_code: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Material</label>
              <select value={editPart.material_code || ""} onChange={e => setEditPart(p => ({ ...p, material_code: e.target.value || null }))} className={selectClass}>
                <option value="">—</option>
                {materials.map(m => <option key={m.material_code} value={m.material_code}>{m.material_code} — {m.colour_name || ""}</option>)}
              </select>
            </div>

            {/* DXF Upload Section */}
            <div className="col-span-2 border border-border/50 rounded-md p-3 space-y-2 bg-muted/5">
              <label className="text-xs font-medium text-foreground block">DXF File & Auto-Extraction</label>
              <div className="flex items-center gap-2">
                {editPart.dxf_file_reference ? (
                  <span className="flex items-center gap-1 text-xs text-primary"><FileCheck size={14} /> Uploaded</span>
                ) : (
                  <span className="text-xs text-muted-foreground">No DXF</span>
                )}
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading || !editPart.part_code}>
                  <Upload size={14} /> {uploading ? "Uploading..." : "Upload DXF"}
                </Button>
                <input ref={fileRef} type="file" accept=".dxf" onChange={handleDxfUpload} className="hidden" />
              </div>
              {extractionResult && (
                <DxfExtractionBadge
                  extraction={extractionResult}
                  manualWidth={editPart.length_mm}
                  manualHeight={editPart.width_mm}
                  useExtracted={useExtractedDims}
                  onToggleUseExtracted={(use) => {
                    setUseExtractedDims(use);
                    if (use && extractionResult.bbox) {
                      setEditPart(prev => ({
                        ...prev,
                        length_mm: extractionResult.bbox!.width_mm,
                        width_mm: extractionResult.bbox!.height_mm,
                      }));
                    }
                  }}
                  onReprocess={editPart.dxf_file_reference ? handleReprocess : undefined}
                  reprocessing={reprocessing}
                />
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Length (mm) {useExtractedDims && <span className="text-primary">(from DXF)</span>}</label>
              <input
                type="number"
                value={editPart.length_mm}
                onChange={e => {
                  setEditPart(p => ({ ...p, length_mm: +e.target.value }));
                  if (useExtractedDims) setUseExtractedDims(false);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Width (mm) {useExtractedDims && <span className="text-primary">(from DXF)</span>}</label>
              <input
                type="number"
                value={editPart.width_mm}
                onChange={e => {
                  setEditPart(p => ({ ...p, width_mm: +e.target.value }));
                  if (useExtractedDims) setUseExtractedDims(false);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Thickness (mm)</label>
              <input type="number" value={editPart.thickness_mm || ""} onChange={e => setEditPart(p => ({ ...p, thickness_mm: +e.target.value || null }))} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Rotation</label>
              <select value={editPart.rotation_allowed || "any"} onChange={e => setEditPart(p => ({ ...p, rotation_allowed: e.target.value }))} className={selectClass}>
                <option value="any">Any</option>
                <option value="none">None</option>
                <option value="90">90°</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={editPart.grain_required} onChange={e => setEditPart(p => ({ ...p, grain_required: e.target.checked }))} className="rounded border-input" />
              <label className="text-xs text-muted-foreground">Grain Required</label>
            </div>
            {editPart.grain_required && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Grain Axis</label>
                <select value={editPart.grain_axis || "L"} onChange={e => setEditPart(p => ({ ...p, grain_axis: e.target.value }))} className={selectClass}>
                  <option value="L">Length</option>
                  <option value="W">Width</option>
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}><Save size={14} /> {saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
