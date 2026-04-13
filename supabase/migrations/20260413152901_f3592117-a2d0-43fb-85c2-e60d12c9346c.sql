ALTER TABLE public.cab_jobs
ADD COLUMN IF NOT EXISTS dry_fit_photo_urls text[],
ADD COLUMN IF NOT EXISTS dry_fit_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS dry_fit_completed_at timestamptz;