ALTER TABLE public.google_drive_integration_settings
  ALTER COLUMN folder_name_pattern SET DEFAULT '^\d{3}_.+$',
  ALTER COLUMN job_number_parse_regex SET DEFAULT '^(\d{3})_(.+)$';

UPDATE public.google_drive_integration_settings
SET folder_name_pattern = '^\d{3}_.+$',
    job_number_parse_regex = '^(\d{3})_(.+)$'
WHERE folder_name_pattern = '^[0-9]{3,6}\s*-\s*.+$';