import { supabase } from "@/integrations/supabase/client";
import { exportToCsv } from "@/lib/csvExport";
import { format } from "date-fns";
import JSZip from "jszip";
import { saveAs } from "file-saver";

// ─── Types ────────────────────────────────────────────────
export interface ExportOptions {
  exportInvoices: boolean;
  exportBills: boolean;
  exportCustomers: boolean;
  exportSuppliers: boolean;
  exportPayments: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  statusFilter: "all" | "paid" | "unpaid";
}

export interface ExportPreview {
  invoiceCount: number;
  billCount: number;
  customerCount: number;
  supplierCount: number;
  paymentCount: number;
  invoiceTotal: number;
  billTotal: number;
  warnings: string[];
  errors: string[];
}

interface NominalMapping {
  internal_category: string;
  pandle_nominal_code: string;
  mapping_type: string;
}

interface VatMapping {
  internal_vat_rate: number;
  pandle_vat_code: string;
}

// ─── Helpers ──────────────────────────────────────────────
function resolveNominalCode(
  category: string,
  type: "sales" | "purchase",
  mappings: NominalMapping[],
  defaultCode: string
): { code: string; isDefault: boolean } {
  const m = mappings.find(
    (m) => m.internal_category === category && m.mapping_type === type
  );
  return m
    ? { code: m.pandle_nominal_code, isDefault: false }
    : { code: defaultCode, isDefault: true };
}

function resolveVatCode(
  rate: number,
  vatMappings: VatMapping[]
): { code: string | null; missing: boolean } {
  const m = vatMappings.find((v) => v.internal_vat_rate === rate);
  return m ? { code: m.pandle_vat_code, missing: false } : { code: null, missing: true };
}

// ─── Data Fetching ────────────────────────────────────────
async function fetchMappings() {
  const [settingsRes, nomRes, vatRes] = await Promise.all([
    supabase.from("pandle_settings").select("*").maybeSingle(),
    supabase.from("nominal_mappings").select("*"),
    supabase.from("vat_mappings").select("*"),
  ]);
  return {
    settings: settingsRes.data,
    nominalMappings: (nomRes.data ?? []) as NominalMapping[],
    vatMappings: (vatRes.data ?? []) as VatMapping[],
  };
}

async function fetchInvoices(opts: ExportOptions) {
  let q = supabase
    .from("invoices")
    .select("*, customers!inner(name, email)")
    .order("issue_date");
  if (opts.dateFrom) q = q.gte("issue_date", opts.dateFrom);
  if (opts.dateTo) q = q.lte("issue_date", opts.dateTo);
  if (opts.statusFilter === "paid") q = q.eq("status", "paid");
  if (opts.statusFilter === "unpaid") q = q.neq("status", "paid");
  const { data } = await q;
  return data ?? [];
}

async function fetchBills(opts: ExportOptions) {
  let q = supabase
    .from("bills")
    .select("*, suppliers!inner(name)")
    .order("issue_date");
  if (opts.dateFrom) q = q.gte("issue_date", opts.dateFrom);
  if (opts.dateTo) q = q.lte("issue_date", opts.dateTo);
  if (opts.statusFilter === "paid") q = q.eq("status", "paid");
  if (opts.statusFilter === "unpaid") q = q.neq("status", "paid");
  const { data } = await q;
  return data ?? [];
}

async function fetchCustomers() {
  const { data } = await supabase.from("customers").select("*").eq("active", true).order("name");
  return data ?? [];
}

async function fetchSuppliers() {
  const { data } = await supabase.from("suppliers").select("*").eq("active", true).order("name");
  return data ?? [];
}

// ─── Preview ──────────────────────────────────────────────
export async function generatePreview(opts: ExportOptions): Promise<ExportPreview> {
  const { settings, nominalMappings, vatMappings } = await fetchMappings();
  const warnings: string[] = [];
  const errors: string[] = [];

  let invoices: any[] = [];
  let bills: any[] = [];
  let customers: any[] = [];
  let suppliers: any[] = [];

  if (opts.exportInvoices || opts.exportPayments) invoices = await fetchInvoices(opts);
  if (opts.exportBills || opts.exportPayments) bills = await fetchBills(opts);
  if (opts.exportCustomers) customers = await fetchCustomers();
  if (opts.exportSuppliers) suppliers = await fetchSuppliers();

  // Check VAT mappings
  if (opts.exportInvoices && vatMappings.length === 0) {
    errors.push("No VAT mappings configured. Invoice export will be blocked.");
  }
  if (opts.exportBills && vatMappings.length === 0) {
    errors.push("No VAT mappings configured. Bill export will be blocked.");
  }

  // Check for unmapped categories in bills
  if (opts.exportBills) {
    const categories = new Set(bills.map((b: any) => b.category));
    categories.forEach((cat) => {
      const resolved = resolveNominalCode(cat, "purchase", nominalMappings, settings?.default_purchase_nominal_code || "5000");
      if (resolved.isDefault) {
        warnings.push(`Category "${cat}" uses default nominal code ${resolved.code}`);
      }
    });
  }

  // Check required fields
  invoices.forEach((inv: any) => {
    if (!inv.customers?.name) warnings.push(`Invoice ${inv.invoice_number} missing customer name`);
    if (!inv.amount_ex_vat) warnings.push(`Invoice ${inv.invoice_number} has zero amount`);
  });

  const invoiceTotal = invoices.reduce((s: number, i: any) => s + Number(i.amount_ex_vat || 0) + Number(i.vat_amount || 0), 0);
  const billTotal = bills.reduce((s: number, b: any) => s + Number(b.amount_ex_vat || 0) + Number(b.vat_amount || 0), 0);

  // Count payments
  const paidInvoices = invoices.filter((i: any) => i.amount_paid > 0);
  const paidBills = bills.filter((b: any) => b.amount_paid > 0);

  return {
    invoiceCount: invoices.length,
    billCount: bills.length,
    customerCount: customers.length,
    supplierCount: suppliers.length,
    paymentCount: paidInvoices.length + paidBills.length,
    invoiceTotal,
    billTotal,
    warnings,
    errors,
  };
}

// ─── CSV Generators ───────────────────────────────────────
function csvEscape(v: any): string {
  const str = v == null ? "" : String(v);
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

function buildCsv(headers: string[], rows: any[][]): string {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
}

function buildInvoiceCsv(invoices: any[], nominalMappings: NominalMapping[], vatMappings: VatMapping[], settings: any): string {
  const headers = [
    "Invoice Number", "Customer Name", "Customer Email", "Invoice Date", "Due Date",
    "Description", "Net Amount", "VAT Amount", "VAT Code", "Gross Amount",
    "Nominal Code", "Reference", "Status",
  ];
  const defaultCode = settings?.default_sales_nominal_code || "4000";
  const rows = invoices.map((inv: any) => {
    const gross = Number(inv.amount_ex_vat || 0) + Number(inv.vat_amount || 0);
    const vatRate = inv.vat_amount && inv.amount_ex_vat ? Math.round((inv.vat_amount / inv.amount_ex_vat) * 100) : 20;
    const vatCode = resolveVatCode(vatRate, vatMappings);
    const nominal = resolveNominalCode("Sales", "sales", nominalMappings, defaultCode);
    return [
      inv.invoice_number,
      inv.customers?.name || "",
      inv.customers?.email || "",
      inv.issue_date,
      inv.due_date,
      inv.reference || "",
      Number(inv.amount_ex_vat || 0).toFixed(2),
      Number(inv.vat_amount || 0).toFixed(2),
      vatCode.code || settings?.default_vat_code_sales || "T1",
      gross.toFixed(2),
      nominal.code,
      inv.job_id || "",
      inv.status,
    ];
  });
  return buildCsv(headers, rows);
}

function buildBillCsv(bills: any[], nominalMappings: NominalMapping[], vatMappings: VatMapping[], settings: any): string {
  const headers = [
    "Bill Reference", "Supplier Name", "Bill Date", "Due Date",
    "Description", "Net Amount", "VAT Amount", "VAT Code", "Gross Amount",
    "Nominal Code", "Reference", "Status",
  ];
  const defaultCode = settings?.default_purchase_nominal_code || "5000";
  const rows = bills.map((bill: any) => {
    const gross = Number(bill.amount_ex_vat || 0) + Number(bill.vat_amount || 0);
    const vatRate = bill.vat_amount && bill.amount_ex_vat ? Math.round((bill.vat_amount / bill.amount_ex_vat) * 100) : 20;
    const vatCode = resolveVatCode(vatRate, vatMappings);
    const nominal = resolveNominalCode(bill.category || "Other", "purchase", nominalMappings, defaultCode);
    return [
      bill.bill_reference,
      bill.suppliers?.name || "",
      bill.issue_date,
      bill.due_date,
      bill.notes || bill.category || "",
      Number(bill.amount_ex_vat || 0).toFixed(2),
      Number(bill.vat_amount || 0).toFixed(2),
      vatCode.code || settings?.default_vat_code_purchases || "T1",
      gross.toFixed(2),
      nominal.code,
      bill.job_id || "",
      bill.status,
    ];
  });
  return buildCsv(headers, rows);
}

function buildCustomerCsv(customers: any[]): string {
  const headers = ["Name", "Email", "Phone", "Address"];
  const rows = customers.map((c: any) => [c.name, c.email || "", c.phone || "", c.billing_address || ""]);
  return buildCsv(headers, rows);
}

function buildSupplierCsv(suppliers: any[]): string {
  const headers = ["Name", "Email", "Phone", "Address"];
  const rows = suppliers.map((s: any) => [s.name, s.email || "", s.phone || "", s.address || ""]);
  return buildCsv(headers, rows);
}

function buildPaymentCsv(invoices: any[], bills: any[]): string {
  const headers = ["Reference", "Type", "Amount Paid", "Payment Date", "Payment Method"];
  const rows: any[][] = [];
  invoices.filter((i: any) => i.amount_paid > 0).forEach((inv: any) => {
    rows.push([inv.invoice_number, "Invoice", Number(inv.amount_paid).toFixed(2), inv.payment_received_date || "", inv.payment_method || ""]);
  });
  bills.filter((b: any) => b.amount_paid > 0).forEach((bill: any) => {
    rows.push([bill.bill_reference, "Bill", Number(bill.amount_paid).toFixed(2), bill.payment_date || "", ""]);
  });
  return buildCsv(headers, rows);
}

// ─── Export (ZIP) ─────────────────────────────────────────
export async function executeExport(opts: ExportOptions): Promise<{ batchId: string }> {
  const { settings, nominalMappings, vatMappings } = await fetchMappings();
  const dateStr = format(new Date(), "yyyy-MM-dd");
  const zip = new JSZip();

  let invoices: any[] = [];
  let bills: any[] = [];
  let totalRecords = 0;
  let totalValue = 0;
  const exportTypes: string[] = [];

  if (opts.exportInvoices || opts.exportPayments) invoices = await fetchInvoices(opts);
  if (opts.exportBills || opts.exportPayments) bills = await fetchBills(opts);

  if (opts.exportInvoices && invoices.length > 0) {
    zip.file(`Pandle_Sales_Invoices_${dateStr}.csv`, "\uFEFF" + buildInvoiceCsv(invoices, nominalMappings, vatMappings, settings));
    totalRecords += invoices.length;
    totalValue += invoices.reduce((s: number, i: any) => s + Number(i.amount_ex_vat || 0) + Number(i.vat_amount || 0), 0);
    exportTypes.push("invoices");
  }

  if (opts.exportBills && bills.length > 0) {
    zip.file(`Pandle_Purchase_Bills_${dateStr}.csv`, "\uFEFF" + buildBillCsv(bills, nominalMappings, vatMappings, settings));
    totalRecords += bills.length;
    totalValue += bills.reduce((s: number, b: any) => s + Number(b.amount_ex_vat || 0) + Number(b.vat_amount || 0), 0);
    exportTypes.push("bills");
  }

  if (opts.exportCustomers) {
    const customers = await fetchCustomers();
    if (customers.length > 0) {
      zip.file(`Pandle_Customers_${dateStr}.csv`, "\uFEFF" + buildCustomerCsv(customers));
      totalRecords += customers.length;
      exportTypes.push("customers");
    }
  }

  if (opts.exportSuppliers) {
    const suppliers = await fetchSuppliers();
    if (suppliers.length > 0) {
      zip.file(`Pandle_Suppliers_${dateStr}.csv`, "\uFEFF" + buildSupplierCsv(suppliers));
      totalRecords += suppliers.length;
      exportTypes.push("suppliers");
    }
  }

  if (opts.exportPayments) {
    const paidInv = invoices.filter((i: any) => i.amount_paid > 0);
    const paidBills = bills.filter((b: any) => b.amount_paid > 0);
    if (paidInv.length + paidBills.length > 0) {
      zip.file(`Pandle_Payments_${dateStr}.csv`, "\uFEFF" + buildPaymentCsv(invoices, bills));
      exportTypes.push("payments");
    }
  }

  // Create export batch record
  const { data: batch } = await supabase.from("export_batches").insert([{
    export_type: exportTypes.join(","),
    export_types: exportTypes,
    date_range_start: opts.dateFrom,
    date_range_end: opts.dateTo,
    status_filter: opts.statusFilter,
    record_count: totalRecords,
    total_value: totalValue,
    created_by: (await supabase.auth.getUser()).data.user?.id,
  }] as any).select("id").single();

  const batchId = batch?.id || "";

  // Mark records if auto_mark_exported
  if (settings?.auto_mark_exported && batchId) {
    const now = new Date().toISOString();
    if (opts.exportInvoices && invoices.length > 0) {
      const ids = invoices.map((i: any) => i.id);
      await supabase.from("invoices").update({
        pandle_exported: true,
        pandle_exported_at: now,
        pandle_export_batch_id: batchId,
      } as any).in("id", ids);
    }
    if (opts.exportBills && bills.length > 0) {
      const ids = bills.map((b: any) => b.id);
      await supabase.from("bills").update({
        pandle_exported: true,
        pandle_exported_at: now,
        pandle_export_batch_id: batchId,
      } as any).in("id", ids);
    }
  }

  // Generate and download ZIP
  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `Pandle_Export_${dateStr}.zip`);

  return { batchId };
}
