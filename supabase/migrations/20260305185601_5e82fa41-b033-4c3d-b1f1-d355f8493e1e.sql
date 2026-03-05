CREATE TABLE public.cab_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'ghl',
  event_type text,
  status text NOT NULL DEFAULT 'received',
  job_ref text,
  contact_id text,
  email text,
  phone text,
  payload_json jsonb,
  company_id uuid REFERENCES public.cab_companies(id)
);

ALTER TABLE public.cab_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read webhook logs"
  ON public.cab_webhook_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert webhook logs"
  ON public.cab_webhook_logs FOR INSERT
  WITH CHECK (true);