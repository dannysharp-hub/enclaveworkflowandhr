import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Layers, RefreshCw, Cpu, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nestParts, NestPart, NestSettings, NestResult } from "@/lib/nestingEngine";
import NestingPreview from "@/components/NestingPreview";
import { generateInternalNestPack } from "@/lib/internalNestExport";

interface PartData {
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
}

interface NestingGroup {
  id?: string;
  group_label: string;
  material_code: string;
  thickness_mm: number | null;
  colour_name: string | null;
  sheet_length_mm: number;
  sheet_width_mm: number;
  margin_mm: number;
  spacing_mm: number;
  allow_rotation_90: boolean;
  grain_direction: string;
  nesting_engine: "vcarve" | "internal";
  sort_strategy: string;
  optimisation_runs: number;
  locked: boolean;
  parts: PartData[];
  sheet_count: number;
}

interface Props {
  jobId: string;
  parts: PartData[];
  materials: { material_code: string; display_name: string; sheet_length_mm?: number; sheet_width_mm?: number; grain_direction?: string; thickness_mm?: number; colour_name?: string }[];
}

export default function NestingGroupsPanel({ jobId, parts, materials }: Props) {
  const [groups, setGroups] = useState<NestingGroup[]>([]);
  const [previewGroup, setPreviewGroup] = useState<string | null>(null);
  const [nestResult, setNestResult] = useState<NestResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const buildGroups = useCallback(() => {
    const byMat = new Map<string, PartData[]>();
    for (const p of parts) {
      const key = p.material_code || "UNASSIGNED";
      if (!byMat.has(key)) byMat.set(key, []);
      byMat.get(key)!.push(p);
    }

    const result: NestingGroup[] = [];
    for (const [mat, matParts] of byMat) {
      const matDef = materials.find(m => m.material_code === mat);
      const totalArea = matParts.reduce((s, p) => s + (p.length_mm * p.width_mm * p.quantity), 0);
      const sheetArea = (matDef?.sheet_length_mm || 2440) * (matDef?.sheet_width_mm || 1220);
      const estSheets = Math.max(1, Math.ceil((totalArea * 1.15) / sheetArea));
      const hasNoRotate = matParts.some(p => p.rotation_allowed === "none");

      result.push({
        group_label: mat,
        material_code: mat,
        thickness_mm: matDef?.thickness_mm || null,
        colour_name: matDef?.colour_name || null,
        sheet_length_mm: matDef?.sheet_length_mm || 2440,
        sheet_width_mm: matDef?.sheet_width_mm || 1220,
        margin_mm: 10,
        spacing_mm: 8,
        allow_rotation_90: !hasNoRotate,
        grain_direction: matDef?.grain_direction || "length",
        nesting_engine: "vcarve",
        sort_strategy: "largest_first",
        optimisation_runs: 1,
        locked: false,
        parts: matParts,
        sheet_count: estSheets,
      });
    }
    setGroups(result);
  }, [parts, materials]);

  useEffect(() => { buildGroups(); }, [buildGroups]);

  const toggleEngine = (groupLabel: string) => {
    setGroups(prev => prev.map(g =>
      g.group_label === groupLabel
        ? { ...g, nesting_engine: g.nesting_engine === "vcarve" ? "internal" : "vcarve" }
        : g
    ));
  };

  const runInternalNest = (group: NestingGroup) => {
    const nestPart: NestPart[] = group.parts.map(p => ({
      part_id: p.part_id,
      width_mm: p.length_mm,
      height_mm: p.width_mm,
      quantity: p.quantity,
      grain_required: p.grain_required,
      rotation_allowed: p.rotation_allowed !== "none",
      dxf_ref: p.dxf_file_reference,
    }));

    const settings: NestSettings = {
      sheet_width_mm: group.sheet_width_mm,
      sheet_length_mm: group.sheet_length_mm,
      margin_mm: group.margin_mm,
      spacing_mm: group.spacing_mm,
      grain_direction: group.grain_direction as "length" | "width",
      sort_strategy: "largest_first",
      optimisation_runs: group.optimisation_runs,
    };

    const result = nestParts(nestPart, settings);
    setNestResult(result);
    setPreviewGroup(group.group_label);
  };

  const commitLayout = async (group: NestingGroup) => {
    if (!nestResult || !nestResult.success) return;
    setCommitting(true);

    try {
      for (const sheet of nestResult.sheets) {
        const { data: layout, error: layoutErr } = await supabase
          .from("job_sheet_layouts")
          .insert({
            job_id: jobId,
            group_id: group.id || jobId, // fallback
            sheet_number: sheet.sheet_number,
            sheet_width_mm: group.sheet_width_mm,
            sheet_length_mm: group.sheet_length_mm,
            margin_mm: group.margin_mm,
            spacing_mm: group.spacing_mm,
            grain_direction: group.grain_direction,
            algorithm_used: nestResult.algorithm,
            utilisation_percent: sheet.utilisation_percent,
            waste_area_mm2: sheet.waste_area_mm2,
          } as any)
          .select("id")
          .single();

        if (layoutErr) throw layoutErr;

        const partRows = sheet.placements.map(p => ({
          layout_id: layout.id,
          part_id: p.part_id,
          qty_instance_index: p.instance_index,
          x_mm: p.x_mm,
          y_mm: p.y_mm,
          rotation_deg: p.rotation_deg,
          width_mm: p.width_mm,
          height_mm: p.height_mm,
          grain_locked: p.grain_locked,
          source_dxf_ref: group.parts.find(gp => gp.part_id === p.part_id)?.dxf_file_reference || null,
        }));

        const { error: partsErr } = await supabase
          .from("job_sheet_parts")
          .insert(partRows as any);

        if (partsErr) throw partsErr;
      }

      // Log the nesting run
      await supabase.from("nesting_runs").insert({
        job_id: jobId,
        group_id: group.id || jobId,
        status: "success",
        algorithm_variant: nestResult.algorithm,
        utilisation_percent: nestResult.total_utilisation_percent,
        sheet_count: nestResult.total_sheets,
        completed_at: new Date().toISOString(),
        output_summary_json: {
          total_placements: nestResult.sheets.reduce((s, sh) => s + sh.placements.length, 0),
          warnings: nestResult.warnings,
        },
      } as any);

      // Mark group as locked
      setGroups(prev => prev.map(g =>
        g.group_label === group.group_label ? { ...g, locked: true } : g
      ));

      toast({ title: "Layout committed", description: `${nestResult.total_sheets} sheets locked for ${group.group_label}` });
      setPreviewGroup(null);
      setNestResult(null);
    } catch (err: any) {
      toast({ title: "Commit failed", description: err.message, variant: "destructive" });
    } finally {
      setCommitting(false);
    }
  };

  const handleExport = async (group: NestingGroup) => {
    if (!nestResult) return;
    setExporting(true);
    try {
      await generateInternalNestPack({
        jobId,
        jobCode: jobId,
        groupLabel: group.group_label,
        materialCode: group.material_code,
        thickness: group.thickness_mm,
        colour: group.colour_name,
        sheetWidth: group.sheet_width_mm,
        sheetLength: group.sheet_length_mm,
        result: nestResult,
        parts: group.parts,
      });
      toast({ title: "Export complete", description: "Internal nest pack downloaded" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (parts.length === 0) return null;

  const activePreviewGroup = groups.find(g => g.group_label === previewGroup);

  return (
    <div className="space-y-4">
      <div className="glass-panel border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
            <Layers size={16} className="text-primary" /> Material Groups
          </h3>
          <Button size="sm" variant="ghost" onClick={buildGroups}>
            <RefreshCw size={14} /> Recalculate
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g, i) => (
            <div key={i} className={`rounded-md border bg-card/50 p-3 space-y-2 ${g.locked ? 'border-primary/40' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-foreground">{g.group_label}</span>
                <div className="flex items-center gap-1">
                  {g.locked && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">LOCKED</span>
                  )}
                  <span className="text-[10px] font-mono text-muted-foreground">{g.parts.length} parts</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-muted-foreground">
                <span>Sheet: {g.sheet_length_mm}×{g.sheet_width_mm}</span>
                <span>Thickness: {g.thickness_mm || "—"}mm</span>
                <span>Margin: {g.margin_mm}mm</span>
                <span>Spacing: {g.spacing_mm}mm</span>
                <span>Grain: {g.grain_direction}</span>
                <span>Rotation: {g.allow_rotation_90 ? "Yes" : "No"}</span>
              </div>

              {/* Engine Toggle */}
              <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                <span className="text-[10px] font-mono text-muted-foreground">Engine:</span>
                <button
                  onClick={() => toggleEngine(g.group_label)}
                  disabled={g.locked}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                    g.nesting_engine === "internal"
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-muted/30 text-muted-foreground border border-border/50"
                  }`}
                >
                  {g.nesting_engine === "internal" ? "Internal" : "VCarve"}
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  Qty: {g.parts.reduce((s, p) => s + p.quantity, 0)}
                </span>
                <div className="flex items-center gap-1">
                  {g.nesting_engine === "internal" && !g.locked && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => runInternalNest(g)}
                    >
                      <Cpu size={10} className="mr-1" /> Nest
                    </Button>
                  )}
                  {g.locked && nestResult && previewGroup === g.group_label && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => handleExport(g)}
                      disabled={exporting}
                    >
                      <Download size={10} className="mr-1" /> Export
                    </Button>
                  )}
                  <span className="font-mono text-xs font-bold text-primary">
                    ~{g.sheet_count} sheet{g.sheet_count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nesting Preview */}
      {nestResult && activePreviewGroup && (
        <NestingPreview
          result={nestResult}
          sheetWidth={activePreviewGroup.sheet_width_mm}
          sheetLength={activePreviewGroup.sheet_length_mm}
          groupLabel={activePreviewGroup.group_label}
          onCommit={() => commitLayout(activePreviewGroup)}
          onRerun={() => runInternalNest(activePreviewGroup)}
          onClose={() => { setPreviewGroup(null); setNestResult(null); }}
          committing={committing}
        />
      )}
    </div>
  );
}

export type { NestingGroup };
