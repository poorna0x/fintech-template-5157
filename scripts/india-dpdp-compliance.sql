-- India DPDP / security compliance schema (HydrogenRO + ElevenRO shared backend).
-- Safe to re-run. Apply with service-role / SQL editor.
--
-- Adds: customer_consents, privacy_requests, security_audit_events
-- Fixes: open RLS on inventory/QR/booking_intent delete
-- Extends: purge_ephemeral_data for audit retention + optional WA message age

-- ─────────────────────────────────────────────────────────────
-- 1. Consent records (booking / service / marketing)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_e164 text,
  brand text NOT NULL DEFAULT 'hydrogenro'
    CHECK (brand IN ('hydrogenro', 'elevenro')),
  purpose text NOT NULL
    CHECK (purpose IN (
      'service_booking',
      'service_comms',
      'marketing',
      'analytics_cookies',
      'document_accept'
    )),
  channel text NOT NULL DEFAULT 'website'
    CHECK (channel IN ('website', 'whatsapp', 'crm', 'phone', 'other')),
  notice_version text NOT NULL,
  policy_url text,
  granted boolean NOT NULL DEFAULT true,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  consented_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_consents_customer
  ON public.customer_consents (customer_id, consented_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_consents_phone
  ON public.customer_consents (phone_e164, consented_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_consents_purpose
  ON public.customer_consents (purpose, brand, consented_at DESC);

ALTER TABLE public.customer_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_consents_admin_select ON public.customer_consents;
CREATE POLICY customer_consents_admin_select ON public.customer_consents
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS customer_consents_admin_update ON public.customer_consents;
CREATE POLICY customer_consents_admin_update ON public.customer_consents
  FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON public.customer_consents FROM PUBLIC;
REVOKE ALL ON public.customer_consents FROM anon;
GRANT SELECT, UPDATE ON public.customer_consents TO authenticated;
GRANT ALL ON public.customer_consents TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. Privacy / DSAR requests
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL
    CHECK (request_type IN ('access', 'correction', 'erasure', 'withdraw_consent', 'grievance')),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'in_progress', 'waiting_on_customer', 'completed', 'rejected')),
  brand text NOT NULL DEFAULT 'hydrogenro'
    CHECK (brand IN ('hydrogenro', 'elevenro', 'both')),
  requester_name text,
  requester_phone text,
  requester_email text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  details text,
  admin_notes text,
  sla_due_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_status
  ON public.privacy_requests (status, created_at DESC);

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS privacy_requests_admin_all ON public.privacy_requests;
CREATE POLICY privacy_requests_admin_select ON public.privacy_requests
  FOR SELECT TO authenticated USING (public.is_admin_user());
CREATE POLICY privacy_requests_admin_update ON public.privacy_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY privacy_requests_admin_insert ON public.privacy_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());

REVOKE ALL ON public.privacy_requests FROM PUBLIC;
REVOKE ALL ON public.privacy_requests FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.privacy_requests TO authenticated;
GRANT ALL ON public.privacy_requests TO service_role;

-- Public insert via SECURITY DEFINER (rate-limit in Netlify)
CREATE OR REPLACE FUNCTION public.submit_privacy_request(
  p_request_type text,
  p_brand text,
  p_requester_name text,
  p_requester_phone text,
  p_requester_email text,
  p_details text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  typ text := lower(btrim(coalesce(p_request_type, '')));
  br text := lower(btrim(coalesce(p_brand, 'hydrogenro')));
BEGIN
  IF typ NOT IN ('access', 'correction', 'erasure', 'withdraw_consent', 'grievance') THEN
    RAISE EXCEPTION 'invalid request_type';
  END IF;
  IF br NOT IN ('hydrogenro', 'elevenro', 'both') THEN
    br := 'hydrogenro';
  END IF;
  IF coalesce(nullif(btrim(p_requester_phone), ''), nullif(btrim(p_requester_email), '')) IS NULL THEN
    RAISE EXCEPTION 'phone or email required';
  END IF;

  INSERT INTO public.privacy_requests (
    request_type, brand, requester_name, requester_phone, requester_email, details
  ) VALUES (
    typ, br,
    nullif(btrim(p_requester_name), ''),
    nullif(btrim(p_requester_phone), ''),
    nullif(btrim(p_requester_email), ''),
    nullif(btrim(p_details), '')
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_privacy_request(text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_privacy_request(text, text, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_privacy_request(text, text, text, text, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 3. Security / CERT-In style audit events (180-day retention)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_audit_events (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  actor_user_id uuid,
  actor_email text,
  actor_role text,
  target_type text,
  target_id text,
  action text NOT NULL,
  result text NOT NULL DEFAULT 'ok',
  ip text,
  user_agent text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_events_created
  ON public.security_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_events_type
  ON public.security_audit_events (event_type, created_at DESC);

ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_audit_events_admin_select ON public.security_audit_events;
CREATE POLICY security_audit_events_admin_select ON public.security_audit_events
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON public.security_audit_events FROM PUBLIC;
REVOKE ALL ON public.security_audit_events FROM anon;
GRANT SELECT ON public.security_audit_events TO authenticated;
GRANT ALL ON public.security_audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_security_audit_event(
  p_event_type text,
  p_action text,
  p_result text DEFAULT 'ok',
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_email text DEFAULT NULL,
  p_actor_role text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id bigint;
BEGIN
  INSERT INTO public.security_audit_events (
    event_type, action, result, actor_user_id, actor_email, actor_role,
    target_type, target_id, ip, user_agent, meta
  ) VALUES (
    left(btrim(coalesce(p_event_type, 'unknown')), 80),
    left(btrim(coalesce(p_action, 'unknown')), 120),
    left(btrim(coalesce(p_result, 'ok')), 40),
    p_actor_user_id,
    nullif(left(btrim(coalesce(p_actor_email, '')), 200), ''),
    nullif(left(btrim(coalesce(p_actor_role, '')), 40), ''),
    nullif(left(btrim(coalesce(p_target_type, '')), 60), ''),
    nullif(left(btrim(coalesce(p_target_id, '')), 120), ''),
    nullif(left(btrim(coalesce(p_ip, '')), 80), ''),
    nullif(left(btrim(coalesce(p_user_agent, '')), 300), ''),
    coalesce(p_meta, '{}'::jsonb)
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_security_audit_event(
  text, text, text, uuid, text, text, text, text, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_security_audit_event(
  text, text, text, uuid, text, text, text, text, text, text, jsonb
) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. Manager vs full admin helper (least privilege)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_full_admin_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  em text;
  r text;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = uid) THEN
    RETURN false;
  END IF;
  em := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  IF em = '' THEN
    RETURN false;
  END IF;
  SELECT upper(au.role) INTO r
  FROM public.admin_users au
  WHERE lower(au.email) = em AND au.is_active IS TRUE
  LIMIT 1;
  RETURN r IN ('ADMIN', 'SUPER_ADMIN');
END;
$$;

REVOKE ALL ON FUNCTION public.is_full_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_full_admin_user() TO authenticated, service_role;

-- WhatsApp inbox: full admins only (not MANAGER)
DROP POLICY IF EXISTS whatsapp_messages_admin_select ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_admin_select ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (public.is_full_admin_user());

DROP POLICY IF EXISTS whatsapp_messages_admin_delete ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_admin_delete ON public.whatsapp_messages
  FOR DELETE TO authenticated
  USING (public.is_full_admin_user());

-- ─────────────────────────────────────────────────────────────
-- 5. Fix open RLS (inventory / QR / booking_intent delete)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.website_booking_intent') IS NOT NULL THEN
    DROP POLICY IF EXISTS "website_booking_intent delete admin" ON public.website_booking_intent;
    CREATE POLICY website_booking_intent_delete_admin ON public.website_booking_intent
      FOR DELETE TO authenticated
      USING (public.is_admin_user());
  END IF;

  IF to_regclass('public.inventory') IS NOT NULL THEN
    DROP POLICY IF EXISTS inventory_select_auth ON public.inventory;
    CREATE POLICY inventory_select_auth ON public.inventory
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.inventory_bundles') IS NOT NULL THEN
    DROP POLICY IF EXISTS inventory_bundles_select_auth ON public.inventory_bundles;
    CREATE POLICY inventory_bundles_select_auth ON public.inventory_bundles
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.inventory_bundle_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS inventory_bundle_items_select_auth ON public.inventory_bundle_items;
    CREATE POLICY inventory_bundle_items_select_auth ON public.inventory_bundle_items
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.parts_inventory') IS NOT NULL THEN
    DROP POLICY IF EXISTS parts_inventory_select_auth ON public.parts_inventory;
    CREATE POLICY parts_inventory_select_auth ON public.parts_inventory
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.product_qr_codes') IS NOT NULL THEN
    DROP POLICY IF EXISTS product_qr_codes_select_auth ON public.product_qr_codes;
    CREATE POLICY product_qr_codes_select_auth ON public.product_qr_codes
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.common_qr_codes') IS NOT NULL THEN
    DROP POLICY IF EXISTS common_qr_codes_select_auth ON public.common_qr_codes;
    CREATE POLICY common_qr_codes_select_auth ON public.common_qr_codes
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.storage_places') IS NOT NULL THEN
    DROP POLICY IF EXISTS storage_places_select_auth ON public.storage_places;
    CREATE POLICY storage_places_select_auth ON public.storage_places
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.storage_blocks') IS NOT NULL THEN
    DROP POLICY IF EXISTS storage_blocks_select_auth ON public.storage_blocks;
    CREATE POLICY storage_blocks_select_auth ON public.storage_blocks
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.storage_block_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS storage_block_items_select_auth ON public.storage_block_items;
    CREATE POLICY storage_block_items_select_auth ON public.storage_block_items
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.technician_common_qr') IS NOT NULL THEN
    DROP POLICY IF EXISTS technician_common_qr_select ON public.technician_common_qr;
    CREATE POLICY technician_common_qr_select ON public.technician_common_qr
      FOR SELECT TO authenticated
      USING (public.is_admin_user() OR public.is_active_technician());
  END IF;

  IF to_regclass('public.booking_abandonments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow authenticated read booking abandonments" ON public.booking_abandonments;
    DROP POLICY IF EXISTS "Allow authenticated update booking abandonments" ON public.booking_abandonments;
    CREATE POLICY booking_abandonments_admin_select ON public.booking_abandonments
      FOR SELECT TO authenticated USING (public.is_admin_user());
    CREATE POLICY booking_abandonments_admin_update ON public.booking_abandonments
      FOR UPDATE TO authenticated
      USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. Extend purge: security_audit 180d + WhatsApp messages 36 months
--    (keeps tax/accounting docs; chats are not invoices)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_compliance_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_audit int := 0;
  n_wa int := 0;
BEGIN
  IF to_regclass('public.security_audit_events') IS NOT NULL THEN
    DELETE FROM public.security_audit_events
    WHERE created_at < now() - interval '180 days';
    GET DIAGNOSTICS n_audit = ROW_COUNT;
  END IF;

  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    DELETE FROM public.whatsapp_messages
    WHERE created_at < now() - interval '36 months';
    GET DIAGNOSTICS n_wa = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'security_audit_events_deleted', n_audit,
    'whatsapp_messages_deleted', n_wa,
    'audit_retention_days', 180,
    'whatsapp_retention_months', 36
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_compliance_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_compliance_retention() TO service_role;

COMMENT ON TABLE public.customer_consents IS 'DPDP consent evidence (purpose, notice version, timestamp)';
COMMENT ON TABLE public.privacy_requests IS 'DSAR / grievance queue (72h SLA target)';
COMMENT ON TABLE public.security_audit_events IS 'ICT security audit trail; retain 180 days (CERT-In)';
