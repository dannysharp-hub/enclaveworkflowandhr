
-- Auto-set tenant_id on insert for all tenant-scoped tables
-- This ensures inserts always get the correct tenant_id without frontend changes

CREATE OR REPLACE FUNCTION public.set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If tenant_id not explicitly set or is the default, use the user's tenant
  IF NEW.tenant_id IS NULL OR NEW.tenant_id = '00000000-0000-0000-0000-000000000001' THEN
    NEW.tenant_id := COALESCE(
      public.get_user_tenant_id(auth.uid()),
      '00000000-0000-0000-0000-000000000001'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Apply to all tenant-scoped tables
CREATE TRIGGER set_tenant_id_jobs BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_parts BEFORE INSERT ON public.parts FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_job_stages BEFORE INSERT ON public.job_stages FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_materials BEFORE INSERT ON public.materials FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_remnants BEFORE INSERT ON public.remnants FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_calendar_events BEFORE INSERT ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_file_assets BEFORE INSERT ON public.file_assets FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_file_read_receipts BEFORE INSERT ON public.file_read_receipts FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_holiday_requests BEFORE INSERT ON public.holiday_requests FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_notifications BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_skills BEFORE INSERT ON public.skills FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_staff_skills BEFORE INSERT ON public.staff_skills FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_stage_skill_requirements BEFORE INSERT ON public.stage_skill_requirements FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_staff_documents BEFORE INSERT ON public.staff_documents FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_staff_notes BEFORE INSERT ON public.staff_notes FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_training_records BEFORE INSERT ON public.training_records FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_toolpath_templates BEFORE INSERT ON public.toolpath_templates FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_product_mappings BEFORE INSERT ON public.product_mappings FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
CREATE TRIGGER set_tenant_id_reviews BEFORE INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
