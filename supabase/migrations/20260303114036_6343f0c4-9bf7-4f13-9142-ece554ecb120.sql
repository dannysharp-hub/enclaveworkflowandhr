
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS overtime_threshold_hours numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS holiday_model text NOT NULL DEFAULT 'accrual',
  ADD COLUMN IF NOT EXISTS enable_break_tracking boolean NOT NULL DEFAULT false;
