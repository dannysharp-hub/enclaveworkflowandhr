
-- Add missing columns to cab_suppliers (IF NOT EXISTS handled via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cab_suppliers' AND column_name='contact_phone') THEN
    ALTER TABLE public.cab_suppliers ADD COLUMN contact_phone TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cab_suppliers' AND column_name='contact_email') THEN
    ALTER TABLE public.cab_suppliers ADD COLUMN contact_email TEXT;
  END IF;
END $$;

-- Create supplier products table
CREATE TABLE IF NOT EXISTS public.cab_supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.cab_companies(id),
  supplier_id UUID REFERENCES public.cab_suppliers(id) ON DELETE CASCADE,
  category TEXT,
  name TEXT NOT NULL,
  size TEXT,
  thickness TEXT,
  pack_rate NUMERIC,
  mixed_rate NUMERIC,
  loose_rate NUMERIC,
  pieces_per_pack INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cab_supplier_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view supplier products"
  ON public.cab_supplier_products FOR SELECT TO authenticated
  USING (public.is_cab_company_member(company_id));

CREATE POLICY "Admins can manage supplier products"
  ON public.cab_supplier_products FOR ALL TO authenticated
  USING (public.is_cab_company_admin(company_id))
  WITH CHECK (public.is_cab_company_admin(company_id));
