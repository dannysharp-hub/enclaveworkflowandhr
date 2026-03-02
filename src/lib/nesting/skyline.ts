/**
 * Skyline Bottom-Left Bin Packing Algorithm
 * 
 * Maintains a "skyline" (top edge profile) and places parts into the lowest gap.
 * Generally produces good results for parts of varying heights.
 */

import { ExpandedItem, Placement, SheetLayout, NestSettings } from "./types";

interface SkylineNode {
  x: number;
  y: number;
  width: number;
}

class SkylineBin {
  private skyline: SkylineNode[];
  readonly binW: number;
  readonly binH: number;

  constructor(w: number, h: number) {
    this.binW = w;
    this.binH = h;
    this.skyline = [{ x: 0, y: 0, width: w }];
  }

  place(w: number, h: number): { x: number; y: number } | null {
    let bestY = Infinity;
    let bestX = 0;
    let bestIdx = -1;

    for (let i = 0; i < this.skyline.length; i++) {
      const result = this.fitAt(i, w, h);
      if (result !== null && result < bestY) {
        bestY = result;
        bestX = this.skyline[i].x;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return null;
    if (bestY + h > this.binH) return null;

    // Add new skyline node
    const newNode: SkylineNode = { x: bestX, y: bestY + h, width: w };
    this.skyline.splice(bestIdx, 0, newNode);

    // Trim overlapping nodes
    let idx = bestIdx + 1;
    while (idx < this.skyline.length) {
      const node = this.skyline[idx];
      const prevEnd = this.skyline[idx - 1].x + this.skyline[idx - 1].width;
      if (node.x < prevEnd) {
        const shrink = prevEnd - node.x;
        node.width -= shrink;
        node.x += shrink;
        if (node.width <= 0) {
          this.skyline.splice(idx, 1);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // Merge same-height adjacent nodes
    this.mergeSkyline();

    return { x: bestX, y: bestY };
  }

  /** Find the highest Y along the skyline for a rect of width w starting at node i */
  private fitAt(i: number, w: number, h: number): number | null {
    let x = this.skyline[i].x;
    if (x + w > this.binW) return null;

    let y = 0;
    let widthLeft = w;
    let idx = i;

    while (widthLeft > 0 && idx < this.skyline.length) {
      const node = this.skyline[idx];
      y = Math.max(y, node.y);
      if (y + h > this.binH) return null;
      widthLeft -= node.width;
      idx++;
    }

    return widthLeft <= 0 ? y : null;
  }

  private mergeSkyline() {
    let i = 0;
    while (i < this.skyline.length - 1) {
      if (this.skyline[i].y === this.skyline[i + 1].y) {
        this.skyline[i].width += this.skyline[i + 1].width;
        this.skyline.splice(i + 1, 1);
      } else {
        i++;
      }
    }
  }
}

export function packSkyline(
  items: ExpandedItem[],
  settings: NestSettings,
  binW?: number,
  binH?: number,
  isRemnant?: boolean,
  remnantId?: string,
  startSheetNumber = 1
): { sheets: SheetLayout[]; unplaced: { part_id: string; reason: string }[] } {
  const usableW = binW ?? (settings.sheet_width_mm - 2 * settings.margin_mm);
  const usableH = binH ?? (settings.sheet_length_mm - 2 * settings.margin_mm);
  const sheetArea = (binW ?? settings.sheet_width_mm) * (binH ?? settings.sheet_length_mm);

  const bins: { bin: SkylineBin; placements: Placement[] }[] = [];
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
      const bin = new SkylineBin(usableW, usableH);
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
        const bin2 = new SkylineBin(usableW, usableH);
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
