// Account lockout via Supabase RPC (auth_login_attempts table)

async function checkLoginAllowed(admin, email) {
  const { data, error } = await admin.rpc('check_auth_login_allowed', {
    p_email: email,
  });
  if (error) {
    console.error('[auth-lockout] check_auth_login_allowed:', error.message);
    // Fail open only if migration not applied — log loudly
    if (error.message?.includes('does not exist')) {
      return { allowed: true, migrationMissing: true };
    }
    return { allowed: true };
  }
  return data || { allowed: true };
}

async function recordLoginFailure(admin, email) {
  const { data, error } = await admin.rpc('record_auth_login_failure', {
    p_email: email,
  });
  if (error) {
    console.error('[auth-lockout] record_auth_login_failure:', error.message);
    return null;
  }
  return data;
}

async function recordLoginSuccess(admin, email) {
  const { error } = await admin.rpc('record_auth_login_success', {
    p_email: email,
  });
  if (error) {
    console.error('[auth-lockout] record_auth_login_success:', error.message);
  }
}

module.exports = {
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
};
