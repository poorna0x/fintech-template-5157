-- Allow admins to delete job reviews from Settings → Customer reviews.
-- Safe to re-run. Run in Supabase SQL Editor.
-- Requires public.is_admin_user().

GRANT DELETE ON public.job_reviews TO authenticated;

DROP POLICY IF EXISTS job_reviews_admin_delete ON public.job_reviews;
CREATE POLICY job_reviews_admin_delete
  ON public.job_reviews
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());
