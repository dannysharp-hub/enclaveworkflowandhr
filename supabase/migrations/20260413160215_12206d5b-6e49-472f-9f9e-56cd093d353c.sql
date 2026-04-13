ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS fitter_notes text;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS final_signoff_url text;