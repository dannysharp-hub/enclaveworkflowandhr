ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS deposit_amount numeric;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS progress_payment_amount numeric;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS progress_payment_paid_at timestamptz;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS final_payment_amount numeric;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS final_payment_paid_at timestamptz;