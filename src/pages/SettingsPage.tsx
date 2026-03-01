import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Building2, Kanban, Cpu, ToggleLeft, Save, Plus, Trash2, Pencil, X, Check, Palette, Upload } from "lucide-react";

// ─── Types ────────────────────────────────────────────
interface DepartmentConfig {
  id: string;
  name: string;
  minimum_staff_required_per_day: number;
  maximum_staff_off_per_day: number;
  coverage_warning_mode: string;
  active: boolean;
}

interface StageConfig {
  id: string;
  stage_name: string;
  order_index: number;
  active: boolean;
}

interface MachineConfig {
  id: string;
  name: string;
  department: string;
  active: boolean;
  default_available_hours_per_day: number;
}

interface FeatureFlag {
  id: string;
  flag_name: string;
  enabled: boolean;
}

const TABS = [
  { key: "branding", label: "Branding", icon: Palette },
  { key: "departments", label: "Departments", icon: Building2 },
  { key: "stages", label: "Stages", icon: Kanban },
  { key: "machines", label: "Machines", icon: Cpu },
  { key: "flags", label: "Feature Flags", icon: ToggleLeft },
] as const;

type TabKey = typeof TABS[number]["key"];

const FLAG_LABELS: Record<string, string> = {
  enable_qr_tracking: "QR Tracking",
  enable_remnants: "Remnants Module",
  enable_hr_cases: "HR Cases",
  enable_drive_integration: "Drive Integration",
  enable_notifications: "Notifications",
  enable_finance: "Finance Module",
};

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

export default function SettingsPage() {
  const { userRole, tenantId } = useAuth();
  const [tab, setTab] = useState<TabKey>("branding");
  const [departments, setDepartments] = useState<DepartmentConfig[]>([]);
  const [stages, setStages] = useState<StageConfig[]>([]);
  const [machines, setMachines] = useState<MachineConfig[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userRole === "admin") fetchAll();
  }, [userRole]);

  if (userRole !== "admin") return <Navigate to="/" replace />;

  const fetchAll = async () => {
    setLoading(true);
    const [dRes, sRes, mRes, fRes] = await Promise.all([
      supabase.from("department_config").select("*").order("name"),
      supabase.from("stage_config").select("*").order("order_index"),
      supabase.from("machine_config").select("*").order("name"),
      supabase.from("tenant_feature_flags").select("*").order("flag_name"),
    ]);
    setDepartments((dRes.data as any) ?? []);
    setStages((sRes.data as any) ?? []);
    setMachines((mRes.data as any) ?? []);
    setFlags((fRes.data as any) ?? []);
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-slide-in max-w-5xl">
      <div>
        <h1 className="text-xl font-mono font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage tenant configuration</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tab === "branding" && <BrandingTab />}
          {tab === "departments" && <DepartmentsTab data={departments} onRefresh={fetchAll} />}
          {tab === "stages" && <StagesTab data={stages} onRefresh={fetchAll} />}
          {tab === "machines" && <MachinesTab data={machines} departments={departments} onRefresh={fetchAll} />}
          {tab === "flags" && <FlagsTab data={flags} onRefresh={fetchAll} />}
        </>
      )}
    </div>
  );
}

// ─── Branding Tab ────────────────────────────────────
function BrandingTab() {
  const { tenantId } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [primaryColour, setPrimaryColour] = useState("#6d28d9");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("tenants").select("tenant_name, branding").single();
      if (data) {
        setCompanyName(data.tenant_name || "");
        const b = data.branding as any;
        if (b) {
          setSubtitle(b.subtitle || "");
          setPrimaryColour(b.primary_colour || "#6d28d9");
          setLogoUrl(b.logo_url || null);
        }
      }
      setLoaded(true);
    };
    load();
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${tenantId}/logo.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      setLogoUrl(urlData.publicUrl);
      toast({ title: "Logo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("tenants").update({
        tenant_name: companyName,
        branding: { subtitle, primary_colour: primaryColour, logo_url: logoUrl },
      }).eq("id", tenantId);
      if (error) throw error;
      toast({ title: "Branding saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <h3 className="font-mono text-sm font-bold text-foreground">Branding & Company</h3>

      <div className="glass-panel rounded-lg p-6 space-y-6 max-w-lg">
        {/* Logo */}
        <div>
          <label className={labelClass}>Company Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg border border-border bg-card flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="font-mono text-xl font-bold text-muted-foreground">
                  {companyName?.[0] || "?"}
                </span>
              )}
            </div>
            <div>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-xs font-medium text-secondary-foreground hover:bg-secondary/80 cursor-pointer">
                <Upload size={14} />
                {uploading ? "Uploading…" : "Upload Logo"}
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
              </label>
              <p className="text-[10px] text-muted-foreground mt-1">PNG or SVG, max 2MB</p>
            </div>
          </div>
        </div>

        {/* Company Name */}
        <div>
          <label className={labelClass}>Company Name</label>
          <input className={inputClass} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Enclave Cabinetry" />
        </div>

        {/* Subtitle */}
        <div>
          <label className={labelClass}>Subtitle / Tagline</label>
          <input className={inputClass} value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="CABINETRY" />
          <p className="text-[10px] text-muted-foreground mt-1">Shown below the company name in the sidebar</p>
        </div>

        {/* Primary Colour */}
        <div>
          <label className={labelClass}>Primary Colour</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColour}
              onChange={e => setPrimaryColour(e.target.value)}
              className="w-10 h-10 rounded-md border border-border cursor-pointer bg-transparent p-0.5"
            />
            <input
              className={cn(inputClass, "w-32 font-mono")}
              value={primaryColour}
              onChange={e => setPrimaryColour(e.target.value)}
              placeholder="#6d28d9"
            />
            <div className="w-24 h-10 rounded-md" style={{ backgroundColor: primaryColour }} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Used for accents and active states throughout the app</p>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !companyName.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save Branding"}
        </button>
      </div>
    </div>
  );
}

// ─── Departments Tab ─────────────────────────────────
function DepartmentsTab({ data, onRefresh }: { data: DepartmentConfig[]; onRefresh: () => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", minimum_staff_required_per_day: 1, maximum_staff_off_per_day: 2, coverage_warning_mode: "warn" });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEdit = (d: DepartmentConfig) => {
    setEditId(d.id);
    setForm({ name: d.name, minimum_staff_required_per_day: d.minimum_staff_required_per_day, maximum_staff_off_per_day: d.maximum_staff_off_per_day, coverage_warning_mode: d.coverage_warning_mode });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) {
        const { error } = await supabase.from("department_config").update({
          minimum_staff_required_per_day: form.minimum_staff_required_per_day,
          maximum_staff_off_per_day: form.maximum_staff_off_per_day,
          coverage_warning_mode: form.coverage_warning_mode,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("department_config").insert({
          name: form.name,
          minimum_staff_required_per_day: form.minimum_staff_required_per_day,
          maximum_staff_off_per_day: form.maximum_staff_off_per_day,
          coverage_warning_mode: form.coverage_warning_mode,
          tenant_id: '00000000-0000-0000-0000-000000000001',
        } as any);
        if (error) throw error;
      }
      toast({ title: "Saved" });
      setEditId(null);
      setAdding(false);
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d: DepartmentConfig) => {
    await supabase.from("department_config").update({ active: !d.active }).eq("id", d.id);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground">Departments & Coverage Rules</h3>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditId(null); setForm({ name: "", minimum_staff_required_per_day: 1, maximum_staff_off_per_day: 2, coverage_warning_mode: "warn" }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={14} /> Add
          </button>
        )}
      </div>

      {adding && (
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div><label className={labelClass}>Name</label><input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="New Dept" /></div>
            <div><label className={labelClass}>Min Staff/Day</label><input type="number" min={0} className={inputClass} value={form.minimum_staff_required_per_day} onChange={e => setForm(f => ({ ...f, minimum_staff_required_per_day: parseInt(e.target.value) || 0 }))} /></div>
            <div><label className={labelClass}>Max Off/Day</label><input type="number" min={0} className={inputClass} value={form.maximum_staff_off_per_day} onChange={e => setForm(f => ({ ...f, maximum_staff_off_per_day: parseInt(e.target.value) || 0 }))} /></div>
            <div><label className={labelClass}>Warning Mode</label>
              <select className={inputClass} value={form.coverage_warning_mode} onChange={e => setForm(f => ({ ...f, coverage_warning_mode: e.target.value }))}>
                <option value="warn">Warn</option><option value="block">Block</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.name} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Check size={14} /> Save</button>
            <button onClick={() => setAdding(false)} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Name</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Min Staff</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Max Off</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Mode</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {data.map(d => (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                {editId === d.id ? (
                  <>
                    <td className="px-4 py-2 font-medium text-foreground">{d.name}</td>
                    <td className="px-4 py-2"><input type="number" min={0} className={cn(inputClass, "w-20")} value={form.minimum_staff_required_per_day} onChange={e => setForm(f => ({ ...f, minimum_staff_required_per_day: parseInt(e.target.value) || 0 }))} /></td>
                    <td className="px-4 py-2"><input type="number" min={0} className={cn(inputClass, "w-20")} value={form.maximum_staff_off_per_day} onChange={e => setForm(f => ({ ...f, maximum_staff_off_per_day: parseInt(e.target.value) || 0 }))} /></td>
                    <td className="px-4 py-2">
                      <select className={cn(inputClass, "w-24")} value={form.coverage_warning_mode} onChange={e => setForm(f => ({ ...f, coverage_warning_mode: e.target.value }))}>
                        <option value="warn">Warn</option><option value="block">Block</option>
                      </select>
                    </td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button onClick={handleSave} disabled={saving} className="p-1 text-primary hover:text-primary/80"><Check size={14} /></button>
                        <button onClick={() => setEditId(null)} className="p-1 text-muted-foreground hover:text-foreground"><X size={14} /></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 font-medium text-foreground">{d.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.minimum_staff_required_per_day}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.maximum_staff_off_per_day}</td>
                    <td className="px-4 py-2"><span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono", d.coverage_warning_mode === "block" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning")}>{d.coverage_warning_mode}</span></td>
                    <td className="px-4 py-2">
                      <button onClick={() => toggleActive(d)} className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono cursor-pointer", d.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{d.active ? "Active" : "Inactive"}</button>
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => startEdit(d)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No departments configured</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Stages Tab ──────────────────────────────────────
function StagesTab({ data, onRefresh }: { data: StageConfig[]; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const maxOrder = data.reduce((m, s) => Math.max(m, s.order_index), -1);
      const { error } = await supabase.from("stage_config").insert({ stage_name: newName.trim(), order_index: maxOrder + 1, tenant_id: '00000000-0000-0000-0000-000000000001' } as any);
      if (error) throw error;
      toast({ title: "Stage added" });
      setNewName("");
      setAdding(false);
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: StageConfig) => {
    await supabase.from("stage_config").update({ active: !s.active }).eq("id", s.id);
    onRefresh();
  };

  const moveStage = async (s: StageConfig, direction: "up" | "down") => {
    const sorted = [...data].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(x => x.id === s.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      supabase.from("stage_config").update({ order_index: other.order_index }).eq("id", s.id),
      supabase.from("stage_config").update({ order_index: s.order_index }).eq("id", other.id),
    ]);
    onRefresh();
  };

  const sorted = [...data].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground">Workflow Stages (Kanban Columns)</h3>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={14} /> Add Stage
          </button>
        )}
      </div>

      {adding && (
        <div className="glass-panel rounded-lg p-4 flex items-end gap-3">
          <div className="flex-1"><label className={labelClass}>Stage Name</label><input className={inputClass} value={newName} onChange={e => setNewName(e.target.value)} placeholder="QA Check" /></div>
          <button onClick={handleAdd} disabled={saving || !newName.trim()} className="h-9 px-3 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Save</button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="h-9 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      )}

      <div className="glass-panel rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase w-12">Order</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Stage Name</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
            <th className="px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Reorder</th>
          </tr></thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                <td className="px-4 py-2 text-muted-foreground font-mono">{s.order_index}</td>
                <td className="px-4 py-2 font-medium text-foreground">{s.stage_name}</td>
                <td className="px-4 py-2">
                  <button onClick={() => toggleActive(s)} className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono cursor-pointer", s.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{s.active ? "Active" : "Inactive"}</button>
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => moveStage(s, "up")} disabled={i === 0} className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30">↑</button>
                    <button onClick={() => moveStage(s, "down")} disabled={i === sorted.length - 1} className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30">↓</button>
                  </div>
                </td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No stages configured</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Machines Tab ────────────────────────────────────
function MachinesTab({ data, departments, onRefresh }: { data: MachineConfig[]; departments: DepartmentConfig[]; onRefresh: () => void }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", department: "CNC", default_available_hours_per_day: 8 });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) {
        const { error } = await supabase.from("machine_config").update({
          department: form.department,
          default_available_hours_per_day: form.default_available_hours_per_day,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("machine_config").insert({
          name: form.name,
          department: form.department,
          default_available_hours_per_day: form.default_available_hours_per_day,
          tenant_id: '00000000-0000-0000-0000-000000000001',
        } as any);
        if (error) throw error;
      }
      toast({ title: "Saved" });
      setEditId(null);
      setAdding(false);
      onRefresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: MachineConfig) => {
    await supabase.from("machine_config").update({ active: !m.active }).eq("id", m.id);
    onRefresh();
  };

  const deptNames = departments.filter(d => d.active).map(d => d.name);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground">Machines</h3>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditId(null); setForm({ name: "", department: "CNC", default_available_hours_per_day: 8 }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={14} /> Add Machine
          </button>
        )}
      </div>

      {adding && (
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelClass}>Name</label><input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="CNC Router 1" /></div>
            <div><label className={labelClass}>Department</label>
              <select className={inputClass} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Hours/Day</label><input type="number" min={0} max={24} step={0.5} className={inputClass} value={form.default_available_hours_per_day} onChange={e => setForm(f => ({ ...f, default_available_hours_per_day: parseFloat(e.target.value) || 0 }))} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !form.name} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Check size={14} /> Save</button>
            <button onClick={() => setAdding(false)} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Machine</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Department</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Hours/Day</th>
            <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground uppercase">Status</th>
            <th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {data.map(m => (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                {editId === m.id ? (
                  <>
                    <td className="px-4 py-2 font-medium text-foreground">{m.name}</td>
                    <td className="px-4 py-2">
                      <select className={cn(inputClass, "w-28")} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                        {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2"><input type="number" min={0} max={24} step={0.5} className={cn(inputClass, "w-20")} value={form.default_available_hours_per_day} onChange={e => setForm(f => ({ ...f, default_available_hours_per_day: parseFloat(e.target.value) || 0 }))} /></td>
                    <td />
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button onClick={handleSave} disabled={saving} className="p-1 text-primary hover:text-primary/80"><Check size={14} /></button>
                        <button onClick={() => setEditId(null)} className="p-1 text-muted-foreground hover:text-foreground"><X size={14} /></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 font-medium text-foreground">{m.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{m.department}</td>
                    <td className="px-4 py-2 text-muted-foreground">{m.default_available_hours_per_day}h</td>
                    <td className="px-4 py-2">
                      <button onClick={() => toggleActive(m)} className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono cursor-pointer", m.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{m.active ? "Active" : "Inactive"}</button>
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => { setEditId(m.id); setForm({ name: m.name, department: m.department, default_available_hours_per_day: m.default_available_hours_per_day }); }} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No machines configured</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Feature Flags Tab ───────────────────────────────
function FlagsTab({ data, onRefresh }: { data: FeatureFlag[]; onRefresh: () => void }) {
  const toggleFlag = async (f: FeatureFlag) => {
    const { error } = await supabase.from("tenant_feature_flags").update({ enabled: !f.enabled }).eq("id", f.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-mono text-sm font-bold text-foreground">Feature Flags</h3>
      <p className="text-xs text-muted-foreground">Toggle features for this tenant. Changes take effect immediately.</p>
      <div className="glass-panel rounded-lg divide-y divide-border">
        {data.map(f => (
          <div key={f.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{FLAG_LABELS[f.flag_name] || f.flag_name}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{f.flag_name}</p>
            </div>
            <button
              onClick={() => toggleFlag(f)}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                f.enabled ? "bg-primary" : "bg-muted"
              )}
            >
              <span className={cn(
                "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform",
                f.enabled && "translate-x-5"
              )} />
            </button>
          </div>
        ))}
        {data.length === 0 && <div className="px-4 py-8 text-center text-muted-foreground">No feature flags configured</div>}
      </div>
    </div>
  );
}
