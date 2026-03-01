import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SkillDialog from "@/components/SkillDialog";
import StaffSkillDialog from "@/components/StaffSkillDialog";
import { Plus, Search, Zap, AlertTriangle, CheckCircle2, Clock, Pencil, Trash2, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Skill {
  id: string;
  name: string;
  category: string;
  requires_certification: boolean;
  default_expiry_period_months: number | null;
  description: string | null;
  active: boolean;
}

interface StaffSkill {
  id: string;
  staff_id: string;
  skill_id: string;
  level: string;
  certification_expiry_date: string | null;
  notes: string | null;
}

interface Profile {
  user_id: string;
  full_name: string;
  department: string;
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

const LEVEL_ORDER: Record<string, number> = { Expert: 3, Competent: 2, Trainee: 1 };

export default function SkillsMatrixPage() {
  const { userRole } = useAuth();
  const canManage = ["admin", "supervisor", "engineer"].includes(userRole || "");

  const [skills, setSkills] = useState<Skill[]>([]);
  const [staffSkills, setStaffSkills] = useState<StaffSkill[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<StaffSkill | null>(null);

  const fetchData = useCallback(async () => {
    const [skillsRes, ssRes, profRes] = await Promise.all([
      supabase.from("skills").select("*").eq("active", true).order("category").order("name"),
      supabase.from("staff_skills").select("*"),
      supabase.from("profiles").select("user_id, full_name, department").eq("active", true).order("full_name"),
    ]);
    setSkills((skillsRes.data as Skill[]) ?? []);
    setStaffSkills((ssRes.data as StaffSkill[]) ?? []);
    setProfiles((profRes.data as Profile[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const departments = useMemo(() => [...new Set(profiles.map(p => p.department))].sort(), [profiles]);
  const categories = useMemo(() => [...new Set(skills.map(s => s.category))].sort(), [skills]);
  const staffMap = useMemo(() => new Map(profiles.map(p => [p.user_id, p])), [profiles]);
  const skillMap = useMemo(() => new Map(skills.map(s => [s.id, s])), [skills]);

  // Build matrix: staff → skill → assignment
  const ssIndex = useMemo(() => {
    const m = new Map<string, Map<string, StaffSkill>>();
    staffSkills.forEach(ss => {
      if (!m.has(ss.staff_id)) m.set(ss.staff_id, new Map());
      m.get(ss.staff_id)!.set(ss.skill_id, ss);
    });
    return m;
  }, [staffSkills]);

  const filteredProfiles = useMemo(() => {
    let p = profiles;
    if (filterDept !== "all") p = p.filter(x => x.department === filterDept);
    if (search.trim()) {
      const q = search.toLowerCase();
      p = p.filter(x => x.full_name.toLowerCase().includes(q));
    }
    return p;
  }, [profiles, filterDept, search]);

  const filteredSkills = useMemo(() => {
    if (filterCategory !== "all") return skills.filter(s => s.category === filterCategory);
    return skills;
  }, [skills, filterCategory]);

  // Department coverage stats
  const deptCoverage = useMemo(() => {
    return departments.map(dept => {
      const deptStaff = profiles.filter(p => p.department === dept);
      const coverage = skills.map(skill => {
        const qualified = deptStaff.filter(p => {
          const ss = ssIndex.get(p.user_id)?.get(skill.id);
          if (!ss) return false;
          if (ss.level === "Trainee") return false;
          if (ss.certification_expiry_date) {
            const d = daysUntil(ss.certification_expiry_date);
            if (d !== null && d < 0) return false;
          }
          return true;
        }).length;
        return { skill, qualified, total: deptStaff.length, gap: qualified === 0 };
      });
      const gaps = coverage.filter(c => c.gap && c.total > 0).length;
      return { dept, coverage, gaps, staffCount: deptStaff.length };
    });
  }, [departments, profiles, skills, ssIndex]);

  // Expiry warnings
  const expiryWarnings = useMemo(() => {
    return staffSkills.filter(ss => {
      const d = daysUntil(ss.certification_expiry_date);
      return d !== null && d <= 90;
    }).map(ss => ({
      ...ss,
      days: daysUntil(ss.certification_expiry_date)!,
      staffName: staffMap.get(ss.staff_id)?.full_name || "Unknown",
      skillName: skillMap.get(ss.skill_id)?.name || "Unknown",
    })).sort((a, b) => a.days - b.days);
  }, [staffSkills, staffMap, skillMap]);

  const handleDeleteSkill = async (id: string) => {
    await supabase.from("skills").update({ active: false }).eq("id", id);
    fetchData();
  };

  const handleDeleteAssignment = async (id: string) => {
    await supabase.from("staff_skills").delete().eq("id", id);
    fetchData();
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Skills & Competency Matrix</h2>
          <p className="text-sm text-muted-foreground">Track staff skills, certifications & department coverage</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => { setEditSkill(null); setSkillDialogOpen(true); }} className="flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
              <Plus size={14} /> Add Skill
            </button>
            <button onClick={() => { setEditAssignment(null); setAssignDialogOpen(true); }} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus size={14} /> Assign Skill
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{skills.length}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">SKILLS DEFINED</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{staffSkills.length}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">ASSIGNMENTS</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className={cn("text-2xl font-mono font-bold", expiryWarnings.length > 0 ? "text-warning" : "text-foreground")}>{expiryWarnings.length}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">CERT WARNINGS</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className={cn("text-2xl font-mono font-bold", deptCoverage.some(d => d.gaps > 0) ? "text-destructive" : "text-foreground")}>{deptCoverage.reduce((s, d) => s + d.gaps, 0)}</p>
          <p className="text-[10px] font-mono text-muted-foreground tracking-wide">SKILL GAPS</p>
        </div>
      </div>

      {expiryWarnings.length > 0 && (
        <div className={cn(
          "rounded-lg px-4 py-3 flex items-start gap-3",
          expiryWarnings.some(w => w.days < 0) ? "bg-destructive/10 border border-destructive/20" : "bg-warning/10 border border-warning/20"
        )}>
          <AlertTriangle size={16} className={expiryWarnings.some(w => w.days < 0) ? "text-destructive mt-0.5" : "text-warning mt-0.5"} />
          <div className="text-sm text-foreground space-y-0.5">
            {expiryWarnings.slice(0, 5).map(w => (
              <p key={w.id}>
                <span className="font-medium">{w.staffName}</span> — {w.skillName}:
                <span className={cn("font-mono ml-1", w.days < 0 ? "text-destructive font-bold" : "text-warning font-bold")}>
                  {w.days < 0 ? "EXPIRED" : `${w.days}d remaining`}
                </span>
              </p>
            ))}
            {expiryWarnings.length > 5 && <p className="text-muted-foreground">+{expiryWarnings.length - 5} more</p>}
          </div>
        </div>
      )}

      <Tabs defaultValue="matrix" className="w-full">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="matrix">Staff Matrix</TabsTrigger>
          <TabsTrigger value="coverage">Dept Coverage</TabsTrigger>
          <TabsTrigger value="skills">Skills List</TabsTrigger>
        </TabsList>

        {/* MATRIX TAB */}
        <TabsContent value="matrix" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-9 rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none">
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none">
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="glass-panel rounded-lg overflow-hidden">
            {filteredProfiles.length === 0 || filteredSkills.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {skills.length === 0 ? "No skills defined yet. Add skills to get started." : "No matching staff"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2.5 font-mono text-[10px] text-muted-foreground sticky left-0 bg-muted/30 z-10 min-w-[140px]">STAFF</th>
                      {filteredSkills.map(skill => (
                        <th key={skill.id} className="text-center px-2 py-2.5 font-mono text-[10px] text-muted-foreground min-w-[80px]">
                          <span className="writing-mode-horizontal">{skill.name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.map(p => (
                      <tr key={p.user_id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="px-3 py-2 sticky left-0 bg-card z-10">
                          <p className="text-xs font-medium text-foreground">{p.full_name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.department}</p>
                        </td>
                        {filteredSkills.map(skill => {
                          const ss = ssIndex.get(p.user_id)?.get(skill.id);
                          return (
                            <td key={skill.id} className="px-2 py-2 text-center">
                              {ss ? (
                                <SkillCell
                                  ss={ss}
                                  canManage={canManage}
                                  onEdit={() => { setEditAssignment(ss); setAssignDialogOpen(true); }}
                                  onDelete={() => handleDeleteAssignment(ss.id)}
                                />
                              ) : (
                                <span className="text-muted-foreground/30">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary/80" /> Expert</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary/40" /> Competent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-secondary" /> Trainee</span>
            <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-warning" /> Expiring</span>
            <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-destructive" /> Expired</span>
          </div>
        </TabsContent>

        {/* COVERAGE TAB */}
        <TabsContent value="coverage" className="space-y-4">
          {deptCoverage.map(dc => (
            <div key={dc.dept} className="glass-panel rounded-lg">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="font-mono text-sm font-bold text-foreground">{dc.dept}</h3>
                <span className="text-xs text-muted-foreground font-mono">{dc.staffCount} staff · {dc.gaps} gap{dc.gaps !== 1 ? "s" : ""}</span>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {dc.coverage.filter(c => c.total > 0).map(c => (
                    <div key={c.skill.id} className={cn(
                      "rounded-md border px-3 py-2 text-center",
                      c.gap ? "border-destructive/30 bg-destructive/5" : c.qualified < 2 ? "border-warning/30 bg-warning/5" : "border-border bg-card"
                    )}>
                      <p className="text-xs font-medium text-foreground truncate">{c.skill.name}</p>
                      <p className={cn(
                        "text-lg font-mono font-bold mt-1",
                        c.gap ? "text-destructive" : c.qualified < 2 ? "text-warning" : "text-primary"
                      )}>{c.qualified}<span className="text-muted-foreground text-xs">/{c.total}</span></p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.gap ? "NO COVERAGE" : c.qualified < 2 ? "LOW COVERAGE" : "COVERED"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {deptCoverage.length === 0 && (
            <div className="glass-panel rounded-lg p-8 text-center text-muted-foreground text-sm">No departments with staff found</div>
          )}
        </TabsContent>

        {/* SKILLS LIST TAB */}
        <TabsContent value="skills" className="space-y-4">
          <div className="glass-panel rounded-lg overflow-hidden">
            {skills.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No skills defined yet</div>
            ) : (
              <div className="divide-y divide-border">
                {skills.map(skill => {
                  const assigned = staffSkills.filter(ss => ss.skill_id === skill.id).length;
                  return (
                    <div key={skill.id} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{skill.name}</p>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{skill.category}</span>
                          {skill.requires_certification && <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-warning/15 text-warning">CERT</span>}
                        </div>
                        {skill.description && <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>}
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <div className="text-right">
                          <p className="font-mono text-sm text-foreground">{assigned}</p>
                          <p className="text-[10px] text-muted-foreground">assigned</p>
                        </div>
                        {skill.default_expiry_period_months && (
                          <div className="text-right">
                            <p className="font-mono text-sm text-foreground">{skill.default_expiry_period_months}m</p>
                            <p className="text-[10px] text-muted-foreground">expiry</p>
                          </div>
                        )}
                        {canManage && (
                          <div className="flex gap-1">
                            <button onClick={() => { setEditSkill(skill); setSkillDialogOpen(true); }} className="text-muted-foreground hover:text-foreground transition-colors p-1"><Pencil size={12} /></button>
                            <button onClick={() => handleDeleteSkill(skill.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1"><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <SkillDialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen} onSuccess={fetchData} editSkill={editSkill} />
      <StaffSkillDialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen} onSuccess={fetchData} staff={profiles} skills={skills} editRecord={editAssignment} />
    </div>
  );
}

function SkillCell({ ss, canManage, onEdit, onDelete }: { ss: StaffSkill; canManage: boolean; onEdit: () => void; onDelete: () => void }) {
  const days = daysUntil(ss.certification_expiry_date);
  const expired = days !== null && days < 0;
  const expiring = days !== null && days >= 0 && days <= 90;

  const levelBg = ss.level === "Expert" ? "bg-primary/80" : ss.level === "Competent" ? "bg-primary/40" : "bg-secondary";
  const levelText = ss.level === "Expert" ? "text-primary-foreground" : ss.level === "Competent" ? "text-primary-foreground" : "text-secondary-foreground";

  return (
    <div className="group relative inline-flex flex-col items-center gap-0.5">
      <span className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-mono font-bold cursor-default",
        levelBg, levelText,
        expired && "ring-1 ring-destructive",
        expiring && !expired && "ring-1 ring-warning"
      )} title={`${ss.level}${days !== null ? ` · ${expired ? "EXPIRED" : days + "d"}` : ""}`}>
        {ss.level.charAt(0)}
        {expired && <AlertTriangle size={8} className="text-destructive" />}
        {expiring && !expired && <Clock size={8} className="text-warning" />}
      </span>
      {canManage && (
        <div className="hidden group-hover:flex gap-0.5 absolute -top-5 left-1/2 -translate-x-1/2 bg-card border border-border rounded px-1 py-0.5 shadow-lg z-20">
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground"><Pencil size={10} /></button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 size={10} /></button>
        </div>
      )}
    </div>
  );
}
