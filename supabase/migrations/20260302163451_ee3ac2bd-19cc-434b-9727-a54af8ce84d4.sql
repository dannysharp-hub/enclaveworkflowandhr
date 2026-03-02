
-- ═══════════════════════════════════════════════════════════
-- GOOGLE DRIVE INTEGRATION — Phase 1 Tables
-- ═══════════════════════════════════════════════════════════

-- 1) google_drive_integration_settings (one per tenant)
CREATE TABLE public.google_drive_integration_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_connected boolean NOT NULL DEFAULT false,
  google_user_email text,
  google_user_id text,
  granted_scopes jsonb,
  projects_root_folder_id text,
  projects_root_folder_name text,
  auto_create_jobs_from_folders boolean NOT NULL DEFAULT true,
  auto_index_files boolean NOT NULL DEFAULT true,
  auto_attach_dxfs boolean NOT NULL DEFAULT false,
  folder_name_pattern text NOT NULL DEFAULT '^[0-9]{3,6}\s*-\s*.+$',
  job_number_parse_regex text NOT NULL DEFAULT '^([0-9]{3,6})\s*-\s*(.+)$',
  sync_mode text NOT NULL DEFAULT 'polling',
  polling_interval_minutes integer NOT NULL DEFAULT 10,
  auto_upload_exports boolean NOT NULL DEFAULT false,
  export_subfolder_cnc text NOT NULL DEFAULT 'CNC Output',
  export_subfolder_exports text NOT NULL DEFAULT 'Exports',
  export_subfolder_labels text NOT NULL DEFAULT 'Labels',
  export_subfolder_nesting text NOT NULL DEFAULT 'Nesting',
  include_subfolders boolean NOT NULL DEFAULT true,
  detect_dxfs boolean NOT NULL DEFAULT true,
  detect_photos boolean NOT NULL DEFAULT true,
  detect_cost_sheets boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'disconnected',
  last_sync_at timestamptz,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_drive_integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view drive settings"
  ON public.google_drive_integration_settings FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage drive settings"
  ON public.google_drive_integration_settings FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 2) job_drive_links
CREATE TABLE public.job_drive_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  drive_folder_id text NOT NULL,
  drive_folder_name text NOT NULL DEFAULT '',
  drive_folder_url text,
  drive_path_cache text,
  last_indexed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, job_id),
  UNIQUE(tenant_id, drive_folder_id)
);

ALTER TABLE public.job_drive_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view job drive links"
  ON public.job_drive_links FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins+ can manage job drive links"
  ON public.job_drive_links FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'engineer'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'engineer'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );

-- 3) drive_file_index
CREATE TABLE public.drive_file_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  drive_parent_folder_id text,
  file_name text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  drive_modified_time timestamptz,
  drive_created_time timestamptz,
  drive_web_view_link text,
  detected_type text NOT NULL DEFAULT 'other',
  detected_stage text NOT NULL DEFAULT 'unknown',
  checksum text,
  status text NOT NULL DEFAULT 'active',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, drive_file_id)
);

ALTER TABLE public.drive_file_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view drive file index"
  ON public.drive_file_index FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins+ can manage drive file index"
  ON public.drive_file_index FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'engineer'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'engineer'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );

-- 4) drive_sync_queue
CREATE TABLE public.drive_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  action text NOT NULL,
  drive_folder_id text,
  drive_file_id text,
  payload_json jsonb DEFAULT '{}'::jsonb,
  priority text NOT NULL DEFAULT 'normal',
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'queued',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drive_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view drive sync queue"
  ON public.drive_sync_queue FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage drive sync queue"
  ON public.drive_sync_queue FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 5) drive_sync_audit
CREATE TABLE public.drive_sync_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_staff_id text,
  action text NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  drive_folder_id text,
  drive_file_id text,
  payload_before_json jsonb,
  payload_after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drive_sync_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view drive sync audit"
  ON public.drive_sync_audit FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Indexes for performance
CREATE INDEX idx_job_drive_links_job_id ON public.job_drive_links(job_id);
CREATE INDEX idx_drive_file_index_job_id ON public.drive_file_index(job_id);
CREATE INDEX idx_drive_file_index_status ON public.drive_file_index(status) WHERE status = 'active';
CREATE INDEX idx_drive_sync_queue_status ON public.drive_sync_queue(status, run_after) WHERE status = 'queued';

-- updated_at triggers
CREATE TRIGGER set_drive_settings_updated_at BEFORE UPDATE ON public.google_drive_integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_drive_sync_queue_updated_at BEFORE UPDATE ON public.drive_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- tenant_id auto-set triggers
CREATE TRIGGER set_job_drive_links_tenant BEFORE INSERT ON public.job_drive_links
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_drive_file_index_tenant BEFORE INSERT ON public.drive_file_index
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_drive_sync_queue_tenant BEFORE INSERT ON public.drive_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_drive_sync_audit_tenant BEFORE INSERT ON public.drive_sync_audit
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
