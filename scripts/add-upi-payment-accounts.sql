-- UPI payment accounts for pending-payment WhatsApp (UPI ID + payment phone).
-- Admin-only; syncs across devices. Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.upi_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  upi_id text NOT NULL,
  payee_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT upi_payment_accounts_label_len CHECK (char_length(label) <= 120),
  CONSTRAINT upi_payment_accounts_upi_len CHECK (char_length(upi_id) <= 120),
  CONSTRAINT upi_payment_accounts_phone_len CHECK (char_length(phone) <= 20)
);

CREATE INDEX IF NOT EXISTS idx_upi_payment_accounts_created
  ON public.upi_payment_accounts (created_at DESC);

ALTER TABLE public.upi_payment_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upi_payment_accounts_admin_select ON public.upi_payment_accounts;
DROP POLICY IF EXISTS upi_payment_accounts_admin_insert ON public.upi_payment_accounts;
DROP POLICY IF EXISTS upi_payment_accounts_admin_update ON public.upi_payment_accounts;
DROP POLICY IF EXISTS upi_payment_accounts_admin_delete ON public.upi_payment_accounts;

CREATE POLICY upi_payment_accounts_admin_select
  ON public.upi_payment_accounts
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE POLICY upi_payment_accounts_admin_insert
  ON public.upi_payment_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY upi_payment_accounts_admin_update
  ON public.upi_payment_accounts
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY upi_payment_accounts_admin_delete
  ON public.upi_payment_accounts
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

CREATE OR REPLACE FUNCTION public.touch_upi_payment_accounts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upi_payment_accounts_updated_at ON public.upi_payment_accounts;
CREATE TRIGGER trg_upi_payment_accounts_updated_at
  BEFORE UPDATE ON public.upi_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_upi_payment_accounts_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.upi_payment_accounts TO authenticated;
