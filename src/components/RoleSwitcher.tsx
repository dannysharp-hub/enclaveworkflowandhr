import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppRole } from "@/lib/roleVisibility";
import { Eye, X } from "lucide-react";

const ALL_ROLES: AppRole[] = ["admin", "supervisor", "office", "production", "installer", "finance", "viewer"];

/**
 * Admin-only floating widget to preview the app as a different role.
 * Sets an override in AuthContext without touching the database.
 */
export default function RoleSwitcher() {
  const { userRole, roleOverride, setRoleOverride } = useAuth();
  const [open, setOpen] = useState(false);

  // Only real admins can use this
  if (userRole !== "admin") return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      {open ? (
        <div className="bg-card border border-border rounded-lg shadow-xl p-3 w-52 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-foreground">View as Role</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {ALL_ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRoleOverride(r === userRole ? null : r)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded font-mono transition-colors ${
                  (roleOverride ?? userRole) === r
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {r}
                {r === userRole && " (yours)"}
              </button>
            ))}
          </div>
          {roleOverride && (
            <button
              onClick={() => setRoleOverride(null)}
              className="w-full text-xs text-center py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 font-mono"
            >
              Reset to {userRole}
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-card border border-border shadow-lg text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye size={14} />
          {roleOverride ? `Viewing as: ${roleOverride}` : "Role Switcher"}
        </button>
      )}
    </div>
  );
}
