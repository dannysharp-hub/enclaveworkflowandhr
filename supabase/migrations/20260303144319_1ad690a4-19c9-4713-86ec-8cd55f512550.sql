
-- BOM upload tracking table
CREATE TABLE public.job_bom_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_ref text,
  uploaded_by_staff_id text,
  uploaded_at timestamptz DEFAULT now(),
  parse_status text NOT NULL DEFAULT 'pending',
  parse_error text,
  bom_revision int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.job_bom_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.job_bom_uploads
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_job_bom_uploads BEFORE INSERT ON public.job_bom_uploads
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- BOM items table (normalized lines)
CREATE TABLE public.job_bom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  bom_upload_id uuid REFERENCES public.job_bom_uploads(id) ON DELETE CASCADE,
  bom_revision int NOT NULL DEFAULT 1,
  part_number text,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'pcs',
  material_text text,
  category_hint text,
  supplier_hint text,
  metadata_json jsonb,
  is_virtual boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.job_bom_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.job_bom_items
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_job_bom_items BEFORE INSERT ON public.job_bom_items
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- Spray match rules (tenant-configurable)
CREATE TABLE public.spray_match_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  match_field text NOT NULL DEFAULT 'material_text',
  match_term text NOT NULL DEFAULT 'MR MDF',
  is_exclusion boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.spray_match_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.spray_match_rules
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_spray_match_rules BEFORE INSERT ON public.spray_match_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- Extend buylist_line_items with BOM source fields
ALTER TABLE public.buylist_line_items
  ADD COLUMN IF NOT EXISTS bom_item_id uuid REFERENCES public.job_bom_items(id),
  ADD COLUMN IF NOT EXISTS spray_detected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS spray_reason text,
  ADD COLUMN IF NOT EXISTS bom_revision int;

-- Category mapping rules (tenant-configurable keyword to category)
CREATE TABLE public.buylist_category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  keyword text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  supplier_group text NOT NULL DEFAULT 'other',
  priority int DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.buylist_category_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.buylist_category_rules
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_buylist_category_rules BEFORE INSERT ON public.buylist_category_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
