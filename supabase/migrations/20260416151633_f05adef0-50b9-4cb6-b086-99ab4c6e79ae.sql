
ALTER TABLE public.cab_jobs
  ADD COLUMN IF NOT EXISTS fitter_signature_url text,
  ADD COLUMN IF NOT EXISTS fitter_signed_by text,
  ADD COLUMN IF NOT EXISTS fitter_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fitter_checklist_json jsonb,
  ADD COLUMN IF NOT EXISTS completion_certificate_url text;
