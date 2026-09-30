const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const supabaseSrc = fs.readFileSync(path.join(__dirname, '../src/lib/supabase.ts'), 'utf8');
assert.match(supabaseSrc, /POSTGREST_MAX_ROWS/);
assert.match(supabaseSrc, /distinctRows\.length < POSTGREST_MAX_ROWS/);
assert.match(supabaseSrc, /fetchCompletedCustomerIdFlags/);
assert.match(supabaseSrc, /completed_customers_map_v2/);

const dash = fs.readFileSync(
  path.join(__dirname, '../src/components/AdminDashboard.tsx'),
  'utf8'
);
assert.match(dash, /fetchCompletedCustomerIdFlags/);
assert.match(dash, /queueSyncCustomerLastServiceDate\(customerUuid\)/);

assert.match(supabaseSrc, /queueSyncCustomerLastServiceDate/);

const trigger = fs.readFileSync(
  path.join(__dirname, '../scripts/add-customer-last-service-date-trigger.sql'),
  'utf8'
);
assert.match(trigger, /trg_sync_customer_last_service_date/);
assert.match(trigger, /sync_customer_last_service_date_from_jobs/);

console.log('prior-service-blue-tag.test.cjs ok');
