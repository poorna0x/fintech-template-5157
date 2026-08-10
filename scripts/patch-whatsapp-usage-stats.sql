-- Fix cold_utility count: include DOCUMENT-header template PDFs (msg_type=document + template_name set).
CREATE OR REPLACE FUNCTION public.whatsapp_usage_stats(p_from timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_from, now() - interval '7 days');
  v_outbound int := 0;
  v_inbound int := 0;
  v_templates int := 0;
  v_documents int := 0;
  v_text int := 0;
  v_failed int := 0;
  v_delivered int := 0;
  v_cold_utility int := 0;
  v_session int := 0;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE direction = 'outbound'),
    COUNT(*) FILTER (WHERE direction = 'inbound'),
    COUNT(*) FILTER (WHERE direction = 'outbound' AND msg_type = 'template'),
    COUNT(*) FILTER (WHERE direction = 'outbound' AND msg_type IN ('document', 'pdf')),
    COUNT(*) FILTER (WHERE direction = 'outbound' AND msg_type = 'text'),
    COUNT(*) FILTER (WHERE direction = 'outbound' AND lower(COALESCE(status, '')) IN ('failed', 'undelivered')),
    COUNT(*) FILTER (
      WHERE direction = 'outbound'
        AND lower(COALESCE(status, '')) IN ('sent', 'delivered', 'read')
    ),
    COUNT(*) FILTER (
      WHERE direction = 'outbound'
        AND template_name IS NOT NULL
        AND trim(template_name) <> ''
        AND lower(COALESCE(status, '')) NOT IN ('failed', 'undelivered')
    ),
    COUNT(*) FILTER (
      WHERE direction = 'outbound'
        AND (template_name IS NULL OR trim(template_name) = '')
        AND msg_type IN ('text', 'document', 'pdf', 'image', 'interactive', 'contacts')
        AND lower(COALESCE(status, '')) NOT IN ('failed', 'undelivered')
    )
  INTO v_outbound, v_inbound, v_templates, v_documents, v_text, v_failed, v_delivered, v_cold_utility, v_session
  FROM public.whatsapp_messages
  WHERE created_at >= v_from;

  RETURN jsonb_build_object(
    'from', v_from,
    'to', now(),
    'outbound', v_outbound,
    'inbound', v_inbound,
    'templates', v_templates,
    'documents', v_documents,
    'text', v_text,
    'failed', v_failed,
    'delivered_or_sent', v_delivered,
    'cold_utility', v_cold_utility,
    'session_messages', v_session
  );
END;
$$;
