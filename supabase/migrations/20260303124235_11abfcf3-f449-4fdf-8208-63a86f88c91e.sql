
-- 1.1 Extend job_sheets with CNC time tracking columns
ALTER TABLE public.job_sheets
  ADD COLUMN IF NOT EXISTS sheet_index integer,
  ADD COLUMN IF NOT EXISTS vc_estimated_minutes_raw numeric,
  ADD COLUMN IF NOT EXISTS vc_estimated_minutes_calibrated numeric,
  ADD COLUMN IF NOT EXISTS vc_estimate_source text NOT NULL DEFAULT 'manual_in_gadget',
  ADD COLUMN IF NOT EXISTS cnc_actual_minutes numeric,
  ADD COLUMN IF NOT EXISTS cnc_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS cnc_completed_at timestamptz;

-- 1.2 New table: cnc_time_calibration
CREATE TABLE IF NOT EXISTS public.cnc_time_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  machine_id text NOT NULL DEFAULT 'Fabertec M1',
  post_processor_name text,
  toolpath_template_id text,
  material_key text,
  scale_factor numeric NOT NULL DEFAULT 1.0,
  sample_count integer NOT NULL DEFAULT 0,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cnc_time_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on cnc_time_calibration"
  ON public.cnc_time_calibration FOR ALL
  TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

-- 1.3 New table: job_time_estimates_audit
CREATE TABLE IF NOT EXISTS public.job_time_estimates_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sheet_id uuid REFERENCES public.job_sheets(id) ON DELETE SET NULL,
  raw_minutes numeric NOT NULL,
  calibrated_minutes numeric,
  entered_by_staff_id text,
  source text NOT NULL DEFAULT 'vcarve_gadget',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_time_estimates_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on job_time_estimates_audit"
  ON public.job_time_estimates_audit FOR ALL
  TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

-- 1.4 Add CNC capacity settings to payroll_settings
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS daily_cnc_capacity_hours numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS partial_start_threshold_multiplier numeric NOT NULL DEFAULT 1.5;

-- Auto-set tenant_id triggers
CREATE TRIGGER set_tenant_id_cnc_time_calibration
  BEFORE INSERT ON public.cnc_time_calibration
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE TRIGGER set_tenant_id_job_time_estimates_audit
  BEFORE INSERT ON public.job_time_estimates_audit
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
