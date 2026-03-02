
-- Part Library: reusable part definitions
CREATE TABLE public.part_library (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  part_code text NOT NULL,
  description text,
  product_code text,
  material_code text REFERENCES public.materials(material_code),
  length_mm numeric NOT NULL DEFAULT 0,
  width_mm numeric NOT NULL DEFAULT 0,
  thickness_mm numeric,
  grain_required boolean NOT NULL DEFAULT false,
  grain_axis text DEFAULT 'L',
  rotation_allowed text DEFAULT 'any',
  dxf_file_reference text,
  tags text[] DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, part_code)
);

ALTER TABLE public.part_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.part_library
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_part_library_tenant BEFORE INSERT ON public.part_library
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE TRIGGER update_part_library_updated_at BEFORE UPDATE ON public.part_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Job Nesting Groups: material groups per job for VCarve export
CREATE TABLE public.job_nesting_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  group_label text NOT NULL,
  material_code text REFERENCES public.materials(material_code),
  thickness_mm numeric,
  colour_name text,
  sheet_length_mm numeric NOT NULL DEFAULT 2440,
  sheet_width_mm numeric NOT NULL DEFAULT 1220,
  margin_mm numeric NOT NULL DEFAULT 10,
  spacing_mm numeric NOT NULL DEFAULT 8,
  allow_rotation_90 boolean NOT NULL DEFAULT true,
  allow_mirror boolean NOT NULL DEFAULT false,
  grain_direction text DEFAULT 'length',
  nest_method text DEFAULT 'by_area',
  keep_parts_together boolean DEFAULT false,
  prioritise_grain_parts boolean DEFAULT true,
  toolpath_template_id uuid REFERENCES public.toolpath_templates(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_nesting_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.job_nesting_groups
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_nesting_groups_tenant BEFORE INSERT ON public.job_nesting_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE TRIGGER update_nesting_groups_updated_at BEFORE UPDATE ON public.job_nesting_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Job Sheets: planned sheets per nesting group
CREATE TABLE public.job_sheets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  nesting_group_id uuid REFERENCES public.job_nesting_groups(id) ON DELETE CASCADE,
  sheet_number integer NOT NULL DEFAULT 1,
  material_code text REFERENCES public.materials(material_code),
  sheet_length_mm numeric NOT NULL DEFAULT 2440,
  sheet_width_mm numeric NOT NULL DEFAULT 1220,
  qr_payload text,
  status text NOT NULL DEFAULT 'planned',
  cut_at timestamptz,
  cut_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.job_sheets
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_job_sheets_tenant BEFORE INSERT ON public.job_sheets
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE TRIGGER update_job_sheets_updated_at BEFORE UPDATE ON public.job_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add customer_id to jobs if not already present
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'customer_id') THEN
    ALTER TABLE public.jobs ADD COLUMN customer_id uuid REFERENCES public.customers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'due_date') THEN
    ALTER TABLE public.jobs ADD COLUMN due_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parts' AND column_name = 'library_part_id') THEN
    ALTER TABLE public.parts ADD COLUMN library_part_id uuid REFERENCES public.part_library(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parts' AND column_name = 'thickness_mm') THEN
    ALTER TABLE public.parts ADD COLUMN thickness_mm numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'parts' AND column_name = 'colour_name') THEN
    ALTER TABLE public.parts ADD COLUMN colour_name text;
  END IF;
END $$;
