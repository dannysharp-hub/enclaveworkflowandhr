import JSZip from "jszip";
import { saveAs } from "file-saver";
import { NestResult } from "@/lib/nestingEngine";
import { supabase } from "@/integrations/supabase/client";

interface PartData {
  part_id: string;
  product_code: string;
  length_mm: number;
  width_mm: number;
  quantity: number;
  material_code: string | null;
  grain_required: boolean;
  grain_axis: string | null;
  rotation_allowed: string | null;
  dxf_file_reference: string | null;
}

interface InternalNestPackOptions {
  jobId: string;
  jobCode: string;
  groupLabel: string;
  materialCode: string;
  thickness: number | null;
  colour: string | null;
  sheetWidth: number;
  sheetLength: number;
  result: NestResult;
  parts: PartData[];
}

export async function generateInternalNestPack(options: InternalNestPackOptions): Promise<void> {
  const { jobId, jobCode, groupLabel, materialCode, thickness, colour, sheetWidth, sheetLength, result, parts } = options;
  const zip = new JSZip();
  const packName = `${jobCode}_InternalNest_${groupLabel}`;

  // Manifest
  const manifest = {
    version: "1.0",
    format: "enclave_internal_nest",
    job_id: jobId,
    job_code: jobCode,
    group_label: groupLabel,
    material_code: materialCode,
    thickness_mm: thickness,
    colour_name: colour,
    sheet_size: { width_mm: sheetWidth, length_mm: sheetLength },
    created_at: new Date().toISOString(),
    algorithm: result.algorithm,
    total_sheets: result.total_sheets,
    total_utilisation_percent: result.total_utilisation_percent,
    sheets: result.sheets.map(s => ({
      sheet_number: s.sheet_number,
      utilisation_percent: s.utilisation_percent,
      waste_area_mm2: s.waste_area_mm2,
      placement_count: s.placements.length,
    })),
  };
  zip.file("manifest/JobPack.json", JSON.stringify(manifest, null, 2));

  // Placements CSV
  const placementHeader = "job_id,group_label,sheet_number,part_id,instance_index,x_mm,y_mm,rotation_deg,width_mm,height_mm";
  const placementRows: string[] = [];
  for (const sheet of result.sheets) {
    for (const p of sheet.placements) {
      placementRows.push(`${jobCode},${groupLabel},${sheet.sheet_number},${p.part_id},${p.instance_index},${p.x_mm},${p.y_mm},${p.rotation_deg},${p.width_mm},${p.height_mm}`);
    }
  }
  zip.file("manifest/Placements.csv", [placementHeader, ...placementRows].join("\n"));

  // Parts CSV
  const partsHeader = "part_id,product_code,material_code,length_mm,width_mm,quantity,grain_required,rotation_allowed";
  const partsRows = parts.map(p => `${p.part_id},${p.product_code},${p.material_code || ""},${p.length_mm},${p.width_mm},${p.quantity},${p.grain_required},${p.rotation_allowed || "any"}`);
  zip.file("manifest/Parts.csv", [partsHeader, ...partsRows].join("\n"));

  // Sheets CSV
  const sheetsHeader = "sheet_number,width_mm,length_mm,utilisation_percent,waste_mm2,placement_count";
  const sheetsRows = result.sheets.map(s => `${s.sheet_number},${sheetWidth},${sheetLength},${s.utilisation_percent},${s.waste_area_mm2},${s.placements.length}`);
  zip.file("manifest/Sheets.csv", [sheetsHeader, ...sheetsRows].join("\n"));

  // Generate simple DXF per sheet (rectangle outlines for each placed part)
  for (const sheet of result.sheets) {
    const dxfContent = generateSheetDxf(sheet, sheetWidth, sheetLength, jobCode, groupLabel);
    zip.file(`dxf/sheets/${jobCode}_${groupLabel}_SHEET_${sheet.sheet_number}.dxf`, dxfContent);
  }

  // Try to include original DXFs
  for (const p of parts) {
    if (p.dxf_file_reference) {
      try {
        const { data } = await supabase.storage.from("dxf-files").download(p.dxf_file_reference);
        if (data) {
          zip.file(`dxf/parts/${p.part_id}.dxf`, data);
        }
      } catch {
        // Skip
      }
    }
  }

  // Operator instructions
  zip.file("readme/Operator_Instructions_InternalNest.txt", generateInstructions(jobCode, groupLabel, result));

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${packName}.zip`);
}

function generateSheetDxf(
  sheet: { sheet_number: number; placements: { x_mm: number; y_mm: number; width_mm: number; height_mm: number; part_id: string; rotation_deg: number }[] },
  sheetW: number,
  sheetH: number,
  jobCode: string,
  groupLabel: string
): string {
  let entities = "";
  let handle = 100;

  // Sheet outline
  entities += dxfRect(0, 0, sheetW, sheetH, "SHEET_OUTLINE", handle++);

  // Part placements
  for (const p of sheet.placements) {
    entities += dxfRect(p.x_mm, p.y_mm, p.width_mm, p.height_mm, "PARTS", handle++);
    // Part label text
    entities += dxfText(p.x_mm + 2, p.y_mm + 2, p.part_id, "LABELS", handle++, Math.min(p.width_mm, p.height_mm) * 0.15);
  }

  // Sheet info text
  entities += dxfText(5, sheetH - 15, `${jobCode} | ${groupLabel} | Sheet ${sheet.sheet_number}`, "INFO", handle++, 8);

  return `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
}

function dxfRect(x: number, y: number, w: number, h: number, layer: string, handle: number): string {
  return `0\nLWPOLYLINE\n5\n${handle.toString(16)}\n8\n${layer}\n90\n4\n70\n1\n` +
    `10\n${x}\n20\n${y}\n` +
    `10\n${x + w}\n20\n${y}\n` +
    `10\n${x + w}\n20\n${y + h}\n` +
    `10\n${x}\n20\n${y + h}\n`;
}

function dxfText(x: number, y: number, text: string, layer: string, handle: number, height: number = 5): string {
  return `0\nTEXT\n5\n${handle.toString(16)}\n8\n${layer}\n10\n${x}\n20\n${y}\n40\n${height}\n1\n${text}\n`;
}

function generateInstructions(jobCode: string, groupLabel: string, result: NestResult): string {
  return `============================================================
INTERNAL NESTING — OPERATOR INSTRUCTIONS
Job: ${jobCode} — Group: ${groupLabel}
Generated: ${new Date().toISOString()}
============================================================

NESTING SUMMARY:
  Algorithm: ${result.algorithm}
  Total Sheets: ${result.total_sheets}
  Overall Utilisation: ${result.total_utilisation_percent.toFixed(1)}%

SHEET DETAILS:
${result.sheets.map(s => `  Sheet ${s.sheet_number}: ${s.placements.length} parts, ${s.utilisation_percent.toFixed(1)}% utilised`).join("\n")}

WORKFLOW:
  1. Open each sheet DXF in VCarve Pro
  2. Parts are already positioned — DO NOT re-nest
  3. Apply toolpath template
  4. Calculate toolpaths
  5. Post-process for Fabertec M1
  6. Scan sheet QR code before cutting

IMPORTANT:
  - Parts are pre-nested; positions are final
  - Verify material/thickness matches the label
  - Report any issues before cutting
============================================================
`;
}
