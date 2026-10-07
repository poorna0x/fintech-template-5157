// Scheduled: every day at 9:00 AM IST (03:30 UTC — see netlify.toml).
// Pushes one notification per reminder / pending payment due today to all
// admin phones. Pending payments include a native WhatsApp action (admin APK);
// tap always deep-links into Settings on that customer.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError, getAdminFcmTokens, sendAdminMulticast, pruneAdminFcmTokens } = require('./fcm-helper');
const { assertScheduledInvoke } = require('./schedule-guard');
const { buildPendingPaymentWhatsAppForPush, createShortPayHttpsLink } = require('./pending-payment-whatsapp');
const { getWhatsAppCredentials, insertWhatsAppMessage, normalizePhoneE164 } = require('./whatsapp-helper');
const { sendTemplateWithColdFallbacks } = require('./whatsapp-cold-fallback');

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

function dueLabel(ymd) {
  const raw = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'today';
  const [y, m, d] = raw.split('-').map((n) => parseInt(n, 10));
  try {
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return raw;
  }
}

function pickUpiForQrMode(accounts, mode) {
  const list = Array.isArray(accounts) ? accounts : [];
  if (mode === 'static') {
    return (
      list.find((a) => a.qr_code_url && a.dynamic_upi_enabled === false) ||
      list.find((a) => a.qr_code_url) ||
      list[0] ||
      null
    );
  }
  return (
    list.find((a) => a.dynamic_upi_enabled && a.upi_id) ||
    list.find((a) => a.upi_id) ||
    list[0] ||
    null
  );
}

async function loadPendingAutoSend(db) {
  const { data, error } = await db
    .from('whatsapp_crm_settings')
    .select(
      'enabled, allow_pending_payment, auto_send_pending_payment_whatsapp, pending_payment_qr_mode'
    )
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return { enabled: false, qrMode: 'dynamic' };
  const enabled =
    data.enabled !== false &&
    data.allow_pending_payment !== false &&
    data.auto_send_pending_payment_whatsapp === true;
  return {
    enabled,
    qrMode: data.pending_payment_qr_mode === 'static' ? 'static' : 'dynamic',
  };
}

/** One customer reminder per phone per day when the settings toggle is on. */
async function sendCustomerPendingReminder(db, opts) {
  const phone = normalizePhoneE164(opts.phone);
  if (!phone) return { sent: false, reason: 'no_phone' };
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await db
    .from('whatsapp_messages')
    .select('id')
    .eq('phone_e164', phone)
    .eq('direction', 'outbound')
    .ilike('template_name', 'svc_balance_due%')
    .gte('created_at', since)
    .limit(1)
    .maybeSingle();
  if (recent?.id) return { sent: false, reason: 'deduped' };

  const brand = String(opts.serviceBrand || '').toLowerCase() === 'elevenro' ? 'elevenro' : 'hydrogenro';
  const suffix = brand === 'elevenro' ? 'ero' : 'hro';
  const account = pickUpiForQrMode(opts.upiAccounts, opts.qrMode);
  const name = String(opts.customerName || 'Customer').trim().split(/\s+/)[0] || 'Customer';
  const amountDigits = String(Math.round(Number(opts.amount || 0) * 100) / 100).replace(/\.0+$/, '') || '0';
  const bodyParams = [name, amountDigits, dueLabel(opts.dueDate), 'your service visit'];

  let templateName = `svc_balance_due_letter_${suffix}_v9`;
  let headerComponents = [];
  let buttonUrlParams = [];
  const staticUrl = String(account?.qr_code_url || '').trim();
  if (opts.qrMode === 'static' && /^https:\/\//i.test(staticUrl)) {
    templateName = `svc_balance_due_letter_${suffix}_img_v5`;
    headerComponents = [
      { type: 'header', parameters: [{ type: 'image', image: { link: staticUrl } }] },
    ];
  } else if (account?.upi_id) {
    const link = await createShortPayHttpsLink(db, {
      upiId: account.upi_id,
      payeeName: account.payee_name || account.label || '',
      amount: opts.amount,
      note: 'Pending payment',
      phone: account.phone || '',
      brand,
    });
    const code = String(link || '').split('/').filter(Boolean).pop() || '';
    if (code) buttonUrlParams = [{ index: 1, text: code }];
  }

  const { accessToken, phoneNumberId } = await getWhatsAppCredentials(db);
  if (!accessToken || !phoneNumberId) return { sent: false, reason: 'no_credentials' };

  const sendResult = await sendTemplateWithColdFallbacks({
    phoneNumberId,
    accessToken,
    to: phone,
    templateName,
    languageCode: 'en',
    bodyParams,
    headerComponents,
    buttonUrlParams,
    enableFallback: true,
  });
  const usedName = sendResult.templateName || templateName;
  const result = sendResult.result || {};
  const waId = result?.data?.messages?.[0]?.id || null;
  await insertWhatsAppMessage(db, {
    wa_message_id: waId,
    direction: 'outbound',
    phone_e164: phone,
    customer_id: opts.customerId || null,
    msg_type: 'template',
    body: opts.whatsappText || `Pending payment reminder (${usedName})`,
    template_name: usedName,
    status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : JSON.stringify(result.data || {}).slice(0, 500),
  });
  return { sent: Boolean(result.ok), reason: result.ok ? 'sent' : 'failed' };
}

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

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

  const [{ data: reminders, error: remErr }, tokens, upiAccountsRes, pendingAuto] = await Promise.all([
    db
      .from('reminders')
      .select('id,title,notes,entity_type,entity_id,reminder_at')
      .eq('reminder_at', today)
      .is('completed_at', null)
      .order('created_at', { ascending: true }),
    getAdminFcmTokens(db, 'reminders'),
    db
      .from('upi_payment_accounts')
      .select('id,label,upi_id,payee_name,phone,qr_code_url,dynamic_upi_enabled,created_at')
      .order('created_at', { ascending: true })
      .limit(20),
    loadPendingAutoSend(db),
  ]);

  if (remErr) {
    console.error('[admin-reminders-push] reminders query failed', remErr.message);
    return { statusCode: 500, body: 'Query failed' };
  }

  if (tokens.length === 0 && !pendingAuto.enabled) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_tokens', today }) };
  }

  const rows = reminders || [];
  if (rows.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'none_due', today }) };
  }

  let upiAccounts = upiAccountsRes.data || [];
  if (upiAccountsRes.error) {
    console.warn(
      '[admin-reminders-push] upi_payment_accounts lookup failed',
      upiAccountsRes.error.message
    );
    const fallbackUpi = await db
      .from('upi_payment_accounts')
      .select('id,label,upi_id,payee_name,phone,created_at')
      .order('created_at', { ascending: true })
      .limit(20);
    upiAccounts = fallbackUpi.data || [];
  }
  const preferredUpi = pendingAuto.enabled
    ? pickUpiForQrMode(upiAccounts, pendingAuto.qrMode) || upiAccounts[0] || null
    : upiAccounts[0] || null;

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

  // Latest completed job brand per customer (for pending-payment WhatsApp copy).
  const brandByCustomerId = new Map();
  if (customerIds.length > 0) {
    const { data: brandJobs, error: brandErr } = await db
      .from('jobs')
      .select('customer_id,service_brand,completed_at,end_time,created_at')
      .in('customer_id', customerIds)
      .eq('status', 'COMPLETED')
      .not('service_brand', 'is', null)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('end_time', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (brandErr) {
      console.warn('[admin-reminders-push] service_brand lookup failed', brandErr.message);
    } else {
      for (const row of brandJobs || []) {
        const cid = row.customer_id;
        if (!cid || brandByCustomerId.has(cid)) continue;
        const b = String(row.service_brand || '').trim().toLowerCase();
        brandByCustomerId.set(cid, b === 'elevenro' ? 'elevenro' : 'hydrogenro');
      }
    }
  }

  let messaging = null;
  if (tokens.length > 0) {
    try {
      messaging = await getMessaging(db);
    } catch (err) {
      console.error('[admin-reminders-push] FCM init failed', err?.message || err);
      if (!pendingAuto.enabled) {
        return { statusCode: 500, body: 'FCM init failed' };
      }
    }
  }

  let sent = 0;
  let customerWhatsAppSent = 0;
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
      const dueDate = String(r.reminder_at || '').slice(0, 10);
      const serviceBrand =
        (r.entity_id && brandByCustomerId.get(r.entity_id)) || 'hydrogenro';
      const title = `Pending ₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} — ${customerName}`;
      const body = phone
        ? `Due ${dueDate || 'today'} — tap Open or WhatsApp from the notification`
        : `Due ${dueDate || 'today'} — tap to open Pending payments`;

      let whatsappText = '';
      try {
        whatsappText = await buildPendingPaymentWhatsAppForPush(db, {
          customerName,
          amount,
          dueDate,
          serviceBrand,
          upiAccount: preferredUpi,
        });
      } catch (err) {
        console.warn(
          '[admin-reminders-push] whatsapp text build failed',
          err?.message || err
        );
      }

      const data = {
        type: 'admin_reminder',
        kind: 'pending_payment',
        panel: 'pending-payments',
        reminderId,
        customerName,
        amount: amountStr,
        dueDate,
        entityId: r.entity_id ? String(r.entity_id) : '',
        phone,
        serviceBrand,
        whatsappText: whatsappText || '',
        title,
        body,
        color: COLOR_PENDING,
        tag,
      };

      if (messaging && tokens.length > 0) {
        const res = await sendAdminMulticast(db, messaging, {
          tokens,
          data,
          android: { priority: 'high' },
        });
        sent += res.successCount;
        res.responses.forEach((resp, i) => {
          if (!resp.success && isStaleTokenError(resp.error)) staleTokens.add(tokens[i]);
        });
      }

      if (pendingAuto.enabled && phone) {
        try {
          const wa = await sendCustomerPendingReminder(db, {
            phone,
            customerName,
            customerId: r.entity_id,
            amount,
            dueDate,
            serviceBrand,
            qrMode: pendingAuto.qrMode,
            upiAccounts,
            whatsappText,
          });
          if (wa.sent) customerWhatsAppSent += 1;
        } catch (err) {
          console.warn('[admin-reminders-push] customer WhatsApp failed', err?.message || err);
        }
      }
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

    if (messaging && tokens.length > 0) {
      const res = await sendAdminMulticast(db, messaging, {
        tokens,
        data,
        android: { priority: 'high' },
      });
      sent += res.successCount;
      res.responses.forEach((resp, i) => {
        if (!resp.success && isStaleTokenError(resp.error)) staleTokens.add(tokens[i]);
      });
    }
  }

  if (staleTokens.size > 0) {
    await pruneAdminFcmTokens(db, [...staleTokens]);
  }

  console.log(
    `[admin-reminders-push] ${today}: ${rows.length} reminder(s), ${sent} push(es), ${customerWhatsAppSent} customer WhatsApp`
  );
  return {
    statusCode: 200,
    body: JSON.stringify({
      today,
      reminders: rows.length,
      sent,
      customerWhatsAppSent,
    }),
  };
};
