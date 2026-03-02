
-- 1. material_types table
CREATE TABLE IF NOT EXISTS public.material_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.material_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.material_types
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_material_types
  BEFORE INSERT ON public.material_types
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- 2. material_products table
CREATE TABLE IF NOT EXISTS public.material_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  material_code text NOT NULL,
  material_type_id uuid REFERENCES public.material_types(id),
  brand text,
  colour_name text,
  thickness_mm numeric NOT NULL,
  sheet_length_mm numeric NOT NULL DEFAULT 2440,
  sheet_width_mm numeric NOT NULL DEFAULT 1220,
  grain_default text CHECK (grain_default IN ('length', 'width', null)),
  rotation_allowed_90_default boolean NOT NULL DEFAULT true,
  cost_per_sheet numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  waste_factor_percent numeric NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, material_code)
);

ALTER TABLE public.material_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.material_products
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_material_products
  BEFORE INSERT ON public.material_products
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE TRIGGER update_material_products_updated_at
  BEFORE UPDATE ON public.material_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. material_cost_history table
CREATE TABLE IF NOT EXISTS public.material_cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  material_product_id uuid NOT NULL REFERENCES public.material_products(id) ON DELETE CASCADE,
  cost_per_sheet numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.material_cost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.material_cost_history
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_material_cost_history
  BEFORE INSERT ON public.material_cost_history
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
