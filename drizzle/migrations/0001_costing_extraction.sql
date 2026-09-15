ALTER TABLE public.cab_jobs
  ADD COLUMN IF NOT EXISTS quoted_total NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_total NUMERIC,
  ADD COLUMN IF NOT EXISTS profit_total NUMERIC,
  ADD COLUMN IF NOT EXISTS materials_subtotal NUMERIC,
  ADD COLUMN IF NOT EXISTS labour_total NUMERIC,
  ADD COLUMN IF NOT EXISTS hardware_total NUMERIC,
  ADD COLUMN IF NOT EXISTS fixings_total NUMERIC,
  ADD COLUMN IF NOT EXISTS costing_extracted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS costing_source_filename TEXT;

ALTER TABLE public.google_drive_integration_settings
  ADD COLUMN IF NOT EXISTS sync_ignore_patterns TEXT[]
  DEFAULT ARRAY['^_', '^Inventor Admin$', 'test', 'sample', 'template', '^008_WorkshopLayout$', '^021_Website$'];

UPDATE public.google_drive_integration_settings
SET sync_ignore_patterns = ARRAY['^_', '^Inventor Admin$', 'test', 'sample', 'template', '^008_WorkshopLayout$', '^021_Website$']
WHERE sync_ignore_patterns IS NULL;

CREATE TABLE public.cab_job_purchasing_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.cab_jobs(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  unit_price NUMERIC,
  qty NUMERIC,
  line_total NUMERIC,
  supplier TEXT,
  product_url TEXT,
  due_date DATE,
  source_filename TEXT,
  line_hash TEXT GENERATED ALWAYS AS (
    md5(lower(btrim(coalesce(description, ''))) || '|' || lower(btrim(coalesce(supplier, ''))) || '|' || coalesce(round(unit_price, 2)::text, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cab_job_purchasing_lines_job_hash_key
  ON public.cab_job_purchasing_lines (job_id, line_hash);
CREATE INDEX cab_job_purchasing_lines_company_idx
  ON public.cab_job_purchasing_lines (company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cab_job_purchasing_lines TO authenticated;
GRANT ALL ON public.cab_job_purchasing_lines TO service_role;
ALTER TABLE public.cab_job_purchasing_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read purchasing lines" ON public.cab_job_purchasing_lines
  FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "admins write purchasing lines" ON public.cab_job_purchasing_lines
  FOR ALL TO authenticated
  USING (public.is_cab_company_admin(company_id))
  WITH CHECK (public.is_cab_company_admin(company_id));

CREATE TABLE public.cab_costing_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.cab_jobs(id) ON DELETE SET NULL,
  folder_name TEXT NOT NULL,
  folder_id TEXT,
  folder_url TEXT,
  source_file_id TEXT,
  source_filename TEXT,
  source_modified_at TIMESTAMPTZ,
  source_tab TEXT,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  purchasing_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  ambiguous_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cab_costing_extractions_folder_rev_key
  ON public.cab_costing_extractions (company_id, folder_name, source_modified_at);
CREATE INDEX cab_costing_extractions_status_idx
  ON public.cab_costing_extractions (company_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cab_costing_extractions TO authenticated;
GRANT ALL ON public.cab_costing_extractions TO service_role;
ALTER TABLE public.cab_costing_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read costing extractions" ON public.cab_costing_extractions
  FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "admins write costing extractions" ON public.cab_costing_extractions
  FOR ALL TO authenticated
  USING (public.is_cab_company_admin(company_id))
  WITH CHECK (public.is_cab_company_admin(company_id));