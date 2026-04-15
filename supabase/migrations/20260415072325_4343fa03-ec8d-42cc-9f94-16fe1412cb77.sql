
CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text,
  user_role text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  resource_name text,
  metadata_json jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now(),
  tenant_id text
);

CREATE INDEX idx_activity_log_user ON public.user_activity_log (user_id);
CREATE INDEX idx_activity_log_action ON public.user_activity_log (action);
CREATE INDEX idx_activity_log_created ON public.user_activity_log (created_at DESC);
CREATE INDEX idx_activity_log_tenant ON public.user_activity_log (tenant_id);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert their own log entries
CREATE POLICY "Users can insert own activity"
  ON public.user_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only admins can read all activity logs
CREATE POLICY "Admins can read all activity"
  ON public.user_activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cab_company_memberships
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
