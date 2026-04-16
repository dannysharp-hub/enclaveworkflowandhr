import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export type ApprovalActionType = "job_edit" | "quote_send" | "design_signoff_send" | "invoice_send" | "ballpark_send";

interface CreateApprovalParams {
  companyId: string;
  actionType: ApprovalActionType;
  targetId: string;
  targetRef?: string;
  summary: string;
  payload?: Record<string, any>;
}

/**
 * Returns true if the current user's role requires admin approval for gated actions.
 */
export function useApprovalGate() {
  const { user, userRole } = useAuth();

  const requiresApproval = userRole === "office";

  const createApprovalRequest = useCallback(
    async (params: CreateApprovalParams): Promise<boolean> => {
      if (!user) return false;
      try {
        const { error } = await (supabase.from("cab_approval_requests") as any).insert({
          company_id: params.companyId,
          requested_by: user.id,
          action_type: params.actionType,
          target_id: params.targetId,
          target_ref: params.targetRef || null,
          summary: params.summary,
          payload_json: params.payload || null,
          status: "pending",
        });
        if (error) throw error;

        // Fire email notification to admin (fire-and-forget)
        supabase.functions.invoke("send-email", {
          body: {
            to: "danny@enclavecabinetry.com",
            subject: `Approval Required: ${params.summary}`,
            html: buildApprovalEmailHtml({
              summary: params.summary,
              actionType: params.actionType,
              targetRef: params.targetRef || "",
              requestedBy: user.email || "Unknown",
            }),
          },
        }).catch((e) => console.warn("[ApprovalGate] email failed:", e));

        toast({
          title: "Submitted for approval",
          description: "An admin will review your request shortly.",
        });
        return true;
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
        return false;
      }
    },
    [user]
  );

  return { requiresApproval, createApprovalRequest };
}

function buildApprovalEmailHtml(params: {
  summary: string;
  actionType: string;
  targetRef: string;
  requestedBy: string;
}): string {
  const actionLabels: Record<string, string> = {
    job_edit: "Job Edit",
    quote_send: "Send Quote",
    design_signoff_send: "Design Sign-Off",
    invoice_send: "Send Invoice",
    ballpark_send: "Send Ballpark Estimate",
  };
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Approval Required</h2>
      <p style="color: #555; font-size: 14px;">A team member has submitted a request that needs your approval:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Action</td><td style="padding: 8px; color: #555; border-bottom: 1px solid #eee;">${actionLabels[params.actionType] || params.actionType}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Details</td><td style="padding: 8px; color: #555; border-bottom: 1px solid #eee;">${params.summary}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #333; border-bottom: 1px solid #eee;">Reference</td><td style="padding: 8px; color: #555; border-bottom: 1px solid #eee;">${params.targetRef}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #333;">Requested By</td><td style="padding: 8px; color: #555;">${params.requestedBy}</td></tr>
      </table>
      <p style="color: #555; font-size: 14px;">Log in to Cabinetry Command to approve or reject this request.</p>
      <a href="https://www.cabinetrycommand.com/admin/approvals" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; margin-top: 8px;">Review Approvals</a>
    </div>
  `;
}
