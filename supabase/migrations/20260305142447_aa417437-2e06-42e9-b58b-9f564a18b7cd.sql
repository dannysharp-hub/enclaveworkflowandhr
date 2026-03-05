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
BEGIN
  IF NEW.job_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_job FROM public.cab_jobs WHERE id = NEW.job_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_milestone := NEW.payload_json->>'milestone';

  CASE NEW.event_type

    WHEN 'appointment.booked' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'appointment_booked',
        state = 'appointment_booked',
        estimated_next_action_at = NULL,
        updated_at = now()
      WHERE id = NEW.job_id;

    WHEN 'materials.ordered' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'materials_ordered',
        updated_at = now()
      WHERE id = NEW.job_id;

    WHEN 'cnc.started' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'manufacturing_started',
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
          estimated_next_action_at = NULL,
          updated_at = now()
        WHERE id = NEW.job_id;
      ELSIF v_milestone = 'final' THEN
        UPDATE public.cab_jobs SET
          current_stage_key = 'closed_paid',
          state = 'closed',
          status = 'closed',
          estimated_next_action_at = NULL,
          updated_at = now()
        WHERE id = NEW.job_id;
      END IF;

    WHEN 'install.booked' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'install_booked',
        updated_at = now()
      WHERE id = NEW.job_id;

    WHEN 'install.completed' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'installation_complete',
        state = 'installed_pending_signoff',
        estimated_next_action_at = now() + interval '2 days',
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