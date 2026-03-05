
-- 1. cab_companies
CREATE TABLE public.cab_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_postcode text,
  service_radius_miles integer,
  brand_phone text,
  timezone text NOT NULL DEFAULT 'Europe/London',
  settings_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cab_companies ENABLE ROW LEVEL SECURITY;

-- 2. cab_user_profiles
CREATE TABLE public.cab_user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'designer' CHECK (role IN ('admin','office','designer','installer','production','owner')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cab_user_profiles ENABLE ROW LEVEL SECURITY;

-- 3. cab_customers
CREATE TABLE public.cab_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  postcode text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cab_customers ENABLE ROW LEVEL SECURITY;

-- 4. cab_jobs
CREATE TABLE public.cab_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.cab_customers(id) ON DELETE CASCADE,
  job_ref text NOT NULL,
  job_title text NOT NULL,
  room_type text,
  property_address_json jsonb,
  status text NOT NULL DEFAULT 'lead' CHECK (status IN ('lead','quoted','active','in_production','install','complete','closed')),
  state text,
  current_stage_key text,
  assigned_user_id uuid REFERENCES public.cab_user_profiles(id),
  estimated_next_action_at timestamptz,
  ghl_contact_id text,
  ghl_opportunity_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_ref)
);
ALTER TABLE public.cab_jobs ENABLE ROW LEVEL SECURITY;

-- 5. cab_quotes
CREATE TABLE public.cab_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.cab_jobs(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  price_min numeric(12,2),
  price_max numeric(12,2),
  currency text NOT NULL DEFAULT 'GBP',
  scope_summary text,
  document_url text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cab_quotes ENABLE ROW LEVEL SECURITY;

-- 6. cab_quote_views
CREATE TABLE public.cab_quote_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.cab_quotes(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.cab_jobs(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  viewer_ip text,
  viewer_user_agent text,
  viewer_type text
);
ALTER TABLE public.cab_quote_views ENABLE ROW LEVEL SECURITY;

-- 7. cab_quote_acceptances
CREATE TABLE public.cab_quote_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.cab_quotes(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.cab_jobs(id) ON DELETE SET NULL,
  accepted_by_name text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_ip text,
  terms_version text,
  terms_url text
);
ALTER TABLE public.cab_quote_acceptances ENABLE ROW LEVEL SECURITY;

-- 8. cab_invoices
CREATE TABLE public.cab_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.cab_jobs(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.cab_quotes(id) ON DELETE SET NULL,
  milestone text NOT NULL DEFAULT 'deposit' CHECK (milestone IN ('deposit','preinstall','final')),
  reference text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','due','paid','void')),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  payment_method text CHECK (payment_method IN ('stripe','bank')),
  payment_link_url text,
  pdf_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cab_invoices ENABLE ROW LEVEL SECURITY;

-- 9. cab_payments
CREATE TABLE public.cab_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.cab_invoices(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.cab_jobs(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method IN ('stripe','bank')),
  amount numeric(12,2) NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  provider_ref text,
  raw_json jsonb
);
ALTER TABLE public.cab_payments ENABLE ROW LEVEL SECURITY;

-- 10. cab_events
CREATE TABLE public.cab_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.cab_jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.cab_customers(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload_json jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','success','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
ALTER TABLE public.cab_events ENABLE ROW LEVEL SECURITY;

-- updated_at triggers
CREATE TRIGGER set_cab_companies_updated_at BEFORE UPDATE ON public.cab_companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_cab_user_profiles_updated_at BEFORE UPDATE ON public.cab_user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_cab_customers_updated_at BEFORE UPDATE ON public.cab_customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_cab_jobs_updated_at BEFORE UPDATE ON public.cab_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_cab_quotes_updated_at BEFORE UPDATE ON public.cab_quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_cab_invoices_updated_at BEFORE UPDATE ON public.cab_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies: company-scoped access via cab_user_profiles
CREATE POLICY "Users can access own company data" ON public.cab_companies FOR ALL TO authenticated USING (id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));
CREATE POLICY "Users can access own profile" ON public.cab_user_profiles FOR ALL TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can access company customers" ON public.cab_customers FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));
CREATE POLICY "Users can access company jobs" ON public.cab_jobs FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));
CREATE POLICY "Users can access company quotes" ON public.cab_quotes FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));
CREATE POLICY "Users can access company quote_views" ON public.cab_quote_views FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));
CREATE POLICY "Users can access company quote_acceptances" ON public.cab_quote_acceptances FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));
CREATE POLICY "Users can access company invoices" ON public.cab_invoices FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));
CREATE POLICY "Users can access company payments" ON public.cab_payments FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));
CREATE POLICY "Users can access company events" ON public.cab_events FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));

-- Indexes for performance
CREATE INDEX idx_cab_user_profiles_company ON public.cab_user_profiles(company_id);
CREATE INDEX idx_cab_customers_company ON public.cab_customers(company_id);
CREATE INDEX idx_cab_jobs_company ON public.cab_jobs(company_id);
CREATE INDEX idx_cab_jobs_customer ON public.cab_jobs(customer_id);
CREATE INDEX idx_cab_jobs_status ON public.cab_jobs(company_id, status);
CREATE INDEX idx_cab_quotes_job ON public.cab_quotes(job_id);
CREATE INDEX idx_cab_invoices_job ON public.cab_invoices(job_id);
CREATE INDEX idx_cab_payments_invoice ON public.cab_payments(invoice_id);
CREATE INDEX idx_cab_events_company_type ON public.cab_events(company_id, event_type);
CREATE INDEX idx_cab_events_status ON public.cab_events(status);
