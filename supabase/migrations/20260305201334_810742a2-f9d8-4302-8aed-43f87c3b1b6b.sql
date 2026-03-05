
-- Add scope/terms markdown to cab_quotes
ALTER TABLE public.cab_quotes
  ADD COLUMN IF NOT EXISTS scope_markdown text NULL,
  ADD COLUMN IF NOT EXISTS terms_markdown text NULL;

-- Create cab_quote_items
CREATE TABLE IF NOT EXISTS public.cab_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.cab_quotes(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_cab_quote_items_quote ON public.cab_quote_items (company_id, quote_id);

-- RLS
ALTER TABLE public.cab_quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cab_quote_items_member_select" ON public.cab_quote_items
  FOR SELECT TO authenticated
  USING (public.is_cab_company_member(company_id));

CREATE POLICY "cab_quote_items_member_insert" ON public.cab_quote_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cab_company_member(company_id));

CREATE POLICY "cab_quote_items_member_update" ON public.cab_quote_items
  FOR UPDATE TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

CREATE POLICY "cab_quote_items_member_delete" ON public.cab_quote_items
  FOR DELETE TO authenticated
  USING (public.is_cab_company_member(company_id));
