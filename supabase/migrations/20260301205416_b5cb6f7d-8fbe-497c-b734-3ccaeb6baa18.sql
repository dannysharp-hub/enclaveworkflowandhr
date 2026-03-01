
CREATE OR REPLACE FUNCTION public.check_staff_stage_authorisation(
  _staff_id uuid,
  _stage_name text
)
RETURNS TABLE(authorised boolean, missing_skills jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_authorised boolean;
  v_missing jsonb;
BEGIN
  WITH required AS (
    SELECT ssr.skill_id, ssr.minimum_level, s.name as skill_name
    FROM stage_skill_requirements ssr
    JOIN skills s ON s.id = ssr.skill_id
    WHERE ssr.stage_name = _stage_name AND ssr.mandatory = true
  ),
  held AS (
    SELECT ss.skill_id, ss.level
    FROM staff_skills ss
    WHERE ss.staff_id = _staff_id
  ),
  level_rank(level_name, lvl_rank) AS (
    VALUES ('Trainee'::text, 1), ('Competent'::text, 2), ('Expert'::text, 3)
  ),
  checked AS (
    SELECT r.skill_name, r.minimum_level,
           COALESCE(h.level, 'None') as held_level,
           COALESCE(lr_req.lvl_rank, 0) as required_rank,
           COALESCE(lr_held.lvl_rank, 0) as held_rank
    FROM required r
    LEFT JOIN held h ON h.skill_id = r.skill_id
    LEFT JOIN level_rank lr_req ON lr_req.level_name = r.minimum_level
    LEFT JOIN level_rank lr_held ON lr_held.level_name = h.level
  )
  SELECT
    NOT EXISTS(SELECT 1 FROM checked c WHERE c.held_rank < c.required_rank),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('skill_name', c2.skill_name, 'required', c2.minimum_level, 'held', c2.held_level))
       FROM checked c2 WHERE c2.held_rank < c2.required_rank),
      '[]'::jsonb
    )
  INTO v_authorised, v_missing;

  RETURN QUERY SELECT v_authorised, v_missing;
END;
$$;
