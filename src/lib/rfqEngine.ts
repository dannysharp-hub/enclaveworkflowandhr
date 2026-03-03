import { supabase } from "@/integrations/supabase/client";
import type { BuylistLineItem, SupplierGroup, BuylistCategory } from "./buylistEngine";

/**
 * RFQ Engine — generates supplier-specific RFQs from a job's buylist.
 * Each supplier only receives items they can supply (category + capability matching).
 */

export interface MatchedSupplier {
  id: string;
  name: string;
  rfq_email: string | null;
  is_preferred: boolean;
  supplier_type: SupplierGroup | null;
  is_default_spray_shop: boolean;
  matchedLineIndices: number[];
  score: number;
}

/**
 * Match suppliers to buylist lines based on supplier_type + capabilities.
 */
export async function matchSuppliersForBuylist(
  lines: BuylistLineItem[],
  mode: "all_matching" | "preferred_only" | "top_n" = "all_matching",
  topN: number = 3
): Promise<MatchedSupplier[]> {
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, rfq_email, is_preferred, active, supplier_type, is_default_spray_shop")
    .eq("active", true) as any;

  if (!suppliers || suppliers.length === 0) return [];

  const { data: capabilities } = await (supabase.from("supplier_capabilities") as any).select("*");

  const capsBySupplier = new Map<string, any[]>();
  (capabilities ?? []).forEach((c: any) => {
    const list = capsBySupplier.get(c.supplier_id) || [];
    list.push(c);
    capsBySupplier.set(c.supplier_id, list);
  });

  const scored: MatchedSupplier[] = [];

  for (const supplier of suppliers) {
    const caps = capsBySupplier.get(supplier.id) || [];
    const matchedIndices: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let matched = false;

      // 1. Supplier type matching: does supplier_type align with the line's supplier_group?
      if (supplier.supplier_type && supplier.supplier_type !== "general") {
        if (supplier.supplier_type === line.supplier_group) {
          matched = true;
        }
      }

      // 2. Default spray shop matches all spray items
      if (!matched && supplier.is_default_spray_shop && (line.is_spray_required || line.category === "paint_spray_subcontract")) {
        matched = true;
      }

      // 3. Capability-level matching
      if (!matched && caps.length > 0) {
        matched = caps.some((cap: any) => {
          // Category match
          if (cap.category_supported && cap.category_supported !== line.category) return false;

          // Brand match (for panels)
          if (cap.material_brand && cap.material_brand !== "Generic") {
            if (!line.brand || !line.brand.toLowerCase().includes(cap.material_brand.toLowerCase())) return false;
          }

          // Thickness match
          const specThickness = line.spec_json?.thickness_mm;
          if (cap.thickness_mm && specThickness && cap.thickness_mm !== specThickness) return false;

          // Sheet size match
          const specSize = line.spec_json?.sheet_size_key;
          if (cap.sheet_size_key && specSize && cap.sheet_size_key !== specSize) return false;

          return true;
        });
      }

      // 4. Generic suppliers (no type, no caps) match everything
      if (!matched && !supplier.supplier_type && caps.length === 0) {
        matched = true;
      }

      if (matched) matchedIndices.push(i);
    }

    if (matchedIndices.length > 0) {
      scored.push({
        id: supplier.id,
        name: supplier.name,
        rfq_email: supplier.rfq_email,
        is_preferred: supplier.is_preferred,
        supplier_type: supplier.supplier_type,
        is_default_spray_shop: supplier.is_default_spray_shop || false,
        matchedLineIndices: matchedIndices,
        score: (supplier.is_preferred ? 10 : 0) + matchedIndices.length,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (mode === "preferred_only") return scored.filter(s => s.is_preferred);
  if (mode === "top_n") return scored.slice(0, topN);
  return scored;
}

/**
 * Generate supplier-specific RFQs from buylist lines.
 * Each supplier gets an RFQ with ONLY the items they can supply.
 */
export async function generateRfqsFromBuylist(
  jobId: string,
  buylistLines: BuylistLineItem[],
  staffId?: string,
  options?: {
    requiredByDate?: string;
    deliveryAddress?: string;
    notes?: string;
  }
): Promise<{
  rfqsCreated: number;
  totalRecipients: number;
  unmatchedItems: BuylistLineItem[];
} | null> {
  if (buylistLines.length === 0) return null;

  // Get tenant_id
  const { data: jobData } = await supabase.from("jobs").select("tenant_id").eq("id", jobId).single();
  if (!jobData) return null;

  // Get purchasing settings
  const { data: settings } = await (supabase.from("purchasing_settings") as any)
    .select("*").limit(1).single();

  const mode = (settings?.rfq_send_mode as any) || "all_matching";
  const topN = settings?.rfq_top_n || 3;
  const requiredByDate = options?.requiredByDate ||
    new Date(Date.now() + (settings?.default_required_by_days_from_now || 7) * 86400000).toISOString().split("T")[0];

  // Match suppliers
  const matched = await matchSuppliersForBuylist(buylistLines, mode, topN);

  // Track which line indices are covered
  const coveredIndices = new Set<number>();
  let rfqsCreated = 0;
  let totalRecipients = 0;

  // Group suppliers by supplier_group for separate RFQs
  const supplierGroups = new Map<string, MatchedSupplier[]>();
  for (const supplier of matched) {
    // Determine the primary supplier group this supplier covers
    const primaryGroup = supplier.supplier_type || "general";
    const list = supplierGroups.get(primaryGroup) || [];
    list.push(supplier);
    supplierGroups.set(primaryGroup, list);
  }

  // Create one RFQ per supplier group
  for (const [groupKey, groupSuppliers] of supplierGroups) {
    // Collect all line indices covered by this group
    const groupLineIndices = new Set<number>();
    for (const s of groupSuppliers) {
      for (const idx of s.matchedLineIndices) {
        groupLineIndices.add(idx);
        coveredIndices.add(idx);
      }
    }

    if (groupLineIndices.size === 0) continue;

    // Generate RFQ number
    const { data: rfqNumData } = await (supabase.rpc as any)("generate_rfq_number", {
      _tenant_id: jobData.tenant_id,
    });
    const rfqNumber = rfqNumData || `RFQ-${Date.now()}`;

    // Create RFQ request
    const { data: rfq, error: rfqError } = await (supabase.from("rfq_requests") as any)
      .insert({
        job_id: jobId,
        rfq_number: rfqNumber,
        status: "draft",
        created_by_staff_id: staffId || null,
        required_by_date: requiredByDate,
        delivery_address_text: options?.deliveryAddress || settings?.default_delivery_address || null,
        notes: options?.notes || null,
        supplier_group: groupKey,
      })
      .select("id")
      .single();

    if (rfqError || !rfq) {
      console.error("Failed to create RFQ:", rfqError);
      continue;
    }

    // Insert line items (only the matched ones)
    const lineItems = Array.from(groupLineIndices).map(idx => {
      const line = buylistLines[idx];
      return {
        rfq_id: rfq.id,
        material_key: line.item_name,
        brand: line.brand,
        decor_code: null,
        colour_name: line.spec_json?.colour_name || null,
        thickness_mm: line.spec_json?.thickness_mm || 18,
        sheet_size_key: line.spec_json?.sheet_size_key || `${line.spec_json?.length_mm || 0}x${line.spec_json?.width_mm || 0}`,
        quantity_sheets: line.quantity,
        category: line.category,
        unit: line.unit,
        item_name: line.item_name,
        sku_code: line.sku_code,
        spec_json: line.spec_json,
      };
    });

    await (supabase.from("rfq_line_items") as any).insert(lineItems);

    // Create recipients - each supplier gets only their matched lines
    for (const supplier of groupSuppliers) {
      await (supabase.from("rfq_recipients") as any).insert({
        rfq_id: rfq.id,
        supplier_id: supplier.id,
        send_status: "pending",
      });
      totalRecipients++;
    }

    rfqsCreated++;

    // Audit log
    await (supabase.from("purchasing_audit_log") as any).insert({
      job_id: jobId,
      action: "rfq_generated",
      entity_type: "rfq",
      entity_id: rfq.id,
      actor_staff_id: staffId,
      details_json: {
        rfq_number: rfqNumber,
        supplier_group: groupKey,
        line_count: lineItems.length,
        supplier_count: groupSuppliers.length,
      },
    });
  }

  // Find unmatched items
  const unmatchedItems = buylistLines.filter((_, idx) => !coveredIndices.has(idx));

  return { rfqsCreated, totalRecipients, unmatchedItems };
}

/**
 * Legacy wrapper — generates RFQ from a job using the old nesting-group approach.
 * Now delegates to buylist-based generation.
 */
export async function generateRfqForJob(
  jobId: string,
  staffId?: string,
  options?: {
    requiredByDate?: string;
    deliveryAddress?: string;
    notes?: string;
  }
): Promise<{ rfqId: string; rfqNumber: string; lineCount: number; recipientCount: number } | null> {
  // Import buylist engine dynamically to avoid circular deps
  const { generateBuylistForJob, saveBuylistForJob } = await import("./buylistEngine");

  // Generate and save buylist
  const lines = await generateBuylistForJob(jobId);
  if (lines.length === 0) return null;
  await saveBuylistForJob(jobId, lines);

  // Generate RFQs from buylist
  const result = await generateRfqsFromBuylist(jobId, lines, staffId, options);
  if (!result) return null;

  return {
    rfqId: "",
    rfqNumber: `${result.rfqsCreated} RFQ(s)`,
    lineCount: lines.length,
    recipientCount: result.totalRecipients,
  };
}
