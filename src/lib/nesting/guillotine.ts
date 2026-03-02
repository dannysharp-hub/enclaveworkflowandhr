/**
 * Guillotine Bin Packing Algorithm
 * 
 * Splits free rectangles using guillotine cuts (full horizontal or vertical splits).
 * More closely matches how CNC operators actually cut sheets.
 */

import { ExpandedItem, Placement, SheetLayout, NestSettings } from "./types";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SplitRule = "shorter_leftover" | "longer_leftover" | "shorter_axis" | "longer_axis";

class GuillotineBin {
  private freeRects: Rect[] = [];
  readonly binW: number;
  readonly binH: number;

  constructor(w: number, h: number, private splitRule: SplitRule = "shorter_leftover") {
    this.binW = w;
    this.binH = h;
    this.freeRects = [{ x: 0, y: 0, w, h }];
  }

  place(w: number, h: number): { x: number; y: number } | null {
    // Best Area Fit selection
    let bestIdx = -1;
    let bestArea = Infinity;

    for (let i = 0; i < this.freeRects.length; i++) {
      const r = this.freeRects[i];
      if (w <= r.w && h <= r.h) {
        const area = r.w * r.h;
        if (area < bestArea) {
          bestArea = area;
          bestIdx = i;
        }
      }
    }

    if (bestIdx === -1) return null;

    const chosen = this.freeRects[bestIdx];
    const px = chosen.x;
    const py = chosen.y;

    // Remove the chosen rect and split
    this.freeRects.splice(bestIdx, 1);
    this.guillotineSplit(chosen, w, h);

    return { x: px, y: py };
  }

  private guillotineSplit(rect: Rect, pw: number, ph: number) {
    const rightW = rect.w - pw;
    const topH = rect.h - ph;

    if (rightW <= 0 && topH <= 0) return;

    let splitHorizontal: boolean;

    switch (this.splitRule) {
      case "shorter_leftover":
        splitHorizontal = rightW <= topH;
        break;
      case "longer_leftover":
        splitHorizontal = rightW >= topH;
        break;
      case "shorter_axis":
        splitHorizontal = rect.w <= rect.h;
        break;
      case "longer_axis":
        splitHorizontal = rect.w >= rect.h;
        break;
    }

    if (splitHorizontal) {
      // Horizontal split: right strip gets full height of placed part
      if (rightW > 0) {
        this.freeRects.push({ x: rect.x + pw, y: rect.y, w: rightW, h: ph });
      }
      if (topH > 0) {
        this.freeRects.push({ x: rect.x, y: rect.y + ph, w: rect.w, h: topH });
      }
    } else {
      // Vertical split: top strip gets full width of placed part
      if (topH > 0) {
        this.freeRects.push({ x: rect.x, y: rect.y + ph, w: pw, h: topH });
      }
      if (rightW > 0) {
        this.freeRects.push({ x: rect.x + pw, y: rect.y, w: rightW, h: rect.h });
      }
    }
  }
}

export function packGuillotine(
  items: ExpandedItem[],
  settings: NestSettings,
  splitRule: SplitRule = "shorter_leftover",
  binW?: number,
  binH?: number,
  isRemnant?: boolean,
  remnantId?: string,
  startSheetNumber = 1
): { sheets: SheetLayout[]; unplaced: { part_id: string; reason: string }[] } {
  const usableW = binW ?? (settings.sheet_width_mm - 2 * settings.margin_mm);
  const usableH = binH ?? (settings.sheet_length_mm - 2 * settings.margin_mm);
  const sheetArea = (binW ?? settings.sheet_width_mm) * (binH ?? settings.sheet_length_mm);

  const bins: { bin: GuillotineBin; placements: Placement[] }[] = [];
  const unplaced: { part_id: string; reason: string }[] = [];

  for (const item of items) {
    const spacing = settings.spacing_mm;
    const effW = item.width_mm + spacing;
    const effH = item.height_mm + spacing;
    const canRotate = item.rotation_allowed && !item.grain_required;
    let placed = false;

    for (const sheet of bins) {
      const pos = sheet.bin.place(effW, effH);
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
        const posR = sheet.bin.place(item.height_mm + spacing, item.width_mm + spacing);
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
      const bin = new GuillotineBin(usableW, usableH, splitRule);
      const pos = bin.place(effW, effH);
      if (pos) {
        bins.push({
          bin, placements: [{
            part_id: item.part_id, instance_index: item.instance_index,
            x_mm: pos.x + settings.margin_mm, y_mm: pos.y + settings.margin_mm,
            width_mm: item.width_mm, height_mm: item.height_mm,
            rotation_deg: 0, grain_locked: item.grain_required,
          }],
        });
      } else if (canRotate) {
        const bin2 = new GuillotineBin(usableW, usableH, splitRule);
        const posR = bin2.place(item.height_mm + spacing, item.width_mm + spacing);
        if (posR) {
          bins.push({
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

  return {
    sheets: bins.map((s, i) => {
      const usedArea = s.placements.reduce((sum, p) => sum + p.width_mm * p.height_mm, 0);
      return {
        sheet_number: startSheetNumber + i,
        placements: s.placements,
        utilisation_percent: Math.round((usedArea / sheetArea) * 10000) / 100,
        waste_area_mm2: sheetArea - usedArea,
        is_remnant: isRemnant || false,
        remnant_id: remnantId,
        remnant_width_mm: isRemnant ? (binW ?? 0) : undefined,
        remnant_height_mm: isRemnant ? (binH ?? 0) : undefined,
      };
    }),
    unplaced,
  };
}
