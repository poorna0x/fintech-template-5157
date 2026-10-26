const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const supabaseSrc = fs.readFileSync(path.join(__dirname, '../src/lib/supabase.ts'), 'utf8');
assert.match(supabaseSrc, /completed_customers_map_v3/);
assert.match(supabaseSrc, /const PAGE = 1000/);
assert.match(supabaseSrc, /data\.length < PAGE/);
assert.match(supabaseSrc, /get_last_service_brands_for_customers/);
assert.match(supabaseSrc, /fetchCompletedCustomerIdFlags/);
assert.doesNotMatch(supabaseSrc, /jobPageSize = 2500/);

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

const brandRpc = fs.readFileSync(
  path.join(__dirname, '../scripts/add-last-service-brand-for-assigned.sql'),
  'utf8'
);
assert.match(brandRpc, /get_last_service_brands_for_customers/);
assert.match(brandRpc, /is_technician_assigned_to_customer/);

console.log('prior-service-blue-tag.test.cjs ok');
