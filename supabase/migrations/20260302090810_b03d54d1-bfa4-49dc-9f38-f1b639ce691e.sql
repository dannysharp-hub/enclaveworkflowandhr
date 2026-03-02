
-- Payroll settings per tenant
CREATE TABLE public.payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) NOT NULL,
  enable_staff_pay_estimate boolean NOT NULL DEFAULT false,
  pay_currency text NOT NULL DEFAULT 'GBP',
  pay_frequency text NOT NULL DEFAULT 'monthly',
  include_overtime_in_estimate boolean NOT NULL DEFAULT false,
  overtime_multiplier numeric(4,2) NOT NULL DEFAULT 1.5,
  rounding_rule text NOT NULL DEFAULT 'none',
  enable_productivity_kpis boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for payroll_settings"
  ON public.payroll_settings FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

CREATE TRIGGER set_payroll_settings_tenant BEFORE INSERT ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_payroll_settings_updated_at BEFORE UPDATE ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Staff pay profiles
CREATE TABLE public.staff_pay_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) NOT NULL,
  pay_type text NOT NULL DEFAULT 'hourly',
  hourly_rate numeric(10,2),
  salary_monthly numeric(10,2),
  overtime_eligible boolean NOT NULL DEFAULT false,
  tax_handling_note text NOT NULL DEFAULT 'estimate_only_no_tax',
  visible_to_staff boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, tenant_id)
);

ALTER TABLE public.staff_pay_profiles ENABLE ROW LEVEL SECURITY;

-- Admin/office can see all, staff can see only own (if visible_to_staff=true)
CREATE POLICY "Admin/office full access to pay profiles"
  ON public.staff_pay_profiles FOR ALL TO authenticated
  USING (
    public.is_user_tenant(tenant_id)
    AND (
      public.get_user_role(auth.uid()) IN ('admin', 'office')
      OR staff_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_user_tenant(tenant_id)
    AND public.get_user_role(auth.uid()) IN ('admin', 'office')
  );

CREATE TRIGGER set_staff_pay_profiles_tenant BEFORE INSERT ON public.staff_pay_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_staff_pay_profiles_updated_at BEFORE UPDATE ON public.staff_pay_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Time entries (clock in/out)
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  break_minutes integer NOT NULL DEFAULT 0,
  notes text,
  approved boolean NOT NULL DEFAULT false,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Staff see own, admin/supervisor/office see all
CREATE POLICY "Time entries access"
  ON public.time_entries FOR ALL TO authenticated
  USING (
    public.is_user_tenant(tenant_id)
    AND (
      staff_id = auth.uid()
      OR public.get_user_role(auth.uid()) IN ('admin', 'supervisor', 'office')
    )
  )
  WITH CHECK (
    public.is_user_tenant(tenant_id)
    AND (
      staff_id = auth.uid()
      OR public.get_user_role(auth.uid()) IN ('admin', 'supervisor', 'office')
    )
  );

CREATE TRIGGER set_time_entries_tenant BEFORE INSERT ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
