
-- 1) cab_suppliers
CREATE TABLE public.cab_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  categories text[] DEFAULT '{}',
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cab_suppliers_company_name ON public.cab_suppliers(company_id, name);
ALTER TABLE public.cab_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cab_suppliers_select" ON public.cab_suppliers FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_suppliers_insert" ON public.cab_suppliers FOR INSERT TO authenticated WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_suppliers_update" ON public.cab_suppliers FOR UPDATE TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_suppliers_delete" ON public.cab_suppliers FOR DELETE TO authenticated USING (public.is_cab_company_admin(company_id));

-- 2) cab_buylist_items
CREATE TABLE public.cab_buylist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.cab_jobs(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  name text NOT NULL,
  spec text,
  qty numeric NOT NULL DEFAULT 1,
  unit text,
  required_by_stage text,
  status text NOT NULL DEFAULT 'pending',
  preferred_supplier_id uuid REFERENCES public.cab_suppliers(id),
  chosen_supplier_id uuid REFERENCES public.cab_suppliers(id),
  target_cost numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cab_buylist_items_job ON public.cab_buylist_items(company_id, job_id);
CREATE INDEX idx_cab_buylist_items_status ON public.cab_buylist_items(company_id, status);
CREATE INDEX idx_cab_buylist_items_category ON public.cab_buylist_items(company_id, category);
ALTER TABLE public.cab_buylist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cab_buylist_items_select" ON public.cab_buylist_items FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_buylist_items_insert" ON public.cab_buylist_items FOR INSERT TO authenticated WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_buylist_items_update" ON public.cab_buylist_items FOR UPDATE TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_buylist_items_delete" ON public.cab_buylist_items FOR DELETE TO authenticated USING (public.is_cab_company_member(company_id));

-- 3) cab_rfqs
CREATE TABLE public.cab_rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.cab_jobs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.cab_suppliers(id),
  rfq_ref text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  responded_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, rfq_ref)
);
CREATE INDEX idx_cab_rfqs_job ON public.cab_rfqs(company_id, job_id);
CREATE INDEX idx_cab_rfqs_supplier ON public.cab_rfqs(company_id, supplier_id);
CREATE INDEX idx_cab_rfqs_status ON public.cab_rfqs(company_id, status);
ALTER TABLE public.cab_rfqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cab_rfqs_select" ON public.cab_rfqs FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_rfqs_insert" ON public.cab_rfqs FOR INSERT TO authenticated WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_rfqs_update" ON public.cab_rfqs FOR UPDATE TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_rfqs_delete" ON public.cab_rfqs FOR DELETE TO authenticated USING (public.is_cab_company_admin(company_id));

-- 4) cab_rfq_items
CREATE TABLE public.cab_rfq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES public.cab_rfqs(id) ON DELETE CASCADE,
  buylist_item_id uuid NOT NULL REFERENCES public.cab_buylist_items(id) ON DELETE CASCADE,
  qty numeric NOT NULL DEFAULT 1,
  spec_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cab_rfq_items_rfq ON public.cab_rfq_items(company_id, rfq_id);
ALTER TABLE public.cab_rfq_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cab_rfq_items_select" ON public.cab_rfq_items FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_rfq_items_insert" ON public.cab_rfq_items FOR INSERT TO authenticated WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_rfq_items_update" ON public.cab_rfq_items FOR UPDATE TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_rfq_items_delete" ON public.cab_rfq_items FOR DELETE TO authenticated USING (public.is_cab_company_member(company_id));

-- 5) cab_supplier_quotes
CREATE TABLE public.cab_supplier_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL REFERENCES public.cab_rfqs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.cab_suppliers(id),
  total_price numeric,
  currency text NOT NULL DEFAULT 'GBP',
  lead_time_days int,
  valid_until date,
  notes text,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cab_supplier_quotes_rfq ON public.cab_supplier_quotes(company_id, rfq_id);
ALTER TABLE public.cab_supplier_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cab_supplier_quotes_select" ON public.cab_supplier_quotes FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_supplier_quotes_insert" ON public.cab_supplier_quotes FOR INSERT TO authenticated WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_supplier_quotes_update" ON public.cab_supplier_quotes FOR UPDATE TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_supplier_quotes_delete" ON public.cab_supplier_quotes FOR DELETE TO authenticated USING (public.is_cab_company_admin(company_id));

-- 6) cab_purchase_orders
CREATE TABLE public.cab_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.cab_jobs(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.cab_suppliers(id),
  po_ref text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  ordered_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, po_ref)
);
CREATE INDEX idx_cab_po_job ON public.cab_purchase_orders(company_id, job_id);
CREATE INDEX idx_cab_po_supplier ON public.cab_purchase_orders(company_id, supplier_id);
CREATE INDEX idx_cab_po_status ON public.cab_purchase_orders(company_id, status);
ALTER TABLE public.cab_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cab_po_select" ON public.cab_purchase_orders FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_po_insert" ON public.cab_purchase_orders FOR INSERT TO authenticated WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_po_update" ON public.cab_purchase_orders FOR UPDATE TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_po_delete" ON public.cab_purchase_orders FOR DELETE TO authenticated USING (public.is_cab_company_admin(company_id));

-- 7) cab_purchase_order_items
CREATE TABLE public.cab_purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  po_id uuid NOT NULL REFERENCES public.cab_purchase_orders(id) ON DELETE CASCADE,
  buylist_item_id uuid NOT NULL REFERENCES public.cab_buylist_items(id) ON DELETE CASCADE,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric,
  line_total numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cab_po_items_po ON public.cab_purchase_order_items(company_id, po_id);
ALTER TABLE public.cab_purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cab_po_items_select" ON public.cab_purchase_order_items FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_po_items_insert" ON public.cab_purchase_order_items FOR INSERT TO authenticated WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_po_items_update" ON public.cab_purchase_order_items FOR UPDATE TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_po_items_delete" ON public.cab_purchase_order_items FOR DELETE TO authenticated USING (public.is_cab_company_member(company_id));

-- 8) RFQ ref generator
CREATE OR REPLACE FUNCTION public.cab_next_rfq_ref(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _seq integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN rfq_ref ~ '^RFQ-[0-9]+$'
      THEN CAST(SUBSTRING(rfq_ref FROM 5) AS integer)
      ELSE 0
    END
  ), 0) + 1
  INTO _seq
  FROM public.cab_rfqs
  WHERE company_id = _company_id;
  RETURN 'RFQ-' || LPAD(_seq::text, 4, '0');
END;
$$;

-- 9) PO ref generator
CREATE OR REPLACE FUNCTION public.cab_next_po_ref(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _seq integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN po_ref ~ '^PO-[0-9]+$'
      THEN CAST(SUBSTRING(po_ref FROM 4) AS integer)
      ELSE 0
    END
  ), 0) + 1
  INTO _seq
  FROM public.cab_purchase_orders
  WHERE company_id = _company_id;
  RETURN 'PO-' || LPAD(_seq::text, 4, '0');
END;
$$;

-- 10) Auto-transition: when all buylist items checked_ok → job ready_for_production
CREATE OR REPLACE FUNCTION public.cab_check_buylist_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total int;
  v_checked int;
  v_job record;
BEGIN
  IF NEW.status <> 'checked_ok' THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_total FROM public.cab_buylist_items WHERE job_id = NEW.job_id;
  SELECT count(*) INTO v_checked FROM public.cab_buylist_items WHERE job_id = NEW.job_id AND status = 'checked_ok';

  IF v_total > 0 AND v_total = v_checked THEN
    SELECT * INTO v_job FROM public.cab_jobs WHERE id = NEW.job_id;
    IF v_job.current_stage_key NOT IN ('ready_for_production','manufacturing_started','cabinetry_assembled','installation_complete','practical_completed','closed_paid') THEN
      UPDATE public.cab_jobs SET
        current_stage_key = 'ready_for_production',
        state = 'ready_for_production',
        updated_at = now()
      WHERE id = NEW.job_id;
      INSERT INTO public.cab_events (company_id, event_type, job_id, payload_json, status)
      VALUES (v_job.company_id, 'job.ready_for_production', NEW.job_id, '{}'::jsonb, 'pending');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cab_buylist_complete
AFTER UPDATE ON public.cab_buylist_items
FOR EACH ROW
EXECUTE FUNCTION public.cab_check_buylist_complete();
