
-- ══════════════════════════════════════════════════════════════
-- PART 1: CLIENT PORTAL TABLES
-- ══════════════════════════════════════════════════════════════

-- Client Portal Settings (per-tenant)
CREATE TABLE public.client_portal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  enable_client_portal boolean NOT NULL DEFAULT false,
  show_production_readiness boolean NOT NULL DEFAULT false,
  allow_snag_submission boolean NOT NULL DEFAULT true,
  allow_remote_signoff boolean NOT NULL DEFAULT false,
  show_financial_info boolean NOT NULL DEFAULT false,
  portal_branding jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.client_portal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage portal settings"
  ON public.client_portal_settings FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view portal settings"
  ON public.client_portal_settings FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Client Users (linked to auth.users via user_id, NOT storing password_hash)
CREATE TABLE public.client_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  client_role text NOT NULL DEFAULT 'primary',
  active boolean NOT NULL DEFAULT true,
  portal_access_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client users"
  ON public.client_users FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

CREATE POLICY "Client users can view own record"
  ON public.client_users FOR SELECT
  USING (user_id = auth.uid());

-- Client Access Tokens (invite links)
CREATE TABLE public.client_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid REFERENCES public.jobs(id),
  client_user_id uuid NOT NULL REFERENCES public.client_users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage access tokens"
  ON public.client_access_tokens FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

-- Client Activity Log
CREATE TABLE public.client_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  client_user_id uuid NOT NULL REFERENCES public.client_users(id),
  action text NOT NULL,
  job_id uuid REFERENCES public.jobs(id),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity log"
  ON public.client_activity_log FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

CREATE POLICY "Client can insert own activity"
  ON public.client_activity_log FOR INSERT
  WITH CHECK (client_user_id IN (SELECT id FROM public.client_users WHERE user_id = auth.uid()));

CREATE POLICY "Client can view own activity"
  ON public.client_activity_log FOR SELECT
  USING (client_user_id IN (SELECT id FROM public.client_users WHERE user_id = auth.uid()));

-- Client-visible job documents junction
CREATE TABLE public.client_job_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  file_asset_id uuid NOT NULL REFERENCES public.file_assets(id),
  visible_to_client boolean NOT NULL DEFAULT true,
  shared_at timestamptz NOT NULL DEFAULT now(),
  shared_by uuid REFERENCES auth.users(id),
  UNIQUE(job_id, file_asset_id)
);

ALTER TABLE public.client_job_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client documents"
  ON public.client_job_documents FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

CREATE POLICY "Client can view shared documents"
  ON public.client_job_documents FOR SELECT
  USING (
    visible_to_client = true AND
    job_id IN (
      SELECT j.id FROM public.jobs j
      JOIN public.customers c ON c.id = (SELECT customer_id FROM public.job_financials WHERE job_id = j.id LIMIT 1)
      JOIN public.client_users cu ON cu.customer_id = c.id
      WHERE cu.user_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- PART 2: SMART QUOTING TABLES
-- ══════════════════════════════════════════════════════════════

-- Job Performance Snapshots (auto-created on job completion)
CREATE TABLE public.job_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) UNIQUE,
  job_type text NOT NULL DEFAULT 'general',
  total_revenue_ex_vat numeric NOT NULL DEFAULT 0,
  material_cost numeric NOT NULL DEFAULT 0,
  labour_cost numeric NOT NULL DEFAULT 0,
  external_cost numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  cnc_hours numeric NOT NULL DEFAULT 0,
  assembly_hours numeric NOT NULL DEFAULT 0,
  install_hours numeric NOT NULL DEFAULT 0,
  total_machine_hours numeric NOT NULL DEFAULT 0,
  total_labour_hours numeric NOT NULL DEFAULT 0,
  sheets_used integer NOT NULL DEFAULT 0,
  sheets_scrapped integer NOT NULL DEFAULT 0,
  margin_percent numeric NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant snapshots"
  ON public.job_performance_snapshots FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage snapshots"
  ON public.job_performance_snapshots FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

-- Quote Templates
CREATE TABLE public.quote_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  job_type text NOT NULL DEFAULT 'general',
  base_material_markup_percent numeric NOT NULL DEFAULT 15,
  base_labour_markup_percent numeric NOT NULL DEFAULT 20,
  base_overhead_percent numeric NOT NULL DEFAULT 10,
  target_margin_percent numeric NOT NULL DEFAULT 25,
  hourly_rate numeric NOT NULL DEFAULT 35,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant templates"
  ON public.quote_templates FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage templates"
  ON public.quote_templates FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

-- Smart Quotes
CREATE TABLE public.smart_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  template_id uuid REFERENCES public.quote_templates(id),
  customer_id uuid REFERENCES public.customers(id),
  job_type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  estimated_sheets integer NOT NULL DEFAULT 0,
  estimated_cnc_sheets integer NOT NULL DEFAULT 0,
  assembly_complexity text NOT NULL DEFAULT 'medium',
  estimated_install_days numeric NOT NULL DEFAULT 1,
  special_factors jsonb NOT NULL DEFAULT '{}',
  material_estimate numeric NOT NULL DEFAULT 0,
  labour_estimate numeric NOT NULL DEFAULT 0,
  external_estimate numeric NOT NULL DEFAULT 0,
  overhead_estimate numeric NOT NULL DEFAULT 0,
  suggested_quote_value numeric NOT NULL DEFAULT 0,
  suggested_deposit numeric NOT NULL DEFAULT 0,
  target_margin_percent numeric NOT NULL DEFAULT 0,
  margin_sensitivity jsonb NOT NULL DEFAULT '{}',
  historical_confidence numeric DEFAULT 0,
  use_historical_data boolean NOT NULL DEFAULT true,
  converted_job_id uuid REFERENCES public.jobs(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.smart_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant quotes"
  ON public.smart_quotes FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage quotes"
  ON public.smart_quotes FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role) OR has_role(auth.uid(), 'engineer'::app_role)));

-- Trigger: updated_at
CREATE TRIGGER set_updated_at_client_portal_settings BEFORE UPDATE ON public.client_portal_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_client_users BEFORE UPDATE ON public.client_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_quote_templates BEFORE UPDATE ON public.quote_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_smart_quotes BEFORE UPDATE ON public.smart_quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tenant ID auto-set triggers
CREATE TRIGGER set_tenant_client_portal_settings BEFORE INSERT ON public.client_portal_settings FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_client_users BEFORE INSERT ON public.client_users FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_client_access_tokens BEFORE INSERT ON public.client_access_tokens FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_client_activity_log BEFORE INSERT ON public.client_activity_log FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_client_job_documents BEFORE INSERT ON public.client_job_documents FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_job_performance_snapshots BEFORE INSERT ON public.job_performance_snapshots FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_quote_templates BEFORE INSERT ON public.quote_templates FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_smart_quotes BEFORE INSERT ON public.smart_quotes FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
