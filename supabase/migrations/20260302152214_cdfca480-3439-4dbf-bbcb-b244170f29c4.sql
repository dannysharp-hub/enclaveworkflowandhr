ALTER TABLE public.profiles 
  ADD COLUMN pay_type text NOT NULL DEFAULT 'hourly',
  ADD COLUMN hourly_rate numeric DEFAULT NULL,
  ADD COLUMN annual_salary numeric DEFAULT NULL;