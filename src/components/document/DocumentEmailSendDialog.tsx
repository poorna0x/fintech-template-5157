import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { getDefaultDocumentMessage, type AdminEmailTemplateType } from '@/lib/admin-email-templates';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import { isValidEmailFormat, normalizeRecipientList } from '@/lib/email-recipients';
import type { Bill } from '@/types';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  getGeneratorDocumentEmailSuccessMessage,
  sendGeneratorDocumentEmail,
  type GeneratorDocumentEmailKind,
} from '@/lib/send-generator-document-email';
import { forceLightThemeClass } from '@/lib/force-light-theme';
import type { DocumentGeneratorAccent } from '@/components/DocumentGeneratorPageHeader';

const KIND_META: Record<
  GeneratorDocumentEmailKind,
  {
    title: string;
    templateType: AdminEmailTemplateType;
    accent: DocumentGeneratorAccent;
    sendBtnClass: string;
    headerClass: string;
    titleClass: string;
    descClass: string;
  }
> = {
  service_bill: {
    title: 'Email service bill',
    templateType: 'service_bill',
    accent: 'green',
    sendBtnClass: 'bg-emerald-700 hover:bg-emerald-800',
    headerClass: 'border-b bg-emerald-50/80',
    titleClass: 'text-emerald-950',
    descClass: 'text-emerald-900/80',
  },
  quotation: {
    title: 'Email quotation',
    templateType: 'quotation',
    accent: 'green',
    sendBtnClass: 'bg-emerald-700 hover:bg-emerald-800',
    headerClass: 'border-b bg-emerald-50/80',
    titleClass: 'text-emerald-950',
    descClass: 'text-emerald-900/80',
  },
  invoice: {
    title: 'Email tax invoice',
    templateType: 'invoice',
    accent: 'blue',
    sendBtnClass: 'bg-blue-700 hover:bg-blue-800',
    headerClass: 'border-b bg-blue-50/80',
    titleClass: 'text-blue-950',
    descClass: 'text-blue-900/80',
  },
};

export interface DocumentEmailSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: GeneratorDocumentEmailKind;
  bill: Bill | null;
  brand: DocumentBrand | null;
  defaultRecipients?: string[];
  dueDateIso?: string;
  onSent?: () => void;
}

function emptyRow(): string {
  return '';
}

export default function DocumentEmailSendDialog({
  open,
  onOpenChange,
  kind,
  bill,
  brand,
  defaultRecipients = [],
  dueDateIso,
  onSent,
}: DocumentEmailSendDialogProps) {
  const meta = KIND_META[kind];
  const [recipientRows, setRecipientRows] = useState<string[]>([emptyRow()]);
  const [message, setMessage] = useState(() => getDefaultDocumentMessage(meta.templateType));
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seeded = normalizeRecipientList(defaultRecipients);
    setRecipientRows(seeded.length ? seeded : [emptyRow()]);
    setMessage(getDefaultDocumentMessage(meta.templateType));
  }, [open, defaultRecipients, meta.templateType]);

  const normalizedRecipients = useMemo(
    () => normalizeRecipientList(recipientRows),
    [recipientRows]
  );

  const brandLabel = brand ? getDocumentBrandLabel(brand) : '';

  const updateRow = (index: number, value: string) => {
    setRecipientRows((prev) => prev.map((row, i) => (i === index ? value : row)));
  };

  const removeRow = (index: number) => {
    setRecipientRows((prev) => {
      if (prev.length <= 1) return [emptyRow()];
      return prev.filter((_, i) => i !== index);
    });
  };

  const addRow = () => {
    setRecipientRows((prev) => [...prev, emptyRow()]);
  };

  const handleSend = async () => {
    if (!bill || !brand) {
      toast.error('Document details are missing');
      return;
    }

    const recipients = normalizeRecipientList(recipientRows);
    if (!recipients.length) {
      toast.error('Add at least one valid email address');
      return;
    }

    const invalid = recipientRows
      .map((r) => r.trim())
      .filter((r) => r && !isValidEmailFormat(r));
    if (invalid.length) {
      toast.error(`Invalid email: ${invalid[0]}`);
      return;
    }

    setSending(true);
    const toastId = toast.loading('Generating PDF and sending email…');

    try {
      const sessionReady = await ensureSupabaseSessionForWrite();
      if (!sessionReady.ok) {
        toast.error('Could not refresh your session. Please try again in a moment.', {
          id: toastId,
        });
        return;
      }

      const result = await sendGeneratorDocumentEmail({
        kind,
        bill,
        brand,
        recipientEmails: recipients,
        dueDateIso,
        customMessage: message.trim() || undefined,
      });

      if (!result.ok) {
        toast.error(result.error || 'Could not send email', { id: toastId });
        return;
      }

      toast.success(getGeneratorDocumentEmailSuccessMessage(kind, brand, recipients), {
        id: toastId,
      });
      onSent?.();
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send email';
      toast.error('Could not send email', { id: toastId, description: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent
        dismissible={false}
        className={forceLightThemeClass(
          'max-w-lg w-[calc(100vw-1.5rem)] sm:w-full max-h-[min(90vh,720px)] overflow-y-auto p-0 gap-0'
        )}
      >
        <DialogHeader className={`px-4 sm:px-6 pt-5 pb-3 ${meta.headerClass}`}>
          <DialogTitle className={`text-base sm:text-lg pr-8 ${meta.titleClass}`}>
            {meta.title}
          </DialogTitle>
          <DialogDescription className={`text-xs sm:text-sm ${meta.descClass}`}>
            {brandLabel
              ? `PDF attached · sent from ${brandLabel}`
              : 'PDF will be attached to the email'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          {bill ? (
            <div className="rounded-lg border bg-slate-50 px-3 py-2.5 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{bill.customer.name}</span>
                <Badge variant="secondary" className="text-xs font-normal">
                  {bill.billNumber}
                </Badge>
              </div>
              <p className="text-xs text-slate-600">
                ₹{bill.totalAmount.toLocaleString('en-IN')}
                {dueDateIso ? ` · ${dueDateIso}` : null}
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Recipients</Label>
              <span className="text-xs text-muted-foreground">
                {normalizedRecipients.length} valid
              </span>
            </div>

            <div className="space-y-2">
              {recipientRows.map((row, index) => (
                <div key={`recipient-${index}`} className="flex gap-2">
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={row}
                    onChange={(e) => updateRow(index, e.target.value)}
                    className="h-10 min-w-0 flex-1"
                    disabled={sending}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => removeRow(index)}
                    disabled={sending || recipientRows.length <= 1}
                    aria-label="Remove recipient"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 justify-center"
              onClick={addRow}
              disabled={sending}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add email
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-email-message" className="text-sm font-medium">
              Email message
            </Label>
            <Textarea
              id="doc-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="min-h-[96px] resize-y text-sm"
              disabled={sending}
            />
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t bg-slate-50/80 flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={`w-full sm:w-auto ${meta.sendBtnClass}`}
            onClick={() => void handleSend()}
            disabled={sending || !bill || !brand || !normalizedRecipients.length}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
