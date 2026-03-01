
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text DEFAULT NULL;
