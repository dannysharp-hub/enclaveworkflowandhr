
-- Extend app_role enum with new roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'production';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'installer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
