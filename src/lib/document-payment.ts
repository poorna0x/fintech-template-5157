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
}): string {
  const payment = resolveDocumentPayment(input);
  if (payment.status === 'PAID') return '';

  const totalStr = formatInrAmount(payment.total);
  const paidStr = formatInrAmount(payment.paid);
  const balanceStr = formatInrAmount(payment.balance);

  if (payment.status === 'PARTIAL') {
    return `
      <div class="payment-notice payment-notice-partial">
        <div class="payment-notice-title">Payment acknowledgement — partial payment</div>
        <p class="payment-notice-line"><strong>Bill total:</strong> ₹${totalStr}</p>
        <p class="payment-notice-line"><strong>Amount received:</strong> ₹${paidStr}</p>
        <p class="payment-notice-line"><strong>Balance due:</strong> ₹${balanceStr}</p>
        <p class="payment-notice-legal">The customer acknowledges that only part of the bill amount has been received. The outstanding balance remains payable on demand.</p>
      </div>
    `;
  }

  return `
    <div class="payment-notice payment-notice-pending">
      <div class="payment-notice-title">Payment acknowledgement — payment pending</div>
      <p class="payment-notice-line"><strong>Bill total:</strong> ₹${totalStr}</p>
      <p class="payment-notice-line"><strong>Amount received:</strong> ₹0</p>
      <p class="payment-notice-line"><strong>Balance due:</strong> ₹${balanceStr}</p>
      <p class="payment-notice-legal">This bill is issued with payment pending. The full amount is due as stated above.</p>
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
  let dueDateLine = '';
  if (input.paymentDueDate) {
    try {
      const formatted = new Date(input.paymentDueDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      dueDateLine = `<p class="payment-notice-line"><strong>Payment due date:</strong> ${formatted}</p>`;
    } catch {
      /* ignore invalid dates */
    }
  }

  if (payment.status === 'PARTIAL') {
    return `
      <div class="payment-notice payment-notice-partial">
        <div class="payment-notice-title">Payment acknowledgement — partial payment</div>
        <p class="payment-notice-line"><strong>Invoice value:</strong> ₹${totalStr}</p>
        <p class="payment-notice-line"><strong>Amount received:</strong> ₹${paidStr}</p>
        <p class="payment-notice-line"><strong>Balance due:</strong> ₹${balanceStr}</p>
        ${dueDateLine}
        <p class="payment-notice-legal">This tax invoice records that only part of the invoice value has been received. The balance remains payable by the customer.</p>
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
      <p class="payment-notice-legal">This tax invoice is issued with payment pending. The full invoice value is due as stated above.</p>
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
