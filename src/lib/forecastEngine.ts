import { supabase } from "@/integrations/supabase/client";
import { addDays, addWeeks, addMonths, addQuarters, addYears, format, isBefore, isAfter, parseISO } from "date-fns";

// ─── Types ────────────────────────────────────────────────
export interface Assumptions {
  probability_of_quote_conversion_percent: number;
  average_days_to_invoice_after_stage_complete: number;
  average_days_to_pay_after_invoice_due: number;
  late_payment_probability_percent: number;
  late_payment_extra_days: number;
  deposit_probability_percent: number;
  deposit_percent_of_quote: number;
  wage_buffer_percent: number;
  overhead_buffer_percent: number;
  bill_slippage_probability_percent: number;
  bill_slippage_extra_days: number;
}

export interface CashflowEvent {
  scenario_id: string;
  event_date: string;
  event_type: "cash_in" | "cash_out";
  source_type: string;
  source_id: string | null;
  job_id: string | null;
  counterparty_name: string | null;
  description: string;
  amount: number;
  confidence: "high" | "medium" | "low";
}

export interface ForecastSummary {
  openingBalance: number;
  inflows30: number; outflows30: number;
  inflows60: number; outflows60: number;
  inflows90: number; outflows90: number;
  endingBalance30: number; endingBalance60: number; endingBalance90: number;
  minBalance: number; minBalanceDate: string;
  dailyBalances: { date: string; inflow: number; outflow: number; balance: number }[];
  events: CashflowEvent[];
  alerts: ForecastAlert[];
}

export interface ForecastAlert {
  type: "shortfall" | "overdue_invoices" | "bills_due" | "large_payment" | "wage_shortfall";
  severity: "critical" | "warning" | "info";
  message: string;
  date?: string;
  amount?: number;
}

const DEFAULT_ASSUMPTIONS: Assumptions = {
  probability_of_quote_conversion_percent: 70,
  average_days_to_invoice_after_stage_complete: 3,
  average_days_to_pay_after_invoice_due: 0,
  late_payment_probability_percent: 15,
  late_payment_extra_days: 14,
  deposit_probability_percent: 80,
  deposit_percent_of_quote: 30,
  wage_buffer_percent: 0,
  overhead_buffer_percent: 0,
  bill_slippage_probability_percent: 10,
  bill_slippage_extra_days: 7,
};

// ─── Helpers ──────────────────────────────────────────────
function dateStr(d: Date): string { return format(d, "yyyy-MM-dd"); }
function inWindow(date: string, start: Date, end: Date): boolean {
  const d = parseISO(date);
  return !isBefore(d, start) && !isAfter(d, end);
}

function expandRecurring(startDate: string, recurring: string, endDate: string | null, windowEnd: Date): string[] {
  const dates: string[] = [];
  let current = parseISO(startDate);
  const limit = endDate ? parseISO(endDate) : windowEnd;
  const adder = recurring === "weekly" ? addWeeks
    : recurring === "monthly" ? addMonths
    : recurring === "quarterly" ? addQuarters
    : recurring === "annual" ? addYears
    : null;
  if (!adder) return [startDate];
  while (!isAfter(current, limit) && !isAfter(current, windowEnd)) {
    dates.push(dateStr(current));
    current = adder(current, 1);
  }
  return dates;
}

// ─── Data Fetchers ────────────────────────────────────────
async function fetchAllData() {
  const [invoicesRes, billsRes, overheadsRes, adjustmentsRes, settingsRes, schedulesRes] = await Promise.all([
    supabase.from("invoices").select("*, customers(name)").in("status", ["draft", "sent", "part_paid", "overdue"]),
    supabase.from("bills").select("*, suppliers(name)").in("status", ["unpaid", "part_paid", "overdue"]),
    supabase.from("overheads").select("*").eq("active", true),
    supabase.from("cashflow_adjustments" as any).select("*").eq("active", true),
    supabase.from("cashflow_settings" as any).select("*").maybeSingle(),
    supabase.from("job_payment_schedules" as any).select("*").eq("status", "expected"),
  ]);
  return {
    invoices: invoicesRes.data ?? [],
    bills: billsRes.data ?? [],
    overheads: overheadsRes.data ?? [],
    adjustments: adjustmentsRes.data ?? [],
    settings: settingsRes.data as any,
    schedules: schedulesRes.data ?? [],
  };
}

// ─── Event Generation ─────────────────────────────────────
function generateInvoiceEvents(invoices: any[], assumptions: Assumptions, scenarioId: string, windowEnd: Date): CashflowEvent[] {
  const events: CashflowEvent[] = [];
  const today = new Date();

  for (const inv of invoices) {
    const remaining = Number(inv.amount_ex_vat || 0) + Number(inv.vat_amount || 0) - Number(inv.amount_paid || 0);
    if (remaining <= 0) continue;

    const dueDate = parseISO(inv.due_date);
    const basePay = addDays(dueDate, assumptions.average_days_to_pay_after_invoice_due);

    // On-time portion
    const onTimeRatio = (100 - assumptions.late_payment_probability_percent) / 100;
    const onTimeAmount = remaining * onTimeRatio;
    const onTimeDate = dateStr(isBefore(basePay, today) ? today : basePay);

    if (onTimeAmount > 0 && inWindow(onTimeDate, today, windowEnd)) {
      events.push({
        scenario_id: scenarioId, event_date: onTimeDate, event_type: "cash_in",
        source_type: "invoice", source_id: inv.id, job_id: inv.job_id,
        counterparty_name: inv.customers?.name || null,
        description: `Invoice ${inv.invoice_number} (on-time)`,
        amount: Math.round(onTimeAmount * 100) / 100,
        confidence: "high",
      });
    }

    // Late portion
    const lateAmount = remaining * (assumptions.late_payment_probability_percent / 100);
    const lateDate = dateStr(addDays(isBefore(basePay, today) ? today : basePay, assumptions.late_payment_extra_days));

    if (lateAmount > 0 && inWindow(lateDate, today, windowEnd)) {
      events.push({
        scenario_id: scenarioId, event_date: lateDate, event_type: "cash_in",
        source_type: "invoice", source_id: inv.id, job_id: inv.job_id,
        counterparty_name: inv.customers?.name || null,
        description: `Invoice ${inv.invoice_number} (late portion)`,
        amount: Math.round(lateAmount * 100) / 100,
        confidence: "medium",
      });
    }
  }
  return events;
}

function generateBillEvents(bills: any[], assumptions: Assumptions, scenarioId: string, windowEnd: Date): CashflowEvent[] {
  const events: CashflowEvent[] = [];
  const today = new Date();

  for (const bill of bills) {
    const remaining = Number(bill.amount_ex_vat || 0) + Number(bill.vat_amount || 0) - Number(bill.amount_paid || 0);
    if (remaining <= 0) continue;

    const dueDate = parseISO(bill.due_date);
    const baseDate = isBefore(dueDate, today) ? today : dueDate;

    // On-time portion
    const onTimeRatio = (100 - assumptions.bill_slippage_probability_percent) / 100;
    const onTimeAmount = remaining * onTimeRatio;
    const onTimeDate = dateStr(baseDate);

    if (onTimeAmount > 0 && inWindow(onTimeDate, today, windowEnd)) {
      events.push({
        scenario_id: scenarioId, event_date: onTimeDate, event_type: "cash_out",
        source_type: "bill", source_id: bill.id, job_id: bill.job_id,
        counterparty_name: bill.suppliers?.name || null,
        description: `Bill ${bill.bill_reference} (on-time)`,
        amount: Math.round(onTimeAmount * 100) / 100,
        confidence: "high",
      });
    }

    // Slippage portion
    const slipAmount = remaining * (assumptions.bill_slippage_probability_percent / 100);
    const slipDate = dateStr(addDays(baseDate, assumptions.bill_slippage_extra_days));

    if (slipAmount > 0 && inWindow(slipDate, today, windowEnd)) {
      events.push({
        scenario_id: scenarioId, event_date: slipDate, event_type: "cash_out",
        source_type: "bill", source_id: bill.id, job_id: bill.job_id,
        counterparty_name: bill.suppliers?.name || null,
        description: `Bill ${bill.bill_reference} (slippage)`,
        amount: Math.round(slipAmount * 100) / 100,
        confidence: "medium",
      });
    }
  }
  return events;
}

function generateOverheadEvents(overheads: any[], assumptions: Assumptions, scenarioId: string, windowEnd: Date): CashflowEvent[] {
  const events: CashflowEvent[] = [];
  const today = new Date();
  const bufferMultiplier = 1 + (assumptions.overhead_buffer_percent / 100);

  for (const oh of overheads) {
    const amount = Number(oh.amount || 0) * bufferMultiplier;
    if (amount <= 0) continue;

    const freqMap: Record<string, string> = { monthly: "monthly", weekly: "weekly", quarterly: "quarterly", annual: "annual" };
    const recurring = freqMap[oh.frequency] || "monthly";
    const startDate = oh.next_due_date || dateStr(today);
    const dates = expandRecurring(startDate, recurring, null, windowEnd);

    for (const d of dates) {
      if (inWindow(d, today, windowEnd)) {
        events.push({
          scenario_id: scenarioId, event_date: d, event_type: "cash_out",
          source_type: "overhead", source_id: oh.id, job_id: null,
          counterparty_name: oh.name,
          description: `Overhead: ${oh.name} (${oh.category})`,
          amount: Math.round(amount * 100) / 100,
          confidence: "high",
        });
      }
    }
  }
  return events;
}

function generateWageEvents(overheads: any[], assumptions: Assumptions, scenarioId: string, payCycle: string, windowEnd: Date): CashflowEvent[] {
  // Wages sourced from overheads with category "wages"
  const wageOverheads = overheads.filter(o => o.category?.toLowerCase() === "wages");
  const events: CashflowEvent[] = [];
  const today = new Date();
  const bufferMultiplier = 1 + (assumptions.wage_buffer_percent / 100);

  for (const w of wageOverheads) {
    const amount = Number(w.amount || 0) * bufferMultiplier;
    if (amount <= 0) continue;

    const startDate = w.next_due_date || dateStr(today);
    const dates = expandRecurring(startDate, payCycle, null, windowEnd);

    for (const d of dates) {
      if (inWindow(d, today, windowEnd)) {
        events.push({
          scenario_id: scenarioId, event_date: d, event_type: "cash_out",
          source_type: "wage_plan", source_id: w.id, job_id: null,
          counterparty_name: w.name,
          description: `Wages: ${w.name}`,
          amount: Math.round(amount * 100) / 100,
          confidence: "high",
        });
      }
    }
  }
  return events;
}

function generateAdjustmentEvents(adjustments: any[], scenarioId: string, windowEnd: Date): CashflowEvent[] {
  const events: CashflowEvent[] = [];
  const today = new Date();

  for (const adj of adjustments) {
    // Only include if no scenario specified or matches this scenario
    if (adj.scenario_id && adj.scenario_id !== scenarioId) continue;

    const amount = Number(adj.amount || 0);
    if (amount <= 0) continue;

    const dates = adj.recurring === "none"
      ? [adj.event_date]
      : expandRecurring(adj.event_date, adj.recurring, adj.end_date, windowEnd);

    for (const d of dates) {
      if (inWindow(d, today, windowEnd)) {
        events.push({
          scenario_id: scenarioId, event_date: d,
          event_type: adj.event_type,
          source_type: "manual_adjustment", source_id: adj.id, job_id: null,
          counterparty_name: null,
          description: `Manual: ${adj.description}`,
          amount: Math.round(amount * 100) / 100,
          confidence: "high",
        });
      }
    }
  }
  return events;
}

function generateScheduleEvents(schedules: any[], scenarioId: string, windowEnd: Date): CashflowEvent[] {
  const events: CashflowEvent[] = [];
  const today = new Date();

  for (const s of schedules) {
    const amount = Number(s.amount || 0);
    if (amount <= 0 || !inWindow(s.expected_date, today, windowEnd)) continue;

    events.push({
      scenario_id: scenarioId, event_date: s.expected_date, event_type: "cash_in",
      source_type: "invoice", source_id: s.id, job_id: s.job_id,
      counterparty_name: null,
      description: `Job milestone: ${s.milestone}`,
      amount: Math.round(amount * 100) / 100,
      confidence: s.status === "invoiced" ? "high" : "medium",
    });
  }
  return events;
}

// ─── Alerts ───────────────────────────────────────────────
function generateAlerts(
  dailyBalances: { date: string; balance: number }[],
  events: CashflowEvent[],
  bufferAmount: number,
  horizonDays: number
): ForecastAlert[] {
  const alerts: ForecastAlert[] = [];
  const today = new Date();
  const horizon = addDays(today, horizonDays);

  // Shortfall alerts
  for (const day of dailyBalances) {
    if (isAfter(parseISO(day.date), horizon)) break;
    if (day.balance < bufferAmount) {
      alerts.push({
        type: "shortfall",
        severity: day.balance < 0 ? "critical" : "warning",
        message: `Projected balance £${day.balance.toFixed(0)} on ${day.date} (below £${bufferAmount.toFixed(0)} buffer)`,
        date: day.date,
        amount: day.balance,
      });
      break; // Only first shortfall
    }
  }

  // Large single payments (> 20% of opening or > £5000)
  const threshold = 5000;
  events
    .filter(e => e.event_type === "cash_out" && e.amount > threshold && inWindow(e.event_date, today, horizon))
    .forEach(e => {
      alerts.push({
        type: "large_payment",
        severity: "warning",
        message: `Large payment £${e.amount.toFixed(0)} due ${e.event_date}: ${e.description}`,
        date: e.event_date,
        amount: e.amount,
      });
    });

  // Bills due in next 7 days
  const next7 = addDays(today, 7);
  const billsDue7 = events.filter(e => e.source_type === "bill" && e.event_type === "cash_out" && inWindow(e.event_date, today, next7));
  const billsTotal7 = billsDue7.reduce((s, e) => s + e.amount, 0);
  if (billsTotal7 > 0) {
    alerts.push({
      type: "bills_due",
      severity: billsTotal7 > threshold ? "warning" : "info",
      message: `£${billsTotal7.toFixed(0)} in bills due within 7 days (${billsDue7.length} bills)`,
      amount: billsTotal7,
    });
  }

  return alerts;
}

// ─── Main Generator ───────────────────────────────────────
export async function generateForecast(scenarioId: string): Promise<ForecastSummary> {
  const data = await fetchAllData();
  
  // Get scenario
  const { data: scenario } = await supabase.from("cashflow_scenarios" as any).select("*").eq("id", scenarioId).single();
  if (!scenario) throw new Error("Scenario not found");

  const sc = scenario as any;
  const assumptions: Assumptions = { ...DEFAULT_ASSUMPTIONS, ...(sc.assumptions_json || {}) };
  const settings = data.settings;
  const payCycle = settings?.default_pay_cycle || "monthly";
  
  // Determine opening balance
  let openingBalance = Number(settings?.opening_balance || 0);
  if (settings?.auto_calculate_opening) {
    // Sum paid invoices - paid bills as a simple auto-calc
    const { data: paidInv } = await supabase.from("invoices").select("amount_paid").eq("status", "paid");
    const { data: paidBills } = await supabase.from("bills").select("amount_paid").eq("status", "paid");
    const invTotal = (paidInv ?? []).reduce((s: number, i: any) => s + Number(i.amount_paid || 0), 0);
    const billTotal = (paidBills ?? []).reduce((s: number, b: any) => s + Number(b.amount_paid || 0), 0);
    openingBalance = invTotal - billTotal;
  }

  const today = new Date();
  const windowEnd = addDays(today, 90);

  // Generate all events
  // Filter wage overheads out of regular overheads to avoid double-counting
  const nonWageOverheads = data.overheads.filter((o: any) => o.category?.toLowerCase() !== "wages");
  
  const events: CashflowEvent[] = [
    ...generateInvoiceEvents(data.invoices, assumptions, scenarioId, windowEnd),
    ...generateBillEvents(data.bills, assumptions, scenarioId, windowEnd),
    ...generateOverheadEvents(nonWageOverheads, assumptions, scenarioId, windowEnd),
    ...generateWageEvents(data.overheads, assumptions, scenarioId, payCycle, windowEnd),
    ...generateAdjustmentEvents(data.adjustments, scenarioId, windowEnd),
    ...generateScheduleEvents(data.schedules, scenarioId, windowEnd),
  ].sort((a, b) => a.event_date.localeCompare(b.event_date));

  // Build daily balances
  const dailyMap = new Map<string, { inflow: number; outflow: number }>();
  for (let d = new Date(today); !isAfter(d, windowEnd); d = addDays(d, 1)) {
    dailyMap.set(dateStr(d), { inflow: 0, outflow: 0 });
  }
  for (const e of events) {
    const entry = dailyMap.get(e.event_date);
    if (entry) {
      if (e.event_type === "cash_in") entry.inflow += e.amount;
      else entry.outflow += e.amount;
    }
  }

  let balance = openingBalance;
  let minBalance = openingBalance;
  let minBalanceDate = dateStr(today);
  const dailyBalances: { date: string; inflow: number; outflow: number; balance: number }[] = [];

  for (const [date, { inflow, outflow }] of dailyMap) {
    balance += inflow - outflow;
    dailyBalances.push({ date, inflow: Math.round(inflow * 100) / 100, outflow: Math.round(outflow * 100) / 100, balance: Math.round(balance * 100) / 100 });
    if (balance < minBalance) { minBalance = balance; minBalanceDate = date; }
  }

  // Compute period totals
  const d30 = dateStr(addDays(today, 30));
  const d60 = dateStr(addDays(today, 60));
  const d90 = dateStr(addDays(today, 90));

  const sumRange = (end: string, type: "inflow" | "outflow") =>
    dailyBalances.filter(d => d.date <= end).reduce((s, d) => s + d[type], 0);

  const bufferAmount = Number(settings?.minimum_cash_buffer_amount || 0);
  const horizonDays = Number(settings?.alert_horizon_days || 30);
  const alerts = generateAlerts(dailyBalances, events, bufferAmount, horizonDays);

  return {
    openingBalance: Math.round(openingBalance * 100) / 100,
    inflows30: Math.round(sumRange(d30, "inflow") * 100) / 100,
    outflows30: Math.round(sumRange(d30, "outflow") * 100) / 100,
    inflows60: Math.round(sumRange(d60, "inflow") * 100) / 100,
    outflows60: Math.round(sumRange(d60, "outflow") * 100) / 100,
    inflows90: Math.round(sumRange(d90, "inflow") * 100) / 100,
    outflows90: Math.round(sumRange(d90, "outflow") * 100) / 100,
    endingBalance30: Math.round((openingBalance + sumRange(d30, "inflow") - sumRange(d30, "outflow")) * 100) / 100,
    endingBalance60: Math.round((openingBalance + sumRange(d60, "inflow") - sumRange(d60, "outflow")) * 100) / 100,
    endingBalance90: Math.round((openingBalance + sumRange(d90, "inflow") - sumRange(d90, "outflow")) * 100) / 100,
    minBalance: Math.round(minBalance * 100) / 100,
    minBalanceDate,
    dailyBalances,
    events,
    alerts,
  };
}

// ─── Persist Events ───────────────────────────────────────
export async function persistForecastEvents(scenarioId: string, events: CashflowEvent[]) {
  // Clear old events for this scenario
  await (supabase.from("cashflow_events" as any) as any).delete().eq("scenario_id", scenarioId);

  // Insert in batches of 500
  for (let i = 0; i < events.length; i += 500) {
    const batch = events.slice(i, i + 500);
    await (supabase.from("cashflow_events" as any) as any).insert(batch);
  }
}

// ─── CSV Export ───────────────────────────────────────────
export function forecastEventsToCsv(events: CashflowEvent[]): string {
  const headers = ["Event Date", "Type", "Source", "Job ID", "Counterparty", "Description", "Amount", "Confidence"];
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = events.map(e => [e.event_date, e.event_type, e.source_type, e.job_id || "", e.counterparty_name || "", e.description, e.amount.toFixed(2), e.confidence].map(escape).join(","));
  return [headers.join(","), ...rows].join("\n");
}

export function forecastSummaryToCsv(summary: ForecastSummary): string {
  const lines = [
    "Metric,30 Days,60 Days,90 Days",
    `Inflows,${summary.inflows30.toFixed(2)},${summary.inflows60.toFixed(2)},${summary.inflows90.toFixed(2)}`,
    `Outflows,${summary.outflows30.toFixed(2)},${summary.outflows60.toFixed(2)},${summary.outflows90.toFixed(2)}`,
    `Ending Balance,${summary.endingBalance30.toFixed(2)},${summary.endingBalance60.toFixed(2)},${summary.endingBalance90.toFixed(2)}`,
    "",
    `Opening Balance,${summary.openingBalance.toFixed(2)}`,
    `Minimum Balance,${summary.minBalance.toFixed(2)}`,
    `Min Balance Date,${summary.minBalanceDate}`,
  ];
  return lines.join("\n");
}
