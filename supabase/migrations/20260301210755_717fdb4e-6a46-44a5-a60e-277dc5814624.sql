
CREATE OR REPLACE FUNCTION public.auto_schedule_probation_reviews()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 3-month probation review
  INSERT INTO public.reviews (staff_id, title, review_type, due_date, status)
  VALUES (
    NEW.user_id,
    NEW.full_name || ' – 3-Month Probation',
    'Probation',
    NEW.start_date + INTERVAL '3 months',
    'Scheduled'
  );

  -- 6-month probation review
  INSERT INTO public.reviews (staff_id, title, review_type, due_date, status)
  VALUES (
    NEW.user_id,
    NEW.full_name || ' – 6-Month Probation',
    'Probation',
    NEW.start_date + INTERVAL '6 months',
    'Scheduled'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_probation_reviews
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_schedule_probation_reviews();
