// Account lockout: Supabase RPC with in-memory fallback (escalating: 15 → 30 → 60 min).

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES_BY_TIER = [15, 30, 60];
const memoryStore = new Map();

function lockMinutesForTier(lockoutCount) {
  const tier = Math.min(Math.max(lockoutCount, 0), LOCK_MINUTES_BY_TIER.length - 1);
  return LOCK_MINUTES_BY_TIER[tier];
}

function memoryRow(email) {
  return memoryStore.get(email) || null;
}

function memoryCheck(email) {
  const row = memoryRow(email);
  if (!row) {
    return { allowed: true, failed_count: 0, lockout_count: 0, source: 'memory' };
  }

  const now = Date.now();
  if (row.lockedUntil && now < row.lockedUntil) {
    return {
      allowed: false,
      reason: 'locked',
      failed_count: row.count,
      lockout_count: row.lockoutCount,
      locked_until: new Date(row.lockedUntil).toISOString(),
      retry_after_seconds: Math.ceil((row.lockedUntil - now) / 1000),
      source: 'memory',
    };
  }

  if (row.lockedUntil && now >= row.lockedUntil) {
    row.count = 0;
    row.lockedUntil = null;
    memoryStore.set(email, row);
  }

  return {
    allowed: true,
    failed_count: row.count,
    lockout_count: row.lockoutCount,
    source: 'memory',
  };
}

function memoryRecordFailure(email) {
  const now = Date.now();
  let row = memoryRow(email);
  if (!row) {
    row = { count: 0, lockedUntil: null, lockoutCount: 0 };
  }

  if (row.lockedUntil && now >= row.lockedUntil) {
    row.count = 0;
    row.lockedUntil = null;
  }

  row.count += 1;
  row.lastAttempt = now;

  if (row.count >= MAX_ATTEMPTS) {
    const lockMinutes = lockMinutesForTier(row.lockoutCount);
    row.lockedUntil = now + lockMinutes * 60 * 1000;
    row.lockoutCount += 1;
    memoryStore.set(email, row);
    return {
      ok: true,
      failed_count: row.count,
      locked: true,
      locked_until: new Date(row.lockedUntil).toISOString(),
      lockout_count: row.lockoutCount,
      lock_minutes: lockMinutes,
      retry_after_seconds: lockMinutes * 60,
      remaining_attempts: 0,
      source: 'memory',
    };
  }

  memoryStore.set(email, row);
  return {
    ok: true,
    failed_count: row.count,
    locked: false,
    lockout_count: row.lockoutCount,
    remaining_attempts: Math.max(0, MAX_ATTEMPTS - row.count),
    source: 'memory',
  };
}

function memoryRecordSuccess(email) {
  memoryStore.delete(email);
}

async function checkLoginAllowed(admin, email) {
  const normalized = email.toLowerCase().trim();

  const { data, error } = await admin.rpc('check_auth_login_allowed', {
    p_email: normalized,
  });

  if (!error && data) {
    return data;
  }

  if (error) {
    console.warn('[auth-lockout] check_auth_login_allowed RPC:', error.message);
  }

  return memoryCheck(normalized);
}

async function recordLoginFailure(admin, email) {
  const normalized = email.toLowerCase().trim();

  const { data, error } = await admin.rpc('record_auth_login_failure', {
    p_email: normalized,
  });

  if (!error && data) {
    return data;
  }

  if (error) {
    console.warn('[auth-lockout] record_auth_login_failure RPC:', error.message);
  }

  return memoryRecordFailure(normalized);
}

async function recordLoginSuccess(admin, email) {
  const normalized = email.toLowerCase().trim();

  const { error } = await admin.rpc('record_auth_login_success', {
    p_email: normalized,
  });
  if (error) {
    console.warn('[auth-lockout] record_auth_login_success RPC:', error.message);
  }

  memoryRecordSuccess(normalized);
}

module.exports = {
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  lockMinutesForTier,
};
