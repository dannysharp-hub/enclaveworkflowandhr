
-- Add sensitive PII columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bank_sort_code text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bank_account_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bank_account_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bank_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ni_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS passport_number text DEFAULT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.bank_sort_code IS 'UK bank sort code (encrypted at rest)';
COMMENT ON COLUMN public.profiles.ni_number IS 'National Insurance number';
COMMENT ON COLUMN public.profiles.passport_number IS 'Passport number';
