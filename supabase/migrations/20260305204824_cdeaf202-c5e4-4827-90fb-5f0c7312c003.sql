
-- 1) Create mapping table
CREATE TABLE public.cab_company_tenant_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id),
  UNIQUE (tenant_id)
);

ALTER TABLE public.cab_company_tenant_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cab_company_tenant_map_admin_select" ON public.cab_company_tenant_map
  FOR SELECT TO authenticated
  USING (public.is_cab_company_admin(company_id));

CREATE POLICY "cab_company_tenant_map_admin_insert" ON public.cab_company_tenant_map
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cab_company_admin(company_id));

CREATE POLICY "cab_company_tenant_map_admin_update" ON public.cab_company_tenant_map
  FOR UPDATE TO authenticated
  USING (public.is_cab_company_admin(company_id))
  WITH CHECK (public.is_cab_company_admin(company_id));

-- Service role needs access for trigger
CREATE POLICY "cab_company_tenant_map_service_select" ON public.cab_company_tenant_map
  FOR SELECT TO service_role
  USING (true);

-- 2) Add legacy_job_id to cab_jobs
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS legacy_job_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_cab_jobs_legacy_job ON public.cab_jobs (company_id, legacy_job_id);

-- 3) Add cab_job_id to jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cab_job_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_cab_job ON public.jobs (tenant_id, cab_job_id);

-- 4) Handoff function: called when job reaches ready_for_production
CREATE OR REPLACE FUNCTION public.cab_handoff_to_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job record;
  v_customer record;
  v_tenant_id uuid;
  v_new_job_id uuid;
  v_job_ref text;
BEGIN
  -- Only fire on job.ready_for_production events
  IF NEW.event_type <> 'job.ready_for_production' THEN
    RETURN NEW;
  END IF;
  IF NEW.job_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_job FROM public.cab_jobs WHERE id = NEW.job_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Already handed off?
  IF v_job.legacy_job_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Get mapping
  SELECT tenant_id INTO v_tenant_id
  FROM public.cab_company_tenant_map
  WHERE company_id = v_job.company_id;

  IF v_tenant_id IS NULL THEN
    -- Soft fail: log missing mapping
    INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
    VALUES (v_job.company_id, 'handoff.mapping_missing', NEW.job_id, '{}'::jsonb, 'pending');
    INSERT INTO public.cab_ghl_sync_log (company_id, action, job_id, success, error)
    VALUES (v_job.company_id, 'handoff_mapping_missing', NEW.job_id::text, false, 'No cab_company_tenant_map row');
    RETURN NEW;
  END IF;

  -- Get customer info
  SELECT * INTO v_customer FROM public.cab_customers WHERE id = v_job.customer_id;

  -- Create legacy job
  v_job_ref := v_job.job_ref;
  INSERT INTO public.jobs (
    job_id, job_name, status, tenant_id, cab_job_id, created_date
  ) VALUES (
    v_job_ref,
    v_job.job_title,
    'draft',
    v_tenant_id,
    v_job.id,
    CURRENT_DATE::text
  ) RETURNING id INTO v_new_job_id;

  -- Link back
  UPDATE public.cab_jobs SET legacy_job_id = v_new_job_id, updated_at = now() WHERE id = NEW.job_id;

  -- Log event
  INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
  VALUES (v_job.company_id, 'handoff.workshop_job_created', NEW.job_id,
    jsonb_build_object('legacy_job_id', v_new_job_id, 'tenant_id', v_tenant_id), 'pending');

  RETURN NEW;
END;
$$;

-- Trigger on cab_events for handoff
DROP TRIGGER IF EXISTS trg_cab_handoff_to_legacy ON public.cab_events;
CREATE TRIGGER trg_cab_handoff_to_legacy
  AFTER INSERT ON public.cab_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'job.ready_for_production')
  EXECUTE FUNCTION public.cab_handoff_to_legacy();

-- 5) Milestone sync: legacy job stage changes emit cab_events
CREATE OR REPLACE FUNCTION public.legacy_milestone_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cab_job_id uuid;
  v_company_id uuid;
  v_event_type text;
BEGIN
  IF NEW.cab_job_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  v_cab_job_id := NEW.cab_job_id;
  SELECT company_id INTO v_company_id FROM public.cab_jobs WHERE id = v_cab_job_id;
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  -- Map legacy status to cab milestone events
  CASE NEW.status
    WHEN 'cnc' THEN v_event_type := 'manufacturing.started';
    WHEN 'assembly_complete' THEN v_event_type := 'cabinetry.assembled';
    WHEN 'ready_for_install' THEN v_event_type := 'ready.for_install';
    WHEN 'installed' THEN v_event_type := 'install.complete';
    ELSE v_event_type := NULL;
  END CASE;

  IF v_event_type IS NOT NULL THEN
    INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
    VALUES (v_company_id, v_event_type, v_cab_job_id,
      jsonb_build_object('source', 'legacy', 'legacy_status', NEW.status, 'legacy_job_id', NEW.id),
      'pending');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legacy_milestone_sync ON public.jobs;
CREATE TRIGGER trg_legacy_milestone_sync
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  WHEN (NEW.cab_job_id IS NOT NULL)
  EXECUTE FUNCTION public.legacy_milestone_sync();
