-- Allow PARTIAL payment method on jobs (partial cash + partial online).
-- Run in Supabase SQL Editor.

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_payment_method_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_payment_method_check CHECK (
    payment_method IS NULL OR
    payment_method::text = ANY (ARRAY['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'PARTIAL']::text[])
  );

COMMENT ON COLUMN public.jobs.payment_method IS 'CASH, ONLINE (UPI/CARD/BANK_TRANSFER), or PARTIAL (split cash+online; see requirements.partial_cash_amount, partial_online_amount)';
