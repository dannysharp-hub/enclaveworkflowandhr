import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const ROLES = ["admin", "engineer", "supervisor", "operator", "office", "viewer"] as const;
const DEPARTMENTS = ["CNC", "Assembly", "Spray", "Install", "Office"] as const;

interface StaffProfile {
  user_id: string;
  full_name: string;
  email: string;
  department: string;
  employment_type: string;
  contracted_hours_per_week: number;
  holiday_allowance_days: number;
  holiday_balance_days: number;
  active: boolean;
  role: string;
  pay_type?: string;
  hourly_rate?: number | null;
  annual_salary?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffProfile | null;
  onSuccess: () => void;
}

export default function EditStaffDialog({ open, onOpenChange, staff, onSuccess }: Props) {
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: staff?.full_name ?? "",
    department: staff?.department ?? "Office",
    employment_type: staff?.employment_type ?? "Full-time",
    contracted_hours_per_week: staff?.contracted_hours_per_week ?? 40,
    holiday_allowance_days: staff?.holiday_allowance_days ?? 25,
    active: staff?.active ?? true,
    role: staff?.role ?? "viewer",
    pay_type: staff?.pay_type ?? "hourly",
    hourly_rate: staff?.hourly_rate ?? null,
    annual_salary: staff?.annual_salary ?? null,
  });

  // Sync form when staff changes
  useState(() => {
    if (staff) {
      setForm({
        full_name: staff.full_name,
        department: staff.department,
        employment_type: staff.employment_type,
        contracted_hours_per_week: staff.contracted_hours_per_week,
        holiday_allowance_days: staff.holiday_allowance_days,
        active: staff.active,
        role: staff.role,
        pay_type: staff.pay_type ?? "hourly",
        hourly_rate: staff.hourly_rate ?? null,
        annual_salary: staff.annual_salary ?? null,
      });
    }
  });

  if (!staff) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Update profile
      const profileRes = await supabase.functions.invoke("manage-staff?action=update-profile", {
        body: {
          user_id: staff.user_id,
          full_name: form.full_name,
          department: form.department,
          employment_type: form.employment_type,
          contracted_hours_per_week: form.contracted_hours_per_week,
          holiday_allowance_days: form.holiday_allowance_days,
          active: form.active,
          pay_type: form.pay_type,
          hourly_rate: form.pay_type === "hourly" ? form.hourly_rate : null,
          annual_salary: form.pay_type === "salaried" ? form.annual_salary : null,
        },
      });

      if (profileRes.data?.error) throw new Error(profileRes.data.error);

      // Update role if changed
      if (form.role !== staff.role) {
        const roleRes = await supabase.functions.invoke("manage-staff?action=update-role", {
          body: { user_id: staff.user_id, role: form.role },
        });
        if (roleRes.data?.error) throw new Error(roleRes.data.error);
      }

      toast({ title: "Updated", description: `${form.full_name} has been updated` });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-xs font-mono font-medium text-muted-foreground mb-1.5";
  const selectClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-foreground">Edit Staff Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>FULL NAME</label>
            <input
              type="text"
              required
              maxLength={100}
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>ROLE {!isSuperAdmin && <span className="text-muted-foreground/60">(locked)</span>}</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className={selectClass}
                disabled={!isSuperAdmin}
                title={!isSuperAdmin ? "Only the super admin can change roles" : undefined}
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>DEPARTMENT</label>
              <select
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                className={selectClass}
              >
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>EMPLOYMENT</label>
              <select
                value={form.employment_type}
                onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}
                className={selectClass}
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>HOURS/WEEK</label>
              <input
                type="number"
                min={0}
                max={60}
                step={0.5}
                value={form.contracted_hours_per_week}
                onChange={e => setForm(f => ({ ...f, contracted_hours_per_week: parseFloat(e.target.value) || 0 }))}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>HOLIDAY ALLOWANCE</label>
              <input
                type="number"
                min={0}
                max={50}
                value={form.holiday_allowance_days}
                onChange={e => setForm(f => ({ ...f, holiday_allowance_days: parseInt(e.target.value) || 0 }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>STATUS</label>
              <select
                value={form.active ? "active" : "inactive"}
                onChange={e => setForm(f => ({ ...f, active: e.target.value === "active" }))}
                className={selectClass}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          {/* Pay Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>PAY TYPE</label>
              <select
                value={form.pay_type}
                onChange={e => setForm(f => ({ ...f, pay_type: e.target.value }))}
                className={selectClass}
              >
                <option value="hourly">Hourly</option>
                <option value="salaried">Salaried</option>
              </select>
            </div>
            <div>
              {form.pay_type === "hourly" ? (
                <>
                  <label className={labelClass}>HOURLY RATE (£)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.hourly_rate ?? ""}
                    onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value ? parseFloat(e.target.value) : null }))}
                    className={inputClass}
                    placeholder="12.50"
                  />
                </>
              ) : (
                <>
                  <label className={labelClass}>ANNUAL SALARY (£)</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={form.annual_salary ?? ""}
                    onChange={e => setForm(f => ({ ...f, annual_salary: e.target.value ? parseFloat(e.target.value) : null }))}
                    className={inputClass}
                    placeholder="28000"
                  />
                </>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
