/**
 * Nesting Engine V2 — Shared Types
 */

export interface NestPart {
  part_id: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
  grain_required: boolean;
  rotation_allowed: boolean;
  dxf_ref: string | null;
}

export interface NestSettings {
  sheet_width_mm: number;
  sheet_length_mm: number;
  margin_mm: number;
  spacing_mm: number;
  grain_direction: "length" | "width";
  sort_strategy: "largest_first";
  optimisation_runs: number;
  optimisation_time_limit_seconds?: number;
  optimisation_seed?: string;
  algorithm_pool?: AlgorithmName[];
  // Remnant settings
  remnant_first?: boolean;
  remnant_min_utilisation_percent?: number;
  remnant_max_count_to_try?: number;
  allow_mix_remnant_and_full_sheets?: boolean;
}

export interface RemnantInput {
  remnant_id: string;
  width_mm: number;
  height_mm: number;
  material_code: string;
  thickness_mm: number;
  colour_name: string;
  location?: string;
  status: string;
}

export interface Placement {
  part_id: string;
  instance_index: number;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  rotation_deg: 0 | 90;
  grain_locked: boolean;
}

export interface SheetLayout {
  sheet_number: number;
  placements: Placement[];
  utilisation_percent: number;
  waste_area_mm2: number;
  is_remnant?: boolean;
  remnant_id?: string;
  remnant_width_mm?: number;
  remnant_height_mm?: number;
}

export interface NestResult {
  success: boolean;
  sheets: SheetLayout[];
  total_utilisation_percent: number;
  total_sheets: number;
  algorithm: string;
  unplaced: { part_id: string; reason: string }[];
  warnings: string[];
  // V2 additions
  run_index?: number;
  parameters_json?: Record<string, any>;
  min_sheet_utilisation_percent?: number;
  remnant_area_used_mm2?: number;
  result_hash?: string;
}

export interface NestCandidate {
  result: NestResult;
  score: number;
  run_index: number;
  algorithm: string;
  parameters: Record<string, any>;
}

export type AlgorithmName =
  | "maxrects_best_area_fit"
  | "maxrects_best_short_side_fit"
  | "skyline"
  | "guillotine";

export interface ExpandedItem {
  part_id: string;
  instance_index: number;
  width_mm: number;
  height_mm: number;
  grain_required: boolean;
  rotation_allowed: boolean;
  dxf_ref: string | null;
}

/** Expand parts by quantity into individual placement requests */
export function expandParts(parts: NestPart[]): ExpandedItem[] {
  const items: ExpandedItem[] = [];
  for (const p of parts) {
    for (let i = 0; i < p.quantity; i++) {
      items.push({
        part_id: p.part_id,
        instance_index: i + 1,
        width_mm: p.width_mm,
        height_mm: p.height_mm,
        grain_required: p.grain_required,
        rotation_allowed: p.rotation_allowed,
        dxf_ref: p.dxf_ref,
      });
    }
  }
  return items;
}

/** Deterministic sort: largest area first, tie-break by part_id then instance */
export function stableSort(items: ExpandedItem[]) {
  items.sort((a, b) => {
    const areaA = a.width_mm * a.height_mm;
    const areaB = b.width_mm * b.height_mm;
    if (areaB !== areaA) return areaB - areaA;
    if (a.part_id !== b.part_id) return a.part_id.localeCompare(b.part_id);
    return a.instance_index - b.instance_index;
  });
}

/** Simple deterministic hash for reproducibility checking */
export function computeResultHash(sheets: SheetLayout[]): string {
  const data = sheets.map(s => ({
    n: s.sheet_number,
    p: s.placements.map(p => `${p.part_id}:${p.x_mm}:${p.y_mm}:${p.rotation_deg}`).join("|"),
  }));
  // Simple string hash
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(16);
}
