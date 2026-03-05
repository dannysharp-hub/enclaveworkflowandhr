ALTER TABLE public.cab_jobs
ADD COLUMN IF NOT EXISTS assigned_rep_name text DEFAULT 'Alistair',
ADD COLUMN IF NOT EXISTS assigned_rep_calendar_id text;