
-- Drop old FK from parts to materials table
ALTER TABLE public.parts DROP CONSTRAINT IF EXISTS parts_material_code_fkey;
