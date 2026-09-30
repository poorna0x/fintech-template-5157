-- Keep customers.last_service_date in sync with COMPLETED jobs (IST calendar day).
-- Client also stamps this; the trigger is the source of truth if that request fails.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.sync_customer_last_service_date_from_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  svc_day date;
BEGIN
  cid := COALESCE(NEW.customer_id, OLD.customer_id);
  IF cid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
     AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
  THEN
    RETURN NEW;
  END IF;

  SELECT (MAX(COALESCE(j.completed_at, j.end_time)) AT TIME ZONE 'Asia/Kolkata')::date
    INTO svc_day
  FROM public.jobs j
  WHERE j.customer_id = cid
    AND j.status = 'COMPLETED'
    AND COALESCE(j.completed_at, j.end_time) IS NOT NULL;

  UPDATE public.customers c
  SET last_service_date = svc_day
  WHERE c.id = cid
    AND c.last_service_date IS DISTINCT FROM svc_day;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_last_service_date ON public.jobs;
CREATE TRIGGER trg_sync_customer_last_service_date
  AFTER INSERT OR DELETE OR UPDATE OF status, completed_at, end_time, customer_id
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_last_service_date_from_jobs();
