import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date();
    const alertDate = new Date(today);
    alertDate.setDate(alertDate.getDate() + 7);
    const todayStr = today.toISOString().split("T")[0];
    const alertDateStr = alertDate.toISOString().split("T")[0];

    // Get unpaid invoices due within 7 days
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, amount_ex_vat, due_date, tenant_id, customer_id")
      .neq("status", "paid")
      .neq("status", "cancelled")
      .gte("due_date", todayStr)
      .lte("due_date", alertDateStr);

    // Get unpaid bills due within 7 days
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_reference, amount_ex_vat, due_date, tenant_id, supplier_id")
      .neq("status", "paid")
      .neq("status", "cancelled")
      .gte("due_date", todayStr)
      .lte("due_date", alertDateStr);

    // Collect tenant IDs from both
    const tenantIds = new Set<string>();
    (invoices ?? []).forEach((i) => tenantIds.add(i.tenant_id));
    (bills ?? []).forEach((b) => tenantIds.add(b.tenant_id));

    if (tenantIds.size === 0) {
      return new Response(
        JSON.stringify({ message: "No upcoming due dates", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin/office users for each tenant
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, tenant_id, role")
      .in("role", ["admin", "office"])
      .in("tenant_id", Array.from(tenantIds));

    const tenantUsers = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const list = tenantUsers.get(r.tenant_id) || [];
      if (!list.includes(r.user_id)) list.push(r.user_id);
      tenantUsers.set(r.tenant_id, list);
    });

    // Check existing notifications to avoid duplicates (same day)
    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("link")
      .gte("created_at", todayStr + "T00:00:00Z")
      .like("title", "%due%");

    const existingLinks = new Set(
      (existingNotifs ?? []).map((n) => n.link).filter(Boolean)
    );

    const notifications: Array<{
      user_id: string;
      tenant_id: string;
      title: string;
      message: string;
      type: string;
      link: string;
    }> = [];

    const fmt = (n: number) =>
      `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const daysUntil = (dueDate: string) => {
      const due = new Date(dueDate);
      const diff = Math.ceil(
        (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diff === 0 ? "today" : diff === 1 ? "tomorrow" : `in ${diff} days`;
    };

    // Invoice notifications
    for (const inv of invoices ?? []) {
      const link = `/invoices?highlight=${inv.id}`;
      if (existingLinks.has(link)) continue;

      const users = tenantUsers.get(inv.tenant_id) || [];
      for (const userId of users) {
        notifications.push({
          user_id: userId,
          tenant_id: inv.tenant_id,
          title: `Invoice ${inv.invoice_number} due ${daysUntil(inv.due_date)}`,
          message: `Invoice ${inv.invoice_number} for ${fmt(Number(inv.amount_ex_vat))} is due ${inv.due_date}.`,
          type: "warning",
          link,
        });
      }
    }

    // Bill notifications
    for (const bill of bills ?? []) {
      const link = `/bills?highlight=${bill.id}`;
      if (existingLinks.has(link)) continue;

      const users = tenantUsers.get(bill.tenant_id) || [];
      for (const userId of users) {
        notifications.push({
          user_id: userId,
          tenant_id: bill.tenant_id,
          title: `Bill ${bill.bill_reference} due ${daysUntil(bill.due_date)}`,
          message: `Bill ${bill.bill_reference} for ${fmt(Number(bill.amount_ex_vat))} is due ${bill.due_date}.`,
          type: "warning",
          link,
        });
      }
    }

    // Insert notifications in batches
    let created = 0;
    if (notifications.length > 0) {
      const { error } = await supabase.from("notifications").insert(notifications);
      if (error) throw error;
      created = notifications.length;
    }

    return new Response(
      JSON.stringify({
        message: `Created ${created} due-date alerts`,
        invoices_checked: (invoices ?? []).length,
        bills_checked: (bills ?? []).length,
        created,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
