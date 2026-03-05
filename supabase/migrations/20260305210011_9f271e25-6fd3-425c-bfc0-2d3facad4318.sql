
-- 1) Create cab_job_cost_lines
CREATE TABLE public.cab_job_cost_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.cab_jobs(id) ON DELETE CASCADE,
  cost_type text NOT NULL CHECK (cost_type IN ('materials','labour','subcontract','delivery','overheads','misc')),
  description text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric GENERATED ALWAYS AS (qty * unit_cost) STORED,
  supplier_id uuid NULL REFERENCES public.cab_suppliers(id),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','po','bank','timesheet')),
  external_ref text NULL,
  incurred_at date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cab_job_cost_lines_job ON public.cab_job_cost_lines (company_id, job_id);
CREATE INDEX idx_cab_job_cost_lines_type ON public.cab_job_cost_lines (company_id, cost_type);
CREATE INDEX idx_cab_job_cost_lines_source ON public.cab_job_cost_lines (company_id, source);
CREATE UNIQUE INDEX idx_cab_job_cost_lines_ext_ref ON public.cab_job_cost_lines (company_id, external_ref) WHERE external_ref IS NOT NULL;

ALTER TABLE public.cab_job_cost_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cab_job_cost_lines_member_select" ON public.cab_job_cost_lines
  FOR SELECT TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_job_cost_lines_member_insert" ON public.cab_job_cost_lines
  FOR INSERT TO authenticated WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_job_cost_lines_member_update" ON public.cab_job_cost_lines
  FOR UPDATE TO authenticated USING (public.is_cab_company_member(company_id)) WITH CHECK (public.is_cab_company_member(company_id));
CREATE POLICY "cab_job_cost_lines_member_delete" ON public.cab_job_cost_lines
  FOR DELETE TO authenticated USING (public.is_cab_company_member(company_id));
CREATE POLICY "cab_job_cost_lines_service" ON public.cab_job_cost_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Add columns to cab_jobs
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS target_margin_pct numeric NULL;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS estimated_labour_hours numeric NULL;
ALTER TABLE public.cab_jobs ADD COLUMN IF NOT EXISTS actual_labour_hours numeric NULL;

-- 3) PO auto-fill trigger: when cab_purchase_order_items are inserted/updated, upsert cost lines
CREATE OR REPLACE FUNCTION public.cab_po_item_to_cost_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_po record;
  v_buylist_item record;
  v_ext_ref text;
BEGIN
  v_ext_ref := 'po_item:' || NEW.id;

  SELECT * INTO v_po FROM public.cab_purchase_orders WHERE id = NEW.po_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_buylist_item FROM public.cab_buylist_items WHERE id = NEW.buylist_item_id;

  INSERT INTO public.cab_job_cost_lines (
    company_id, job_id, cost_type, description, qty, unit_cost,
    supplier_id, source, external_ref, incurred_at
  ) VALUES (
    NEW.company_id,
    v_po.job_id,
    'materials',
    COALESCE(v_buylist_item.name, 'PO Item'),
    NEW.qty,
    COALESCE(NEW.unit_price, 0),
    v_po.supplier_id,
    'po',
    v_ext_ref,
    COALESCE(v_po.ordered_at::date, CURRENT_DATE)
  )
  ON CONFLICT (company_id, external_ref) WHERE external_ref IS NOT NULL
  DO UPDATE SET
    qty = EXCLUDED.qty,
    unit_cost = EXCLUDED.unit_cost,
    description = EXCLUDED.description,
    supplier_id = EXCLUDED.supplier_id,
    incurred_at = EXCLUDED.incurred_at,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cab_po_item_cost_sync
  AFTER INSERT OR UPDATE ON public.cab_purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.cab_po_item_to_cost_line();
