/**
 * WhatsApp I Accept → send original PDF (interactive button or cold-template quick reply).
 */
const {
  normalizePhoneE164,
  callWhatsAppApi,
  insertWhatsAppMessage,
} = require('./whatsapp-helper');
const {
  claimInviteAndSendOriginal,
  markExpiredIfNeeded,
  ACCEPT_QUICK_REPLY,
} = require('./document-accept-helper');

const PREFIX = 'doc_accept:';

function normalizeAcceptLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isAcceptQuickReply(reply) {
  if (!reply) return false;
  if (reply.id?.startsWith(PREFIX)) return true;
  const accept = normalizeAcceptLabel(ACCEPT_QUICK_REPLY);
  return (
    normalizeAcceptLabel(reply.title) === accept || normalizeAcceptLabel(reply.id) === accept
  );
}

function extractInteractiveReply(msg) {
  if (String(msg?.type) === 'interactive') {
    const reply = msg.interactive?.button_reply || msg.interactive?.list_reply;
    if (reply) {
      return {
        id: String(reply.id || '').trim(),
        title: String(reply.title || reply.id || '').trim(),
      };
    }
  }
  if (String(msg?.type) === 'button') {
    return {
      id: String(msg.button?.payload || msg.button?.text || '').trim(),
      title: String(msg.button?.text || msg.button?.payload || '').trim(),
    };
  }
  return null;
}

async function findPendingInviteForPhone(db, phone) {
  const { data, error } = await db
    .from('document_accept_invites')
    .select('*')
    .eq('phone_e164', phone)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function handleDocumentAcceptInbound(ctx) {
  const { db, accessToken, phoneNumberId, msg } = ctx;
  if (!db || !accessToken || !phoneNumberId || !msg) return { handled: false };

  const reply = extractInteractiveReply(msg);
  if (!isAcceptQuickReply(reply)) return { handled: false };

  const phone = normalizePhoneE164(msg.from);
  if (!phone) return { handled: false };

  let row = null;
  let error = null;

  const inviteId = reply.id?.startsWith(PREFIX) ? reply.id.slice(PREFIX.length).trim() : '';
  if (inviteId && inviteId.length >= 8) {
    ({ data: row, error } = await db
      .from('document_accept_invites')
      .select('*')
      .eq('id', inviteId)
      .maybeSingle());
  } else {
    row = await findPendingInviteForPhone(db, phone);
    if (!row) error = { message: 'not found' };
  }

  if (error || !row) {
    await sendTextReply(phoneNumberId, accessToken, db, phone, 'Invalid Accept. Ask us to resend the document.');
    return { handled: true };
  }

  row = await markExpiredIfNeeded(db, row);

  if (row.phone_e164 !== phone) {
    await sendTextReply(
      phoneNumberId,
      accessToken,
      db,
      phone,
      'Use the WhatsApp chat where you received the preview PDF.'
    );
    return { handled: true };
  }

  const result = await claimInviteAndSendOriginal(db, row);

  if (result.alreadyAccepted) {
    await sendTextReply(phoneNumberId, accessToken, db, phone, 'Already sent — check above for your original PDF.');
    return { handled: true };
  }

  if (!result.ok) {
    await sendTextReply(
      phoneNumberId,
      accessToken,
      db,
      phone,
      result.error || 'Could not send the original PDF. Please contact us.'
    );
    return { handled: true, error: result.error };
  }

  return { handled: true };
}

async function sendTextReply(phoneNumberId, accessToken, db, phone, text) {
  const body = String(text || '').trim().slice(0, 4096);
  if (!body) return;
  const sent = await callWhatsAppApi(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { body },
  });
  const waId = sent.data?.messages?.[0]?.id || null;
  if (waId) {
    await insertWhatsAppMessage(db, {
      wa_message_id: waId,
      direction: 'outbound',
      phone_e164: phone,
      msg_type: 'text',
      body,
      status: sent.ok ? 'sent' : 'failed',
    });
  }
}

module.exports = { handleDocumentAcceptInbound };
