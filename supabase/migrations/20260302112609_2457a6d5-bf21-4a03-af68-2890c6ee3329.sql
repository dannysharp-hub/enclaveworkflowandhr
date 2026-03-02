
-- Enable pgsodium for token encryption
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- ============================================================
-- 1) google_integration_settings (one per tenant)
-- ============================================================
CREATE TABLE public.google_integration_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_connected boolean NOT NULL DEFAULT false,
  google_user_email text,
  google_user_id text,
  granted_scopes jsonb DEFAULT '[]'::jsonb,
  sync_mode text NOT NULL DEFAULT 'one_way_app_to_google',
  conflict_policy text NOT NULL DEFAULT 'app_wins',
  default_timezone text NOT NULL DEFAULT 'Europe/London',
  status text NOT NULL DEFAULT 'disconnected',
  last_health_check_at timestamptz,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.google_integration_settings
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER update_google_integration_settings_updated_at
  BEFORE UPDATE ON public.google_integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) google_oauth_tokens (service-role only - NO client access)
-- ============================================================
CREATE TABLE public.google_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL,
  token_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- NO RLS policies = only service_role can access this table

CREATE TRIGGER update_google_oauth_tokens_updated_at
  BEFORE UPDATE ON public.google_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) google_calendar_mappings
-- ============================================================
CREATE TABLE public.google_calendar_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  google_calendar_id text NOT NULL,
  google_calendar_name text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_type)
);

ALTER TABLE public.google_calendar_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.google_calendar_mappings
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

-- ============================================================
-- 4) calendar_sync_links (app event <-> google event)
-- ============================================================
CREATE TABLE public.calendar_sync_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_event_id uuid NOT NULL,
  google_calendar_id text NOT NULL,
  google_event_id text,
  google_etag text,
  sync_status text NOT NULL DEFAULT 'pending_create',
  last_synced_at timestamptz,
  last_sync_attempt_at timestamptz,
  error_message text,
  direction_last_sync text DEFAULT 'app_to_google',
  checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_sync_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.calendar_sync_links
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER update_calendar_sync_links_updated_at
  BEFORE UPDATE ON public.calendar_sync_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5) calendar_sync_queue (reliable background sync)
-- ============================================================
CREATE TABLE public.calendar_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_event_id uuid,
  google_calendar_id text,
  google_event_id text,
  action text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'queued',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.calendar_sync_queue
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER update_calendar_sync_queue_updated_at
  BEFORE UPDATE ON public.calendar_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6) calendar_sync_audit
-- ============================================================
CREATE TABLE public.calendar_sync_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_staff_id uuid,
  action text NOT NULL,
  app_event_id uuid,
  google_event_id text,
  payload_before_json jsonb,
  payload_after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_sync_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.calendar_sync_audit
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

-- ============================================================
-- 7) DB function to queue sync from triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.queue_calendar_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
  v_event_type text;
  v_calendar_id text;
  v_tenant_id uuid;
BEGIN
  -- Determine action
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
    v_action := 'delete';
  ELSIF TG_OP = 'INSERT' THEN
    v_tenant_id := NEW.tenant_id;
    v_action := 'create';
  ELSE
    v_tenant_id := NEW.tenant_id;
    v_action := 'update';
  END IF;

  -- Check if tenant has Google connected
  IF NOT EXISTS (
    SELECT 1 FROM public.google_integration_settings
    WHERE tenant_id = v_tenant_id AND is_connected = true
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Queue the sync item
  INSERT INTO public.calendar_sync_queue (tenant_id, app_event_id, action, priority)
  VALUES (
    v_tenant_id,
    COALESCE(NEW.id, OLD.id),
    v_action,
    'normal'
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach trigger to calendar_events table
CREATE TRIGGER trg_calendar_events_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.queue_calendar_sync();
