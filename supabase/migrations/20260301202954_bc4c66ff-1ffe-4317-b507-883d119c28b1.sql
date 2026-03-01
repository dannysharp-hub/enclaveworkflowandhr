
-- Skills table
CREATE TABLE public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'General',
  requires_certification boolean NOT NULL DEFAULT false,
  default_expiry_period_months integer,
  description text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view skills"
  ON public.skills FOR SELECT USING (true);

CREATE POLICY "Admins can manage skills"
  ON public.skills FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role));

CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Staff skills junction table
CREATE TABLE public.staff_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'Trainee',
  certification_expiry_date date,
  notes text DEFAULT '',
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, skill_id)
);

ALTER TABLE public.staff_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view staff skills"
  ON public.staff_skills FOR SELECT USING (true);

CREATE POLICY "Supervisors+ can manage staff skills"
  ON public.staff_skills FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'engineer'::app_role)
  );

CREATE TRIGGER update_staff_skills_updated_at
  BEFORE UPDATE ON public.staff_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
