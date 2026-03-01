
-- ═══════════════════════════════════════════════════════
-- FINANCE MODULE — SCHEMA
-- ═══════════════════════════════════════════════════════

-- 1) Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  name text NOT NULL,
  email text,
  phone text,
  billing_address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant customers" ON public.customers FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant customers" ON public.customers FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));
CREATE TRIGGER set_customers_tenant BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant suppliers" ON public.suppliers FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant suppliers" ON public.suppliers FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));
CREATE TRIGGER set_suppliers_tenant BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Job Financials (1:1 with jobs)
CREATE TABLE public.job_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id),
  quote_value_ex_vat numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 20,
  deposit_required numeric NOT NULL DEFAULT 0,
  deposit_received numeric NOT NULL DEFAULT 0,
  revenue_status text NOT NULL DEFAULT 'quoted',
  expected_invoice_date date,
  expected_payment_date date,
  labour_cost_override numeric,
  material_cost_override numeric,
  overhead_allocation_override numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant job financials" ON public.job_financials FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant job financials" ON public.job_financials FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));
CREATE TRIGGER set_job_financials_tenant BEFORE INSERT ON public.job_financials FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_job_financials_updated_at BEFORE UPDATE ON public.job_financials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Invoices (Sales)
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  job_id uuid REFERENCES public.jobs(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  invoice_number text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  amount_ex_vat numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_received_date date,
  payment_method text,
  reference text,
  created_by_staff_id uuid,
  external_system text,
  external_id text,
  sync_status text NOT NULL DEFAULT 'not_linked',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant invoices" ON public.invoices FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant invoices" ON public.invoices FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));
CREATE TRIGGER set_invoices_tenant BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Bills (Purchases)
CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  job_id uuid REFERENCES public.jobs(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  bill_reference text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'unpaid',
  amount_ex_vat numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_date date,
  category text NOT NULL DEFAULT 'other',
  notes text,
  external_system text,
  external_id text,
  sync_status text NOT NULL DEFAULT 'not_linked',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant bills" ON public.bills FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant bills" ON public.bills FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));
CREATE TRIGGER set_bills_tenant BEFORE INSERT ON public.bills FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Wage Plans
CREATE TABLE public.wage_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_wages_expected numeric NOT NULL DEFAULT 0,
  total_wages_actual numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wage_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant wage plans" ON public.wage_plans FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant wage plans" ON public.wage_plans FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));
CREATE TRIGGER set_wage_plans_tenant BEFORE INSERT ON public.wage_plans FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_wage_plans_updated_at BEFORE UPDATE ON public.wage_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Overheads
CREATE TABLE public.overheads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  frequency text NOT NULL DEFAULT 'monthly',
  amount numeric NOT NULL DEFAULT 0,
  next_due_date date,
  autopopulate_future boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.overheads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view tenant overheads" ON public.overheads FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can manage tenant overheads" ON public.overheads FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office')));
CREATE TRIGGER set_overheads_tenant BEFORE INSERT ON public.overheads FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_overheads_updated_at BEFORE UPDATE ON public.overheads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8) Finance Audit Log
CREATE TABLE public.finance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field_changed text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view tenant audit log" ON public.finance_audit_log FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert tenant audit log" ON public.finance_audit_log FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE TRIGGER set_audit_log_tenant BEFORE INSERT ON public.finance_audit_log FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- 9) Add enable_finance feature flag for default tenant
INSERT INTO public.tenant_feature_flags (tenant_id, flag_name, enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'enable_finance', true)
ON CONFLICT DO NOTHING;
