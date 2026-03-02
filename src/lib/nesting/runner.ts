/**
 * Best-of-N Optimisation Runner
 * 
 * Runs multiple algorithm variants and selects the best result.
 * Deterministic: same seed + settings → same output.
 */

import {
  NestPart, NestSettings, NestResult, NestCandidate,
  AlgorithmName, RemnantInput, ExpandedItem,
  expandParts, stableSort, computeResultHash,
} from "./types";
import { packMaxRects } from "./maxrects";
import { packSkyline } from "./skyline";
import { packGuillotine } from "./guillotine";
import { packRemnantsFirst } from "./remnantStrategy";

interface RunnerOptions {
  remnants?: RemnantInput[];
}

/** Score a result for comparison (lower is better) */
function scoreResult(r: NestResult): number {
  // Primary: fewer sheets
  // Secondary: higher utilisation
  // Tertiary: higher min sheet utilisation
  // Quaternary: more remnant area used
  const sheetPenalty = r.total_sheets * 10000;
  const utilBonus = r.total_utilisation_percent * 100;
  const minUtilBonus = (r.min_sheet_utilisation_percent ?? 0) * 10;
  const remnantBonus = (r.remnant_area_used_mm2 ?? 0) / 1000;
  const unplacedPenalty = r.unplaced.length * 100000;

  return unplacedPenalty + sheetPenalty - utilBonus - minUtilBonus - remnantBonus;
}

/** Generate algorithm variants to try */
function generateVariants(
  pool: AlgorithmName[],
  runs: number
): { algorithm: AlgorithmName; params: Record<string, any> }[] {
  const variants: { algorithm: AlgorithmName; params: Record<string, any> }[] = [];

  // Core algorithm variants
  for (const algo of pool) {
    if (algo === "maxrects_best_area_fit") {
      variants.push({ algorithm: algo, params: { mode: "best_area" } });
    } else if (algo === "maxrects_best_short_side_fit") {
      variants.push({ algorithm: algo, params: { mode: "best_short_side" } });
    } else if (algo === "skyline") {
      variants.push({ algorithm: algo, params: {} });
    } else if (algo === "guillotine") {
      variants.push(
        { algorithm: algo, params: { split: "shorter_leftover" } },
        { algorithm: algo, params: { split: "longer_leftover" } },
        { algorithm: algo, params: { split: "shorter_axis" } },
        { algorithm: algo, params: { split: "longer_axis" } },
      );
    }
  }

  // If we need more variants, add sort permutations
  // Reverse sort, random-ish shuffles via stable index offsets
  if (runs > variants.length) {
    const base = [...variants];
    let idx = variants.length;
    while (variants.length < runs && idx < runs) {
      // Add reversed-sort variants for each algorithm
      for (const v of base) {
        if (variants.length >= runs) break;
        variants.push({
          algorithm: v.algorithm,
          params: { ...v.params, sort_reverse: true, variant_idx: idx },
        });
        idx++;
      }
      // Add width-first sort variants
      for (const v of base) {
        if (variants.length >= runs) break;
        variants.push({
          algorithm: v.algorithm,
          params: { ...v.params, sort_by_width: true, variant_idx: idx },
        });
        idx++;
      }
      // Add height-first sort variants
      for (const v of base) {
        if (variants.length >= runs) break;
        variants.push({
          algorithm: v.algorithm,
          params: { ...v.params, sort_by_height: true, variant_idx: idx },
        });
        idx++;
      }
    }
  }

  return variants.slice(0, runs);
}

/** Apply sort variant to items */
function applySortVariant(items: ExpandedItem[], params: Record<string, any>): ExpandedItem[] {
  const sorted = [...items];

  if (params.sort_reverse) {
    stableSort(sorted);
    sorted.reverse();
  } else if (params.sort_by_width) {
    sorted.sort((a, b) => {
      if (b.width_mm !== a.width_mm) return b.width_mm - a.width_mm;
      if (a.part_id !== b.part_id) return a.part_id.localeCompare(b.part_id);
      return a.instance_index - b.instance_index;
    });
  } else if (params.sort_by_height) {
    sorted.sort((a, b) => {
      if (b.height_mm !== a.height_mm) return b.height_mm - a.height_mm;
      if (a.part_id !== b.part_id) return a.part_id.localeCompare(b.part_id);
      return a.instance_index - b.instance_index;
    });
  } else {
    stableSort(sorted);
  }

  return sorted;
}

/** Run a single packing variant */
function runVariant(
  items: ExpandedItem[],
  settings: NestSettings,
  variant: { algorithm: AlgorithmName; params: Record<string, any> },
  remnants?: RemnantInput[]
): NestResult {
  const sorted = applySortVariant(items, variant.params);
  let allSheets: NestResult["sheets"] = [];
  let allUnplaced: NestResult["unplaced"] = [];
  let remnantAreaUsed = 0;
  let itemsForFullSheets = sorted;

  // Remnant-first strategy
  if (settings.remnant_first && remnants && remnants.length > 0) {
    const remnantResult = packRemnantsFirst(sorted, remnants, settings, variant.algorithm);
    allSheets.push(...remnantResult.remnantSheets);
    itemsForFullSheets = remnantResult.remainingItems;
    remnantAreaUsed = remnantResult.remnantAreaUsed_mm2;
  }

  // Full sheet packing for remaining items
  if (itemsForFullSheets.length > 0 && (settings.allow_mix_remnant_and_full_sheets !== false || allSheets.length === 0)) {
    const startSheet = allSheets.length + 1;
    let result;

    if (variant.algorithm === "skyline") {
      result = packSkyline(itemsForFullSheets, settings, undefined, undefined, false, undefined, startSheet);
    } else if (variant.algorithm === "guillotine") {
      const split = variant.params.split || "shorter_leftover";
      result = packGuillotine(itemsForFullSheets, settings, split, undefined, undefined, false, undefined, startSheet);
    } else {
      const mode = variant.algorithm.includes("short_side") ? "best_short_side" as const : "best_area" as const;
      result = packMaxRects(itemsForFullSheets, settings, mode, undefined, undefined, false, undefined, startSheet);
    }

    allSheets.push(...result.sheets);
    allUnplaced.push(...result.unplaced);
  } else if (itemsForFullSheets.length > 0) {
    // Items remaining but mixing not allowed
    allUnplaced.push(...itemsForFullSheets.map(i => ({
      part_id: i.part_id,
      reason: "Could not fit in remnants and full-sheet mixing disabled",
    })));
  }

  const totalUsed = allSheets.reduce(
    (s, sh) => s + sh.placements.reduce((a, p) => a + p.width_mm * p.height_mm, 0), 0
  );
  const totalSheetArea = allSheets.reduce((s, sh) => {
    if (sh.is_remnant && sh.remnant_width_mm && sh.remnant_height_mm) {
      return s + sh.remnant_width_mm * sh.remnant_height_mm;
    }
    return s + settings.sheet_width_mm * settings.sheet_length_mm;
  }, 0);

  const totalUtil = totalSheetArea > 0 ? (totalUsed / totalSheetArea) * 100 : 0;
  const minUtil = allSheets.length > 0
    ? Math.min(...allSheets.map(s => s.utilisation_percent))
    : 0;

  return {
    success: allUnplaced.length === 0,
    sheets: allSheets,
    total_utilisation_percent: Math.round(totalUtil * 100) / 100,
    total_sheets: allSheets.length,
    algorithm: variant.algorithm,
    unplaced: allUnplaced,
    warnings: [],
    min_sheet_utilisation_percent: Math.round(minUtil * 100) / 100,
    remnant_area_used_mm2: remnantAreaUsed,
    parameters_json: variant.params,
    result_hash: computeResultHash(allSheets),
  };
}

/**
 * Main V2 entry point: run best-of-N nesting optimisation.
 */
export function nestPartsV2(
  parts: NestPart[],
  settings: NestSettings,
  options?: RunnerOptions
): { best: NestResult; candidates: NestCandidate[] } {
  const warnings: string[] = [];

  for (const p of parts) {
    if (p.grain_required && p.rotation_allowed) {
      warnings.push(`Part ${p.part_id}: grain_required + rotation_allowed — rotation blocked for grain.`);
    }
  }

  const items = expandParts(parts);
  const runs = Math.min(Math.max(settings.optimisation_runs, 1), 50);
  const pool = settings.algorithm_pool ?? [
    "maxrects_best_area_fit",
    "maxrects_best_short_side_fit",
    "skyline",
    "guillotine",
  ];

  const variants = generateVariants(pool, runs);
  const startTime = Date.now();
  const timeLimit = (settings.optimisation_time_limit_seconds ?? 10) * 1000;

  const candidates: NestCandidate[] = [];

  for (let i = 0; i < variants.length; i++) {
    // Check time limit
    if (Date.now() - startTime > timeLimit && candidates.length > 0) {
      warnings.push(`Time limit reached after ${i} of ${variants.length} runs`);
      break;
    }

    const result = runVariant(items, settings, variants[i], options?.remnants);
    result.warnings = [...warnings];
    result.run_index = i + 1;

    candidates.push({
      result,
      score: scoreResult(result),
      run_index: i + 1,
      algorithm: variants[i].algorithm,
      parameters: variants[i].params,
    });
  }

  // Sort by score (lower is better)
  candidates.sort((a, b) => a.score - b.score);

  const best = candidates[0].result;
  best.warnings = warnings;

  return { best, candidates };
}
