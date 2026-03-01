import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ClipboardCheck, Plus, Calendar, AlertTriangle, CheckCircle2, Clock, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const REVIEW_TYPES = ["Probation", "Annual", "Mid-Year", "Performance Improvement", "Return to Work", "Ad Hoc"] as const;
const STATUSES = ["Scheduled", "In Progress", "Completed", "Overdue", "Cancelled"] as const;
const OUTCOMES = ["Pass", "Fail", "Extended", "N/A"] as const;

interface Review {
  id: string;
  staff_id: string;
  review_type: string;
  title: string;
  due_date: string;
  completed_date: string | null;
  status: string;
  reviewer_id: string | null;
  outcome: string | null;
  notes: string | null;
  staff_name?: string;
  reviewer_name?: string;
}

export default function ReviewsPage() {
  const { userRole } = useAuth();
  const canManage = userRole === "admin" || userRole === "supervisor" || userRole === "engineer";

  const [reviews, setReviews] = useState<Review[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Review | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const [form, setForm] = useState({
    staff_id: "",
    review_type: "Probation",
    title: "",
    due_date: "",
    completed_date: "",
    status: "Scheduled",
    reviewer_id: "",
    outcome: "",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    const [revRes, profRes] = await Promise.all([
      supabase.from("reviews").select("*").order("due_date", { ascending: true }),
      supabase.from("profiles").select("user_id, full_name").eq("active", true),
    ]);
    const profMap = new Map((profRes.data ?? []).map(p => [p.user_id, p.full_name]));
    setProfiles(profRes.data ?? []);

    const today = new Date().toISOString().split("T")[0];
    setReviews(
      (revRes.data ?? []).map(r => {
        // Auto-mark overdue
        let status = r.status;
        if (status === "Scheduled" && r.due_date < today) status = "Overdue";
        return {
          ...r,
          status,
          staff_name: profMap.get(r.staff_id) || "Unknown",
          reviewer_name: r.reviewer_id ? profMap.get(r.reviewer_id) || "Unknown" : null,
        };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAdd = () => {
    setEditRecord(null);
    setForm({ staff_id: "", review_type: "Probation", title: "", due_date: "", completed_date: "", status: "Scheduled", reviewer_id: "", outcome: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (r: Review) => {
    setEditRecord(r);
    setForm({
      staff_id: r.staff_id,
      review_type: r.review_type,
      title: r.title,
      due_date: r.due_date,
      completed_date: r.completed_date || "",
      status: r.status,
      reviewer_id: r.reviewer_id || "",
      outcome: r.outcome || "",
      notes: r.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      staff_id: form.staff_id,
      review_type: form.review_type,
      title: form.title,
      due_date: form.due_date,
      completed_date: form.completed_date || null,
      status: form.status,
      reviewer_id: form.reviewer_id || null,
      outcome: form.outcome || null,
      notes: form.notes || null,
    };

    if (editRecord) {
      const { error } = await supabase.from("reviews").update(payload).eq("id", editRecord.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Review updated" });
    } else {
      const { error } = await supabase.from("reviews").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Review scheduled" });
    }
    setDialogOpen(false);
    fetchData();
  };

  const filtered = filter === "all" ? reviews : reviews.filter(r => r.status === filter);
  const overdue = reviews.filter(r => r.status === "Overdue").length;
  const upcoming = reviews.filter(r => {
    if (r.status !== "Scheduled") return false;
    const d = Math.ceil((new Date(r.due_date).getTime() - Date.now()) / 86400000);
    return d >= 0 && d <= 14;
  }).length;

  const statusIcon = (status: string) => {
    switch (status) {
      case "Overdue": return <AlertTriangle size={14} className="text-destructive" />;
      case "Completed": return <CheckCircle2 size={14} className="text-success" />;
      case "In Progress": return <Clock size={14} className="text-primary" />;
      case "Cancelled": return <Clock size={14} className="text-muted-foreground" />;
      default: return <Calendar size={14} className="text-warning" />;
    }
  };

  const statusBadge = (status: string) => {
    const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-medium";
    switch (status) {
      case "Overdue": return `${base} bg-destructive/15 text-destructive`;
      case "Completed": return `${base} bg-success/15 text-success`;
      case "In Progress": return `${base} bg-primary/15 text-primary`;
      case "Cancelled": return `${base} bg-muted text-muted-foreground`;
      default: return `${base} bg-warning/15 text-warning`;
    }
  };

  const labelClass = "block text-xs font-mono font-medium text-muted-foreground mb-1.5";
  const inputClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const selectClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none";

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">Reviews & Probation</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="glass-panel rounded-lg p-4 h-20 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Reviews & Probation</h2>
          <p className="text-sm text-muted-foreground">
            {reviews.length} review{reviews.length !== 1 ? "s" : ""} tracked
            {overdue > 0 && <span className="text-destructive font-medium"> · {overdue} overdue</span>}
            {upcoming > 0 && <span className="text-warning font-medium"> · {upcoming} due within 14 days</span>}
          </p>
        </div>
        {canManage && (
          <button onClick={openAdd} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={14} /> Schedule Review
          </button>
        )}
      </div>

      {/* Overdue alert banner */}
      {overdue > 0 && (
        <div className="rounded-lg px-4 py-3 flex items-center gap-3 bg-destructive/10 border border-destructive/20">
          <AlertTriangle size={16} className="text-destructive" />
          <span className="text-sm text-foreground">
            <span className="font-medium text-destructive">{overdue} overdue review{overdue !== 1 ? "s" : ""}</span> require immediate attention
          </span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {["all", ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all",
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {s === "all" ? "All" : s}
            <span className="ml-1.5 text-[10px] opacity-70">
              {s === "all" ? reviews.length : reviews.filter(r => r.status === s).length}
            </span>
          </button>
        ))}
      </div>

      {/* Reviews list */}
      <div className="glass-panel rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardCheck size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No reviews found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(r => {
              const daysUntil = Math.ceil((new Date(r.due_date).getTime() - Date.now()) / 86400000);
              return (
                <div key={r.id} className="p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    {statusIcon(r.status)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{r.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">{r.staff_name}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{r.review_type}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className={cn(
                          "text-xs font-mono",
                          r.status === "Overdue" ? "text-destructive font-medium" :
                          daysUntil <= 7 && r.status === "Scheduled" ? "text-warning" : "text-muted-foreground"
                        )}>
                          Due: {r.due_date}
                          {r.status === "Scheduled" && daysUntil >= 0 && ` (${daysUntil}d)`}
                          {r.status === "Overdue" && ` (${Math.abs(daysUntil)}d overdue)`}
                        </span>
                      </div>
                      {r.outcome && (
                        <span className={cn(
                          "inline-flex mt-1 text-[10px] font-mono px-2 py-0.5 rounded-full",
                          r.outcome === "Pass" ? "bg-success/15 text-success" :
                          r.outcome === "Fail" ? "bg-destructive/15 text-destructive" :
                          r.outcome === "Extended" ? "bg-warning/15 text-warning" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {r.outcome}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className={statusBadge(r.status)}>{r.status}</span>
                    {canManage && (
                      <button onClick={() => openEdit(r)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-panel border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground">{editRecord ? "Edit Review" : "Schedule Review"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>STAFF MEMBER</label>
                <select required value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))} className={selectClass}>
                  <option value="">Select...</option>
                  {profiles.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>REVIEW TYPE</label>
                <select value={form.review_type} onChange={e => setForm(f => ({ ...f, review_type: e.target.value }))} className={selectClass}>
                  {REVIEW_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>TITLE</label>
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="e.g. 3-Month Probation Review" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>DUE DATE</label>
                <input type="date" required value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>REVIEWER</label>
                <select value={form.reviewer_id} onChange={e => setForm(f => ({ ...f, reviewer_id: e.target.value }))} className={selectClass}>
                  <option value="">Select...</option>
                  {profiles.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
                </select>
              </div>
            </div>
            {editRecord && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>STATUS</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={selectClass}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>COMPLETED DATE</label>
                  <input type="date" value={form.completed_date} onChange={e => setForm(f => ({ ...f, completed_date: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>OUTCOME</label>
                  <select value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} className={selectClass}>
                    <option value="">—</option>
                    {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div>
              <label className={labelClass}>NOTES</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]" placeholder="Optional notes..." />
            </div>
            <button type="submit" className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              {editRecord ? "Update Review" : "Schedule Review"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
