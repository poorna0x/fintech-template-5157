/** Shared payment status for AMC / bill / tax invoice documents. */
export type DocumentPaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING';

export type ResolvedDocumentPayment = {
  status: DocumentPaymentStatus;
  total: number;
  paid: number;
  balance: number;
};

export function isDocumentPaymentStatus(value: unknown): value is DocumentPaymentStatus {
  return value === 'PAID' || value === 'PARTIAL' || value === 'PENDING';
}

export function resolveDocumentPayment(input: {
  paymentStatus?: string | null;
  totalAmount: number;
  amountPaid?: number | null;
}): ResolvedDocumentPayment {
  const total = Math.max(0, Number(input.totalAmount) || 0);
  const rawPaid = Number(input.amountPaid);
  const paid =
    input.paymentStatus === 'PAID'
      ? total
      : input.paymentStatus === 'PENDING'
        ? 0
        : Number.isFinite(rawPaid)
          ? Math.max(0, Math.min(rawPaid, total))
          : 0;
  const balance = Math.max(0, total - paid);
  let status: DocumentPaymentStatus = 'PENDING';
  if (input.paymentStatus === 'PAID' || (total > 0 && paid >= total)) {
    status = 'PAID';
  } else if (input.paymentStatus === 'PARTIAL' || (paid > 0 && paid < total)) {
    status = 'PARTIAL';
  } else if (input.paymentStatus === 'PENDING') {
    status = 'PENDING';
  }
  return { status, total, paid, balance };
}

/** Returns an error message when PARTIAL amount is invalid; otherwise null. */
export function validatePartialPaymentAmount(
  status: DocumentPaymentStatus,
  amountReceived: number,
  totalAmount: number
): string | null {
  if (status !== 'PARTIAL') return null;
  if (amountReceived <= 0 || amountReceived >= totalAmount) {
    return 'Enter a partial amount greater than 0 and less than the total';
  }
  return null;
}

/** PENDING / PARTIAL documents need a due date for the legal acknowledgement clause. */
export function validatePaymentDueDate(
  status: DocumentPaymentStatus,
  paymentDueDate?: string | null
): string | null {
  if (status !== 'PENDING' && status !== 'PARTIAL') return null;
  const d = String(paymentDueDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return 'Select payment due date';
  }
  return null;
}

/** Format YYYY-MM-DD for PDF payment notices (en-IN). */
export function formatPaymentDueDateLabel(paymentDueDate?: string | null): string | null {
  const raw = String(paymentDueDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  try {
    const [y, m, d] = raw.split('-').map((n) => parseInt(n, 10));
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

function paymentDueDateLineHtml(paymentDueDate?: string | null): string {
  const formatted = formatPaymentDueDateLabel(paymentDueDate);
  if (!formatted) return '';
  return `<p class="payment-notice-line"><strong>Payment due date:</strong> ${formatted}</p>`;
}

/**
 * Shared legal acknowledgement for pending / partial payment on bill, invoice, AMC.
 * When dueDateLabel is set, warranty/guarantee void + advance non-refundable if unpaid by that date.
 */
export function buildDocumentPaymentLegalText(input: {
  status: DocumentPaymentStatus;
  total: number;
  paid: number;
  balance: number;
  paymentDueDate?: string | null;
  /** "bill" | "invoice" | "agreement" — affects opening sentence only. */
  documentKind?: 'bill' | 'invoice' | 'agreement';
}): string {
  const dueLabel = formatPaymentDueDateLabel(input.paymentDueDate);
  const balanceStr = formatInrAmount(input.balance);
  const totalStr = formatInrAmount(input.total);
  const paidStr = formatInrAmount(input.paid);
  const kind = input.documentKind || 'bill';
  const docNoun =
    kind === 'invoice' ? 'tax invoice' : kind === 'agreement' ? 'AMC agreement' : 'bill';

  const consequence = dueLabel
    ? ` The balance of ₹${balanceStr} is due on or before ${dueLabel}. If the outstanding amount is not received by the due date, any warranty, service guarantee, or related assurance for this visit shall stand void, and any advance or part payment already received shall be non-refundable. The balance remains payable by the customer.`
    : ` The outstanding balance of ₹${balanceStr} remains payable by the customer. If not paid as agreed, any warranty, service guarantee, or related assurance for this visit may stand void, and any advance or part payment already received shall be non-refundable.`;

  if (input.status === 'PARTIAL') {
    return `The customer acknowledges that only part of the amount has been received (₹${paidStr} of ₹${totalStr}).${consequence}`;
  }

  return `This ${docNoun} is issued with payment pending.${consequence}`;
}

export function formatInrAmount(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function documentPaymentSummaryLabel(payment: ResolvedDocumentPayment): string {
  if (payment.status === 'PAID') return 'Paid in full';
  if (payment.status === 'PARTIAL') {
    return `Partial — ₹${formatInrAmount(payment.paid)} received, ₹${formatInrAmount(payment.balance)} due`;
  }
  return 'Payment pending';
}

export function documentPaymentSummaryClass(status: DocumentPaymentStatus): string {
  if (status === 'PAID') return 'text-green-700 font-medium';
  if (status === 'PARTIAL') return 'text-amber-700 font-medium';
  return 'text-red-700 font-medium';
}

/** CSS shared by bill / tax-invoice payment acknowledgement boxes. */
export function documentPaymentNoticeCss(): string {
  return `
        .payment-notice {
          margin: 20px 0 16px;
          padding: 14px 16px;
          border-radius: 8px;
          border: 2px solid #d1d5db;
          background: #f9fafb;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .payment-notice-title {
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          margin-bottom: 10px;
        }
        .payment-notice-line {
          font-size: 13px;
          margin: 0 0 6px 0;
          line-height: 1.5;
        }
        .payment-notice-legal {
          font-size: 12px;
          line-height: 1.55;
          margin: 10px 0 0 0;
          color: #374151;
        }
        .payment-notice-partial {
          border-color: #d97706;
          background: #fffbeb;
        }
        .payment-notice-partial .payment-notice-title {
          color: #92400e;
        }
        .payment-notice-pending {
          border-color: #dc2626;
          background: #fef2f2;
        }
        .payment-notice-pending .payment-notice-title {
          color: #991b1b;
        }
  `;
}

function paymentMetaRowsHtml(payment: ResolvedDocumentPayment): string {
  if (payment.status === 'PAID') return '';
  const statusLabel = payment.status === 'PARTIAL' ? 'Partial payment' : 'Payment pending';
  return `
        <div class="summary-row">
          <span>Payment Status:</span>
          <span>${statusLabel}</span>
        </div>
        <div class="summary-row">
          <span>Amount Received:</span>
          <span>₹${formatInrAmount(payment.paid)}</span>
        </div>
        ${
          payment.balance > 0
            ? `<div class="summary-row">
          <span>Balance Due:</span>
          <span>₹${formatInrAmount(payment.balance)}</span>
        </div>`
            : ''
        }
  `;
}

export function buildBillPaymentSummaryRowsHtml(input: {
  paymentStatus?: string | null;
  totalAmount: number;
  amountPaid?: number | null;
}): string {
  return paymentMetaRowsHtml(resolveDocumentPayment(input));
}

export function buildBillPaymentNoticeHtml(input: {
  paymentStatus?: string | null;
  totalAmount: number;
  amountPaid?: number | null;
  paymentDueDate?: string | null;
}): string {
  const payment = resolveDocumentPayment(input);
  if (payment.status === 'PAID') return '';

  const totalStr = formatInrAmount(payment.total);
  const paidStr = formatInrAmount(payment.paid);
  const balanceStr = formatInrAmount(payment.balance);
  const dueDateLine = paymentDueDateLineHtml(input.paymentDueDate);
  const legal = buildDocumentPaymentLegalText({
    ...payment,
    paymentDueDate: input.paymentDueDate,
    documentKind: 'bill',
  });

  if (payment.status === 'PARTIAL') {
    return `
      <div class="payment-notice payment-notice-partial">
        <div class="payment-notice-title">Payment acknowledgement — partial payment</div>
        <p class="payment-notice-line"><strong>Bill total:</strong> ₹${totalStr}</p>
        <p class="payment-notice-line"><strong>Amount received:</strong> ₹${paidStr}</p>
        <p class="payment-notice-line"><strong>Balance due:</strong> ₹${balanceStr}</p>
        ${dueDateLine}
        <p class="payment-notice-legal">${legal}</p>
      </div>
    `;
  }

  return `
    <div class="payment-notice payment-notice-pending">
      <div class="payment-notice-title">Payment acknowledgement — payment pending</div>
      <p class="payment-notice-line"><strong>Bill total:</strong> ₹${totalStr}</p>
      <p class="payment-notice-line"><strong>Amount received:</strong> ₹0</p>
      <p class="payment-notice-line"><strong>Balance due:</strong> ₹${balanceStr}</p>
      ${dueDateLine}
      <p class="payment-notice-legal">${legal}</p>
    </div>
  `;
}

export function buildInvoicePaymentNoticeHtml(input: {
  paymentStatus?: string | null;
  totalAmount: number;
  amountPaid?: number | null;
  paymentDueDate?: string | null;
}): string {
  const payment = resolveDocumentPayment(input);
  if (payment.status === 'PAID') return '';

  const totalStr = formatInrAmount(payment.total);
  const paidStr = formatInrAmount(payment.paid);
  const balanceStr = formatInrAmount(payment.balance);
  const dueDateLine = paymentDueDateLineHtml(input.paymentDueDate);
  const legal = buildDocumentPaymentLegalText({
    ...payment,
    paymentDueDate: input.paymentDueDate,
    documentKind: 'invoice',
  });

  if (payment.status === 'PARTIAL') {
    return `
      <div class="payment-notice payment-notice-partial">
        <div class="payment-notice-title">Payment acknowledgement — partial payment</div>
        <p class="payment-notice-line"><strong>Invoice value:</strong> ₹${totalStr}</p>
        <p class="payment-notice-line"><strong>Amount received:</strong> ₹${paidStr}</p>
        <p class="payment-notice-line"><strong>Balance due:</strong> ₹${balanceStr}</p>
        ${dueDateLine}
        <p class="payment-notice-legal">${legal}</p>
      </div>
    `;
  }

  return `
    <div class="payment-notice payment-notice-pending">
      <div class="payment-notice-title">Payment acknowledgement — payment pending</div>
      <p class="payment-notice-line"><strong>Invoice value:</strong> ₹${totalStr}</p>
      <p class="payment-notice-line"><strong>Amount received:</strong> ₹0</p>
      <p class="payment-notice-line"><strong>Balance due:</strong> ₹${balanceStr}</p>
      ${dueDateLine}
      <p class="payment-notice-legal">${legal}</p>
    </div>
  `;
}

/** AMC agreement payment acknowledgement — same legal tone as bill/invoice. */
export function buildAmcDocumentPaymentNoticeHtml(input: {
  paymentStatus?: string | null;
  totalAmount: number;
  amountPaid?: number | null;
  paymentDueDate?: string | null;
}): string {
  const payment = resolveDocumentPayment(input);
  if (payment.status === 'PAID') return '';

  const totalStr = formatInrAmount(payment.total);
  const paidStr = formatInrAmount(payment.paid);
  const balanceStr = formatInrAmount(payment.balance);
  const dueDateLine = paymentDueDateLineHtml(input.paymentDueDate);
  const legal = buildDocumentPaymentLegalText({
    ...payment,
    paymentDueDate: input.paymentDueDate,
    documentKind: 'agreement',
  });

  if (payment.status === 'PARTIAL') {
    return `
      <div class="payment-notice payment-notice-partial">
        <div class="payment-notice-title">Payment acknowledgement — partial payment</div>
        <p class="payment-notice-line"><strong>Total AMC agreement amount (all taxes inclusive):</strong> ₹${totalStr}</p>
        <p class="payment-notice-line"><strong>Amount received as on agreement date:</strong> ₹${paidStr}</p>
        <p class="payment-notice-line"><strong>Balance amount due:</strong> ₹${balanceStr}</p>
        ${dueDateLine}
        <p class="payment-notice-legal">${legal}</p>
      </div>
    `;
  }

  return `
    <div class="payment-notice payment-notice-pending">
      <div class="payment-notice-title">Payment acknowledgement — payment pending</div>
      <p class="payment-notice-line"><strong>Total AMC agreement amount (all taxes inclusive):</strong> ₹${totalStr}</p>
      <p class="payment-notice-line"><strong>Amount received as on agreement date:</strong> ₹0</p>
      <p class="payment-notice-line"><strong>Balance amount due:</strong> ₹${balanceStr}</p>
      ${dueDateLine}
      <p class="payment-notice-legal">${legal}</p>
    </div>
  `;
}

export function buildInvoicePaymentSummaryRowsHtml(input: {
  paymentStatus?: string | null;
  totalAmount: number;
  amountPaid?: number | null;
}): string {
  return paymentMetaRowsHtml(resolveDocumentPayment(input));
}
