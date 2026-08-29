-- Admin-only customer merge: move all data from duplicate → keeper, merge profile, delete duplicate.
-- Run once in Supabase SQL Editor after secure-delete-job-admin-rpc-2026-05-24.sql
-- (requires public.is_admin_account() and public.is_admin_user()).
--
-- Usage:
--   SELECT public.preview_merge_customers_admin('<keeper-uuid>', '<duplicate-uuid>');
--   SELECT public.merge_customers_admin('<keeper-uuid>', '<duplicate-uuid>');

-- ---------------------------------------------------------------------------
-- Shared guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_merge_customers_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_account() THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_merge_customers_admin() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Preview counts (no writes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_merge_customers_admin(
  p_primary uuid,
  p_secondary uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary public.customers%ROWTYPE;
  v_secondary public.customers%ROWTYPE;
  v_jobs integer;
  v_amc integer;
  v_calls integer;
  v_invoices integer;
  v_reminders integer;
BEGIN
  PERFORM public._assert_merge_customers_admin();

  IF p_primary IS NULL OR p_secondary IS NULL THEN
    RAISE EXCEPTION 'primary and secondary customer ids are required' USING ERRCODE = '22023';
  END IF;

  IF p_primary = p_secondary THEN
    RAISE EXCEPTION 'cannot merge a customer into itself' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_primary FROM public.customers WHERE id = p_primary;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'primary customer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_secondary FROM public.customers WHERE id = p_secondary;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'secondary customer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer INTO v_jobs FROM public.jobs WHERE customer_id = p_secondary;
  SELECT count(*)::integer INTO v_amc FROM public.amc_contracts WHERE customer_id = p_secondary;
  SELECT count(*)::integer INTO v_calls FROM public.call_history WHERE customer_id = p_secondary;
  SELECT count(*)::integer INTO v_invoices FROM public.tax_invoices WHERE customer_id = p_secondary;
  SELECT count(*)::integer INTO v_reminders
  FROM public.reminders
  WHERE entity_type = 'customer' AND entity_id = p_secondary;

  RETURN jsonb_build_object(
    'primary', jsonb_build_object(
      'id', v_primary.id,
      'customer_id', v_primary.customer_id,
      'full_name', v_primary.full_name,
      'phone', v_primary.phone,
      'alternate_phone', v_primary.alternate_phone,
      'customer_since', v_primary.customer_since,
      'jobs_count', (SELECT count(*)::integer FROM public.jobs WHERE customer_id = p_primary)
    ),
    'secondary', jsonb_build_object(
      'id', v_secondary.id,
      'customer_id', v_secondary.customer_id,
      'full_name', v_secondary.full_name,
      'phone', v_secondary.phone,
      'alternate_phone', v_secondary.alternate_phone,
      'customer_since', v_secondary.customer_since,
      'jobs_count', v_jobs
    ),
    'counts', jsonb_build_object(
      'jobs', v_jobs,
      'amc_contracts', v_amc,
      'call_history', v_calls,
      'tax_invoices', v_invoices,
      'reminders', v_reminders
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_merge_customers_admin(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_merge_customers_admin(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_merge_customers_admin(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Merge (atomic)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_customers_admin(
  p_primary uuid,
  p_secondary uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary public.customers%ROWTYPE;
  v_secondary public.customers%ROWTYPE;
  v_jobs integer;
  v_amc integer;
  v_calls integer;
  v_invoices integer;
  v_reminders integer;
  v_notes text;
  v_alt_phone character varying(15);
  v_photos jsonb;
  v_customer_since timestamptz;
  v_last_service timestamptz;
  v_has_review boolean;
  v_tier character varying(20);
  v_job_brand character varying(100);
  v_job_model character varying(100);
  v_job_service_type character varying(20);
  v_brand character varying(100);
  v_model character varying(100);
  v_service_type character varying(20);
  v_address jsonb;
  v_location jsonb;
BEGIN
  PERFORM public._assert_merge_customers_admin();

  IF p_primary IS NULL OR p_secondary IS NULL THEN
    RAISE EXCEPTION 'primary and secondary customer ids are required' USING ERRCODE = '22023';
  END IF;

  IF p_primary = p_secondary THEN
    RAISE EXCEPTION 'cannot merge a customer into itself' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_primary FROM public.customers WHERE id = p_primary FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'primary customer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_secondary FROM public.customers WHERE id = p_secondary FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'secondary customer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer INTO v_jobs FROM public.jobs WHERE customer_id = p_secondary;
  SELECT count(*)::integer INTO v_amc FROM public.amc_contracts WHERE customer_id = p_secondary;
  SELECT count(*)::integer INTO v_calls FROM public.call_history WHERE customer_id = p_secondary;
  SELECT count(*)::integer INTO v_invoices FROM public.tax_invoices WHERE customer_id = p_secondary;
  SELECT count(*)::integer INTO v_reminders
  FROM public.reminders
  WHERE entity_type = 'customer' AND entity_id = p_secondary;

  UPDATE public.jobs SET customer_id = p_primary, updated_at = now() WHERE customer_id = p_secondary;
  UPDATE public.amc_contracts SET customer_id = p_primary, updated_at = now() WHERE customer_id = p_secondary;
  UPDATE public.call_history SET customer_id = p_primary WHERE customer_id = p_secondary;
  UPDATE public.tax_invoices SET customer_id = p_primary, updated_at = now() WHERE customer_id = p_secondary;
  UPDATE public.reminders
  SET entity_id = p_primary
  WHERE entity_type = 'customer' AND entity_id = p_secondary;

  -- Equipment from the most recent job (after jobs were moved to the keeper),
  -- so the customer profile reflects the latest serviced equipment.
  SELECT j.brand, j.model, j.service_type
  INTO v_job_brand, v_job_model, v_job_service_type
  FROM public.jobs j
  WHERE j.customer_id = p_primary
  ORDER BY j.created_at DESC NULLS LAST
  LIMIT 1;

  v_brand := coalesce(
    nullif(trim(v_job_brand), ''),
    nullif(trim(v_primary.brand), ''),
    nullif(trim(v_secondary.brand), '')
  );
  v_model := coalesce(
    nullif(trim(v_job_model), ''),
    nullif(trim(v_primary.model), ''),
    nullif(trim(v_secondary.model), '')
  );
  -- Jobs allow AC/APPLIANCE but customers only allow RO/SOFTENER/RO_SOFTENER,
  -- so only adopt the job's service_type when it satisfies the customer constraint.
  v_service_type := coalesce(
    CASE
      WHEN trim(v_job_service_type) IN ('RO', 'SOFTENER', 'RO_SOFTENER') THEN trim(v_job_service_type)
      ELSE NULL
    END,
    nullif(trim(v_primary.service_type), ''),
    nullif(trim(v_secondary.service_type), '')
  );

  -- Address + map pin: keep the PRIMARY (keeper). Only fill from the duplicate
  -- when the keeper has no address / pin. Jobs keep their own location snapshots.
  v_address := CASE
    WHEN coalesce(
           nullif(trim(v_primary.address ->> 'street'), ''),
           nullif(trim(v_primary.address ->> 'area'), ''),
           nullif(trim(v_primary.address ->> 'city'), '')
         ) IS NOT NULL THEN v_primary.address
    ELSE v_secondary.address
  END;

  v_location := CASE
    WHEN v_primary.location IS NOT NULL AND v_primary.location <> '{}'::jsonb THEN v_primary.location
    ELSE v_secondary.location
  END;

  -- Notes: append secondary notes
  v_notes := nullif(trim(coalesce(v_primary.notes, '')), '');
  IF nullif(trim(coalesce(v_secondary.notes, '')), '') IS NOT NULL THEN
    IF v_notes IS NULL THEN
      v_notes := trim(v_secondary.notes);
    ELSE
      v_notes := v_notes || E'\n\n--- merged from ' || v_secondary.customer_id || E' ---\n' || trim(v_secondary.notes);
    END IF;
  END IF;

  -- Secondary phone → alternate_phone (or notes if already taken)
  v_alt_phone := nullif(trim(coalesce(v_primary.alternate_phone, '')), '');
  IF nullif(trim(coalesce(v_secondary.phone, '')), '') IS NOT NULL
     AND trim(v_secondary.phone) IS DISTINCT FROM trim(v_primary.phone) THEN
    IF v_alt_phone IS NULL THEN
      v_alt_phone := trim(v_secondary.phone);
    ELSE
      v_notes := coalesce(v_notes, '') || E'\nMerged phone: ' || trim(v_secondary.phone);
    END IF;
  END IF;

  IF nullif(trim(coalesce(v_secondary.alternate_phone, '')), '') IS NOT NULL
     AND trim(v_secondary.alternate_phone) IS DISTINCT FROM trim(v_primary.phone)
     AND trim(v_secondary.alternate_phone) IS DISTINCT FROM coalesce(v_alt_phone, '') THEN
    v_notes := coalesce(v_notes, '') || E'\nMerged alternate phone: ' || trim(v_secondary.alternate_phone);
  END IF;

  v_photos := coalesce(v_primary.photos, '[]'::jsonb) || coalesce(v_secondary.photos, '[]'::jsonb);

  v_customer_since := LEAST(
    coalesce(v_primary.customer_since, v_secondary.customer_since),
    coalesce(v_secondary.customer_since, v_primary.customer_since)
  );

  v_last_service := GREATEST(v_primary.last_service_date, v_secondary.last_service_date);

  v_has_review := coalesce(v_primary.has_google_review, false) OR coalesce(v_secondary.has_google_review, false);
  v_tier := coalesce(nullif(trim(v_primary.customer_tier), ''), nullif(trim(v_secondary.customer_tier), ''));

  UPDATE public.customers
  SET
    alternate_phone = v_alt_phone,
    email = coalesce(nullif(trim(v_primary.email), ''), nullif(trim(v_secondary.email), ''), v_primary.email),
    address = coalesce(v_address, v_primary.address),
    location = coalesce(v_location, v_primary.location),
    visible_address = coalesce(nullif(trim(v_primary.visible_address), ''), nullif(trim(v_secondary.visible_address), '')),
    alternate_address = CASE
      WHEN v_primary.alternate_address IS NOT NULL AND v_primary.alternate_address <> '{}'::jsonb THEN v_primary.alternate_address
      ELSE v_secondary.alternate_address
    END,
    alternate_location = CASE
      WHEN v_primary.alternate_location IS NOT NULL AND v_primary.alternate_location <> '{}'::jsonb THEN v_primary.alternate_location
      ELSE v_secondary.alternate_location
    END,
    alternate_visible_address = coalesce(
      nullif(trim(v_primary.alternate_visible_address), ''),
      nullif(trim(v_secondary.alternate_visible_address), '')
    ),
    service_type = coalesce(v_service_type, v_primary.service_type),
    brand = coalesce(v_brand, v_primary.brand),
    model = coalesce(v_model, v_primary.model),
    installation_date = coalesce(v_primary.installation_date, v_secondary.installation_date),
    warranty_expiry = coalesce(v_primary.warranty_expiry, v_secondary.warranty_expiry),
    customer_since = v_customer_since,
    last_service_date = v_last_service,
    notes = nullif(trim(v_notes), ''),
    photos = v_photos,
    preferred_time_slot = coalesce(v_primary.preferred_time_slot, v_secondary.preferred_time_slot),
    preferred_language = coalesce(v_primary.preferred_language, v_secondary.preferred_language),
    custom_time = coalesce(nullif(trim(v_primary.custom_time), ''), nullif(trim(v_secondary.custom_time), '')),
    has_prefilter = coalesce(v_primary.has_prefilter, v_secondary.has_prefilter),
    raw_water_tds = coalesce(v_primary.raw_water_tds, v_secondary.raw_water_tds),
    has_google_review = CASE WHEN v_has_review THEN true ELSE v_primary.has_google_review END,
    customer_tier = v_tier,
    gst_number = coalesce(
      nullif(trim(v_primary.gst_number), ''),
      nullif(trim(v_secondary.gst_number), '')
    ),
    updated_at = now()
  WHERE id = p_primary;

  DELETE FROM public.customers WHERE id = p_secondary;

  RETURN jsonb_build_object(
    'primary_customer_id', v_primary.customer_id,
    'deleted_customer_id', v_secondary.customer_id,
    'jobs_moved', v_jobs,
    'amc_contracts_moved', v_amc,
    'call_history_moved', v_calls,
    'tax_invoices_moved', v_invoices,
    'reminders_moved', v_reminders
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_customers_admin(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_customers_admin(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_customers_admin(uuid, uuid) TO authenticated;
