
-- Add install date booking columns to cab_jobs
ALTER TABLE public.cab_jobs
  ADD COLUMN IF NOT EXISTS install_date_option_1 date,
  ADD COLUMN IF NOT EXISTS install_date_option_2 date,
  ADD COLUMN IF NOT EXISTS install_date_option_3 date,
  ADD COLUMN IF NOT EXISTS install_date date,
  ADD COLUMN IF NOT EXISTS install_date_token text;
