
-- Bank accounts linked via TrueLayer
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  truelayer_account_id text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL DEFAULT 'unknown',
  currency text NOT NULL DEFAULT 'GBP',
  provider_name text,
  sort_code text,
  account_number_last4 text,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, truelayer_account_id)
);

-- Bank transactions from feed
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  truelayer_transaction_id text NOT NULL,
  transaction_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  description text,
  counterparty_name text,
  transaction_type text,
  transaction_category text,
  running_balance numeric(12,2),
  status text NOT NULL DEFAULT 'unmatched',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, truelayer_transaction_id)
);

-- Matches between transactions and documents
CREATE TABLE public.bank_document_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  bank_transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  file_asset_id uuid REFERENCES public.file_assets(id) ON DELETE SET NULL,
  bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  match_type text NOT NULL DEFAULT 'manual',
  confidence_score numeric(3,2) DEFAULT 0,
  match_reason text,
  status text NOT NULL DEFAULT 'suggested',
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- TrueLayer tokens per tenant
CREATE TABLE public.truelayer_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  consent_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_document_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truelayer_connections ENABLE ROW LEVEL SECURITY;

-- bank_accounts policies
CREATE POLICY "Tenant isolation" ON public.bank_accounts FOR ALL USING (public.is_user_tenant(tenant_id));

-- bank_transactions policies
CREATE POLICY "Tenant isolation" ON public.bank_transactions FOR ALL USING (public.is_user_tenant(tenant_id));

-- bank_document_matches policies
CREATE POLICY "Tenant isolation" ON public.bank_document_matches FOR ALL USING (public.is_user_tenant(tenant_id));

-- truelayer_connections policies
CREATE POLICY "Tenant isolation" ON public.truelayer_connections FOR ALL USING (public.is_user_tenant(tenant_id));

-- Triggers for tenant_id auto-set
CREATE TRIGGER set_bank_accounts_tenant BEFORE INSERT ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_bank_transactions_tenant BEFORE INSERT ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_bank_document_matches_tenant BEFORE INSERT ON public.bank_document_matches FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_truelayer_connections_tenant BEFORE INSERT ON public.truelayer_connections FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- Updated_at triggers
CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bank_transactions_updated_at BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bank_document_matches_updated_at BEFORE UPDATE ON public.bank_document_matches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_truelayer_connections_updated_at BEFORE UPDATE ON public.truelayer_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
