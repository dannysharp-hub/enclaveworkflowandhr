import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Download, Save, Plus, FileSpreadsheet, AlertTriangle, CheckCircle2, Package, ClipboardCheck, Library } from "lucide-react";
import CsvImportDialog from "@/components/CsvImportDialog";
import PartRow from "@/components/PartRow";
import PartLibraryPicker from "@/components/PartLibraryPicker";
import NestingGroupsPanel from "@/components/NestingGroupsPanel";
import { CsvPart } from "@/lib/csvParser";
import { generateVCarveJobPack } from "@/lib/vcarveExport";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import JobFinancePanel from "@/components/JobFinancePanel";
import JobIssuesPanel from "@/components/JobIssuesPanel";
import JobCardPanel from "@/components/JobCardPanel";

interface PartData {
  id?: string;
  part_id: string;
  product_code: string;
  length_mm: number;
  width_mm: number;
  quantity: number;
  material_code: string | null;
  grain_required: boolean;
  grain_axis: string | null;
  rotation_allowed: string | null;
  dxf_file_reference: string | null;
  validation_status: string | null;
}

interface JobInfo {
  id: string;
  job_id: string;
  job_name: string;
  status: string;
}

export default function JobBuilderPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { flags } = useFeatureFlags();
  const canEdit = ["admin", "engineer", "supervisor"].includes(userRole || "");

  const [job, setJob] = useState<JobInfo | null>(null);
  const [parts, setParts] = useState<PartData[]>([]);
  const [materials, setMaterials] = useState<{ material_code: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fullMaterials, setFullMaterials] = useState<any[]>([]);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);

    const [jobRes, partsRes, matsRes] = await Promise.all([
      supabase.from("jobs").select("id, job_id, job_name, status").eq("id", jobId).single(),
      supabase.from("parts").select("*").eq("job_id", jobId).order("part_id"),
      supabase.from("materials").select("*").eq("active", true).order("material_code"),
    ]);

    if (jobRes.data) setJob(jobRes.data as JobInfo);
    if (partsRes.data) setParts(partsRes.data as PartData[]);
    const allMats = (matsRes.data as any[]) ?? [];
    setMaterials(allMats.map(m => ({ material_code: m.material_code, display_name: m.display_name })));
    setFullMaterials(allMats);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Apply product mappings to resolve material and grain defaults
  const applyProductMappings = useCallback(async (importedParts: CsvPart[]) => {
    const productCodes = [...new Set(importedParts.map(p => p.product_code))];
    const { data: mappings } = await supabase
      .from("product_mappings")
      .select("*")
      .in("product_code", productCodes);

    const mappingMap = new Map((mappings ?? []).map((m: any) => [m.product_code, m]));

    return importedParts.map(p => {
      const mapping = mappingMap.get(p.product_code);
      return {
        part_id: p.part_id,
        product_code: p.product_code,
        length_mm: p.length_mm,
        width_mm: p.width_mm,
        quantity: p.quantity,
        material_code: p.material_code || mapping?.material_code || null,
        grain_required: p.grain_required ?? mapping?.default_grain_required ?? false,
        grain_axis: p.grain_axis || mapping?.default_grain_axis || "L",
        rotation_allowed: p.rotation_allowed || mapping?.default_rotation_allowed || "any",
        dxf_file_reference: null,
        validation_status: "pending",
      } as PartData;
    });
  }, []);

  const handleCsvImport = useCallback(async (csvParts: CsvPart[]) => {
    const resolved = await applyProductMappings(csvParts);
    setParts(prev => {
      const existingIds = new Set(prev.map(p => p.part_id));
      const newParts = resolved.filter(p => !existingIds.has(p.part_id));
      if (newParts.length < resolved.length) {
        toast({ title: "Duplicates skipped", description: `${resolved.length - newParts.length} parts already exist` });
      }
      return [...prev, ...newParts];
    });
    toast({ title: "Parts imported", description: `${csvParts.length} parts added` });
  }, [applyProductMappings]);

  const handlePartUpdate = useCallback((partId: string, updates: Partial<PartData>) => {
    setParts(prev => prev.map(p => p.part_id === partId ? { ...p, ...updates } : p));
  }, []);

  const handlePartDelete = useCallback((partId: string) => {
    setParts(prev => prev.filter(p => p.part_id !== partId));
  }, []);

  const handleBulkPartUpdate = useCallback((updates: { part_id: string; changes: Record<string, any> }[]) => {
    setParts(prev => prev.map(p => {
      const upd = updates.find(u => u.part_id === p.part_id);
      return upd ? { ...p, ...upd.changes } : p;
    }));
  }, []);

  const addBlankPart = useCallback(() => {
    const nextNum = parts.length + 1;
    setParts(prev => [...prev, {
      part_id: `P${String(nextNum).padStart(3, "0")}`,
      product_code: "",
      length_mm: 0,
      width_mm: 0,
      quantity: 1,
      material_code: null,
      grain_required: false,
      grain_axis: "L",
      rotation_allowed: "any",
      dxf_file_reference: null,
      validation_status: "pending",
    }]);
  }, [parts.length]);

  const saveParts = useCallback(async () => {
    if (!job) return;
    setSaving(true);
    try {
      // Delete existing parts for this job, then insert fresh
      await supabase.from("parts").delete().eq("job_id", job.id);

      if (parts.length > 0) {
        const rows = parts.map(p => ({
          job_id: job.id,
          part_id: p.part_id,
          product_code: p.product_code || "UNKNOWN",
          length_mm: p.length_mm,
          width_mm: p.width_mm,
          quantity: p.quantity,
          material_code: p.material_code,
          grain_required: p.grain_required,
          grain_axis: p.grain_axis,
          rotation_allowed: p.rotation_allowed,
          dxf_file_reference: p.dxf_file_reference,
          validation_status: p.validation_status,
        }));
        const { error } = await supabase.from("parts").insert(rows);
        if (error) throw error;
      }

      // Update job parts count
      await supabase.from("jobs").update({
        parts_count: parts.reduce((s, p) => s + p.quantity, 0),
        materials_count: new Set(parts.map(p => p.material_code).filter(Boolean)).size,
      }).eq("id", job.id);

      toast({ title: "Saved", description: `${parts.length} parts saved to ${job.job_id}` });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [job, parts]);

  const handleLibrarySelect = useCallback((libParts: any[]) => {
    const newParts: PartData[] = libParts.map((lp, i) => ({
      part_id: lp.part_code || `LP${String(parts.length + i + 1).padStart(3, "0")}`,
      product_code: lp.product_code || "",
      length_mm: lp.length_mm,
      width_mm: lp.width_mm,
      quantity: 1,
      material_code: lp.material_code,
      grain_required: lp.grain_required,
      grain_axis: lp.grain_axis,
      rotation_allowed: lp.rotation_allowed,
      dxf_file_reference: lp.dxf_file_reference,
      validation_status: "pending",
    }));
    setParts(prev => {
      const existingIds = new Set(prev.map(p => p.part_id));
      const unique = newParts.filter(p => !existingIds.has(p.part_id));
      return [...prev, ...unique];
    });
    toast({ title: "Parts added from library", description: `${newParts.length} parts` });
  }, [parts.length]);

  const handleExport = useCallback(async () => {
    if (!job) return;
    const invalid = parts.filter(p => !p.material_code || p.length_mm <= 0 || p.width_mm <= 0);
    if (invalid.length > 0) {
      toast({ title: "Validation errors", description: `${invalid.length} parts have issues. Fix before exporting.`, variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      // Build nesting groups from parts + material data
      const byMat = new Map<string, PartData[]>();
      for (const p of parts) {
        const key = p.material_code || "UNKNOWN";
        if (!byMat.has(key)) byMat.set(key, []);
        byMat.get(key)!.push(p);
      }

      const groups = Array.from(byMat.entries()).map(([mat, matParts]) => {
        const matDef = fullMaterials.find((m: any) => m.material_code === mat);
        const totalArea = matParts.reduce((s, p) => s + (p.length_mm * p.width_mm * p.quantity), 0);
        const sheetArea = (matDef?.sheet_length_mm || 2440) * (matDef?.sheet_width_mm || 1220);
        const estSheets = Math.max(1, Math.ceil((totalArea * 1.15) / sheetArea));

        return {
          group_id: crypto.randomUUID(),
          group_label: mat,
          material_code: mat,
          thickness_mm: matDef?.thickness_mm || null,
          colour_name: matDef?.colour_name || null,
          sheet_length_mm: matDef?.sheet_length_mm || 2440,
          sheet_width_mm: matDef?.sheet_width_mm || 1220,
          margin_mm: 10,
          spacing_mm: 8,
          allow_rotation_90: !matParts.some(p => p.rotation_allowed === "none"),
          allow_mirror: false,
          grain_direction: matDef?.grain_direction || "length",
          nest_method: "by_area",
          keep_parts_together: false,
          prioritise_grain_parts: true,
          toolpath_template_name: null,
          parts: matParts,
          planned_sheets: Array.from({ length: estSheets }, (_, i) => ({
            sheet_id: crypto.randomUUID(),
            sheet_number: i + 1,
            qr_payload: `${job.job_id}_${mat}_S${i + 1}`,
          })),
        };
      });

      await generateVCarveJobPack({
        jobId: job.id,
        jobCode: job.job_id,
        jobName: job.job_name,
        groups,
      });
      toast({ title: "VCarve Job Pack exported", description: `${job.job_id}_VCarve_Pack.zip downloaded` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }, [job, parts, fullMaterials]);

  const validCount = parts.filter(p => p.material_code && p.length_mm > 0 && p.width_mm > 0).length;
  const invalidCount = parts.length - validCount;
  const totalQty = parts.reduce((s, p) => s + p.quantity, 0);
  const uniqueMaterials = new Set(parts.map(p => p.material_code).filter(Boolean)).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center animate-pulse">
          <span className="font-mono text-sm font-bold text-primary-foreground">E</span>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Job not found</p>
        <Link to="/jobs" className="text-primary text-sm hover:underline mt-2 inline-block">← Back to Jobs</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/jobs")} className="h-9 w-9 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="font-mono text-xl font-bold text-foreground">{job.job_id}</h2>
            <p className="text-sm text-muted-foreground">{job.job_name} · Job Builder</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <>
              <button onClick={() => setLibraryPickerOpen(true)} className="flex items-center gap-2 h-9 px-3 rounded-md border border-border text-sm text-foreground hover:bg-muted/20 transition-colors">
                <Library size={14} /> From Library
              </button>
              <button onClick={() => setCsvDialogOpen(true)} className="flex items-center gap-2 h-9 px-3 rounded-md border border-border text-sm text-foreground hover:bg-muted/20 transition-colors">
                <FileSpreadsheet size={14} /> Import CSV
              </button>
              <button onClick={addBlankPart} className="flex items-center gap-2 h-9 px-3 rounded-md border border-border text-sm text-foreground hover:bg-muted/20 transition-colors">
                <Plus size={14} /> Add Part
              </button>
              <button onClick={saveParts} disabled={saving} className="flex items-center gap-2 h-9 px-3 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                <Save size={14} /> {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
          <button onClick={handleExport} disabled={exporting || parts.length === 0} className="flex items-center gap-2 h-9 px-3 rounded-md border border-primary text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50">
            <Download size={14} /> {exporting ? "Exporting..." : "VCarve Job Pack"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{parts.length}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">UNIQUE PARTS</p>
        </div>
        <div className="glass-panel border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{totalQty}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">TOTAL QTY</p>
        </div>
        <div className="glass-panel border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{uniqueMaterials}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">MATERIALS</p>
        </div>
        <div className="glass-panel border-border rounded-lg p-4 text-center">
          {invalidCount > 0 ? (
            <>
              <p className="text-2xl font-mono font-bold text-destructive">{invalidCount}</p>
              <p className="text-[10px] font-mono text-destructive tracking-wide">ISSUES</p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-1">
                <CheckCircle2 size={18} className="text-primary" />
              </div>
              <p className="text-[10px] font-mono text-primary tracking-wide mt-1">ALL VALID</p>
            </>
          )}
        </div>
      </div>

      {/* Parts Table */}
      {parts.length === 0 ? (
        <div className="glass-panel border-border rounded-lg p-12 text-center">
          <Package size={40} className="mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm mb-3">No parts yet</p>
          {canEdit && (
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setCsvDialogOpen(true)} className="flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                <FileSpreadsheet size={14} /> Import CSV
              </button>
              <button onClick={addBlankPart} className="flex items-center gap-2 h-9 px-4 rounded-md border border-border text-sm text-foreground hover:bg-muted/20 transition-colors">
                <Plus size={14} /> Add Manually
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-panel border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">PART</th>
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">PRODUCT</th>
                  <th className="text-right px-3 py-2.5 font-mono text-[10px] text-muted-foreground">LENGTH</th>
                  <th className="text-right px-3 py-2.5 font-mono text-[10px] text-muted-foreground">WIDTH</th>
                  <th className="text-right px-3 py-2.5 font-mono text-[10px] text-muted-foreground">QTY</th>
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">MATERIAL</th>
                  <th className="text-center px-3 py-2.5 font-mono text-[10px] text-muted-foreground">GRAIN</th>
                  <th className="text-center px-3 py-2.5 font-mono text-[10px] text-muted-foreground">AXIS</th>
                  <th className="text-center px-3 py-2.5 font-mono text-[10px] text-muted-foreground">ROTATE</th>
                  <th className="text-center px-3 py-2.5 font-mono text-[10px] text-muted-foreground">DXF</th>
                  <th className="text-center px-3 py-2.5 font-mono text-[10px] text-muted-foreground">STATUS</th>
                  {canEdit && <th className="px-3 py-2.5"></th>}
                </tr>
              </thead>
              <tbody>
                {parts.map(part => (
                  <PartRow
                    key={part.part_id}
                    part={part}
                    materials={materials}
                    jobUuid={job.id}
                    onUpdate={handlePartUpdate}
                    onDelete={handlePartDelete}
                    readOnly={!canEdit}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {invalidCount > 0 && (
            <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20 flex items-center gap-2">
              <AlertTriangle size={14} className="text-destructive" />
              <span className="text-xs text-destructive">{invalidCount} part{invalidCount > 1 ? "s" : ""} with validation issues — fix before exporting</span>
            </div>
          )}
        </div>
      )}

      {/* Nesting Groups Panel */}
      {parts.length > 0 && (
        <NestingGroupsPanel jobId={job.id} parts={parts} materials={fullMaterials} onUpdateParts={handleBulkPartUpdate} />
      )}

      {/* Job Cards Panel */}
      {job && <JobCardPanel jobId={job.id} jobCode={job.job_id} readOnly={!canEdit} />}

      {/* Issues Panel */}
      {job && <JobIssuesPanel jobId={job.id} jobCode={job.job_id} readOnly={!canEdit} />}

      {/* Finance Panel */}
      {flags.enable_finance && job && (
        <JobFinancePanel jobId={job.id} jobCode={job.job_id} />
      )}

      {/* Install Sign-Off Link */}
      {canEdit && job && (
        <button onClick={() => navigate(`/jobs/${job.id}/install-signoff`)}
          className="flex items-center gap-2 px-4 py-3 rounded-md border border-border text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors w-full justify-center">
          <ClipboardCheck size={16} /> Complete Install Sign-Off
        </button>
      )}

      <CsvImportDialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen} onImport={handleCsvImport} />
      <PartLibraryPicker open={libraryPickerOpen} onOpenChange={setLibraryPickerOpen} onSelect={handleLibrarySelect} />
    </div>
  );
}
