
-- Clock anomalies table for tracking missed clock-outs
CREATE TABLE public.clock_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  staff_id text NOT NULL,
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  anomaly_type text NOT NULL DEFAULT 'missing_clock_out',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_clock_out timestamptz,
  resolution_type text, -- 'manual_time', 'standard_shift_end', 'admin_edit'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clock_anomalies ENABLE ROW LEVEL SECURITY;

-- Staff can see and resolve their own anomalies
CREATE POLICY "Staff can view own anomalies"
  ON public.clock_anomalies FOR SELECT
  TO authenticated
  USING (staff_id = auth.uid()::text OR public.get_user_role(auth.uid()) IN ('admin', 'supervisor', 'office'));

CREATE POLICY "Staff can update own anomalies"
  ON public.clock_anomalies FOR UPDATE
  TO authenticated
  USING (staff_id = auth.uid()::text OR public.get_user_role(auth.uid()) IN ('admin', 'supervisor', 'office'));

CREATE POLICY "System can insert anomalies"
  ON public.clock_anomalies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add trigger for tenant_id
CREATE TRIGGER set_clock_anomalies_tenant_id
  BEFORE INSERT ON public.clock_anomalies
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id();
