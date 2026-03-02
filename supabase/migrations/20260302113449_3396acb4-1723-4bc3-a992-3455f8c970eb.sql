
-- Trigger: when holiday_requests status changes to Approved, create a calendar_event
-- When cancelled/rejected, delete the corresponding calendar_event
CREATE OR REPLACE FUNCTION public.sync_holiday_to_calendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff_name text;
  v_event_id uuid;
BEGIN
  -- Get staff name
  SELECT full_name INTO v_staff_name
  FROM public.profiles
  WHERE user_id = NEW.staff_id
  LIMIT 1;

  v_staff_name := COALESCE(v_staff_name, 'Staff');

  -- Holiday approved → create/update calendar event
  IF NEW.status = 'Approved' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'Approved') THEN
    -- Check if calendar event already exists for this holiday
    SELECT id INTO v_event_id
    FROM public.calendar_events
    WHERE job_id IS NULL
      AND event_type = 'Holiday'
      AND title = 'HOLIDAY – ' || v_staff_name
      AND start_datetime::date = NEW.start_date
      AND tenant_id = NEW.tenant_id
    LIMIT 1;

    IF v_event_id IS NOT NULL THEN
      -- Update existing
      UPDATE public.calendar_events SET
        end_datetime = (NEW.end_date + interval '1 day')::timestamptz,
        notes = COALESCE(NEW.reason, '') || ' [Type: ' || NEW.type || ']',
        updated_at = now()
      WHERE id = v_event_id;
    ELSE
      -- Create new
      INSERT INTO public.calendar_events (
        tenant_id, title, event_type, start_datetime, end_datetime, notes, assigned_staff_ids
      ) VALUES (
        NEW.tenant_id,
        'HOLIDAY – ' || v_staff_name,
        'Holiday',
        NEW.start_date::timestamptz,
        (NEW.end_date + interval '1 day')::timestamptz,
        COALESCE(NEW.reason, '') || ' [Type: ' || NEW.type || ']',
        ARRAY[NEW.staff_id]::text[]
      );
    END IF;
  END IF;

  -- Holiday cancelled/rejected → delete calendar event
  IF NEW.status IN ('Cancelled', 'Rejected') AND OLD.status = 'Approved' THEN
    DELETE FROM public.calendar_events
    WHERE event_type = 'Holiday'
      AND title = 'HOLIDAY – ' || v_staff_name
      AND start_datetime::date = NEW.start_date
      AND tenant_id = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_holiday_to_calendar
  AFTER INSERT OR UPDATE ON public.holiday_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_holiday_to_calendar();
