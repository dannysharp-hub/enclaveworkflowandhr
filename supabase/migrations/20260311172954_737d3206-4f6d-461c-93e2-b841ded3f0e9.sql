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

        IF v_to = 'cnc_machining' THEN
          UPDATE public.cab_jobs SET current_stage_key = 'manufacturing_started' WHERE id = NEW.job_id;
        ELSIF v_to = 'packaging' THEN
          UPDATE public.cab_jobs SET current_stage_key = 'cabinetry_assembled' WHERE id = NEW.job_id;
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
        current_stage_key = 'awaiting_signoff',
        install_completed_at = now(),
        state = 'installed_pending_signoff',
        estimated_next_action_at = now() + interval '2 days',
        updated_at = now()
      WHERE id = NEW.job_id;
      INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
      VALUES (v_job.company_id, 'customer.signoff.requested', NEW.job_id, '{}'::jsonb, 'pending');

    WHEN 'customer.signoff.requested' THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'awaiting_signoff',
        updated_at = now()
      WHERE id = NEW.job_id AND current_stage_key <> 'awaiting_signoff';

    WHEN 'customer.signoff.completed' THEN
      UPDATE public.cab_jobs SET
        customer_signoff_at = now(),
        current_stage_key = 'practical_completed',
        state = 'awaiting_final_payment',
        estimated_next_action_at = now() + interval '3 days',
        updated_at = now()
      WHERE id = NEW.job_id;
      SELECT EXISTS(
        SELECT 1 FROM public.cab_invoices
        WHERE job_id = NEW.job_id AND milestone = 'completion'
      ) INTO v_inv_exists;
      IF NOT v_inv_exists AND v_job.contract_value IS NOT NULL THEN
        v_amount := ROUND(v_job.contract_value * 0.20, 2);
        INSERT INTO public.cab_invoices (
          company_id, job_id, milestone, reference, amount, currency, status, issued_at
        ) VALUES (
          v_job.company_id, NEW.job_id, 'completion',
          v_job.job_ref || '_FIN', v_amount,
          COALESCE(v_job.contract_currency, 'GBP'), 'due', now()
        );
        INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
        VALUES (v_job.company_id, 'invoice.created', NEW.job_id,
          jsonb_build_object('milestone', 'completion', 'amount', v_amount), 'pending');
      END IF;

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
          production_stage = 'materials_ordered',
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
      ELSIF v_milestone IN ('final', 'completion') THEN
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
        WHERE job_id = NEW.job_id AND milestone IN ('final', 'completion')
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
          v_job.company_id, NEW.job_id, 'completion',
          v_job.job_ref || '_FIN', v_amount,
          COALESCE(v_job.contract_currency, 'GBP'), 'due', now()
        );
        INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
        VALUES (v_job.company_id, 'invoice.created', NEW.job_id,
          jsonb_build_object('milestone', 'completion', 'amount', v_amount), 'pending');
      END IF;

  ELSE
    NULL;
  END CASE;

  RETURN NEW;
END;
$function$;