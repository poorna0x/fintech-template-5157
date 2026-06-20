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
import { getDefaultDocumentMessage } from '@/lib/admin-email-templates';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import {
  isValidEmailFormat,
  normalizeRecipientList,
  parseEmailListInput,
} from '@/lib/email-recipients';
import type { Bill } from '@/types';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  getAmcEmailSuccessMessage,
  sendAmcAgreementEmail,
} from '@/lib/send-amc-agreement-email';
import { supabase } from '@/lib/supabaseClient';
import type { AMCPDFOptions } from '@/lib/amc-pdf-generator';

export type AmcPersistResult = { ok: boolean; error?: string };

export interface AmcEmailSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: Bill | null;
  brand: DocumentBrand | null;
  endDateIso: string;
  /** Pre-filled recipient(s), e.g. customer email */
  defaultRecipients?: string[];
  pdfOptions?: AMCPDFOptions;
  /** Save AMC to DB after email sends successfully */
  onPersistAfterEmail?: (recipients: string[]) => Promise<AmcPersistResult>;
  onSent?: () => void;
}

function emptyRow(): string {
  return '';
}

async function resolveAccessToken(): Promise<string | null> {
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export default function AmcEmailSendDialog({
  open,
  onOpenChange,
  bill,
  brand,
  endDateIso,
  defaultRecipients = [],
  pdfOptions,
  onPersistAfterEmail,
  onSent,
}: AmcEmailSendDialogProps) {
  const [recipientRows, setRecipientRows] = useState<string[]>([emptyRow()]);
  const [message, setMessage] = useState(() => getDefaultDocumentMessage('amc_document'));
  const [sending, setSending] = useState(false);
  const [pasteValue, setPasteValue] = useState('');

  useEffect(() => {
    if (!open) return;
    const seeded = normalizeRecipientList(defaultRecipients);
    setRecipientRows(seeded.length ? seeded : [emptyRow()]);
    setMessage(getDefaultDocumentMessage('amc_document'));
    setPasteValue('');
  }, [open, defaultRecipients]);

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

  const handlePasteAdd = () => {
    const parsed = parseEmailListInput(pasteValue);
    if (!parsed.length) {
      toast.error('Paste one or more email addresses separated by commas');
      return;
    }
    setRecipientRows((prev) => {
      const merged = normalizeRecipientList([...prev, ...parsed]);
      return merged.length ? merged : [emptyRow()];
    });
    setPasteValue('');
  };

  const handleSend = async () => {
    if (!bill || !brand) {
      toast.error('Agreement details are missing');
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
    const toastId = toast.loading(
      recipients.length > 1
        ? `Generating PDF and sending to ${recipients.length} recipients…`
        : 'Generating PDF and sending email…'
    );

    try {
      const accessToken = await resolveAccessToken();
      if (!accessToken) {
        toast.error('Session expired. Please sign in again.', { id: toastId });
        return;
      }

      const result = await sendAmcAgreementEmail({
        bill,
        brand,
        recipientEmails: recipients,
        accessToken,
        endDateIso,
        pdfOptions,
        customMessage: message.trim() || undefined,
      });

      if (!result.ok) {
        toast.error(result.error || 'Could not send email', { id: toastId });
        return;
      }

      if (onPersistAfterEmail) {
        toast.loading('Saving AMC to database…', { id: toastId });
        const saved = await onPersistAfterEmail(recipients);
        if (!saved.ok) {
          toast.warning('Email sent, but AMC could not be saved', {
            id: toastId,
            description: saved.error || 'Try downloading AMC to save again',
          });
          onSent?.();
          onOpenChange(false);
          return;
        }
      }

      toast.success(getAmcEmailSuccessMessage(brand, recipients), { id: toastId });
      onSent?.();
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send email';
      toast.error('Could not send AMC email', { id: toastId, description: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] sm:w-full max-h-[min(90vh,720px)] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b bg-violet-50/80">
          <DialogTitle className="text-base sm:text-lg text-violet-950 pr-8">
            Email AMC agreement
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-violet-900/80">
            {brandLabel
              ? `PDF attached · sent from ${brandLabel}`
              : 'PDF will be attached to each message'}
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
                {endDateIso ? ` · valid until ${endDateIso}` : null}
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

            <div className="flex flex-col sm:flex-row gap-2">
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

            <div className="rounded-lg border border-dashed p-3 space-y-2 bg-white">
              <Label htmlFor="amc-email-paste" className="text-xs text-muted-foreground">
                Or paste multiple (comma separated)
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="amc-email-paste"
                  placeholder="a@x.com, b@y.com"
                  value={pasteValue}
                  onChange={(e) => setPasteValue(e.target.value)}
                  className="h-9 min-w-0 flex-1"
                  disabled={sending}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={handlePasteAdd}
                  disabled={sending || !pasteValue.trim()}
                >
                  Add all
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amc-email-message" className="text-sm font-medium">
              Email message
            </Label>
            <Textarea
              id="amc-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="min-h-[96px] resize-y text-sm"
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground">
              Uses the standard AMC email template. Edit the message above if needed.
            </p>
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
            className="w-full sm:w-auto bg-violet-700 hover:bg-violet-800"
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
                Send{normalizedRecipients.length > 1 ? ` (${normalizedRecipients.length})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
