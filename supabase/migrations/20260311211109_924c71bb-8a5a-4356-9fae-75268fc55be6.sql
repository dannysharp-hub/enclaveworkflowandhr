
ALTER TABLE public.cab_jobs 
ADD COLUMN IF NOT EXISTS sign_off_token TEXT,
ADD COLUMN IF NOT EXISTS sign_off_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sign_off_signature_url TEXT;

-- Create job-photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for job-photos bucket: authenticated users can upload and read
CREATE POLICY "Authenticated users can upload job photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'job-photos');

CREATE POLICY "Authenticated users can read job photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'job-photos');

-- Public read for sign-off page (anon can read signatures)
CREATE POLICY "Public can read job photos"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'job-photos');
