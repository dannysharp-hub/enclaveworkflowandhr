import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff, Pencil, Shield, CreditCard, GraduationCap, Star, Calendar, Save, X, Palmtree, Plus, Check, XCircle, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface ProfileData {
  user_id: string;
  full_name: string;
  email: string;
  department: string;
  employment_type: string;
  contracted_hours_per_week: number;
  holiday_allowance_days: number;
  holiday_balance_days: number;
  active: boolean;
  start_date: string;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  bank_name: string | null;
  ni_number: string | null;
  passport_number: string | null;
  role: string;
}

interface Review {
  id: string;
  title: string;
  review_type: string;
  due_date: string;
  status: string;
  outcome: string | null;
}

interface StaffSkill {
  id: string;
  level: string;
  certification_expiry_date: string | null;
  skill: { name: string; category: string };
}

interface TrainingRecord {
  id: string;
  title: string;
  training_type: string;
  completed_date: string;
  expiry_date: string | null;
}

interface HolidayRequest {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  reason: string | null;
  status: string;
  created_at: string;
}

const HOLIDAY_TYPES = ["Holiday", "Sick", "Unpaid", "Appointment"] as const;

const holidayStatusColor = (status: string) => {
  switch (status) {
    case "Approved": return "bg-success/15 text-success";
    case "Rejected": return "bg-destructive/15 text-destructive";
    case "Cancelled": return "bg-muted text-muted-foreground";
    default: return "bg-warning/15 text-warning";
  }
};

const mask = (val: string | null) => {
  if (!val) return "—";
  if (val.length <= 4) return "••••";
  return "••••" + val.slice(-4);
};

const levelColor = (level: string) => {
  switch (level) {
    case "Expert": return "bg-primary/15 text-primary";
    case "Competent": return "bg-success/15 text-success";
    default: return "bg-warning/15 text-warning";
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "Overdue": return "text-destructive";
    case "Completed": return "text-success";
    case "In Progress": return "text-info";
    default: return "text-muted-foreground";
  }
};

export default function StaffProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const isSelf = user?.id === userId;
  const canView = isAdmin || isSelf;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [skills, setSkills] = useState<StaffSkill[]>([]);
  const [training, setTraining] = useState<TrainingRecord[]>([]);
  const [holidays, setHolidays] = useState<HolidayRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Holiday request form
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ start_date: "", end_date: "", type: "Holiday", reason: "" });
  const [submittingHoliday, setSubmittingHoliday] = useState(false);

  // Sensitive field reveal state
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setRevealed(r => ({ ...r, [key]: !r[key] }));

  // Edit state for sensitive fields (admin only)
  const [editing, setEditing] = useState(false);
  const [piiForm, setPiiForm] = useState({
    bank_sort_code: "",
    bank_account_number: "",
    bank_account_name: "",
    bank_name: "",
    ni_number: "",
    passport_number: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchAll();
  }, [userId]);

  const fetchAll = async () => {
    setLoading(true);
    const [profileRes, rolesRes, reviewsRes, skillsRes, trainingRes, holidaysRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId!).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId!).single(),
      supabase.from("reviews").select("id, title, review_type, due_date, status, outcome").eq("staff_id", userId!).order("due_date", { ascending: false }),
      supabase.from("staff_skills").select("id, level, certification_expiry_date, skill:skills(name, category)").eq("staff_id", userId!),
      supabase.from("training_records").select("id, title, training_type, completed_date, expiry_date").eq("staff_id", userId!).order("completed_date", { ascending: false }),
      supabase.from("holiday_requests").select("id, start_date, end_date, type, reason, status, created_at").eq("staff_id", userId!).order("start_date", { ascending: false }),
    ]);

    if (profileRes.data) {
      const p = profileRes.data as any;
      setProfile({
        ...p,
        role: rolesRes.data?.role ?? "viewer",
      });
      setPiiForm({
        bank_sort_code: p.bank_sort_code ?? "",
        bank_account_number: p.bank_account_number ?? "",
        bank_account_name: p.bank_account_name ?? "",
        bank_name: p.bank_name ?? "",
        ni_number: p.ni_number ?? "",
        passport_number: p.passport_number ?? "",
      });
    }
    setReviews((reviewsRes.data as any) ?? []);
    setSkills((skillsRes.data as any) ?? []);
    setTraining((trainingRes.data as any) ?? []);
    setHolidays((holidaysRes.data as any) ?? []);
    setLoading(false);
  };

  const handleSubmitHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSubmittingHoliday(true);
    try {
      const { error } = await supabase.from("holiday_requests").insert({
        staff_id: userId,
        start_date: holidayForm.start_date,
        end_date: holidayForm.end_date,
        type: holidayForm.type,
        reason: holidayForm.reason || null,
      });
      if (error) throw error;
      toast({ title: "Submitted", description: "Holiday request submitted for approval" });
      setHolidayForm({ start_date: "", end_date: "", type: "Holiday", reason: "" });
      setShowHolidayForm(false);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingHoliday(false);
    }
  };

  const handleSavePii = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await supabase.functions.invoke("manage-staff?action=update-profile", {
        body: { user_id: profile.user_id, ...piiForm },
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "Saved", description: "Sensitive details updated" });
      setEditing(false);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleHolidayDecision = async (requestId: string, status: "Approved" | "Rejected") => {
    try {
      const { error } = await supabase
        .from("holiday_requests")
        .update({ status, approver_staff_id: user?.id ?? null })
        .eq("id", requestId);
      if (error) throw error;
      toast({ title: status, description: `Holiday request ${status.toLowerCase()}` });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Password reset
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPw, setResettingPw] = useState(false);

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (!profile) return;
    setResettingPw(true);
    try {
      const res = await supabase.functions.invoke("manage-staff?action=reset-password", {
        body: { user_id: profile.user_id, password: newPassword },
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: "Password Reset", description: `Password updated for ${profile.full_name}` });
      setNewPassword("");
      setShowResetPw(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setResettingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="h-8 bg-secondary rounded w-48 animate-pulse" />
        <div className="h-40 bg-secondary rounded animate-pulse" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4 animate-slide-in">
        <button onClick={() => navigate("/staff")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} /> Back to Staff
        </button>
        <p className="text-muted-foreground">Profile not found.</p>
      </div>
    );
  }

  const initials = profile.full_name.split(" ").map(n => n[0]).join("");
  const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

  const SensitiveField = ({ label, value, fieldKey }: { label: string; value: string | null; fieldKey: string }) => (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground font-mono">
          {canView ? (revealed[fieldKey] ? (value || "—") : mask(value)) : "••••••••"}
        </span>
        {canView && value && (
          <button onClick={() => toggle(fieldKey)} className="text-muted-foreground hover:text-foreground transition-colors">
            {revealed[fieldKey] ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-slide-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/staff")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} /> Staff
        </button>
      </div>

      {/* Profile Card */}
      <div className="glass-panel rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <span className="text-lg font-mono font-bold text-secondary-foreground">{initials}</span>
            </div>
            <div>
              <h2 className="text-xl font-mono font-bold text-foreground">{profile.full_name}</h2>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium bg-primary/15 text-primary">
                  {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                </span>
                <span className="text-xs text-muted-foreground">{profile.department}</span>
                <span className={cn("w-2 h-2 rounded-full", profile.active ? "bg-success" : "bg-muted-foreground")} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-border">
          <div>
            <span className={labelClass}>Employment</span>
            <span className="text-sm text-foreground">{profile.employment_type}</span>
          </div>
          <div>
            <span className={labelClass}>Hours/Week</span>
            <span className="text-sm text-foreground">{profile.contracted_hours_per_week}</span>
          </div>
          <div>
            <span className={labelClass}>Start Date</span>
            <span className="text-sm text-foreground">{profile.start_date ? format(new Date(profile.start_date), "dd MMM yyyy") : "—"}</span>
          </div>
          <div>
            <span className={labelClass}>Holiday Balance</span>
            <span className="text-sm text-foreground font-mono">{profile.holiday_balance_days} / {profile.holiday_allowance_days} days</span>
          </div>
        </div>

        {/* Admin: Password Reset */}
        {isAdmin && (
          <div className="mt-4 pt-4 border-t border-border">
            {!showResetPw ? (
              <button onClick={() => setShowResetPw(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <KeyRound size={12} /> Reset Password
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  minLength={6}
                  maxLength={72}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  className={inputClass + " max-w-xs"}
                />
                <button onClick={handleResetPassword} disabled={resettingPw} className="h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {resettingPw ? "Resetting..." : "Confirm"}
                </button>
                <button onClick={() => { setShowResetPw(false); setNewPassword(""); }} className="h-9 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sensitive Details */}
      {canView && (
        <div className="glass-panel rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-primary" />
              <h3 className="text-sm font-mono font-bold text-foreground">Sensitive Details</h3>
            </div>
            {isAdmin && !editing && (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Pencil size={12} /> Edit
              </button>
            )}
            {isAdmin && editing && (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <X size={12} /> Cancel
                </button>
                <button onClick={handleSavePii} disabled={saving} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50">
                  <Save size={12} /> {saving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>

          {!editing ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <SensitiveField label="NI Number" value={profile.ni_number} fieldKey="ni" />
              <SensitiveField label="Passport Number" value={profile.passport_number} fieldKey="passport" />
              <div className="col-span-2 sm:col-span-3 border-t border-border pt-3 mt-1">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard size={14} className="text-muted-foreground" />
                  <span className="text-xs font-mono font-medium text-muted-foreground">BANK DETAILS</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <SensitiveField label="Sort Code" value={profile.bank_sort_code} fieldKey="sort" />
                  <SensitiveField label="Account Number" value={profile.bank_account_number} fieldKey="acct" />
                  <SensitiveField label="Account Name" value={profile.bank_account_name} fieldKey="name" />
                  <SensitiveField label="Bank Name" value={profile.bank_name} fieldKey="bank" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>NI Number</label>
                  <input type="text" maxLength={13} value={piiForm.ni_number} onChange={e => setPiiForm(f => ({ ...f, ni_number: e.target.value }))} className={inputClass} placeholder="AB 12 34 56 C" />
                </div>
                <div>
                  <label className={labelClass}>Passport Number</label>
                  <input type="text" maxLength={20} value={piiForm.passport_number} onChange={e => setPiiForm(f => ({ ...f, passport_number: e.target.value }))} className={inputClass} placeholder="123456789" />
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard size={14} className="text-muted-foreground" />
                  <span className="text-xs font-mono font-medium text-muted-foreground">BANK DETAILS</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Sort Code</label>
                    <input type="text" maxLength={8} value={piiForm.bank_sort_code} onChange={e => setPiiForm(f => ({ ...f, bank_sort_code: e.target.value }))} className={inputClass} placeholder="12-34-56" />
                  </div>
                  <div>
                    <label className={labelClass}>Account Number</label>
                    <input type="text" maxLength={8} value={piiForm.bank_account_number} onChange={e => setPiiForm(f => ({ ...f, bank_account_number: e.target.value }))} className={inputClass} placeholder="12345678" />
                  </div>
                  <div>
                    <label className={labelClass}>Account Name</label>
                    <input type="text" maxLength={100} value={piiForm.bank_account_name} onChange={e => setPiiForm(f => ({ ...f, bank_account_name: e.target.value }))} className={inputClass} placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label className={labelClass}>Bank Name</label>
                    <input type="text" maxLength={100} value={piiForm.bank_name} onChange={e => setPiiForm(f => ({ ...f, bank_name: e.target.value }))} className={inputClass} placeholder="Barclays" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reviews */}
      <div className="glass-panel rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} className="text-primary" />
          <h3 className="text-sm font-mono font-bold text-foreground">Reviews</h3>
          <span className="text-xs text-muted-foreground ml-auto">{reviews.length} total</span>
        </div>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews scheduled.</p>
        ) : (
          <div className="space-y-2">
            {reviews.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm text-foreground">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.review_type} · Due: {format(new Date(r.due_date), "dd MMM yyyy")}</p>
                </div>
                <span className={cn("text-xs font-mono font-medium", statusColor(r.status))}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="glass-panel rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star size={16} className="text-primary" />
          <h3 className="text-sm font-mono font-bold text-foreground">Skills</h3>
          <span className="text-xs text-muted-foreground ml-auto">{skills.length} assigned</span>
        </div>
        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills assigned yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {skills.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div>
                  <p className="text-sm text-foreground">{s.skill?.name ?? "Unknown"}</p>
                  <p className="text-[10px] text-muted-foreground">{s.skill?.category ?? ""}</p>
                </div>
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-mono font-medium", levelColor(s.level))}>
                  {s.level}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Training Records */}
      <div className="glass-panel rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap size={16} className="text-primary" />
          <h3 className="text-sm font-mono font-bold text-foreground">Training Records</h3>
          <span className="text-xs text-muted-foreground ml-auto">{training.length} records</span>
        </div>
        {training.length === 0 ? (
          <p className="text-sm text-muted-foreground">No training records.</p>
        ) : (
          <div className="space-y-2">
            {training.map(t => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm text-foreground">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.training_type} · Completed: {format(new Date(t.completed_date), "dd MMM yyyy")}</p>
                </div>
                {t.expiry_date && (
                  <span className={cn("text-xs font-mono", new Date(t.expiry_date) < new Date() ? "text-destructive" : "text-muted-foreground")}>
                    Expires {format(new Date(t.expiry_date), "dd MMM yyyy")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Holiday Requests */}
      <div className="glass-panel rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Palmtree size={16} className="text-primary" />
            <h3 className="text-sm font-mono font-bold text-foreground">Holiday Requests</h3>
            <span className="text-xs text-muted-foreground">{holidays.length} requests</span>
          </div>
          {isSelf && !showHolidayForm && (
            <button onClick={() => setShowHolidayForm(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
              <Plus size={12} /> New Request
            </button>
          )}
        </div>

        {showHolidayForm && (
          <form onSubmit={handleSubmitHoliday} className="mb-4 p-4 rounded-md border border-border bg-card/50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start Date</label>
                <input type="date" required value={holidayForm.start_date} onChange={e => setHolidayForm(f => ({ ...f, start_date: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>End Date</label>
                <input type="date" required value={holidayForm.end_date} onChange={e => setHolidayForm(f => ({ ...f, end_date: e.target.value }))} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Type</label>
                <select value={holidayForm.type} onChange={e => setHolidayForm(f => ({ ...f, type: e.target.value }))} className={inputClass + " appearance-none"}>
                  {HOLIDAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Reason (optional)</label>
                <input type="text" maxLength={200} value={holidayForm.reason} onChange={e => setHolidayForm(f => ({ ...f, reason: e.target.value }))} className={inputClass} placeholder="e.g. Family holiday" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={submittingHoliday} className="h-8 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                {submittingHoliday ? "Submitting..." : "Submit Request"}
              </button>
              <button type="button" onClick={() => setShowHolidayForm(false)} className="h-8 rounded-md border border-border px-4 text-xs text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

        {holidays.length === 0 && !showHolidayForm ? (
          <p className="text-sm text-muted-foreground">No holiday requests.</p>
        ) : (
          <div className="space-y-2">
            {holidays.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm text-foreground">
                    {format(new Date(h.start_date), "dd MMM")} – {format(new Date(h.end_date), "dd MMM yyyy")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.type}{h.reason ? ` · ${h.reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && h.status === "Pending" && (
                    <>
                      <button
                        onClick={() => handleHolidayDecision(h.id, "Approved")}
                        className="flex items-center gap-1 h-6 rounded px-2 text-[10px] font-medium bg-success/15 text-success hover:bg-success/25 transition-colors"
                      >
                        <Check size={10} /> Approve
                      </button>
                      <button
                        onClick={() => handleHolidayDecision(h.id, "Rejected")}
                        className="flex items-center gap-1 h-6 rounded px-2 text-[10px] font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
                      >
                        <XCircle size={10} /> Reject
                      </button>
                    </>
                  )}
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-mono font-medium", holidayStatusColor(h.status))}>
                    {h.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
