ALTER TABLE public.cab_costing_extractions
  ADD COLUMN IF NOT EXISTS tab_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text;

CREATE TABLE IF NOT EXISTS public.cab_costing_tab_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  folder_name text NOT NULL,
  tab_name text NOT NULL,
  counted boolean NOT NULL,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cab_costing_tab_decisions_key
  ON public.cab_costing_tab_decisions (company_id, folder_name, tab_name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cab_costing_tab_decisions TO authenticated;
GRANT ALL ON public.cab_costing_tab_decisions TO service_role;

ALTER TABLE public.cab_costing_tab_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read tab decisions" ON public.cab_costing_tab_decisions
  FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));

CREATE POLICY "admins manage tab decisions" ON public.cab_costing_tab_decisions
  FOR ALL TO authenticated USING (public.is_cab_company_admin(company_id)) WITH CHECK (public.is_cab_company_admin(company_id));