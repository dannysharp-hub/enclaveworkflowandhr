
-- A) Extend cab_jobs with budget/forecast columns
ALTER TABLE public.cab_jobs
  ADD COLUMN IF NOT EXISTS budget_materials numeric NULL,
  ADD COLUMN IF NOT EXISTS budget_labour numeric NULL,
  ADD COLUMN IF NOT EXISTS budget_subcontract numeric NULL,
  ADD COLUMN IF NOT EXISTS budget_delivery numeric NULL,
  ADD COLUMN IF NOT EXISTS budget_overheads numeric NULL,
  ADD COLUMN IF NOT EXISTS budget_misc numeric NULL,
  ADD COLUMN IF NOT EXISTS estimated_remaining_cost numeric NULL,
  ADD COLUMN IF NOT EXISTS profit_last_calculated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS actual_cost_total numeric NULL,
  ADD COLUMN IF NOT EXISTS forecast_cost_total numeric NULL,
  ADD COLUMN IF NOT EXISTS forecast_margin_pct numeric NULL;

CREATE INDEX IF NOT EXISTS idx_cab_jobs_profit_calc ON public.cab_jobs (company_id, profit_last_calculated_at);

-- B) Create cab_job_alerts
CREATE TABLE IF NOT EXISTS public.cab_job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id),
  job_id uuid NOT NULL REFERENCES public.cab_jobs(id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('margin_below_target','margin_below_floor','budget_exceeded','po_over_budget','cost_spike')),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  message text NOT NULL,
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cab_job_alerts_key ON public.cab_job_alerts (company_id, alert_key);
CREATE INDEX IF NOT EXISTS idx_cab_job_alerts_unresolved ON public.cab_job_alerts (company_id, is_resolved, severity);
CREATE INDEX IF NOT EXISTS idx_cab_job_alerts_job ON public.cab_job_alerts (company_id, job_id);

ALTER TABLE public.cab_job_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cab_job_alerts_select" ON public.cab_job_alerts
  FOR SELECT TO authenticated
  USING (public.is_cab_company_member(company_id));

CREATE POLICY "cab_job_alerts_insert" ON public.cab_job_alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cab_company_member(company_id));

CREATE POLICY "cab_job_alerts_update" ON public.cab_job_alerts
  FOR UPDATE TO authenticated
  USING (public.is_cab_company_member(company_id))
  WITH CHECK (public.is_cab_company_member(company_id));

CREATE POLICY "cab_job_alerts_delete" ON public.cab_job_alerts
  FOR DELETE TO authenticated
  USING (public.is_cab_company_admin(company_id));

-- C) Recalc + alert function
CREATE OR REPLACE FUNCTION public.cab_recalc_job_profit(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job record;
  v_revenue numeric;
  v_actual_cost numeric;
  v_remaining numeric;
  v_forecast_cost numeric;
  v_forecast_profit numeric;
  v_forecast_margin numeric;
  v_type text;
  v_budget numeric;
  v_actual_by_type numeric;
  v_po_materials numeric;
  v_types text[] := ARRAY['materials','labour','subcontract','delivery','overheads','misc'];
BEGIN
  SELECT * INTO v_job FROM public.cab_jobs WHERE id = _job_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Revenue
  v_revenue := v_job.contract_value;
  IF v_revenue IS NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_revenue FROM public.cab_invoices WHERE job_id = _job_id;
  END IF;

  -- Actual cost
  SELECT COALESCE(SUM(COALESCE(line_total, qty * unit_cost)), 0) INTO v_actual_cost
  FROM public.cab_job_cost_lines WHERE job_id = _job_id;

  v_remaining := COALESCE(v_job.estimated_remaining_cost, 0);
  v_forecast_cost := v_actual_cost + v_remaining;
  v_forecast_profit := v_revenue - v_forecast_cost;
  v_forecast_margin := CASE WHEN v_revenue > 0 THEN ROUND((v_forecast_profit / v_revenue) * 100, 2) ELSE NULL END;

  -- Persist
  UPDATE public.cab_jobs SET
    actual_cost_total = v_actual_cost,
    forecast_cost_total = v_forecast_cost,
    forecast_margin_pct = v_forecast_margin,
    profit_last_calculated_at = now(),
    updated_at = now()
  WHERE id = _job_id;

  -- ALERT 1: margin below target
  IF v_job.target_margin_pct IS NOT NULL AND v_forecast_margin IS NOT NULL AND v_forecast_margin < v_job.target_margin_pct THEN
    INSERT INTO public.cab_job_alerts (company_id, job_id, alert_key, alert_type, severity, message)
    VALUES (v_job.company_id, _job_id, _job_id || ':margin_below_target', 'margin_below_target', 'warning',
      'Forecast margin ' || v_forecast_margin || '% is below target ' || v_job.target_margin_pct || '%')
    ON CONFLICT (company_id, alert_key) DO UPDATE SET
      message = EXCLUDED.message, is_resolved = false, resolved_at = NULL, updated_at = now();
  ELSE
    UPDATE public.cab_job_alerts SET is_resolved = true, resolved_at = now(), updated_at = now()
    WHERE company_id = v_job.company_id AND alert_key = _job_id || ':margin_below_target' AND is_resolved = false;
  END IF;

  -- ALERT 2: margin below floor (25%)
  IF v_forecast_margin IS NOT NULL AND v_forecast_margin < 25 THEN
    INSERT INTO public.cab_job_alerts (company_id, job_id, alert_key, alert_type, severity, message)
    VALUES (v_job.company_id, _job_id, _job_id || ':margin_below_floor', 'margin_below_floor', 'critical',
      'Forecast margin ' || v_forecast_margin || '% is below 25% floor')
    ON CONFLICT (company_id, alert_key) DO UPDATE SET
      message = EXCLUDED.message, is_resolved = false, resolved_at = NULL, updated_at = now();
  ELSE
    UPDATE public.cab_job_alerts SET is_resolved = true, resolved_at = now(), updated_at = now()
    WHERE company_id = v_job.company_id AND alert_key = _job_id || ':margin_below_floor' AND is_resolved = false;
  END IF;

  -- ALERT 3: budget exceeded per category
  FOREACH v_type IN ARRAY v_types LOOP
    v_budget := CASE v_type
      WHEN 'materials' THEN v_job.budget_materials
      WHEN 'labour' THEN v_job.budget_labour
      WHEN 'subcontract' THEN v_job.budget_subcontract
      WHEN 'delivery' THEN v_job.budget_delivery
      WHEN 'overheads' THEN v_job.budget_overheads
      WHEN 'misc' THEN v_job.budget_misc
      ELSE NULL
    END;

    IF v_budget IS NOT NULL THEN
      SELECT COALESCE(SUM(COALESCE(line_total, qty * unit_cost)), 0) INTO v_actual_by_type
      FROM public.cab_job_cost_lines WHERE job_id = _job_id AND cost_type = v_type;

      IF v_actual_by_type > v_budget THEN
        INSERT INTO public.cab_job_alerts (company_id, job_id, alert_key, alert_type, severity, message)
        VALUES (v_job.company_id, _job_id, _job_id || ':budget_exceeded:' || v_type, 'budget_exceeded', 'warning',
          initcap(v_type) || ' costs £' || v_actual_by_type || ' exceed budget £' || v_budget || ' (over by £' || (v_actual_by_type - v_budget) || ')')
        ON CONFLICT (company_id, alert_key) DO UPDATE SET
          message = EXCLUDED.message, is_resolved = false, resolved_at = NULL, updated_at = now();
      ELSE
        UPDATE public.cab_job_alerts SET is_resolved = true, resolved_at = now(), updated_at = now()
        WHERE company_id = v_job.company_id AND alert_key = _job_id || ':budget_exceeded:' || v_type AND is_resolved = false;
      END IF;
    END IF;
  END LOOP;

  -- ALERT 4: PO over budget (materials)
  IF v_job.budget_materials IS NOT NULL THEN
    SELECT COALESCE(SUM(COALESCE(line_total, qty * unit_cost)), 0) INTO v_po_materials
    FROM public.cab_job_cost_lines WHERE job_id = _job_id AND cost_type = 'materials' AND source = 'po';

    IF v_po_materials > v_job.budget_materials THEN
      INSERT INTO public.cab_job_alerts (company_id, job_id, alert_key, alert_type, severity, message)
      VALUES (v_job.company_id, _job_id, _job_id || ':po_over_budget', 'po_over_budget', 'warning',
        'PO materials £' || v_po_materials || ' exceed budget £' || v_job.budget_materials)
      ON CONFLICT (company_id, alert_key) DO UPDATE SET
        message = EXCLUDED.message, is_resolved = false, resolved_at = NULL, updated_at = now();
    ELSE
      UPDATE public.cab_job_alerts SET is_resolved = true, resolved_at = now(), updated_at = now()
      WHERE company_id = v_job.company_id AND alert_key = _job_id || ':po_over_budget' AND is_resolved = false;
    END IF;
  END IF;
END;
$$;

-- D) Event-driven recalc triggers

-- D1: On cost line changes, emit recalc event
CREATE OR REPLACE FUNCTION public.cab_cost_line_recalc_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_id uuid;
  v_company_id uuid;
BEGIN
  v_job_id := COALESCE(NEW.job_id, OLD.job_id);
  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  
  -- Direct recalc (synchronous, lightweight)
  PERFORM public.cab_recalc_job_profit(v_job_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cab_cost_line_recalc ON public.cab_job_cost_lines;
CREATE TRIGGER trg_cab_cost_line_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.cab_job_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.cab_cost_line_recalc_trigger();

-- D2: On cab_jobs budget/remaining/contract changes
CREATE OR REPLACE FUNCTION public.cab_job_budget_recalc_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.contract_value IS DISTINCT FROM NEW.contract_value
    OR OLD.estimated_remaining_cost IS DISTINCT FROM NEW.estimated_remaining_cost
    OR OLD.budget_materials IS DISTINCT FROM NEW.budget_materials
    OR OLD.budget_labour IS DISTINCT FROM NEW.budget_labour
    OR OLD.budget_subcontract IS DISTINCT FROM NEW.budget_subcontract
    OR OLD.budget_delivery IS DISTINCT FROM NEW.budget_delivery
    OR OLD.budget_overheads IS DISTINCT FROM NEW.budget_overheads
    OR OLD.budget_misc IS DISTINCT FROM NEW.budget_misc
    OR OLD.target_margin_pct IS DISTINCT FROM NEW.target_margin_pct
  THEN
    PERFORM public.cab_recalc_job_profit(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cab_job_budget_recalc ON public.cab_jobs;
CREATE TRIGGER trg_cab_job_budget_recalc
  AFTER UPDATE ON public.cab_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cab_job_budget_recalc_trigger();
