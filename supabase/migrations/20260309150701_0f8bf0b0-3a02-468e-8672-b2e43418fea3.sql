ALTER TABLE public.cab_quotes 
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_filename text;