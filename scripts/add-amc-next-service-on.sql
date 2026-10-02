-- Pin the next AMC visit to a chosen date (for example the 1-year end date).
-- Null means the contract calendar (start + service period) decides the next visit.
-- Safe to re-run.

ALTER TABLE public.amc_contracts
  ADD COLUMN IF NOT EXISTS next_service_on date;

COMMENT ON COLUMN public.amc_contracts.next_service_on IS
  'Optional next AMC visit date. When set, auto-create uses this date once instead of the contract calendar. Cleared after a completed visit near that date.';

CREATE OR REPLACE FUNCTION public.clear_amc_pushed_visit_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  svc_day date;
BEGIN
  IF NEW.status IS DISTINCT FROM 'COMPLETED' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'COMPLETED'
     AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
  THEN
    RETURN NEW;
  END IF;
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  svc_day := (COALESCE(NEW.completed_at, NEW.end_time, now()) AT TIME ZONE 'Asia/Kolkata')::date;

  UPDATE public.amc_contracts a
  SET next_service_on = NULL,
      updated_at = now()
  WHERE a.customer_id = NEW.customer_id
    AND a.status = 'ACTIVE'
    AND a.next_service_on IS NOT NULL
    AND svc_day > a.start_date
    AND svc_day >= (a.next_service_on - 21);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_amc_pushed_visit ON public.jobs;
CREATE TRIGGER trg_clear_amc_pushed_visit
  AFTER INSERT OR UPDATE OF status, completed_at, end_time
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_amc_pushed_visit_on_completion();
