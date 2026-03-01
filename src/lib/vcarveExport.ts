import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";

interface ExportPart {
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

export async function generateVCarveExportPack(
  jobId: string,
  jobCode: string,
  parts: ExportPart[],
  tenantId?: string | null
): Promise<void> {
  const zip = new JSZip();

  // Group parts by material
  const byMaterial = new Map<string, ExportPart[]>();
  for (const p of parts) {
    const mat = p.material_code || "UNKNOWN";
    if (!byMaterial.has(mat)) byMaterial.set(mat, []);
    byMaterial.get(mat)!.push(p);
  }

  // Generate CSV per material
  for (const [material, matParts] of byMaterial) {
    const folder = zip.folder(material)!;

    // VCarve-compatible CSV: Part ID, Length, Width, Qty, Grain, Rotation
    const csvHeader = "Part ID,Product Code,Length,Width,Qty,Grain Required,Grain Axis,Rotation Allowed";
    const csvRows = matParts.map(p =>
      `${p.part_id},${p.product_code},${p.length_mm},${p.width_mm},${p.quantity},${p.grain_required},${p.grain_axis || "L"},${p.rotation_allowed || "any"}`
    );
    folder.file(`${jobCode}_${material}_parts.csv`, [csvHeader, ...csvRows].join("\n"));

    // Download DXF files from storage
    for (const p of matParts) {
      if (p.dxf_file_reference) {
        try {
          const { data, error } = await supabase.storage
            .from("dxf-files")
            .download(p.dxf_file_reference);
          if (data && !error) {
            folder.file(`${p.part_id}.dxf`, data);
          }
        } catch {
          // Skip missing DXF files silently
        }
      }
    }
  }

  // Add a summary manifest
  const manifest = {
    job_id: jobCode,
    tenant_id: tenantId || undefined,
    exported_at: new Date().toISOString(),
    total_parts: parts.reduce((s, p) => s + p.quantity, 0),
    unique_parts: parts.length,
    materials: Array.from(byMaterial.keys()),
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${jobCode}_VCarve_Pack.zip`);
}
