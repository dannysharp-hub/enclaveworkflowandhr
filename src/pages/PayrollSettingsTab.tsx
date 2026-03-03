import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";
const selectClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none";

interface Settings {
  enable_staff_pay_estimate: boolean;
  pay_currency: string;
  pay_frequency: string;
  include_overtime_in_estimate: boolean;
  overtime_multiplier: number;
  overtime_threshold_hours: number;
  rounding_rule: string;
  enable_productivity_kpis: boolean;
  holiday_model: string;
  enable_break_tracking: boolean;
}

const DEFAULTS: Settings = {
  enable_staff_pay_estimate: false,
  pay_currency: "GBP",
  pay_frequency: "monthly",
  include_overtime_in_estimate: false,
  overtime_multiplier: 1.5,
  overtime_threshold_hours: 8,
  rounding_rule: "none",
  enable_productivity_kpis: true,
  holiday_model: "accrual",
  enable_break_tracking: false,
};

export default function PayrollSettingsTab() {
  const [form, setForm] = useState<Settings>(DEFAULTS);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("payroll_settings").select("*").limit(1).maybeSingle();
      if (data) {
        setExistingId(data.id);
        setForm({
          enable_staff_pay_estimate: data.enable_staff_pay_estimate,
          pay_currency: data.pay_currency,
          pay_frequency: data.pay_frequency,
          include_overtime_in_estimate: data.include_overtime_in_estimate,
          overtime_multiplier: Number(data.overtime_multiplier),
          overtime_threshold_hours: Number((data as any).overtime_threshold_hours ?? 8),
          rounding_rule: data.rounding_rule,
          enable_productivity_kpis: data.enable_productivity_kpis,
          holiday_model: (data as any).holiday_model ?? "accrual",
          enable_break_tracking: (data as any).enable_break_tracking ?? false,
        });
      }
      setLoaded(true);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (existingId) {
        const { error } = await supabase.from("payroll_settings").update(form as any).eq("id", existingId);
        if (error) throw error;
      } else {
        const { error, data } = await supabase.from("payroll_settings").insert(form as any).select().single();
        if (error) throw error;
        setExistingId(data.id);
      }
      toast({ title: "Payroll settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <h3 className="font-mono text-sm font-bold text-foreground">Payroll & Attendance Settings</h3>

      <div className="glass-panel rounded-lg p-6 space-y-6 max-w-lg">
        {/* Pay Estimate Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Staff Pay Estimates</p>
            <p className="text-[10px] text-muted-foreground">Allow staff to see their estimated gross pay</p>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, enable_staff_pay_estimate: !f.enable_staff_pay_estimate }))}
            className={`w-10 h-5 rounded-full transition-colors ${form.enable_staff_pay_estimate ? "bg-primary" : "bg-muted"}`}
          >
            <div className={`w-4 h-4 rounded-full bg-background shadow transition-transform ${form.enable_staff_pay_estimate ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* Productivity KPIs Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Productivity KPIs</p>
            <p className="text-[10px] text-muted-foreground">Show productivity dashboards to admin/supervisor/office</p>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, enable_productivity_kpis: !f.enable_productivity_kpis }))}
            className={`w-10 h-5 rounded-full transition-colors ${form.enable_productivity_kpis ? "bg-primary" : "bg-muted"}`}
          >
            <div className={`w-4 h-4 rounded-full bg-background shadow transition-transform ${form.enable_productivity_kpis ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        <div className="border-t border-border pt-4" />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Currency</label>
            <select className={selectClass} value={form.pay_currency} onChange={e => setForm(f => ({ ...f, pay_currency: e.target.value }))}>
              <option value="GBP">GBP (£)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Pay Frequency</label>
            <select className={selectClass} value={form.pay_frequency} onChange={e => setForm(f => ({ ...f, pay_frequency: e.target.value }))}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Overtime Multiplier</label>
            <input type="number" step="0.1" min="1" max="3" className={inputClass} value={form.overtime_multiplier} onChange={e => setForm(f => ({ ...f, overtime_multiplier: parseFloat(e.target.value) || 1.5 }))} />
          </div>
          <div>
            <label className={labelClass}>Overtime Threshold (hrs/day)</label>
            <input type="number" step="0.5" min="1" max="24" className={inputClass} value={form.overtime_threshold_hours} onChange={e => setForm(f => ({ ...f, overtime_threshold_hours: parseFloat(e.target.value) || 8 }))} />
            <p className="text-[10px] text-muted-foreground mt-1">Hours after which overtime rate applies</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Rounding Rule</label>
            <select className={selectClass} value={form.rounding_rule} onChange={e => setForm(f => ({ ...f, rounding_rule: e.target.value }))}>
              <option value="none">None</option>
              <option value="nearest_5_minutes">Nearest 5 min</option>
              <option value="nearest_15_minutes">Nearest 15 min</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Holiday Model</label>
            <select className={selectClass} value={form.holiday_model} onChange={e => setForm(f => ({ ...f, holiday_model: e.target.value }))}>
              <option value="accrual">Accrual (earned over time)</option>
              <option value="annual_allowance">Annual Allowance (fixed)</option>
              <option value="unlimited">Unlimited</option>
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">How holiday entitlement is calculated</p>
          </div>
        </div>

        {/* Include OT Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Include Overtime in Estimate</p>
            <p className="text-[10px] text-muted-foreground">Factor overtime into pay estimate calculation</p>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, include_overtime_in_estimate: !f.include_overtime_in_estimate }))}
            className={`w-10 h-5 rounded-full transition-colors ${form.include_overtime_in_estimate ? "bg-primary" : "bg-muted"}`}
          >
            <div className={`w-4 h-4 rounded-full bg-background shadow transition-transform ${form.include_overtime_in_estimate ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* Break Tracking Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Break Tracking</p>
            <p className="text-[10px] text-muted-foreground">Allow staff to log break start/end times</p>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, enable_break_tracking: !f.enable_break_tracking }))}
            className={`w-10 h-5 rounded-full transition-colors ${form.enable_break_tracking ? "bg-primary" : "bg-muted"}`}
          >
            <div className={`w-4 h-4 rounded-full bg-background shadow transition-transform ${form.enable_break_tracking ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
