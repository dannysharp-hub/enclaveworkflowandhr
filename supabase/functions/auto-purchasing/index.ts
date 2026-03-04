import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Auto-Purchasing Edge Function
 * Called from the UI after job status changes to 'accepted'.
 * Generates buylist, matches suppliers, creates RFQs, optionally sends emails.
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
    .from("profiles").select("tenant_id, full_name").eq("user_id", user.id).single();
  if (!profile?.tenant_id) {
    return new Response(JSON.stringify({ error: "No tenant" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const tenantId = profile.tenant_id;

  try {
    const body = await req.json();
    const { job_id, action } = body;

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify job belongs to tenant
    const { data: job } = await supabaseAdmin
      .from("jobs").select("id, job_id, job_name, status, tenant_id, ordering_enabled")
      .eq("id", job_id).eq("tenant_id", tenantId).single();

    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get purchasing settings
    const { data: settings } = await supabaseAdmin
      .from("purchasing_settings").select("*").eq("tenant_id", tenantId).maybeSingle();

    const result: any = { job_id, action, steps: [] };

    if (action === "accept_job") {
      // Step 1: Update job status to accepted
      await supabaseAdmin.from("jobs").update({ status: "accepted" }).eq("id", job_id);
      result.steps.push("job_status_updated");

      // Step 2: Generate buylist from parts/BOM
      const { data: parts } = await supabaseAdmin
        .from("parts")
        .select("id, part_id, product_code, material_code, colour_name, thickness_mm, length_mm, width_mm, quantity, grain_required, grain_axis")
        .eq("job_id", job_id);

      const buylistLines: any[] = [];
      const panelGroups = new Map<string, { parts: any[]; totalQty: number }>();

      for (const part of (parts || [])) {
        const { category, supplierGroup } = classifyMaterial(part.material_code, part.product_code);
        const { isSpray, spraySpec } = detectSprayRequired(part);

        if (category === "panels") {
          const key = `${part.material_code || part.product_code}_${part.thickness_mm || 18}`;
          const existing = panelGroups.get(key);
          if (existing) {
            existing.parts.push(part);
            existing.totalQty += part.quantity;
          } else {
            panelGroups.set(key, { parts: [part], totalQty: part.quantity });
          }

          if (isSpray) {
            buylistLines.push({
              job_id, tenant_id: tenantId,
              category: "paint_spray_subcontract", supplier_group: "spray_shop",
              item_name: `Spray – ${part.part_id} (${part.length_mm}×${part.width_mm})`,
              quantity: part.quantity, unit: "pcs",
              is_spray_required: true, spray_spec_json: spraySpec,
              source_part_id: part.id, source_type: "auto_spray",
              spec_json: { piece_type: "panel", length_mm: part.length_mm, width_mm: part.width_mm, thickness_mm: part.thickness_mm },
            });
          }
        } else {
          buylistLines.push({
            job_id, tenant_id: tenantId,
            category, supplier_group: supplierGroup,
            item_name: part.part_id || part.product_code,
            brand: part.material_code?.split("_")[0] || null,
            sku_code: part.product_code,
            quantity: part.quantity, unit: "pcs",
            is_spray_required: isSpray, spray_spec_json: spraySpec,
            source_part_id: part.id, source_type: "auto_bom",
            spec_json: { length_mm: part.length_mm, width_mm: part.width_mm, thickness_mm: part.thickness_mm, colour: part.colour_name },
          });
        }
      }

      // Add consolidated panel lines
      for (const [key, group] of panelGroups) {
        const sample = group.parts[0];
        buylistLines.push({
          job_id, tenant_id: tenantId,
          category: "panels", supplier_group: "panel_suppliers",
          item_name: sample.material_code || sample.product_code || key,
          brand: sample.material_code?.split("_")[0] || null,
          quantity: group.totalQty, unit: "parts",
          is_spray_required: false,
          source_type: "auto_panel_consolidation",
          spec_json: { thickness_mm: sample.thickness_mm || 18, colour_name: sample.colour_name, part_count: group.totalQty },
          notes: `${group.parts.length} unique part(s), ${group.totalQty} total`,
        });
      }

      // Nesting groups for sheet-level info
      const { data: groups } = await supabaseAdmin
        .from("job_nesting_groups")
        .select("id, group_label, material_code, colour_name, thickness_mm, sheet_length_mm, sheet_width_mm")
        .eq("job_id", job_id);

      if (groups && groups.length > 0) {
        const { data: sheets } = await supabaseAdmin
          .from("job_sheets").select("group_id, id").eq("job_id", job_id);
        const sheetCountByGroup: Record<string, number> = {};
        (sheets ?? []).forEach((s: any) => {
          sheetCountByGroup[s.group_id] = (sheetCountByGroup[s.group_id] || 0) + 1;
        });

        for (const g of groups) {
          const sheetCount = sheetCountByGroup[g.id] || 1;
          const sizeKey = `${g.sheet_length_mm}x${g.sheet_width_mm}`;
          const existingPanel = buylistLines.find(
            (l: any) => l.category === "panels" && l.source_type === "auto_panel_consolidation" &&
              l.item_name === (g.material_code || g.group_label)
          );
          if (existingPanel) {
            existingPanel.spec_json = { ...existingPanel.spec_json, sheet_size_key: sizeKey, sheets_required: sheetCount };
            existingPanel.quantity = sheetCount;
            existingPanel.unit = "sheets";
          } else {
            buylistLines.push({
              job_id, tenant_id: tenantId,
              category: "panels", supplier_group: "panel_suppliers",
              item_name: g.material_code || g.group_label,
              brand: g.material_code?.split("_")[0] || null,
              quantity: sheetCount, unit: "sheets",
              is_spray_required: false, source_type: "auto_nesting",
              spec_json: { thickness_mm: g.thickness_mm || 18, colour_name: g.colour_name, sheet_size_key: sizeKey },
            });
          }
        }
      }

      // Save buylist (delete old, insert new)
      await supabaseAdmin.from("buylist_line_items").delete().eq("job_id", job_id);
      if (buylistLines.length > 0) {
        await supabaseAdmin.from("buylist_line_items").insert(buylistLines);
      }
      await supabaseAdmin.from("jobs").update({ buylist_generated_at: new Date().toISOString() }).eq("id", job_id);
      result.buylist_count = buylistLines.length;
      result.steps.push("buylist_generated");

      // Step 3: Match suppliers and create RFQs
      const { data: suppliers } = await supabaseAdmin
        .from("suppliers").select("id, name, rfq_email, is_preferred, active, supplier_type, is_default_spray_shop")
        .eq("active", true).eq("tenant_id", tenantId);

      const { data: capabilities } = await supabaseAdmin
        .from("supplier_capabilities").select("*");

      const capsBySupplier = new Map<string, any[]>();
      (capabilities ?? []).forEach((c: any) => {
        const list = capsBySupplier.get(c.supplier_id) || [];
        list.push(c);
        capsBySupplier.set(c.supplier_id, list);
      });

      const mode = settings?.rfq_send_mode || "all_matching";
      const topN = settings?.rfq_top_n || 3;
      const requiredByDate = new Date(Date.now() + (settings?.default_required_by_days_from_now || 7) * 86400000).toISOString().split("T")[0];

      // Match suppliers to buylist lines
      type MatchedSupplier = { id: string; name: string; rfq_email: string | null; is_preferred: boolean; supplier_type: string | null; is_default_spray_shop: boolean; matchedLineIndices: number[]; score: number };
      const scored: MatchedSupplier[] = [];

      for (const supplier of (suppliers || [])) {
        const caps = capsBySupplier.get(supplier.id) || [];
        const matchedIndices: number[] = [];

        for (let i = 0; i < buylistLines.length; i++) {
          const line = buylistLines[i];
          let matched = false;

          if (supplier.supplier_type && supplier.supplier_type !== "general") {
            if (supplier.supplier_type === line.supplier_group) matched = true;
          }
          if (!matched && supplier.is_default_spray_shop && (line.is_spray_required || line.category === "paint_spray_subcontract")) {
            matched = true;
          }
          if (!matched && caps.length > 0) {
            matched = caps.some((cap: any) => {
              if (cap.category_supported && cap.category_supported !== line.category) return false;
              if (cap.material_brand && cap.material_brand !== "Generic" && line.brand && !line.brand.toLowerCase().includes(cap.material_brand.toLowerCase())) return false;
              return true;
            });
          }
          if (!matched && !supplier.supplier_type && caps.length === 0) matched = true;

          if (matched) matchedIndices.push(i);
        }

        if (matchedIndices.length > 0) {
          scored.push({
            id: supplier.id, name: supplier.name, rfq_email: supplier.rfq_email,
            is_preferred: supplier.is_preferred, supplier_type: supplier.supplier_type,
            is_default_spray_shop: supplier.is_default_spray_shop || false,
            matchedLineIndices: matchedIndices,
            score: (supplier.is_preferred ? 10 : 0) + matchedIndices.length,
          });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      let matched = scored;
      if (mode === "preferred_only") matched = scored.filter(s => s.is_preferred);
      if (mode === "top_n") matched = scored.slice(0, topN);

      // Group by supplier_type for RFQs
      const supplierGroups = new Map<string, MatchedSupplier[]>();
      for (const s of matched) {
        const key = s.supplier_type || "general";
        const list = supplierGroups.get(key) || [];
        list.push(s);
        supplierGroups.set(key, list);
      }

      const coveredIndices = new Set<number>();
      let rfqsCreated = 0;
      let totalRecipients = 0;
      const rfqIds: string[] = [];

      for (const [groupKey, groupSuppliers] of supplierGroups) {
        const groupLineIndices = new Set<number>();
        for (const s of groupSuppliers) {
          for (const idx of s.matchedLineIndices) {
            groupLineIndices.add(idx);
            coveredIndices.add(idx);
          }
        }
        if (groupLineIndices.size === 0) continue;

        const { data: rfqNumData } = await supabaseAdmin.rpc("generate_rfq_number", { _tenant_id: tenantId });
        const rfqNumber = rfqNumData || `RFQ-${Date.now()}`;

        const { data: rfq, error: rfqError } = await supabaseAdmin.from("rfq_requests").insert({
          job_id, tenant_id: tenantId, rfq_number: rfqNumber, status: "draft",
          required_by_date: requiredByDate,
          delivery_address_text: settings?.default_delivery_address || null,
          supplier_group: groupKey,
        }).select("id").single();

        if (rfqError || !rfq) continue;
        rfqIds.push(rfq.id);

        const lineItems = Array.from(groupLineIndices).map(idx => {
          const line = buylistLines[idx];
          return {
            rfq_id: rfq.id, tenant_id: tenantId,
            material_key: line.item_name, brand: line.brand,
            colour_name: line.spec_json?.colour_name || null,
            thickness_mm: line.spec_json?.thickness_mm || 18,
            sheet_size_key: line.spec_json?.sheet_size_key || "",
            quantity_sheets: line.quantity,
            category: line.category, unit: line.unit,
            item_name: line.item_name, sku_code: line.sku_code,
            spec_json: line.spec_json,
          };
        });

        await supabaseAdmin.from("rfq_line_items").insert(lineItems);

        for (const supplier of groupSuppliers) {
          await supabaseAdmin.from("rfq_recipients").insert({
            rfq_id: rfq.id, tenant_id: tenantId,
            supplier_id: supplier.id, send_status: "pending",
          });
          totalRecipients++;
        }

        rfqsCreated++;

        await supabaseAdmin.from("purchasing_audit_log").insert({
          job_id, tenant_id: tenantId, action: "rfq_generated", entity_type: "rfq", entity_id: rfq.id,
          details_json: { rfq_number: rfqNumber, supplier_group: groupKey, line_count: lineItems.length, supplier_count: groupSuppliers.length },
        });
      }

      result.rfqs_created = rfqsCreated;
      result.total_recipients = totalRecipients;
      result.rfq_ids = rfqIds;
      result.steps.push("rfqs_generated");

      // Find unmatched items
      const unmatchedItems = buylistLines.filter((_: any, idx: number) => !coveredIndices.has(idx));
      result.unmatched_count = unmatchedItems.length;

      // Notify about unmatched items
      if (unmatchedItems.length > 0) {
        const unmatchedNames = unmatchedItems.map((i: any) => i.item_name).slice(0, 10).join(", ");
        const { data: adminUsers } = await supabaseAdmin
          .from("user_roles").select("user_id").eq("tenant_id", tenantId).in("role", ["admin", "office"]);

        for (const u of (adminUsers || [])) {
          await supabaseAdmin.from("notifications").insert({
            user_id: u.user_id, tenant_id: tenantId,
            title: "⚠ Unmatched buylist items",
            message: `${unmatchedItems.length} item(s) have no matching suppliers for Job ${job.job_id || job_id}: ${unmatchedNames}`,
            type: "warning", link: `/jobs/${job_id}`,
          });
        }
        result.steps.push("unmatched_notifications_sent");
      }

      // Notify about RFQs created
      const categories = [...new Set(buylistLines.map((l: any) => l.category))];
      const catLabels: Record<string, string> = {
        panels: "Panels", hardware: "Hardware", lighting: "Lighting",
        paint_spray_subcontract: "Spray", finishing_oils: "Finishing",
        edgebanding: "Edgebanding", fixings: "Fixings", handles: "Handles",
        legs: "Legs", other: "Other",
      };
      const catSummary = categories.map(c => catLabels[c] || c).join(", ");

      const { data: notifyUsers } = await supabaseAdmin
        .from("user_roles").select("user_id").eq("tenant_id", tenantId).in("role", ["admin", "office", "supervisor"]);

      for (const u of (notifyUsers || [])) {
        await supabaseAdmin.from("notifications").insert({
          user_id: u.user_id, tenant_id: tenantId,
          title: `RFQs generated for Job ${job.job_id || ""}`,
          message: `${rfqsCreated} RFQ(s) sent to ${totalRecipients} supplier(s) (${catSummary})`,
          type: "info", link: `/jobs/${job_id}`,
        });
      }
      result.steps.push("notifications_sent");

      // Auto-send if configured
      if (settings?.auto_send_rfqs && rfqIds.length > 0) {
        result.steps.push("auto_send_queued");
        // The UI will handle sending via the send-rfq-emails function
      }
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("auto-purchasing error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helper functions (duplicated from buylistEngine for edge function context) ───

function classifyMaterial(materialCode: string | null, productCode: string | null): { category: string; supplierGroup: string } {
  const code = (materialCode || productCode || "").toLowerCase();
  if (code.includes("edge") || code.includes("tape") || code.includes("eb_")) return { category: "edgebanding", supplierGroup: "edgebanding_suppliers" };
  if (code.includes("hinge") || code.includes("drawer") || code.includes("slide") || code.includes("bracket") || code.includes("cam") || code.includes("dowel") || code.includes("screw")) return { category: "hardware", supplierGroup: "hardware_suppliers" };
  if (code.includes("handle") || code.includes("knob") || code.includes("pull")) return { category: "handles", supplierGroup: "hardware_suppliers" };
  if (code.includes("leg") || code.includes("plinth") || code.includes("foot")) return { category: "legs", supplierGroup: "hardware_suppliers" };
  if (code.includes("fixing") || code.includes("mount")) return { category: "fixings", supplierGroup: "hardware_suppliers" };
  if (code.includes("light") || code.includes("led") || code.includes("lamp") || code.includes("driver")) return { category: "lighting", supplierGroup: "lighting_suppliers" };
  if (code.includes("oil") || code.includes("lacquer") || code.includes("wax") || code.includes("stain") || code.includes("finish")) return { category: "finishing_oils", supplierGroup: "finishing_suppliers" };
  if (code.includes("paint") || code.includes("spray") || code.includes("primer")) return { category: "paint_spray_subcontract", supplierGroup: "spray_shop" };
  return { category: "panels", supplierGroup: "panel_suppliers" };
}

function detectSprayRequired(part: any): { isSpray: boolean; spraySpec: Record<string, any> | null } {
  const code = ((part.material_code || "") + " " + (part.product_code || "")).toLowerCase();
  const partId = (part.part_id || "").toLowerCase();
  
  // Primary rule: MR MDF detection (Inventor source of truth)
  if (code.includes("mr mdf") || partId.includes("mr mdf")) {
    return {
      isSpray: true,
      spraySpec: {
        colour_name: part.colour_name || "TBC",
        finish_type: code.includes("matt") ? "Matt" : code.includes("gloss") ? "Gloss" : "Satin",
        material_type: "MR MDF",
        substrate: part.material_code || "MR MDF",
        length_mm: part.length_mm,
        width_mm: part.width_mm,
        thickness_mm: part.thickness_mm,
        spray_reason: "Matched MR MDF rule",
      },
    };
  }
  
  // Secondary: explicit spray/paint keywords
  if (code.includes("spray") || code.includes("paint") || code.includes("lacq") || code.includes("primer")) {
    return {
      isSpray: true,
      spraySpec: {
        colour_name: part.colour_name || "TBC",
        finish_type: code.includes("matt") ? "Matt" : code.includes("gloss") ? "Gloss" : "Satin",
        material_type: part.material_code || "MDF",
        spray_reason: "Matched spray/paint keyword",
      },
    };
  }
  
  return { isSpray: false, spraySpec: null };
}
