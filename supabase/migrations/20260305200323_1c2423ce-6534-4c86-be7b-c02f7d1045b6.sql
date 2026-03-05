
-- Add ballpark fields to cab_jobs
ALTER TABLE public.cab_jobs
  ADD COLUMN IF NOT EXISTS ballpark_min numeric NULL,
  ADD COLUMN IF NOT EXISTS ballpark_max numeric NULL,
  ADD COLUMN IF NOT EXISTS ballpark_internal_notes text NULL,
  ADD COLUMN IF NOT EXISTS ballpark_customer_message text NULL,
  ADD COLUMN IF NOT EXISTS ballpark_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ballpark_sent_by uuid NULL,
  ADD COLUMN IF NOT EXISTS ballpark_currency text NOT NULL DEFAULT 'GBP';

-- Index for queries
CREATE INDEX IF NOT EXISTS idx_cab_jobs_ballpark_sent ON public.cab_jobs (company_id, ballpark_sent_at) WHERE ballpark_sent_at IS NOT NULL;
