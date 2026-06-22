-- Remove first-party website analytics (table, policies, RPCs).
-- Run once in Supabase SQL editor (shared DB for hydrogenro + elevenro).

DROP POLICY IF EXISTS website_analytics_events_admin_select ON public.website_analytics_events;

DROP FUNCTION IF EXISTS public.delete_website_analytics_events(text, integer, date, date, text, text, text);
DROP FUNCTION IF EXISTS public.delete_website_analytics_events(text, integer, date, date, text);
DROP FUNCTION IF EXISTS public.preview_website_analytics_delete(text, integer, date, date, text, text, text);
DROP FUNCTION IF EXISTS public.preview_website_analytics_delete(text, integer, date, date, text);
DROP FUNCTION IF EXISTS public.get_website_analytics_recent_events(date, date, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_website_analytics_recent_events(date, date, text, integer);
DROP FUNCTION IF EXISTS public.get_website_analytics_summary(date, date);
DROP FUNCTION IF EXISTS public.get_website_analytics_summary(integer);
DROP FUNCTION IF EXISTS public.website_analytics_slim_metadata(jsonb);

DROP TABLE IF EXISTS public.website_analytics_events;
