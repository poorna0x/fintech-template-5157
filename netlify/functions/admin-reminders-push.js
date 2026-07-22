// Scheduled: every day at 9:00 AM IST (03:30 UTC — see netlify.toml).
// Pushes one notification per reminder / pending payment due today to all
// admin phones. Pending payments include a native WhatsApp action (admin APK);
// tap always deep-links into Settings on that customer.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError } = require('./fcm-helper');

const PENDING_PAYMENT_TITLE = 'Pending payment';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const COLOR_GENERAL = '#D97706';
const COLOR_PENDING = '#2563EB';

function istTodayYmd() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parsePendingAmount(notes) {
  const raw = (notes ?? '').toString().trim();
  if (!raw) return 0;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const n =
        typeof parsed.amount_pending === 'number'
          ? parsed.amount_pending
          : Number(String(raw).replace(/[^0-9.-]/g, '')) || 0;
      return Number.isFinite(n) ? n : 0;
    } catch {
      // fallthrough
    }
  }
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}


exports.handler = async () => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[admin-reminders-push] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = istTodayYmd();

  const [{ data: reminders, error: remErr }, { data: tokenRows, error: tokErr }] = await Promise.all([
    db
      .from('reminders')
      .select('id,title,notes,entity_type,entity_id,reminder_at')
      .eq('reminder_at', today)
      .is('completed_at', null)
      .order('created_at', { ascending: true }),
    db.from('admin_push_tokens').select('token'),
  ]);

  if (remErr) {
    console.error('[admin-reminders-push] reminders query failed', remErr.message);
    return { statusCode: 500, body: 'Query failed' };
  }
  if (tokErr) {
    console.error('[admin-reminders-push] token lookup failed', tokErr.message);
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_table' }) };
  }

  const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_tokens', today }) };
  }

  const rows = reminders || [];
  if (rows.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'none_due', today }) };
  }

  const customerIds = [
    ...new Set(
      rows
        .filter((r) => r.entity_type === 'customer' && r.entity_id)
        .map((r) => r.entity_id)
    ),
  ];

  const customerById = new Map();
  if (customerIds.length > 0) {
    const { data: customers, error: custErr } = await db
      .from('customers')
      .select('id,full_name,phone,alternate_phone,customer_id')
      .in('id', customerIds);
    if (custErr) {
      console.error('[admin-reminders-push] customers query failed', custErr.message);
    } else {
      for (const c of customers || []) customerById.set(c.id, c);
    }
  }

  let messaging;
  try {
    messaging = await getMessaging(db);
  } catch (err) {
    console.error('[admin-reminders-push] FCM init failed', err?.message || err);
    return { statusCode: 500, body: 'FCM init failed' };
  }

  let sent = 0;
  const staleTokens = new Set();

  for (const r of rows) {
    const isPending = (r.title || '').trim() === PENDING_PAYMENT_TITLE;
    const reminderId = String(r.id);
    const tag = `admin_reminder_${reminderId}`;

    if (isPending) {
      const customer = r.entity_id ? customerById.get(r.entity_id) : null;
      const customerName = customer?.full_name || 'Customer';
      const amount = parsePendingAmount(r.notes);
      const phone = normalizePhone(customer?.phone || customer?.alternate_phone || '');
      const amountStr = String(Math.round(amount * 100) / 100);
      const title = `Pending ₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} — ${customerName}`;
      const body = phone
        ? 'Due today — tap Open or WhatsApp from the notification'
        : 'Due today — tap to open Pending payments';

      const data = {
        type: 'admin_reminder',
        kind: 'pending_payment',
        panel: 'pending-payments',
        reminderId,
        customerName,
        amount: amountStr,
        entityId: r.entity_id ? String(r.entity_id) : '',
        phone,
        title,
        body,
        color: COLOR_PENDING,
        tag,
      };

      const res = await messaging.sendEachForMulticast({
        tokens,
        data,
        android: { priority: 'high' },
      });
      sent += res.successCount;
      res.responses.forEach((resp, i) => {
        if (!resp.success && isStaleTokenError(resp.error)) staleTokens.add(tokens[i]);
      });
      continue;
    }

    const title = (r.title || 'Reminder').trim() || 'Reminder';
    const note = (r.notes || '').toString().trim();
    const body = note ? note.slice(0, 180) : 'Due today — tap to open Reminders';
    const data = {
      type: 'admin_reminder',
      kind: 'general',
      panel: 'reminders',
      reminderId,
      title,
      body,
      color: COLOR_GENERAL,
      tag,
    };

    const res = await messaging.sendEachForMulticast({
      tokens,
      data,
      android: { priority: 'high' },
    });
    sent += res.successCount;
    res.responses.forEach((resp, i) => {
      if (!resp.success && isStaleTokenError(resp.error)) staleTokens.add(tokens[i]);
    });
  }

  if (staleTokens.size > 0) {
    await db.from('admin_push_tokens').delete().in('token', [...staleTokens]);
  }

  console.log(
    `[admin-reminders-push] ${today}: ${rows.length} reminder(s), ${sent} push(es) delivered`
  );
  return {
    statusCode: 200,
    body: JSON.stringify({ today, reminders: rows.length, sent }),
  };
};
