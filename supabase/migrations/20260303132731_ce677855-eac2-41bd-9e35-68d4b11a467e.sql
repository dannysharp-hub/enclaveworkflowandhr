
-- 1. Extend suppliers table with RFQ-related columns
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS rfq_email text,
  ADD COLUMN IF NOT EXISTS lead_time_days_default integer,
  ADD COLUMN IF NOT EXISTS delivery_days jsonb,
  ADD COLUMN IF NOT EXISTS min_order_value numeric,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_preferred boolean NOT NULL DEFAULT false;

-- Copy existing email to rfq_email where not set
UPDATE public.suppliers SET rfq_email = email WHERE rfq_email IS NULL AND email IS NOT NULL;

-- 2. supplier_capabilities
CREATE TABLE public.supplier_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  material_brand text NOT NULL DEFAULT 'Generic',
  material_range text,
  thickness_mm numeric,
  sheet_size_key text,
  finishes jsonb,
  supports_veneer boolean NOT NULL DEFAULT false,
  supports_prefinished boolean NOT NULL DEFAULT false,
  supports_raw_mdf boolean NOT NULL DEFAULT true,
  supports_edge_band boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.supplier_capabilities
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_supplier_capabilities
  BEFORE INSERT ON public.supplier_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- 3. rfq_requests
CREATE TABLE public.rfq_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid REFERENCES public.jobs(id),
  rfq_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by_staff_id uuid,
  required_by_date date,
  delivery_address_text text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rfq_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.rfq_requests
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_rfq_requests
  BEFORE INSERT ON public.rfq_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE TRIGGER update_rfq_requests_updated_at
  BEFORE UPDATE ON public.rfq_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Unique rfq_number per tenant
CREATE UNIQUE INDEX idx_rfq_number_tenant ON public.rfq_requests(tenant_id, rfq_number);

-- 4. rfq_recipients
CREATE TABLE public.rfq_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  rfq_id uuid NOT NULL REFERENCES public.rfq_requests(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  send_status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  email_message_id text,
  last_error text,
  quoted_total numeric,
  quoted_lead_time_days integer,
  quote_received_at timestamptz,
  is_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rfq_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.rfq_recipients
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_rfq_recipients
  BEFORE INSERT ON public.rfq_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- 5. rfq_line_items
CREATE TABLE public.rfq_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  rfq_id uuid NOT NULL REFERENCES public.rfq_requests(id) ON DELETE CASCADE,
  material_key text NOT NULL,
  brand text,
  decor_code text,
  colour_name text,
  thickness_mm numeric NOT NULL,
  sheet_size_key text NOT NULL,
  quantity_sheets integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rfq_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.rfq_line_items
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_rfq_line_items
  BEFORE INSERT ON public.rfq_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- 6. rfq_attachments
CREATE TABLE public.rfq_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  rfq_id uuid NOT NULL REFERENCES public.rfq_requests(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id),
  file_name text NOT NULL,
  storage_ref text NOT NULL,
  type text NOT NULL DEFAULT 'other',
  uploaded_by_staff_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rfq_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.rfq_attachments
  FOR ALL USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_rfq_attachments
  BEFORE INSERT ON public.rfq_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- 7. Extend purchasing_settings with RFQ fields
ALTER TABLE public.purchasing_settings
  ADD COLUMN IF NOT EXISTS rfq_auto_generate_on_buylist boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rfq_auto_send boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rfq_send_mode text NOT NULL DEFAULT 'all_matching',
  ADD COLUMN IF NOT EXISTS rfq_top_n integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS default_required_by_days_from_now integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS include_csv_attachment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_pdf_attachment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS group_lines_by_material boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_provider text NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS from_display_name text,
  ADD COLUMN IF NOT EXISTS from_email text,
  ADD COLUMN IF NOT EXISTS cc_internal_emails jsonb;

-- 8. Add rfq_id to purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS rfq_id uuid REFERENCES public.rfq_requests(id);

-- 9. RFQ number sequence function
CREATE OR REPLACE FUNCTION public.generate_rfq_number(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _seq integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN rfq_number ~ '^RFQ-[0-9]+$'
      THEN CAST(SUBSTRING(rfq_number FROM 5) AS integer)
      ELSE 0
    END
  ), 0) + 1
  INTO _seq
  FROM public.rfq_requests
  WHERE tenant_id = _tenant_id;
  
  RETURN 'RFQ-' || LPAD(_seq::text, 4, '0');
END;
$$;

-- 10. Storage bucket for RFQ files
INSERT INTO storage.buckets (id, name, public)
VALUES ('rfq-files', 'rfq-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Tenant users can manage rfq files"
ON storage.objects FOR ALL
USING (bucket_id = 'rfq-files' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'rfq-files' AND auth.role() = 'authenticated');
