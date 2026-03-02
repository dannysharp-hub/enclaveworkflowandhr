
-- ═══════════════════════════════════════════════════════════════
-- NESTING ENGINE V2 SCHEMA MIGRATION
-- ═══════════════════════════════════════════════════════════════

-- 1) Extend job_nesting_groups with V2 optimisation + remnant settings
ALTER TABLE public.job_nesting_groups
  ADD COLUMN IF NOT EXISTS optimisation_time_limit_seconds integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS optimisation_seed text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS algorithm_pool jsonb NOT NULL DEFAULT '["maxrects_best_area_fit","maxrects_best_short_side_fit","skyline","guillotine"]'::jsonb,
  ADD COLUMN IF NOT EXISTS remnant_min_utilisation_percent numeric NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS remnant_max_count_to_try integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS allow_mix_remnant_and_full_sheets boolean NOT NULL DEFAULT true;

-- 2) Extend nesting_runs with V2 run tracking
ALTER TABLE public.nesting_runs
  ADD COLUMN IF NOT EXISTS run_index integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parameters_json jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS min_sheet_utilisation_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remnant_area_used_mm2 numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result_hash text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS selected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users DEFAULT NULL;

-- 3) Polygon-ready fields on part_library
ALTER TABLE public.part_library
  ADD COLUMN IF NOT EXISTS outer_shape_type text NOT NULL DEFAULT 'rect',
  ADD COLUMN IF NOT EXISTS outer_polygon_points_json jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dxf_outline_layer_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kerf_mm numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clearance_mm numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edge_profile_json jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS front_edge_designation text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS face_orientation text DEFAULT NULL;

-- 4) Edgeband batches
CREATE TABLE IF NOT EXISTS public.job_edgeband_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.job_nesting_groups(id) ON DELETE SET NULL,
  batch_name text NOT NULL,
  tape_code_primary text NOT NULL DEFAULT '',
  front_edge_direction text DEFAULT NULL,
  thickness_mm numeric DEFAULT NULL,
  colour_name text DEFAULT NULL,
  count_parts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_edgeband_batch_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  batch_id uuid NOT NULL REFERENCES public.job_edgeband_batches(id) ON DELETE CASCADE,
  part_id text NOT NULL,
  instance_index integer NOT NULL DEFAULT 1,
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5) RLS for edgeband tables
ALTER TABLE public.job_edgeband_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_edgeband_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.job_edgeband_batches
  FOR ALL USING (public.is_user_tenant(tenant_id));

CREATE POLICY "Tenant isolation" ON public.job_edgeband_batch_items
  FOR ALL USING (public.is_user_tenant(tenant_id));

-- 6) Tenant-id auto-set triggers
CREATE TRIGGER set_tenant_id_edgeband_batches
  BEFORE INSERT ON public.job_edgeband_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE TRIGGER set_tenant_id_edgeband_batch_items
  BEFORE INSERT ON public.job_edgeband_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- 7) Updated-at trigger for edgeband batches
CREATE TRIGGER update_edgeband_batches_updated_at
  BEFORE UPDATE ON public.job_edgeband_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8) Add feature flag for polygon extraction (data insert via insert tool later)
