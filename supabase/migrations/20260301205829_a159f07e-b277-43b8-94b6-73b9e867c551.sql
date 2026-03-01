
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  review_type text NOT NULL DEFAULT 'Probation',
  title text NOT NULL,
  due_date date NOT NULL,
  completed_date date,
  status text NOT NULL DEFAULT 'Scheduled',
  reviewer_id uuid,
  outcome text,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view reviews"
  ON public.reviews FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Supervisors+ can manage reviews"
  ON public.reviews FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'engineer'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'engineer'));
