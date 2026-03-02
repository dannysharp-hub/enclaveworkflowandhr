/**
 * Internal Nesting Engine — MaxRects Best-Area-Fit (MVP)
 * Rectangle-only packing with grain/rotation enforcement.
 * Deterministic: same inputs → same output (stable sort by area desc, then part_id).
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface NestPart {
  part_id: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
  grain_required: boolean;
  rotation_allowed: boolean; // false = no rotation permitted
  dxf_ref: string | null;
}

export interface NestSettings {
  sheet_width_mm: number;
  sheet_length_mm: number;
  margin_mm: number;
  spacing_mm: number;
  grain_direction: "length" | "width"; // sheet grain runs along this axis
  sort_strategy: "largest_first";
  optimisation_runs: number;
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
}

export interface NestResult {
  success: boolean;
  sheets: SheetLayout[];
  total_utilisation_percent: number;
  total_sheets: number;
  algorithm: string;
  unplaced: { part_id: string; reason: string }[];
  warnings: string[];
}

// ─── MaxRects free-rect tracker ──────────────────────────────────────

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class MaxRectsBin {
  private freeRects: Rect[] = [];
  readonly binW: number;
  readonly binH: number;

  constructor(w: number, h: number) {
    this.binW = w;
    this.binH = h;
    this.freeRects = [{ x: 0, y: 0, w, h }];
  }

  /** Try to place a rect (w×h). Returns placement or null. */
  place(w: number, h: number): { x: number; y: number } | null {
    let bestIdx = -1;
    let bestArea = Infinity;
    let bestX = 0;
    let bestY = 0;

    for (let i = 0; i < this.freeRects.length; i++) {
      const r = this.freeRects[i];
      if (w <= r.w && h <= r.h) {
        const area = r.w * r.h;
        if (area < bestArea) {
          bestArea = area;
          bestIdx = i;
          bestX = r.x;
          bestY = r.y;
        }
      }
    }

    if (bestIdx === -1) return null;

    // Split the chosen free rect
    this.splitFreeRect(bestIdx, bestX, bestY, w, h);
    this.pruneFreeRects();

    return { x: bestX, y: bestY };
  }

  private splitFreeRect(idx: number, px: number, py: number, pw: number, ph: number) {
    const newFree: Rect[] = [];
    for (let i = 0; i < this.freeRects.length; i++) {
      const r = this.freeRects[i];
      // Check overlap with placed rect
      if (px >= r.x + r.w || px + pw <= r.x || py >= r.y + r.h || py + ph <= r.y) {
        newFree.push(r);
        continue;
      }
      // Left
      if (px > r.x) newFree.push({ x: r.x, y: r.y, w: px - r.x, h: r.h });
      // Right
      if (px + pw < r.x + r.w) newFree.push({ x: px + pw, y: r.y, w: (r.x + r.w) - (px + pw), h: r.h });
      // Bottom
      if (py > r.y) newFree.push({ x: r.x, y: r.y, w: r.w, h: py - r.y });
      // Top
      if (py + ph < r.y + r.h) newFree.push({ x: r.x, y: py + ph, w: r.w, h: (r.y + r.h) - (py + ph) });
    }
    this.freeRects = newFree;
  }

  private pruneFreeRects() {
    // Remove rects fully contained by another
    const pruned: Rect[] = [];
    for (let i = 0; i < this.freeRects.length; i++) {
      let contained = false;
      for (let j = 0; j < this.freeRects.length; j++) {
        if (i === j) continue;
        const a = this.freeRects[i];
        const b = this.freeRects[j];
        if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
          contained = true;
          break;
        }
      }
      if (!contained) pruned.push(this.freeRects[i]);
    }
    this.freeRects = pruned;
  }
}

// ─── Engine ──────────────────────────────────────────────────────────

/** Expand parts by quantity into individual placement requests */
function expandParts(parts: NestPart[]): {
  part_id: string;
  instance_index: number;
  width_mm: number;
  height_mm: number;
  grain_required: boolean;
  rotation_allowed: boolean;
  dxf_ref: string | null;
}[] {
  const items: ReturnType<typeof expandParts> = [];
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
function stableSort(items: ReturnType<typeof expandParts>) {
  items.sort((a, b) => {
    const areaA = a.width_mm * a.height_mm;
    const areaB = b.width_mm * b.height_mm;
    if (areaB !== areaA) return areaB - areaA;
    if (a.part_id !== b.part_id) return a.part_id.localeCompare(b.part_id);
    return a.instance_index - b.instance_index;
  });
}

type FitVariant = "best_area" | "best_short_side";

function runSinglePass(
  items: ReturnType<typeof expandParts>,
  settings: NestSettings,
  _variant: FitVariant
): { sheets: SheetLayout[]; unplaced: { part_id: string; reason: string }[] } {
  const usableW = settings.sheet_width_mm - 2 * settings.margin_mm;
  const usableH = settings.sheet_length_mm - 2 * settings.margin_mm;
  const sheetArea = settings.sheet_width_mm * settings.sheet_length_mm;

  const sheets: { bin: MaxRectsBin; placements: Placement[] }[] = [];
  const unplaced: { part_id: string; reason: string }[] = [];

  // Pre-validate oversize
  const warnings: string[] = [];
  for (const item of items) {
    const fitsNormal = item.width_mm <= usableW && item.height_mm <= usableH;
    const fitsRotated = item.height_mm <= usableW && item.width_mm <= usableH;
    const canRotate = item.rotation_allowed && !item.grain_required;

    if (!fitsNormal && !(canRotate && fitsRotated)) {
      unplaced.push({
        part_id: item.part_id,
        reason: `Part ${item.width_mm}×${item.height_mm}mm exceeds usable sheet area ${usableW}×${usableH}mm`,
      });
    }
  }

  const placeable = items.filter(
    (item) => !unplaced.some((u) => u.part_id === item.part_id && u.reason.includes("exceeds"))
  );

  for (const item of placeable) {
    let placed = false;
    const spacing = settings.spacing_mm;

    // Include spacing in the effective dimensions
    const effW = item.width_mm + spacing;
    const effH = item.height_mm + spacing;
    const effWR = item.height_mm + spacing;
    const effHR = item.width_mm + spacing;

    const canRotate = item.rotation_allowed && !item.grain_required;

    // Try existing sheets
    for (const sheet of sheets) {
      // Try normal orientation
      const pos = sheet.bin.place(effW, effH);
      if (pos) {
        sheet.placements.push({
          part_id: item.part_id,
          instance_index: item.instance_index,
          x_mm: pos.x + settings.margin_mm,
          y_mm: pos.y + settings.margin_mm,
          width_mm: item.width_mm,
          height_mm: item.height_mm,
          rotation_deg: 0,
          grain_locked: item.grain_required,
        });
        placed = true;
        break;
      }

      // Try rotated
      if (canRotate) {
        const posR = sheet.bin.place(effWR, effHR);
        if (posR) {
          sheet.placements.push({
            part_id: item.part_id,
            instance_index: item.instance_index,
            x_mm: posR.x + settings.margin_mm,
            y_mm: posR.y + settings.margin_mm,
            width_mm: item.height_mm,
            height_mm: item.width_mm,
            rotation_deg: 90,
            grain_locked: item.grain_required,
          });
          placed = true;
          break;
        }
      }
    }

    // New sheet needed
    if (!placed) {
      const bin = new MaxRectsBin(usableW, usableH);
      const pos = bin.place(effW, effH);
      if (pos) {
        const newSheet = {
          bin,
          placements: [
            {
              part_id: item.part_id,
              instance_index: item.instance_index,
              x_mm: pos.x + settings.margin_mm,
              y_mm: pos.y + settings.margin_mm,
              width_mm: item.width_mm,
              height_mm: item.height_mm,
              rotation_deg: 0 as const,
              grain_locked: item.grain_required,
            },
          ],
        };
        sheets.push(newSheet);
      } else if (canRotate) {
        const bin2 = new MaxRectsBin(usableW, usableH);
        const posR = bin2.place(effWR, effHR);
        if (posR) {
          sheets.push({
            bin: bin2,
            placements: [
              {
                part_id: item.part_id,
                instance_index: item.instance_index,
                x_mm: posR.x + settings.margin_mm,
                y_mm: posR.y + settings.margin_mm,
                width_mm: item.height_mm,
                height_mm: item.width_mm,
                rotation_deg: 90 as const,
                grain_locked: item.grain_required,
              },
            ],
          });
        } else {
          unplaced.push({ part_id: item.part_id, reason: "Cannot fit on any sheet" });
        }
      } else {
        unplaced.push({ part_id: item.part_id, reason: "Cannot fit on any sheet" });
      }
    }
  }

  // Build sheet layouts
  const result: SheetLayout[] = sheets.map((s, i) => {
    const usedArea = s.placements.reduce((sum, p) => sum + p.width_mm * p.height_mm, 0);
    const util = (usedArea / sheetArea) * 100;
    return {
      sheet_number: i + 1,
      placements: s.placements,
      utilisation_percent: Math.round(util * 100) / 100,
      waste_area_mm2: sheetArea - usedArea,
    };
  });

  return { sheets: result, unplaced };
}

/**
 * Main entry point: run nesting for a group of parts.
 */
export function nestParts(parts: NestPart[], settings: NestSettings): NestResult {
  const warnings: string[] = [];

  // Validate grain constraints
  for (const p of parts) {
    if (p.grain_required && p.rotation_allowed) {
      warnings.push(`Part ${p.part_id} has grain_required but rotation_allowed — rotation will be blocked to enforce grain.`);
    }
  }

  const items = expandParts(parts);
  stableSort(items);

  const variants: FitVariant[] =
    settings.optimisation_runs > 1 ? ["best_area", "best_short_side"] : ["best_area"];

  let bestResult: ReturnType<typeof runSinglePass> | null = null;
  let bestUtil = -1;
  let bestAlgo = "maxrects_baf";

  for (const variant of variants) {
    const result = runSinglePass([...items], settings, variant);
    const totalUsed = result.sheets.reduce(
      (s, sh) => s + sh.placements.reduce((a, p) => a + p.width_mm * p.height_mm, 0),
      0
    );
    const totalSheet =
      result.sheets.length * settings.sheet_width_mm * settings.sheet_length_mm;
    const util = totalSheet > 0 ? (totalUsed / totalSheet) * 100 : 0;

    if (util > bestUtil || bestResult === null) {
      bestUtil = util;
      bestResult = result;
      bestAlgo = `maxrects_${variant === "best_area" ? "baf" : "bssf"}`;
    }
  }

  const r = bestResult!;

  return {
    success: r.unplaced.length === 0,
    sheets: r.sheets,
    total_utilisation_percent: Math.round(bestUtil * 100) / 100,
    total_sheets: r.sheets.length,
    algorithm: bestAlgo,
    unplaced: r.unplaced,
    warnings,
  };
}
