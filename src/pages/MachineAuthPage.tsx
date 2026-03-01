import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, ShieldX, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STAGE_NAMES = ["Design", "Programming", "CNC", "Edgebanding", "Assembly", "Spray", "Install"] as const;
const LEVELS = ["Trainee", "Competent", "Expert"] as const;

interface Requirement {
  id: string;
  stage_name: string;
  skill_id: string;
  minimum_level: string;
  mandatory: boolean;
  skill_name?: string;
  skill_category?: string;
}

interface Skill {
  id: string;
  name: string;
  category: string;
}

interface StaffAuth {
  staff_id: string;
  staff_name: string;
  department: string;
  authorised: boolean;
  missing_skills: { skill_name: string; required: string; held: string }[];
}

export default function MachineAuthPage() {
  const { userRole } = useAuth();
  const canManage = userRole === "admin" || userRole === "engineer";

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; full_name: string; department: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<string>("CNC");
  const [addOpen, setAddOpen] = useState(false);
  const [staffAuths, setStaffAuths] = useState<StaffAuth[]>([]);
  const [authLoading, setAuthLoading] = useState(false);

  const [form, setForm] = useState({ skill_id: "", minimum_level: "Competent", mandatory: true });

  const fetchData = useCallback(async () => {
    const [reqRes, skillsRes, profRes] = await Promise.all([
      supabase.from("stage_skill_requirements").select("*"),
      supabase.from("skills").select("id, name, category").eq("active", true),
      supabase.from("profiles").select("user_id, full_name, department").eq("active", true),
    ]);
    const skillMap = new Map((skillsRes.data ?? []).map(s => [s.id, s]));
    setSkills(skillsRes.data ?? []);
    setProfiles(profRes.data ?? []);
    setRequirements(
      (reqRes.data ?? []).map(r => ({
        ...r,
        skill_name: skillMap.get(r.skill_id)?.name,
        skill_category: skillMap.get(r.skill_id)?.category,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Check authorisation for all staff against selected stage
  const checkAuthorisations = useCallback(async () => {
    if (!profiles.length) return;
    setAuthLoading(true);
    const results: StaffAuth[] = [];
    for (const p of profiles) {
      const { data } = await supabase.rpc("check_staff_stage_authorisation", {
        _staff_id: p.user_id,
        _stage_name: selectedStage,
      });
      const row = data?.[0];
      results.push({
        staff_id: p.user_id,
        staff_name: p.full_name,
        department: p.department,
        authorised: row?.authorised ?? true,
        missing_skills: (row?.missing_skills as any) ?? [],
      });
    }
    setStaffAuths(results);
    setAuthLoading(false);
  }, [profiles, selectedStage]);

  useEffect(() => { checkAuthorisations(); }, [checkAuthorisations]);

  const stageReqs = requirements.filter(r => r.stage_name === selectedStage);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("stage_skill_requirements").insert({
      stage_name: selectedStage,
      skill_id: form.skill_id,
      minimum_level: form.minimum_level,
      mandatory: form.mandatory,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Requirement added" });
      setAddOpen(false);
      setForm({ skill_id: "", minimum_level: "Competent", mandatory: true });
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("stage_skill_requirements").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Requirement removed" });
      fetchData();
    }
  };

  const authorised = staffAuths.filter(s => s.authorised);
  const unauthorised = staffAuths.filter(s => !s.authorised);

  const inputClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const selectClass = "w-full h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none";
  const labelClass = "block text-xs font-mono font-medium text-muted-foreground mb-1.5";

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-in">
        <h2 className="text-2xl font-mono font-bold text-foreground">Machine Authorisation</h2>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="glass-panel rounded-lg p-4 h-48 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Machine Authorisation</h2>
          <p className="text-sm text-muted-foreground">
            Link required skills to production stages · Block unqualified staff assignments
          </p>
        </div>
      </div>

      {/* Stage selector */}
      <div className="flex flex-wrap gap-2">
        {STAGE_NAMES.map(stage => {
          const count = requirements.filter(r => r.stage_name === stage).length;
          return (
            <button
              key={stage}
              onClick={() => setSelectedStage(stage)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-mono font-medium transition-all",
                selectedStage === stage
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
              )}
            >
              {stage}
              {count > 0 && (
                <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Requirements panel */}
        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-mono text-sm font-bold text-foreground">
              Required Skills — {selectedStage}
            </h3>
            {canManage && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus size={12} /> Add Requirement
              </button>
            )}
          </div>
          <div className="p-4">
            {stageReqs.length === 0 ? (
              <div className="text-center py-8">
                <ShieldCheck size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No skill requirements set for {selectedStage}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">All staff are authorised by default</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stageReqs.map(req => (
                  <div key={req.id} className="flex items-center justify-between p-3 rounded-md bg-card border border-border">
                    <div className="flex items-center gap-3">
                      <ShieldCheck size={16} className="text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{req.skill_name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Min: {req.minimum_level} · {req.mandatory ? "Mandatory" : "Optional"} · {req.skill_category}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        onClick={() => handleDelete(req.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Staff authorisation panel */}
        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-mono text-sm font-bold text-foreground">
              Staff Authorisation — {selectedStage}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {authorised.length} authorised · {unauthorised.length} blocked
            </p>
          </div>
          <div className="p-4">
            {authLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />)}
              </div>
            ) : stageReqs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No requirements — all staff authorised</p>
            ) : (
              <div className="space-y-3">
                {unauthorised.length > 0 && (
                  <div>
                    <p className="text-xs font-mono font-bold text-destructive mb-2 flex items-center gap-1.5">
                      <ShieldX size={12} /> BLOCKED ({unauthorised.length})
                    </p>
                    <div className="space-y-1.5">
                      {unauthorised.map(s => (
                        <div key={s.staff_id} className="p-2.5 rounded-md bg-destructive/5 border border-destructive/20">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground">{s.staff_name}</p>
                            <span className="text-[10px] font-mono text-muted-foreground">{s.department}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {s.missing_skills.map((ms, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">
                                <AlertTriangle size={8} />
                                {ms.skill_name}: {ms.held} → needs {ms.required}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {authorised.length > 0 && (
                  <div>
                    <p className="text-xs font-mono font-bold text-success mb-2 flex items-center gap-1.5">
                      <ShieldCheck size={12} /> AUTHORISED ({authorised.length})
                    </p>
                    <div className="space-y-1.5">
                      {authorised.map(s => (
                        <div key={s.staff_id} className="p-2.5 rounded-md bg-success/5 border border-success/20 flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground">{s.staff_name}</p>
                          <span className="text-[10px] font-mono text-muted-foreground">{s.department}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add requirement dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="glass-panel border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground">Add Skill Requirement — {selectedStage}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={labelClass}>SKILL</label>
              <select
                required
                value={form.skill_id}
                onChange={e => setForm(f => ({ ...f, skill_id: e.target.value }))}
                className={selectClass}
              >
                <option value="">Select skill...</option>
                {skills
                  .filter(s => !stageReqs.some(r => r.skill_id === s.id))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>MINIMUM LEVEL</label>
                <select
                  value={form.minimum_level}
                  onChange={e => setForm(f => ({ ...f, minimum_level: e.target.value }))}
                  className={selectClass}
                >
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>TYPE</label>
                <select
                  value={form.mandatory ? "mandatory" : "optional"}
                  onChange={e => setForm(f => ({ ...f, mandatory: e.target.value === "mandatory" }))}
                  className={selectClass}
                >
                  <option value="mandatory">Mandatory</option>
                  <option value="optional">Optional</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="w-full h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Add Requirement
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
