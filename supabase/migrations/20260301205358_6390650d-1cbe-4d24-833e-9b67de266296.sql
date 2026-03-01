
-- Table linking stage names to required skills
CREATE TABLE public.stage_skill_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_name text NOT NULL,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  minimum_level text NOT NULL DEFAULT 'Competent',
  mandatory boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stage_name, skill_id)
);

ALTER TABLE public.stage_skill_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view requirements"
  ON public.stage_skill_requirements FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage requirements"
  ON public.stage_skill_requirements FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'engineer'));
