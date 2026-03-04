UPDATE public.google_drive_integration_settings
SET folder_name_pattern = '^\d{3}_.+$',
    job_number_parse_regex = '^(\d{3})_(.+)$';