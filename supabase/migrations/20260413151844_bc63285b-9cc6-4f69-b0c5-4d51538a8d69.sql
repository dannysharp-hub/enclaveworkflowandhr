ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS site_visit_2_date timestamptz;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS site_visit_2_completed boolean DEFAULT false;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS site_visit_2_notes text;