
-- Stage Time Baselines
CREATE TABLE public.stage_time_baselines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_type text NOT NULL DEFAULT 'general',
  stage_name text NOT NULL,
  avg_hours numeric NOT NULL DEFAULT 0,
  avg_hours_per_sheet numeric DEFAULT NULL,
  avg_hours_per_unit numeric DEFAULT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  confidence_score integer NOT NULL DEFAULT 0,
  last_updated timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, job_type, stage_name)
);
ALTER TABLE public.stage_time_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant baselines" ON public.stage_time_baselines FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant baselines" ON public.stage_time_baselines FOR ALL USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office')));

-- Job Time Plans
CREATE TABLE public.job_time_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) UNIQUE,
  planned_cnc_hours numeric NOT NULL DEFAULT 0,
  planned_assembly_hours numeric NOT NULL DEFAULT 0,
  planned_spray_hours numeric NOT NULL DEFAULT 0,
  planned_install_hours numeric NOT NULL DEFAULT 0,
  planned_total_hours numeric NOT NULL DEFAULT 0,
  planned_machine_hours numeric NOT NULL DEFAULT 0,
  based_on_baseline boolean NOT NULL DEFAULT false,
  plan_created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.job_time_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant time plans" ON public.job_time_plans FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant time plans" ON public.job_time_plans FOR ALL USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office') OR has_role(auth.uid(), 'supervisor')));

-- Job Time Actuals
CREATE TABLE public.job_time_actuals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) UNIQUE,
  actual_cnc_hours numeric NOT NULL DEFAULT 0,
  actual_assembly_hours numeric NOT NULL DEFAULT 0,
  actual_spray_hours numeric NOT NULL DEFAULT 0,
  actual_install_hours numeric NOT NULL DEFAULT 0,
  actual_total_hours numeric NOT NULL DEFAULT 0,
  last_updated timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.job_time_actuals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant time actuals" ON public.job_time_actuals FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Workers can manage tenant time actuals" ON public.job_time_actuals FOR ALL USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'engineer') OR has_role(auth.uid(), 'operator')));

-- Job Drift Status
CREATE TABLE public.job_drift_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) UNIQUE,
  drift_status text NOT NULL DEFAULT 'on_track',
  cnc_variance_hours numeric NOT NULL DEFAULT 0,
  cnc_variance_percent numeric NOT NULL DEFAULT 0,
  assembly_variance_percent numeric NOT NULL DEFAULT 0,
  spray_variance_percent numeric NOT NULL DEFAULT 0,
  install_variance_percent numeric NOT NULL DEFAULT 0,
  total_variance_percent numeric NOT NULL DEFAULT 0,
  primary_overrun_stage text DEFAULT NULL,
  last_evaluated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.job_drift_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant drift status" ON public.job_drift_status FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "System can manage tenant drift status" ON public.job_drift_status FOR ALL USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office') OR has_role(auth.uid(), 'supervisor')));

-- Drift Reasons
CREATE TABLE public.drift_reasons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  stage_name text NOT NULL,
  reason_category text NOT NULL DEFAULT 'other',
  notes text DEFAULT NULL,
  logged_by uuid DEFAULT NULL,
  logged_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.drift_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant drift reasons" ON public.drift_reasons FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Supervisors can manage tenant drift reasons" ON public.drift_reasons FOR ALL USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor')));

-- Drift Settings (tenant-level config)
CREATE TABLE public.drift_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) UNIQUE,
  warning_threshold_percent numeric NOT NULL DEFAULT 10,
  critical_threshold_percent numeric NOT NULL DEFAULT 20,
  minimum_margin_threshold_percent numeric NOT NULL DEFAULT 15,
  use_drift_adjustment_in_quoting boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.drift_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant drift settings" ON public.drift_settings FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant drift settings" ON public.drift_settings FOR ALL USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- Tenant-id auto-set triggers
CREATE TRIGGER set_tenant_id_stage_time_baselines BEFORE INSERT ON public.stage_time_baselines FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_tenant_id_job_time_plans BEFORE INSERT ON public.job_time_plans FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_tenant_id_job_time_actuals BEFORE INSERT ON public.job_time_actuals FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_tenant_id_job_drift_status BEFORE INSERT ON public.job_drift_status FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_tenant_id_drift_reasons BEFORE INSERT ON public.drift_reasons FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_tenant_id_drift_settings BEFORE INSERT ON public.drift_settings FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
