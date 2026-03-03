import { supabase } from "@/integrations/supabase/client";

/**
 * Buylist Engine — generates a normalized, categorised buylist from job parts + nesting groups.
 * Sources: parts table (BOM), nesting groups (panel sheets), manual additions.
 */

export type BuylistCategory =
  | "panels" | "hardware" | "lighting" | "fixings" | "legs" | "handles"
  | "finishing_oils" | "paint_spray_subcontract" | "edgebanding" | "other";

export type SupplierGroup =
  | "panel_suppliers" | "hardware_suppliers" | "lighting_suppliers"
  | "finishing_suppliers" | "spray_shop" | "edgebanding_suppliers" | "general";

export interface BuylistLineItem {
  job_id: string;
  category: BuylistCategory;
  supplier_group: SupplierGroup;
  item_name: string;
  brand: string | null;
  sku_code: string | null;
  spec_json: Record<string, any> | null;
  quantity: number;
  unit: string;
  notes: string | null;
  is_spray_required: boolean;
  spray_spec_json: Record<string, any> | null;
  source_part_id: string | null;
  source_type: string;
}

/** Map material codes to buylist categories based on heuristics */
function classifyMaterial(materialCode: string | null, productCode: string | null): { category: BuylistCategory; supplierGroup: SupplierGroup } {
  const code = (materialCode || productCode || "").toLowerCase();

  if (code.includes("edge") || code.includes("tape") || code.includes("eb_")) {
    return { category: "edgebanding", supplierGroup: "edgebanding_suppliers" };
  }
  if (code.includes("hinge") || code.includes("drawer") || code.includes("slide") || code.includes("bracket") || code.includes("cam") || code.includes("dowel") || code.includes("screw")) {
    return { category: "hardware", supplierGroup: "hardware_suppliers" };
  }
  if (code.includes("handle") || code.includes("knob") || code.includes("pull")) {
    return { category: "handles", supplierGroup: "hardware_suppliers" };
  }
  if (code.includes("leg") || code.includes("plinth") || code.includes("foot")) {
    return { category: "legs", supplierGroup: "hardware_suppliers" };
  }
  if (code.includes("fixing") || code.includes("bracket") || code.includes("wall_") || code.includes("mount")) {
    return { category: "fixings", supplierGroup: "hardware_suppliers" };
  }
  if (code.includes("light") || code.includes("led") || code.includes("lamp") || code.includes("driver")) {
    return { category: "lighting", supplierGroup: "lighting_suppliers" };
  }
  if (code.includes("oil") || code.includes("lacquer") || code.includes("wax") || code.includes("stain") || code.includes("finish")) {
    return { category: "finishing_oils", supplierGroup: "finishing_suppliers" };
  }
  if (code.includes("paint") || code.includes("spray") || code.includes("primer") || code.includes("lacq")) {
    return { category: "paint_spray_subcontract", supplierGroup: "spray_shop" };
  }
  // Default: panel material
  return { category: "panels", supplierGroup: "panel_suppliers" };
}

/** Detect if a part requires spray finishing */
function detectSprayRequired(part: any): { isSpray: boolean; spraySpec: Record<string, any> | null } {
  const code = ((part.material_code || "") + " " + (part.product_code || "")).toLowerCase();
  const colour = (part.colour_name || "").toLowerCase();

  // If material explicitly mentions spray/paint/lacquer
  if (code.includes("spray") || code.includes("paint") || code.includes("lacq") || code.includes("primer")) {
    return {
      isSpray: true,
      spraySpec: {
        colour_name: part.colour_name || "TBC",
        finish_type: code.includes("matt") ? "Matt" : code.includes("gloss") ? "Gloss" : "Satin",
        material_type: part.material_code || "MDF",
      },
    };
  }

  // If colour suggests painted finish
  if (colour && !["raw", "natural", "unfinished", "melamine", ""].includes(colour)) {
    const isMdf = code.includes("mdf") || code.includes("raw");
    if (isMdf) {
      return {
        isSpray: true,
        spraySpec: {
          colour_name: part.colour_name,
          finish_type: "Satin",
          material_type: "MDF",
        },
      };
    }
  }

  return { isSpray: false, spraySpec: null };
}

/**
 * Generate buylist from a job's parts (BOM) + nesting groups (panel sheets).
 */
export async function generateBuylistForJob(jobId: string): Promise<BuylistLineItem[]> {
  const lines: BuylistLineItem[] = [];

  // 1. Get all parts for this job (BOM source)
  const { data: parts } = await supabase
    .from("parts")
    .select("id, part_id, product_code, material_code, colour_name, thickness_mm, length_mm, width_mm, quantity, grain_required, grain_axis")
    .eq("job_id", jobId);

  if (parts && parts.length > 0) {
    // Group parts by material for panel consolidation
    const panelGroups = new Map<string, { parts: any[]; totalQty: number }>();

    for (const part of parts) {
      const { category, supplierGroup } = classifyMaterial(part.material_code, part.product_code);
      const { isSpray, spraySpec } = detectSprayRequired(part);

      if (category === "panels") {
        // Consolidate panels by material+thickness
        const key = `${part.material_code || part.product_code}_${part.thickness_mm || 18}`;
        const existing = panelGroups.get(key);
        if (existing) {
          existing.parts.push(part);
          existing.totalQty += part.quantity;
        } else {
          panelGroups.set(key, { parts: [part], totalQty: part.quantity });
        }

        // If spray required, also add a spray line
        if (isSpray) {
          lines.push({
            job_id: jobId,
            category: "paint_spray_subcontract",
            supplier_group: "spray_shop",
            item_name: `Spray – ${part.part_id} (${part.length_mm}×${part.width_mm})`,
            brand: null,
            sku_code: null,
            spec_json: {
              piece_type: "panel",
              length_mm: part.length_mm,
              width_mm: part.width_mm,
              thickness_mm: part.thickness_mm,
              material_type: part.material_code,
            },
            quantity: part.quantity,
            unit: "pcs",
            notes: null,
            is_spray_required: true,
            spray_spec_json: spraySpec,
            source_part_id: part.id,
            source_type: "auto_spray",
          });
        }
      } else {
        // Non-panel items: hardware, lighting, etc.
        lines.push({
          job_id: jobId,
          category,
          supplier_group: supplierGroup,
          item_name: part.part_id || part.product_code,
          brand: part.material_code?.split("_")[0] || null,
          sku_code: part.product_code,
          spec_json: {
            length_mm: part.length_mm,
            width_mm: part.width_mm,
            thickness_mm: part.thickness_mm,
            colour: part.colour_name,
          },
          quantity: part.quantity,
          unit: "pcs",
          notes: null,
          is_spray_required: isSpray,
          spray_spec_json: spraySpec,
          source_part_id: part.id,
          source_type: "auto_bom",
        });
      }
    }

    // Add consolidated panel lines (quantity = total parts, but we note sheet count from nesting)
    for (const [key, group] of panelGroups) {
      const sample = group.parts[0];
      const brand = sample.material_code?.split("_")[0] || null;
      lines.push({
        job_id: jobId,
        category: "panels",
        supplier_group: "panel_suppliers",
        item_name: sample.material_code || sample.product_code || key,
        brand,
        sku_code: null,
        spec_json: {
          thickness_mm: sample.thickness_mm || 18,
          colour_name: sample.colour_name,
          material_code: sample.material_code,
          part_count: group.totalQty,
        },
        quantity: group.totalQty,
        unit: "parts",
        notes: `${group.parts.length} unique part(s), ${group.totalQty} total`,
        is_spray_required: false,
        spray_spec_json: null,
        source_part_id: null,
        source_type: "auto_panel_consolidation",
      });
    }
  }

  // 2. Get nesting groups for sheet-level info (supplements panel lines with actual sheet counts)
  const { data: groups } = await (supabase.from("job_nesting_groups") as any)
    .select("id, group_label, material_code, colour_name, thickness_mm, sheet_length_mm, sheet_width_mm")
    .eq("job_id", jobId);

  if (groups && groups.length > 0) {
    // Get sheet counts per group
    const { data: sheets } = await (supabase.from("job_sheets") as any)
      .select("group_id, id")
      .eq("job_id", jobId);

    const sheetCountByGroup: Record<string, number> = {};
    (sheets ?? []).forEach((s: any) => {
      sheetCountByGroup[s.group_id] = (sheetCountByGroup[s.group_id] || 0) + 1;
    });

    for (const g of groups) {
      const sheetCount = sheetCountByGroup[g.id] || sheetCountByGroup[g.group_label] || 1;
      const brand = g.material_code?.split("_")[0] || null;
      const sizeKey = `${g.sheet_length_mm}x${g.sheet_width_mm}`;

      // Check if we already have a panel line for this material (avoid double-counting)
      const existingPanel = lines.find(
        l => l.category === "panels" && l.source_type === "auto_panel_consolidation" &&
             l.item_name === (g.material_code || g.group_label)
      );

      if (existingPanel) {
        // Update with sheet-level data
        existingPanel.spec_json = {
          ...existingPanel.spec_json,
          sheet_size_key: sizeKey,
          sheet_length_mm: g.sheet_length_mm,
          sheet_width_mm: g.sheet_width_mm,
          sheets_required: sheetCount,
        };
        existingPanel.quantity = sheetCount;
        existingPanel.unit = "sheets";
      } else {
        // Nesting group without matching parts – add as panel line
        lines.push({
          job_id: jobId,
          category: "panels",
          supplier_group: "panel_suppliers",
          item_name: g.material_code || g.group_label,
          brand,
          sku_code: null,
          spec_json: {
            thickness_mm: g.thickness_mm || 18,
            colour_name: g.colour_name,
            sheet_size_key: sizeKey,
            sheet_length_mm: g.sheet_length_mm,
            sheet_width_mm: g.sheet_width_mm,
            sheets_required: sheetCount,
          },
          quantity: sheetCount,
          unit: "sheets",
          notes: null,
          is_spray_required: false,
          spray_spec_json: null,
          source_part_id: null,
          source_type: "auto_nesting",
        });
      }
    }
  }

  return lines;
}

/**
 * Save generated buylist to the database and update job metadata.
 */
export async function saveBuylistForJob(jobId: string, lines: BuylistLineItem[]): Promise<{ count: number; unmatched: string[] }> {
  // Delete any existing buylist for this job (regeneration)
  await (supabase.from("buylist_line_items") as any).delete().eq("job_id", jobId);

  // Insert new lines
  if (lines.length > 0) {
    const rows = lines.map(l => ({
      job_id: l.job_id,
      category: l.category,
      supplier_group: l.supplier_group,
      item_name: l.item_name,
      brand: l.brand,
      sku_code: l.sku_code,
      spec_json: l.spec_json,
      quantity: l.quantity,
      unit: l.unit,
      notes: l.notes,
      is_spray_required: l.is_spray_required,
      spray_spec_json: l.spray_spec_json,
      source_part_id: l.source_part_id,
      source_type: l.source_type,
    }));

    await (supabase.from("buylist_line_items") as any).insert(rows);
  }

  // Update job metadata
  await supabase.from("jobs").update({
    buylist_generated_at: new Date().toISOString(),
  } as any).eq("id", jobId);

  // Log audit event
  await (supabase.from("purchasing_audit_log") as any).insert({
    job_id: jobId,
    action: "buylist_generated",
    entity_type: "buylist",
    details_json: {
      line_count: lines.length,
      categories: [...new Set(lines.map(l => l.category))],
      supplier_groups: [...new Set(lines.map(l => l.supplier_group))],
    },
  });

  return { count: lines.length, unmatched: [] };
}

/**
 * Get buylist for a job from the database.
 */
export async function getBuylistForJob(jobId: string): Promise<any[]> {
  const { data } = await (supabase.from("buylist_line_items") as any)
    .select("*")
    .eq("job_id", jobId)
    .order("category, item_name");
  return data ?? [];
}

/**
 * Group buylist lines by supplier_group for RFQ routing.
 */
export function groupBySupplierGroup(lines: BuylistLineItem[]): Record<SupplierGroup, BuylistLineItem[]> {
  const groups: Record<string, BuylistLineItem[]> = {};
  for (const line of lines) {
    if (!groups[line.supplier_group]) groups[line.supplier_group] = [];
    groups[line.supplier_group].push(line);
  }
  return groups as Record<SupplierGroup, BuylistLineItem[]>;
}

/**
 * Get spray-only items from buylist.
 */
export function getSprayItems(lines: BuylistLineItem[]): BuylistLineItem[] {
  return lines.filter(l => l.is_spray_required || l.category === "paint_spray_subcontract");
}
