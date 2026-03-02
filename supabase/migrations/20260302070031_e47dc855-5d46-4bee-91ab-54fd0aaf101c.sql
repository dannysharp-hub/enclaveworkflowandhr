
-- =============================================
-- CAPACITY & SCHEDULING ENGINE
-- =============================================

-- 1. Stage capacity configuration (per tenant)
CREATE TABLE public.stage_capacity_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  stage_name text NOT NULL,
  daily_available_hours numeric NOT NULL DEFAULT 8,
  max_concurrent_jobs integer NOT NULL DEFAULT 3,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, stage_name)
);

ALTER TABLE public.stage_capacity_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant stage capacity" ON public.stage_capacity_config
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor')));

CREATE POLICY "Users can view tenant stage capacity" ON public.stage_capacity_config
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- 2. Production schedule (job allocations to stages on dates)
CREATE TABLE public.production_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  scheduled_date date NOT NULL,
  planned_hours numeric NOT NULL DEFAULT 0,
  actual_hours numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'scheduled',
  assigned_staff_ids uuid[] DEFAULT '{}'::uuid[],
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisors can manage tenant schedule" ON public.production_schedule
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'office')));

CREATE POLICY "Users can view tenant schedule" ON public.production_schedule
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE INDEX idx_production_schedule_date ON public.production_schedule(tenant_id, scheduled_date);
CREATE INDEX idx_production_schedule_job ON public.production_schedule(tenant_id, job_id);

-- 3. Job acceptance simulations (saved what-if scenarios)
CREATE TABLE public.capacity_simulations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  simulation_name text NOT NULL DEFAULT 'Untitled',
  job_description text,
  job_type text,
  sheet_count integer NOT NULL DEFAULT 0,
  planned_cnc_hours numeric NOT NULL DEFAULT 0,
  planned_assembly_hours numeric NOT NULL DEFAULT 0,
  planned_spray_hours numeric NOT NULL DEFAULT 0,
  planned_install_hours numeric NOT NULL DEFAULT 0,
  quote_value numeric NOT NULL DEFAULT 0,
  estimated_margin_percent numeric NOT NULL DEFAULT 0,
  target_start_date date,
  target_end_date date,
  capacity_impact_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_assessment text NOT NULL DEFAULT 'low',
  delivery_date_prediction date,
  cashflow_impact numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capacity_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant simulations" ON public.capacity_simulations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'office')));

CREATE POLICY "Users can view tenant simulations" ON public.capacity_simulations
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER set_stage_capacity_config_updated_at BEFORE UPDATE ON public.stage_capacity_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_production_schedule_updated_at BEFORE UPDATE ON public.production_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
