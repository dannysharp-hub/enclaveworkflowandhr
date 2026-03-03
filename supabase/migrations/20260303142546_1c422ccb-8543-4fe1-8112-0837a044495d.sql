
-- Create a function that fires on job status change to queue purchasing automation
CREATE OR REPLACE FUNCTION public.on_job_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Trigger 1: Job Accepted → generate buylist + RFQs
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    INSERT INTO public.notifications (user_id, tenant_id, title, message, type, link)
    SELECT p.user_id, NEW.tenant_id,
      'Purchasing automation started',
      'Buylist & RFQ generation triggered for Job ' || COALESCE(NEW.job_id, NEW.id::text),
      'info',
      '/jobs/' || NEW.id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id AND p.tenant_id = NEW.tenant_id
    WHERE ur.role IN ('admin', 'office', 'supervisor') AND ur.tenant_id = NEW.tenant_id;

    INSERT INTO public.purchasing_audit_log (job_id, tenant_id, action, entity_type, details_json)
    VALUES (NEW.id, NEW.tenant_id, 'job_accepted_trigger', 'job', jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
  END IF;

  -- Trigger 2: Deposit received → enable ordering
  IF NEW.ordering_enabled = true AND (OLD.ordering_enabled IS DISTINCT FROM true) THEN
    INSERT INTO public.notifications (user_id, tenant_id, title, message, type, link)
    SELECT p.user_id, NEW.tenant_id,
      'Ordering enabled',
      'Deposit received — ordering enabled for Job ' || COALESCE(NEW.job_id, NEW.id::text),
      'success',
      '/jobs/' || NEW.id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id AND p.tenant_id = NEW.tenant_id
    WHERE ur.role IN ('admin', 'office', 'supervisor') AND ur.tenant_id = NEW.tenant_id;

    INSERT INTO public.purchasing_audit_log (job_id, tenant_id, action, entity_type, details_json)
    VALUES (NEW.id, NEW.tenant_id, 'deposit_received_trigger', 'job', jsonb_build_object('deposit_received_at', NEW.deposit_received_at));
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger on jobs table
DROP TRIGGER IF EXISTS trg_job_status_change ON public.jobs;
CREATE TRIGGER trg_job_status_change
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.on_job_status_change();

-- Add purchasing_settings table for automation config
CREATE TABLE IF NOT EXISTS public.purchasing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) NOT NULL UNIQUE,
  auto_generate_buylist boolean DEFAULT true,
  auto_send_rfqs boolean DEFAULT false,
  rfq_send_mode text DEFAULT 'all_matching',
  rfq_top_n integer DEFAULT 3,
  default_required_by_days_from_now integer DEFAULT 7,
  default_delivery_address text,
  from_display_name text,
  from_email text,
  cc_internal_emails text[] DEFAULT '{}',
  email_provider text DEFAULT 'google',
  po_number_prefix text DEFAULT 'PO',
  po_number_next_seq integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.purchasing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view purchasing_settings"
ON public.purchasing_settings FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admin/office can manage purchasing_settings"
ON public.purchasing_settings FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')))
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));

CREATE TRIGGER set_tenant_id_purchasing_settings BEFORE INSERT ON public.purchasing_settings FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
