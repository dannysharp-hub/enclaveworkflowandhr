import { supabase } from "@/integrations/supabase/client";

/**
 * RFQ Engine — generates RFQ requests from a job's buylist/nesting groups.
 */

export interface BuylistLine {
  material_key: string;
  brand: string | null;
  decor_code: string | null;
  colour_name: string | null;
  thickness_mm: number;
  sheet_size_key: string;
  quantity_sheets: number;
}

export interface MatchedSupplier {
  id: string;
  name: string;
  rfq_email: string | null;
  is_preferred: boolean;
}

/**
 * Extract buylist lines from a job's nesting groups (sheets needed).
 */
export async function extractBuylistFromJob(jobId: string): Promise<BuylistLine[]> {
  const { data: groups } = await supabase
    .from("job_nesting_groups")
    .select("group_label, material_code, colour_name, thickness_mm, sheet_length_mm, sheet_width_mm")
    .eq("job_id", jobId);

  if (!groups || groups.length === 0) return [];

  // Get sheet counts per group from job_sheets
  const { data: sheets } = await (supabase.from("job_sheets") as any)
    .select("group_id, id")
    .eq("job_id", jobId);

  const sheetCountByGroup: Record<string, number> = {};
  (sheets ?? []).forEach((s: any) => {
    sheetCountByGroup[s.group_id] = (sheetCountByGroup[s.group_id] || 0) + 1;
  });

  const lines: BuylistLine[] = groups.map(g => {
    // Try to extract brand from material_code (e.g. "EGGER_18_WHITE" → "Egger")
    const brand = g.material_code?.split("_")[0] || null;
    const sizeKey = `${g.sheet_length_mm}x${g.sheet_width_mm}`;
    
    return {
      material_key: g.material_code || g.group_label,
      brand,
      decor_code: null,
      colour_name: g.colour_name,
      thickness_mm: g.thickness_mm || 18,
      sheet_size_key: sizeKey,
      quantity_sheets: sheetCountByGroup[g.group_label] || 1,
    };
  });

  // Consolidate same material lines
  const consolidated = new Map<string, BuylistLine>();
  for (const line of lines) {
    const key = `${line.material_key}_${line.thickness_mm}_${line.sheet_size_key}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.quantity_sheets += line.quantity_sheets;
    } else {
      consolidated.set(key, { ...line });
    }
  }

  return Array.from(consolidated.values());
}

/**
 * Find suppliers whose capabilities match the given buylist lines.
 */
export async function matchSuppliersForBuylist(
  lines: BuylistLine[],
  mode: "all_matching" | "preferred_only" | "top_n" = "all_matching",
  topN: number = 3
): Promise<MatchedSupplier[]> {
  // Get all active suppliers with their capabilities
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, rfq_email, is_preferred, active")
    .eq("active", true) as any;

  if (!suppliers || suppliers.length === 0) return [];

  const { data: capabilities } = await (supabase.from("supplier_capabilities") as any)
    .select("*");

  const capsBySupplier = new Map<string, any[]>();
  (capabilities ?? []).forEach((c: any) => {
    const list = capsBySupplier.get(c.supplier_id) || [];
    list.push(c);
    capsBySupplier.set(c.supplier_id, list);
  });

  // Score each supplier
  const scored: (MatchedSupplier & { score: number })[] = [];

  for (const supplier of suppliers) {
    const caps = capsBySupplier.get(supplier.id) || [];
    
    // If no capabilities defined, supplier can quote anything (generic)
    if (caps.length === 0) {
      scored.push({
        id: supplier.id,
        name: supplier.name,
        rfq_email: supplier.rfq_email,
        is_preferred: supplier.is_preferred,
        score: supplier.is_preferred ? 10 : 1,
      });
      continue;
    }

    // Check if supplier can provide at least one line item
    let matchCount = 0;
    for (const line of lines) {
      const matches = caps.some((cap: any) => {
        const brandMatch = !cap.material_brand || cap.material_brand === "Generic" || 
          (line.brand && line.brand.toLowerCase().includes(cap.material_brand.toLowerCase()));
        const thicknessMatch = !cap.thickness_mm || cap.thickness_mm === line.thickness_mm;
        const sizeMatch = !cap.sheet_size_key || cap.sheet_size_key === line.sheet_size_key;
        return brandMatch && thicknessMatch && sizeMatch;
      });
      if (matches) matchCount++;
    }

    if (matchCount > 0) {
      scored.push({
        id: supplier.id,
        name: supplier.name,
        rfq_email: supplier.rfq_email,
        is_preferred: supplier.is_preferred,
        score: (supplier.is_preferred ? 10 : 0) + matchCount,
      });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  if (mode === "preferred_only") {
    return scored.filter(s => s.is_preferred);
  }
  if (mode === "top_n") {
    return scored.slice(0, topN);
  }
  return scored;
}

/**
 * Generate a complete RFQ from a job's buylist.
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
  // 1. Extract buylist
  const lines = await extractBuylistFromJob(jobId);
  if (lines.length === 0) return null;

  // 2. Generate RFQ number
  const { data: rfqNumData } = await (supabase.rpc as any)("generate_rfq_number", {
    _tenant_id: (await supabase.from("jobs").select("tenant_id").eq("id", jobId).single()).data?.tenant_id,
  });
  const rfqNumber = rfqNumData || `RFQ-${Date.now()}`;

  // 3. Get purchasing settings
  const { data: settings } = await (supabase.from("purchasing_settings") as any)
    .select("*")
    .limit(1)
    .single();

  const requiredByDate = options?.requiredByDate || 
    new Date(Date.now() + (settings?.default_required_by_days_from_now || 7) * 86400000).toISOString().split("T")[0];

  // 4. Create RFQ request
  const { data: rfq, error: rfqError } = await (supabase.from("rfq_requests") as any)
    .insert({
      job_id: jobId,
      rfq_number: rfqNumber,
      status: "draft",
      created_by_staff_id: staffId || null,
      required_by_date: requiredByDate,
      delivery_address_text: options?.deliveryAddress || settings?.default_delivery_address || null,
      notes: options?.notes || null,
    })
    .select("id")
    .single();

  if (rfqError || !rfq) {
    console.error("Failed to create RFQ:", rfqError);
    return null;
  }

  // 5. Insert line items
  const lineItems = lines.map(line => ({
    rfq_id: rfq.id,
    material_key: line.material_key,
    brand: line.brand,
    decor_code: line.decor_code,
    colour_name: line.colour_name,
    thickness_mm: line.thickness_mm,
    sheet_size_key: line.sheet_size_key,
    quantity_sheets: line.quantity_sheets,
  }));

  await (supabase.from("rfq_line_items") as any).insert(lineItems);

  // 6. Match suppliers
  const mode = (settings?.rfq_send_mode as any) || "all_matching";
  const topN = settings?.rfq_top_n || 3;
  const matched = await matchSuppliersForBuylist(lines, mode, topN);

  // 7. Create recipients
  if (matched.length > 0) {
    const recipients = matched.map(s => ({
      rfq_id: rfq.id,
      supplier_id: s.id,
      send_status: "pending",
    }));
    await (supabase.from("rfq_recipients") as any).insert(recipients);
  }

  return {
    rfqId: rfq.id,
    rfqNumber,
    lineCount: lines.length,
    recipientCount: matched.length,
  };
}
