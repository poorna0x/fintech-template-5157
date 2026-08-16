/**
 * AI assistant audit + quota helpers (service-role only).
 * Soft-fails when SQL/tables are not installed yet so local mock still works.
 */

const crypto = require('crypto');
const { getServiceSupabase } = require('./whatsapp-helper');

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function localDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isMissingRelation(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === 'PGRST202' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  );
}

async function claimAiQuota(opts) {
  const db = getServiceSupabase();
  if (!db) return { ok: true, skipped: true, invocationId: null };

  const actorUserId = opts.actorUserId;
  const dayKey = opts.dayKey || localDayKey();
  const requestLimit = opts.requestLimit || 80;
  const tokenLimit = opts.tokenLimit || 200000;
  const reserveTokens = Math.max(1, Math.min(4000, Number(opts.reserveTokens) || 800));
  const idempotencyKey = String(opts.idempotencyKey || '').slice(0, 120) || null;

  try {
    const { data, error } = await db.rpc('claim_ai_assistant_quota', {
      p_actor_user_id: actorUserId,
      p_day_key: dayKey,
      p_request_limit: requestLimit,
      p_token_limit: tokenLimit,
      p_reserve_tokens: reserveTokens,
      p_idempotency_key: idempotencyKey,
      p_provider: opts.provider || null,
      p_model: opts.model || null,
      p_operation: opts.operation || null,
    });
    if (error) {
      if (isMissingRelation(error)) return { ok: true, skipped: true, invocationId: null };
      return { ok: false, error: error.message || 'Quota check failed' };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      return {
        ok: false,
        error: row.reason || 'Daily AI quota exceeded',
        quotaExceeded: true,
      };
    }
    return {
      ok: true,
      skipped: false,
      invocationId: row?.invocation_id || null,
      reservedTokens: reserveTokens,
    };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: true, skipped: true, invocationId: null };
    return { ok: false, error: err.message || 'Quota check failed' };
  }
}

async function finalizeAiInvocation(opts) {
  const db = getServiceSupabase();
  if (!db || !opts.invocationId) return { ok: true, skipped: true };

  try {
    const { error } = await db.rpc('finalize_ai_assistant_invocation', {
      p_invocation_id: opts.invocationId,
      p_status: opts.status || 'ok',
      p_input_tokens: Math.max(0, Number(opts.inputTokens) || 0),
      p_output_tokens: Math.max(0, Number(opts.outputTokens) || 0),
      p_latency_ms: Math.max(0, Number(opts.latencyMs) || 0),
      p_prompt_hash: opts.promptHash || null,
      p_response_hash: opts.responseHash || null,
      p_error_category: opts.errorCategory || null,
      p_reserved_tokens: Math.max(0, Number(opts.reservedTokens) || 0),
      p_day_key: opts.dayKey || localDayKey(),
      p_actor_user_id: opts.actorUserId || null,
    });
    if (error) {
      if (isMissingRelation(error)) return { ok: true, skipped: true };
      console.warn('[ai-audit] finalize failed', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, skipped: false };
  } catch (err) {
    if (isMissingRelation(err)) return { ok: true, skipped: true };
    console.warn('[ai-audit] finalize exception', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  sha256,
  localDayKey,
  claimAiQuota,
  finalizeAiInvocation,
  isMissingRelation,
};
