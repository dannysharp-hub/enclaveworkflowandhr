-- 1. Configurable _Jobs folder for Drive sync
ALTER TABLE public.google_drive_integration_settings
  ADD COLUMN IF NOT EXISTS jobs_folder_id text,
  ADD COLUMN IF NOT EXISTS jobs_folder_name text;

-- 2. Idempotent Drive folder links: remove duplicates (keep earliest), then enforce uniqueness
DELETE FROM public.cab_job_files f
USING public.cab_job_files k
WHERE f.job_id = k.job_id
  AND f.url = k.url
  AND (k.created_at < f.created_at OR (k.created_at = f.created_at AND k.id < f.id));

ALTER TABLE public.cab_job_files
  ADD CONSTRAINT cab_job_files_job_id_url_key UNIQUE (job_id, url);

-- 3. Review queue for Drive folders with no matching job (and job_refs with no folder)
CREATE TABLE public.drive_sync_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  folder_name text NOT NULL,
  folder_id text NOT NULL,
  folder_url text,
  status text NOT NULL DEFAULT 'pending',
  job_ref text,
  created_job_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drive_sync_candidates
  ADD CONSTRAINT drive_sync_candidates_company_folder_key UNIQUE (company_id, folder_id);

CREATE INDEX drive_sync_candidates_company_status_idx
  ON public.drive_sync_candidates (company_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drive_sync_candidates TO authenticated;
GRANT ALL ON public.drive_sync_candidates TO service_role;

ALTER TABLE public.drive_sync_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view drive sync candidates"
  ON public.drive_sync_candidates FOR SELECT TO authenticated
  USING (public.is_cab_company_member(company_id));

CREATE POLICY "Company admins can insert drive sync candidates"
  ON public.drive_sync_candidates FOR INSERT TO authenticated
  WITH CHECK (public.is_cab_company_admin(company_id));

CREATE POLICY "Company admins can update drive sync candidates"
  ON public.drive_sync_candidates FOR UPDATE TO authenticated
  USING (public.is_cab_company_admin(company_id));

CREATE POLICY "Company admins can delete drive sync candidates"
  ON public.drive_sync_candidates FOR DELETE TO authenticated
  USING (public.is_cab_company_admin(company_id));