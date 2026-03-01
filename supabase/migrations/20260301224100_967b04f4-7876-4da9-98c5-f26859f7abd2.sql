
-- ═══════════════════════════════════════════════════════════
-- PHASE 3A: Cashflow Forecast Engine — Schema
-- ═══════════════════════════════════════════════════════════

-- 1) CashflowScenario
CREATE TABLE public.cashflow_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  assumptions_json jsonb NOT NULL DEFAULT '{
    "probability_of_quote_conversion_percent": 70,
    "average_days_to_invoice_after_stage_complete": 3,
    "average_days_to_pay_after_invoice_due": 0,
    "late_payment_probability_percent": 15,
    "late_payment_extra_days": 14,
    "deposit_probability_percent": 80,
    "deposit_percent_of_quote": 30,
    "wage_buffer_percent": 0,
    "overhead_buffer_percent": 0,
    "bill_slippage_probability_percent": 10,
    "bill_slippage_extra_days": 7
  }'::jsonb,
  created_by_staff_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.cashflow_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant cashflow scenarios"
  ON public.cashflow_scenarios FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office')));

CREATE POLICY "Users can view tenant cashflow scenarios"
  ON public.cashflow_scenarios FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_tenant_id_cashflow_scenarios BEFORE INSERT ON public.cashflow_scenarios FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_cashflow_scenarios BEFORE UPDATE ON public.cashflow_scenarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) CashflowRule
CREATE TABLE public.cashflow_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  rule_type text NOT NULL DEFAULT 'expected_payment',
  applies_to text NOT NULL DEFAULT 'all',
  match_value text,
  offset_days integer NOT NULL DEFAULT 0,
  probability_percent integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cashflow_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant cashflow rules"
  ON public.cashflow_rules FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office')));

CREATE POLICY "Users can view tenant cashflow rules"
  ON public.cashflow_rules FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_tenant_id_cashflow_rules BEFORE INSERT ON public.cashflow_rules FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_cashflow_rules BEFORE UPDATE ON public.cashflow_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3) CashflowEvent (generated forecast entries)
CREATE TABLE public.cashflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  scenario_id uuid NOT NULL REFERENCES public.cashflow_scenarios(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  event_type text NOT NULL, -- 'cash_in' or 'cash_out'
  source_type text NOT NULL, -- 'invoice','job_quote','bill','overhead','wage_plan','manual_adjustment'
  source_id text,
  job_id uuid,
  counterparty_name text,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'medium', -- 'high','medium','low'
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cashflow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant cashflow events"
  ON public.cashflow_events FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office')));

CREATE POLICY "Users can view tenant cashflow events"
  ON public.cashflow_events FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_tenant_id_cashflow_events BEFORE INSERT ON public.cashflow_events FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

CREATE INDEX idx_cashflow_events_scenario ON public.cashflow_events(scenario_id, event_date);
CREATE INDEX idx_cashflow_events_tenant_date ON public.cashflow_events(tenant_id, event_date);


-- 4) ManualCashflowAdjustment
CREATE TABLE public.cashflow_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  scenario_id uuid REFERENCES public.cashflow_scenarios(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  event_type text NOT NULL DEFAULT 'cash_out', -- 'cash_in' or 'cash_out'
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  recurring text NOT NULL DEFAULT 'none', -- 'none','weekly','monthly','quarterly','annual'
  end_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cashflow_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant cashflow adjustments"
  ON public.cashflow_adjustments FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office')));

CREATE POLICY "Users can view tenant cashflow adjustments"
  ON public.cashflow_adjustments FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_tenant_id_cashflow_adjustments BEFORE INSERT ON public.cashflow_adjustments FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_cashflow_adjustments BEFORE UPDATE ON public.cashflow_adjustments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 5) JobPaymentSchedule
CREATE TABLE public.job_payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  milestone text NOT NULL DEFAULT 'other', -- 'deposit','pre_cnc','pre_install','completion','other'
  amount numeric NOT NULL DEFAULT 0,
  expected_date date NOT NULL,
  status text NOT NULL DEFAULT 'expected', -- 'expected','invoiced','paid','cancelled'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_payment_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant job payment schedules"
  ON public.job_payment_schedules FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office')));

CREATE POLICY "Users can view tenant job payment schedules"
  ON public.job_payment_schedules FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_tenant_id_job_payment_schedules BEFORE INSERT ON public.job_payment_schedules FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_job_payment_schedules BEFORE UPDATE ON public.job_payment_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_job_payment_schedules_job ON public.job_payment_schedules(job_id);


-- 6) CashflowForecastSettings (per tenant)
CREATE TABLE public.cashflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) UNIQUE,
  opening_balance numeric NOT NULL DEFAULT 0,
  auto_calculate_opening boolean NOT NULL DEFAULT false,
  default_pay_cycle text NOT NULL DEFAULT 'monthly', -- 'weekly' or 'monthly'
  default_scenario_id uuid REFERENCES public.cashflow_scenarios(id) ON DELETE SET NULL,
  minimum_cash_buffer_amount numeric NOT NULL DEFAULT 0,
  alert_horizon_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cashflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant cashflow settings"
  ON public.cashflow_settings FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'office')));

CREATE POLICY "Users can view tenant cashflow settings"
  ON public.cashflow_settings FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER set_tenant_id_cashflow_settings BEFORE INSERT ON public.cashflow_settings FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_updated_at_cashflow_settings BEFORE UPDATE ON public.cashflow_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
