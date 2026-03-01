
-- Training records table
CREATE TABLE public.training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  training_type text NOT NULL DEFAULT 'Machine Training',
  title text NOT NULL,
  completed_date date NOT NULL DEFAULT CURRENT_DATE,
  trainer_name text,
  expiry_date date,
  linked_document_id uuid REFERENCES public.file_assets(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;

-- Everyone can view training records
CREATE POLICY "Authenticated users can view training records"
  ON public.training_records FOR SELECT
  USING (true);

-- Admin/supervisor/engineer can manage
CREATE POLICY "Supervisors+ can manage training records"
  ON public.training_records FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'engineer'::app_role)
  );

-- Updated_at trigger
CREATE TRIGGER update_training_records_updated_at
  BEFORE UPDATE ON public.training_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
