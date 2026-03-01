-- Create storage bucket for DXF files
INSERT INTO storage.buckets (id, name, public)
VALUES ('dxf-files', 'dxf-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload DXF files
CREATE POLICY "Engineers+ can upload DXF files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dxf-files'
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'engineer') OR
    public.has_role(auth.uid(), 'supervisor')
  )
);

-- RLS: authenticated users can read DXF files
CREATE POLICY "Authenticated can read DXF files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'dxf-files');

-- RLS: Engineers+ can delete DXF files
CREATE POLICY "Engineers+ can delete DXF files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'dxf-files'
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'engineer') OR
    public.has_role(auth.uid(), 'supervisor')
  )
);