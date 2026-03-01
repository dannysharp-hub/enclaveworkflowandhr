
-- 1. Pandle connector settings (per tenant)
CREATE TABLE public.pandle_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  connector_enabled boolean NOT NULL DEFAULT false,
  default_sales_nominal_code text NOT NULL DEFAULT '4000',
  default_purchase_nominal_code text NOT NULL DEFAULT '5000',
  default_vat_code_sales text NOT NULL DEFAULT 'T1',
  default_vat_code_purchases text NOT NULL DEFAULT 'T1',
  auto_mark_exported boolean NOT NULL DEFAULT false,
  export_currency text NOT NULL DEFAULT 'GBP',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.pandle_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant pandle settings"
  ON public.pandle_settings FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

CREATE POLICY "Users can view tenant pandle settings"
  ON public.pandle_settings FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_pandle_settings_tenant BEFORE INSERT ON public.pandle_settings FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER update_pandle_settings_updated_at BEFORE UPDATE ON public.pandle_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Nominal code mappings
CREATE TABLE public.nominal_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  internal_category text NOT NULL,
  pandle_nominal_code text NOT NULL,
  mapping_type text NOT NULL DEFAULT 'purchase',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, internal_category, mapping_type)
);

ALTER TABLE public.nominal_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant nominal mappings"
  ON public.nominal_mappings FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

CREATE POLICY "Users can view tenant nominal mappings"
  ON public.nominal_mappings FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_nominal_mappings_tenant BEFORE INSERT ON public.nominal_mappings FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER update_nominal_mappings_updated_at BEFORE UPDATE ON public.nominal_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. VAT code mappings
CREATE TABLE public.vat_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  internal_vat_rate numeric NOT NULL,
  pandle_vat_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, internal_vat_rate)
);

ALTER TABLE public.vat_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant vat mappings"
  ON public.vat_mappings FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

CREATE POLICY "Users can view tenant vat mappings"
  ON public.vat_mappings FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_vat_mappings_tenant BEFORE INSERT ON public.vat_mappings FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER update_vat_mappings_updated_at BEFORE UPDATE ON public.vat_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Export batch history
CREATE TABLE public.export_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  export_type text NOT NULL,
  date_range_start date,
  date_range_end date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  record_count integer NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  status_filter text,
  export_types text[] NOT NULL DEFAULT '{}'
);

ALTER TABLE public.export_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant export batches"
  ON public.export_batches FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role)));

CREATE POLICY "Users can view tenant export batches"
  ON public.export_batches FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_export_batches_tenant BEFORE INSERT ON public.export_batches FOR EACH ROW EXECUTE FUNCTION set_tenant_id();

-- 5. Add sync tracking fields to invoices and bills
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pandle_exported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pandle_exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS pandle_export_batch_id uuid REFERENCES public.export_batches(id);

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS pandle_exported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pandle_exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS pandle_export_batch_id uuid REFERENCES public.export_batches(id);
