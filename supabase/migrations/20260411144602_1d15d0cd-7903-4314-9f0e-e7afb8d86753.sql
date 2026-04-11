INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_read_assets" ON storage.objects FOR SELECT TO public USING (bucket_id = 'assets');