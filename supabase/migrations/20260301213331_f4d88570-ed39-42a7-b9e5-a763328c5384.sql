
-- =============================================
-- PHASE 1G: Update RLS policies to be tenant-aware
-- Uses get_user_tenant_id() to scope all data
-- =============================================

-- Helper: check tenant match
CREATE OR REPLACE FUNCTION public.is_user_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _tenant_id = public.get_user_tenant_id(auth.uid())
$$;

-- =============================================
-- PROFILES
-- =============================================
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;

CREATE POLICY "Users can view tenant profiles"
ON public.profiles FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can update tenant profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can insert tenant profiles"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- =============================================
-- USER_ROLES
-- =============================================
DROP POLICY IF EXISTS "Users can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Users can view tenant roles"
ON public.user_roles FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant roles"
ON public.user_roles FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- =============================================
-- JOBS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view jobs" ON public.jobs;
DROP POLICY IF EXISTS "Engineers+ can create jobs" ON public.jobs;
DROP POLICY IF EXISTS "Engineers+ can update jobs" ON public.jobs;

CREATE POLICY "Users can view tenant jobs"
ON public.jobs FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Engineers+ can create tenant jobs"
ON public.jobs FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer') OR public.has_role(auth.uid(), 'supervisor')));

CREATE POLICY "Engineers+ can update tenant jobs"
ON public.jobs FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer') OR public.has_role(auth.uid(), 'supervisor')));

-- =============================================
-- PARTS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view parts" ON public.parts;
DROP POLICY IF EXISTS "Engineers+ can manage parts" ON public.parts;

CREATE POLICY "Users can view tenant parts"
ON public.parts FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Engineers+ can manage tenant parts"
ON public.parts FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer') OR public.has_role(auth.uid(), 'supervisor')));

-- =============================================
-- JOB_STAGES
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view stages" ON public.job_stages;
DROP POLICY IF EXISTS "Supervisors+ can manage stages" ON public.job_stages;

CREATE POLICY "Users can view tenant stages"
ON public.job_stages FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Supervisors+ can manage tenant stages"
ON public.job_stages FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'engineer')));

-- =============================================
-- MATERIALS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view materials" ON public.materials;
DROP POLICY IF EXISTS "Engineers+ can manage materials" ON public.materials;

CREATE POLICY "Users can view tenant materials"
ON public.materials FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Engineers+ can manage tenant materials"
ON public.materials FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer')));

-- =============================================
-- REMNANTS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view remnants" ON public.remnants;
DROP POLICY IF EXISTS "Operators+ can manage remnants" ON public.remnants;

CREATE POLICY "Users can view tenant remnants"
ON public.remnants FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Operators+ can manage tenant remnants"
ON public.remnants FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'operator')));

-- =============================================
-- CALENDAR_EVENTS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view events" ON public.calendar_events;
DROP POLICY IF EXISTS "Supervisors+ can manage events" ON public.calendar_events;

CREATE POLICY "Users can view tenant events"
ON public.calendar_events FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Supervisors+ can manage tenant events"
ON public.calendar_events FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'office')));

-- =============================================
-- FILE_ASSETS
-- =============================================
DROP POLICY IF EXISTS "Admins can manage files" ON public.file_assets;
DROP POLICY IF EXISTS "Authenticated users can view active files" ON public.file_assets;

CREATE POLICY "Users can view tenant files"
ON public.file_assets FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant files"
ON public.file_assets FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));

-- =============================================
-- FILE_READ_RECEIPTS
-- =============================================
DROP POLICY IF EXISTS "Admins can view all receipts" ON public.file_read_receipts;
DROP POLICY IF EXISTS "Users can create own receipts" ON public.file_read_receipts;
DROP POLICY IF EXISTS "Users can update own receipts" ON public.file_read_receipts;
DROP POLICY IF EXISTS "Users can view own receipts" ON public.file_read_receipts;

CREATE POLICY "Admins can view tenant receipts"
ON public.file_read_receipts FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));

CREATE POLICY "Users can view own tenant receipts"
ON public.file_read_receipts FOR SELECT TO authenticated
USING (auth.uid() = staff_id AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create own tenant receipts"
ON public.file_read_receipts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = staff_id AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update own tenant receipts"
ON public.file_read_receipts FOR UPDATE TO authenticated
USING (auth.uid() = staff_id AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================
-- HOLIDAY_REQUESTS
-- =============================================
DROP POLICY IF EXISTS "Supervisors can update holiday requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Supervisors can view all holiday requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Users can create own holiday requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Users can view own holiday requests" ON public.holiday_requests;

CREATE POLICY "Users can view own tenant holidays"
ON public.holiday_requests FOR SELECT TO authenticated
USING (auth.uid() = staff_id AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Supervisors can view tenant holidays"
ON public.holiday_requests FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'office')));

CREATE POLICY "Users can create own tenant holidays"
ON public.holiday_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = staff_id AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Supervisors can update tenant holidays"
ON public.holiday_requests FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')));

-- =============================================
-- NOTIFICATIONS
-- =============================================
DROP POLICY IF EXISTS "Service role can insert" ON public.notifications;
DROP POLICY IF EXISTS "Supervisors can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;

CREATE POLICY "Users can view own tenant notifications"
ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update own tenant notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Supervisors can insert tenant notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'engineer')));

CREATE POLICY "Service role can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- =============================================
-- SKILLS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view skills" ON public.skills;
DROP POLICY IF EXISTS "Admins can manage skills" ON public.skills;

CREATE POLICY "Users can view tenant skills"
ON public.skills FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant skills"
ON public.skills FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer')));

-- =============================================
-- STAFF_SKILLS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view staff skills" ON public.staff_skills;
DROP POLICY IF EXISTS "Supervisors+ can manage staff skills" ON public.staff_skills;

CREATE POLICY "Users can view tenant staff skills"
ON public.staff_skills FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Supervisors+ can manage tenant staff skills"
ON public.staff_skills FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'engineer')));

-- =============================================
-- STAGE_SKILL_REQUIREMENTS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view requirements" ON public.stage_skill_requirements;
DROP POLICY IF EXISTS "Admins can manage requirements" ON public.stage_skill_requirements;

CREATE POLICY "Users can view tenant requirements"
ON public.stage_skill_requirements FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant requirements"
ON public.stage_skill_requirements FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer')));

-- =============================================
-- STAFF_DOCUMENTS
-- =============================================
DROP POLICY IF EXISTS "Admins can manage all staff documents" ON public.staff_documents;
DROP POLICY IF EXISTS "Staff can view own documents" ON public.staff_documents;

CREATE POLICY "Admins can manage tenant staff documents"
ON public.staff_documents FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view own tenant documents"
ON public.staff_documents FOR SELECT TO authenticated
USING (auth.uid() = staff_id AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================
-- STAFF_NOTES
-- =============================================
DROP POLICY IF EXISTS "Admins can manage staff notes" ON public.staff_notes;

CREATE POLICY "Admins can manage tenant staff notes"
ON public.staff_notes FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- =============================================
-- TRAINING_RECORDS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view training records" ON public.training_records;
DROP POLICY IF EXISTS "Supervisors+ can manage training records" ON public.training_records;

CREATE POLICY "Users can view tenant training records"
ON public.training_records FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Supervisors+ can manage tenant training records"
ON public.training_records FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'engineer')));

-- =============================================
-- TOOLPATH_TEMPLATES
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.toolpath_templates;
DROP POLICY IF EXISTS "Engineers+ can manage templates" ON public.toolpath_templates;

CREATE POLICY "Users can view tenant templates"
ON public.toolpath_templates FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Engineers+ can manage tenant templates"
ON public.toolpath_templates FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer')));

-- =============================================
-- PRODUCT_MAPPINGS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view mappings" ON public.product_mappings;
DROP POLICY IF EXISTS "Engineers+ can manage mappings" ON public.product_mappings;

CREATE POLICY "Users can view tenant mappings"
ON public.product_mappings FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Engineers+ can manage tenant mappings"
ON public.product_mappings FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer')));

-- =============================================
-- REVIEWS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view reviews" ON public.reviews;
DROP POLICY IF EXISTS "Supervisors+ can manage reviews" ON public.reviews;

CREATE POLICY "Users can view tenant reviews"
ON public.reviews FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Supervisors+ can manage tenant reviews"
ON public.reviews FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'engineer')))
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'engineer')));
