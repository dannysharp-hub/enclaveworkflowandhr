
-- Add production columns to cab_jobs
ALTER TABLE public.cab_jobs
  ADD COLUMN IF NOT EXISTS production_stage_key text NOT NULL DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS install_assigned_to uuid NULL,
  ADD COLUMN IF NOT EXISTS install_window_start timestamptz NULL,
  ADD COLUMN IF NOT EXISTS install_window_end timestamptz NULL,
  ADD COLUMN IF NOT EXISTS install_completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS customer_signoff_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_cab_jobs_production_stage ON public.cab_jobs (company_id, production_stage_key);
CREATE INDEX IF NOT EXISTS idx_cab_jobs_install_assigned ON public.cab_jobs (company_id, install_assigned_to);
CREATE INDEX IF NOT EXISTS idx_cab_jobs_install_window ON public.cab_jobs (company_id, install_window_start);

-- Create cab_job_files table
CREATE TABLE IF NOT EXISTS public.cab_job_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id),
  job_id uuid NOT NULL REFERENCES public.cab_jobs(id),
  file_type text NOT NULL DEFAULT 'other',
  url text NOT NULL,
  uploaded_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cab_job_files_job ON public.cab_job_files (company_id, job_id);

ALTER TABLE public.cab_job_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cab_job_files_member_select" ON public.cab_job_files
  FOR SELECT TO authenticated
  USING (public.is_cab_company_member(company_id));

CREATE POLICY "cab_job_files_member_insert" ON public.cab_job_files
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cab_company_member(company_id));

CREATE POLICY "cab_job_files_admin_delete" ON public.cab_job_files
  FOR DELETE TO authenticated
  USING (public.is_cab_company_admin(company_id));

-- Update event transition trigger to handle production stage changes
CREATE OR REPLACE FUNCTION public.cab_handle_event_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_milestone text;
  v_inv_exists boolean;
  v_amount numeric;
  v_from text;
  v_to text;
BEGIN
  IF NEW.job_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_job FROM public.cab_jobs WHERE id = NEW.job_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_milestone := NEW.payload_json->>'milestone';

  CASE NEW.event_type

    WHEN 'appointment.booked' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'appointment_booked',
        state = 'awaiting_survey',
        estimated_next_action_at = now() + interval '3 days',
        updated_at = now()
      WHERE id = NEW.job_id;

    WHEN 'job.ready_for_production' THEN
      UPDATE public.cab_jobs SET
        production_stage_key = 'ready_for_production',
        updated_at = now()
      WHERE id = NEW.job_id;

    WHEN 'production.stage_changed' THEN
      v_to := NEW.payload_json->>'to';
      IF v_to IS NOT NULL THEN
        UPDATE public.cab_jobs SET
          production_stage_key = v_to,
          updated_at = now()
        WHERE id = NEW.job_id;

        -- Map production stages to customer-facing milestones
        IF v_to = 'cnc_machining' THEN
          UPDATE public.cab_jobs SET current_stage_key = 'manufacturing_started' WHERE id = NEW.job_id;
        ELSIF v_to = 'assembly' THEN
          -- Don't override if already past assembly milestone
          NULL;
        ELSIF v_to = 'packaging' THEN
          UPDATE public.cab_jobs SET current_stage_key = 'cabinetry_assembled' WHERE id = NEW.job_id;
          -- Check if pre-install invoice needed
          SELECT EXISTS(
            SELECT 1 FROM public.cab_invoices
            WHERE job_id = NEW.job_id AND milestone = 'preinstall'
          ) INTO v_inv_exists;
          IF NOT v_inv_exists AND v_job.contract_value IS NOT NULL THEN
            v_amount := ROUND(v_job.contract_value * 0.30, 2);
            INSERT INTO public.cab_invoices (
              company_id, job_id, milestone, reference, amount, currency, status, issued_at
            ) VALUES (
              v_job.company_id, NEW.job_id, 'preinstall',
              v_job.job_ref || '_PRE', v_amount,
              COALESCE(v_job.contract_currency, 'GBP'), 'due', now()
            );
            INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
            VALUES (v_job.company_id, 'invoice.created', NEW.job_id,
              jsonb_build_object('milestone', 'preinstall', 'amount', v_amount), 'pending');
          END IF;
        ELSIF v_to = 'ready_for_install' THEN
          UPDATE public.cab_jobs SET current_stage_key = 'ready_for_installation' WHERE id = NEW.job_id;
        ELSIF v_to = 'installing' THEN
          UPDATE public.cab_jobs SET current_stage_key = 'install_booked' WHERE id = NEW.job_id;
        ELSIF v_to = 'install_complete' THEN
          UPDATE public.cab_jobs SET
            current_stage_key = 'installation_complete',
            install_completed_at = now(),
            updated_at = now()
          WHERE id = NEW.job_id;
        END IF;
      END IF;

    WHEN 'install.complete', 'install.completed' THEN
      UPDATE public.cab_jobs SET
        production_stage_key = 'install_complete',
        current_stage_key = 'installation_complete',
        install_completed_at = now(),
        state = 'installed_pending_signoff',
        estimated_next_action_at = now() + interval '2 days',
        updated_at = now()
      WHERE id = NEW.job_id;

    WHEN 'customer.signoff.completed' THEN
      UPDATE public.cab_jobs SET
        customer_signoff_at = now(),
        updated_at = now()
      WHERE id = NEW.job_id;
      -- Check if final invoice exists; if not, create it and transition
      SELECT EXISTS(
        SELECT 1 FROM public.cab_invoices
        WHERE job_id = NEW.job_id AND milestone = 'final'
      ) INTO v_inv_exists;
      IF NOT v_inv_exists AND v_job.contract_value IS NOT NULL THEN
        v_amount := ROUND(v_job.contract_value * 0.20, 2);
        INSERT INTO public.cab_invoices (
          company_id, job_id, milestone, reference, amount, currency, status, issued_at
        ) VALUES (
          v_job.company_id, NEW.job_id, 'final',
          v_job.job_ref || '_FIN', v_amount,
          COALESCE(v_job.contract_currency, 'GBP'), 'due', now()
        );
        INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
        VALUES (v_job.company_id, 'invoice.created', NEW.job_id,
          jsonb_build_object('milestone', 'final', 'amount', v_amount), 'pending');
      END IF;
      UPDATE public.cab_jobs SET
        current_stage_key = 'practical_completed',
        state = 'awaiting_final_payment',
        estimated_next_action_at = now() + interval '3 days'
      WHERE id = NEW.job_id;

    WHEN 'materials.ordered' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'materials_ordered',
        updated_at = now()
      WHERE id = NEW.job_id;

    WHEN 'cnc.started' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'manufacturing_started',
        production_stage_key = 'cnc_machining',
        updated_at = now()
      WHERE id = NEW.job_id;

    WHEN 'job.assembled', 'assembly.completed' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.cab_invoices
        WHERE job_id = NEW.job_id AND milestone = 'preinstall'
      ) INTO v_inv_exists;

      UPDATE public.cab_jobs SET
        current_stage_key = 'cabinetry_assembled',
        state = 'awaiting_preinstall_payment',
        production_stage_key = 'packaging',
        estimated_next_action_at = now() + interval '3 days',
        updated_at = now()
      WHERE id = NEW.job_id;

      IF NOT v_inv_exists AND v_job.contract_value IS NOT NULL THEN
        v_amount := ROUND(v_job.contract_value * 0.30, 2);
        INSERT INTO public.cab_invoices (
          company_id, job_id, milestone, reference, amount, currency, status, issued_at
        ) VALUES (
          v_job.company_id, NEW.job_id, 'preinstall',
          v_job.job_ref || '_PRE', v_amount,
          COALESCE(v_job.contract_currency, 'GBP'), 'due', now()
        );
        INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
        VALUES (v_job.company_id, 'invoice.created', NEW.job_id,
          jsonb_build_object('milestone', 'preinstall', 'amount', v_amount), 'pending');
      END IF;

    WHEN 'invoice.paid' THEN
      IF v_milestone = 'deposit' THEN
        UPDATE public.cab_jobs SET
          current_stage_key = 'project_confirmed',
          state = 'active_production',
          status = 'active',
          estimated_next_action_at = NULL,
          updated_at = now()
        WHERE id = NEW.job_id;
      ELSIF v_milestone = 'preinstall' THEN
        UPDATE public.cab_jobs SET
          current_stage_key = 'ready_for_installation',
          state = 'ready_to_book_install',
          production_stage_key = 'ready_for_install',
          estimated_next_action_at = NULL,
          updated_at = now()
        WHERE id = NEW.job_id;
      ELSIF v_milestone = 'final' THEN
        UPDATE public.cab_jobs SET
          current_stage_key = 'closed_paid',
          state = 'closed',
          status = 'closed',
          production_stage_key = 'closed',
          estimated_next_action_at = NULL,
          updated_at = now()
        WHERE id = NEW.job_id;
      END IF;

    WHEN 'install.booked' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'install_booked',
        production_stage_key = 'ready_for_install',
        updated_at = now()
      WHERE id = NEW.job_id;

    WHEN 'job.practical_completed' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.cab_invoices
        WHERE job_id = NEW.job_id AND milestone = 'final'
      ) INTO v_inv_exists;

      UPDATE public.cab_jobs SET
        current_stage_key = 'practical_completed',
        state = 'awaiting_final_payment',
        production_stage_key = 'install_complete',
        estimated_next_action_at = now() + interval '3 days',
        updated_at = now()
      WHERE id = NEW.job_id;

      IF NOT v_inv_exists AND v_job.contract_value IS NOT NULL THEN
        v_amount := ROUND(v_job.contract_value * 0.20, 2);
        INSERT INTO public.cab_invoices (
          company_id, job_id, milestone, reference, amount, currency, status, issued_at
        ) VALUES (
          v_job.company_id, NEW.job_id, 'final',
          v_job.job_ref || '_FIN', v_amount,
          COALESCE(v_job.contract_currency, 'GBP'), 'due', now()
        );
        INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
        VALUES (v_job.company_id, 'invoice.created', NEW.job_id,
          jsonb_build_object('milestone', 'final', 'amount', v_amount), 'pending');
      END IF;

  ELSE
    NULL;
  END CASE;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_cab_event_transition ON public.cab_events;
CREATE TRIGGER trg_cab_event_transition
  AFTER INSERT ON public.cab_events
  FOR EACH ROW
  EXECUTE FUNCTION public.cab_handle_event_transition();
