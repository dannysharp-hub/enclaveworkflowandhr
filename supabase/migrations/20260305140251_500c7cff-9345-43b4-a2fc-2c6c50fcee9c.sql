
CREATE TABLE public.cab_ghl_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.cab_events(id),
  job_id uuid REFERENCES public.cab_jobs(id),
  action text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cab_ghl_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cab_ghl_sync_log_company_access" ON public.cab_ghl_sync_log
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));

CREATE INDEX idx_cab_ghl_sync_log_company ON public.cab_ghl_sync_log(company_id);
CREATE INDEX idx_cab_ghl_sync_log_event ON public.cab_ghl_sync_log(event_id);
