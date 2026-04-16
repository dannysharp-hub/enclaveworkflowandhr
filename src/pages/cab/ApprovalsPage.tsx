import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Clock, FileText, Send, ClipboardCheck, Banknote, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ACTION_LABELS: Record<string, string> = {
  job_edit: "Job Edit",
  quote_send: "Send Quote",
  design_signoff_send: "Design Sign-Off",
  invoice_send: "Send Invoice",
};

const ACTION_ICONS: Record<string, typeof Pencil> = {
  job_edit: Pencil,
  quote_send: Send,
  design_signoff_send: ClipboardCheck,
  invoice_send: Banknote,
};

export default function ApprovalsPage() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const isAdmin = userRole === "admin";

  const load = useCallback(async () => {
    const query = (supabase.from("cab_approval_requests") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filter === "pending") {
      query.eq("status", "pending");
    }

    const { data } = await query;
    setRequests(data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (req: any) => {
    if (!isAdmin) return;
    setProcessing(req.id);
    try {
      await (supabase.from("cab_approval_requests") as any)
        .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", req.id);

      // Apply the action
      await applyApprovedAction(req);

      // Notify the requester
      await supabase.from("notifications").insert({
        user_id: req.requested_by,
        title: "Request Approved",
        message: `Your request "${req.summary}" has been approved.`,
        type: "success",
        link: req.target_ref ? `/admin/jobs/${req.target_ref}` : null,
      });

      toast({ title: "Approved", description: req.summary });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (req: any) => {
    if (!isAdmin || !rejectReason.trim()) {
      toast({ title: "Please enter a reason", variant: "destructive" });
      return;
    }
    setProcessing(req.id);
    try {
      await (supabase.from("cab_approval_requests") as any)
        .update({
          status: "rejected",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectReason.trim(),
        })
        .eq("id", req.id);

      // Notify the requester
      await supabase.from("notifications").insert({
        user_id: req.requested_by,
        title: "Request Rejected",
        message: `Your request "${req.summary}" was rejected. Reason: ${rejectReason.trim()}`,
        type: "warning",
        link: req.target_ref ? `/admin/jobs/${req.target_ref}` : null,
      });

      toast({ title: "Rejected", description: req.summary });
      setRejectingId(null);
      setRejectReason("");
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const applyApprovedAction = async (req: any) => {
    const payload = req.payload_json || {};

    switch (req.action_type) {
      case "job_edit": {
        // Apply the stored field changes
        if (payload.table === "cab_customers" && payload.customerId) {
          await (supabase.from("cab_customers") as any)
            .update(payload.changes)
            .eq("id", payload.customerId);
        } else {
          await (supabase.from("cab_jobs") as any)
            .update(payload.changes || {})
            .eq("id", req.target_id);
        }
        break;
      }
      case "quote_send": {
        // The quote send action was deferred — invoke the actual send now
        // We store the quote_id in payload; trigger quote status update
        if (payload.quote_id) {
          await (supabase.from("cab_quotes") as any)
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              price_min: payload.price_min,
              price_max: payload.price_max,
              scope_markdown: payload.scope_markdown,
              scope_summary: payload.scope_summary,
              terms_markdown: payload.terms_markdown,
            })
            .eq("id", payload.quote_id);

          // Save items if provided
          if (payload.items?.length > 0) {
            await (supabase.from("cab_quote_items") as any).delete().eq("quote_id", payload.quote_id);
            await (supabase.from("cab_quote_items") as any).insert(payload.items);
          }

          // Update job state
          const nextAction = new Date();
          nextAction.setDate(nextAction.getDate() + 7);
          await (supabase.from("cab_jobs") as any).update({
            status: "quoted",
            state: "awaiting_quote_acceptance",
            current_stage_key: "quote_sent",
            estimated_next_action_at: nextAction.toISOString(),
          }).eq("id", req.target_id);

          // Save quote PDF to Drive (fire-and-forget)
          supabase.functions.invoke("save-quote-to-drive", {
            body: { quote_id: payload.quote_id, job_id: req.target_id },
          }).catch(() => {});
        }
        break;
      }
      case "design_signoff_send": {
        const now = new Date().toISOString();
        await (supabase.from("cab_jobs") as any).update({
          customer_signoff_at: now,
          current_stage_key: "design_signed_off",
        }).eq("id", req.target_id);

        if (payload.company_id) {
          await (supabase.from("cab_events") as any).insert({
            company_id: payload.company_id,
            event_type: "design.signed_off",
            job_id: req.target_id,
            payload_json: { signed_at: now },
            status: "pending",
          });
        }

        // Fire document generation
        supabase.functions.invoke("generate-document-from-template", {
          body: { job_id: req.target_id, template_type: "sign_off" },
        }).catch(() => {});
        break;
      }
      case "invoice_send": {
        // Handle deposit received + invoice
        if (payload.deposit_amount && payload.company_id) {
          await (supabase.from("cab_jobs") as any).update({
            current_stage_key: "project_confirmed",
            state: "active_production",
            status: "active",
            updated_at: new Date().toISOString(),
          }).eq("id", req.target_id);

          await (supabase.from("cab_invoices") as any).insert({
            company_id: payload.company_id,
            job_id: req.target_id,
            milestone: "deposit",
            reference: (req.target_ref || "") + "_DEP",
            amount: payload.deposit_amount,
            currency: "GBP",
            status: "paid",
            issued_at: new Date().toISOString(),
            paid_at: new Date().toISOString(),
            payment_method: "bank_transfer",
          });

          await (supabase.from("cab_events") as any).insert({
            company_id: payload.company_id,
            event_type: "deposit.received",
            job_id: req.target_id,
            payload_json: { amount: payload.deposit_amount, job_ref: req.target_ref },
            status: "pending",
          });
        }

        // Handle mark complete + final invoice
        if (payload.mark_complete && payload.company_id) {
          await (supabase.from("cab_jobs") as any).update({
            status: "complete",
            production_stage_key: "complete",
            production_stage: "complete",
            updated_at: new Date().toISOString(),
          }).eq("id", req.target_id);

          await (supabase.from("cab_events") as any).insert({
            company_id: payload.company_id,
            event_type: "job.completed",
            job_id: req.target_id,
            payload_json: {},
            status: "pending",
          });
        }

        // Re-trigger invoice generation from template
        if (payload.template_type && payload.company_id) {
          await (supabase.from("cab_events") as any).insert({
            company_id: payload.company_id,
            event_type: payload.event_type || "invoice.requested",
            job_id: req.target_id,
            payload_json: {},
            status: "pending",
          });
          supabase.functions.invoke("generate-document-from-template", {
            body: { job_id: req.target_id, template_type: payload.template_type },
          }).catch(() => {});

          // Also generate fitter form for final invoice
          if (payload.template_type === "invoice_final") {
            supabase.functions.invoke("generate-document-from-template", {
              body: { job_id: req.target_id, template_type: "fitter_form" },
            }).catch(() => {});
          }
        }
        break;
      }
    }
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono font-bold text-foreground">Approvals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? "Review and manage pending approval requests" : "Track your submitted approval requests"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => setFilter("pending")}
          >
            <Clock size={12} /> Pending {pendingCount > 0 && `(${pendingCount})`}
          </Button>
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            <FileText size={12} /> All
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <CheckCircle2 size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            {filter === "pending" ? "No pending approvals" : "No approval requests found"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const Icon = ACTION_ICONS[req.action_type] || FileText;
            const isPending = req.status === "pending";
            const isRejecting = rejectingId === req.id;

            return (
              <div
                key={req.id}
                className={`rounded-lg border bg-card p-4 space-y-3 ${
                  isPending ? "border-primary/30" : req.status === "rejected" ? "border-destructive/20" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded ${isPending ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Icon size={14} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{req.summary}</span>
                        <Badge variant={isPending ? "secondary" : req.status === "approved" ? "default" : "destructive"} className="text-[10px]">
                          {req.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span>{ACTION_LABELS[req.action_type]}</span>
                        {req.target_ref && (
                          <button
                            onClick={() => navigate(`/admin/jobs/${req.target_ref}`)}
                            className="text-primary hover:underline"
                          >
                            {req.target_ref}
                          </button>
                        )}
                        <span>{format(new Date(req.created_at), "dd MMM yyyy HH:mm")}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Show payload details */}
                {req.payload_json && req.action_type === "job_edit" && req.payload_json.changes && (
                  <div className="bg-muted/50 rounded p-2 text-xs space-y-1">
                    <span className="font-medium text-foreground">Proposed changes:</span>
                    {Object.entries(req.payload_json.changes).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-mono text-foreground">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rejection reason */}
                {req.status === "rejected" && req.rejection_reason && (
                  <div className="bg-destructive/5 border border-destructive/20 rounded p-2 text-xs text-destructive">
                    Rejected: {req.rejection_reason}
                  </div>
                )}

                {/* Admin approve/reject actions */}
                {isPending && isAdmin && (
                  <div className="flex items-center gap-2">
                    {isRejecting ? (
                      <div className="flex-1 flex items-center gap-2">
                        <Input
                          placeholder="Reason for rejection..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="text-xs h-8 flex-1"
                          autoFocus
                        />
                        <Button size="sm" variant="destructive" onClick={() => handleReject(req)} disabled={processing === req.id}>
                          Reject
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => handleApprove(req)} disabled={processing === req.id}>
                          <CheckCircle2 size={12} /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectingId(req.id)} disabled={processing === req.id}>
                          <XCircle size={12} /> Reject
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
