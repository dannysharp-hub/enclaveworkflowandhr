import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Layers, RefreshCw, Cpu, Download, AlertTriangle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nestPartsV2, NestPart, NestSettings, NestResult, NestCandidate, RemnantInput } from "@/lib/nesting";
import NestingPreview from "@/components/NestingPreview";
import NestingPreflightModal from "@/components/NestingPreflightModal";
import { generateInternalNestPack } from "@/lib/internalNestExport";
import { validatePartsForNesting, ValidationResult } from "@/lib/dimensionValidation";

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
  library_part_id?: string | null;
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
  // V2 settings
  remnant_first: boolean;
  algorithm_pool: string[];
  optimisation_time_limit_seconds: number;
}

interface Props {
  jobId: string;
  parts: PartData[];
  materials: { material_code: string; display_name: string; sheet_length_mm?: number; sheet_width_mm?: number; grain_direction?: string; thickness_mm?: number; colour_name?: string }[];
  onUpdateParts?: (updates: { part_id: string; changes: Record<string, any> }[]) => void;
}

export default function NestingGroupsPanel({ jobId, parts, materials, onUpdateParts }: Props) {
  const [groups, setGroups] = useState<NestingGroup[]>([]);
  const [previewGroup, setPreviewGroup] = useState<string | null>(null);
  const [nestResult, setNestResult] = useState<NestResult | null>(null);
  const [candidates, setCandidates] = useState<NestCandidate[]>([]);
  const [committing, setCommitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightValidation, setPreflightValidation] = useState<ValidationResult | null>(null);
  const [preflightGroupLabel, setPreflightGroupLabel] = useState<string | null>(null);
  const [remnants, setRemnants] = useState<RemnantInput[]>([]);

  // Fetch available remnants
  useEffect(() => {
    const fetchRemnants = async () => {
      const { data } = await supabase
        .from("remnants")
        .select("id, width_mm, length_mm, material_code, thickness_mm, colour_name, location, status")
        .eq("status", "available");
      if (data) {
        setRemnants(data.map(r => ({
          remnant_id: r.id,
          width_mm: Number(r.width_mm),
          height_mm: Number(r.length_mm),
          material_code: r.material_code,
          thickness_mm: Number(r.thickness_mm),
          colour_name: r.colour_name,
          location: r.location,
          status: r.status,
        })));
      }
    };
    fetchRemnants();
  }, []);

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
        remnant_first: false,
        algorithm_pool: ["maxrects_best_area_fit", "maxrects_best_short_side_fit", "skyline", "guillotine"],
        optimisation_time_limit_seconds: 10,
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

  const updateGroupSetting = (groupLabel: string, field: string, value: any) => {
    setGroups(prev => prev.map(g =>
      g.group_label === groupLabel ? { ...g, [field]: value } : g
    ));
  };

  const runInternalNest = (group: NestingGroup) => {
    const validation = validatePartsForNesting(group.parts, {
      usable_width: group.sheet_width_mm - 2 * group.margin_mm,
      usable_height: group.sheet_length_mm - 2 * group.margin_mm,
    });

    if (!validation.valid) {
      setPreflightValidation(validation);
      setPreflightGroupLabel(group.group_label);
      setPreflightOpen(true);
      return;
    }

    if (validation.totalWarnings > 0) {
      toast({ title: `${validation.totalWarnings} dimension warning(s)`, description: "Check part dimensions for potential issues" });
    }

    executeNest(group);
  };

  const executeNest = (group: NestingGroup) => {
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
      optimisation_time_limit_seconds: group.optimisation_time_limit_seconds,
      algorithm_pool: group.algorithm_pool as any,
      remnant_first: group.remnant_first,
    };

    // Filter remnants matching this group's material
    const groupRemnants = remnants.filter(r =>
      r.material_code === group.material_code &&
      (group.thickness_mm == null || r.thickness_mm === group.thickness_mm)
    );

    const { best, candidates: allCandidates } = nestPartsV2(nestPart, settings, {
      remnants: group.remnant_first ? groupRemnants : undefined,
    });

    setNestResult(best);
    setCandidates(allCandidates);
    setPreviewGroup(group.group_label);
  };

  const selectCandidate = (candidate: NestCandidate) => {
    setNestResult(candidate.result);
  };

  const handlePreflightUpdate = (updates: { part_id: string; changes: Record<string, any> }[]) => {
    if (onUpdateParts) onUpdateParts(updates);
    if (preflightGroupLabel) {
      const group = groups.find(g => g.group_label === preflightGroupLabel);
      if (group) {
        const updatedParts = group.parts.map(p => {
          const upd = updates.find(u => u.part_id === p.part_id);
          return upd ? { ...p, ...upd.changes } : p;
        });
        const validation = validatePartsForNesting(updatedParts, {
          usable_width: group.sheet_width_mm - 2 * group.margin_mm,
          usable_height: group.sheet_length_mm - 2 * group.margin_mm,
        });
        setPreflightValidation(validation);
        if (validation.valid) {
          toast({ title: "All issues resolved!", description: "You can now run the nesting engine." });
        }
      }
    }
  };

  const commitLayout = async (group: NestingGroup) => {
    if (!nestResult || !nestResult.success) return;
    setCommitting(true);

    try {
      // Reserve any remnants used
      const remnantSheets = nestResult.sheets.filter(s => s.is_remnant && s.remnant_id);
      for (const rs of remnantSheets) {
        await supabase
          .from("remnants")
          .update({ status: "reserved" } as any)
          .eq("id", rs.remnant_id!);
      }

      for (const sheet of nestResult.sheets) {
        const { data: layout, error: layoutErr } = await supabase
          .from("job_sheet_layouts")
          .insert({
            job_id: jobId,
            group_id: group.id || jobId,
            sheet_number: sheet.sheet_number,
            sheet_width_mm: sheet.is_remnant ? sheet.remnant_width_mm : group.sheet_width_mm,
            sheet_length_mm: sheet.is_remnant ? sheet.remnant_height_mm : group.sheet_length_mm,
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

      // Save nesting run with V2 metadata
      const selectedCandidate = candidates.find(c => c.result.result_hash === nestResult.result_hash);
      await supabase.from("nesting_runs").insert({
        job_id: jobId,
        group_id: group.id || jobId,
        status: "success",
        algorithm_variant: nestResult.algorithm,
        utilisation_percent: nestResult.total_utilisation_percent,
        sheet_count: nestResult.total_sheets,
        completed_at: new Date().toISOString(),
        run_index: selectedCandidate?.run_index ?? 1,
        parameters_json: nestResult.parameters_json ?? {},
        min_sheet_utilisation_percent: nestResult.min_sheet_utilisation_percent ?? 0,
        remnant_area_used_mm2: nestResult.remnant_area_used_mm2 ?? 0,
        result_hash: nestResult.result_hash ?? "",
        selected: true,
        output_summary_json: {
          total_placements: nestResult.sheets.reduce((s, sh) => s + sh.placements.length, 0),
          warnings: nestResult.warnings,
          candidates_evaluated: candidates.length,
          remnants_used: nestResult.sheets.filter(s => s.is_remnant).map(s => s.remnant_id),
        },
      } as any);

      setGroups(prev => prev.map(g =>
        g.group_label === group.group_label ? { ...g, locked: true } : g
      ));

      toast({ title: "Layout committed", description: `${nestResult.total_sheets} sheets locked for ${group.group_label}` });
      setPreviewGroup(null);
      setNestResult(null);
      setCandidates([]);
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
  const preflightGroup = groups.find(g => g.group_label === preflightGroupLabel);

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
          {groups.map((g, i) => {
            const groupValidation = g.nesting_engine === "internal"
              ? validatePartsForNesting(g.parts, {
                  usable_width: g.sheet_width_mm - 2 * g.margin_mm,
                  usable_height: g.sheet_length_mm - 2 * g.margin_mm,
                })
              : null;

            const matchingRemnants = remnants.filter(r =>
              r.material_code === g.material_code &&
              (g.thickness_mm == null || r.thickness_mm === g.thickness_mm)
            );

            return (
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

                {/* V2 Settings */}
                {g.nesting_engine === "internal" && !g.locked && (
                  <div className="space-y-1.5 pt-1 border-t border-border/30">
                    <div className="flex items-center gap-2">
                      <Settings2 size={10} className="text-muted-foreground" />
                      <span className="text-[10px] font-mono text-muted-foreground">V2 Settings</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                        <span>Runs:</span>
                        <select
                          value={g.optimisation_runs}
                          onChange={(e) => updateGroupSetting(g.group_label, "optimisation_runs", Number(e.target.value))}
                          className="bg-background border border-border rounded px-1 py-0.5 text-[10px] w-14"
                        >
                          {[1, 5, 10, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={g.remnant_first}
                          onChange={(e) => updateGroupSetting(g.group_label, "remnant_first", e.target.checked)}
                          className="rounded border-border"
                        />
                        <span>Remnant-first</span>
                        {matchingRemnants.length > 0 && (
                          <span className="text-primary">({matchingRemnants.length})</span>
                        )}
                      </label>
                    </div>
                  </div>
                )}

                {/* Validation status */}
                {groupValidation && !g.locked && (
                  <div className={`flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded ${
                    groupValidation.valid
                      ? "bg-primary/5 text-primary"
                      : "bg-destructive/5 text-destructive"
                  }`}>
                    {groupValidation.valid ? (
                      <>✅ Ready to nest</>
                    ) : (
                      <>
                        <AlertTriangle size={10} />
                        {groupValidation.totalMissing} missing · {groupValidation.totalBlockers} blocker{groupValidation.totalBlockers !== 1 ? "s" : ""}
                      </>
                    )}
                  </div>
                )}

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
                        <Cpu size={10} className="mr-1" />
                        {g.optimisation_runs > 1 ? `Best of ${g.optimisation_runs}` : "Nest"}
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
            );
          })}
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
          onClose={() => { setPreviewGroup(null); setNestResult(null); setCandidates([]); }}
          committing={committing}
          candidates={candidates}
          onSelectCandidate={selectCandidate}
        />
      )}

      {/* Pre-flight Modal */}
      {preflightValidation && preflightGroup && (
        <NestingPreflightModal
          open={preflightOpen}
          onOpenChange={setPreflightOpen}
          validation={preflightValidation}
          parts={preflightGroup.parts}
          onUpdateParts={handlePreflightUpdate}
        />
      )}
    </div>
  );
}

export type { NestingGroup };
