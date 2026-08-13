#!/usr/bin/env node
/**
 * Regression checks for WhatsApp booking-bot multi-step state + phone flows.
 * Run: node scripts/test-whatsapp-booking-bot-flows.cjs
 */
const assert = require('assert');
const {
  parseStrictIndianMobile,
  upsertBookingBotRow,
  ACTIVE_BOOKING_STEPS,
  OTHER_PHONE_LOOKUP_MAX,
} = require('../netlify/functions/whatsapp-booking-bot.js');

function createMockDb(initial = {}) {
  /** @type {Map<string, { phone_e164: string, state: any, remembered_location: any, awaiting_media: boolean, updated_at: string }>} */
  const rows = new Map(Object.entries(initial));
  let insertAttempts = 0;
  let updateAttempts = 0;

  function from(table) {
    if (table !== 'whatsapp_booking_bot_state') {
      throw new Error(`unexpected table ${table}`);
    }
    const ctx = { filters: {}, payload: null, op: null };
    const api = {
      select() {
        ctx.op = 'select';
        return api;
      },
      insert(payload) {
        ctx.op = 'insert';
        ctx.payload = payload;
        return api;
      },
      update(payload) {
        ctx.op = 'update';
        ctx.payload = payload;
        return api;
      },
      eq(col, val) {
        ctx.filters[col] = val;
        return api;
      },
      async maybeSingle() {
        if (ctx.op === 'select') {
          const phone = ctx.filters.phone_e164;
          const row = rows.get(phone) || null;
          return { data: row, error: null };
        }
        return { data: null, error: null };
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(async () => {
            const phone = ctx.filters.phone_e164 || ctx.payload?.phone_e164;
            if (ctx.op === 'insert') {
              insertAttempts += 1;
              if (rows.has(phone)) {
                return {
                  data: null,
                  error: { message: 'duplicate key value violates unique constraint', code: '23505' },
                };
              }
              rows.set(phone, {
                phone_e164: phone,
                state: ctx.payload.state || {},
                remembered_location: ctx.payload.remembered_location ?? null,
                awaiting_media: ctx.payload.awaiting_media ?? false,
                updated_at: ctx.payload.updated_at || new Date().toISOString(),
              });
              return { data: rows.get(phone), error: null };
            }
            if (ctx.op === 'update') {
              updateAttempts += 1;
              const cur = rows.get(phone);
              if (!cur) {
                return { data: null, error: { message: 'no rows' } };
              }
              rows.set(phone, {
                ...cur,
                ...ctx.payload,
                phone_e164: phone,
              });
              return { data: rows.get(phone), error: null };
            }
            return { data: null, error: null };
          })
          .then(resolve, reject);
      },
    };
    // Make insert/update thenable when chained without maybeSingle
    api.insert = (payload) => {
      ctx.op = 'insert';
      ctx.payload = payload;
      return api;
    };
    return api;
  }

  return {
    from,
    _rows: rows,
    _stats: () => ({ insertAttempts, updateAttempts }),
  };
}

async function testParseMobile() {
  assert.strictEqual(parseStrictIndianMobile('6361631253'), '6361631253');
  assert.strictEqual(parseStrictIndianMobile('+91 63616 31253'), '6361631253');
  assert.strictEqual(parseStrictIndianMobile('916361631253'), '6361631253');
  assert.strictEqual(parseStrictIndianMobile('06361631253'), '6361631253');
  assert.strictEqual(parseStrictIndianMobile('5361631253'), null); // must start 6-9
  assert.strictEqual(parseStrictIndianMobile('hi'), null);
  assert.strictEqual(parseStrictIndianMobile('service issue'), null);
  console.log('ok parseStrictIndianMobile');
}

async function testUpsertAdvancesSteps() {
  const db = createMockDb();
  const phone = '919999000001';

  // First write (identity gate) → insert
  let r = await upsertBookingBotRow(db, phone, { state: { step: 'await_identity_gate' } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(db._rows.get(phone).state.step, 'await_identity_gate');

  // Second write (Different number) must UPDATE, not silent-fail insert
  r = await upsertBookingBotRow(db, phone, { state: { step: 'await_other_phone', otherPhoneAttempts: 0 } });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(db._rows.get(phone).state.step, 'await_other_phone');

  r = await upsertBookingBotRow(db, phone, {
    state: { step: 'await_linked_identity_confirm', pendingLinkCustomerId: 'c1' },
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(db._rows.get(phone).state.step, 'await_linked_identity_confirm');

  // Location remember patch without wiping state when only remembered_location set
  r = await upsertBookingBotRow(db, phone, {
    remembered_location: { lat: 12.9, lng: 77.6 },
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(db._rows.get(phone).state.step, 'await_linked_identity_confirm');
  assert.strictEqual(db._rows.get(phone).remembered_location.lat, 12.9);

  const stats = db._stats();
  assert.ok(stats.updateAttempts >= 2, 'expected updates after first insert');
  console.log('ok upsertBookingBotRow advances steps', stats);
}

async function testLegacyBugWouldFail() {
  // Document the old bug: checking existing?.phone_e164 when select omits it
  const existing = { state: { step: 'await_identity_gate' }, remembered_location: null, awaiting_media: false };
  assert.strictEqual(Boolean(existing?.phone_e164), false, 'legacy select shape');
  // Fixed code keys off !existing instead
  assert.strictEqual(Boolean(existing), true);
  console.log('ok legacy phone_e164 select bug documented');
}

async function testActiveStepsCoverTypedFlows() {
  const required = [
    'await_identity_gate',
    'await_other_phone',
    'await_linked_identity_confirm',
    'await_first_time_menu',
    'await_name',
    'await_alt_phone',
    'await_location',
    'await_loc_confirm',
    'await_building_flat',
    'await_date',
    'await_period',
    'await_issue_text',
    'await_issue_media',
    'await_custom_note',
    'await_confirm',
  ];
  for (const step of required) {
    assert.ok(ACTIVE_BOOKING_STEPS.has(step), `missing ACTIVE step: ${step}`);
  }
  assert.ok(OTHER_PHONE_LOOKUP_MAX >= 1);
  console.log('ok ACTIVE_BOOKING_STEPS covers typed flows');
}

async function main() {
  await testParseMobile();
  await testUpsertAdvancesSteps();
  await testLegacyBugWouldFail();
  await testActiveStepsCoverTypedFlows();
  console.log('\nAll booking-bot flow regressions passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).then(() => {
  process.exit(0);
});
