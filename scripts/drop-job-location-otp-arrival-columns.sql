-- Remove location-based Auto Ask OTP + admin arrival push columns.
-- Safe to re-run. Manual Ask OTP (technician_otp_requests) is unchanged.

DROP INDEX IF EXISTS public.jobs_otp_auto_asked_at_idx;
DROP INDEX IF EXISTS public.jobs_otp_onsite_detected_at_idx;
DROP INDEX IF EXISTS public.jobs_tech_arrived_at_idx;

ALTER TABLE public.jobs DROP COLUMN IF EXISTS otp_auto_asked_at;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS otp_onsite_detected_at;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS tech_arrived_at;
