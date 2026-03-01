
-- =============================================
-- PHASE 2A: Config tables
-- =============================================

-- Department Config
CREATE TABLE public.department_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  minimum_staff_required_per_day integer NOT NULL DEFAULT 1,
  maximum_staff_off_per_day integer NOT NULL DEFAULT 2,
  coverage_warning_mode text NOT NULL DEFAULT 'warn',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.department_config ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_department_config_tenant ON public.department_config(tenant_id);
CREATE TRIGGER update_department_config_updated_at BEFORE UPDATE ON public.department_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_tenant_id_department_config BEFORE INSERT ON public.department_config FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

CREATE POLICY "Users can view tenant department config"
ON public.department_config FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant department config"
ON public.department_config FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Stage Config
CREATE TABLE public.stage_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  stage_name text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  required_skills text[] DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, stage_name)
);

ALTER TABLE public.stage_config ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_stage_config_tenant ON public.stage_config(tenant_id);
CREATE TRIGGER update_stage_config_updated_at BEFORE UPDATE ON public.stage_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_tenant_id_stage_config BEFORE INSERT ON public.stage_config FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

CREATE POLICY "Users can view tenant stage config"
ON public.stage_config FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant stage config"
ON public.stage_config FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Machine Config
CREATE TABLE public.machine_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  department text NOT NULL DEFAULT 'CNC',
  active boolean NOT NULL DEFAULT true,
  default_available_hours_per_day numeric NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.machine_config ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_machine_config_tenant ON public.machine_config(tenant_id);
CREATE TRIGGER update_machine_config_updated_at BEFORE UPDATE ON public.machine_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_tenant_id_machine_config BEFORE INSERT ON public.machine_config FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

CREATE POLICY "Users can view tenant machine config"
ON public.machine_config FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant machine config"
ON public.machine_config FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Feature Flags
CREATE TABLE public.tenant_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  flag_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, flag_name)
);

ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tenant_feature_flags_tenant ON public.tenant_feature_flags(tenant_id);
CREATE TRIGGER update_tenant_feature_flags_updated_at BEFORE UPDATE ON public.tenant_feature_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_tenant_id_tenant_feature_flags BEFORE INSERT ON public.tenant_feature_flags FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

CREATE POLICY "Users can view tenant feature flags"
ON public.tenant_feature_flags FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant feature flags"
ON public.tenant_feature_flags FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- =============================================
-- PHASE 2B: Seed default config for Enclave
-- =============================================

-- Departments
INSERT INTO public.department_config (tenant_id, name, minimum_staff_required_per_day, maximum_staff_off_per_day) VALUES
  ('00000000-0000-0000-0000-000000000001', 'CNC', 2, 1),
  ('00000000-0000-0000-0000-000000000001', 'Assembly', 2, 2),
  ('00000000-0000-0000-0000-000000000001', 'Spray', 1, 1),
  ('00000000-0000-0000-0000-000000000001', 'Install', 1, 2),
  ('00000000-0000-0000-0000-000000000001', 'Office', 1, 2);

-- Stages (matching existing workflow board)
INSERT INTO public.stage_config (tenant_id, stage_name, order_index) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Not Started', 0),
  ('00000000-0000-0000-0000-000000000001', 'In Progress', 1),
  ('00000000-0000-0000-0000-000000000001', 'Blocked', 2),
  ('00000000-0000-0000-0000-000000000001', 'Done', 3);

-- Feature flags (all enabled for internal tenant)
INSERT INTO public.tenant_feature_flags (tenant_id, flag_name, enabled) VALUES
  ('00000000-0000-0000-0000-000000000001', 'enable_qr_tracking', true),
  ('00000000-0000-0000-0000-000000000001', 'enable_remnants', true),
  ('00000000-0000-0000-0000-000000000001', 'enable_hr_cases', true),
  ('00000000-0000-0000-0000-000000000001', 'enable_drive_integration', true),
  ('00000000-0000-0000-0000-000000000001', 'enable_notifications', true);
