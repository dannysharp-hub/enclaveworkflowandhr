import { supabase } from "@/integrations/supabase/client";

/** Get the current user's cab company_id from cab_user_profiles */
export async function getCabCompanyId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await (supabase.from("cab_user_profiles") as any)
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  return data?.company_id ?? null;
}

/** Generate next sequential job_ref for a company (race-safe via DB function) */
export async function generateJobRef(companyId: string, firstName: string, lastName: string): Promise<string> {
  const { data, error } = await supabase.rpc("cab_next_job_number", { _company_id: companyId } as any);
  if (error) throw error;
  const seq = (data as number).toString().padStart(3, "0");
  const namePart = (firstName + lastName).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${seq}_${namePart}`;
}

/** Insert a cab_events row */
export async function insertCabEvent(params: {
  companyId: string;
  eventType: string;
  jobId?: string;
  customerId?: string;
  payload?: Record<string, any>;
}) {
  return (supabase.from("cab_events") as any).insert({
    company_id: params.companyId,
    event_type: params.eventType,
    job_id: params.jobId ?? null,
    customer_id: params.customerId ?? null,
    payload_json: params.payload ?? {},
    status: "pending",
  });
}

/** Get company details for postcode checks etc */
export async function getCabCompany(companyId: string) {
  const { data } = await (supabase.from("cab_companies") as any)
    .select("*")
    .eq("id", companyId)
    .single();
  return data;
}

/** Approximate distance between two UK postcodes using a simple lookup.
 *  For production, use a geocoding API. This uses a rough lat/lon from postcode prefixes. */
export function estimatePostcodeDistance(postcodeA: string, postcodeB: string): number | null {
  // Simple UK postcode centroid approximation
  const coords = getApproxCoords(postcodeA);
  const coords2 = getApproxCoords(postcodeB);
  if (!coords || !coords2) return null;
  return haversineDistance(coords.lat, coords.lon, coords2.lat, coords2.lon);
}

// Very rough UK postcode area centroids (major areas only)
const UK_POSTCODE_COORDS: Record<string, { lat: number; lon: number }> = {
  PE: { lat: 52.57, lon: -0.24 },
  CB: { lat: 52.21, lon: 0.12 },
  NN: { lat: 52.24, lon: -0.89 },
  MK: { lat: 52.04, lon: -0.76 },
  LN: { lat: 53.23, lon: -0.54 },
  NG: { lat: 52.95, lon: -1.15 },
  LE: { lat: 52.63, lon: -1.13 },
  NR: { lat: 52.63, lon: 1.30 },
  IP: { lat: 52.06, lon: 1.16 },
  CO: { lat: 51.89, lon: 0.90 },
  LU: { lat: 51.88, lon: -0.42 },
  SG: { lat: 51.90, lon: -0.20 },
  AL: { lat: 51.75, lon: -0.34 },
  EN: { lat: 51.65, lon: -0.08 },
  N: { lat: 51.55, lon: -0.10 },
  E: { lat: 51.53, lon: 0.05 },
  EC: { lat: 51.52, lon: -0.09 },
  W: { lat: 51.51, lon: -0.18 },
  WC: { lat: 51.52, lon: -0.12 },
  SW: { lat: 51.46, lon: -0.17 },
  SE: { lat: 51.47, lon: -0.05 },
  BR: { lat: 51.41, lon: 0.05 },
  DA: { lat: 51.45, lon: 0.22 },
  RM: { lat: 51.57, lon: 0.18 },
  SS: { lat: 51.54, lon: 0.71 },
  CM: { lat: 51.73, lon: 0.47 },
  DE: { lat: 52.92, lon: -1.47 },
  B: { lat: 52.48, lon: -1.89 },
  CV: { lat: 52.41, lon: -1.51 },
  OX: { lat: 51.75, lon: -1.26 },
  HP: { lat: 51.75, lon: -0.75 },
  RG: { lat: 51.45, lon: -0.97 },
  SL: { lat: 51.51, lon: -0.60 },
  UB: { lat: 51.55, lon: -0.44 },
  TW: { lat: 51.45, lon: -0.34 },
  KT: { lat: 51.38, lon: -0.30 },
  GU: { lat: 51.24, lon: -0.77 },
  RH: { lat: 51.24, lon: -0.20 },
  TN: { lat: 51.13, lon: 0.27 },
  ME: { lat: 51.35, lon: 0.52 },
  CT: { lat: 51.28, lon: 1.08 },
  BN: { lat: 50.83, lon: -0.14 },
  PO: { lat: 50.80, lon: -1.09 },
  SO: { lat: 50.90, lon: -1.40 },
  SP: { lat: 51.07, lon: -1.80 },
  BA: { lat: 51.38, lon: -2.36 },
  BS: { lat: 51.45, lon: -2.59 },
  GL: { lat: 51.87, lon: -2.24 },
  SN: { lat: 51.56, lon: -1.78 },
  WR: { lat: 52.19, lon: -2.22 },
  HR: { lat: 52.06, lon: -2.72 },
  WS: { lat: 52.59, lon: -1.97 },
  WV: { lat: 52.59, lon: -2.12 },
  ST: { lat: 52.98, lon: -2.18 },
  CW: { lat: 53.10, lon: -2.44 },
  SK: { lat: 53.39, lon: -2.16 },
  M: { lat: 53.48, lon: -2.24 },
  OL: { lat: 53.54, lon: -2.12 },
  BL: { lat: 53.58, lon: -2.43 },
  WN: { lat: 53.55, lon: -2.63 },
  L: { lat: 53.41, lon: -2.98 },
  CH: { lat: 53.19, lon: -2.89 },
  LL: { lat: 53.12, lon: -3.83 },
  SY: { lat: 52.41, lon: -2.99 },
  SA: { lat: 51.62, lon: -3.94 },
  CF: { lat: 51.48, lon: -3.18 },
  NP: { lat: 51.59, lon: -3.00 },
  LD: { lat: 52.25, lon: -3.38 },
  EX: { lat: 50.72, lon: -3.53 },
  TQ: { lat: 50.47, lon: -3.60 },
  PL: { lat: 50.37, lon: -4.14 },
  TR: { lat: 50.26, lon: -5.05 },
  TA: { lat: 51.02, lon: -3.10 },
  DT: { lat: 50.71, lon: -2.44 },
  BH: { lat: 50.72, lon: -1.88 },
  WF: { lat: 53.68, lon: -1.50 },
  HD: { lat: 53.65, lon: -1.78 },
  HX: { lat: 53.73, lon: -1.86 },
  BD: { lat: 53.80, lon: -1.76 },
  LS: { lat: 53.80, lon: -1.55 },
  HG: { lat: 54.00, lon: -1.54 },
  YO: { lat: 53.96, lon: -1.08 },
  DN: { lat: 53.52, lon: -1.13 },
  S: { lat: 53.38, lon: -1.47 },
  HU: { lat: 53.74, lon: -0.33 },
  DL: { lat: 54.52, lon: -1.56 },
  TS: { lat: 54.57, lon: -1.23 },
  SR: { lat: 54.91, lon: -1.38 },
  DH: { lat: 54.78, lon: -1.57 },
  NE: { lat: 55.00, lon: -1.60 },
  CA: { lat: 54.90, lon: -2.94 },
  LA: { lat: 54.05, lon: -2.80 },
  PR: { lat: 53.76, lon: -2.70 },
  BB: { lat: 53.75, lon: -2.48 },
  FY: { lat: 53.82, lon: -3.05 },
  TD: { lat: 55.60, lon: -2.43 },
  EH: { lat: 55.95, lon: -3.19 },
  FK: { lat: 56.00, lon: -3.79 },
  KY: { lat: 56.21, lon: -3.15 },
  DD: { lat: 56.46, lon: -2.97 },
  PH: { lat: 56.65, lon: -3.78 },
  AB: { lat: 57.15, lon: -2.10 },
  IV: { lat: 57.48, lon: -4.23 },
  KW: { lat: 58.44, lon: -3.09 },
  PA: { lat: 55.84, lon: -4.52 },
  G: { lat: 55.86, lon: -4.25 },
  ML: { lat: 55.77, lon: -3.94 },
  KA: { lat: 55.46, lon: -4.63 },
  DG: { lat: 55.07, lon: -3.61 },
  ZE: { lat: 60.39, lon: -1.15 },
  HS: { lat: 57.86, lon: -6.83 },
  BT: { lat: 54.60, lon: -5.93 },
};

function getApproxCoords(postcode: string): { lat: number; lon: number } | null {
  const clean = postcode.toUpperCase().replace(/\s+/g, "");
  // Try full area (e.g., PE20 → PE)
  const match2 = clean.match(/^([A-Z]{1,2})/);
  if (!match2) return null;
  return UK_POSTCODE_COORDS[match2[1]] ?? null;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Timeline milestones for the customer portal (expanded) */
export const PORTAL_MILESTONES = [
  { key: "project_confirmed", label: "Project Confirmed" },
  { key: "materials_ordered", label: "Materials Ordered" },
  { key: "manufacturing_started", label: "Manufacturing Started" },
  { key: "cabinetry_assembled", label: "Cabinetry Assembled" },
  { key: "ready_for_installation", label: "Ready for Installation" },
  { key: "install_booked", label: "Installation Booked" },
  { key: "installation_complete", label: "Installation Complete" },
  { key: "signed_off", label: "Signed Off" },
  { key: "practical_completed", label: "Practical Completion" },
  { key: "closed_paid", label: "Project Complete" },
] as const;

/** Map current_stage_key to milestone index */
export function getMilestoneIndex(stageKey: string | null): number {
  if (!stageKey) return -1;
  // Map customer_signoff_at presence to signed_off milestone
  const idx = PORTAL_MILESTONES.findIndex(m => m.key === stageKey);
  if (idx >= 0) return idx;
  // Pre-confirmation stages
  const preStages = ["lead_captured", "ballpark_sent", "appointment_requested", "quote_sent", "quote_viewed", "deposit_due"];
  if (preStages.includes(stageKey)) return -1;
  return -1;
}
