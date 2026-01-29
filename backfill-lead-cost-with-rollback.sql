-- Backfill lead_cost for old jobs (no backup table; no rollback).
-- Run this in Supabase SQL Editor when you want to set lead costs on existing jobs.

-- Rules:
--   RO Care:    Service = 400, Installation & others = 200
--   Home Triangle: all = 200
--   Local Ramu:  all = 500
--   Others (Direct, Google, Website, etc.): 0

WITH params AS (
    SELECT
        j.id,
        LOWER(COALESCE(
            (SELECT e->>'lead_source'
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j.requirements) = 'array' THEN j.requirements ELSE '[]'::jsonb END) AS e
             WHERE e ? 'lead_source'
             LIMIT 1),
            CASE WHEN jsonb_typeof(j.requirements) = 'object' THEN j.requirements->>'lead_source' END,
            ''
        )) AS lead_source_lower,
        LOWER(TRIM(COALESCE(j.service_sub_type, ''))) AS service_lower
    FROM public.jobs j
)
UPDATE public.jobs j
SET lead_cost = CASE
    WHEN p.lead_source_lower LIKE '%ro care%' OR p.lead_source_lower LIKE '%rocare%' OR p.lead_source_lower LIKE '%rocare india%' THEN
        CASE WHEN p.service_lower = 'service' THEN 400 ELSE 200 END
    WHEN p.lead_source_lower LIKE '%home triangle%' OR p.lead_source_lower LIKE '%hometriangle%' THEN 200
    WHEN p.lead_source_lower LIKE '%local ramu%' OR p.lead_source_lower LIKE '%localramu%' THEN 500
    ELSE 0
END
FROM params p
WHERE j.id = p.id;
