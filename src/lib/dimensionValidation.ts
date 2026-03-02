/**
 * Dimension validation & sanity checks for nesting pre-flight.
 */

export interface DimIssue {
  part_id: string;
  product_code: string;
  library_part_id?: string | null;
  dxf_present: boolean;
  width_mm: number;
  height_mm: number;
  quantity: number;
  grain_required: boolean;
  rotation_allowed: string | null;
  missing_fields: string[];
  warnings: string[];
  blockers: string[];
}

export interface ValidationResult {
  valid: boolean;
  issues: DimIssue[];
  totalMissing: number;
  totalWarnings: number;
  totalBlockers: number;
}

interface PartForValidation {
  part_id: string;
  product_code: string;
  length_mm: number;
  width_mm: number;
  quantity: number;
  grain_required: boolean;
  grain_axis: string | null;
  rotation_allowed: string | null;
  dxf_file_reference: string | null;
  library_part_id?: string | null;
  bbox_width_mm?: number | null;
  bbox_height_mm?: number | null;
  bbox_source?: string | null;
  bbox_confidence?: string | null;
}

interface SheetInfo {
  usable_width: number;
  usable_height: number;
}

export function validatePartsForNesting(
  parts: PartForValidation[],
  sheet: SheetInfo
): ValidationResult {
  const issues: DimIssue[] = [];

  for (const p of parts) {
    const missing: string[] = [];
    const warnings: string[] = [];
    const blockers: string[] = [];

    // Resolve effective dimensions: manual > bbox > missing
    const effectiveW = (p.length_mm && p.length_mm > 0) ? p.length_mm : (p.bbox_width_mm && p.bbox_width_mm > 0 ? p.bbox_width_mm : 0);
    const effectiveH = (p.width_mm && p.width_mm > 0) ? p.width_mm : (p.bbox_height_mm && p.bbox_height_mm > 0 ? p.bbox_height_mm : 0);
    const usingBbox = effectiveW !== p.length_mm || effectiveH !== p.width_mm;

    // Missing field checks — only if neither manual nor bbox available
    if (effectiveW <= 0) missing.push("length_mm");
    if (effectiveH <= 0) missing.push("width_mm");
    if (!p.quantity || p.quantity < 1) missing.push("quantity");

    // Warn if using bbox as fallback
    if (usingBbox && effectiveW > 0 && effectiveH > 0) {
      warnings.push(`Using DXF-extracted dims (${effectiveW}×${effectiveH}mm) — no manual dims set`);
      if (p.bbox_confidence === "low") {
        warnings.push("DXF extraction confidence is LOW — verify dimensions");
      }
    }

    // Blocker checks
    if (p.length_mm < 0 || p.width_mm < 0) {
      blockers.push("Negative dimension values");
    }

    const w = effectiveW;
    const h = effectiveH;
    const canRotate = p.rotation_allowed !== "none" && !p.grain_required;

    if (w > 0 && h > 0) {
      const fitsNormal = w <= sheet.usable_width && h <= sheet.usable_height;
      const fitsRotated = h <= sheet.usable_width && w <= sheet.usable_height;
      if (!fitsNormal && !(canRotate && fitsRotated)) {
        blockers.push(
          `Part ${w}×${h}mm exceeds usable sheet ${sheet.usable_width}×${sheet.usable_height}mm`
        );
      }
    }

    // Warning checks
    if (w > 0 && w < 20) warnings.push(`Width ${w}mm is very small (<20mm)`);
    if (h > 0 && h < 20) warnings.push(`Height ${h}mm is very small (<20mm)`);
    if (w > 3000) warnings.push(`Width ${w}mm is unusually large (>3000mm)`);
    if (h > 3000) warnings.push(`Height ${h}mm is unusually large (>3000mm)`);
    if (w > 0 && h > 0) {
      const ratio = Math.max(w, h) / Math.min(w, h);
      if (ratio > 20) warnings.push(`Extreme aspect ratio (${ratio.toFixed(1)}:1)`);
    }

    // Mismatch between manual and extracted
    if (p.length_mm > 0 && p.width_mm > 0 && p.bbox_width_mm && p.bbox_height_mm && p.bbox_width_mm > 0 && p.bbox_height_mm > 0) {
      const wDiff = Math.abs(p.bbox_width_mm - p.length_mm) / p.length_mm * 100;
      const hDiff = Math.abs(p.bbox_height_mm - p.width_mm) / p.width_mm * 100;
      if (wDiff > 2 || hDiff > 2) {
        warnings.push(`DXF dims (${p.bbox_width_mm}×${p.bbox_height_mm}) differ from manual (${p.length_mm}×${p.width_mm}) by >${Math.max(wDiff, hDiff).toFixed(1)}%`);
      }
    }

    if (missing.length > 0 || warnings.length > 0 || blockers.length > 0) {
      issues.push({
        part_id: p.part_id,
        product_code: p.product_code,
        library_part_id: p.library_part_id,
        dxf_present: !!p.dxf_file_reference,
        width_mm: p.length_mm,
        height_mm: p.width_mm,
        quantity: p.quantity,
        grain_required: p.grain_required,
        rotation_allowed: p.rotation_allowed,
        missing_fields: missing,
        warnings,
        blockers,
      });
    }
  }

  const hasMissing = issues.some(i => i.missing_fields.length > 0);
  const hasBlockers = issues.some(i => i.blockers.length > 0);

  return {
    valid: !hasMissing && !hasBlockers,
    issues,
    totalMissing: issues.filter(i => i.missing_fields.length > 0).length,
    totalWarnings: issues.filter(i => i.warnings.length > 0).length,
    totalBlockers: issues.filter(i => i.blockers.length > 0).length,
  };
}

/** Generate CSV text for parts with missing dimensions */
export function exportMissingDimsCsv(issues: DimIssue[]): string {
  const header = "part_id,library_part_id,product_code,dxf_filename,outer_width_mm,outer_height_mm,quantity,grain_required,rotation_allowed";
  const rows = issues.map(i =>
    [
      i.part_id,
      i.library_part_id || "",
      i.product_code || "",
      i.dxf_present ? "yes" : "",
      i.width_mm > 0 ? i.width_mm : "",
      i.height_mm > 0 ? i.height_mm : "",
      i.quantity || "",
      i.grain_required ? "true" : "false",
      i.rotation_allowed || "any",
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

/** Parse a dimensions CSV and produce a diff against current parts */
export interface DimUpdate {
  part_id: string;
  matched_by: "library_part_id" | "part_id" | "dxf_filename";
  changes: {
    field: string;
    old_value: string | number | boolean;
    new_value: string | number | boolean;
  }[];
}

export function parseDimsCsv(
  csvText: string,
  currentParts: PartForValidation[]
): { updates: DimUpdate[]; errors: string[] } {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { updates: [], errors: ["CSV has no data rows"] };

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(",").map(h => h.trim());
  const updates: DimUpdate[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || "";
    });

    // Match part
    let match: PartForValidation | undefined;
    let matchedBy: DimUpdate["matched_by"] = "part_id";

    if (row.library_part_id) {
      match = currentParts.find(p => p.library_part_id === row.library_part_id);
      matchedBy = "library_part_id";
    }
    if (!match && row.part_id) {
      match = currentParts.find(p => p.part_id === row.part_id);
      matchedBy = "part_id";
    }

    if (!match) {
      errors.push(`Row ${i + 1}: No matching part found for "${row.part_id || row.library_part_id}"`);
      continue;
    }

    const changes: DimUpdate["changes"] = [];

    const newW = parseFloat(row.outer_width_mm);
    if (!isNaN(newW) && newW > 0 && newW !== match.length_mm) {
      changes.push({ field: "length_mm", old_value: match.length_mm, new_value: newW });
    }

    const newH = parseFloat(row.outer_height_mm);
    if (!isNaN(newH) && newH > 0 && newH !== match.width_mm) {
      changes.push({ field: "width_mm", old_value: match.width_mm, new_value: newH });
    }

    const newQty = parseInt(row.quantity);
    if (!isNaN(newQty) && newQty > 0 && newQty !== match.quantity) {
      changes.push({ field: "quantity", old_value: match.quantity, new_value: newQty });
    }

    if (row.grain_required) {
      const newGrain = row.grain_required === "true" || row.grain_required === "1" || row.grain_required === "yes";
      if (newGrain !== match.grain_required) {
        changes.push({ field: "grain_required", old_value: match.grain_required, new_value: newGrain });
      }
    }

    if (row.rotation_allowed && row.rotation_allowed !== (match.rotation_allowed || "any")) {
      changes.push({ field: "rotation_allowed", old_value: match.rotation_allowed || "any", new_value: row.rotation_allowed });
    }

    if (changes.length > 0) {
      updates.push({ part_id: match.part_id, matched_by: matchedBy, changes });
    }
  }

  return { updates, errors };
}
