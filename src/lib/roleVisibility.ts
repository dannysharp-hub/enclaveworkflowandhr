/**
 * Role-based module visibility configuration.
 * Defines which roles can see which navigation items/modules.
 * Items not listed here are visible to all authenticated users.
 */

// All possible roles in the system
export type AppRole = "admin" | "supervisor" | "office" | "viewer" | "production" | "installer" | "finance";

// Roles that have full admin-level access
export const ADMIN_ROLES: AppRole[] = ["admin"];

// Roles that can see finance modules
export const FINANCE_ROLES: AppRole[] = ["admin"];

// Roles that can see HR admin features (not self-service)
export const HR_ADMIN_ROLES: AppRole[] = ["admin"];

// Roles that can see reporting/analytics
export const REPORTING_ROLES: AppRole[] = ["admin"];

// Roles that can see production control / drift / capacity
export const PRODUCTION_MGMT_ROLES: AppRole[] = ["admin", "supervisor"];

// Roles that can see AI Inbox
export const AI_INBOX_ROLES: AppRole[] = ["admin"];

// Roles that can see settings
export const SETTINGS_ROLES: AppRole[] = ["admin"];

/**
 * Module visibility map.
 * Key = route path prefix.
 * Value = array of roles allowed to see this module.
 * If a route is NOT in this map, it's visible to everyone.
 */
export const MODULE_VISIBILITY: Record<string, AppRole[]> = {
  // Finance — admin only
  "/finance": FINANCE_ROLES,

  // Staff management
  "/staff": HR_ADMIN_ROLES,
  "/hr-admin": HR_ADMIN_ROLES,

  // Production control pages
  "/production": PRODUCTION_MGMT_ROLES,
  "/drift": PRODUCTION_MGMT_ROLES,
  "/capacity": PRODUCTION_MGMT_ROLES,

  // AI Inbox
  "/ai-inbox": AI_INBOX_ROLES,

  // Reports
  "/reports": REPORTING_ROLES,

  // Settings
  "/settings": SETTINGS_ROLES,

  // Export Centre
  "/export-centre": SETTINGS_ROLES,

  // Quoting (has margin data)
  "/quoting": ["admin"],

  // Purchasing
  "/purchasing": ["admin"],

  // Cabinetry admin
  "/admin/leads": ["admin", "office", "supervisor"],
  "/admin/jobs": ["admin", "office", "supervisor"],
  "/admin/bootstrap": SETTINGS_ROLES,
  "/admin/ghl": SETTINGS_ROLES,
  "/admin/webhooks": SETTINGS_ROLES,
  "/admin/test-cleanup": SETTINGS_ROLES,
  "/admin/team": SETTINGS_ROLES,
  "/admin/production": ["admin", "supervisor", "office"],
  "/admin/suppliers": ["admin"],
  "/admin/profit-watch": ["admin"],
};

/**
 * Check if a given role can access a specific route.
 */
export function canRoleAccessRoute(role: string | null, route: string): boolean {
  if (!role) return false;

  // Check exact match first, then prefix match
  const exactMatch = MODULE_VISIBILITY[route];
  if (exactMatch) return exactMatch.includes(role as AppRole);

  // Check prefix matches (e.g. "/finance/invoices" matches "/finance")
  for (const [prefix, roles] of Object.entries(MODULE_VISIBILITY)) {
    if (route.startsWith(prefix + "/") || route === prefix) {
      return roles.includes(role as AppRole);
    }
  }

  // Not restricted — visible to all
  return true;
}

/**
 * Check if a role is considered an "admin-level" role.
 */
export function isAdminLevel(role: string | null): boolean {
  return role === "admin";
}
