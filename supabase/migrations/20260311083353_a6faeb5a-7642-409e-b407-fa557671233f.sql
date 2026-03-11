-- Allow anonymous SELECT on cab_quotes by acceptance_token (for public accept page)
CREATE POLICY "anon_select_by_acceptance_token" ON public.cab_quotes
  FOR SELECT TO anon
  USING (acceptance_token IS NOT NULL);

-- Allow anonymous UPDATE on cab_quotes by acceptance_token (to mark accepted)
CREATE POLICY "anon_update_by_acceptance_token" ON public.cab_quotes
  FOR UPDATE TO anon
  USING (acceptance_token IS NOT NULL)
  WITH CHECK (acceptance_token IS NOT NULL);

-- Allow anonymous SELECT on cab_jobs for accept page
CREATE POLICY "anon_select_cab_jobs_for_accept" ON public.cab_jobs
  FOR SELECT TO anon
  USING (true);

-- Allow anonymous UPDATE on cab_jobs for accept page (stage transition)
CREATE POLICY "anon_update_cab_jobs_for_accept" ON public.cab_jobs
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Allow anonymous SELECT on cab_customers for accept page
CREATE POLICY "anon_select_cab_customers_for_accept" ON public.cab_customers
  FOR SELECT TO anon
  USING (true);

-- Allow anonymous INSERT on cab_events for accept page
CREATE POLICY "anon_insert_cab_events_for_accept" ON public.cab_events
  FOR INSERT TO anon
  WITH CHECK (true);