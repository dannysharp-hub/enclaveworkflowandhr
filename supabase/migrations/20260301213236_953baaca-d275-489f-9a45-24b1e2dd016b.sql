
-- =============================================
-- PHASE 1A: Create tenants table & seed default
-- =============================================

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/London',
  default_units text NOT NULL DEFAULT 'mm',
  branding jsonb NOT NULL DEFAULT '{}',
  subscription_status text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Insert the default tenant for existing data
INSERT INTO public.tenants (id, tenant_name, subscription_status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Enclave Cabinetry', 'internal');

-- Trigger for updated_at
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- PHASE 1B: Add tenant_id to all business tables
-- =============================================

-- Helper: default tenant UUID
-- profiles
ALTER TABLE public.profiles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- user_roles
ALTER TABLE public.user_roles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.user_roles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- jobs
ALTER TABLE public.jobs ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.jobs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- parts
ALTER TABLE public.parts ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.parts SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- job_stages
ALTER TABLE public.job_stages ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.job_stages SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- materials
ALTER TABLE public.materials ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.materials SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- remnants
ALTER TABLE public.remnants ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.remnants SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- calendar_events
ALTER TABLE public.calendar_events ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.calendar_events SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- file_assets
ALTER TABLE public.file_assets ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.file_assets SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- file_read_receipts
ALTER TABLE public.file_read_receipts ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.file_read_receipts SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- holiday_requests
ALTER TABLE public.holiday_requests ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.holiday_requests SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- notifications
ALTER TABLE public.notifications ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.notifications SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- skills
ALTER TABLE public.skills ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.skills SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- staff_skills
ALTER TABLE public.staff_skills ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.staff_skills SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- stage_skill_requirements
ALTER TABLE public.stage_skill_requirements ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.stage_skill_requirements SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- staff_documents
ALTER TABLE public.staff_documents ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.staff_documents SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- staff_notes
ALTER TABLE public.staff_notes ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.staff_notes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- training_records
ALTER TABLE public.training_records ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.training_records SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- toolpath_templates
ALTER TABLE public.toolpath_templates ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.toolpath_templates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- product_mappings
ALTER TABLE public.product_mappings ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.product_mappings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- reviews
ALTER TABLE public.reviews ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL;
UPDATE public.reviews SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- =============================================
-- PHASE 1C: Tenant lookup function for RLS
-- =============================================

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- =============================================
-- PHASE 1D: Update handle_new_user to assign tenant
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
BEGIN
  -- Default to first tenant if not specified in metadata
  _tenant_id := COALESCE(
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    '00000000-0000-0000-0000-000000000001'
  );

  INSERT INTO public.profiles (user_id, full_name, email, tenant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    _tenant_id
  );
  -- Default role: viewer
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, 'viewer', _tenant_id);
  RETURN NEW;
END;
$$;

-- =============================================
-- PHASE 1E: Indexes for tenant_id on all tables
-- =============================================

CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX idx_user_roles_tenant ON public.user_roles(tenant_id);
CREATE INDEX idx_jobs_tenant ON public.jobs(tenant_id);
CREATE INDEX idx_parts_tenant ON public.parts(tenant_id);
CREATE INDEX idx_job_stages_tenant ON public.job_stages(tenant_id);
CREATE INDEX idx_materials_tenant ON public.materials(tenant_id);
CREATE INDEX idx_remnants_tenant ON public.remnants(tenant_id);
CREATE INDEX idx_calendar_events_tenant ON public.calendar_events(tenant_id);
CREATE INDEX idx_file_assets_tenant ON public.file_assets(tenant_id);
CREATE INDEX idx_file_read_receipts_tenant ON public.file_read_receipts(tenant_id);
CREATE INDEX idx_holiday_requests_tenant ON public.holiday_requests(tenant_id);
CREATE INDEX idx_notifications_tenant ON public.notifications(tenant_id);
CREATE INDEX idx_skills_tenant ON public.skills(tenant_id);
CREATE INDEX idx_staff_skills_tenant ON public.staff_skills(tenant_id);
CREATE INDEX idx_stage_skill_requirements_tenant ON public.stage_skill_requirements(tenant_id);
CREATE INDEX idx_staff_documents_tenant ON public.staff_documents(tenant_id);
CREATE INDEX idx_staff_notes_tenant ON public.staff_notes(tenant_id);
CREATE INDEX idx_training_records_tenant ON public.training_records(tenant_id);
CREATE INDEX idx_toolpath_templates_tenant ON public.toolpath_templates(tenant_id);
CREATE INDEX idx_product_mappings_tenant ON public.product_mappings(tenant_id);
CREATE INDEX idx_reviews_tenant ON public.reviews(tenant_id);

-- =============================================
-- PHASE 1F: Tenants RLS policies
-- =============================================

-- Users can view their own tenant
CREATE POLICY "Users can view own tenant"
ON public.tenants FOR SELECT
TO authenticated
USING (id = public.get_user_tenant_id(auth.uid()));

-- Admins can update own tenant
CREATE POLICY "Admins can update own tenant"
ON public.tenants FOR UPDATE
TO authenticated
USING (id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));
