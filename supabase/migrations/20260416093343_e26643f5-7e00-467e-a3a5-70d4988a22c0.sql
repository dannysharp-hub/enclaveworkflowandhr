
-- Create the approval requests table
CREATE TABLE public.cab_approval_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('job_edit', 'quote_send', 'design_signoff_send', 'invoice_send')),
  target_id UUID NOT NULL,
  target_ref TEXT,
  payload_json JSONB,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notification_dismissed_by_requester BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cab_approval_requests_company_status ON public.cab_approval_requests(company_id, status);
CREATE INDEX idx_cab_approval_requests_requested_by ON public.cab_approval_requests(requested_by);
CREATE INDEX idx_cab_approval_requests_target ON public.cab_approval_requests(target_id);

-- Enable RLS
ALTER TABLE public.cab_approval_requests ENABLE ROW LEVEL SECURITY;

-- Policy: company members can view their company's approval requests
CREATE POLICY "Company members can view approval requests"
  ON public.cab_approval_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cab_company_memberships
      WHERE cab_company_memberships.company_id = cab_approval_requests.company_id
        AND cab_company_memberships.user_id = auth.uid()
    )
  );

-- Policy: company members can create approval requests
CREATE POLICY "Company members can create approval requests"
  ON public.cab_approval_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cab_company_memberships
      WHERE cab_company_memberships.company_id = cab_approval_requests.company_id
        AND cab_company_memberships.user_id = auth.uid()
    )
  );

-- Policy: company members can update approval requests (admin check done in app code)
CREATE POLICY "Company members can update approval requests"
  ON public.cab_approval_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cab_company_memberships
      WHERE cab_company_memberships.company_id = cab_approval_requests.company_id
        AND cab_company_memberships.user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE TRIGGER update_cab_approval_requests_updated_at
  BEFORE UPDATE ON public.cab_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
