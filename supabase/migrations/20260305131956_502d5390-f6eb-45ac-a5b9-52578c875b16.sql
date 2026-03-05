
-- Race-safe job_ref sequencing
CREATE TABLE public.cab_job_sequences (
  company_id uuid PRIMARY KEY REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  next_number integer NOT NULL DEFAULT 1
);

ALTER TABLE public.cab_job_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can access sequences"
ON public.cab_job_sequences FOR ALL TO authenticated
USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));

-- Atomic increment function
CREATE OR REPLACE FUNCTION public.cab_next_job_number(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _num integer;
BEGIN
  INSERT INTO public.cab_job_sequences (company_id, next_number)
  VALUES (_company_id, 2)
  ON CONFLICT (company_id) DO UPDATE SET next_number = cab_job_sequences.next_number + 1
  RETURNING next_number - 1 INTO _num;
  RETURN _num;
END;
$$;
