import { useState, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import NotificationBell from "@/components/NotificationBell";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import {
  LayoutDashboard, Wrench, Users, CalendarDays, FileText, Recycle,
  ChevronLeft, ChevronRight, Menu, X, LogOut, Kanban, ClipboardList,
  Package, ShieldCheck, GraduationCap, Zap, ShieldAlert,
  ClipboardCheck, Palmtree, Settings, ChevronDown, Activity, BarChart3,
  BadgePoundSterling, Receipt, Wallet, Clock, Building, Truck, FileSpreadsheet,
  Download, TrendingUp, TrendingDown, Factory, Timer, Banknote, Brain, UserCog,
  Home, MoreHorizontal, Landmark, Briefcase, Contact, FileBox, Link2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { canRoleAccessRoute, FINANCE_ROLES } from "@/lib/roleVisibility";
import ClockAnomalyPrompt from "@/components/ClockAnomalyPrompt";
import RoleSwitcher from "@/components/RoleSwitcher";
import { useIsMobile } from "@/hooks/use-mobile";
import type { LucideIcon } from "lucide-react";

// ── Types ──

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  featureFlag?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  roles?: string[]; // if set, only these roles see the group
  items: NavItem[];
}

// ── Role helpers ──

const OPERATIVE_ROLES = ["production", "installer"];
const MANAGER_ROLES = ["admin", "supervisor", "office", "finance"];

function isOperative(role: string | null): boolean {
  return OPERATIVE_ROLES.includes(role || "");
}

// ── Top-level nav items (always visible) ──
const topLevelItems: NavItem[] = [
  { to: "/admin/leads", label: "Jobs", icon: Briefcase },
  { to: "/workflow", label: "Workflow Board", icon: Kanban },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
];

// ── Cabinetry Admin items ──
const cabAdminItems: NavItem[] = [
  { to: "/admin/production", label: "Production Board", icon: Factory },
  { to: "/admin/suppliers", label: "Suppliers", icon: Truck },
  { to: "/admin/ghl", label: "GHL Settings", icon: Settings },
  { to: "/admin/team", label: "Team & Invites", icon: Users },
];

// ── Operative bottom nav items ──
const operativeBottomNav: NavItem[] = [
  { to: "/", label: "My Day", icon: Home },
  { to: "/jobs", label: "Jobs", icon: Wrench },
  { to: "/my-hours", label: "HR", icon: Timer },
];

// ══════════════════════════════════════════════
// Main Layout Component
// ══════════════════════════════════════════════

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const location = useLocation();
  const { profile, userRole, signOut } = useAuth();
  const { flags } = useFeatureFlags();
  const { branding } = useTenantBranding();
  const isMobile = useIsMobile();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("")
    : "??";
  const displayName = profile?.full_name || "Loading...";
  const displayRole = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : "";




  // ── Operative on mobile → bottom nav layout ──
  if (isMobile && isOperative(userRole)) {
    return (
      <div className="flex flex-col h-screen bg-background">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="font-mono text-xs font-bold text-primary-foreground">
                {branding.companyName?.[0] || "E"}
              </span>
            </div>
            <span className="font-mono text-sm font-bold text-foreground">{branding.companyName}</span>
          </div>
          <div className="flex items-center gap-2">
            {flags.enable_notifications !== false && <NotificationBell />}
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-4">
          {children}
        </div>

        {/* Bottom nav */}
        <nav className="h-16 border-t border-border bg-card flex items-center justify-around shrink-0 safe-area-bottom">
          {operativeBottomNav.map(item => {
            const isActive = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1 px-3 rounded-md transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon size={20} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </NavLink>
            );
          })}
          <button
            onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-1 px-3 rounded-md transition-colors",
              mobileMoreOpen ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </nav>

        {/* More drawer */}
        {mobileMoreOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMoreOpen(false)} />
            <div className="fixed bottom-16 left-0 right-0 z-50 bg-card border-t border-border rounded-t-xl p-4 space-y-1 max-h-[60vh] overflow-y-auto">
              <p className="text-xs font-mono font-bold text-muted-foreground mb-2 uppercase">More</p>
              {[
                { to: "/my-work", label: "My Work", icon: ClipboardList },
                { to: "/my-pay", label: "My Pay", icon: Banknote },
                { to: "/documents", label: "Documents", icon: FileText },
                ...(flags.enable_remnants ? [{ to: "/remnants", label: "Remnants", icon: Recycle }] : []),
                { to: "/whos-in", label: "Who's In", icon: Users },
              ].map(item => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                      isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary/50"
                    )}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
              <div className="border-t border-border pt-2 mt-2">
                <button onClick={signOut} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 w-full">
                  <LogOut size={18} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </>
        )}

        <ClockAnomalyPrompt />
      </div>
    );
  }

  // ── Desktop / Manager sidebar layout ──
  // Determine page title from navGroups + self-service
  const allItems = [...topLevelItems, ...navGroups.flatMap(g => g.items)];
  const currentTitle = (() => {
    if (location.pathname === "/") {
      return isOperative(userRole) ? "My Day" : "Business Overview";
    }
    return allItems.find(n => n.to !== "/" && location.pathname.startsWith(n.to))?.label
      || branding.companyName || "Enclave";
  })();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar transition-all duration-300 lg:relative",
          collapsed ? "w-[72px]" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center overflow-hidden shrink-0">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="font-mono text-sm font-bold text-primary-foreground">
                    {branding.companyName?.[0] || "E"}
                  </span>
                )}
              </div>
              <div>
                <p className="font-mono text-sm font-bold text-foreground leading-none">{branding.companyName}</p>
                <p className="text-[10px] text-muted-foreground tracking-widest">{branding.subtitle}</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center mx-auto overflow-hidden">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="font-mono text-sm font-bold text-primary-foreground">
                  {branding.companyName?.[0] || "E"}
                </span>
              )}
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden h-6 w-6 flex items-center justify-center text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-0.5">
          {/* Landing page link */}
          {(() => {
            const landingLabel = userRole === "admin" ? "Business Overview" : isOperative(userRole) ? "My Day" : "Overview";
            const isActive = location.pathname === "/";
            return (
              <NavLink
                to="/"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                  isActive ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <LayoutDashboard size={18} className={isActive ? "text-primary" : ""} />
                {!collapsed && <span>{landingLabel}</span>}
              </NavLink>
            );
          })()}

          {/* Top-level nav items */}
          {topLevelItems.filter(item => canRoleAccessRoute(userRole, item.to)).map(item => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all",
                  isActive ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon size={18} className={isActive ? "text-primary" : ""} />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}

          {/* Collapsible groups */}
          {navGroups.map(group => {
            const open = isGroupOpen(group.id);
            return (
              <div key={group.id} className="mt-1">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all w-full",
                    activeGroupId === group.id
                      ? "text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <group.icon size={18} className={activeGroupId === group.id ? "text-primary" : "text-muted-foreground"} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left text-xs font-mono font-bold uppercase">{group.label}</span>
                      <ChevronDown size={12} className={cn("transition-transform text-muted-foreground", open && "rotate-180")} />
                    </>
                  )}
                </button>
                {open && !collapsed && (
                  <div className="ml-3 pl-3 border-l border-border/50 space-y-0.5 mt-0.5">
                    {group.items.map(item => {
                      const isActive = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <item.icon size={14} className={isActive ? "text-primary" : ""} />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <span className="text-xs font-mono font-bold text-secondary-foreground">{collapsed ? initials[0] : initials}</span>
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
                <p className="text-[10px] text-muted-foreground">{displayRole}</p>
              </div>
            )}
            {!collapsed && (
              <button onClick={signOut} className="text-muted-foreground hover:text-foreground transition-colors" title="Sign out">
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 border-b border-border flex items-center justify-between px-4 lg:px-6 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden h-9 w-9 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
            >
              <Menu size={18} />
            </button>
            <h1 className="font-mono text-lg font-bold text-foreground">{currentTitle}</h1>
          </div>
          <div className="flex items-center gap-3">
            {flags.enable_notifications !== false && <NotificationBell />}
            <div className="flex items-center gap-2">
              <div className="status-dot status-active animate-pulse-glow" />
              <span className="text-xs text-muted-foreground font-mono">ONLINE</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </div>

        <ClockAnomalyPrompt />
        <RoleSwitcher />
      </main>
    </div>
  );
}
