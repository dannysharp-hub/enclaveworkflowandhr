import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, CheckCircle2, AlertTriangle, XCircle, Filter, User, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface MandatoryDoc {
  id: string;
  title: string;
  category: string;
  version: number;
  mandatory_for_roles: string[] | null;
  mandatory_for_departments: string[] | null;
}

interface Receipt {
  file_id: string;
  staff_id: string;
  acknowledged: boolean;
  file_version_at_read: number;
}

interface StaffProfile {
  user_id: string;
  full_name: string;
  department: string;
  active: boolean;
}

interface StaffRole {
  user_id: string;
  role: string;
}

export default function CompliancePage() {
  const { user, userRole } = useAuth();
  const isAdmin = userRole === "admin" || userRole === "office" || userRole === "supervisor";

  const [docs, setDocs] = useState<MandatoryDoc[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "my">(isAdmin ? "overview" : "my");

  const fetchData = useCallback(async () => {
    const [docsRes, receiptsRes, staffRes, rolesRes] = await Promise.all([
      supabase.from("file_assets").select("id, title, category, version, mandatory_for_roles, mandatory_for_departments").eq("status", "active").eq("requires_acknowledgement", true),
      supabase.from("file_read_receipts").select("file_id, staff_id, acknowledged, file_version_at_read"),
      supabase.from("profiles").select("user_id, full_name, department, active").eq("active", true),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setDocs((docsRes.data as MandatoryDoc[]) ?? []);
    setReceipts((receiptsRes.data as Receipt[]) ?? []);
    setStaff((staffRes.data as StaffProfile[]) ?? []);
    setRoles((rolesRes.data as StaffRole[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const roleMap = useMemo(() => {
    const m = new Map<string, string>();
    roles.forEach(r => m.set(r.user_id, r.role));
    return m;
  }, [roles]);

  const departments = useMemo(() => [...new Set(staff.map(s => s.department))].sort(), [staff]);
  const allRoles = useMemo(() => [...new Set(roles.map(r => r.role))].sort(), [roles]);

  // Filter staff by selected dept/role
  const filteredStaff = useMemo(() => {
    let s = staff;
    if (filterDept !== "all") s = s.filter(p => p.department === filterDept);
    if (filterRole !== "all") s = s.filter(p => roleMap.get(p.user_id) === filterRole);
    return s;
  }, [staff, filterDept, filterRole, roleMap]);

  // For each doc, calculate who needs to acknowledge and who has
  const docStats = useMemo(() => {
    return docs.map(doc => {
      // Determine who must acknowledge this doc
      let requiredStaff = filteredStaff;
      if (doc.mandatory_for_departments && doc.mandatory_for_departments.length > 0) {
        requiredStaff = requiredStaff.filter(s => doc.mandatory_for_departments!.includes(s.department));
      }
      if (doc.mandatory_for_roles && doc.mandatory_for_roles.length > 0) {
        requiredStaff = requiredStaff.filter(s => {
          const role = roleMap.get(s.user_id);
          return role && doc.mandatory_for_roles!.includes(role);
        });
      }

      const docReceipts = receipts.filter(r => r.file_id === doc.id);
      const acknowledged = requiredStaff.filter(s => {
        const receipt = docReceipts.find(r => r.staff_id === s.user_id);
        return receipt && receipt.acknowledged && receipt.file_version_at_read >= doc.version;
      });
      const missing = requiredStaff.filter(s => {
        const receipt = docReceipts.find(r => r.staff_id === s.user_id);
        return !receipt || !receipt.acknowledged || receipt.file_version_at_read < doc.version;
      });

      const pct = requiredStaff.length > 0 ? Math.round((acknowledged.length / requiredStaff.length) * 100) : 100;

      return {
        doc,
        total: requiredStaff.length,
        ackCount: acknowledged.length,
        missingStaff: missing,
        pct,
      };
    });
  }, [docs, filteredStaff, receipts, roleMap]);

  // My compliance (for current user)
  const myCompliance = useMemo(() => {
    if (!user) return [];
    const myRole = roleMap.get(user.id);
    const myProfile = staff.find(s => s.user_id === user.id);
    return docs.map(doc => {
      // Check if this doc applies to me
      let applies = true;
      if (doc.mandatory_for_departments && doc.mandatory_for_departments.length > 0) {
        applies = applies && !!myProfile && doc.mandatory_for_departments.includes(myProfile.department);
      }
      if (doc.mandatory_for_roles && doc.mandatory_for_roles.length > 0) {
        applies = applies && !!myRole && doc.mandatory_for_roles.includes(myRole);
      }
      if (!applies) return null;

      const receipt = receipts.find(r => r.file_id === doc.id && r.staff_id === user.id);
      const isCompliant = receipt && receipt.acknowledged && receipt.file_version_at_read >= doc.version;
      return { doc, isCompliant, receipt };
    }).filter(Boolean) as { doc: MandatoryDoc; isCompliant: boolean; receipt: Receipt | undefined }[];
  }, [docs, user, receipts, staff, roleMap]);

  const myCompliancePct = myCompliance.length > 0
    ? Math.round((myCompliance.filter(c => c.isCompliant).length / myCompliance.length) * 100)
    : 100;

  const overallPct = docStats.length > 0
    ? Math.round(docStats.reduce((s, d) => s + d.pct, 0) / docStats.length)
    : 100;

  const selectedDocStats = selectedDoc ? docStats.find(d => d.doc.id === selectedDoc) : null;

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="glass-panel rounded-lg p-4 h-24 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Compliance</h2>
          <p className="text-sm text-muted-foreground">Document acknowledgement tracking & compliance scores</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("overview")}
              className={cn(
                "h-9 px-3 rounded-md text-sm font-medium transition-colors",
                viewMode === "overview" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"
              )}
            >
              Overview
            </button>
            <button
              onClick={() => setViewMode("my")}
              className={cn(
                "h-9 px-3 rounded-md text-sm font-medium transition-colors",
                viewMode === "my" ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"
              )}
            >
              My Compliance
            </button>
          </div>
        )}
      </div>

      {viewMode === "my" ? (
        /* ========== MY COMPLIANCE ========== */
        <>
          {/* Score */}
          <div className="glass-panel rounded-lg p-6 text-center">
            <div className={cn(
              "inline-flex items-center justify-center w-20 h-20 rounded-full border-4",
              myCompliancePct === 100 ? "border-primary" : myCompliancePct >= 70 ? "border-warning" : "border-destructive"
            )}>
              <span className="text-2xl font-mono font-bold text-foreground">{myCompliancePct}%</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Your Compliance Score</p>
          </div>

          {/* Document list */}
          <div className="glass-panel rounded-lg overflow-hidden">
            {myCompliance.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No mandatory documents apply to you</div>
            ) : (
              <div className="divide-y divide-border">
                {myCompliance.map(({ doc, isCompliant }) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-md flex items-center justify-center",
                        isCompliant ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                      )}>
                        {isCompliant ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{doc.title}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{doc.category} · v{doc.version}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[10px] font-mono font-bold px-2 py-1 rounded-full",
                      isCompliant ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                    )}>
                      {isCompliant ? "COMPLIANT" : "ACTION REQUIRED"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ========== ADMIN OVERVIEW ========== */
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-panel rounded-lg p-4 text-center">
              <div className={cn(
                "inline-flex items-center justify-center w-12 h-12 rounded-full border-4 mb-1",
                overallPct === 100 ? "border-primary" : overallPct >= 70 ? "border-warning" : "border-destructive"
              )}>
                <span className="text-lg font-mono font-bold text-foreground">{overallPct}%</span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground tracking-wide">OVERALL</p>
            </div>
            <div className="glass-panel rounded-lg p-4 text-center">
              <p className="text-2xl font-mono font-bold text-foreground">{docs.length}</p>
              <p className="text-[10px] font-mono text-muted-foreground tracking-wide">MANDATORY DOCS</p>
            </div>
            <div className="glass-panel rounded-lg p-4 text-center">
              <p className="text-2xl font-mono font-bold text-primary">{docStats.filter(d => d.pct === 100).length}</p>
              <p className="text-[10px] font-mono text-muted-foreground tracking-wide">FULLY COMPLIANT</p>
            </div>
            <div className="glass-panel rounded-lg p-4 text-center">
              <p className="text-2xl font-mono font-bold text-destructive">{docStats.filter(d => d.pct < 100).length}</p>
              <p className="text-[10px] font-mono text-muted-foreground tracking-wide">OUTSTANDING</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={filterDept}
              onChange={e => setFilterDept(e.target.value)}
              className="h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
            >
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
              className="h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
            >
              <option value="all">All Roles</option>
              {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Document compliance list */}
          <div className="glass-panel rounded-lg overflow-hidden">
            {docStats.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No mandatory documents configured</div>
            ) : (
              <div className="divide-y divide-border">
                {docStats.map(({ doc, total, ackCount, pct, missingStaff }) => (
                  <div key={doc.id}>
                    <button
                      onClick={() => setSelectedDoc(selectedDoc === doc.id ? null : doc.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StatusIcon pct={pct} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{doc.category} · v{doc.version}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <div className="text-right">
                          <p className="text-sm font-mono font-bold text-foreground">{ackCount}/{total}</p>
                          <p className="text-[10px] text-muted-foreground">acknowledged</p>
                        </div>
                        <ComplianceBar pct={pct} />
                      </div>
                    </button>
                    {/* Expandable missing staff */}
                    {selectedDoc === doc.id && missingStaff.length > 0 && (
                      <div className="px-4 pb-4">
                        <p className="text-[10px] font-mono text-destructive mb-2 tracking-wide">OUTSTANDING ({missingStaff.length})</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {missingStaff.map(s => (
                            <div key={s.user_id} className="flex items-center gap-2 rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2">
                              <User size={12} className="text-destructive shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{s.full_name}</p>
                                <p className="text-[10px] text-muted-foreground">{s.department} · {roleMap.get(s.user_id) || "—"}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedDoc === doc.id && missingStaff.length === 0 && (
                      <div className="px-4 pb-4">
                        <div className="flex items-center gap-2 text-primary">
                          <CheckCircle2 size={14} />
                          <span className="text-xs font-mono">All staff compliant</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatusIcon({ pct }: { pct: number }) {
  if (pct === 100) return <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center"><CheckCircle2 size={16} className="text-primary" /></div>;
  if (pct >= 50) return <div className="h-8 w-8 rounded-md bg-warning/15 flex items-center justify-center"><AlertTriangle size={16} className="text-warning" /></div>;
  return <div className="h-8 w-8 rounded-md bg-destructive/15 flex items-center justify-center"><XCircle size={16} className="text-destructive" /></div>;
}

function ComplianceBar({ pct }: { pct: number }) {
  return (
    <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct === 100 ? "bg-primary" : pct >= 50 ? "bg-warning" : "bg-destructive"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
