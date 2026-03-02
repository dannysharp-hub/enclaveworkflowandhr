
-- Supplier PO messages (thread between tenant staff and supplier users)
CREATE TABLE public.supplier_po_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  sender_type TEXT NOT NULL DEFAULT 'staff', -- 'staff' or 'supplier'
  sender_id TEXT NOT NULL, -- staff user_id or supplier_user_id
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_po_messages ENABLE ROW LEVEL SECURITY;

-- Staff can read/write messages for their tenant's POs
CREATE POLICY "Staff can manage PO messages" ON public.supplier_po_messages
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id));

-- Supplier documents shared on POs
CREATE TABLE public.supplier_po_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  file_name TEXT NOT NULL,
  file_reference TEXT, -- storage path
  file_size_bytes BIGINT,
  uploaded_by_type TEXT NOT NULL DEFAULT 'staff', -- 'staff' or 'supplier'
  uploaded_by_name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_po_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage PO documents" ON public.supplier_po_documents
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id));

-- Delivery tracking events on POs
CREATE TABLE public.po_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  event_type TEXT NOT NULL DEFAULT 'update', -- 'dispatched', 'in_transit', 'delivered', 'delayed', 'update'
  event_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by_type TEXT NOT NULL DEFAULT 'staff', -- 'staff' or 'supplier'
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.po_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage delivery events" ON public.po_delivery_events
  FOR ALL TO authenticated
  USING (public.is_user_tenant(tenant_id));

-- Add tenant_id set triggers
CREATE TRIGGER set_tenant_id_supplier_po_messages BEFORE INSERT ON public.supplier_po_messages FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_tenant_id_supplier_po_documents BEFORE INSERT ON public.supplier_po_documents FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
CREATE TRIGGER set_tenant_id_po_delivery_events BEFORE INSERT ON public.po_delivery_events FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_po_messages;
