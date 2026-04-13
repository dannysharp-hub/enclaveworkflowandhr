
-- Create the scheduled_tasks table
CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,
  job_id uuid REFERENCES public.cab_jobs(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;

-- RLS: company members can view their own scheduled tasks
CREATE POLICY "Company members can view scheduled tasks"
  ON public.scheduled_tasks FOR SELECT
  TO authenticated
  USING (public.is_cab_company_member(company_id));

-- RLS: company members can insert scheduled tasks
CREATE POLICY "Company members can insert scheduled tasks"
  ON public.scheduled_tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_cab_company_member(company_id));

-- RLS: company members can update scheduled tasks
CREATE POLICY "Company members can update scheduled tasks"
  ON public.scheduled_tasks FOR UPDATE
  TO authenticated
  USING (public.is_cab_company_member(company_id));

-- Index for the cron query pattern
CREATE INDEX idx_scheduled_tasks_pending ON public.scheduled_tasks (status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX idx_scheduled_tasks_job ON public.scheduled_tasks (job_id);

-- Trigger: auto-schedule review request on job.completed event
CREATE OR REPLACE FUNCTION public.schedule_review_on_job_completed()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.event_type = 'job.completed' AND NEW.job_id IS NOT NULL THEN
    -- Only insert if no pending review request already exists for this job
    IF NOT EXISTS (
      SELECT 1 FROM public.scheduled_tasks
      WHERE job_id = NEW.job_id
        AND task_type = 'google_review_request'
        AND status = 'pending'
    ) THEN
      INSERT INTO public.scheduled_tasks (task_type, job_id, company_id, scheduled_for, status, payload_json)
      VALUES (
        'google_review_request',
        NEW.job_id,
        NEW.company_id,
        now() + interval '5 days',
        'pending',
        jsonb_build_object('event_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_schedule_review_on_job_completed
  AFTER INSERT ON public.cab_events
  FOR EACH ROW
  EXECUTE FUNCTION public.schedule_review_on_job_completed();

-- Updated_at trigger
CREATE TRIGGER update_scheduled_tasks_updated_at
  BEFORE UPDATE ON public.scheduled_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
