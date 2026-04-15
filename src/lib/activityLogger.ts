import { supabase } from "@/integrations/supabase/client";

interface LogActivityParams {
  action: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, any>;
}

let cachedProfile: { userId: string; userName: string; userRole: string } | null = null;

async function getUserInfo() {
  if (cachedProfile) return cachedProfile;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await (supabase.from("cab_company_memberships") as any)
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  cachedProfile = {
    userId: user.id,
    userName: user.user_metadata?.full_name || user.email || "Unknown",
    userRole: membership?.role || "viewer",
  };
  return cachedProfile;
}

export function clearActivityCache() {
  cachedProfile = null;
}

export async function logActivity(params: LogActivityParams) {
  try {
    const info = await getUserInfo();
    if (!info) return;

    await (supabase.from("user_activity_log") as any).insert({
      user_id: info.userId,
      user_name: info.userName,
      user_role: info.userRole,
      action: params.action,
      resource_type: params.resourceType || null,
      resource_id: params.resourceId || null,
      resource_name: params.resourceName || null,
      metadata_json: params.metadata || null,
    });
  } catch {
    // Fire-and-forget — never block UI
  }
}

// Convenience helpers
export const logPageVisit = (pageName: string) =>
  logActivity({ action: "page_visited", resourceType: "page", resourceName: pageName });

export const logJobViewed = (jobRef: string, jobId: string) =>
  logActivity({ action: "job_viewed", resourceType: "job", resourceId: jobId, resourceName: jobRef });

export const logJobCreated = (jobRef: string, jobId: string) =>
  logActivity({ action: "job_created", resourceType: "job", resourceId: jobId, resourceName: jobRef });

export const logJobEdited = (jobRef: string, jobId: string, field?: string) =>
  logActivity({ action: "job_edited", resourceType: "job", resourceId: jobId, resourceName: jobRef, metadata: field ? { field } : undefined });

export const logJobDeleted = (jobRef: string, jobId: string) =>
  logActivity({ action: "job_deleted", resourceType: "job", resourceId: jobId, resourceName: jobRef });

export const logDocumentOpened = (docType: string, jobRef: string) =>
  logActivity({ action: "document_opened", resourceType: docType, resourceName: jobRef });

export const logStageChanged = (jobRef: string, jobId: string, from: string, to: string) =>
  logActivity({ action: "stage_changed", resourceType: "job", resourceId: jobId, resourceName: jobRef, metadata: { from, to } });

export const logPaymentMarked = (milestone: string, jobRef: string, jobId: string) =>
  logActivity({ action: "payment_marked", resourceType: "invoice", resourceId: jobId, resourceName: `${milestone} – ${jobRef}` });

export const logDriveFolderOpened = (jobRef: string) =>
  logActivity({ action: "drive_folder_opened", resourceType: "drive", resourceName: jobRef });

export const logSettingsAccessed = () =>
  logActivity({ action: "settings_accessed", resourceType: "page", resourceName: "Settings" });

export const logLogin = () =>
  logActivity({ action: "login" });

export const logLogout = () =>
  logActivity({ action: "logout" });
