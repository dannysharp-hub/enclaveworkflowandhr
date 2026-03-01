
-- ============================================================
-- JOB CARDS 3.0 — ALL NEW TABLES
-- ============================================================

-- 1. Job Card Templates
CREATE TABLE public.job_card_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  department text NOT NULL DEFAULT 'CNC',
  description text,
  version integer NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  template_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_card_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant job card templates" ON public.job_card_templates
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant job card templates" ON public.job_card_templates
  FOR ALL USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  );

CREATE TRIGGER set_tenant_id_job_card_templates BEFORE INSERT ON public.job_card_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_job_card_templates BEFORE UPDATE ON public.job_card_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Job Card Snapshots (immutable versions)
CREATE TABLE public.job_card_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  template_id uuid REFERENCES public.job_card_templates(id),
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz,
  issued_by uuid,
  superseded_at timestamptz,
  superseded_by uuid,
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_card_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant job card snapshots" ON public.job_card_snapshots
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Supervisors can manage tenant job card snapshots" ON public.job_card_snapshots
  FOR ALL USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'engineer'))
  );

CREATE TRIGGER set_tenant_id_job_card_snapshots BEFORE INSERT ON public.job_card_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE INDEX idx_job_card_snapshots_job ON public.job_card_snapshots(job_id);
CREATE INDEX idx_job_card_snapshots_status ON public.job_card_snapshots(status);

-- 3. Job Checklist Items (template-level definitions)
CREATE TABLE public.job_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  template_id uuid NOT NULL REFERENCES public.job_card_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  mandatory boolean NOT NULL DEFAULT false,
  check_type text NOT NULL DEFAULT 'boolean',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant checklist items" ON public.job_checklist_items
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant checklist items" ON public.job_checklist_items
  FOR ALL USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  );

CREATE TRIGGER set_tenant_id_job_checklist_items BEFORE INSERT ON public.job_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_job_checklist_items BEFORE UPDATE ON public.job_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Job Checklist Results (per-job execution)
CREATE TABLE public.job_checklist_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  snapshot_id uuid NOT NULL REFERENCES public.job_card_snapshots(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES public.job_checklist_items(id),
  checked boolean NOT NULL DEFAULT false,
  checked_by uuid,
  checked_at timestamptz,
  notes text,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_checklist_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant checklist results" ON public.job_checklist_results
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Workers can manage tenant checklist results" ON public.job_checklist_results
  FOR ALL USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'engineer') OR has_role(auth.uid(), 'operator'))
  );

CREATE TRIGGER set_tenant_id_job_checklist_results BEFORE INSERT ON public.job_checklist_results
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_job_checklist_results BEFORE UPDATE ON public.job_checklist_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Job Card Signoffs
CREATE TABLE public.job_card_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  snapshot_id uuid NOT NULL REFERENCES public.job_card_snapshots(id),
  stage_name text NOT NULL,
  signed_by uuid NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  role_at_signing text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_card_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant signoffs" ON public.job_card_signoffs
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Workers can create tenant signoffs" ON public.job_card_signoffs
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'engineer') OR has_role(auth.uid(), 'operator'))
  );

CREATE TRIGGER set_tenant_id_job_card_signoffs BEFORE INSERT ON public.job_card_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- 6. Job Issues
CREATE TABLE public.job_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  snapshot_id uuid REFERENCES public.job_card_snapshots(id),
  stage_name text,
  severity text NOT NULL DEFAULT 'medium',
  category text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  description text,
  reported_by uuid NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  assigned_to uuid,
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  photos text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant job issues" ON public.job_issues
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Workers can manage tenant job issues" ON public.job_issues
  FOR ALL USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'engineer') OR has_role(auth.uid(), 'operator'))
  );

CREATE TRIGGER set_tenant_id_job_issues BEFORE INSERT ON public.job_issues
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_job_issues BEFORE UPDATE ON public.job_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_job_issues_job ON public.job_issues(job_id);
CREATE INDEX idx_job_issues_status ON public.job_issues(status);

-- 7. Production Readiness Status
CREATE TABLE public.production_readiness_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) UNIQUE,
  materials_ready boolean NOT NULL DEFAULT false,
  cnc_ready boolean NOT NULL DEFAULT false,
  edge_ready boolean NOT NULL DEFAULT false,
  assembly_ready boolean NOT NULL DEFAULT false,
  spray_ready boolean NOT NULL DEFAULT false,
  install_ready boolean NOT NULL DEFAULT false,
  issues_open_count integer NOT NULL DEFAULT 0,
  overdue_dependency_count integer NOT NULL DEFAULT 0,
  readiness_score integer NOT NULL DEFAULT 0,
  readiness_status text NOT NULL DEFAULT 'not_ready',
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_readiness_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant readiness" ON public.production_readiness_status
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "System can manage tenant readiness" ON public.production_readiness_status
  FOR ALL USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'engineer') OR has_role(auth.uid(), 'office'))
  );

CREATE TRIGGER set_tenant_id_production_readiness BEFORE INSERT ON public.production_readiness_status
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_production_readiness BEFORE UPDATE ON public.production_readiness_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_readiness_status ON public.production_readiness_status(readiness_status);

-- 8. Install Signoffs
CREATE TABLE public.install_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  snapshot_id uuid REFERENCES public.job_card_snapshots(id),
  customer_name text NOT NULL,
  customer_email text,
  signed_by_name text NOT NULL,
  signed_by_role text NOT NULL DEFAULT 'client',
  signature_image_reference text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  geo_location jsonb,
  photos text[] DEFAULT '{}',
  notes text,
  status text NOT NULL DEFAULT 'pending',
  follow_up_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.install_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant install signoffs" ON public.install_signoffs
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Workers can manage tenant install signoffs" ON public.install_signoffs
  FOR ALL USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'engineer') OR has_role(auth.uid(), 'operator'))
  );

CREATE TRIGGER set_tenant_id_install_signoffs BEFORE INSERT ON public.install_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_install_signoffs BEFORE UPDATE ON public.install_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_install_signoffs_job ON public.install_signoffs(job_id);
CREATE INDEX idx_install_signoffs_status ON public.install_signoffs(status);

-- Storage bucket for signatures and install photos
INSERT INTO storage.buckets (id, name, public) VALUES ('install-signoffs', 'install-signoffs', false);

CREATE POLICY "Users can upload install signoff files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'install-signoffs' AND auth.role() = 'authenticated');

CREATE POLICY "Users can view install signoff files" ON storage.objects
  FOR SELECT USING (bucket_id = 'install-signoffs' AND auth.role() = 'authenticated');
