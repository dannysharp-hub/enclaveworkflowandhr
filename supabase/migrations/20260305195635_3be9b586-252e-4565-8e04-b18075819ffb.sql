
-- 1) Add slug and primary_domain to cab_companies
ALTER TABLE public.cab_companies
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS primary_domain text;

-- Backfill Enclave
UPDATE public.cab_companies SET slug = 'enclave' WHERE name = 'Enclave Cabinetry' AND slug IS NULL;

-- Make slug NOT NULL + unique, primary_domain unique
ALTER TABLE public.cab_companies ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.cab_companies ADD CONSTRAINT cab_companies_slug_unique UNIQUE (slug);
ALTER TABLE public.cab_companies ADD CONSTRAINT cab_companies_primary_domain_unique UNIQUE (primary_domain);

-- 2) Unique constraint on cab_invoices (company_id, reference)
ALTER TABLE public.cab_invoices ADD CONSTRAINT cab_invoices_company_reference_unique UNIQUE (company_id, reference);

-- 3) Unique constraint on cab_customers (company_id, lower(email))
CREATE UNIQUE INDEX IF NOT EXISTS cab_customers_company_email_unique ON public.cab_customers (company_id, lower(email)) WHERE email IS NOT NULL;

-- 4) Create cab_company_invites
CREATE TABLE public.cab_company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'staff',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cab_company_invites ENABLE ROW LEVEL SECURITY;

-- RLS: company admins can manage invites
CREATE POLICY "Company admins can manage invites"
  ON public.cab_company_invites
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cab_user_profiles
      WHERE id = auth.uid()
        AND company_id = cab_company_invites.company_id
        AND role = 'admin'
        AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cab_user_profiles
      WHERE id = auth.uid()
        AND company_id = cab_company_invites.company_id
        AND role = 'admin'
        AND is_active = true
    )
  );

-- 5) Create cab_company_memberships for multi-company readiness
CREATE TABLE public.cab_company_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

ALTER TABLE public.cab_company_memberships ENABLE ROW LEVEL SECURITY;

-- RLS: users can see their own memberships
CREATE POLICY "Users can view own memberships"
  ON public.cab_company_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Company admins can manage memberships
CREATE POLICY "Company admins can manage memberships"
  ON public.cab_company_memberships
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cab_user_profiles
      WHERE id = auth.uid()
        AND company_id = cab_company_memberships.company_id
        AND role = 'admin'
        AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cab_user_profiles
      WHERE id = auth.uid()
        AND company_id = cab_company_memberships.company_id
        AND role = 'admin'
        AND is_active = true
    )
  );

-- Seed existing cab_user_profiles into memberships
INSERT INTO public.cab_company_memberships (user_id, company_id, role)
SELECT id, company_id, role FROM public.cab_user_profiles
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 6) RLS for cab_companies: allow reading by slug (for portal resolution)
CREATE POLICY "Anyone can read company by slug"
  ON public.cab_companies
  FOR SELECT
  TO anon, authenticated
  USING (true);
