-- Table to track scanned emails
CREATE TABLE public.gmail_scanned_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  subject text,
  sender_email text,
  sender_name text,
  received_at timestamptz,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  has_attachments boolean DEFAULT false,
  attachment_count integer DEFAULT 0,
  processing_status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, gmail_message_id)
);

-- Table to track extracted documents from emails
CREATE TABLE public.gmail_extracted_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scanned_email_id uuid NOT NULL REFERENCES public.gmail_scanned_emails(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  file_size_bytes integer,
  document_type text NOT NULL DEFAULT 'unknown',
  ai_confidence numeric(5,4) DEFAULT 0,
  ai_matched_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ai_match_reason text,
  ai_extracted_data jsonb DEFAULT '{}'::jsonb,
  filed_to_drive boolean DEFAULT false,
  drive_file_id text,
  storage_path text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Gmail scan settings per tenant
CREATE TABLE public.gmail_scan_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  scan_frequency_minutes integer NOT NULL DEFAULT 60,
  last_scan_at timestamptz,
  last_history_id text,
  document_types text[] NOT NULL DEFAULT ARRAY['invoice', 'bill', 'statement', 'remittance', 'quote', 'purchase_order'],
  auto_file_threshold numeric(5,4) NOT NULL DEFAULT 0.8500,
  require_review boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gmail_scanned_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_extracted_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_scan_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant isolation for gmail_scanned_emails" ON public.gmail_scanned_emails
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE POLICY "Tenant isolation for gmail_extracted_documents" ON public.gmail_extracted_documents
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE POLICY "Tenant isolation for gmail_scan_settings" ON public.gmail_scan_settings
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

-- Add gmail_enabled flag to integration settings
ALTER TABLE public.google_integration_settings
  ADD COLUMN IF NOT EXISTS gmail_scan_enabled boolean NOT NULL DEFAULT false;