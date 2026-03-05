
-- Create cab_labour_rates table
CREATE TABLE IF NOT EXISTS public.cab_labour_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  role text NULL,
  hourly_rate numeric NOT NULL DEFAULT 25,
  currency text NOT NULL DEFAULT 'GBP',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cab_labour_rates_lookup ON public.cab_labour_rates (company_id, role, effective_from);

ALTER TABLE public.cab_labour_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cab_labour_rates_select" ON public.cab_labour_rates
  FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));

CREATE POLICY "cab_labour_rates_insert" ON public.cab_labour_rates
  FOR INSERT TO authenticated WITH CHECK (public.is_cab_company_admin(company_id));

CREATE POLICY "cab_labour_rates_update" ON public.cab_labour_rates
  FOR UPDATE TO authenticated
  USING (public.is_cab_company_admin(company_id))
  WITH CHECK (public.is_cab_company_admin(company_id));

CREATE POLICY "cab_labour_rates_delete" ON public.cab_labour_rates
  FOR DELETE TO authenticated USING (public.is_cab_company_admin(company_id));
