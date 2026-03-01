
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'engineer', 'supervisor', 'operator', 'office', 'viewer');

-- Departments enum
CREATE TYPE public.app_department AS ENUM ('CNC', 'Assembly', 'Spray', 'Install', 'Office');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  department app_department NOT NULL DEFAULT 'Office',
  employment_type TEXT NOT NULL DEFAULT 'Full-time',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  contracted_hours_per_week NUMERIC NOT NULL DEFAULT 40,
  holiday_allowance_days INTEGER NOT NULL DEFAULT 25,
  holiday_balance_days INTEGER NOT NULL DEFAULT 25,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate as required)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user's primary role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  -- Default role: viewer
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'viewer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS for user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Jobs table
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL UNIQUE,
  job_name TEXT NOT NULL,
  created_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','exported','cutting','complete')),
  parts_count INTEGER NOT NULL DEFAULT 0,
  materials_count INTEGER NOT NULL DEFAULT 0,
  sheets_estimated INTEGER NOT NULL DEFAULT 0,
  sheet_length_mm INTEGER NOT NULL DEFAULT 2440,
  sheet_width_mm INTEGER NOT NULL DEFAULT 1220,
  spacing_mm INTEGER NOT NULL DEFAULT 10,
  margin_mm INTEGER NOT NULL DEFAULT 15,
  allow_remnants BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view jobs" ON public.jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Engineers+ can create jobs" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'engineer') OR
    public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Engineers+ can update jobs" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'engineer') OR
    public.has_role(auth.uid(), 'supervisor')
  );

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Job stages
CREATE TABLE public.job_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL CHECK (stage_name IN ('Design','Programming','CNC','Edgebanding','Assembly','Spray','Install')),
  status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started','In Progress','Blocked','Done')),
  assigned_staff_ids UUID[] DEFAULT '{}',
  due_date DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stages" ON public.job_stages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Supervisors+ can manage stages" ON public.job_stages
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'engineer')
  );

CREATE TRIGGER update_job_stages_updated_at
  BEFORE UPDATE ON public.job_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Materials
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  thickness_mm NUMERIC NOT NULL,
  sheet_length_mm INTEGER NOT NULL DEFAULT 2440,
  sheet_width_mm INTEGER NOT NULL DEFAULT 1220,
  grain_direction TEXT NOT NULL DEFAULT 'length' CHECK (grain_direction IN ('length','width')),
  colour_name TEXT NOT NULL,
  cost_per_sheet NUMERIC,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view materials" ON public.materials
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Engineers+ can manage materials" ON public.materials
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'engineer')
  );

CREATE TRIGGER update_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Remnants
CREATE TABLE public.remnants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_code TEXT NOT NULL REFERENCES public.materials(material_code),
  thickness_mm NUMERIC NOT NULL,
  colour_name TEXT NOT NULL,
  length_mm NUMERIC NOT NULL,
  width_mm NUMERIC NOT NULL,
  grain_direction TEXT NOT NULL DEFAULT 'length' CHECK (grain_direction IN ('length','width')),
  location TEXT NOT NULL DEFAULT '',
  source_job_id UUID REFERENCES public.jobs(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','used','discarded')),
  created_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.remnants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view remnants" ON public.remnants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Operators+ can manage remnants" ON public.remnants
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'engineer') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'operator')
  );

CREATE TRIGGER update_remnants_updated_at
  BEFORE UPDATE ON public.remnants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Calendar events
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('Production','Install','Meeting','Holiday','Sick','Training','Maintenance')),
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  assigned_staff_ids UUID[] DEFAULT '{}',
  job_id UUID REFERENCES public.jobs(id),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view events" ON public.calendar_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Supervisors+ can manage events" ON public.calendar_events
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'office')
  );

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Holiday requests
CREATE TABLE public.holiday_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES auth.users(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'Holiday' CHECK (type IN ('Holiday','Sick','Unpaid','Appointment')),
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected','Cancelled')),
  approver_staff_id UUID REFERENCES auth.users(id),
  decision_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.holiday_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own holiday requests" ON public.holiday_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = staff_id);

CREATE POLICY "Supervisors can view all holiday requests" ON public.holiday_requests
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'office')
  );

CREATE POLICY "Users can create own holiday requests" ON public.holiday_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Supervisors can update holiday requests" ON public.holiday_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'supervisor')
  );

CREATE TRIGGER update_holiday_requests_updated_at
  BEFORE UPDATE ON public.holiday_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- File assets (documents)
CREATE TABLE public.file_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other' CHECK (category IN ('SOP','Safety','Machine','HR','JobPack','Template','Other')),
  version INTEGER NOT NULL DEFAULT 1,
  file_reference TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  acknowledgement_type TEXT DEFAULT 'open_only' CHECK (acknowledgement_type IN ('open_only','open_and_confirm')),
  role_visibility app_role[] DEFAULT '{}',
  department_visibility app_department[] DEFAULT '{}',
  mandatory_for_roles app_role[] DEFAULT '{}',
  mandatory_for_departments app_department[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.file_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active files" ON public.file_assets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage files" ON public.file_assets
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'office')
  );

CREATE TRIGGER update_file_assets_updated_at
  BEFORE UPDATE ON public.file_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- File read receipts
CREATE TABLE public.file_read_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.file_assets(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES auth.users(id),
  first_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  open_count INTEGER NOT NULL DEFAULT 1,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  file_version_at_read INTEGER NOT NULL DEFAULT 1,
  UNIQUE (file_id, staff_id)
);

ALTER TABLE public.file_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own receipts" ON public.file_read_receipts
  FOR SELECT TO authenticated
  USING (auth.uid() = staff_id);

CREATE POLICY "Admins can view all receipts" ON public.file_read_receipts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'office')
  );

CREATE POLICY "Users can create own receipts" ON public.file_read_receipts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Users can update own receipts" ON public.file_read_receipts
  FOR UPDATE TO authenticated
  USING (auth.uid() = staff_id);

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

CREATE POLICY "Authenticated users can view documents" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documents');

CREATE POLICY "Admins can upload documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'office')
  ));

-- Parts table
CREATE TABLE public.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  part_id TEXT NOT NULL,
  product_code TEXT NOT NULL,
  material_code TEXT REFERENCES public.materials(material_code),
  length_mm NUMERIC NOT NULL,
  width_mm NUMERIC NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  grain_required BOOLEAN NOT NULL DEFAULT false,
  grain_axis TEXT DEFAULT 'L' CHECK (grain_axis IN ('L','W')),
  rotation_allowed TEXT DEFAULT 'any' CHECK (rotation_allowed IN ('0_only','0_or_180','0_or_90','any')),
  dxf_file_reference TEXT,
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view parts" ON public.parts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Engineers+ can manage parts" ON public.parts
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'engineer') OR
    public.has_role(auth.uid(), 'supervisor')
  );

CREATE TRIGGER update_parts_updated_at
  BEFORE UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Toolpath templates
CREATE TABLE public.toolpath_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  material_code TEXT REFERENCES public.materials(material_code),
  thickness_mm NUMERIC,
  file_reference TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.toolpath_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates" ON public.toolpath_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Engineers+ can manage templates" ON public.toolpath_templates
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'engineer')
  );

CREATE TRIGGER update_toolpath_templates_updated_at
  BEFORE UPDATE ON public.toolpath_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Product mappings
CREATE TABLE public.product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT NOT NULL UNIQUE,
  material_code TEXT NOT NULL REFERENCES public.materials(material_code),
  default_grain_required BOOLEAN NOT NULL DEFAULT false,
  default_grain_axis TEXT DEFAULT 'L' CHECK (default_grain_axis IN ('L','W')),
  default_rotation_allowed TEXT DEFAULT 'any' CHECK (default_rotation_allowed IN ('0_only','0_or_180','0_or_90','any')),
  default_toolpath_template_id UUID REFERENCES public.toolpath_templates(id),
  default_label_template_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view mappings" ON public.product_mappings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Engineers+ can manage mappings" ON public.product_mappings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'engineer')
  );

CREATE TRIGGER update_product_mappings_updated_at
  BEFORE UPDATE ON public.product_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
