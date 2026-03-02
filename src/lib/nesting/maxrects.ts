/**
 * MaxRects Bin Packing — BAF and BSSF variants
 */

import { ExpandedItem, Placement, SheetLayout, NestSettings } from "./types";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type FitMode = "best_area" | "best_short_side";

class MaxRectsBin {
  private freeRects: Rect[] = [];
  readonly binW: number;
  readonly binH: number;

  constructor(w: number, h: number) {
    this.binW = w;
    this.binH = h;
    this.freeRects = [{ x: 0, y: 0, w, h }];
  }

  place(w: number, h: number, mode: FitMode): { x: number; y: number } | null {
    let bestIdx = -1;
    let bestScore = Infinity;
    let bestX = 0;
    let bestY = 0;

    for (let i = 0; i < this.freeRects.length; i++) {
      const r = this.freeRects[i];
      if (w <= r.w && h <= r.h) {
        const score = mode === "best_area"
          ? r.w * r.h
          : Math.min(r.w - w, r.h - h);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
          bestX = r.x;
          bestY = r.y;
        }
      }
    }

    if (bestIdx === -1) return null;
    this.splitAndPrune(bestX, bestY, w, h);
    return { x: bestX, y: bestY };
  }

  private splitAndPrune(px: number, py: number, pw: number, ph: number) {
    const newFree: Rect[] = [];
    for (const r of this.freeRects) {
      if (px >= r.x + r.w || px + pw <= r.x || py >= r.y + r.h || py + ph <= r.y) {
        newFree.push(r);
        continue;
      }
      if (px > r.x) newFree.push({ x: r.x, y: r.y, w: px - r.x, h: r.h });
      if (px + pw < r.x + r.w) newFree.push({ x: px + pw, y: r.y, w: (r.x + r.w) - (px + pw), h: r.h });
      if (py > r.y) newFree.push({ x: r.x, y: r.y, w: r.w, h: py - r.y });
      if (py + ph < r.y + r.h) newFree.push({ x: r.x, y: py + ph, w: r.w, h: (r.y + r.h) - (py + ph) });
    }
    // Prune contained rects
    const pruned: Rect[] = [];
    for (let i = 0; i < newFree.length; i++) {
      let contained = false;
      for (let j = 0; j < newFree.length; j++) {
        if (i === j) continue;
        const a = newFree[i], b = newFree[j];
        if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
          contained = true;
          break;
        }
      }
      if (!contained) pruned.push(newFree[i]);
    }
    this.freeRects = pruned;
  }
}

export function packMaxRects(
  items: ExpandedItem[],
  settings: NestSettings,
  mode: FitMode,
  binW?: number,
  binH?: number,
  isRemnant?: boolean,
  remnantId?: string,
  startSheetNumber = 1
): { sheets: SheetLayout[]; unplaced: { part_id: string; reason: string }[] } {
  const usableW = binW ?? (settings.sheet_width_mm - 2 * settings.margin_mm);
  const usableH = binH ?? (settings.sheet_length_mm - 2 * settings.margin_mm);
  const sheetArea = (binW ?? settings.sheet_width_mm) * (binH ?? settings.sheet_length_mm);

  const sheets: { bin: MaxRectsBin; placements: Placement[]; isRemnant?: boolean; remnantId?: string }[] = [];
  const unplaced: { part_id: string; reason: string }[] = [];

  for (const item of items) {
    const spacing = settings.spacing_mm;
    const effW = item.width_mm + spacing;
    const effH = item.height_mm + spacing;
    const effWR = item.height_mm + spacing;
    const effHR = item.width_mm + spacing;
    const canRotate = item.rotation_allowed && !item.grain_required;

    let placed = false;

    for (const sheet of sheets) {
      const pos = sheet.bin.place(effW, effH, mode);
      if (pos) {
        sheet.placements.push({
          part_id: item.part_id, instance_index: item.instance_index,
          x_mm: pos.x + settings.margin_mm, y_mm: pos.y + settings.margin_mm,
          width_mm: item.width_mm, height_mm: item.height_mm,
          rotation_deg: 0, grain_locked: item.grain_required,
        });
        placed = true;
        break;
      }
      if (canRotate) {
        const posR = sheet.bin.place(effWR, effHR, mode);
        if (posR) {
          sheet.placements.push({
            part_id: item.part_id, instance_index: item.instance_index,
            x_mm: posR.x + settings.margin_mm, y_mm: posR.y + settings.margin_mm,
            width_mm: item.height_mm, height_mm: item.width_mm,
            rotation_deg: 90, grain_locked: item.grain_required,
          });
          placed = true;
          break;
        }
      }
    }

    if (!placed && !isRemnant) {
      // Only create new sheets for full-sheet mode (not remnant packing)
      const bin = new MaxRectsBin(usableW, usableH);
      const pos = bin.place(effW, effH, mode);
      if (pos) {
        sheets.push({
          bin, placements: [{
            part_id: item.part_id, instance_index: item.instance_index,
            x_mm: pos.x + settings.margin_mm, y_mm: pos.y + settings.margin_mm,
            width_mm: item.width_mm, height_mm: item.height_mm,
            rotation_deg: 0, grain_locked: item.grain_required,
          }],
        });
      } else if (canRotate) {
        const bin2 = new MaxRectsBin(usableW, usableH);
        const posR = bin2.place(effWR, effHR, mode);
        if (posR) {
          sheets.push({
            bin: bin2, placements: [{
              part_id: item.part_id, instance_index: item.instance_index,
              x_mm: posR.x + settings.margin_mm, y_mm: posR.y + settings.margin_mm,
              width_mm: item.height_mm, height_mm: item.width_mm,
              rotation_deg: 90, grain_locked: item.grain_required,
            }],
          });
        } else {
          unplaced.push({ part_id: item.part_id, reason: "Cannot fit on any sheet" });
        }
      } else {
        unplaced.push({ part_id: item.part_id, reason: "Cannot fit on any sheet" });
      }
    } else if (!placed && isRemnant) {
      unplaced.push({ part_id: item.part_id, reason: "Did not fit remnant" });
    }
  }

  const result: SheetLayout[] = sheets.map((s, i) => {
    const usedArea = s.placements.reduce((sum, p) => sum + p.width_mm * p.height_mm, 0);
    const util = (usedArea / sheetArea) * 100;
    return {
      sheet_number: startSheetNumber + i,
      placements: s.placements,
      utilisation_percent: Math.round(util * 100) / 100,
      waste_area_mm2: sheetArea - usedArea,
      is_remnant: isRemnant || false,
      remnant_id: remnantId,
      remnant_width_mm: isRemnant ? (binW ?? 0) : undefined,
      remnant_height_mm: isRemnant ? (binH ?? 0) : undefined,
    };
  });

  return { sheets: result, unplaced };
}
