
-- Drop the old trigger on jobs (status-based, won't work since legacy uses job_stages)
DROP TRIGGER IF EXISTS trg_legacy_milestone_sync ON public.jobs;
DROP FUNCTION IF EXISTS public.legacy_milestone_sync();

-- Create milestone sync on job_stages table instead
CREATE OR REPLACE FUNCTION public.legacy_stage_milestone_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job record;
  v_cab_job_id uuid;
  v_company_id uuid;
  v_event_type text;
  v_milestone_key text;
BEGIN
  -- Only fire when stage status changes to 'Done' (completed)
  IF NEW.status <> 'Done' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  -- Look up the parent job and check for cab_job_id link
  SELECT cab_job_id INTO v_cab_job_id FROM public.jobs WHERE id = NEW.job_id;
  IF v_cab_job_id IS NULL THEN RETURN NEW; END IF;

  SELECT company_id INTO v_company_id FROM public.cab_jobs WHERE id = v_cab_job_id;
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  -- Map stage_name (case-insensitive) to cab milestone events
  CASE lower(NEW.stage_name)
    WHEN 'cnc', 'cnc machining', 'cnc cutting' THEN
      v_event_type := 'manufacturing.started';
      v_milestone_key := 'manufacturing_started';
    WHEN 'assembly', 'assembly complete', 'assembly completed' THEN
      v_event_type := 'cabinetry.assembled';
      v_milestone_key := 'cabinetry_assembled';
    WHEN 'packaging', 'packed', 'pack' THEN
      v_event_type := 'cabinetry.assembled';
      v_milestone_key := 'cabinetry_assembled';
    WHEN 'install', 'installation', 'ready for install' THEN
      v_event_type := 'ready.for_install';
      v_milestone_key := 'ready_for_installation';
    WHEN 'install complete', 'installed' THEN
      v_event_type := 'install.complete';
      v_milestone_key := 'installation_complete';
    WHEN 'sign off', 'sign-off', 'practical completion', 'complete' THEN
      v_event_type := 'customer.signoff.completed';
      v_milestone_key := 'practical_completed';
    ELSE
      v_event_type := NULL;
  END CASE;

  IF v_event_type IS NOT NULL THEN
    -- Update cab_jobs milestone
    UPDATE public.cab_jobs SET
      current_stage_key = v_milestone_key,
      updated_at = now()
    WHERE id = v_cab_job_id;

    -- Insert cab event
    INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
    VALUES (v_company_id, v_event_type, v_cab_job_id,
      jsonb_build_object(
        'source', 'legacy_stage',
        'stage_name', NEW.stage_name,
        'legacy_job_id', NEW.job_id
      ),
      'pending');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_legacy_stage_milestone_sync
  AFTER UPDATE ON public.job_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.legacy_stage_milestone_sync();

-- Also keep a simpler trigger on jobs.status for direct status changes (e.g. 'complete')
CREATE OR REPLACE FUNCTION public.legacy_job_status_milestone_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF NEW.cab_job_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  SELECT company_id INTO v_company_id FROM public.cab_jobs WHERE id = NEW.cab_job_id;
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'complete' THEN
    UPDATE public.cab_jobs SET
      current_stage_key = 'closed_paid',
      state = 'closed',
      status = 'closed',
      production_stage_key = 'closed',
      updated_at = now()
    WHERE id = NEW.cab_job_id;

    INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
    VALUES (v_company_id, 'job.closed', NEW.cab_job_id,
      jsonb_build_object('source', 'legacy', 'legacy_job_id', NEW.id), 'pending');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_legacy_job_status_milestone_sync
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  WHEN (NEW.cab_job_id IS NOT NULL)
  EXECUTE FUNCTION public.legacy_job_status_milestone_sync();
