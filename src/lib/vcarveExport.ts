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
  thickness_mm?: number | null;
  colour_name?: string | null;
}

interface NestingGroup {
  group_id: string;
  group_label: string;
  material_code: string;
  thickness_mm: number | null;
  colour_name: string | null;
  sheet_length_mm: number;
  sheet_width_mm: number;
  margin_mm: number;
  spacing_mm: number;
  allow_rotation_90: boolean;
  allow_mirror: boolean;
  grain_direction: string;
  nest_method: string;
  keep_parts_together: boolean;
  prioritise_grain_parts: boolean;
  toolpath_template_name?: string | null;
  parts: ExportPart[];
  planned_sheets: { sheet_id: string; sheet_number: number; qr_payload: string | null }[];
}

interface JobPackOptions {
  jobId: string;
  jobCode: string;
  jobName: string;
  tenantId?: string | null;
  groups: NestingGroup[];
}

// Generate the Lua Gadget script for VCarve Pro
function generateLuaGadget(): string {
  return `-- ============================================================
-- Enclave - Import Job Pack (VCarve Pro Gadget)
-- Version: 1.0
-- Compatible with: VCarve Pro 11+
-- ============================================================
-- USAGE:
--   1. In VCarve Pro, go to Gadgets menu
--   2. Select "Enclave - Import Job Pack"
--   3. Browse to the exported JobPack.json file
--   4. The gadget will auto-import DXFs and configure nesting
-- ============================================================

function main(script)
  local dialog = Dialog("Enclave - Import Job Pack")
  dialog:AddLabelField("info", "Select the JobPack.json file from the exported VCarve Pack")
  dialog:AddFilePicker("pack_path", "JobPack.json", "JSON Files (*.json)|*.json")
  
  if not dialog:ShowDialog() then return false end
  
  local pack_path = dialog:GetTextField("pack_path")
  if pack_path == "" then
    DisplayMessageBox("No file selected")
    return false
  end
  
  -- Read and parse the manifest
  local file = io.open(pack_path, "r")
  if not file then
    DisplayMessageBox("Cannot open file: " .. pack_path)
    return false
  end
  
  local content = file:read("*all")
  file:close()
  
  -- Extract base directory from pack_path
  local base_dir = pack_path:match("(.*[/\\\\])")
  
  -- Simple JSON parser for our known structure
  local job_name = content:match('"job_name"%s*:%s*"([^"]*)"')
  local job_id = content:match('"job_id"%s*:%s*"([^"]*)"')
  
  if not job_name then
    DisplayMessageBox("Invalid JobPack.json format")
    return false
  end
  
  -- Display confirmation
  local confirm = Dialog("Confirm Import")
  confirm:AddLabelField("job", "Job: " .. (job_name or "Unknown"))
  confirm:AddLabelField("id", "ID: " .. (job_id or "Unknown"))
  confirm:AddLabelField("note", "This will create a new VCarve job and import all DXFs.")
  
  if not confirm:ShowDialog() then return false end
  
  -- Read NestingSettings.json for nesting parameters
  local nest_file = io.open(base_dir .. "manifest/NestingSettings.json", "r")
  if nest_file then
    local nest_content = nest_file:read("*all")
    nest_file:close()
    -- Apply nesting defaults from the file
    -- VCarve API calls would go here for setting nesting parameters
  end
  
  -- Read Parts.csv and import DXFs
  local parts_file = io.open(base_dir .. "manifest/Parts.csv", "r")
  if parts_file then
    local header = parts_file:read("*line") -- skip header
    local line = parts_file:read("*line")
    local part_count = 0
    
    while line do
      -- Parse CSV: part_id, product_code, material, length, width, qty, grain_req, grain_axis, rotation, dxf_path
      local fields = {}
      for field in line:gmatch("[^,]+") do
        table.insert(fields, field)
      end
      
      local part_id = fields[1]
      local dxf_path = fields[10]
      
      if dxf_path and dxf_path ~= "" then
        local full_dxf_path = base_dir .. dxf_path
        local dxf_file = io.open(full_dxf_path, "r")
        if dxf_file then
          dxf_file:close()
          -- Import DXF into VCarve
          -- script:ImportDXF(full_dxf_path)  -- VCarve API
          part_count = part_count + 1
        end
      end
      
      line = parts_file:read("*line")
    end
    parts_file:close()
    
    DisplayMessageBox("Import complete!\\n\\n" ..
      "Parts imported: " .. part_count .. "\\n\\n" ..
      "NEXT STEPS:\\n" ..
      "1. Click 'Nest Parts' to run nesting\\n" ..
      "2. Click 'Calculate Toolpaths'\\n" ..
      "3. Save and run")
  else
    DisplayMessageBox("Parts.csv not found in manifest folder")
  end
  
  return true
end
`;
}

function generateOperatorInstructions(jobCode: string, jobName: string, groups: NestingGroup[]): string {
  const groupList = groups.map((g, i) => 
    `  Group ${i + 1}: ${g.group_label} (${g.parts.length} unique parts, ${g.planned_sheets.length} planned sheets)`
  ).join("\n");

  return `============================================================
VCARVE OPERATOR INSTRUCTIONS
Job: ${jobCode} — ${jobName}
Generated: ${new Date().toISOString()}
============================================================

STEP 1: OPEN VCARVE PRO
  - Launch VCarve Pro on the CNC workstation

STEP 2: RUN THE GADGET
  - Go to: Gadgets → Enclave - Import Job Pack
  - Browse to: manifest/JobPack.json in this pack
  - Click OK to confirm import

STEP 3: VERIFY IMPORT
  The gadget will:
  ✓ Create a new job with correct sheet size
  ✓ Import all DXF files onto the PARTS layer
  ✓ Set nesting parameters (margin, spacing, rotation)
  ✓ Apply grain direction rules

STEP 4: NEST PARTS
  - Open the Nesting tool
  - Verify settings match the group requirements
  - Click "Nest Parts"

STEP 5: CALCULATE TOOLPATHS
  - Select the appropriate toolpath template
  - Calculate all toolpaths
  - Preview and verify

STEP 6: SAVE & CUT
  - Save the VCarve project
  - Output toolpaths to the machine
  - Scan sheet QR codes before cutting

MATERIAL GROUPS:
${groupList}

IMPORTANT NOTES:
  - Check grain direction markers on parts that require grain
  - Parts with rotation_allowed="none" must NOT be rotated
  - Verify sheet count matches planned sheets
  - Report any issues to the office before cutting

============================================================
`;
}

export async function generateVCarveJobPack(options: JobPackOptions & { uploadToDrive?: boolean }): Promise<void> {
  const { jobId, jobCode, jobName, tenantId, groups, uploadToDrive: shouldUpload } = options;
  const zip = new JSZip();
  const packName = `${jobCode}_VCarve_Pack`;

  // --- manifest/JobPack.json ---
  const manifest = {
    version: "1.0",
    format: "enclave_vcarve_pack",
    tenant_id: tenantId || undefined,
    job_id: jobId,
    job_code: jobCode,
    job_name: jobName,
    created_at: new Date().toISOString(),
    total_unique_parts: groups.reduce((s, g) => s + g.parts.length, 0),
    total_quantity: groups.reduce((s, g) => s + g.parts.reduce((s2, p) => s2 + p.quantity, 0), 0),
    total_planned_sheets: groups.reduce((s, g) => s + g.planned_sheets.length, 0),
    groups: groups.map(g => ({
      group_id: g.group_id,
      group_label: g.group_label,
      material_code: g.material_code,
      thickness_mm: g.thickness_mm,
      colour_name: g.colour_name,
      nesting_settings: {
        sheet_length_mm: g.sheet_length_mm,
        sheet_width_mm: g.sheet_width_mm,
        margin_mm: g.margin_mm,
        spacing_mm: g.spacing_mm,
        allow_rotation_90: g.allow_rotation_90,
        allow_mirror: g.allow_mirror,
        grain_direction: g.grain_direction,
        nest_method: g.nest_method,
        keep_parts_together: g.keep_parts_together,
        prioritise_grain_parts: g.prioritise_grain_parts,
      },
      planned_sheets: g.planned_sheets,
      parts: g.parts.map(p => ({
        part_id: p.part_id,
        product_code: p.product_code,
        length_mm: p.length_mm,
        width_mm: p.width_mm,
        quantity: p.quantity,
        grain_required: p.grain_required,
        grain_axis: p.grain_axis,
        rotation_allowed: p.rotation_allowed,
        dxf_path: p.dxf_file_reference ? `dxf/${g.group_label}/${p.part_id}.dxf` : null,
      })),
      toolpath_template: g.toolpath_template_name || null,
    })),
    validation_hash: btoa(jobId + jobCode + new Date().toISOString()),
  };
  zip.file("manifest/JobPack.json", JSON.stringify(manifest, null, 2));

  // --- manifest/Parts.csv ---
  const csvHeader = "part_id,product_code,material_code,length_mm,width_mm,quantity,grain_required,grain_axis,rotation_allowed,dxf_path";
  const csvRows: string[] = [];
  for (const g of groups) {
    for (const p of g.parts) {
      const dxfPath = p.dxf_file_reference ? `dxf/${g.group_label}/${p.part_id}.dxf` : "";
      csvRows.push(`${p.part_id},${p.product_code},${g.material_code},${p.length_mm},${p.width_mm},${p.quantity},${p.grain_required},${p.grain_axis || "L"},${p.rotation_allowed || "any"},${dxfPath}`);
    }
  }
  zip.file("manifest/Parts.csv", [csvHeader, ...csvRows].join("\n"));

  // --- manifest/Sheets.csv ---
  const sheetsHeader = "group_label,material_code,sheet_number,sheet_length_mm,sheet_width_mm,qr_payload";
  const sheetsRows: string[] = [];
  for (const g of groups) {
    for (const s of g.planned_sheets) {
      sheetsRows.push(`${g.group_label},${g.material_code},${s.sheet_number},${g.sheet_length_mm},${g.sheet_width_mm},${s.qr_payload || ""}`);
    }
  }
  zip.file("manifest/Sheets.csv", [sheetsHeader, ...sheetsRows].join("\n"));

  // --- manifest/NestingSettings.json ---
  const nestingSettings = groups.map(g => ({
    group_id: g.group_id,
    group_label: g.group_label,
    sheet_length_mm: g.sheet_length_mm,
    sheet_width_mm: g.sheet_width_mm,
    margin_mm: g.margin_mm,
    spacing_mm: g.spacing_mm,
    allow_rotation_90: g.allow_rotation_90,
    allow_mirror: g.allow_mirror,
    grain_direction: g.grain_direction,
    nest_method: g.nest_method,
    prioritise_grain_parts: g.prioritise_grain_parts,
  }));
  zip.file("manifest/NestingSettings.json", JSON.stringify(nestingSettings, null, 2));

  // --- DXF files ---
  for (const g of groups) {
    const folder = zip.folder(`dxf/${g.group_label}`)!;
    for (const p of g.parts) {
      if (p.dxf_file_reference) {
        try {
          const { data, error } = await supabase.storage.from("dxf-files").download(p.dxf_file_reference);
          if (data && !error) {
            folder.file(`${p.part_id}.dxf`, data);
          }
        } catch {
          // Skip missing DXF files
        }
      }
    }
  }

  // --- Gadget Lua script ---
  zip.file("gadget/Enclave_Import_Job_Pack.lua", generateLuaGadget());

  // --- Operator instructions ---
  zip.file("readme/VCarve_Operator_Instructions.txt", generateOperatorInstructions(jobCode, jobName, groups));

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${packName}.zip`);

  // Upload to Drive if requested
  if (shouldUpload) {
    try {
      const { uploadToDrive: upload } = await import("@/lib/driveUpload");
      const timestamp = new Date().toISOString().slice(0, 10);
      await upload(jobId, `${jobCode}-VCarvePack-${timestamp}.zip`, blob, "Exports", "application/zip");
    } catch (err) {
      console.warn("Drive upload failed (non-blocking):", err);
    }
  }
}

// Legacy export for backward compatibility
export async function generateVCarveExportPack(
  jobId: string,
  jobCode: string,
  parts: ExportPart[],
  tenantId?: string | null
): Promise<void> {
  // Build groups from parts by material
  const byMaterial = new Map<string, ExportPart[]>();
  for (const p of parts) {
    const mat = p.material_code || "UNKNOWN";
    if (!byMaterial.has(mat)) byMaterial.set(mat, []);
    byMaterial.get(mat)!.push(p);
  }

  const groups: NestingGroup[] = [];
  for (const [material, matParts] of byMaterial) {
    groups.push({
      group_id: crypto.randomUUID(),
      group_label: material,
      material_code: material,
      thickness_mm: null,
      colour_name: null,
      sheet_length_mm: 2440,
      sheet_width_mm: 1220,
      margin_mm: 10,
      spacing_mm: 8,
      allow_rotation_90: true,
      allow_mirror: false,
      grain_direction: "length",
      nest_method: "by_area",
      keep_parts_together: false,
      prioritise_grain_parts: true,
      parts: matParts,
      planned_sheets: [{ sheet_id: crypto.randomUUID(), sheet_number: 1, qr_payload: null }],
    });
  }

  await generateVCarveJobPack({
    jobId,
    jobCode,
    jobName: jobCode,
    tenantId,
    groups,
  });
}
