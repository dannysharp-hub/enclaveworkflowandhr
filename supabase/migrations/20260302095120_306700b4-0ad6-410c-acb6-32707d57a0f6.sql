
-- Extend job_nesting_groups with engine fields
ALTER TABLE public.job_nesting_groups
  ADD COLUMN IF NOT EXISTS nesting_engine text NOT NULL DEFAULT 'vcarve',
  ADD COLUMN IF NOT EXISTS spacing_mm numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS margin_mm numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS allow_rotate_90 boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS grain_direction text NOT NULL DEFAULT 'length',
  ADD COLUMN IF NOT EXISTS sort_strategy text NOT NULL DEFAULT 'largest_first',
  ADD COLUMN IF NOT EXISTS optimisation_runs integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS remnant_first boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

-- Job sheet layouts - committed layout result per sheet
CREATE TABLE public.job_sheet_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.job_nesting_groups(id) ON DELETE CASCADE,
  sheet_id uuid REFERENCES public.job_sheets(id),
  sheet_number integer NOT NULL,
  sheet_width_mm numeric NOT NULL,
  sheet_length_mm numeric NOT NULL,
  margin_mm numeric NOT NULL DEFAULT 10,
  spacing_mm numeric NOT NULL DEFAULT 8,
  grain_direction text NOT NULL DEFAULT 'length',
  algorithm_used text NOT NULL DEFAULT 'maxrects_baf',
  utilisation_percent numeric NOT NULL DEFAULT 0,
  waste_area_mm2 numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Trigger for tenant_id
CREATE TRIGGER set_tenant_id_job_sheet_layouts
  BEFORE INSERT ON public.job_sheet_layouts
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

ALTER TABLE public.job_sheet_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tenant sheet layouts"
  ON public.job_sheet_layouts FOR ALL
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

-- Job sheet parts - placed part instances on a sheet
CREATE TABLE public.job_sheet_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  layout_id uuid NOT NULL REFERENCES public.job_sheet_layouts(id) ON DELETE CASCADE,
  sheet_id uuid REFERENCES public.job_sheets(id),
  part_id text NOT NULL,
  library_part_id uuid REFERENCES public.part_library(id),
  qty_instance_index integer NOT NULL DEFAULT 1,
  x_mm numeric NOT NULL DEFAULT 0,
  y_mm numeric NOT NULL DEFAULT 0,
  rotation_deg integer NOT NULL DEFAULT 0,
  width_mm numeric NOT NULL,
  height_mm numeric NOT NULL,
  grain_locked boolean NOT NULL DEFAULT false,
  source_dxf_ref text,
  bounding_box_ok boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_tenant_id_job_sheet_parts
  BEFORE INSERT ON public.job_sheet_parts
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

ALTER TABLE public.job_sheet_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tenant sheet parts"
  ON public.job_sheet_parts FOR ALL
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

-- Nesting runs - track each run for debugging
CREATE TABLE public.nesting_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.job_nesting_groups(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  error_message text,
  algorithm_variant text NOT NULL DEFAULT 'maxrects_baf',
  utilisation_percent numeric NOT NULL DEFAULT 0,
  sheet_count integer NOT NULL DEFAULT 0,
  output_summary_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_tenant_id_nesting_runs
  BEFORE INSERT ON public.nesting_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

ALTER TABLE public.nesting_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tenant nesting runs"
  ON public.nesting_runs FOR ALL
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));
