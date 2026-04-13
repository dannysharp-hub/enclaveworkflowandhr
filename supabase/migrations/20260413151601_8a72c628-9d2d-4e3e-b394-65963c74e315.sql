UPDATE public.cab_jobs 
SET production_stage = 'materials_ordered', 
    production_stage_key = 'materials_ordered',
    updated_at = now() 
WHERE deposit_paid_at IS NOT NULL 
AND (production_stage IS NULL OR production_stage = '')
AND (production_stage_key IS NULL OR production_stage_key = 'not_ready' OR production_stage_key = 'lead' OR production_stage_key = 'awaiting_deposit');