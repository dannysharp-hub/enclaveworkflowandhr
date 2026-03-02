import JSZip from "jszip";
import { saveAs } from "file-saver";
import { NestResult, NestCandidate } from "@/lib/nesting";
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
  bbox_width_mm?: number | null;
  bbox_height_mm?: number | null;
  bbox_source?: string | null;
  bbox_confidence?: string | null;
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
  candidates?: NestCandidate[];
}

export async function generateInternalNestPack(options: InternalNestPackOptions & { uploadToDrive?: boolean }): Promise<void> {
  const { jobId, jobCode, groupLabel, materialCode, thickness, colour, sheetWidth, sheetLength, result, parts, candidates } = options;
  const zip = new JSZip();
  const packName = `${jobCode}_InternalNest_${groupLabel}`;

  // Manifest
  const manifest = {
    version: "2.0",
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
    min_sheet_utilisation_percent: result.min_sheet_utilisation_percent,
    remnant_area_used_mm2: result.remnant_area_used_mm2,
    result_hash: result.result_hash,
    candidates_evaluated: candidates?.length ?? 1,
    sheets: result.sheets.map(s => ({
      sheet_number: s.sheet_number,
      utilisation_percent: s.utilisation_percent,
      waste_area_mm2: s.waste_area_mm2,
      placement_count: s.placements.length,
      is_remnant: s.is_remnant || false,
      remnant_id: s.remnant_id,
    })),
  };
  zip.file("manifest/JobPack.json", JSON.stringify(manifest, null, 2));

  // Placements CSV
  const placementHeader = "job_id,group_label,sheet_number,part_id,instance_index,x_mm,y_mm,rotation_deg,width_mm,height_mm,is_remnant_sheet";
  const placementRows: string[] = [];
  for (const sheet of result.sheets) {
    for (const p of sheet.placements) {
      placementRows.push(`${jobCode},${groupLabel},${sheet.sheet_number},${p.part_id},${p.instance_index},${p.x_mm},${p.y_mm},${p.rotation_deg},${p.width_mm},${p.height_mm},${sheet.is_remnant || false}`);
    }
  }
  zip.file("manifest/Placements.csv", [placementHeader, ...placementRows].join("\n"));

  // Parts CSV (with bbox fields)
  const partsHeader = "part_id,product_code,material_code,length_mm,width_mm,quantity,grain_required,rotation_allowed,bbox_width_mm,bbox_height_mm,bbox_source,bbox_confidence";
  const partsRows = parts.map(p => `${p.part_id},${p.product_code},${p.material_code || ""},${p.length_mm},${p.width_mm},${p.quantity},${p.grain_required},${p.rotation_allowed || "any"},${p.bbox_width_mm || ""},${p.bbox_height_mm || ""},${p.bbox_source || ""},${p.bbox_confidence || ""}`);
  zip.file("manifest/Parts.csv", [partsHeader, ...partsRows].join("\n"));

  // Sheets CSV
  const sheetsHeader = "sheet_number,width_mm,length_mm,utilisation_percent,waste_mm2,placement_count,is_remnant,remnant_id";
  const sheetsRows = result.sheets.map(s =>
    `${s.sheet_number},${s.is_remnant ? s.remnant_width_mm : sheetWidth},${s.is_remnant ? s.remnant_height_mm : sheetLength},${s.utilisation_percent},${s.waste_area_mm2},${s.placements.length},${s.is_remnant || false},${s.remnant_id || ""}`
  );
  zip.file("manifest/Sheets.csv", [sheetsHeader, ...sheetsRows].join("\n"));

  // OptimisationRuns.csv (V2)
  if (candidates && candidates.length > 0) {
    const optHeader = "run_index,algorithm,sheet_count,utilisation_percent,min_sheet_utilisation_percent,remnant_area_mm2,selected";
    const optRows = candidates.map(c =>
      `${c.run_index},${c.algorithm},${c.result.total_sheets},${c.result.total_utilisation_percent},${c.result.min_sheet_utilisation_percent ?? 0},${c.result.remnant_area_used_mm2 ?? 0},${c.result.result_hash === result.result_hash}`
    );
    zip.file("manifest/OptimisationRuns.csv", [optHeader, ...optRows].join("\n"));
  }

  // RemnantsUsed.csv (V2)
  const remnantSheets = result.sheets.filter(s => s.is_remnant);
  if (remnantSheets.length > 0) {
    const remnantHeader = "sheet_number,remnant_id,width_mm,height_mm,utilisation_percent,parts_placed";
    const remnantRows = remnantSheets.map(s =>
      `${s.sheet_number},${s.remnant_id || ""},${s.remnant_width_mm || 0},${s.remnant_height_mm || 0},${s.utilisation_percent},${s.placements.length}`
    );
    zip.file("manifest/RemnantsUsed.csv", [remnantHeader, ...remnantRows].join("\n"));
  }

  // DXF per sheet
  for (const sheet of result.sheets) {
    const effectiveW = sheet.is_remnant && sheet.remnant_width_mm ? sheet.remnant_width_mm : sheetWidth;
    const effectiveH = sheet.is_remnant && sheet.remnant_height_mm ? sheet.remnant_height_mm : sheetLength;
    const dxfContent = generateSheetDxf(sheet, effectiveW, effectiveH, jobCode, groupLabel);
    zip.file(`dxf/sheets/${jobCode}_${groupLabel}_SHEET_${sheet.sheet_number}.dxf`, dxfContent);
  }

  // Original DXFs
  for (const p of parts) {
    if (p.dxf_file_reference) {
      try {
        const { data } = await supabase.storage.from("dxf-files").download(p.dxf_file_reference);
        if (data) zip.file(`dxf/parts/${p.part_id}.dxf`, data);
      } catch { /* Skip */ }
    }
  }

  // Operator instructions
  zip.file("readme/Operator_Instructions_InternalNest.txt", generateInstructions(jobCode, groupLabel, result));

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${packName}.zip`);

  // Upload to Drive if requested
  if (options.uploadToDrive) {
    try {
      const { uploadToDrive: upload } = await import("@/lib/driveUpload");
      const timestamp = new Date().toISOString().slice(0, 10);
      await upload(options.jobId, `${options.jobCode}-InternalNest-${options.groupLabel}-${timestamp}.zip`, blob, "Nesting", "application/zip");
    } catch (err) {
      console.warn("Drive upload failed (non-blocking):", err);
    }
  }
}

function generateSheetDxf(
  sheet: { sheet_number: number; placements: { x_mm: number; y_mm: number; width_mm: number; height_mm: number; part_id: string; rotation_deg: number }[] },
  sheetW: number, sheetH: number, jobCode: string, groupLabel: string
): string {
  let entities = "";
  let handle = 100;
  entities += dxfRect(0, 0, sheetW, sheetH, "SHEET_OUTLINE", handle++);
  for (const p of sheet.placements) {
    entities += dxfRect(p.x_mm, p.y_mm, p.width_mm, p.height_mm, "PARTS", handle++);
    entities += dxfText(p.x_mm + 2, p.y_mm + 2, p.part_id, "LABELS", handle++, Math.min(p.width_mm, p.height_mm) * 0.15);
  }
  entities += dxfText(5, sheetH - 15, `${jobCode} | ${groupLabel} | Sheet ${sheet.sheet_number}`, "INFO", handle++, 8);
  return `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
}

function dxfRect(x: number, y: number, w: number, h: number, layer: string, handle: number): string {
  return `0\nLWPOLYLINE\n5\n${handle.toString(16)}\n8\n${layer}\n90\n4\n70\n1\n` +
    `10\n${x}\n20\n${y}\n10\n${x + w}\n20\n${y}\n10\n${x + w}\n20\n${y + h}\n10\n${x}\n20\n${y + h}\n`;
}

function dxfText(x: number, y: number, text: string, layer: string, handle: number, height: number = 5): string {
  return `0\nTEXT\n5\n${handle.toString(16)}\n8\n${layer}\n10\n${x}\n20\n${y}\n40\n${height}\n1\n${text}\n`;
}

function generateInstructions(jobCode: string, groupLabel: string, result: NestResult): string {
  const remnantSheets = result.sheets.filter(s => s.is_remnant);
  return `============================================================
INTERNAL NESTING V2 — OPERATOR INSTRUCTIONS
Job: ${jobCode} — Group: ${groupLabel}
Generated: ${new Date().toISOString()}
============================================================

NESTING SUMMARY:
  Algorithm: ${result.algorithm}
  Total Sheets: ${result.total_sheets}
  Overall Utilisation: ${result.total_utilisation_percent.toFixed(1)}%
  Min Sheet Utilisation: ${(result.min_sheet_utilisation_percent ?? 0).toFixed(1)}%
${remnantSheets.length > 0 ? `  Remnants Used: ${remnantSheets.length}` : ""}

SHEET DETAILS:
${result.sheets.map(s => `  ${s.is_remnant ? "♻️ Remnant" : "Sheet"} ${s.sheet_number}: ${s.placements.length} parts, ${s.utilisation_percent.toFixed(1)}% utilised${s.is_remnant ? ` (${s.remnant_width_mm}×${s.remnant_height_mm}mm)` : ""}`).join("\n")}

WORKFLOW:
  1. Open each sheet DXF in VCarve Pro
  2. Parts are already positioned — DO NOT re-nest
  3. Apply toolpath template
  4. Calculate toolpaths
  5. Post-process for Fabertec M1
  6. Scan sheet QR code before cutting
${remnantSheets.length > 0 ? `
REMNANT NOTES:
  - ${remnantSheets.length} remnant sheet(s) are used in this layout
  - Verify remnant stock matches the specified dimensions
  - Remnants are marked as RESERVED until cutting completes
` : ""}
IMPORTANT:
  - Parts are pre-nested; positions are final
  - Verify material/thickness matches the label
  - Report any issues before cutting
============================================================
`;
}
