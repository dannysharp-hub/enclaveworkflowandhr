
-- 1. Create enums for buylist categories and supplier groups
CREATE TYPE public.buylist_category AS ENUM (
  'panels', 'hardware', 'lighting', 'fixings', 'legs', 'handles',
  'finishing_oils', 'paint_spray_subcontract', 'edgebanding', 'other'
);

CREATE TYPE public.supplier_group AS ENUM (
  'panel_suppliers', 'hardware_suppliers', 'lighting_suppliers',
  'finishing_suppliers', 'spray_shop', 'edgebanding_suppliers', 'general'
);

-- 2. Create buylist_line_items table
CREATE TABLE public.buylist_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  category public.buylist_category NOT NULL DEFAULT 'other',
  supplier_group public.supplier_group NOT NULL DEFAULT 'general',
  item_name text NOT NULL,
  brand text,
  sku_code text,
  spec_json jsonb,
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'pcs',
  notes text,
  is_spray_required boolean NOT NULL DEFAULT false,
  spray_spec_json jsonb,
  source_part_id uuid REFERENCES public.parts(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_buylist_job ON public.buylist_line_items(job_id);
CREATE INDEX idx_buylist_tenant ON public.buylist_line_items(tenant_id);
CREATE INDEX idx_buylist_category ON public.buylist_line_items(category);
CREATE INDEX idx_buylist_supplier_group ON public.buylist_line_items(supplier_group);

-- Set tenant_id automatically
CREATE TRIGGER set_buylist_tenant BEFORE INSERT ON public.buylist_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_buylist_updated BEFORE UPDATE ON public.buylist_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.buylist_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for buylist_line_items"
  ON public.buylist_line_items FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

-- 3. Add ordering_enabled and deposit_received_at to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS ordering_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS buylist_generated_at timestamptz;

-- 4. Add supplier_type and is_default_spray_shop to suppliers
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supplier_type public.supplier_group DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS is_default_spray_shop boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_url text;

-- 5. Add category_supported to supplier_capabilities
ALTER TABLE public.supplier_capabilities
  ADD COLUMN IF NOT EXISTS category_supported public.buylist_category,
  ADD COLUMN IF NOT EXISTS sku_patterns text[];

-- 6. Add supplier_group to rfq_requests for filtering
ALTER TABLE public.rfq_requests
  ADD COLUMN IF NOT EXISTS supplier_group public.supplier_group,
  ADD COLUMN IF NOT EXISTS buylist_category public.buylist_category;

-- 7. Add category + unit fields to rfq_line_items for richer data
ALTER TABLE public.rfq_line_items
  ADD COLUMN IF NOT EXISTS category public.buylist_category,
  ADD COLUMN IF NOT EXISTS unit text DEFAULT 'sheets',
  ADD COLUMN IF NOT EXISTS item_name text,
  ADD COLUMN IF NOT EXISTS sku_code text,
  ADD COLUMN IF NOT EXISTS spec_json jsonb,
  ADD COLUMN IF NOT EXISTS buylist_line_id uuid REFERENCES public.buylist_line_items(id) ON DELETE SET NULL;

-- 8. Create purchasing_audit_log for tracking
CREATE TABLE public.purchasing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  actor_staff_id text,
  details_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchasing_audit_tenant ON public.purchasing_audit_log(tenant_id);
CREATE INDEX idx_purchasing_audit_job ON public.purchasing_audit_log(job_id);

CREATE TRIGGER set_purchasing_audit_tenant BEFORE INSERT ON public.purchasing_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

ALTER TABLE public.purchasing_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for purchasing_audit_log"
  ON public.purchasing_audit_log FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));
