import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import NotificationBell from "@/components/NotificationBell";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import {
  LayoutDashboard, Wrench, Users, CalendarDays, FileText, Recycle,
  ChevronLeft, ChevronRight, Menu, X, LogOut, Kanban, ClipboardList,
  Package, ShieldCheck, GraduationCap, Zap, Sun, ShieldAlert,
  ClipboardCheck, Palmtree, Settings, ChevronDown, Activity, BarChart3,
  BadgePoundSterling, Receipt, Wallet, Clock, Building, Truck, FileSpreadsheet, Download, TrendingUp, TrendingDown, Factory,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  featureFlag?: string;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  featureFlag?: string;
  items: NavItem[];
}

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/whos-in", label: "Who's In", icon: Sun },
  { to: "/my-work", label: "My Work", icon: ClipboardList },
  { to: "/workflow", label: "Workflow", icon: Kanban },
  { to: "/jobs", label: "Jobs", icon: Wrench },
  { to: "/production", label: "Production", icon: Activity },
  { to: "/staff", label: "Staff", icon: Users },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/holiday-calendar", label: "Holiday Cal", icon: Palmtree },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/compliance", label: "Compliance", icon: ShieldCheck },
  { to: "/training", label: "Training", icon: GraduationCap },
  { to: "/skills", label: "Skills Matrix", icon: Zap },
  { to: "/machine-auth", label: "Machine Auth", icon: ShieldAlert },
  { to: "/reviews", label: "Reviews", icon: ClipboardCheck },
  { to: "/remnants", label: "Remnants", icon: Recycle, featureFlag: "enable_remnants" },
  { to: "/materials", label: "Materials", icon: Package },
  { to: "/purchasing", label: "Purchase Orders", icon: Truck },
  { to: "/drift", label: "Drift Control", icon: TrendingDown },
  { to: "/capacity", label: "Capacity", icon: Factory },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

const financeGroup: NavGroup = {
  label: "Finance",
  icon: BadgePoundSterling,
  featureFlag: "enable_finance",
  items: [
    { to: "/finance", label: "Dashboard", icon: BadgePoundSterling },
    { to: "/finance/invoices", label: "Invoices", icon: Receipt },
    { to: "/finance/bills", label: "Bills", icon: Wallet },
    { to: "/finance/wages", label: "Wages", icon: Clock },
    { to: "/finance/overheads", label: "Overheads", icon: Building },
    { to: "/finance/customers", label: "Customers", icon: Users },
    { to: "/finance/suppliers", label: "Suppliers", icon: Truck },
    { to: "/finance/pandle", label: "Pandle", icon: FileSpreadsheet },
    { to: "/finance/pandle/export", label: "Pandle Export", icon: Download },
    { to: "/finance/forecast", label: "Forecast", icon: TrendingUp },
  ],
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const location = useLocation();
  const { profile, userRole, signOut } = useAuth();
  const { flags } = useFeatureFlags();
  const { branding } = useTenantBranding();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n: string) => n[0]).join("")
    : "??";
  const displayName = profile?.full_name || "Loading...";
  const displayRole = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : "";

  // Filter nav items based on feature flags
  const visibleNavItems = navItems.filter((item) => {
    if (!item.featureFlag) return true;
    return flags[item.featureFlag] === true;
  });

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
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary glow-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon size={18} className={isActive ? "text-primary" : ""} />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}

          {/* Finance group */}
          {(!financeGroup.featureFlag || flags[financeGroup.featureFlag]) && (
            <>
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => setFinanceOpen(!financeOpen)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all w-full",
                  location.pathname.startsWith("/finance")
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <financeGroup.icon size={18} className={location.pathname.startsWith("/finance") ? "text-primary" : ""} />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{financeGroup.label}</span>
                    <ChevronDown size={14} className={cn("transition-transform", financeOpen && "rotate-180")} />
                  </>
                )}
              </button>
              {(financeOpen || location.pathname.startsWith("/finance")) && !collapsed && (
                <div className="ml-4 space-y-0.5">
                  {financeGroup.items.map((item) => {
                    const isActive = location.pathname === item.to;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-all",
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
            </>
          )}

          {userRole === "admin" && (
            <>
              <div className="my-2 border-t border-border" />
              {(() => {
                const isActive = location.pathname === "/settings";
                return (
                  <NavLink
                    to="/settings"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                      isActive
                        ? "bg-primary/10 text-primary glow-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Settings size={18} className={isActive ? "text-primary" : ""} />
                    {!collapsed && <span>Settings</span>}
                  </NavLink>
                );
              })()}
            </>
          )}
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
            <h1 className="font-mono text-lg font-bold text-foreground">
              {navItems.find(n => n.to === "/" && location.pathname === "/")?.label ||
               navItems.find(n => n.to !== "/" && location.pathname.startsWith(n.to))?.label ||
               branding.companyName || "Enclave CNC"}
            </h1>
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
      </main>
    </div>
  );
}
