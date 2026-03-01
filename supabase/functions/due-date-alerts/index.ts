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

    // ── 1. Unpaid invoices due within 7 days ──
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, amount_ex_vat, due_date, tenant_id, customer_id")
      .neq("status", "paid")
      .neq("status", "cancelled")
      .gte("due_date", todayStr)
      .lte("due_date", alertDateStr);

    // ── 2. Unpaid bills due within 7 days ──
    const { data: bills } = await supabase
      .from("bills")
      .select("id, bill_reference, amount_ex_vat, due_date, tenant_id, supplier_id")
      .neq("status", "paid")
      .neq("status", "cancelled")
      .gte("due_date", todayStr)
      .lte("due_date", alertDateStr);

    // ── 3. Overdue job stages ──
    const { data: overdueStages } = await supabase
      .from("job_stages")
      .select("id, stage_name, due_date, job_id, tenant_id, status")
      .neq("status", "Done")
      .lt("due_date", todayStr);

    // ── 4. Stages due within 2 days (upcoming) ──
    const twoDays = new Date(today);
    twoDays.setDate(twoDays.getDate() + 2);
    const twoDaysStr = twoDays.toISOString().split("T")[0];

    const { data: upcomingStages } = await supabase
      .from("job_stages")
      .select("id, stage_name, due_date, job_id, tenant_id, status")
      .neq("status", "Done")
      .gte("due_date", todayStr)
      .lte("due_date", twoDaysStr);

    // Collect tenant IDs
    const tenantIds = new Set<string>();
    (invoices ?? []).forEach((i) => tenantIds.add(i.tenant_id));
    (bills ?? []).forEach((b) => tenantIds.add(b.tenant_id));
    (overdueStages ?? []).forEach((s) => tenantIds.add(s.tenant_id));
    (upcomingStages ?? []).forEach((s) => tenantIds.add(s.tenant_id));

    if (tenantIds.size === 0) {
      return new Response(
        JSON.stringify({ message: "No upcoming due dates", created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin/office/supervisor users for each tenant
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, tenant_id, role")
      .in("role", ["admin", "office", "supervisor"])
      .in("tenant_id", Array.from(tenantIds));

    const tenantUsers = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const list = tenantUsers.get(r.tenant_id) || [];
      if (!list.includes(r.user_id)) list.push(r.user_id);
      tenantUsers.set(r.tenant_id, list);
    });

    // Get job codes for stage alerts
    const stageJobIds = new Set<string>();
    (overdueStages ?? []).forEach((s) => stageJobIds.add(s.job_id));
    (upcomingStages ?? []).forEach((s) => stageJobIds.add(s.job_id));

    let jobMap = new Map<string, string>();
    if (stageJobIds.size > 0) {
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, job_id")
        .in("id", Array.from(stageJobIds));
      (jobs ?? []).forEach((j: any) => jobMap.set(j.id, j.job_id));
    }

    // Check existing notifications to avoid duplicates today
    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("link")
      .gte("created_at", todayStr + "T00:00:00Z")
      .or("title.ilike.%due%,title.ilike.%overdue%");

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

    const daysOverdue = (dueDate: string) => {
      const due = new Date(dueDate);
      const diff = Math.ceil(
        (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diff === 1 ? "1 day" : `${diff} days`;
    };

    // ── Invoice notifications ──
    for (const inv of invoices ?? []) {
      const link = `/finance/invoices?highlight=${inv.id}`;
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

    // ── Bill notifications ──
    for (const bill of bills ?? []) {
      const link = `/finance/bills?highlight=${bill.id}`;
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

    // ── Overdue stage notifications ──
    for (const stage of overdueStages ?? []) {
      const jobCode = jobMap.get(stage.job_id) || "Unknown";
      const link = `/jobs/${stage.job_id}/builder`;
      if (existingLinks.has(link + `#overdue-${stage.id}`)) continue;
      const users = tenantUsers.get(stage.tenant_id) || [];
      for (const userId of users) {
        notifications.push({
          user_id: userId,
          tenant_id: stage.tenant_id,
          title: `${jobCode} — ${stage.stage_name} overdue by ${daysOverdue(stage.due_date!)}`,
          message: `Stage "${stage.stage_name}" on job ${jobCode} was due ${stage.due_date}. Current status: ${stage.status}.`,
          type: "warning",
          link: link + `#overdue-${stage.id}`,
        });
      }
    }

    // ── Upcoming stage notifications ──
    for (const stage of upcomingStages ?? []) {
      const jobCode = jobMap.get(stage.job_id) || "Unknown";
      const link = `/jobs/${stage.job_id}/builder`;
      if (existingLinks.has(link + `#upcoming-${stage.id}`)) continue;
      const users = tenantUsers.get(stage.tenant_id) || [];
      for (const userId of users) {
        notifications.push({
          user_id: userId,
          tenant_id: stage.tenant_id,
          title: `${jobCode} — ${stage.stage_name} due ${daysUntil(stage.due_date!)}`,
          message: `Stage "${stage.stage_name}" on job ${jobCode} is due ${stage.due_date}.`,
          type: "info",
          link: link + `#upcoming-${stage.id}`,
        });
      }
    }

    // Insert notifications in batch
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
        overdue_stages: (overdueStages ?? []).length,
        upcoming_stages: (upcomingStages ?? []).length,
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
