/**
 * Shared WhatsApp Cloud webhook payload shape (Meta `messages` field).
 * Used by the Edge gate (no serverless) and Node tests.
 */
function hasInboundWhatsAppMessages(payload) {
  const entries = payload && payload.entry;
  if (!Array.isArray(entries)) return false;
  for (const entry of entries) {
    const changes = (entry && entry.changes) || [];
    for (const change of changes) {
      if (change.field && change.field !== 'messages') continue;
      const msgs = change.value && change.value.messages;
      if (Array.isArray(msgs) && msgs.length > 0) return true;
    }
  }
  return false;
}

function collectWhatsAppStatuses(payload) {
  const out = [];
  const entries = payload && payload.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry && entry.changes) || [];
    for (const change of changes) {
      if (change.field && change.field !== 'messages') continue;
      const statuses = change.value && change.value.statuses;
      if (!Array.isArray(statuses)) continue;
      for (const st of statuses) {
        if (!st || !st.id) continue;
        const errors = st.errors || [];
        out.push({
          id: String(st.id),
          status: String(st.status || '').toLowerCase(),
          error: errors[0] && (errors[0].title || errors[0].message)
            ? String(errors[0].title || errors[0].message)
            : null,
        });
      }
    }
  }
  return out;
}

/** Status ticks only — safe to ACK at Edge. Anything else must hit Node. */
function shouldAckStatusOnlyAtEdge(payload) {
  if (hasInboundWhatsAppMessages(payload)) return false;
  return collectWhatsAppStatuses(payload).length > 0;
}

module.exports = {
  hasInboundWhatsAppMessages,
  collectWhatsAppStatuses,
  shouldAckStatusOnlyAtEdge,
};
