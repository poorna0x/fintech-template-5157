import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import { Phone, PhoneOff, PhoneForwarded, Search, X, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { IncomingAutoSearchRecord } from '@/lib/adminSharedIncomingCall';
import { sendMissedCallCallbackWhatsApp } from '@/lib/missedCallWhatsApp';

function formatPhone(raw?: string): string {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length >= 10) return d.slice(-10);
  return String(raw || '').trim();
}

export function describeCallAlertContext(record: IncomingAutoSearchRecord): {
  title: string;
  detail: string;
  tone: 'amber' | 'sky' | 'slate';
} {
  const tech = record.techName?.trim() || 'Technician';
  const used = formatPhone(record.fromNumber);
  const company = formatPhone(record.companyPhone);

  if (record.kind === 'wrong_line_call') {
    return {
      title: `${tech} called a customer on the wrong number`,
      detail: [
        used ? `Used ${used}` : 'Used a non-company line',
        company ? `Company line ${company}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: 'amber',
    };
  }
  if (record.kind === 'tech_search') {
    return {
      title: `${tech} searched customers`,
      detail: `Query: ${record.phone}`,
      tone: 'slate',
    };
  }
  if (record.kind === 'missed_call') {
    return {
      title: `${tech} missed a customer call`,
      detail: `Caller ${formatPhone(record.phone) || record.phone}`,
      tone: 'amber',
    };
  }
  return {
    title: `${tech} got a call from a customer`,
    detail: `Caller ${formatPhone(record.phone) || record.phone}`,
    tone: 'sky',
  };
}

type Props = {
  record: IncomingAutoSearchRecord;
  onDismiss: () => void;
};

export function AdminCallAlertContextBanner({ record, onDismiss }: Props) {
  const { cloudApiOn } = useWhatsAppCloudApiGate('calling');
  const { title, detail, tone } = describeCallAlertContext(record);
  const [sendingWa, setSendingWa] = useState(false);
  const Icon =
    record.kind === 'wrong_line_call'
      ? PhoneForwarded
      : record.kind === 'missed_call'
        ? PhoneOff
        : record.kind === 'tech_search'
          ? Search
          : Phone;

  const shell =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : tone === 'sky'
        ? 'border-sky-200 bg-sky-50 text-sky-950'
        : 'border-slate-200 bg-slate-50 text-slate-900';

  const showMissedWa = record.kind === 'missed_call' && Boolean(record.phone);

  const handleMissedWa = async () => {
    if (!record.phone || sendingWa) return;
    setSendingWa(true);
    try {
      await sendMissedCallCallbackWhatsApp({
        phone: record.phone,
        customerId: record.customerId || null,
      });
    } finally {
      setSendingWa(false);
    }
  };

  return (
    <div
      className={`mb-4 flex items-start gap-3 rounded-lg border px-3 py-2.5 ${shell}`}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        {detail ? <p className="mt-0.5 text-xs opacity-80">{detail}</p> : null}
      </div>
      {showMissedWa && cloudApiOn ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 border-emerald-300 bg-white px-2 text-emerald-800 hover:bg-emerald-50"
          disabled={sendingWa}
          onClick={() => void handleMissedWa()}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {sendingWa ? 'Sending…' : 'WhatsApp callback'}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 px-2 opacity-70 hover:opacity-100"
        onClick={onDismiss}
        aria-label="Dismiss alert context"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
