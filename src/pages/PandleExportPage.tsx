import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { generatePreview, executeExport, type ExportOptions, type ExportPreview } from "@/lib/pandleExport";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Download, AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2,
  Receipt, Wallet, Users, Truck, CreditCard, History,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const labelClass = "block text-xs font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";
const btnPrimary = "flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors";
const btnOutline = "flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium text-foreground hover:bg-secondary/50 disabled:opacity-50 transition-colors";
const inputClass = "h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

// ─── Export Tab ───────────────────────────────────────────
function ExportTab() {
  const [opts, setOpts] = useState<ExportOptions>({
    exportInvoices: true,
    exportBills: true,
    exportCustomers: false,
    exportSuppliers: false,
    exportPayments: false,
    dateFrom: null,
    dateTo: null,
    statusFilter: "all",
  });
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [connectorEnabled, setConnectorEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.from("pandle_settings").select("connector_enabled").maybeSingle().then(({ data }) => {
      setConnectorEnabled(data?.connector_enabled ?? false);
    });
  }, []);

  const handlePreview = async () => {
    setLoading(true);
    try {
      const p = await generatePreview(opts);
      setPreview(p);
    } catch (err: any) {
      toast({ title: "Error generating preview", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (preview?.errors.length) {
      toast({ title: "Cannot export", description: "Fix errors before exporting", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const { batchId } = await executeExport(opts);
      toast({ title: "Export complete", description: `Batch ${batchId.slice(0, 8)}… downloaded` });
      setPreview(null);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const anySelected = opts.exportInvoices || opts.exportBills || opts.exportCustomers || opts.exportSuppliers || opts.exportPayments;

  if (connectorEnabled === false) {
    return (
      <div className="p-8 text-center rounded-lg border border-dashed border-border">
        <AlertTriangle size={24} className="mx-auto text-warning mb-2" />
        <p className="text-sm text-muted-foreground">Pandle connector is disabled. Enable it in the <a href="/finance/pandle" className="text-primary underline">Pandle settings</a>.</p>
      </div>
    );
  }

  const checkboxes: { key: keyof ExportOptions; label: string; icon: any }[] = [
    { key: "exportInvoices", label: "Sales Invoices", icon: Receipt },
    { key: "exportBills", label: "Purchase Bills", icon: Wallet },
    { key: "exportCustomers", label: "Customers", icon: Users },
    { key: "exportSuppliers", label: "Suppliers", icon: Truck },
    { key: "exportPayments", label: "Payments", icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      {/* Selection */}
      <div>
        <h3 className="font-mono text-sm font-bold text-foreground mb-3">Select Export Types</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {checkboxes.map(({ key, label, icon: Icon }) => (
            <label
              key={key}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                opts[key] ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/30"
              )}
            >
              <input
                type="checkbox"
                checked={opts[key] as boolean}
                onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.checked }))}
                className="w-4 h-4 rounded border-border accent-primary"
              />
              <Icon size={16} className={opts[key] ? "text-primary" : "text-muted-foreground"} />
              <span className="text-sm font-medium text-foreground">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/30 border border-border">
        <div>
          <label className={labelClass}>Date From</label>
          <input type="date" className={cn(inputClass, "w-full")} value={opts.dateFrom || ""} onChange={(e) => setOpts((o) => ({ ...o, dateFrom: e.target.value || null }))} />
        </div>
        <div>
          <label className={labelClass}>Date To</label>
          <input type="date" className={cn(inputClass, "w-full")} value={opts.dateTo || ""} onChange={(e) => setOpts((o) => ({ ...o, dateTo: e.target.value || null }))} />
        </div>
        <div>
          <label className={labelClass}>Status Filter</label>
          <select
            className={cn(inputClass, "w-full")}
            value={opts.statusFilter}
            onChange={(e) => setOpts((o) => ({ ...o, statusFilter: e.target.value as any }))}
          >
            <option value="all">All</option>
            <option value="paid">Paid Only</option>
            <option value="unpaid">Unpaid Only</option>
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={handlePreview} disabled={loading || !anySelected} className={btnOutline}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          Preview Export
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <div className="space-y-4 p-5 rounded-lg border border-border bg-card">
          <h3 className="font-mono text-sm font-bold text-foreground">Export Preview</h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {opts.exportInvoices && (
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-mono font-bold text-foreground">{preview.invoiceCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Invoices</p>
                <p className="text-xs font-mono text-primary">£{preview.invoiceTotal.toFixed(2)}</p>
              </div>
            )}
            {opts.exportBills && (
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-mono font-bold text-foreground">{preview.billCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Bills</p>
                <p className="text-xs font-mono text-primary">£{preview.billTotal.toFixed(2)}</p>
              </div>
            )}
            {opts.exportCustomers && (
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-mono font-bold text-foreground">{preview.customerCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Customers</p>
              </div>
            )}
            {opts.exportSuppliers && (
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-mono font-bold text-foreground">{preview.supplierCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Suppliers</p>
              </div>
            )}
            {opts.exportPayments && (
              <div className="p-3 rounded-lg bg-muted/30 text-center">
                <p className="text-2xl font-mono font-bold text-foreground">{preview.paymentCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Payments</p>
              </div>
            )}
          </div>

          {/* Errors */}
          {preview.errors.length > 0 && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-xs font-mono font-bold text-destructive mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> ERRORS — Export Blocked
              </p>
              <ul className="text-xs text-destructive space-y-0.5">
                {preview.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-xs font-mono font-bold text-warning mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> WARNINGS
              </p>
              <ul className="text-xs text-warning space-y-0.5">
                {preview.warnings.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
          )}

          {/* Confirm */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleExport}
              disabled={exporting || preview.errors.length > 0}
              className={btnPrimary}
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exporting ? "Exporting…" : "Confirm & Download ZIP"}
            </button>
            <button onClick={() => setPreview(null)} className={btnOutline}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────
function HistoryTab() {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("export_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setBatches(data ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading history…</div>;
  if (batches.length === 0) return <div className="p-6 text-center text-sm text-muted-foreground">No exports yet.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Date</th>
            <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Types</th>
            <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Records</th>
            <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Value</th>
            <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Date Range</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {batches.map((b) => (
            <tr key={b.id} className="hover:bg-secondary/20 transition-colors">
              <td className="p-3 text-sm text-foreground font-mono">{format(new Date(b.created_at), "dd MMM yyyy HH:mm")}</td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1">
                  {(b.export_types || []).map((t: string) => (
                    <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase">{t}</span>
                  ))}
                </div>
              </td>
              <td className="p-3 font-mono text-sm text-foreground">{b.record_count}</td>
              <td className="p-3 font-mono text-sm text-foreground">£{Number(b.total_value || 0).toFixed(2)}</td>
              <td className="p-3 text-xs text-muted-foreground">
                {b.date_range_start && b.date_range_end
                  ? `${b.date_range_start} → ${b.date_range_end}`
                  : "All dates"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function PandleExportPage() {
  const { userRole } = useAuth();
  const canExport = ["admin", "office"].includes(userRole || "");

  if (!canExport) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        You don't have permission to export data.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Download size={20} className="text-primary" />
          <h2 className="text-2xl font-mono font-bold text-foreground">Pandle Export</h2>
        </div>
        <p className="text-sm text-muted-foreground">Generate Pandle-compatible CSV files for import</p>
      </div>

      <Tabs defaultValue="export" className="space-y-4">
        <TabsList className="bg-muted/30 border border-border">
          <TabsTrigger value="export" className="text-xs font-mono">Export</TabsTrigger>
          <TabsTrigger value="history" className="text-xs font-mono">History</TabsTrigger>
        </TabsList>
        <TabsContent value="export" className="glass-panel rounded-lg p-5">
          <ExportTab />
        </TabsContent>
        <TabsContent value="history" className="glass-panel rounded-lg p-5">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
