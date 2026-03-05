
-- Customer-to-auth-user binding for portal security
CREATE TABLE public.cab_customer_auth_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.cab_customers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.cab_companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(auth_user_id, customer_id)
);

ALTER TABLE public.cab_customer_auth_links ENABLE ROW LEVEL SECURITY;

-- Customers can read their own links
CREATE POLICY "Users can read own links"
ON public.cab_customer_auth_links FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

-- Company admins can manage links
CREATE POLICY "Company admins can manage links"
ON public.cab_customer_auth_links FOR ALL TO authenticated
USING (company_id IN (SELECT company_id FROM public.cab_user_profiles WHERE id = auth.uid()));
