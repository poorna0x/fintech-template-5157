/**
 * Pending-payment WhatsApp copy shared by admin-reminders-push (must match
 * src/lib/pendingPaymentReminder.ts buildPendingPaymentWhatsAppMessage).
 */

const CONTACT = {
  hydrogenro: {
    phone: '8884944288',
    email: 'mail@hydrogenro.com',
    website: 'https://hydrogenro.com',
    team: 'Hydrogen RO Team',
    label: 'Hydrogen RO',
    origin: 'https://hydrogenro.com',
  },
  elevenro: {
    phone: '9880693311',
    email: 'mail@elevenro.com',
    website: 'https://elevenro.com',
    team: 'Eleven RO Team',
    label: 'Eleven RO',
    origin: 'https://elevenro.com',
  },
};

function resolveBrand(value) {
  const b = String(value || '')
    .trim()
    .toLowerCase();
  return b === 'elevenro' ? 'elevenro' : 'hydrogenro';
}

function formatDueLabel(dueDateYmd) {
  const raw = String(dueDateYmd || '')
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  try {
    const [y, m, d] = raw.split('-').map((n) => parseInt(n, 10));
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return raw;
  }
}

function makePayCode() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/**
 * Insert a short /p/{code} row (service role bypasses RLS).
 * Returns full https URL or null.
 */
async function createShortPayHttpsLink(db, input) {
  const upiId = String(input.upiId || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!/^[a-z0-9.\-_]{2,256}@[a-z0-9.\-]{2,64}$/i.test(upiId)) return null;
  const brand = resolveBrand(input.brand);
  const origin = CONTACT[brand].origin;
  const amount = Number(input.amount);
  const row = {
    upi_id: upiId,
    payee_name: String(input.payeeName || '')
      .trim()
      .slice(0, 100),
    amount: Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : null,
    note: String(input.note || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80),
    phone: String(input.phone || '')
      .replace(/\D/g, '')
      .slice(-10),
    brand,
  };

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = makePayCode();
    const { error } = await db.from('upi_pay_links').insert({ code, ...row });
    if (!error) return `${origin}/p/${code}`;
    // unique_violation → retry; missing table / other → stop
    const msg = String(error.message || error.code || '');
    if (!/duplicate|unique/i.test(msg) && error.code !== '23505') {
      console.warn('[pending-wa] upi_pay_links insert failed', msg);
      return null;
    }
  }
  return null;
}

function buildPendingPaymentWhatsAppMessage({
  customerName,
  amountPending,
  dueDateYmd,
  brand,
  payLink,
  upiId,
  upiLabel,
  upiPhone,
}) {
  const resolved = resolveBrand(brand);
  const contact = CONTACT[resolved];
  const formattedAmount = Number(amountPending || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });
  const dueLabel = formatDueLabel(dueDateYmd);
  const link = String(payLink || '').trim();
  const vpa = String(upiId || '').trim();

  const labeledValue = (emoji, label, value) => {
    const v = String(value || '').trim();
    const l = String(label || '').trim() || 'Info';
    const e = String(emoji || '').trim();
    if (!v) return e ? `${e} *${l}*` : `*${l}*`;
    return e ? `${e} *${l}*:\n${v}` : `*${l}*:\n${v}`;
  };

  const labeledLink = (emoji, label, url) => {
    const u = String(url || '').trim();
    const l = String(label || '').trim() || 'Link';
    const e = String(emoji || '').trim();
    if (!u) return e ? `${e} *${l}*` : `*${l}*`;
    return e ? `${e} *${l}*:\n${u}` : `*${l}*:\n${u}`;
  };

  const lines = [
    `Hi ${customerName || 'Customer'} 😊`,
    '',
    `Quick reminder from *${contact.label}* about your pending payment for water filter service.`,
    '',
    '*Payment summary*',
    labeledValue('💰', 'Amount due', `₹${formattedAmount}`),
    labeledValue('📅', 'Due by', dueLabel || 'At your earliest convenience'),
  ];

  if (link || vpa) {
    lines.push('');
    lines.push('*Pay now*');
    if (link) {
      lines.push(labeledLink('💳', 'Payment link (GPay / PhonePe / UPI)', link));
    }
    if (vpa) {
      lines.push(labeledValue('📱', 'UPI ID', vpa));
    }
    if (upiLabel) {
      lines.push(labeledValue('🏦', 'Pay to', upiLabel));
    }
    if (link) {
      lines.push(`Amount *₹${formattedAmount}* is pre-filled when you use the payment link.`);
    }
    if (upiPhone) {
      lines.push(labeledValue('📞', 'UPI mobile', upiPhone));
    }
  }

  lines.push('');
  lines.push(
    'Please clear this at your earliest convenience. If you have already paid, kindly ignore this message.'
  );
  lines.push('');
  lines.push('Thanks & regards 🙏');
  lines.push(contact.team);
  return lines.join('\n');
}

/**
 * Build WhatsApp body for a pending-payment reminder push (incl. short UPI link when possible).
 */
async function buildPendingPaymentWhatsAppForPush(db, {
  customerName,
  amount,
  dueDate,
  serviceBrand,
  upiAccount,
}) {
  let payLink = null;
  if (upiAccount && upiAccount.upi_id) {
    payLink = await createShortPayHttpsLink(db, {
      upiId: upiAccount.upi_id,
      payeeName: upiAccount.payee_name || upiAccount.label || '',
      amount,
      note: 'Pending payment',
      phone: upiAccount.phone || '',
      brand: serviceBrand,
    });
  }
  return buildPendingPaymentWhatsAppMessage({
    customerName,
    amountPending: amount,
    dueDateYmd: dueDate,
    brand: serviceBrand,
    payLink,
    upiId: upiAccount?.upi_id || '',
    upiLabel: upiAccount?.label || upiAccount?.payee_name || '',
    upiPhone: upiAccount?.phone || '',
  });
}

module.exports = {
  buildPendingPaymentWhatsAppForPush,
  buildPendingPaymentWhatsAppMessage,
  resolveBrand,
};
