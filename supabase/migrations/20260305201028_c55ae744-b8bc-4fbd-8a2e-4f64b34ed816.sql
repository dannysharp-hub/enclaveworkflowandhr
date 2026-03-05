
-- Add appointment request tracking fields to cab_jobs
ALTER TABLE public.cab_jobs
  ADD COLUMN IF NOT EXISTS appointment_requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS appointment_requested_by uuid NULL,
  ADD COLUMN IF NOT EXISTS booking_url text NULL;

-- Index for appointment request queries
CREATE INDEX IF NOT EXISTS idx_cab_jobs_appt_requested
  ON public.cab_jobs (company_id, appointment_requested_at)
  WHERE appointment_requested_at IS NOT NULL;
