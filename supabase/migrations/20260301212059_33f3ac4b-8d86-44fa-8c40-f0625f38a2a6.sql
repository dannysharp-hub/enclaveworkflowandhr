
-- Storage bucket for staff documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-documents', 'staff-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Admins can do everything, staff can view own files
CREATE POLICY "Admins can manage staff documents"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'staff-documents'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Staff can view own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Metadata table to track staff documents
CREATE TABLE public.staff_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all staff documents"
ON public.staff_documents FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view own documents"
ON public.staff_documents FOR SELECT
TO authenticated
USING (auth.uid() = staff_id);
