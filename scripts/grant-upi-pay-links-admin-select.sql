-- Allow admins to SELECT upi_pay_links (Settings database export).
-- Anon stays locked out; create/lookup still go through RPCs.

GRANT SELECT ON public.upi_pay_links TO authenticated;

DROP POLICY IF EXISTS upi_pay_links_admin_select ON public.upi_pay_links;
CREATE POLICY upi_pay_links_admin_select
  ON public.upi_pay_links
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());
