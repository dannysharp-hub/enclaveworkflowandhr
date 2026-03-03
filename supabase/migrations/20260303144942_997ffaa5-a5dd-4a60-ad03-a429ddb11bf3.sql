
-- File open events (read receipts)
CREATE TABLE public.file_open_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  file_name text,
  opened_by_staff_id text NOT NULL,
  opened_at timestamptz DEFAULT now(),
  context text DEFAULT 'job_documents'
);

ALTER TABLE public.file_open_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.file_open_events
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_file_open_events BEFORE INSERT ON public.file_open_events
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE INDEX idx_file_open_events_drive_file ON public.file_open_events(drive_file_id);
CREATE INDEX idx_file_open_events_job ON public.file_open_events(job_id);

-- Add shared media folder and BOM auto-import settings to Drive integration
ALTER TABLE public.google_drive_integration_settings
  ADD COLUMN IF NOT EXISTS shared_media_folder_id text,
  ADD COLUMN IF NOT EXISTS shared_media_folder_name text,
  ADD COLUMN IF NOT EXISTS auto_import_bom_on_detect boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_link_shared_media boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS bom_file_match_keywords text[] DEFAULT ARRAY['bom', 'inventor', 'partslist', 'parts list'],
  ADD COLUMN IF NOT EXISTS bom_file_match_extensions text[] DEFAULT ARRAY['.csv'];

-- Add readiness flags to jobs for quick badge display
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS has_dxf_files boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_jobpack boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_bom_imported boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS drive_bom_last_imported_at timestamptz;

-- Shared media assignments (for unassigned media inbox)
CREATE TABLE public.shared_media_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  drive_file_id text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  drive_web_view_link text,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  assigned_by_staff_id text,
  assigned_at timestamptz,
  auto_matched boolean DEFAULT false,
  match_reason text,
  status text DEFAULT 'unassigned',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.shared_media_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.shared_media_assignments
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_tenant_id_shared_media_assignments BEFORE INSERT ON public.shared_media_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE INDEX idx_shared_media_status ON public.shared_media_assignments(status);
CREATE INDEX idx_shared_media_job ON public.shared_media_assignments(job_id);
