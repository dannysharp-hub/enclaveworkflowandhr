/**
 * Centralised role-based permission helpers.
 *
 * Roles:
 *   admin      – Full access (Danny only)
 *   office     – Designer: create/edit jobs, manage design, view production (read-only). No financials.
 *   supervisor – Workshop manager: production board, dry-fit, workshop notes. No financials, no client contact.
 *   installer  – Fitter: only assigned install-stage jobs, fitter form, photos.
 */

export type AppRole = "admin" | "supervisor" | "office" | "viewer" | "production" | "installer" | "finance";

// ── Permission checks ──

export function canSeeFinancials(role: string | null): boolean {
  return role === "admin";
}

export function canDeleteRecords(role: string | null): boolean {
  return role === "admin";
}

export function canCreateJobs(role: string | null): boolean {
  return role === "admin" || role === "office";
}

export function canEditJobDetails(role: string | null): boolean {
  return role === "admin" || role === "office";
}

/** Can see client phone / email */
export function canSeeClientContact(role: string | null): boolean {
  return role === "admin" || role === "office" || role === "installer";
}

/** Can manage quotes (create, send, edit) */
export function canManageQuotes(role: string | null): boolean {
  return role === "admin" || role === "office";
}

/** Can see & interact with production board (move stages) */
export function canManageProduction(role: string | null): boolean {
  return role === "admin" || role === "supervisor";
}

/** Can view production board (read only) */
export function canViewProduction(role: string | null): boolean {
  return role === "admin" || role === "supervisor" || role === "office";
}

/** Can access GHL settings */
export function canAccessGhlSettings(role: string | null): boolean {
  return role === "admin";
}

/** Can access Settings page */
export function canAccessSettings(role: string | null): boolean {
  return role === "admin";
}

/** Can access Team & Invites */
export function canAccessTeam(role: string | null): boolean {
  return role === "admin";
}

/** Can access Suppliers */
export function canAccessSuppliers(role: string | null): boolean {
  return role === "admin";
}

/** Can manage design sign-off */
export function canManageDesignSignoff(role: string | null): boolean {
  return role === "admin" || role === "office";
}

/** Can upload dry-fit photos and mark dry-fit complete */
export function canManageDryFit(role: string | null): boolean {
  return role === "admin" || role === "supervisor";
}

/** Can perform fitter sign-off on installations */
export function canFitterSignOff(role: string | null): boolean {
  return role === "admin" || role === "supervisor";
}

/** Sections the user can see on the job detail page */
export function canSeeJobSection(role: string | null, section: string): boolean {
  switch (section) {
    case "ballpark":
    case "payments":
    case "invoices":
    case "contract_value":
    case "profitability":
    case "purchasing":
      return canSeeFinancials(role);
    case "ghl_admin":
      return canAccessGhlSettings(role);
    case "quote":
    case "quote_builder":
      return canManageQuotes(role);
    case "design_signoff":
      return canManageDesignSignoff(role);
    case "dry_fit":
      return canManageDryFit(role);
    case "fitter_signoff":
      return canFitterSignOff(role);
    case "production_stage":
      return canViewProduction(role);
    case "customer_contact":
      return canSeeClientContact(role);
    default:
      return true;
  }
}
