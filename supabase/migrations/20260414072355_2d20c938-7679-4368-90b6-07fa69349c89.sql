-- Enable pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function that queues a job card regeneration via pg_net
CREATE OR REPLACE FUNCTION public.queue_job_card_regeneration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_service_key text;
BEGIN
  -- Only fire if the job has a Drive folder
  IF NEW.drive_folder_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if relevant fields actually changed
  IF TG_OP = 'UPDATE' AND
    OLD.production_stage_key IS NOT DISTINCT FROM NEW.production_stage_key AND
    OLD.contract_value IS NOT DISTINCT FROM NEW.contract_value AND
    OLD.deposit_paid_at IS NOT DISTINCT FROM NEW.deposit_paid_at AND
    OLD.progress_payment_paid_at IS NOT DISTINCT FROM NEW.progress_payment_paid_at AND
    OLD.final_payment_paid_at IS NOT DISTINCT FROM NEW.final_payment_paid_at AND
    OLD.customer_signoff_at IS NOT DISTINCT FROM NEW.customer_signoff_at AND
    OLD.install_completed_at IS NOT DISTINCT FROM NEW.install_completed_at AND
    OLD.status IS NOT DISTINCT FROM NEW.status
  THEN
    RETURN NEW;
  END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- If settings aren't available, skip silently
  IF v_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := v_url || '/functions/v1/generate-job-card-pdf',
    body := jsonb_build_object('job_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    )
  );

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_regenerate_job_card ON public.cab_jobs;
CREATE TRIGGER trg_regenerate_job_card
  AFTER INSERT OR UPDATE ON public.cab_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_job_card_regeneration();