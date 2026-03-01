import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import TrainingRecordDialog from "@/components/TrainingRecordDialog";
import { Plus, Search, GraduationCap, AlertTriangle, CheckCircle2, Clock, Filter, Pencil, Trash2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrainingRecord {
  id: string;
  staff_id: string;
  training_type: string;
  title: string;
  completed_date: string;
  trainer_name: string | null;
  expiry_date: string | null;
  linked_document_id: string | null;
  notes: string | null;
  created_at: string;
}

interface StaffProfile {
  user_id: string;
  full_name: string;
  department: string;
}

interface DocRef {
  id: string;
  title: string;
}

function daysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryStatus(days: number | null): "ok" | "warning" | "critical" | "expired" | "none" {
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= 90) return "warning";
  return "ok";
}

export default function TrainingPage() {
  const { userRole, user } = useAuth();
  const canManage = ["admin", "supervisor", "engineer"].includes(userRole || "");

  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [docs, setDocs] = useState<DocRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterExpiry, setFilterExpiry] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<TrainingRecord | null>(null);

  const fetchData = useCallback(async () => {
    const [recRes, staffRes, docsRes] = await Promise.all([
      supabase.from("training_records").select("*").order("completed_date", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, department").eq("active", true).order("full_name"),
      supabase.from("file_assets").select("id, title").eq("status", "active"),
    ]);
    setRecords((recRes.data as TrainingRecord[]) ?? []);
    setStaff((staffRes.data as StaffProfile[]) ?? []);
    setDocs((docsRes.data as DocRef[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const staffMap = useMemo(() => new Map(staff.map(s => [s.user_id, s])), [staff]);
  const docMap = useMemo(() => new Map(docs.map(d => [d.id, d])), [docs]);
  const departments = useMemo(() => [...new Set(staff.map(s => s.department))].sort(), [staff]);
  const trainingTypes = useMemo(() => [...new Set(records.map(r => r.training_type))].sort(), [records]);

  const filtered = useMemo(() => {
    let r = records;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(rec => {
        const s = staffMap.get(rec.staff_id);
        return rec.title.toLowerCase().includes(q) || (s && s.full_name.toLowerCase().includes(q)) || rec.training_type.toLowerCase().includes(q);
      });
    }
    if (filterType !== "all") r = r.filter(rec => rec.training_type === filterType);
    if (filterDept !== "all") r = r.filter(rec => staffMap.get(rec.staff_id)?.department === filterDept);
    if (filterExpiry !== "all") {
      r = r.filter(rec => {
        const days = daysUntilExpiry(rec.expiry_date);
        const status = expiryStatus(days);
        if (filterExpiry === "expiring") return status === "warning" || status === "critical";
        if (filterExpiry === "expired") return status === "expired";
        return true;
      });
    }
    return r;
  }, [records, search, filterType, filterDept, filterExpiry, staffMap]);

  // Stats
  const expiringCount = records.filter(r => { const d = daysUntilExpiry(r.expiry_date); return d !== null && d >= 0 && d <= 90; }).length;
  const expiredCount = records.filter(r => { const d = daysUntilExpiry(r.expiry_date); return d !== null && d < 0; }).length;

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("training_records").delete().eq("id", id);
    if (!error) fetchData();
  };

  const handleEdit = (rec: TrainingRecord) => {
    setEditRecord(rec);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditRecord(null);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="glass-panel rounded-lg p-4 h-24 animate-pulse" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Training Records</h2>
          <p className="text-sm text-muted-foreground">Formal training tracking, certifications & expiry management</p>
        </div>
        {canManage && (
          <button onClick={handleAdd} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus size={16} /> Add Record
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{records.length}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">TOTAL RECORDS</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{new Set(records.map(r => r.staff_id)).size}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">STAFF TRAINED</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className={cn("text-2xl font-mono font-bold", expiringCount > 0 ? "text-warning" : "text-foreground")}>{expiringCount}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">EXPIRING (90 DAYS)</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className={cn("text-2xl font-mono font-bold", expiredCount > 0 ? "text-destructive" : "text-foreground")}>{expiredCount}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">EXPIRED</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-9 rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none">
          <option value="all">All Types</option>
          {trainingTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none">
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterExpiry} onChange={e => setFilterExpiry(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none">
          <option value="all">All Status</option>
          <option value="expiring">Expiring Soon</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {/* Expiry warnings banner */}
      {(expiringCount > 0 || expiredCount > 0) && (
        <div className={cn(
          "rounded-lg px-4 py-3 flex items-center gap-3",
          expiredCount > 0 ? "bg-destructive/10 border border-destructive/20" : "bg-warning/10 border border-warning/20"
        )}>
          <AlertTriangle size={16} className={expiredCount > 0 ? "text-destructive" : "text-warning"} />
          <span className="text-sm text-foreground">
            {expiredCount > 0 && <span className="font-medium text-destructive">{expiredCount} expired</span>}
            {expiredCount > 0 && expiringCount > 0 && " · "}
            {expiringCount > 0 && <span className="font-medium text-warning">{expiringCount} expiring within 90 days</span>}
          </span>
        </div>
      )}

      {/* Records table */}
      <div className="glass-panel rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <GraduationCap size={40} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm">{search || filterType !== "all" || filterDept !== "all" ? "No matching records" : "No training records yet"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">STAFF</th>
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">TYPE</th>
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">TITLE</th>
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">COMPLETED</th>
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">TRAINER</th>
                  <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground">EXPIRY</th>
                  <th className="text-center px-3 py-2.5 font-mono text-[10px] text-muted-foreground">DOC</th>
                  <th className="text-center px-3 py-2.5 font-mono text-[10px] text-muted-foreground">STATUS</th>
                  {canManage && <th className="px-3 py-2.5"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(rec => {
                  const s = staffMap.get(rec.staff_id);
                  const days = daysUntilExpiry(rec.expiry_date);
                  const status = expiryStatus(days);
                  const linkedDoc = rec.linked_document_id ? docMap.get(rec.linked_document_id) : null;

                  return (
                    <tr key={rec.id} className={cn(
                      "border-b border-border/30 transition-colors",
                      status === "expired" ? "bg-destructive/5" : status === "critical" ? "bg-warning/5" : "hover:bg-muted/10"
                    )}>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-medium text-foreground">{s?.full_name || "Unknown"}</p>
                        <p className="text-[10px] text-muted-foreground">{s?.department || "—"}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{rec.training_type}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-foreground max-w-[200px] truncate">{rec.title}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{rec.completed_date}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{rec.trainer_name || "—"}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{rec.expiry_date || "—"}</td>
                      <td className="px-3 py-2.5 text-center">
                        {linkedDoc ? (
                          <span title={linkedDoc.title}><FileText size={14} className="inline text-primary" /></span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <ExpiryBadge status={status} days={days} />
                      </td>
                      {canManage && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleEdit(rec)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => handleDelete(rec.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TrainingRecordDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchData}
        staff={staff}
        documents={docs}
        editRecord={editRecord}
      />
    </div>
  );
}

function ExpiryBadge({ status, days }: { status: string; days: number | null }) {
  if (status === "none") return <span className="text-[10px] font-mono text-muted-foreground">N/A</span>;
  if (status === "expired") return <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-destructive"><AlertTriangle size={10} /> EXPIRED</span>;
  if (status === "critical") return <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-destructive"><Clock size={10} /> {days}d</span>;
  if (status === "warning") return <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-warning"><Clock size={10} /> {days}d</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-mono text-primary"><CheckCircle2 size={10} /> OK</span>;
}
