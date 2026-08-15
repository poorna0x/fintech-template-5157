/**
 * Fail if SQL scripts redefine is_admin_user() as "anyone who is not a technician".
 * Run: node tests/sql-is-admin-user-strict.test.cjs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scriptsDir = path.join(__dirname, '..', 'scripts');
const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.sql'));

const WEAK = /IS DISTINCT FROM\s+'technician'/i;
const ADMIN_USERS = /admin_users/;

const offenders = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
  const re =
    /CREATE OR REPLACE FUNCTION public\.is_admin_user\(\)[\s\S]*?\$\$;/gi;
  let m;
  while ((m = re.exec(text))) {
    const body = m[0];
    const weak = WEAK.test(body) && !ADMIN_USERS.test(body);
    if (weak) offenders.push(`${file}: default-to-admin is_admin_user()`);
    if (!ADMIN_USERS.test(body)) {
      offenders.push(`${file}: is_admin_user() missing admin_users check`);
    }
  }
}

assert.deepStrictEqual(offenders, [], offenders.join('\n'));

const grantOffenders = [];
for (const file of ['add-job-reviews.sql']) {
  const text = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
  if (/GRANT EXECUTE ON FUNCTION public\.get_job_review_invite\(text\) TO anon/i.test(text)) {
    grantOffenders.push('get_job_review_invite granted to anon');
  }
  if (/GRANT EXECUTE ON FUNCTION public\.submit_job_review\(text, integer, text\) TO anon/i.test(text)) {
    grantOffenders.push('submit_job_review granted to anon');
  }
}
assert.deepStrictEqual(grantOffenders, [], grantOffenders.join('\n'));

const bookingGrantOffenders = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
  if (
    /GRANT EXECUTE ON FUNCTION public\.create_job_for_booking\(text, jsonb\) TO anon/i.test(
      text
    )
  ) {
    bookingGrantOffenders.push(`${file}: create_job_for_booking TO anon`);
  }
}
assert.deepStrictEqual(bookingGrantOffenders, [], bookingGrantOffenders.join('\n'));

const hardening = fs.readFileSync(path.join(scriptsDir, 'security-hardening-2026-08-15.sql'), 'utf8');
assert.ok(
  hardening.includes('Refusing to patch is_admin_user()'),
  'hardening SQL must abort if it would lock every admin out'
);
assert.ok(
  hardening.includes('no auth.users email matches'),
  'hardening SQL must require at least one admin_users ↔ auth.users match'
);

assert.ok(
  hardening.includes('jobs_protect_ownership'),
  'hardening SQL must freeze customer_id/job_number on technician job updates'
);
assert.ok(
  !fs.readFileSync(path.join(scriptsDir, 'add-booking-abandonments.sql'), 'utf8').includes(
    'FOR SELECT\n  TO authenticated\n  USING (true)'
  ),
  'booking_abandonments must not use USING (true) for authenticated SELECT'
);

console.log('sql-is-admin-user-strict.test.cjs: all checks passed');
