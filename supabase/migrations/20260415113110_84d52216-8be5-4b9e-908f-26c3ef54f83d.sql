
-- Make job-photos bucket public
UPDATE storage.buckets SET public = true WHERE id = 'job-photos';

-- Make install-signoffs bucket public (for sign-off images/signatures)
UPDATE storage.buckets SET public = true WHERE id = 'install-signoffs';

-- RLS policies for job-photos
CREATE POLICY "Public read access for job-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'job-photos');

CREATE POLICY "Authenticated users can upload job-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'job-photos');

CREATE POLICY "Authenticated users can delete job-photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'job-photos');

-- RLS policies for install-signoffs
CREATE POLICY "Public read access for install-signoffs"
ON storage.objects FOR SELECT
USING (bucket_id = 'install-signoffs');

CREATE POLICY "Authenticated users can upload install-signoffs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'install-signoffs');

CREATE POLICY "Anon users can upload install-signoffs"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'install-signoffs');
