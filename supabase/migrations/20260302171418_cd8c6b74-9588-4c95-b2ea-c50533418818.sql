
-- Quote line items for itemised breakdowns
CREATE TABLE public.quote_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.smart_quotes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  category TEXT NOT NULL DEFAULT 'materials', -- materials, labour, external, overhead, custom
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  markup_percent NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC GENERATED ALWAYS AS (quantity * unit_cost * (1 + markup_percent / 100)) STORED,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users manage quote line items" ON public.quote_line_items
  FOR ALL TO authenticated USING (public.is_user_tenant(tenant_id));
CREATE TRIGGER set_tenant_id_quote_line_items BEFORE INSERT ON public.quote_line_items FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- Quote versions for audit trail
CREATE TABLE public.quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.smart_quotes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  version_number INT NOT NULL DEFAULT 1,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users manage quote versions" ON public.quote_versions
  FOR ALL TO authenticated USING (public.is_user_tenant(tenant_id));
CREATE TRIGGER set_tenant_id_quote_versions BEFORE INSERT ON public.quote_versions FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- Quote notes for internal comments
CREATE TABLE public.quote_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.smart_quotes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  author_name TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users manage quote notes" ON public.quote_notes
  FOR ALL TO authenticated USING (public.is_user_tenant(tenant_id));
CREATE TRIGGER set_tenant_id_quote_notes BEFORE INSERT ON public.quote_notes FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- Add drift adjustment columns to smart_quotes
ALTER TABLE public.smart_quotes ADD COLUMN IF NOT EXISTS drift_adjusted_value NUMERIC DEFAULT 0;
ALTER TABLE public.smart_quotes ADD COLUMN IF NOT EXISTS drift_adjustment_percent NUMERIC DEFAULT 0;
ALTER TABLE public.smart_quotes ADD COLUMN IF NOT EXISTS version_count INT DEFAULT 1;
ALTER TABLE public.smart_quotes ADD COLUMN IF NOT EXISTS notes_count INT DEFAULT 0;
ALTER TABLE public.smart_quotes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.smart_quotes ADD COLUMN IF NOT EXISTS approved_by TEXT;
