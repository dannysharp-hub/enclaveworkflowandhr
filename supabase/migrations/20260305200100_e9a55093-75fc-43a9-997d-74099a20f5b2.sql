
-- Create a security definer function to check membership (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.is_cab_company_member(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cab_company_memberships
    WHERE company_id = _company_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_cab_company_admin(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cab_company_memberships
    WHERE company_id = _company_id AND user_id = auth.uid() AND role = 'admin'
  )
$$;

-- cab_appointments
DROP POLICY IF EXISTS "cab_appointments_insert" ON public.cab_appointments;
DROP POLICY IF EXISTS "cab_appointments_select" ON public.cab_appointments;
DROP POLICY IF EXISTS "cab_appointments_update" ON public.cab_appointments;

CREATE POLICY "cab_appointments_select" ON public.cab_appointments FOR SELECT TO authenticated
  USING (
    public.is_cab_company_member(company_id)
    OR company_id IN (SELECT company_id FROM public.cab_customer_auth_links WHERE auth_user_id = auth.uid())
  );
CREATE POLICY "cab_appointments_insert" ON public.cab_appointments FOR INSERT TO authenticated
  WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_appointments_update" ON public.cab_appointments FOR UPDATE TO authenticated
  USING (public.is_cab_company_member(company_id));

-- cab_companies
DROP POLICY IF EXISTS "Users can access own company data" ON public.cab_companies;
CREATE POLICY "Users can access own company data" ON public.cab_companies FOR ALL TO authenticated
  USING (public.is_cab_company_member(id))
  WITH CHECK (public.is_cab_company_member(id));

-- cab_company_invites
DROP POLICY IF EXISTS "Company admins can manage invites" ON public.cab_company_invites;
CREATE POLICY "Company admins can manage invites" ON public.cab_company_invites FOR ALL TO authenticated
  USING (public.is_cab_company_admin(company_id))
  WITH CHECK (public.is_cab_company_admin(company_id));

-- cab_company_memberships
DROP POLICY IF EXISTS "Company admins can manage memberships" ON public.cab_company_memberships;
CREATE POLICY "Company admins can manage memberships" ON public.cab_company_memberships FOR ALL TO authenticated
  USING (public.is_cab_company_admin(company_id))
  WITH CHECK (public.is_cab_company_admin(company_id));

-- cab_customer_auth_links
DROP POLICY IF EXISTS "Company admins can manage links" ON public.cab_customer_auth_links;
CREATE POLICY "Company admins can manage links" ON public.cab_customer_auth_links FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_customers
DROP POLICY IF EXISTS "Users can access company customers" ON public.cab_customers;
CREATE POLICY "Users can access company customers" ON public.cab_customers FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_events
DROP POLICY IF EXISTS "Users can access company events" ON public.cab_events;
CREATE POLICY "Users can access company events" ON public.cab_events FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_ghl_sync_log
DROP POLICY IF EXISTS "cab_ghl_sync_log_company_access" ON public.cab_ghl_sync_log;
CREATE POLICY "cab_ghl_sync_log_company_access" ON public.cab_ghl_sync_log FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_invoices
DROP POLICY IF EXISTS "Users can access company invoices" ON public.cab_invoices;
CREATE POLICY "Users can access company invoices" ON public.cab_invoices FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_job_sequences
DROP POLICY IF EXISTS "Company users can access sequences" ON public.cab_job_sequences;
CREATE POLICY "Company users can access sequences" ON public.cab_job_sequences FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_jobs
DROP POLICY IF EXISTS "Users can access company jobs" ON public.cab_jobs;
CREATE POLICY "Users can access company jobs" ON public.cab_jobs FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_payments
DROP POLICY IF EXISTS "Users can access company payments" ON public.cab_payments;
CREATE POLICY "Users can access company payments" ON public.cab_payments FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_quote_acceptances
DROP POLICY IF EXISTS "Users can access company quote_acceptances" ON public.cab_quote_acceptances;
CREATE POLICY "Users can access company quote_acceptances" ON public.cab_quote_acceptances FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_quote_views
DROP POLICY IF EXISTS "Users can access company quote_views" ON public.cab_quote_views;
CREATE POLICY "Users can access company quote_views" ON public.cab_quote_views FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_quotes
DROP POLICY IF EXISTS "Users can access company quotes" ON public.cab_quotes;
CREATE POLICY "Users can access company quotes" ON public.cab_quotes FOR ALL TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

-- cab_user_profiles (keep existing but switch to membership check)
DROP POLICY IF EXISTS "Users can read own profile" ON public.cab_user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.cab_user_profiles;
DROP POLICY IF EXISTS "Admins can manage company profiles" ON public.cab_user_profiles;

CREATE POLICY "Users can read own profile" ON public.cab_user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_cab_company_member(company_id));
CREATE POLICY "Users can update own profile" ON public.cab_user_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Admins can manage company profiles" ON public.cab_user_profiles FOR ALL TO authenticated
  USING (public.is_cab_company_admin(company_id))
  WITH CHECK (public.is_cab_company_admin(company_id));
