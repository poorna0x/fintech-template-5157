-- Fix Ask OTP home card not clearing when OTP is entered from notification/overlay.
-- Filtered realtime UPDATEs on non-PK columns need REPLICA IDENTITY FULL.
-- Safe to re-run.

ALTER TABLE public.technician_otp_requests REPLICA IDENTITY FULL;
