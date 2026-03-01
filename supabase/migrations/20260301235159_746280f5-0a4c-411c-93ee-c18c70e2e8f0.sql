
-- ═══════════════════════════════════════════════════════
-- PHASE 5A: SUPPLIER PORTAL & PURCHASE ORDER MANAGEMENT
-- ═══════════════════════════════════════════════════════

-- 1. Purchase Orders
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid REFERENCES public.jobs(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  confirmed_delivery_date date,
  total_ex_vat numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total_inc_vat numeric NOT NULL DEFAULT 0,
  linked_bill_id uuid REFERENCES public.bills(id),
  notes text,
  delivery_address text,
  tracking_reference text,
  delivery_note_reference text,
  created_by_staff_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_purchase_orders_tenant BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view tenant POs" ON public.purchase_orders
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant POs" ON public.purchase_orders
  FOR ALL USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office') OR public.has_role(auth.uid(), 'supervisor'))
  );

-- 2. Purchase Order Items
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost_ex_vat numeric NOT NULL DEFAULT 0,
  total_ex_vat numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 20,
  job_cost_category text NOT NULL DEFAULT 'materials',
  received_quantity numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_po_items_tenant BEFORE INSERT ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER update_po_items_updated_at BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view tenant PO items" ON public.purchase_order_items
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage tenant PO items" ON public.purchase_order_items
  FOR ALL USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office') OR public.has_role(auth.uid(), 'supervisor'))
  );

-- 3. Supplier Users
CREATE TABLE public.supplier_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  user_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  supplier_role text NOT NULL DEFAULT 'primary',
  active boolean NOT NULL DEFAULT true,
  portal_access_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_users ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_supplier_users_updated_at BEFORE UPDATE ON public.supplier_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins can manage supplier users" ON public.supplier_users
  FOR ALL USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office'))
  );

CREATE POLICY "Supplier users can view own record" ON public.supplier_users
  FOR SELECT USING (user_id = auth.uid());

-- 4. Supplier Access Tokens
CREATE TABLE public.supplier_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  supplier_user_id uuid NOT NULL REFERENCES public.supplier_users(id),
  po_id uuid REFERENCES public.purchase_orders(id),
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage supplier tokens" ON public.supplier_access_tokens
  FOR ALL USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office'))
  );

-- 5. Supplier Activity Log
CREATE TABLE public.supplier_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  supplier_user_id uuid NOT NULL REFERENCES public.supplier_users(id),
  action text NOT NULL,
  po_id uuid REFERENCES public.purchase_orders(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view supplier activity" ON public.supplier_activity_log
  FOR SELECT USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office'))
  );

CREATE POLICY "Supplier can insert own activity" ON public.supplier_activity_log
  FOR INSERT WITH CHECK (
    supplier_user_id IN (SELECT su.id FROM public.supplier_users su WHERE su.user_id = auth.uid())
  );

CREATE POLICY "Supplier can view own activity" ON public.supplier_activity_log
  FOR SELECT USING (
    supplier_user_id IN (SELECT su.id FROM public.supplier_users su WHERE su.user_id = auth.uid())
  );

-- 6. Supplier Performance (aggregated)
CREATE TABLE public.supplier_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  total_pos integer NOT NULL DEFAULT 0,
  on_time_delivery_percent numeric NOT NULL DEFAULT 0,
  average_delivery_delay_days numeric NOT NULL DEFAULT 0,
  discrepancy_rate_percent numeric NOT NULL DEFAULT 0,
  average_order_value numeric NOT NULL DEFAULT 0,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, supplier_id)
);

ALTER TABLE public.supplier_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant supplier performance" ON public.supplier_performance
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage supplier performance" ON public.supplier_performance
  FOR ALL USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'office'))
  );

-- 7. PO Approval Settings (stored in tenant config via purchasing_settings)
CREATE TABLE public.purchasing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) UNIQUE,
  require_po_approval_over_amount numeric DEFAULT 500,
  approver_role text DEFAULT 'admin',
  auto_approve_under_amount boolean DEFAULT true,
  po_number_prefix text DEFAULT 'PO',
  po_number_next_seq integer DEFAULT 1,
  default_delivery_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchasing_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_purchasing_settings_updated_at BEFORE UPDATE ON public.purchasing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins can manage purchasing settings" ON public.purchasing_settings
  FOR ALL USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can view purchasing settings" ON public.purchasing_settings
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 8. Supplier portal RLS for POs - suppliers can view their own POs
CREATE POLICY "Supplier can view own POs" ON public.purchase_orders
  FOR SELECT USING (
    supplier_id IN (
      SELECT su.supplier_id FROM public.supplier_users su WHERE su.user_id = auth.uid()
    )
  );

CREATE POLICY "Supplier can update own POs" ON public.purchase_orders
  FOR UPDATE USING (
    supplier_id IN (
      SELECT su.supplier_id FROM public.supplier_users su WHERE su.user_id = auth.uid()
    )
  );

CREATE POLICY "Supplier can view own PO items" ON public.purchase_order_items
  FOR SELECT USING (
    po_id IN (
      SELECT po.id FROM public.purchase_orders po
      WHERE po.supplier_id IN (
        SELECT su.supplier_id FROM public.supplier_users su WHERE su.user_id = auth.uid()
      )
    )
  );
