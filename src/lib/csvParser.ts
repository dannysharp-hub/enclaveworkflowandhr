import Papa from "papaparse";

export interface CsvPart {
  part_id: string;
  product_code: string;
  length_mm: number;
  width_mm: number;
  quantity: number;
  thickness_mm?: number;
  material_code?: string;
  grain_required: boolean;
  grain_axis?: string;
  rotation_allowed?: string;
  nestable: boolean;
  flags: string[];
}

export interface CsvParseResult {
  parts: CsvPart[];
  errors: string[];
  warnings: string[];
  summary: {
    totalRows: number;
    imported: number;
    skipped: number;
    needsReview: number;
  };
}

// Normalise header names to our expected keys
const HEADER_MAP: Record<string, string> = {
  // Part ID mappings
  "part_id": "part_id",
  "partid": "part_id",
  "part id": "part_id",
  "part": "part_id",
  "id": "part_id",
  "part_number": "part_id",
  "partnumber": "part_id",
  "part number": "part_id",
  "partno": "part_id",
  "part_no": "part_id",
  // Product code / Material mappings
  "product_code": "product_code",
  "productcode": "product_code",
  "product code": "product_code",
  "product": "product_code",
  "code": "product_code",
  "material": "product_code",
  "mat": "product_code",
  "material_code": "product_code",
  // Quantity mappings
  "quantity": "quantity",
  "qty": "quantity",
  "q": "quantity",
  // Dimension mappings (standalone columns)
  "length_mm": "length_mm",
  "length": "length_mm",
  "l": "length_mm",
  "width_mm": "width_mm",
  "width": "width_mm",
  "w": "width_mm",
  "thickness_mm": "thickness_mm",
  "thickness": "thickness_mm",
  "thk": "thickness_mm",
  // Combined dimensions column
  "dimensions": "dimensions",
  "dims": "dimensions",
  "size": "dimensions",
  // Grain mappings
  "grain_required": "grain",
  "grain": "grain",
  "grain_direction": "grain",
  "orientation": "grain",
  // Grain axis
  "grain_axis": "grain_axis",
  "axis": "grain_axis",
  // Rotation
  "rotation_allowed": "rotation_allowed",
  "rotation": "rotation_allowed",
};

function normaliseHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  // Try exact match first, then stripped
  return HEADER_MAP[key] || HEADER_MAP[key.replace(/_/g, "")] || key;
}

/**
 * Parse a combined dimension string like "323.5 X 2220 X 18.5"
 * Returns { width, height, thickness? } or null
 */
function parseDimensionString(dim: string): { width: number; height: number; thickness?: number } | null {
  if (!dim || typeof dim !== "string") return null;
  // Match patterns like "323.5 X 2220 X 18.5" or "323.5x2220x18.5" or "323.5 x 2220"
  const parts = dim.trim().split(/\s*[xX×]\s*/);
  if (parts.length < 2) return null;

  const nums = parts.map(p => parseFloat(p.trim()));
  if (nums.some(n => isNaN(n) || n <= 0)) return null;

  if (nums.length >= 3) {
    return { width: nums[0], height: nums[1], thickness: nums[2] };
  }
  return { width: nums[0], height: nums[1] };
}

/**
 * Resolve grain/rotation rules from grain value.
 * BOM uses H/V, DB expects L/W for grain_axis.
 * H (horizontal) → W (width), V (vertical) → L (length)
 * Grain present → rotation restricted to 0_or_180
 * No grain → rotation = any
 */
function resolveGrainRules(grainRaw: string | undefined): {
  grain_required: boolean;
  grain_axis?: string;
  rotation_allowed: string;
} {
  const g = (grainRaw || "").toString().trim().toUpperCase();
  if (g === "H") {
    return { grain_required: true, grain_axis: "W", rotation_allowed: "0_or_180" };
  }
  if (g === "V") {
    return { grain_required: true, grain_axis: "L", rotation_allowed: "0_or_180" };
  }
  // Also accept L/W directly
  if (g === "L" || g === "W") {
    return { grain_required: true, grain_axis: g, rotation_allowed: "0_or_180" };
  }
  return { grain_required: false, grain_axis: undefined, rotation_allowed: "any" };
}

export function parseCsv(text: string): CsvParseResult {
  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: normaliseHeader,
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  const parts: CsvPart[] = [];
  const totalRows = result.data.length;
  let skipped = 0;
  let needsReview = 0;

  result.data.forEach((row: any, idx: number) => {
    const lineNum = idx + 2; // 1-indexed + header
    const flags: string[] = [];

    // --- Part ID (required) ---
    const partId = (row.part_id || "").toString().trim();
    if (!partId) {
      errors.push(`Row ${lineNum}: Missing Part Number — row rejected`);
      skipped++;
      return;
    }

    // --- Quantity ---
    let qty = parseInt(row.quantity);
    if (isNaN(qty) || qty < 1) {
      qty = 1;
      if (!row.quantity || row.quantity.toString().trim() === "") {
        flags.push("QTY blank — defaulted to 1");
      }
    }

    // --- Product Code / Material ---
    let productCode = (row.product_code || "").toString().trim();
    if (!productCode) {
      productCode = "UNASSIGNED";
      flags.push("Material blank — set to UNASSIGNED");
    }

    // --- Dimensions ---
    let lengthMm = parseFloat(row.length_mm);
    let widthMm = parseFloat(row.width_mm);
    let thicknessMm: number | undefined = row.thickness_mm ? parseFloat(row.thickness_mm) : undefined;

    // Try combined dimensions column if individual dims not found
    if ((isNaN(lengthMm) || lengthMm <= 0) && (isNaN(widthMm) || widthMm <= 0) && row.dimensions) {
      const parsed = parseDimensionString(row.dimensions);
      if (parsed) {
        lengthMm = parsed.width;
        widthMm = parsed.height;
        if (parsed.thickness) thicknessMm = parsed.thickness;
      }
    }

    const hasDims = !isNaN(lengthMm) && lengthMm > 0 && !isNaN(widthMm) && widthMm > 0;
    let nestable = true;

    if (!hasDims) {
      nestable = false;
      flags.push("Dimensions missing — not nestable");
      warnings.push(`Row ${lineNum} (${partId}): Missing dimensions — imported but not nestable`);
      needsReview++;
      // Default to 0 so the row still imports
      if (isNaN(lengthMm) || lengthMm <= 0) lengthMm = 0;
      if (isNaN(widthMm) || widthMm <= 0) widthMm = 0;
    }

    // --- Grain / Rotation rules ---
    // Check both "grain" and "grain_axis" columns
    const grainRaw = (row.grain || row.grain_axis || "").toString().trim();
    const grainRules = resolveGrainRules(grainRaw);

    if (flags.length > 0 && !flags.some(f => f.includes("Dimensions missing"))) {
      needsReview++;
    } else if (flags.length > 0 && !flags.some(f => f.includes("Dimensions missing"))) {
      // already counted
    }
    // Count review for non-dim flags
    if (flags.length > 0 && !flags.some(f => f.includes("Dimensions missing"))) {
      // We already incremented needsReview above for dims; count material/qty flags separately
    }

    parts.push({
      part_id: partId,
      product_code: productCode,
      length_mm: lengthMm,
      width_mm: widthMm,
      quantity: qty,
      thickness_mm: thicknessMm && !isNaN(thicknessMm) ? thicknessMm : undefined,
      material_code: productCode !== "UNASSIGNED" ? productCode : undefined,
      grain_required: grainRules.grain_required,
      grain_axis: grainRules.grain_axis,
      rotation_allowed: grainRules.rotation_allowed,
      nestable,
      flags,
    });
  });

  // Count items needing review (has any flags) — but don't double-count
  const actualNeedsReview = parts.filter(p => p.flags.length > 0).length;

  return {
    parts,
    errors,
    warnings,
    summary: {
      totalRows,
      imported: parts.length,
      skipped,
      needsReview: actualNeedsReview,
    },
  };
}
