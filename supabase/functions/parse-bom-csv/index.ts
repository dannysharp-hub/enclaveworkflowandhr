import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Parse BOM CSV Edge Function
 * Accepts a CSV file (as text body) + job_id, parses it into job_bom_items,
 * generates buylist with spray detection using tenant-configurable rules.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseWithAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claimsData, error: authError } = await supabaseWithAuth.auth.getClaims(token);
  if (authError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const user = { id: claimsData.claims.sub as string };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("tenant_id, full_name")
    .eq("user_id", user.id)
    .single();
  if (!profile?.tenant_id) {
    return new Response(JSON.stringify({ error: "No tenant" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const tenantId = profile.tenant_id;

  try {
    const body = await req.json();
    const { job_id, csv_text, file_name } = body;

    if (!job_id || !csv_text) {
      return new Response(
        JSON.stringify({ error: "job_id and csv_text required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify job belongs to tenant
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("id, job_id, tenant_id")
      .eq("id", job_id)
      .eq("tenant_id", tenantId)
      .single();
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine next bom_revision
    const { data: prevUploads } = await supabaseAdmin
      .from("job_bom_uploads")
      .select("bom_revision")
      .eq("job_id", job_id)
      .order("bom_revision", { ascending: false })
      .limit(1);
    const nextRevision = ((prevUploads?.[0] as any)?.bom_revision || 0) + 1;

    // Create upload record
    const { data: upload, error: uploadErr } = await supabaseAdmin
      .from("job_bom_uploads")
      .insert({
        tenant_id: tenantId,
        job_id,
        file_name: file_name || "bom.csv",
        uploaded_by_staff_id: user.id,
        parse_status: "pending",
        bom_revision: nextRevision,
      })
      .select("id")
      .single();
    if (uploadErr || !upload) throw new Error("Failed to create upload record");

    // Parse CSV
    const lines = csv_text.trim().split("\n");
    if (lines.length < 2) {
      await supabaseAdmin
        .from("job_bom_uploads")
        .update({ parse_status: "failed", parse_error: "CSV has no data rows" })
        .eq("id", upload.id);
      return new Response(
        JSON.stringify({ error: "CSV has no data rows", upload_id: upload.id }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const headerLine = lines[0];
    const headers = parseCSVRow(headerLine).map((h) =>
      h.trim().toLowerCase().replace(/[^a-z0-9_ ]/g, "")
    );

    // Flexible column mapping
    const colMap = mapColumns(headers);

    if (colMap.description < 0 && colMap.part_number < 0) {
      await supabaseAdmin
        .from("job_bom_uploads")
        .update({
          parse_status: "failed",
          parse_error: "No Description or Part Number column found",
        })
        .eq("id", upload.id);
      return new Response(
        JSON.stringify({
          error: "No Description or Part Number column found",
          upload_id: upload.id,
          headers,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Load spray match rules
    const { data: sprayRules } = await supabaseAdmin
      .from("spray_match_rules")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("active", true);

    // Default spray terms if no tenant rules exist
    const inclusionTerms: { field: string; term: string }[] = [];
    const exclusionTerms: { field: string; term: string }[] = [];

    if (sprayRules && sprayRules.length > 0) {
      for (const rule of sprayRules) {
        if (rule.is_exclusion) {
          exclusionTerms.push({
            field: rule.match_field,
            term: rule.match_term.toLowerCase(),
          });
        } else {
          inclusionTerms.push({
            field: rule.match_field,
            term: rule.match_term.toLowerCase(),
          });
        }
      }
    } else {
      // Default: MR MDF rule
      inclusionTerms.push({ field: "material_text", term: "mr mdf" });
      inclusionTerms.push({ field: "description", term: "mr mdf" });
    }

    // Load category rules
    const { data: catRules } = await supabaseAdmin
      .from("buylist_category_rules")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("priority", { ascending: false });

    // Parse data rows
    const bomItems: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVRow(lines[i]);
      if (row.every((c) => !c.trim())) continue; // skip empty

      const description =
        colMap.description >= 0 ? row[colMap.description]?.trim() || "" : "";
      const partNumber =
        colMap.part_number >= 0 ? row[colMap.part_number]?.trim() || "" : "";

      if (!description && !partNumber) {
        errors.push(`Row ${i + 1}: No description or part number — skipped`);
        continue;
      }

      const qtyRaw =
        colMap.quantity >= 0 ? row[colMap.quantity]?.trim() : "1";
      let quantity = parseFloat(qtyRaw || "1");
      if (isNaN(quantity) || quantity <= 0) quantity = 1;

      const materialText =
        colMap.material >= 0 ? row[colMap.material]?.trim() || null : null;
      const unit =
        colMap.unit >= 0 ? row[colMap.unit]?.trim() || "pcs" : "pcs";
      const categoryHint =
        colMap.category >= 0 ? row[colMap.category]?.trim() || null : null;
      const supplierHint =
        colMap.supplier >= 0 ? row[colMap.supplier]?.trim() || null : null;

      // Preserve unknown columns
      const metadata: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        if (
          ![
            colMap.description,
            colMap.part_number,
            colMap.quantity,
            colMap.material,
            colMap.unit,
            colMap.category,
            colMap.supplier,
          ].includes(j) &&
          row[j]?.trim()
        ) {
          metadata[headers[j]] = row[j].trim();
        }
      }

      bomItems.push({
        tenant_id: tenantId,
        job_id,
        bom_upload_id: upload.id,
        bom_revision: nextRevision,
        part_number: partNumber || null,
        description: description || partNumber,
        quantity,
        unit,
        material_text: materialText,
        category_hint: categoryHint,
        supplier_hint: supplierHint,
        metadata_json: Object.keys(metadata).length > 0 ? metadata : null,
      });
    }

    // Insert BOM items
    if (bomItems.length > 0) {
      await supabaseAdmin.from("job_bom_items").insert(bomItems);
    }

    // Generate buylist from BOM items
    const buylistLines: any[] = [];
    // Deduplicate: group by part_number or normalized description
    const deduped = new Map<
      string,
      { items: any[]; totalQty: number; representative: any }
    >();

    for (const item of bomItems) {
      const key = item.part_number
        ? `pn:${item.part_number}`
        : `desc:${(item.description || "").toLowerCase().trim()}`;
      const existing = deduped.get(key);
      if (existing) {
        existing.totalQty += item.quantity;
        existing.items.push(item);
      } else {
        deduped.set(key, {
          items: [item],
          totalQty: item.quantity,
          representative: item,
        });
      }
    }

    // Spray detection + categorisation
    let sprayCount = 0;
    const categoryCounts: Record<string, number> = {};

    for (const [, group] of deduped) {
      const rep = group.representative;
      const desc = (rep.description || "").toLowerCase();
      const mat = (rep.material_text || "").toLowerCase();

      // Spray detection
      let isSpray = false;
      let sprayReason = "";

      for (const rule of inclusionTerms) {
        const searchText =
          rule.field === "material_text" ? mat : rule.field === "description" ? desc : `${mat} ${desc}`;
        if (searchText.includes(rule.term)) {
          isSpray = true;
          sprayReason = `Matched "${rule.term}" in ${rule.field}`;
          break;
        }
      }

      // Check exclusions
      if (isSpray) {
        for (const rule of exclusionTerms) {
          const searchText =
            rule.field === "material_text" ? mat : rule.field === "description" ? desc : `${mat} ${desc}`;
          if (searchText.includes(rule.term)) {
            isSpray = false;
            sprayReason = "";
            break;
          }
        }
      }

      // Categorisation
      let category = "other";
      let supplierGroup = "other";

      if (isSpray) {
        category = "paint_spray_subcontract";
        supplierGroup = "spray_shop";
        sprayCount++;
      } else if (rep.category_hint) {
        const mapped = mapCategoryHint(rep.category_hint);
        category = mapped.category;
        supplierGroup = mapped.supplierGroup;
      } else {
        // Use tenant rules first, then defaults
        const classified = classifyByKeywords(
          desc,
          mat,
          catRules || []
        );
        category = classified.category;
        supplierGroup = classified.supplierGroup;
      }

      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      buylistLines.push({
        job_id,
        tenant_id: tenantId,
        category,
        supplier_group: supplierGroup,
        item_name: rep.part_number || rep.description,
        quantity: group.totalQty,
        unit: rep.unit || "pcs",
        is_spray_required: isSpray,
        spray_detected: isSpray,
        spray_reason: sprayReason || null,
        source_type: "bom",
        bom_item_id: rep.id || null,
        bom_revision: nextRevision,
        notes: rep.material_text
          ? `Material: ${rep.material_text}`
          : null,
        spec_json: {
          material_text: rep.material_text,
          description: rep.description,
          bom_revision: nextRevision,
        },
      });
    }

    // Delete previous buylist for this job (source = bom) and insert new
    await supabaseAdmin
      .from("buylist_line_items")
      .delete()
      .eq("job_id", job_id)
      .eq("source_type", "bom");

    if (buylistLines.length > 0) {
      await supabaseAdmin.from("buylist_line_items").insert(buylistLines);
    }

    // Update upload status
    await supabaseAdmin
      .from("job_bom_uploads")
      .update({ parse_status: "parsed" })
      .eq("id", upload.id);

    // Audit log
    await supabaseAdmin.from("purchasing_audit_log").insert({
      job_id,
      tenant_id: tenantId,
      action: "bom_csv_parsed",
      entity_type: "bom_upload",
      entity_id: upload.id,
      details_json: {
        file_name: file_name || "bom.csv",
        bom_revision: nextRevision,
        total_bom_items: bomItems.length,
        buylist_items: buylistLines.length,
        spray_items: sprayCount,
        categories: categoryCounts,
        errors,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        upload_id: upload.id,
        bom_revision: nextRevision,
        bom_items_count: bomItems.length,
        buylist_items_count: buylistLines.length,
        spray_items_count: sprayCount,
        category_counts: categoryCounts,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("parse-bom-csv error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── CSV Parsing Helpers ───

function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function mapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {
    description: -1,
    part_number: -1,
    quantity: -1,
    material: -1,
    unit: -1,
    category: -1,
    supplier: -1,
  };

  const descKeys = [
    "description",
    "desc",
    "part description",
    "item",
    "item name",
    "name",
    "component",
  ];
  const pnKeys = [
    "part number",
    "part_number",
    "partnumber",
    "partno",
    "part_no",
    "part no",
    "part id",
    "part_id",
    "partid",
    "sku",
    "item code",
    "item_code",
  ];
  const qtyKeys = ["quantity", "qty", "q", "count", "amount"];
  const matKeys = [
    "material",
    "material_text",
    "mat",
    "material code",
    "material_code",
    "product_code",
    "product code",
  ];
  const unitKeys = ["unit", "uom", "units"];
  const catKeys = ["category", "cat", "type", "group"];
  const supKeys = ["supplier", "vendor", "supplier_hint"];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].replace(/_/g, " ").trim();
    if (map.description < 0 && descKeys.includes(h)) map.description = i;
    if (map.part_number < 0 && pnKeys.includes(h)) map.part_number = i;
    if (map.quantity < 0 && qtyKeys.includes(h)) map.quantity = i;
    if (map.material < 0 && matKeys.includes(h)) map.material = i;
    if (map.unit < 0 && unitKeys.includes(h)) map.unit = i;
    if (map.category < 0 && catKeys.includes(h)) map.category = i;
    if (map.supplier < 0 && supKeys.includes(h)) map.supplier = i;
  }

  return map;
}

function mapCategoryHint(hint: string): {
  category: string;
  supplierGroup: string;
} {
  const h = hint.toLowerCase().trim();
  if (h.includes("panel") || h.includes("board") || h.includes("sheet"))
    return { category: "panels", supplierGroup: "panel_suppliers" };
  if (h.includes("hardware") || h.includes("hinge") || h.includes("runner"))
    return { category: "hardware", supplierGroup: "hardware_suppliers" };
  if (h.includes("handle"))
    return { category: "handles", supplierGroup: "hardware_suppliers" };
  if (h.includes("light") || h.includes("led"))
    return { category: "lighting", supplierGroup: "lighting_suppliers" };
  if (h.includes("fix") || h.includes("screw") || h.includes("bracket"))
    return { category: "fixings", supplierGroup: "hardware_suppliers" };
  if (h.includes("leg") || h.includes("plinth"))
    return { category: "legs", supplierGroup: "hardware_suppliers" };
  if (h.includes("spray") || h.includes("paint"))
    return {
      category: "paint_spray_subcontract",
      supplierGroup: "spray_shop",
    };
  if (h.includes("oil") || h.includes("lacquer") || h.includes("finish"))
    return { category: "finishing_oils", supplierGroup: "finishing_suppliers" };
  if (h.includes("edge"))
    return {
      category: "edgebanding",
      supplierGroup: "edgebanding_suppliers",
    };
  return { category: "other", supplierGroup: "other" };
}

function classifyByKeywords(
  description: string,
  material: string,
  tenantRules: any[]
): { category: string; supplierGroup: string } {
  const combined = `${description} ${material}`.toLowerCase();

  // Check tenant rules first
  for (const rule of tenantRules) {
    if (combined.includes(rule.keyword.toLowerCase())) {
      return { category: rule.category, supplierGroup: rule.supplier_group };
    }
  }

  // Default keyword mapping
  const defaults: [string[], string, string][] = [
    [
      ["hinge", "runner", "drawer slide", "cam", "dowel"],
      "hardware",
      "hardware_suppliers",
    ],
    [["handle", "knob", "pull"], "handles", "hardware_suppliers"],
    [["leg", "plinth", "foot", "castor"], "legs", "hardware_suppliers"],
    [
      ["screw", "fixing", "bracket", "bolt", "nut", "washer"],
      "fixings",
      "hardware_suppliers",
    ],
    [
      ["led", "driver", "strip light", "transformer", "lamp"],
      "lighting",
      "lighting_suppliers",
    ],
    [
      ["osmo", "oil", "lacquer", "wax", "stain"],
      "finishing_oils",
      "finishing_suppliers",
    ],
    [
      ["edgebanding", "edge band", "edge tape", "abs edge"],
      "edgebanding",
      "edgebanding_suppliers",
    ],
    [
      ["mdf", "plywood", "chipboard", "melamine", "birch ply", "oak veneer"],
      "panels",
      "panel_suppliers",
    ],
  ];

  for (const [keywords, category, supplierGroup] of defaults) {
    if (keywords.some((kw) => combined.includes(kw))) {
      return { category, supplierGroup };
    }
  }

  return { category: "other", supplierGroup: "other" };
}
