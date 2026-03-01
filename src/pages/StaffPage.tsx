import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Search, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import CreateStaffDialog from "@/components/CreateStaffDialog";
import EditStaffDialog from "@/components/EditStaffDialog";

interface StaffRow {
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
  role: string;
}

const roleBadge = (role: string) => {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium";
  switch (role) {
    case "admin": return `${base} bg-primary/15 text-primary`;
    case "engineer": return `${base} bg-accent/15 text-accent`;
    case "supervisor": return `${base} bg-info/15 text-info`;
    case "operator": return `${base} bg-success/15 text-success`;
    case "office": return `${base} bg-warning/15 text-warning`;
    default: return `${base} bg-muted text-muted-foreground`;
  }
};

export default function StaffPage() {
  const { userRole } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffRow | null>(null);

  const isAdmin = userRole === "admin";

  const fetchStaff = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const roleMap = new Map((roles ?? []).map(r => [r.user_id, r.role]));

    const merged: StaffRow[] = (profiles ?? []).map(p => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      department: p.department,
      employment_type: p.employment_type,
      contracted_hours_per_week: p.contracted_hours_per_week,
      holiday_allowance_days: p.holiday_allowance_days,
      holiday_balance_days: p.holiday_balance_days,
      active: p.active,
      start_date: p.start_date,
      role: roleMap.get(p.user_id) ?? "viewer",
    }));

    setStaff(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return staff;
    const q = search.toLowerCase();
    return staff.filter(
      s =>
        s.full_name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
    );
  }, [staff, search]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Staff</h2>
          <p className="text-sm text-muted-foreground">
            {staff.length} member{staff.length !== 1 ? "s" : ""} · {staff.filter(s => s.active).length} active
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
            Add Staff
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search staff..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-panel rounded-lg p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 bg-secondary rounded w-2/3" />
                  <div className="h-2.5 bg-secondary rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <div
              key={s.user_id}
              className="glass-panel rounded-lg p-4 hover:border-primary/20 transition-all cursor-pointer group"
              onClick={() => {
                if (isAdmin) {
                  setSelectedStaff(s);
                  setEditOpen(true);
                }
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-xs font-mono font-bold text-secondary-foreground">
                      {s.full_name.split(" ").map(n => n[0]).join("")}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground">{s.department}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Pencil size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  <div className={cn("w-2 h-2 rounded-full mt-1", s.active ? "bg-success" : "bg-muted-foreground")} />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className={roleBadge(s.role)}>{s.role.charAt(0).toUpperCase() + s.role.slice(1)}</span>
                <span className="text-xs text-muted-foreground font-mono">{s.holiday_balance_days}d holiday left</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
              {search ? "No staff matching your search" : "No staff members yet. Click Add Staff to get started."}
            </div>
          )}
        </div>
      )}

      <CreateStaffDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={fetchStaff}
      />

      <EditStaffDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        staff={selectedStaff}
        onSuccess={fetchStaff}
      />
    </div>
  );
}
