-- Harden customer_id generation under RLS (safe to re-run).
-- Run in Supabase SQL Editor if booking RPC insert fails on trigger.

CREATE OR REPLACE FUNCTION public.generate_customer_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_id INTEGER;
  customer_id TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(c.customer_id FROM 2) AS INTEGER)), 0) + 1
  INTO next_id
  FROM public.customers c
  WHERE c.customer_id ~ '^C[0-9]+$';

  customer_id := 'C' || LPAD(next_id::TEXT, 4, '0');
  RETURN customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_customer_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL OR NEW.customer_id = '' THEN
    NEW.customer_id := public.generate_customer_id();
  END IF;
  RETURN NEW;
END;
$$;
