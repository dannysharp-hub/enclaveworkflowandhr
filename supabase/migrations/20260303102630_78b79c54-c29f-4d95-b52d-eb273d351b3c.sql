
-- AI Proposals table
CREATE TABLE public.ai_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  proposal_type text NOT NULL DEFAULT 'general',
  scope_type text NOT NULL DEFAULT 'job' CHECK (scope_type IN ('job', 'portfolio')),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  impact_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  requires_role text NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'expired')),
  auto_apply_allowed boolean NOT NULL DEFAULT false,
  reasoning_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'ai_engine',
  expires_at timestamptz
);

-- AI Proposal Actions (audit trail)
CREATE TABLE public.ai_proposal_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  proposal_id uuid NOT NULL REFERENCES public.ai_proposals(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('approved', 'rejected', 'edited', 'applied', 'deferred')),
  acted_by_staff_id text,
  edited_payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- AI Proposal Metrics (aggregate tracking)
CREATE TABLE public.ai_proposal_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  proposal_type text NOT NULL,
  total_proposed integer NOT NULL DEFAULT 0,
  total_approved integer NOT NULL DEFAULT 0,
  total_rejected integer NOT NULL DEFAULT 0,
  total_applied_success integer NOT NULL DEFAULT 0,
  avg_confidence numeric(3,2) NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, proposal_type)
);

-- Tenant ID auto-set triggers
CREATE TRIGGER set_ai_proposals_tenant BEFORE INSERT ON public.ai_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE TRIGGER set_ai_proposal_actions_tenant BEFORE INSERT ON public.ai_proposal_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE TRIGGER set_ai_proposal_metrics_tenant BEFORE INSERT ON public.ai_proposal_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- Updated_at triggers
CREATE TRIGGER update_ai_proposal_metrics_updated_at BEFORE UPDATE ON public.ai_proposal_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.ai_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_proposal_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_proposal_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_proposals
CREATE POLICY "Tenant users can view proposals" ON public.ai_proposals
  FOR SELECT TO authenticated
  USING (public.is_user_tenant(tenant_id));

CREATE POLICY "Tenant admins can insert proposals" ON public.ai_proposals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE POLICY "Tenant admins can update proposals" ON public.ai_proposals
  FOR UPDATE TO authenticated
  USING (public.is_user_tenant(tenant_id));

-- RLS for ai_proposal_actions
CREATE POLICY "Tenant users can view actions" ON public.ai_proposal_actions
  FOR SELECT TO authenticated
  USING (public.is_user_tenant(tenant_id));

CREATE POLICY "Tenant users can insert actions" ON public.ai_proposal_actions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_user_tenant(tenant_id));

-- RLS for ai_proposal_metrics
CREATE POLICY "Tenant users can view metrics" ON public.ai_proposal_metrics
  FOR SELECT TO authenticated
  USING (public.is_user_tenant(tenant_id));

CREATE POLICY "Tenant users can upsert metrics" ON public.ai_proposal_metrics
  FOR INSERT TO authenticated
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE POLICY "Tenant users can update metrics" ON public.ai_proposal_metrics
  FOR UPDATE TO authenticated
  USING (public.is_user_tenant(tenant_id));

-- Enable realtime for proposals
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_proposals;
