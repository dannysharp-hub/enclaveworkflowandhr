import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Brain, CheckCircle2, XCircle, Clock, Shield, TrendingUp, TrendingDown,
  AlertTriangle, Filter, Search, ChevronDown, ChevronUp, Zap, BarChart3,
  Target, Sparkles, FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface AiProposal {
  id: string;
  tenant_id: string;
  proposal_type: string;
  scope_type: string;
  job_id: string | null;
  title: string;
  description: string;
  impact_summary_json: Record<string, any>;
  confidence_score: number;
  risk_level: string;
  requires_role: string;
  status: string;
  auto_apply_allowed: boolean;
  reasoning_json: Record<string, any>;
  created_at: string;
  created_by: string;
  expires_at: string | null;
}

const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  quote_margin_adjustment: "Margin Adjustment",
  quote_time_adjustment: "Labour Estimate",
  capacity_warning: "Capacity Warning",
  schedule_reorder: "Schedule Reorder",
  nesting_dimension_tweak: "Nesting Tweak",
  remnant_allocation: "Remnant Allocation",
  quote_capacity_risk: "Quote Capacity Risk",
};

const RISK_CONFIG: Record<string, { color: string; icon: typeof AlertTriangle }> = {
  low: { color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: Shield },
  medium: { color: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: AlertTriangle },
  high: { color: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertTriangle },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: "bg-amber-500/10 text-amber-600 border-amber-500/30", label: "Pending" },
  approved: { color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", label: "Approved" },
  rejected: { color: "bg-destructive/10 text-destructive border-destructive/30", label: "Rejected" },
  applied: { color: "bg-primary/10 text-primary border-primary/30", label: "Applied" },
  expired: { color: "bg-muted text-muted-foreground border-border", label: "Expired" },
};

export default function AiInboxPage() {
  const { userRole, tenantId } = useAuth();
  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [metrics, setMetrics] = useState<any[]>([]);

  const canApprove = userRole === "admin" || userRole === "supervisor";

  const fetchProposals = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let query = supabase
      .from("ai_proposals")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (filterStatus !== "all") query = query.eq("status", filterStatus);
    if (filterScope !== "all") query = query.eq("scope_type", filterScope);
    if (filterRisk !== "all") query = query.eq("risk_level", filterRisk);
    if (filterType !== "all") query = query.eq("proposal_type", filterType);

    const { data, error } = await query;
    if (error) {
      toast({ title: "Error loading proposals", description: error.message, variant: "destructive" });
    } else {
      setProposals((data as any[]) || []);
    }
    setLoading(false);
  }, [tenantId, filterStatus, filterScope, filterRisk, filterType]);

  const fetchMetrics = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("ai_proposal_metrics")
      .select("*")
      .eq("tenant_id", tenantId);
    setMetrics((data as any[]) || []);
  }, [tenantId]);

  useEffect(() => { fetchProposals(); fetchMetrics(); }, [fetchProposals, fetchMetrics]);

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("ai-proposals-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_proposals" }, () => {
        fetchProposals();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchProposals]);

  const handleAction = async (proposalId: string, actionType: "approved" | "rejected" | "deferred", reason?: string) => {
    const { error: actionErr } = await supabase.from("ai_proposal_actions").insert({
      tenant_id: tenantId!,
      proposal_id: proposalId,
      action_type: actionType,
      acted_by_staff_id: userRole || "unknown",
      edited_payload_json: reason ? { reason } : null,
    } as any);

    if (actionErr) {
      toast({ title: "Error logging action", description: actionErr.message, variant: "destructive" });
      return;
    }

    const newStatus = actionType === "deferred" ? "pending" : actionType;
    const { error: updateErr } = await supabase
      .from("ai_proposals")
      .update({ status: newStatus } as any)
      .eq("id", proposalId);

    if (updateErr) {
      toast({ title: "Error updating proposal", description: updateErr.message, variant: "destructive" });
    } else {
      toast({ title: `Proposal ${actionType}`, description: actionType === "approved" ? "Proposal approved and logged." : actionType === "rejected" ? "Proposal rejected." : "Proposal deferred." });
      fetchProposals();
    }
  };

  const filtered = proposals.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = proposals.filter(p => p.status === "pending").length;
  const highRiskCount = proposals.filter(p => p.status === "pending" && p.risk_level === "high").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground flex items-center gap-2">
            <Brain className="text-primary" size={28} />
            AI Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review AI-generated proposals. Approve, reject, or defer decisions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <Badge variant="secondary" className="px-3 py-1 text-sm">
              <Clock size={14} className="mr-1" /> {pendingCount} pending
            </Badge>
          )}
          {highRiskCount > 0 && (
            <Badge variant="destructive" className="px-3 py-1 text-sm">
              <AlertTriangle size={14} className="mr-1" /> {highRiskCount} high risk
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="metrics">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search proposals..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterScope} onValueChange={setFilterScope}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Scope" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Scopes</SelectItem>
                    <SelectItem value="job">Job</SelectItem>
                    <SelectItem value="portfolio">Portfolio</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterRisk} onValueChange={setFilterRisk}>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="Risk" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Risk</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="quote_margin_adjustment">Margin Adj.</SelectItem>
                    <SelectItem value="quote_time_adjustment">Labour Est.</SelectItem>
                    <SelectItem value="capacity_warning">Capacity Warning</SelectItem>
                    <SelectItem value="quote_capacity_risk">Quote Cap. Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Proposals list */}
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Sparkles size={40} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-lg font-medium text-foreground">No proposals found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {filterStatus === "pending" ? "All caught up! No pending proposals." : "Try adjusting your filters."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map(p => {
                const expanded = expandedId === p.id;
                const riskCfg = RISK_CONFIG[p.risk_level] || RISK_CONFIG.medium;
                const statusCfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
                const RiskIcon = riskCfg.icon;
                const impact = p.impact_summary_json || {};

                return (
                  <Card key={p.id} className={cn("transition-all", p.risk_level === "high" && p.status === "pending" && "border-destructive/40")}>
                    <CardContent className="p-4">
                      {/* Header row */}
                      <div className="flex items-start gap-3">
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", riskCfg.color)}>
                          <RiskIcon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-foreground">{p.title}</h3>
                            <Badge variant="outline" className={statusCfg.color}>{statusCfg.label}</Badge>
                            <Badge variant="outline" className="text-xs">
                              {PROPOSAL_TYPE_LABELS[p.proposal_type] || p.proposal_type}
                            </Badge>
                            {p.scope_type === "portfolio" && (
                              <Badge variant="secondary" className="text-xs">Portfolio</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Target size={12} />
                              Confidence: {Math.round(Number(p.confidence_score) * 100)}%
                            </span>
                            <span className="flex items-center gap-1">
                              <RiskIcon size={12} />
                              {p.risk_level} risk
                            </span>
                            {p.job_id && <span>Job: {p.job_id.slice(0, 8)}…</span>}
                            <span>{format(new Date(p.created_at), "dd MMM yyyy HH:mm")}</span>
                          </div>

                          {/* Impact summary chips */}
                          {Object.keys(impact).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {Object.entries(impact).map(([k, v]) => (
                                <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-mono">
                                  {k.replace(/_/g, " ")}: <strong>{typeof v === "number" ? (k.includes("percent") ? `${v}%` : v) : String(v)}</strong>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button onClick={() => setExpandedId(expanded ? null : p.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                      </div>

                      {/* Expanded detail */}
                      {expanded && (
                        <div className="mt-4 pt-4 border-t border-border space-y-4">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1">
                              <FileText size={14} /> Description
                            </h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.description}</p>
                          </div>

                          {p.reasoning_json && Object.keys(p.reasoning_json).length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1">
                                <Brain size={14} /> Reasoning
                              </h4>
                              <div className="bg-muted/50 rounded-md p-3 text-xs font-mono space-y-1">
                                {Object.entries(p.reasoning_json).map(([k, v]) => (
                                  <div key={k}>
                                    <span className="text-muted-foreground">{k}:</span>{" "}
                                    <span className="text-foreground">{Array.isArray(v) ? v.join(", ") : String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          {p.status === "pending" && canApprove && (
                            <div className="flex items-center gap-2 pt-2">
                              <Button size="sm" onClick={() => handleAction(p.id, "approved")} className="gap-1">
                                <CheckCircle2 size={14} /> Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => { setRejectingId(p.id); setRejectDialogOpen(true); }} className="gap-1">
                                <XCircle size={14} /> Reject
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleAction(p.id, "deferred")} className="gap-1">
                                <Clock size={14} /> Defer
                              </Button>
                            </div>
                          )}
                          {p.status === "pending" && !canApprove && (
                            <p className="text-xs text-muted-foreground italic">
                              Approval requires {p.requires_role} role.
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="p-12 text-center">
                  <BarChart3 size={40} className="mx-auto text-muted-foreground mb-3" />
                  <p className="text-lg font-medium">No metrics yet</p>
                  <p className="text-sm text-muted-foreground">Metrics will populate as proposals are created and actioned.</p>
                </CardContent>
              </Card>
            ) : (
              metrics.map(m => {
                const approvalRate = m.total_proposed > 0 ? Math.round((m.total_approved / m.total_proposed) * 100) : 0;
                return (
                  <Card key={m.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-mono">
                        {PROPOSAL_TYPE_LABELS[m.proposal_type] || m.proposal_type}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Proposed</span>
                        <span className="font-mono font-bold">{m.total_proposed}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Approved</span>
                        <span className="font-mono font-bold text-emerald-600">{m.total_approved}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Approval Rate</span>
                        <span className="font-mono font-bold">{approvalRate}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Avg Confidence</span>
                        <span className="font-mono font-bold">{Math.round(Number(m.avg_confidence) * 100)}%</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Proposal</DialogTitle>
            <DialogDescription>Optionally provide a reason for rejection.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason (optional)..."
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (rejectingId) handleAction(rejectingId, "rejected", rejectReason || undefined);
              setRejectDialogOpen(false);
              setRejectReason("");
              setRejectingId(null);
            }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
