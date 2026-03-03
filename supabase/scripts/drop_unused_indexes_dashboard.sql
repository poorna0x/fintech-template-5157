-- OPTIONAL: Drop indexes the linter says are "unused" (not seen in query plans).
-- Only run if you are sure you do not filter/sort by these columns in app or future queries.
-- Dropping frees storage and speeds writes; keeping them can speed future lookups.
-- Copy-paste into Supabase Dashboard > SQL Editor only if you want to remove these.

BEGIN;

DROP INDEX IF EXISTS public.idx_customers_email;
DROP INDEX IF EXISTS public.idx_customers_service_type;
DROP INDEX IF EXISTS public.idx_customers_visible_address;
DROP INDEX IF EXISTS public.idx_technicians_phone;
DROP INDEX IF EXISTS public.idx_technicians_status;
DROP INDEX IF EXISTS public.idx_technicians_email;
DROP INDEX IF EXISTS public.idx_technicians_push_subscription;
DROP INDEX IF EXISTS public.idx_technicians_photo;
DROP INDEX IF EXISTS public.idx_jobs_scheduled_date;
DROP INDEX IF EXISTS public.idx_jobs_status_follow_up;
DROP INDEX IF EXISTS public.idx_service_areas_pincode;
DROP INDEX IF EXISTS public.idx_service_areas_city;
DROP INDEX IF EXISTS public.idx_notifications_user_id;
DROP INDEX IF EXISTS public.idx_notifications_user_type;
DROP INDEX IF EXISTS public.idx_notifications_is_read;
DROP INDEX IF EXISTS public.idx_follow_ups_date;
DROP INDEX IF EXISTS public.idx_follow_ups_completed;
DROP INDEX IF EXISTS public.idx_inventory_code;
DROP INDEX IF EXISTS public.idx_inventory_product_name;
DROP INDEX IF EXISTS public.idx_technician_payments_status;
DROP INDEX IF EXISTS public.idx_technician_payments_payment_date;
DROP INDEX IF EXISTS public.idx_reminders_reminder_at;
DROP INDEX IF EXISTS public.idx_technician_holidays_technician_id;
DROP INDEX IF EXISTS public.idx_tax_invoices_invoice_date;
DROP INDEX IF EXISTS public.idx_business_expenses_category;
DROP INDEX IF EXISTS public.idx_amc_contracts_end_date;
DROP INDEX IF EXISTS public.idx_amc_contracts_start_date;
DROP INDEX IF EXISTS public.idx_call_history_customer_id;
DROP INDEX IF EXISTS public.idx_call_history_contacted_at;

COMMIT;
