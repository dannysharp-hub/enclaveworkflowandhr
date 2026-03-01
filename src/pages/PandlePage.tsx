import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Settings, Save, Plus, Trash2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-xs font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";
const btnPrimary = "flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors";
const btnOutline = "flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-medium text-foreground hover:bg-secondary/50 disabled:opacity-50 transition-colors";

const INTERNAL_CATEGORIES = [
  "Materials", "Appliances", "Worktops", "Subcontractor", "Transport",
  "Rent", "Utilities", "Software", "Wages", "Other",
];

// ─── Settings Tab ─────────────────────────────────────────
function PandleSettingsTab() {
  const [settings, setSettings] = useState<any>(null);
  const [form, setForm] = useState({
    connector_enabled: false,
    default_sales_nominal_code: "4000",
    default_purchase_nominal_code: "5000",
    default_vat_code_sales: "T1",
    default_vat_code_purchases: "T1",
    auto_mark_exported: false,
    export_currency: "GBP",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("pandle_settings").select("*").maybeSingle();
    if (data) {
      setSettings(data);
      setForm({
        connector_enabled: data.connector_enabled,
        default_sales_nominal_code: data.default_sales_nominal_code,
        default_purchase_nominal_code: data.default_purchase_nominal_code,
        default_vat_code_sales: data.default_vat_code_sales,
        default_vat_code_purchases: data.default_vat_code_purchases,
        auto_mark_exported: data.auto_mark_exported,
        export_currency: data.export_currency,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings) {
        const { error } = await supabase.from("pandle_settings").update(form).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pandle_settings").insert([form] as any);
        if (error) throw error;
      }
      toast({ title: "Pandle settings saved" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading settings…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-mono text-sm font-bold text-foreground">Connector Configuration</h3>
          <p className="text-xs text-muted-foreground">Configure Pandle CSV export defaults</p>
        </div>
        <button onClick={handleSave} disabled={saving} className={btnPrimary}>
          <Save size={14} /> {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.connector_enabled} onChange={e => setForm(f => ({ ...f, connector_enabled: e.target.checked }))}
              className="w-4 h-4 rounded border-border accent-primary" />
            <span className="text-sm font-medium text-foreground">Enable Pandle Connector</span>
          </label>
          <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full", form.connector_enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
            {form.connector_enabled ? "Active" : "Disabled"}
          </span>
        </div>

        <div>
          <label className={labelClass}>Default Sales Nominal Code</label>
          <input className={inputClass} value={form.default_sales_nominal_code} onChange={e => setForm(f => ({ ...f, default_sales_nominal_code: e.target.value }))} />
        </div>
        <div>
          <label className={labelClass}>Default Purchase Nominal Code</label>
          <input className={inputClass} value={form.default_purchase_nominal_code} onChange={e => setForm(f => ({ ...f, default_purchase_nominal_code: e.target.value }))} />
        </div>
        <div>
          <label className={labelClass}>Default VAT Code (Sales)</label>
          <input className={inputClass} value={form.default_vat_code_sales} onChange={e => setForm(f => ({ ...f, default_vat_code_sales: e.target.value }))} />
        </div>
        <div>
          <label className={labelClass}>Default VAT Code (Purchases)</label>
          <input className={inputClass} value={form.default_vat_code_purchases} onChange={e => setForm(f => ({ ...f, default_vat_code_purchases: e.target.value }))} />
        </div>
        <div>
          <label className={labelClass}>Export Currency</label>
          <input className={inputClass} value={form.export_currency} onChange={e => setForm(f => ({ ...f, export_currency: e.target.value }))} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <input type="checkbox" checked={form.auto_mark_exported} onChange={e => setForm(f => ({ ...f, auto_mark_exported: e.target.checked }))}
              className="w-4 h-4 rounded border-border accent-primary" />
            <span className="text-sm text-foreground">Auto-mark records as exported</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── Nominal Mapping Tab ──────────────────────────────────
function NominalMappingTab() {
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  const load = useCallback(async () => {
    const [mapRes, setRes] = await Promise.all([
      supabase.from("nominal_mappings").select("*").order("internal_category"),
      supabase.from("pandle_settings").select("*").maybeSingle(),
    ]);
    setMappings(mapRes.data ?? []);
    setSettings(setRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const mapped = new Set(mappings.map(m => `${m.internal_category}|${m.mapping_type}`));

  const handleUpsert = async (category: string, type: string, code: string) => {
    setSaving(true);
    try {
      const existing = mappings.find(m => m.internal_category === category && m.mapping_type === type);
      if (existing) {
        const { error } = await supabase.from("nominal_mappings").update({ pandle_nominal_code: code }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("nominal_mappings").insert([{ internal_category: category, pandle_nominal_code: code, mapping_type: type }] as any);
        if (error) throw error;
      }
      toast({ title: "Mapping saved" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("nominal_mappings").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading mappings…</div>;

  const defaultSales = settings?.default_sales_nominal_code || "4000";
  const defaultPurchase = settings?.default_purchase_nominal_code || "5000";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-mono text-sm font-bold text-foreground">Nominal Code Mappings</h3>
        <p className="text-xs text-muted-foreground">Map internal categories to Pandle nominal codes. Unmapped categories use defaults ({defaultSales} / {defaultPurchase}).</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Category</th>
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Type</th>
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Nominal Code</th>
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {INTERNAL_CATEGORIES.map(cat => {
              const purchaseMapping = mappings.find(m => m.internal_category === cat && m.mapping_type === "purchase");
              return (
                <NominalRow
                  key={cat}
                  category={cat}
                  type="purchase"
                  mapping={purchaseMapping}
                  defaultCode={defaultPurchase}
                  onSave={(code) => handleUpsert(cat, "purchase", code)}
                  onDelete={purchaseMapping ? () => handleDelete(purchaseMapping.id) : undefined}
                  saving={saving}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NominalRow({ category, type, mapping, defaultCode, onSave, onDelete, saving }: {
  category: string; type: string; mapping: any; defaultCode: string;
  onSave: (code: string) => void; onDelete?: () => void; saving: boolean;
}) {
  const [code, setCode] = useState(mapping?.pandle_nominal_code || "");
  const isMapped = !!mapping;

  return (
    <tr className="hover:bg-secondary/20 transition-colors">
      <td className="p-3 text-sm font-medium text-foreground">{category}</td>
      <td className="p-3">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">{type}</span>
      </td>
      <td className="p-3">
        <input
          className="h-8 w-32 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder={defaultCode}
        />
      </td>
      <td className="p-3">
        {isMapped ? (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-success/15 text-success">Mapped</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">
            <AlertTriangle size={10} /> Default
          </span>
        )}
      </td>
      <td className="p-3 text-right">
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => onSave(code)} disabled={saving || !code} className={btnPrimary}>
            <Save size={12} /> Save
          </button>
          {onDelete && (
            <button onClick={onDelete} className="p-2 rounded-md text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── VAT Mapping Tab ──────────────────────────────────────
function VATMappingTab() {
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRate, setNewRate] = useState("");
  const [newCode, setNewCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("vat_mappings").select("*").order("internal_vat_rate");
    setMappings(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newRate || !newCode) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("vat_mappings").insert([{
        internal_vat_rate: parseFloat(newRate),
        pandle_vat_code: newCode,
      }] as any);
      if (error) throw error;
      toast({ title: "VAT mapping added" });
      setNewRate(""); setNewCode("");
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleUpdate = async (id: string, code: string) => {
    const { error } = await supabase.from("vat_mappings").update({ pandle_vat_code: code }).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Updated" }); load(); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("vat_mappings").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else load();
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading VAT mappings…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-mono text-sm font-bold text-foreground">VAT Code Mappings</h3>
        <p className="text-xs text-muted-foreground">Map VAT rates to Pandle VAT codes. Exports are blocked if a VAT rate is missing a mapping.</p>
      </div>

      {/* Add new */}
      <div className="flex items-end gap-3 p-4 rounded-lg bg-muted/30 border border-border">
        <div>
          <label className={labelClass}>VAT Rate (%)</label>
          <input type="number" step="0.01" className="h-9 w-24 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="20" />
        </div>
        <div>
          <label className={labelClass}>Pandle VAT Code</label>
          <input className="h-9 w-32 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="T1" />
        </div>
        <button onClick={handleAdd} disabled={saving || !newRate || !newCode} className={btnPrimary}>
          <Plus size={14} /> Add Mapping
        </button>
      </div>

      {mappings.length === 0 ? (
        <div className="p-6 text-center rounded-lg border border-dashed border-border">
          <AlertTriangle size={20} className="mx-auto text-warning mb-2" />
          <p className="text-sm text-muted-foreground">No VAT mappings configured. Exports will be blocked until at least one mapping is added.</p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">VAT Rate</th>
              <th className="text-left p-3 text-xs font-mono font-medium text-muted-foreground uppercase">Pandle Code</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mappings.map(m => (
              <VATRow key={m.id} mapping={m} onUpdate={handleUpdate} onDelete={() => handleDelete(m.id)} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function VATRow({ mapping, onUpdate, onDelete }: { mapping: any; onUpdate: (id: string, code: string) => void; onDelete: () => void }) {
  const [code, setCode] = useState(mapping.pandle_vat_code);
  return (
    <tr className="hover:bg-secondary/20 transition-colors">
      <td className="p-3 font-mono text-sm text-foreground">{mapping.internal_vat_rate}%</td>
      <td className="p-3">
        <input
          className="h-8 w-32 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={code} onChange={e => setCode(e.target.value)}
        />
      </td>
      <td className="p-3 text-right">
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => onUpdate(mapping.id, code)} disabled={code === mapping.pandle_vat_code} className={btnPrimary}>
            <Save size={12} /> Save
          </button>
          <button onClick={onDelete} className="p-2 rounded-md text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function PandlePage() {
  const { userRole } = useAuth();
  const canEdit = ["admin", "office"].includes(userRole || "");

  if (!canEdit) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        You don't have permission to access Pandle connector settings.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet size={20} className="text-primary" />
          <h2 className="text-2xl font-mono font-bold text-foreground">Pandle Connector</h2>
        </div>
        <p className="text-sm text-muted-foreground">Configure CSV export mappings for Pandle accounting software</p>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="bg-muted/30 border border-border">
          <TabsTrigger value="settings" className="text-xs font-mono">Settings</TabsTrigger>
          <TabsTrigger value="nominal" className="text-xs font-mono">Nominal Codes</TabsTrigger>
          <TabsTrigger value="vat" className="text-xs font-mono">VAT Codes</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="glass-panel rounded-lg p-5">
          <PandleSettingsTab />
        </TabsContent>
        <TabsContent value="nominal" className="glass-panel rounded-lg p-5">
          <NominalMappingTab />
        </TabsContent>
        <TabsContent value="vat" className="glass-panel rounded-lg p-5">
          <VATMappingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
