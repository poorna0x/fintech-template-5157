-- Recurring Service Tracking
-- Adds contact/follow-up tracking to the existing `reminders` table so recurring
-- service reminders (interval_type = 'months', entity_type = 'customer') can be
-- worked like a call list: track call outcome, last contact time, and a note.
--
-- service_status values used by the app:
--   pending      - reminder is active/due, not yet actioned this cycle
--   not_called   - haven't called the customer yet
--   no_response  - called, no answer
--   waiting      - called, still waiting for the customer to decide
--   will_return  - customer said they'll come back later (often paired with a snooze)
--   confirmed    - customer confirmed they want the service
--   job_created  - a job has been created for this cycle
-- Recurrence resets the next cycle's row back to 'pending'.

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS service_status character varying(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS status_note text;

-- Backfill existing rows so they are never null.
UPDATE public.reminders SET service_status = 'pending' WHERE service_status IS NULL;

-- Constrain to known values (skip if it already exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reminders_service_status_check'
  ) THEN
    ALTER TABLE public.reminders
      ADD CONSTRAINT reminders_service_status_check
      CHECK (
        service_status IS NULL OR service_status IN (
          'pending', 'not_called', 'no_response', 'waiting',
          'will_return', 'confirmed', 'job_created'
        )
      );
  END IF;
END $$;

-- Partial index for the recurring-service tracker query: active, monthly,
-- customer-linked reminders ordered by due date.
CREATE INDEX IF NOT EXISTS idx_reminders_recurring_service
  ON public.reminders (reminder_at)
  WHERE completed_at IS NULL
    AND interval_type = 'months'
    AND entity_type = 'customer';

COMMENT ON COLUMN public.reminders.service_status IS 'Recurring-service contact outcome: pending|not_called|no_response|waiting|will_return|confirmed|job_created';
COMMENT ON COLUMN public.reminders.last_contacted_at IS 'When the customer was last contacted for this recurring-service cycle';
COMMENT ON COLUMN public.reminders.status_note IS 'Free-text note about the latest recurring-service contact attempt';
