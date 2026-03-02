import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Layers, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      const estSheets = Math.max(1, Math.ceil((totalArea * 1.15) / sheetArea)); // 15% waste factor

      // Determine rotation from parts
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
        parts: matParts,
        sheet_count: estSheets,
      });
    }
    setGroups(result);
  }, [parts, materials]);

  useEffect(() => { buildGroups(); }, [buildGroups]);

  if (parts.length === 0) return null;

  return (
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
          <div key={i} className="rounded-md border border-border bg-card/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-foreground">{g.group_label}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{g.parts.length} parts</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-muted-foreground">
              <span>Sheet: {g.sheet_length_mm}×{g.sheet_width_mm}</span>
              <span>Thickness: {g.thickness_mm || "—"}mm</span>
              <span>Margin: {g.margin_mm}mm</span>
              <span>Spacing: {g.spacing_mm}mm</span>
              <span>Grain: {g.grain_direction}</span>
              <span>Rotation: {g.allow_rotation_90 ? "Yes" : "No"}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border/30">
              <span className="text-xs text-muted-foreground">
                Qty: {g.parts.reduce((s, p) => s + p.quantity, 0)}
              </span>
              <span className="font-mono text-xs font-bold text-primary">
                ~{g.sheet_count} sheet{g.sheet_count !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export type { NestingGroup };
