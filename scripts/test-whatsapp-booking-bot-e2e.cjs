#!/usr/bin/env node
/**
 * Walk each WhatsApp booking-bot flow with a mocked WhatsApp API + in-memory DB.
 * Run: node scripts/test-whatsapp-booking-bot-e2e.cjs
 */
const assert = require('assert');
const path = require('path');
const Module = require('module');

const ORIG_LOAD = Module._load;
const outbox = [];
let waSeq = 0;

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}
function normalizePhoneE164(value) {
  let digits = digitsOnly(value);
  if (!digits) return '';
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function summarizePayload(payload) {
  if (!payload) return { kind: 'empty' };
  if (payload.type === 'text') {
    return { kind: 'text', body: String(payload.text?.body || '') };
  }
  if (payload.type === 'interactive') {
    const i = payload.interactive || {};
    if (i.type === 'button') {
      return {
        kind: 'buttons',
        body: String(i.body?.text || ''),
        buttons: (i.action?.buttons || []).map((b) => b.reply?.id),
        titles: (i.action?.buttons || []).map((b) => b.reply?.title),
      };
    }
    if (i.type === 'list') {
      const rows = i.action?.sections?.[0]?.rows || [];
      return {
        kind: 'list',
        body: String(i.body?.text || ''),
        rows: rows.map((r) => r.id),
        titles: rows.map((r) => r.title),
      };
    }
    if (i.type === 'location_request_message') {
      return { kind: 'location_request', body: String(i.body?.text || '') };
    }
    if (i.type === 'cta_url') {
      return { kind: 'cta', body: String(i.body?.text || ''), url: i.action?.parameters?.url || i.action?.url };
    }
  }
  return { kind: payload.type || 'other', body: JSON.stringify(payload).slice(0, 180) };
}

function createStore() {
  return {
    whatsapp_crm_settings: [{ id: 1, enabled: true, allow_booking_bot: true }],
    whatsapp_booking_bot_state: [],
    whatsapp_messages: [],
    customers: [],
    jobs: [],
    amc_contracts: [],
  };
}

function matchLike(val, pattern) {
  const s = String(val || '');
  const re = new RegExp(
    `^${String(pattern || '')
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*')
      .replace(/_/g, '.')}$`,
    'i'
  );
  return re.test(s);
}

function applyFilters(rows, filters, orExpr) {
  let out = rows.slice();
  for (const f of filters) {
    out = out.filter((row) => {
      const v = row[f.k];
      if (f.op === 'eq') return String(v) === String(f.v);
      if (f.op === 'gte') return String(v || '') >= String(f.v || '');
      if (f.op === 'like') return matchLike(v, f.v);
      return true;
    });
  }
  if (orExpr) {
    // phone.like.%NNNN,alternate_phone.like.%NNNN
    const parts = String(orExpr).split(',').map((p) => p.trim());
    out = out.filter((row) =>
      parts.some((p) => {
        const [col, rest] = p.split('.like.');
        if (!col || rest == null) return false;
        return matchLike(row[col.trim()], rest);
      })
    );
  }
  return out;
}

function createMockDb(store) {
  let idSeq = 1;
  function from(table) {
    const ctx = {
      table,
      op: 'select',
      payload: null,
      filters: [],
      orExpr: null,
      limitN: null,
      selectCols: '*',
    };
    const api = {
      select(cols) {
        ctx.selectCols = cols || '*';
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
      eq(k, v) {
        ctx.filters.push({ k, v, op: 'eq' });
        return api;
      },
      gte(k, v) {
        ctx.filters.push({ k, v, op: 'gte' });
        return api;
      },
      like(k, v) {
        ctx.filters.push({ k, v, op: 'like' });
        return api;
      },
      or(expr) {
        ctx.orExpr = expr;
        return api;
      },
      order() {
        return api;
      },
      limit(n) {
        ctx.limitN = n;
        return api;
      },
      async maybeSingle() {
        const { data, error } = await run();
        if (error) return { data: null, error };
        const row = Array.isArray(data) ? data[0] || null : data;
        return { data: row, error: null };
      },
      then(resolve, reject) {
        return run().then(resolve, reject);
      },
    };

    async function run() {
      const rows = store[ctx.table] || [];
      if (ctx.op === 'insert') {
        const payload = ctx.payload;
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted = list.map((p) => {
          const row = { id: p.id || `id_${idSeq++}`, created_at: new Date().toISOString(), ...p };
          rows.push(row);
          return row;
        });
        return { data: inserted.length === 1 ? inserted[0] : inserted, error: null };
      }
      if (ctx.op === 'update') {
        const matched = applyFilters(rows, ctx.filters, ctx.orExpr);
        for (const row of matched) Object.assign(row, ctx.payload);
        return { data: matched[0] || null, error: null };
      }
      let found = applyFilters(rows, ctx.filters, ctx.orExpr);
      if (ctx.limitN != null) found = found.slice(0, ctx.limitN);
      return { data: found, error: null };
    }

    return api;
  }

  async function rpc(name, args) {
    if (name === 'get_customer_by_phone_for_booking') {
      const phone = digitsOnly(args.p_phone).slice(-10);
      const found = store.customers.find(
        (c) => digitsOnly(c.phone).slice(-10) === phone || digitsOnly(c.alternate_phone).slice(-10) === phone
      );
      return { data: found || null, error: null };
    }
    if (name === 'create_customer_for_booking') {
      const row = { id: `cust_${idSeq++}`, ...args.p_row };
      store.customers.push(row);
      return { data: row, error: null };
    }
    if (name === 'create_job_for_booking') {
      const row = { id: `job_${idSeq++}`, status: 'PENDING', ...args.p_row };
      store.jobs.push(row);
      return { data: row, error: null };
    }
    if (name === 'update_customer_location_for_booking') {
      const c = store.customers.find((x) => x.id === args.p_customer_id);
      if (c && args.p_updates) Object.assign(c, args.p_updates);
      return { data: c || null, error: null };
    }
    return { data: null, error: { message: `unknown rpc ${name}` } };
  }

  return {
    from,
    rpc,
    _store: store,
  };
}

const helperMock = {
  callWhatsAppApi: async (_id, _token, payload) => {
    outbox.push(summarizePayload(payload));
    waSeq += 1;
    return { ok: true, data: { messages: [{ id: `wamid.${waSeq}` }] } };
  },
  insertWhatsAppMessage: async (db, row) => {
    if (!db) return null;
    const { data } = await db.from('whatsapp_messages').insert({
      ...row,
      phone_e164: normalizePhoneE164(row.phone_e164 || row.phone),
    });
    return data;
  },
  normalizePhoneE164,
  ensurePublicCrmPhotoUrl: async (url) => url || '',
};

Module._load = function (request, parent, isMain) {
  const base = String(request || '').replace(/\\/g, '/');
  if (base.endsWith('whatsapp-helper') || base.endsWith('whatsapp-helper.js')) {
    return helperMock;
  }
  if (base.endsWith('whatsapp-location-enrich') || base.endsWith('whatsapp-location-enrich.js')) {
    return {
      enrichWhatsAppLocation: async (loc) => ({
        lat: loc.latitude ?? loc.lat ?? null,
        lng: loc.longitude ?? loc.lng ?? null,
        name: loc.name || 'Pin',
        address: loc.address || 'Test address',
        shortLocation: loc.address || loc.name || 'Test area',
        formattedAddress: loc.address || 'Test address, Bengaluru',
      }),
    };
  }
  if (base.endsWith('booking-notify') || base.endsWith('booking-notify.js')) {
    return {
      sendBookingAdminNotification: async () => {},
      pushBookingToAdmins: async () => {},
    };
  }
  return ORIG_LOAD.apply(this, arguments);
};

const bot = require('../netlify/functions/whatsapp-booking-bot.js');

const CTX = { accessToken: 't', phoneNumberId: '1' };

function textMsg(from, body) {
  return { from, type: 'text', text: { body } };
}
function btn(from, id, title) {
  return {
    from,
    type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id, title: title || id } },
  };
}
function list(from, id, title) {
  return {
    from,
    type: 'interactive',
    interactive: { type: 'list_reply', list_reply: { id, title: title || id } },
  };
}
function locMsg(from, latitude, longitude, extra = {}) {
  return {
    from,
    type: 'location',
    location: { latitude, longitude, name: extra.name || 'Pin', address: extra.address || '' },
  };
}

function stepOf(db, phone) {
  const p = normalizePhoneE164(phone);
  const row = db._store.whatsapp_booking_bot_state.find((r) => r.phone_e164 === p);
  return row?.state?.step || 'idle';
}

async function inbound(db, msg) {
  const before = outbox.length;
  const result = await bot.handleBookingBotInbound({
    db,
    ...CTX,
    msg,
  });
  return {
    result,
    sent: outbox.slice(before),
    step: stepOf(db, msg.from),
  };
}

function seedExisting(store, { phone, name, amc, lastServiceDaysAgo, id }) {
  const cust = {
    id: id || 'cust_existing',
    full_name: name || 'Poorna Shetty',
    phone: digitsOnly(phone).slice(-10),
    alternate_phone: null,
    address: { street: 'Mico Layout' },
    location: { latitude: 12.89, longitude: 77.63 },
    visible_address: 'Garvebhavi Palya',
    brand: 'Not specified',
    model: 'Not specified',
    service_type: 'RO',
    last_service_date: null,
    photos: [],
  };
  store.customers.push(cust);
  if (amc) {
    store.amc_contracts.push({
      id: 'amc1',
      customer_id: cust.id,
      status: 'ACTIVE',
      end_date: '2027-01-01',
    });
  }
  if (lastServiceDaysAgo != null) {
    const d = new Date();
    d.setDate(d.getDate() - lastServiceDaysAgo);
    store.jobs.push({
      id: 'job_old',
      customer_id: cust.id,
      status: 'COMPLETED',
      completed_at: d.toISOString(),
      end_time: d.toISOString(),
    });
  }
  return cust;
}

function bodies(sent) {
  return sent.map((s) => `${s.kind}:${(s.body || '').replace(/\n/g, ' | ').slice(0, 140)}`);
}

async function flow(name, fn) {
  outbox.length = 0;
  process.stdout.write(`\n▸ ${name}\n`);
  await fn();
  console.log(`  ok ${name}`);
}

async function main() {
  const findings = [];

  await flow('1. existing customer — Hi → Book → date → period → confirm', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543210';
    seedExisting(db._store, { phone, name: 'Poorna Shetty' });
    let r = await inbound(db, textMsg(phone, 'Hi'));
    assert.strictEqual(r.step, 'await_known_menu', r.step);
    assert.ok(r.sent.some((s) => s.buttons?.includes('known_book')), bodies(r.sent));

    r = await inbound(db, btn(phone, 'known_book', 'Book Service'));
    assert.strictEqual(r.step, 'await_date', r.step);
    const dateId = r.sent.find((s) => s.kind === 'list')?.rows?.find((id) => id.startsWith('date_'));
    assert.ok(dateId, bodies(r.sent));

    r = await inbound(db, list(phone, dateId, 'Tomorrow'));
    assert.strictEqual(r.step, 'await_period', r.step);
    const periodId = r.sent.find((s) => s.kind === 'list')?.rows?.find((id) => id.startsWith('period_'));
    assert.ok(periodId, bodies(r.sent));

    r = await inbound(db, list(phone, periodId, 'Morning'));
    assert.strictEqual(r.step, 'await_confirm', r.step);
    assert.ok(r.sent.some((s) => s.buttons?.includes('confirm_new')), bodies(r.sent));

    r = await inbound(db, btn(phone, 'confirm_new', 'Yes, book now'));
    assert.ok(db._store.jobs.length >= 1, 'job created');
    assert.ok(
      r.sent.some((s) => /booking/i.test(s.body || '')),
      bodies(r.sent)
    );
  });

  await flow('2. existing customer — second Hi within 3 min must not wipe the menu', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543211';
    seedExisting(db._store, { phone, name: 'Anita', id: 'cust_hi' });
    let r = await inbound(db, textMsg(phone, 'Hi'));
    assert.strictEqual(r.step, 'await_known_menu');
    r = await inbound(db, textMsg(phone, 'Hi'));
    if (r.step === 'idle') {
      findings.push({
        id: 'hi-cooldown-wipe',
        severity: 'high',
        flow: 'existing customer Hi twice',
        detail: `second Hi left step=idle sent=${r.sent.length}. Menu was cleared and cooldown skipped a new one.`,
      });
    } else if (r.step !== 'await_known_menu') {
      findings.push({
        id: 'hi-twice-step',
        severity: 'medium',
        flow: 'existing customer Hi twice',
        detail: `second Hi left step=${r.step} (expected keep known menu)`,
      });
    }
  });

  await flow('3. existing AMC customer — Hi shows AMC check-in', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543212';
    seedExisting(db._store, { phone, name: 'AMC User', id: 'cust_amc', amc: true });
    const r = await inbound(db, textMsg(phone, 'Hi'));
    assert.strictEqual(r.step, 'await_amc_checkin', r.step);
    assert.ok(r.sent.some((s) => s.buttons?.includes('amc_book') || s.buttons?.includes('amc_issue')), bodies(r.sent));
  });

  await flow('4. existing recent-service — Hi asks if problem again', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543213';
    seedExisting(db._store, { phone, name: 'Recent', id: 'cust_recent', lastServiceDaysAgo: 2 });
    const r = await inbound(db, textMsg(phone, 'Hi'));
    assert.strictEqual(r.step, 'await_recent_problem', r.step);
    assert.ok(r.sent.some((s) => s.buttons?.includes('recent_yes')), bodies(r.sent));
    const r2 = await inbound(db, btn(phone, 'recent_yes', 'Yes'));
    assert.strictEqual(r2.step, 'await_issue_text', r2.step);
  });

  await flow('5. unknown — First time → Book → name → location (no End-flow stack)', async () => {
    const db = createMockDb(createStore());
    const phone = '919606544288';
    let r = await inbound(db, textMsg(phone, 'Hi'));
    assert.strictEqual(r.step, 'await_identity_gate', r.step);
    r = await inbound(db, btn(phone, 'id_first_time', 'First time'));
    assert.strictEqual(r.step, 'await_first_time_menu', r.step);
    r = await inbound(db, btn(phone, 'first_book', 'Book Service'));
    assert.strictEqual(r.step, 'await_name', r.step);
    r = await inbound(db, textMsg(phone, 'Rahul Kumar'));
    assert.strictEqual(r.step, 'await_location', r.step);
    const locSends = r.sent.filter((s) => s.kind === 'location_request');
    const endFlowSends = r.sent.filter((s) => s.buttons?.length === 1 && s.buttons[0] === 'end_flow');
    assert.strictEqual(locSends.length, 1, bodies(r.sent));
    if (endFlowSends.length) {
      findings.push({
        id: 'new-customer-loc-endflow',
        severity: 'medium',
        flow: 'new customer location ask',
        detail: `still sent a standalone End flow bubble (${endFlowSends.length})`,
      });
    }
  });

  await flow('6. unknown — two near-identical pins must confirm once', async () => {
    const db = createMockDb(createStore());
    const phone = '919606544289';
    await inbound(db, textMsg(phone, 'Hi'));
    await inbound(db, btn(phone, 'id_first_time', 'First time'));
    await inbound(db, btn(phone, 'first_book', 'Book Service'));
    await inbound(db, textMsg(phone, 'Rahul Kumar'));
    const a = await inbound(db, locMsg(phone, 12.893458366394, 77.632431030273, { address: 'Garvebhavi Palya' }));
    const b = await inbound(db, locMsg(phone, 12.89344674622, 77.632454931736, { address: 'Garvebhavi Palya' }));
    const confirms = [...a.sent, ...b.sent].filter(
      (s) => s.buttons?.includes('loc_yes') || /location received/i.test(s.body || '')
    );
    if (b.sent.some((s) => s.buttons?.includes('loc_yes')) || b.sent.some((s) => /location received/i.test(s.body || ''))) {
      findings.push({
        id: 'dup-loc-confirm',
        severity: 'high',
        flow: 'new customer two pins',
        detail: `second pin still sent: ${bodies(b.sent).join(' || ')}`,
      });
    }
    assert.strictEqual(a.step, 'await_loc_confirm', a.step);
    assert.strictEqual(b.step, 'await_loc_confirm', b.step);
    assert.ok(confirms.length >= 1, 'first pin should confirm');
  });

  await flow('7. Different number → 10-digit → Yes this is me → facing issue', async () => {
    const db = createMockDb(createStore());
    const wa = '919606544290';
    seedExisting(db._store, { phone: '6361631253', name: 'Poorna Shetty', id: 'cust_link' });
    await inbound(db, textMsg(wa, 'Hi'));
    await inbound(db, btn(wa, 'id_other_number', 'Different number'));
    let r = await inbound(db, textMsg(wa, '6361631253'));
    assert.strictEqual(r.step, 'await_linked_identity_confirm', `${r.step} ${bodies(r.sent)}`);
    r = await inbound(db, textMsg(wa, 'Yes'));
    assert.ok(r.sent.some((s) => /tap/i.test(s.body || '')), 'typed Yes should ask to tap button');
    r = await inbound(db, btn(wa, 'link_yes', 'Yes, this is me'));
    assert.ok(
      ['await_facing_issue', 'await_amc_checkin', 'await_recent_problem'].includes(r.step),
      r.step
    );
  });

  await flow('8. Different number → 10-digit must not restart welcome', async () => {
    const db = createMockDb(createStore());
    const wa = '919606544291';
    seedExisting(db._store, { phone: '6361631253', name: 'Poorna Shetty', id: 'cust_link2' });
    await inbound(db, textMsg(wa, 'Hi'));
    await inbound(db, btn(wa, 'id_other_number', 'Different number'));
    const r = await inbound(db, textMsg(wa, '6361631253'));
    const restarted = r.sent.some((s) => /first time/i.test(s.body || ''));
    if (restarted) {
      findings.push({
        id: 'other-phone-restart',
        severity: 'high',
        flow: 'different number 10-digit',
        detail: bodies(r.sent).join(' || '),
      });
    }
    assert.strictEqual(r.step, 'await_linked_identity_confirm', r.step);
  });

  await flow('9. admin request_location + two pins', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543214';
    seedExisting(db._store, { phone, name: 'Loc Admin', id: 'cust_loc' });
    const started = await bot.startAdminQuickAction(
      { db, ...CTX, to: phone },
      'request_location',
      { customerName: 'Loc Admin' }
    );
    assert.ok(started.ok, started);
    const endOnly = outbox.filter((s) => s.buttons?.length === 1 && s.buttons[0] === 'end_flow');
    if (endOnly.length) {
      findings.push({
        id: 'admin-loc-endflow',
        severity: 'medium',
        flow: 'admin ask location',
        detail: 'standalone End flow still sent with location request',
      });
    }
    const a = await inbound(db, locMsg(phone, 12.89, 77.63));
    const b = await inbound(db, locMsg(phone, 12.89001, 77.63001));
    if (b.sent.some((s) => s.buttons?.includes('loc_yes') || /location received/i.test(s.body || ''))) {
      findings.push({
        id: 'admin-dup-loc',
        severity: 'high',
        flow: 'admin ask location two pins',
        detail: bodies(b.sent).join(' || '),
      });
    }
    assert.strictEqual(a.step, 'await_loc_confirm');
  });

  await flow('10. admin book_location_photo — loc yes asks flat then photo', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543215';
    seedExisting(db._store, { phone, name: 'BLP', id: 'cust_blp' });
    await bot.startAdminQuickAction({ db, ...CTX, to: phone }, 'book_location_photo', {
      customerName: 'BLP',
    });
    await inbound(db, locMsg(phone, 12.9, 77.6));
    let r = await inbound(db, btn(phone, 'loc_yes', 'Yes, correct'));
    assert.strictEqual(r.step, 'await_building_flat', r.step);
    r = await inbound(db, textMsg(phone, 'Flat 302'));
    assert.strictEqual(r.step, 'await_model_or_photo', r.step);
  });

  await flow('11. unknown Hi twice duplicates welcome', async () => {
    const db = createMockDb(createStore());
    const phone = '919111111111';
    const a = await inbound(db, textMsg(phone, 'Hi'));
    const b = await inbound(db, textMsg(phone, 'Hi'));
    const welcomes = [...a.sent, ...b.sent].filter((s) => /first time/i.test(s.body || ''));
    if (welcomes.length > 1) {
      findings.push({
        id: 'unknown-hi-dup-welcome',
        severity: 'medium',
        flow: 'unknown Hi twice',
        detail: `welcome sent ${welcomes.length} times`,
      });
    }
  });

  await flow('12. existing customer Hi during date pick', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543216';
    seedExisting(db._store, { phone, name: 'Mid', id: 'cust_mid' });
    await inbound(db, textMsg(phone, 'Hi'));
    await inbound(db, btn(phone, 'known_book', 'Book Service'));
    assert.strictEqual(stepOf(db, phone), 'await_date');
    const r = await inbound(db, textMsg(phone, 'Hi'));
    if (r.step === 'idle' || (r.step !== 'await_date' && r.sent.length === 0)) {
      findings.push({
        id: 'hi-mid-date-wipe',
        severity: 'high',
        flow: 'existing customer Hi on date picker',
        detail: `step became ${r.step} with ${r.sent.length} outbound. Booking was wiped and no menu resent.`,
      });
    }
  });

  await flow('13. loc_no resend does not stack End flow', async () => {
    const db = createMockDb(createStore());
    const phone = '919222222222';
    await inbound(db, textMsg(phone, 'Hi'));
    await inbound(db, btn(phone, 'id_first_time', 'First time'));
    await inbound(db, btn(phone, 'first_book', 'Book Service'));
    await inbound(db, textMsg(phone, 'Rahul Kumar'));
    await inbound(db, locMsg(phone, 12.9, 77.6));
    const r = await inbound(db, btn(phone, 'loc_no', 'No, resend'));
    const endOnly = r.sent.filter((s) => s.buttons?.length === 1 && s.buttons[0] === 'end_flow');
    assert.strictEqual(r.step, 'await_location', r.step);
    if (endOnly.length) {
      findings.push({
        id: 'loc-no-endflow',
        severity: 'low',
        flow: 'loc_no resend',
        detail: 'End flow bubble came back on resend',
      });
    }
  });

  await flow('14. Chat with us from known menu', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543217';
    seedExisting(db._store, { phone, name: 'Chatty', id: 'cust_chat' });
    await inbound(db, textMsg(phone, 'Hi'));
    const r = await inbound(db, btn(phone, 'known_chat', 'Chat with us'));
    assert.ok(r.sent.length >= 1, bodies(r.sent));
  });

  await flow('15. End flow from known menu', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543218';
    seedExisting(db._store, { phone, name: 'Ender', id: 'cust_end' });
    await inbound(db, textMsg(phone, 'Hi'));
    const r = await inbound(db, textMsg(phone, 'end flow'));
    assert.ok(r.result.handled);
  });

  await flow('16. existing customer — Reinstallation asks identity then new pin', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543219';
    seedExisting(db._store, { phone, name: 'Reins', id: 'cust_re' });
    await inbound(db, textMsg(phone, 'Hi'));
    const r = await inbound(db, btn(phone, 'book_reinstall', 'Reinstallation'));
    // Greeting remap may convert title; id book_reinstall should work from known menu? known menu doesn't have reinstall.
    // Direct id still handled.
    assert.ok(
      ['await_location', 'await_loc_confirm'].includes(r.step) ||
        r.sent.some((s) => s.buttons?.includes('identity_yes')) ||
        r.step === 'await_date',
      `step=${r.step} ${bodies(r.sent)}`
    );
    if (r.sent.some((s) => s.buttons?.includes('identity_yes'))) {
      const r2 = await inbound(db, btn(phone, 'identity_no', 'Different location'));
      assert.ok(
        r2.step === 'await_location' || r2.step === 'await_alt_phone',
        r2.step
      );
    }
  });

  await flow('17. existing customer WFS — location first, loc_yes skips flat, goes date', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543220';
    seedExisting(db._store, { phone, name: 'WFS', id: 'cust_wfs' });
    await bot.startAdminQuickAction(
      { db, ...CTX, to: phone },
      'water_filter_service',
      { customerName: 'WFS' }
    );
    assert.strictEqual(stepOf(db, phone), 'await_location');
    await inbound(db, locMsg(phone, 12.91, 77.61));
    const r = await inbound(db, btn(phone, 'loc_yes', 'Yes, correct'));
    assert.strictEqual(r.step, 'await_date', `WFS loc_yes should skip flat, got ${r.step}`);
  });

  await flow('18. existing customer types Book instead of tapping', async () => {
    const db = createMockDb(createStore());
    const phone = '919876543221';
    seedExisting(db._store, { phone, name: 'Typer', id: 'cust_type' });
    await inbound(db, textMsg(phone, 'Hi'));
    const r = await inbound(db, textMsg(phone, 'Book'));
    // Should stay on known menu or start booking — must not go idle
    if (r.step === 'idle') {
      findings.push({
        id: 'typed-book-idle',
        severity: 'high',
        flow: 'existing customer typed Book',
        detail: 'typed Book left idle',
      });
    }
  });

  console.log('\n========== FINDINGS ==========');
  if (!findings.length) {
    console.log('No extra bugs flagged beyond passing assertions.');
  } else {
    for (const f of findings) {
      console.log(`[${f.severity}] ${f.id} — ${f.flow}\n  ${f.detail}`);
    }
  }
  console.log(`\n${findings.length} finding(s).`);
  process.exit(findings.some((f) => f.severity === 'high') ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFLOW FAILED');
  console.error(err);
  process.exit(1);
});
