/**
 * Admin-only AI inbox controls.
 * Global: prepare review-only drafts for newly opened inbound chats.
 * Per chat: explicitly opt a single phone into safe auto replies.
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { getServiceSupabase, normalizePhoneE164 } = require('./whatsapp-helper');
const { isMissingRelation } = require('./ai-audit');

function json(statusCode, headers, payload) {
  return {
    statusCode,
    headers: {
      ...headers,
      'Cache-Control': 'no-store, private',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}

async function loadSettings(db, phone) {
  const [globalResult, chatResult] = await Promise.all([
    db
      .from('whatsapp_crm_settings')
      .select('ai_review_all_chats')
      .eq('id', 1)
      .maybeSingle(),
    phone
      ? db
          .from('whatsapp_chat_ai_settings')
          .select('phone_e164, auto_reply_enabled, last_ai_reviewed_wa_message_id, updated_at')
          .eq('phone_e164', phone)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const error = globalResult.error || chatResult.error;
  if (error) throw error;
  return {
    reviewAllChats: globalResult.data?.ai_review_all_chats === true,
    autoReplyEnabled: chatResult.data?.auto_reply_enabled === true,
    lastReviewedWaMessageId: chatResult.data?.last_ai_reviewed_wa_message_id || null,
    updatedAt: chatResult.data?.updated_at || null,
  };
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const headers = getCorsHeaders(origin);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (shouldRejectMissingOrigin(event.headers || {}, { allowMissingWithBearer: true })) {
    return json(403, headers, { success: false, error: 'Forbidden' });
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, headers, { success: false, error: 'Method not allowed' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(auth.statusCode || 401, headers, {
      success: false,
      error: auth.error || 'Unauthorized',
    });
  }
  if (!auth.userId) {
    return json(403, headers, { success: false, error: 'Admin session required' });
  }
  const db = getServiceSupabase();
  if (!db) return json(503, headers, { success: false, error: 'Database unavailable' });

  let body = {};
  if (event.httpMethod === 'POST') {
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, headers, { success: false, error: 'Invalid JSON' });
    }
  }
  const rawPhone =
    event.httpMethod === 'GET'
      ? event.queryStringParameters?.phone
      : body.phone;
  const phone = rawPhone ? normalizePhoneE164(rawPhone) : null;

  try {
    if (event.httpMethod === 'POST') {
      const action = String(body.action || '');
      if (action === 'set_review_all') {
        const { error } = await db
          .from('whatsapp_crm_settings')
          .update({
            ai_review_all_chats: body.enabled === true,
            updated_at: new Date().toISOString(),
            updated_by: auth.userId || null,
          })
          .eq('id', 1);
        if (error) throw error;
      } else if (action === 'set_auto_reply') {
        if (!phone) {
          return json(400, headers, { success: false, error: 'Valid phone required' });
        }
        const { error } = await db.from('whatsapp_chat_ai_settings').upsert(
          {
            phone_e164: phone,
            auto_reply_enabled: body.enabled === true,
            updated_at: new Date().toISOString(),
            updated_by: auth.userId || null,
          },
          { onConflict: 'phone_e164' }
        );
        if (error) throw error;
      } else if (action === 'mark_reviewed') {
        const waMessageId = String(body.waMessageId || '').trim().slice(0, 200);
        if (!phone || !waMessageId) {
          return json(400, headers, {
            success: false,
            error: 'Valid phone and message required',
          });
        }
        const { error } = await db.from('whatsapp_chat_ai_settings').upsert(
          {
            phone_e164: phone,
            last_ai_reviewed_wa_message_id: waMessageId,
            updated_at: new Date().toISOString(),
            updated_by: auth.userId || null,
          },
          { onConflict: 'phone_e164' }
        );
        if (error) throw error;
      } else {
        return json(400, headers, { success: false, error: 'Unsupported action' });
      }
    }

    return json(200, headers, {
      success: true,
      settings: await loadSettings(db, phone),
    });
  } catch (error) {
    if (isMissingRelation(error)) {
      return json(503, headers, {
        success: false,
        setupRequired: true,
        error: 'Run scripts/add-whatsapp-ai-chat-settings.sql in Supabase first.',
      });
    }
    console.warn('[whatsapp-ai-chat-settings] failed', error?.message || error);
    return json(500, headers, { success: false, error: 'Could not update AI chat settings' });
  }
};

module.exports._test = { loadSettings };
