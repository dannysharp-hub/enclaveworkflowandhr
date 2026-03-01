import { mockStaff } from "@/data/mockData";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const roleBadge = (role: string) => {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium";
  switch (role) {
    case "Admin": return `${base} bg-primary/15 text-primary`;
    case "Engineer": return `${base} bg-accent/15 text-accent`;
    case "Supervisor": return `${base} bg-info/15 text-info`;
    case "Operator": return `${base} bg-success/15 text-success`;
    case "Office": return `${base} bg-warning/15 text-warning`;
    default: return `${base} bg-muted text-muted-foreground`;
  }
};

export default function StaffPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Staff</h2>
          <p className="text-sm text-muted-foreground">Manage team members and permissions</p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          Add Staff
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search staff..."
          className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockStaff.map(staff => (
          <div key={staff.staff_id} className="glass-panel rounded-lg p-4 hover:border-primary/20 transition-all cursor-pointer">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <span className="text-xs font-mono font-bold text-secondary-foreground">
                    {staff.full_name.split(" ").map(n => n[0]).join("")}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{staff.full_name}</p>
                  <p className="text-xs text-muted-foreground">{staff.department}</p>
                </div>
              </div>
              <div className={cn("w-2 h-2 rounded-full mt-1", staff.active ? "bg-success" : "bg-muted-foreground")} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={roleBadge(staff.role)}>{staff.role}</span>
              <span className="text-xs text-muted-foreground font-mono">{staff.holiday_balance_days}d holiday left</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
