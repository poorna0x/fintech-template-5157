// One slim row for a customer call the phone already matched locally.
// Retries of the same call reuse call_key. A later "missed" updates that row.
// A missing table must not break the alert.

const BUCKET_MS = 3 * 60 * 1000;

function callBucket(ms) {
  const t = Number(ms);
  const at = Number.isFinite(t) && t > 1_000_000_000_000 ? t : Date.now();
  return { at, bucket: Math.floor(at / BUCKET_MS) };
}

function inboundKey(source, actorId, phone, ms) {
  const { bucket } = callBucket(ms);
  return `in:${source}:${actorId}:${phone}:${bucket}`;
}

function outboundKey(actorId, phone, ms) {
  const { bucket } = callBucket(ms);
  return `out:technician:${actorId}:${phone}:${bucket}`;
}

function cleanName(raw) {
  return String(raw || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function recordKnownCustomerCall(db, raw) {
  const phone = String(raw.phone || '').replace(/\D/g, '').slice(-10);
  const name = cleanName(raw.customerName);
  const actorId = String(raw.actorId || '').trim();
  const source = raw.source === 'admin' ? 'admin' : 'technician';
  const direction = raw.direction === 'out' ? 'out' : 'in';
  const outcome = raw.outcome === 'missed' ? 'missed' : 'answered';
  if (phone.length < 10 || !name || !actorId) return;

  const { at } = callBucket(raw.callAt);
  const callKey =
    raw.callKey ||
    (direction === 'out'
      ? outboundKey(actorId, phone, at)
      : inboundKey(source, actorId, phone, at));

  const row = {
    call_key: callKey,
    source,
    actor_id: actorId,
    phone,
    customer_name: name,
    direction,
    outcome,
    call_at: new Date(at).toISOString(),
  };

  const { error } = await db.from('known_customer_calls').insert(row);
  if (!error) return;
  const dup = String(error.code || '') === '23505' || /duplicate|unique/i.test(String(error.message || ''));
  if (!dup) {
    console.warn('[known-customer-call] insert skipped', error.message);
    return;
  }
  if (outcome !== 'missed') return;
  const { error: updErr } = await db
    .from('known_customer_calls')
    .update({ outcome: 'missed', customer_name: name })
    .eq('call_key', callKey);
  if (updErr) console.warn('[known-customer-call] missed update skipped', updErr.message);
}

module.exports = { recordKnownCustomerCall, inboundKey, outboundKey };
