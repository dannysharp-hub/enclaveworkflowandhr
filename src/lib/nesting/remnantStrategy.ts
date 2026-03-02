/**
 * Remnant-First Packing Strategy
 * 
 * Attempts to fill available remnants before allocating full sheets.
 * Ranks remnants by fit value and enforces minimum utilisation thresholds.
 */

import { ExpandedItem, SheetLayout, NestSettings, RemnantInput } from "./types";
import { packMaxRects } from "./maxrects";
import { packSkyline } from "./skyline";
import { packGuillotine } from "./guillotine";

export interface RemnantPackResult {
  remnantSheets: SheetLayout[];
  remainingItems: ExpandedItem[];
  remnantsUsed: { remnant_id: string; utilisation_percent: number; parts_placed: number }[];
  remnantAreaUsed_mm2: number;
}

export function packRemnantsFirst(
  items: ExpandedItem[],
  remnants: RemnantInput[],
  settings: NestSettings,
  algorithm: string = "maxrects_best_area_fit"
): RemnantPackResult {
  const minUtil = settings.remnant_min_utilisation_percent ?? 40;
  const maxToTry = settings.remnant_max_count_to_try ?? 20;

  // Only consider available remnants, sorted by area descending
  const candidates = remnants
    .filter(r => r.status === "available")
    .sort((a, b) => (b.width_mm * b.height_mm) - (a.width_mm * a.height_mm))
    .slice(0, maxToTry);

  const allRemnantSheets: SheetLayout[] = [];
  const remnantsUsed: RemnantPackResult["remnantsUsed"] = [];
  let remaining = [...items];
  let totalRemnantArea = 0;
  let sheetNumber = 1;

  for (const remnant of candidates) {
    if (remaining.length === 0) break;

    const usableW = remnant.width_mm - 2 * settings.margin_mm;
    const usableH = remnant.height_mm - 2 * settings.margin_mm;

    if (usableW <= 0 || usableH <= 0) continue;

    // Try packing into this remnant
    let result;
    if (algorithm.startsWith("skyline")) {
      result = packSkyline(remaining, settings, usableW, usableH, true, remnant.remnant_id, sheetNumber);
    } else if (algorithm.startsWith("guillotine")) {
      result = packGuillotine(remaining, settings, "shorter_leftover", usableW, usableH, true, remnant.remnant_id, sheetNumber);
    } else {
      const mode = algorithm.includes("short_side") ? "best_short_side" as const : "best_area" as const;
      result = packMaxRects(remaining, settings, mode, usableW, usableH, true, remnant.remnant_id, sheetNumber);
    }

    // Check if any parts were placed
    if (result.sheets.length > 0 && result.sheets[0].placements.length > 0) {
      const sheet = result.sheets[0];
      const remnantArea = remnant.width_mm * remnant.height_mm;
      const usedArea = sheet.placements.reduce((s, p) => s + p.width_mm * p.height_mm, 0);
      const util = (usedArea / remnantArea) * 100;

      // Only use remnant if meets minimum utilisation threshold
      if (util >= minUtil) {
        // Enrich the sheet with remnant dimensions
        sheet.remnant_width_mm = remnant.width_mm;
        sheet.remnant_height_mm = remnant.height_mm;
        allRemnantSheets.push(sheet);
        sheetNumber++;

        remnantsUsed.push({
          remnant_id: remnant.remnant_id,
          utilisation_percent: Math.round(util * 100) / 100,
          parts_placed: sheet.placements.length,
        });

        totalRemnantArea += usedArea;

        // Remove placed parts from remaining
        const placedIds = new Set(
          sheet.placements.map(p => `${p.part_id}:${p.instance_index}`)
        );
        remaining = remaining.filter(
          item => !placedIds.has(`${item.part_id}:${item.instance_index}`)
        );
      }
    }
  }

  return {
    remnantSheets: allRemnantSheets,
    remainingItems: remaining,
    remnantsUsed,
    remnantAreaUsed_mm2: totalRemnantArea,
  };
}
