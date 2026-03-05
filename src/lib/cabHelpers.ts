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

/** Generate next sequential job_ref for a company: "001_firstname" */
export async function generateJobRef(companyId: string, firstName: string, lastName: string): Promise<string> {
  const { count } = await (supabase.from("cab_jobs") as any)
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  const seq = ((count ?? 0) + 1).toString().padStart(3, "0");
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

/** Timeline milestones for the customer portal */
export const PORTAL_MILESTONES = [
  { key: "project_confirmed", label: "Project Confirmed" },
  { key: "materials_ordered", label: "Materials Ordered" },
  { key: "manufacturing_started", label: "Manufacturing Started" },
  { key: "cabinetry_assembled", label: "Cabinetry Assembled" },
  { key: "ready_for_installation", label: "Ready for Installation" },
  { key: "installation_complete", label: "Installation Complete" },
] as const;

/** Map current_stage_key to milestone index */
export function getMilestoneIndex(stageKey: string | null): number {
  if (!stageKey) return -1;
  const idx = PORTAL_MILESTONES.findIndex(m => m.key === stageKey);
  if (idx >= 0) return idx;
  // Pre-confirmation stages
  const preStages = ["lead_captured", "ballpark_sent", "appointment_requested", "quote_sent", "quote_viewed", "deposit_due"];
  if (preStages.includes(stageKey)) return -1;
  return -1;
}
