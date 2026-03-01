import Papa from "papaparse";

export interface CsvPart {
  part_id: string;
  product_code: string;
  length_mm: number;
  width_mm: number;
  quantity: number;
  material_code?: string;
  grain_required?: boolean;
  grain_axis?: string;
  rotation_allowed?: string;
}

// Normalise header names to our expected keys
const HEADER_MAP: Record<string, string> = {
  "part_id": "part_id",
  "partid": "part_id",
  "part id": "part_id",
  "part": "part_id",
  "id": "part_id",
  "product_code": "product_code",
  "productcode": "product_code",
  "product code": "product_code",
  "product": "product_code",
  "code": "product_code",
  "length_mm": "length_mm",
  "length": "length_mm",
  "l": "length_mm",
  "width_mm": "width_mm",
  "width": "width_mm",
  "w": "width_mm",
  "quantity": "quantity",
  "qty": "quantity",
  "q": "quantity",
  "material_code": "material_code",
  "material": "material_code",
  "mat": "material_code",
  "grain_required": "grain_required",
  "grain": "grain_required",
  "grain_axis": "grain_axis",
  "axis": "grain_axis",
  "rotation_allowed": "rotation_allowed",
  "rotation": "rotation_allowed",
};

function normaliseHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return HEADER_MAP[key] || key;
}

export function parseCsv(text: string): { parts: CsvPart[]; errors: string[] } {
  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: normaliseHeader,
  });

  const errors: string[] = [];
  const parts: CsvPart[] = [];

  result.data.forEach((row: any, idx: number) => {
    const lineNum = idx + 2; // 1-indexed + header
    const partId = (row.part_id || "").toString().trim();
    const productCode = (row.product_code || "").toString().trim();
    const lengthMm = parseFloat(row.length_mm);
    const widthMm = parseFloat(row.width_mm);
    const qty = parseInt(row.quantity) || 1;

    if (!partId) { errors.push(`Row ${lineNum}: Missing part_id`); return; }
    if (!productCode) { errors.push(`Row ${lineNum}: Missing product_code`); return; }
    if (isNaN(lengthMm) || lengthMm <= 0) { errors.push(`Row ${lineNum}: Invalid length`); return; }
    if (isNaN(widthMm) || widthMm <= 0) { errors.push(`Row ${lineNum}: Invalid width`); return; }
    if (qty < 1) { errors.push(`Row ${lineNum}: Invalid quantity`); return; }

    parts.push({
      part_id: partId,
      product_code: productCode,
      length_mm: lengthMm,
      width_mm: widthMm,
      quantity: qty,
      material_code: (row.material_code || "").toString().trim() || undefined,
      grain_required: row.grain_required === "true" || row.grain_required === "1" || row.grain_required === "yes",
      grain_axis: (row.grain_axis || "").toString().trim() || undefined,
      rotation_allowed: (row.rotation_allowed || "").toString().trim() || undefined,
    });
  });

  return { parts, errors };
}
