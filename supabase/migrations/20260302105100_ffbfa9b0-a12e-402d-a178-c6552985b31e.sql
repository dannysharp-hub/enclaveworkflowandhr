
-- Add DXF bounding box extraction fields to part_library
ALTER TABLE public.part_library
  ADD COLUMN IF NOT EXISTS bbox_width_mm numeric,
  ADD COLUMN IF NOT EXISTS bbox_height_mm numeric,
  ADD COLUMN IF NOT EXISTS bbox_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS bbox_source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS bbox_confidence text,
  ADD COLUMN IF NOT EXISTS polygon_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS polygon_source text,
  ADD COLUMN IF NOT EXISTS polygon_confidence text,
  ADD COLUMN IF NOT EXISTS outline_layer_name_used text,
  ADD COLUMN IF NOT EXISTS extraction_notes text;

-- Add DXF bounding box extraction fields to parts (job parts)
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS bbox_width_mm numeric,
  ADD COLUMN IF NOT EXISTS bbox_height_mm numeric,
  ADD COLUMN IF NOT EXISTS bbox_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS bbox_source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS bbox_confidence text,
  ADD COLUMN IF NOT EXISTS outer_shape_type text DEFAULT 'rect',
  ADD COLUMN IF NOT EXISTS outer_polygon_points_json jsonb,
  ADD COLUMN IF NOT EXISTS polygon_source text,
  ADD COLUMN IF NOT EXISTS polygon_confidence text,
  ADD COLUMN IF NOT EXISTS outline_layer_name_used text,
  ADD COLUMN IF NOT EXISTS extraction_notes text;

-- Add tenant settings for DXF extraction
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS dxf_units_default text DEFAULT 'mm',
  ADD COLUMN IF NOT EXISTS outline_layer_preference text DEFAULT 'OUTLINE';

-- Add feature flag for polygon extraction
INSERT INTO public.tenant_feature_flags (tenant_id, flag_name, enabled)
SELECT t.id, 'enable_polygon_outline_extraction', false
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_feature_flags tff
  WHERE tff.tenant_id = t.id AND tff.flag_name = 'enable_polygon_outline_extraction'
);

-- Add DXF extraction audit log table
CREATE TABLE IF NOT EXISTS public.dxf_extraction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  entity_type text NOT NULL, -- 'part_library' or 'parts'
  entity_id uuid NOT NULL,
  dxf_file_reference text,
  extracted_at timestamptz DEFAULT now(),
  extracted_by uuid,
  bbox_width_mm numeric,
  bbox_height_mm numeric,
  bbox_confidence text,
  polygon_extracted boolean DEFAULT false,
  polygon_confidence text,
  previous_bbox_width_mm numeric,
  previous_bbox_height_mm numeric,
  manual_override_exists boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- RLS for extraction log
ALTER TABLE public.dxf_extraction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for dxf_extraction_log"
  ON public.dxf_extraction_log
  FOR ALL
  USING (public.is_user_tenant(tenant_id))
  WITH CHECK (public.is_user_tenant(tenant_id));

-- Tenant auto-set trigger
CREATE TRIGGER set_tenant_id_dxf_extraction_log
  BEFORE INSERT ON public.dxf_extraction_log
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id();
