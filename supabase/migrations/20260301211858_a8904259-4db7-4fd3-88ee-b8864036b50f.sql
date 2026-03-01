
CREATE OR REPLACE FUNCTION public.sync_holiday_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer;
BEGIN
  -- Calculate working days (simple: end - start + 1)
  v_days := (NEW.end_date - NEW.start_date) + 1;

  -- Approving: deduct days
  IF NEW.status = 'Approved' AND (OLD.status IS DISTINCT FROM 'Approved') THEN
    UPDATE public.profiles
    SET holiday_balance_days = holiday_balance_days - v_days
    WHERE user_id = NEW.staff_id;
  END IF;

  -- Revoking approval (Rejected/Cancelled from Approved): restore days
  IF OLD.status = 'Approved' AND NEW.status IN ('Rejected', 'Cancelled') THEN
    UPDATE public.profiles
    SET holiday_balance_days = holiday_balance_days + v_days
    WHERE user_id = NEW.staff_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_holiday_balance
  AFTER UPDATE OF status ON public.holiday_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_holiday_balance();
