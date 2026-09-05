import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { format } from 'date-fns';
import { Check, ChevronsUpDown, Edit3, FileText, ImagePlus, Loader2, PhoneCall, Plus, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Customer, Reminder, Technician } from '@/types';
import { db, supabase, REMINDER_ROW_COLUMNS } from '@/lib/supabase';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import {
  openWhatsAppMeDeepLink,
  readFileAsBase64,
  sendAdminWhatsAppCtaUrl,
  sendAdminWhatsAppMedia,
  sendAdminWhatsAppTemplate,
  sendAdminWhatsAppText,
  sendAdminWhatsAppTextWithOptionalTemplate,
  validateWhatsAppAttachFile,
} from '@/lib/sendAdminWhatsAppApi';
import { resolveColdPaymentReceived } from '@/lib/whatsappUtilityTemplates';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { useWhatsAppCloudApiGate } from '@/hooks/useWhatsAppCloudApiGate';
import CustomerReportDialog from '@/components/admin/CustomerReportDialog';
import PhotoViewerDialog from '@/components/admin/PhotoViewerDialog';
import { useSuspendDialogForPhotoViewer } from '@/lib/suspendDialogForPhotoViewer';
import UpiPaymentAccountsManager from '@/components/UpiPaymentAccountsManager';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PENDING_PAYMENT_REMINDER_TITLE,
  parseReminderAtLocalDate,
  buildPendingPaymentWhatsAppMessage,
  buildPendingPaymentOverdueWhatsAppMessage,
  buildPendingPaymentReceivedWhatsAppMessage,
  buildPendingPaymentLetterBodyParams,
  buildPendingPaymentLetterButtonUrlParams,
  resolvePendingPaymentLetterTemplateName,
  resolvePendingPaymentLetterImageTemplateName,
  resolvePendingPaymentOverdueTemplateName,
  isPendingPaymentPastDueForOverdueNotice,
  parsePendingPaymentReminderNotes,
  formatPendingPaymentDueLabel,
  resolvePendingPaymentMessageBrand,
} from '@/lib/pendingPaymentReminder';
import { markPendingPaymentSettledInRequirements } from '@/lib/jobPendingPayment';
import type { DocumentBrand } from '@/lib/service-brands';
import { normalizeDocumentBrand } from '@/lib/service-brands';
import {
  buildPendingPaymentUpiShare,
  fetchUpiPaymentAccounts,
  loadUpiPaymentAccounts,
  resolvePreferredUpiAccount,
  setLastSelectedUpiAccountId,
  type UpiPaymentAccount,
} from '@/lib/upiPaymentAccounts';
import { generateUpiQrPngBase64 } from '@/lib/generateUpiQrPng';

const PENDING_PAYMENT_TITLE = PENDING_PAYMENT_REMINDER_TITLE;
const PAGE_SIZE = 20;

type PendingPaymentReminder = Reminder & {
  amount_pending: number;
  note?: string;
  job_id?: string;
  job_number?: string;
};

type CustomerLabel = {
  id: string;
  name: string;
  customerId: string;
  phone?: string;
  alternatePhone?: string;
};

function getCustomerLabelFromRow(c: any): CustomerLabel {
  return {
    id: c.id,
    name: c.full_name || c.fullName || 'Customer',
    customerId: c.customer_id || c.customerId || c.id?.slice?.(0, 8) || '',
    phone: c.phone ?? c.customer_phone ?? undefined,
    alternatePhone: c.alternate_phone ?? c.alternatePhone ?? undefined,
  };
}

function PendingPaymentFormDialogV2({
  open,
  onOpenChange,
  editReminder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editReminder: Reminder | null;
  onSaved: () => void;
}) {
  const isEdit = !!editReminder?.id;

  const [customerId, setCustomerId] = useState<string>('');
  const [customerLabel, setCustomerLabel] = useState<CustomerLabel | null>(null);

  const [amountStr, setAmountStr] = useState<string>('');
  const [noteStr, setNoteStr] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(() => format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));

  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [saveConfirmBusy, setSaveConfirmBusy] = useState(false);
  const [savePayload, setSavePayload] = useState<{
    mode: 'create' | 'update';
    reminderId?: string;
    customerId?: string;
    reminderAt: string;
    parsedAmount: number;
    note: string | null;
  } | null>(null);

  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerLabel[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [hasAttemptedCustomerSearch, setHasAttemptedCustomerSearch] = useState(false);

  useEffect(() => {
    if (!open) return;

    // Reset search UI state every time we open.
    setCustomerSearchOpen(false);
    setCustomerQuery('');
    setCustomerResults([]);
    setCustomerLoading(false);
    setHasAttemptedCustomerSearch(false);
    setSaveConfirmOpen(false);
    setSaveConfirmBusy(false);
    setSavePayload(null);

    if (isEdit && editReminder) {
      const nextCustomerId = (editReminder.entity_id as string) ?? '';
      setCustomerId(nextCustomerId);
      const parsed = parsePendingPaymentReminderNotes(editReminder.notes);
      setAmountStr(() => (parsed.amount_pending ? String(parsed.amount_pending) : ''));
      setNoteStr(parsed.note ?? '');
      setDueDate(
        editReminder.reminder_at ? String(editReminder.reminder_at) : format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')
      );
      // Fetch label for just the selected customer (avoid loading all customers).
      (async () => {
        if (!nextCustomerId) return;
        const { data, error } = await db.customers.getById(nextCustomerId);
        if (error) return;
        if (data) setCustomerLabel(getCustomerLabelFromRow(data));
      })();
    } else {
      setCustomerId('');
      setCustomerLabel(null);
      setAmountStr('');
      setNoteStr('');
      setDueDate(format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));
    }
  }, [open, isEdit, editReminder]);

  const handleCustomerSearch = async () => {
    const q = customerQuery.trim();
    if (!q) {
      setCustomerResults([]);
      setHasAttemptedCustomerSearch(false);
      return;
    }
    setHasAttemptedCustomerSearch(true);
    setCustomerLoading(true);
    try {
      const { data, error } = await db.customers.searchSlim(q, 20);
      if (error) throw error;
      setCustomerResults((data || []).map(getCustomerLabelFromRow));
    } catch (err: any) {
      setCustomerResults([]);
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedAmount = Number(String(amountStr).replace(/[^0-9.-]/g, ''));
    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Please enter a valid pending amount');
      return;
    }
    if (!dueDate) {
      toast.error('Please select a due date');
      return;
    }

    setSavePayload({
      mode: isEdit && editReminder ? 'update' : 'create',
      reminderId: isEdit && editReminder ? editReminder.id : undefined,
      customerId: isEdit && editReminder ? undefined : customerId,
      reminderAt: dueDate,
      parsedAmount,
      note: noteStr.trim() || null,
    });
    setSaveConfirmOpen(true);
  };

  const confirmSave = async () => {
    if (!savePayload) return;
    setSaveConfirmBusy(true);
    try {
      if (savePayload.mode === 'update' && savePayload.reminderId) {
        const existing = parsePendingPaymentReminderNotes(editReminder?.notes);
        const notesPayload: Record<string, unknown> = {
          amount_pending: savePayload.parsedAmount,
          note: savePayload.note,
        };
        if (existing.job_id) notesPayload.job_id = existing.job_id;
        if (existing.job_number) notesPayload.job_number = existing.job_number;
        const { error } = await db.reminders.update(savePayload.reminderId, {
          title: PENDING_PAYMENT_TITLE,
          notes: JSON.stringify(notesPayload),
          reminder_at: savePayload.reminderAt,
        });
        if (error) throw new Error(error.message);
        toast.success('Pending payment updated');
      } else {
        const { error } = await db.reminders.create({
          entity_type: 'customer',
          entity_id: savePayload.customerId ?? null,
          title: PENDING_PAYMENT_TITLE,
          notes: JSON.stringify({
            amount_pending: savePayload.parsedAmount,
            note: savePayload.note,
          }),
          reminder_at: savePayload.reminderAt,
        });
        if (error) throw new Error(error.message);
        toast.success('Pending payment added');
      }
      onSaved();
      setSaveConfirmOpen(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save pending payment');
    } finally {
      setSaveConfirmBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            {isEdit ? 'Edit pending payment' : 'Add pending payment'}
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            Add customer, pending amount, and due date. Mark as completed when received.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Customer *</Label>
            {isEdit ? (
              <div className="flex items-center gap-3 border rounded-lg p-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{customerLabel?.name ?? 'Customer'}</div>
                  <div className="text-xs text-muted-foreground truncate">{customerLabel?.customerId ?? ''}</div>
                </div>
              </div>
            ) : (
              <div>
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-10"
                      aria-expanded={customerSearchOpen}
                    >
                      <span className="truncate">{customerLabel ? customerLabel.name : 'Select customer'}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
                    align="start"
                    sideOffset={4}
                  >
                    <Command shouldFilter={false}>
                      <div className="p-3 pb-2">
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Search customer by name, ID, or phone..."
                            value={customerQuery}
                            onChange={(e) => setCustomerQuery(e.target.value)}
                            className="h-10"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={handleCustomerSearch}
                            disabled={customerLoading}
                            title="Search"
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <CommandList className="max-h-[340px]">
                        <CommandEmpty>
                          {customerLoading
                            ? 'Searching...'
                            : hasAttemptedCustomerSearch
                              ? 'No customers match.'
                              : 'Type and click search.'}
                        </CommandEmpty>
                        <CommandGroup>
                          {customerResults.slice(0, 20).map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setCustomerId(c.id);
                                setCustomerLabel(c);
                                setCustomerSearchOpen(false);
                                setCustomerQuery('');
                                setCustomerResults([]);
                                setHasAttemptedCustomerSearch(false);
                              }}
                              className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted"
                            >
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <div className="text-sm font-medium truncate">{c.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{c.customerId}</div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pending-amount">Pending amount *</Label>
            <Input
              id="pending-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="e.g. 2500"
              className="min-h-9"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pending-note">Note (optional)</Label>
            <Input
              id="pending-note"
              value={noteStr}
              onChange={(e) => setNoteStr(e.target.value)}
              placeholder="e.g. Service payment, AMC pending..."
              className="min-h-9"
            />
          </div>

          <div className="space-y-2">
            <Label>Due date *</Label>
            <DatePicker
              value={dueDate || undefined}
              onChange={(v) => setDueDate(v || '')}
              placeholder="Pick due date"
              className="w-full"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-9 w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" className="min-h-9 w-full sm:w-auto">
              {isEdit ? 'Save changes' : 'Add pending payment'}
            </Button>
          </div>
        </form>

        <AlertDialog
          open={saveConfirmOpen}
          onOpenChange={(o) => {
            setSaveConfirmOpen(o);
            if (!o) setSavePayload(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isEdit ? 'Save changes?' : 'Add pending payment?'}</AlertDialogTitle>
              <AlertDialogDescription>
                This will {isEdit ? 'update' : 'create'} the pending payment entry for the selected customer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                onClick={confirmSave}
                disabled={saveConfirmBusy}
              >
                {saveConfirmBusy ? 'Saving...' : 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPendingPaymentsDialogV2({
  open,
  onOpenChange,
  initialAction = 'list',
  initialReminderId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAction?: 'list' | 'add' | 'whatsapp';
  initialReminderId?: string | null;
}) {
  const { cloudApiOn } = useWhatsAppCloudApiGate('pending_payment');
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [payments, setPayments] = useState<PendingPaymentReminder[]>([]);
  const [customerLabels, setCustomerLabels] = useState<Record<string, CustomerLabel>>({});

  const [searchQuery, setSearchQuery] = useState('');

  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappTarget, setWhatsappTarget] = useState<PendingPaymentReminder | null>(null);
  const [upiAccounts, setUpiAccounts] = useState<UpiPaymentAccount[]>(() => loadUpiPaymentAccounts());
  /** Which UPI account to use when include-UPI is on. */
  const [whatsappUpiAccountId, setWhatsappUpiAccountId] = useState<string>('');
  /** Checkbox: include UPI ID + pay link in the WhatsApp message. */
  const [whatsappIncludeUpi, setWhatsappIncludeUpi] = useState(true);
  /** When due date has passed: send overdue notice (warranty/agreements void) instead of normal reminder. */
  const [whatsappUseOverdueNotice, setWhatsappUseOverdueNotice] = useState(false);
  const [whatsappManageUpiOpen, setWhatsappManageUpiOpen] = useState(false);
  const [whatsappDraftMessage, setWhatsappDraftMessage] = useState('');
  const [whatsappDraftLoading, setWhatsappDraftLoading] = useState(false);
  /** Short /p/… link for Pay now button (not always inlined in draft when ctaButton). */
  const [whatsappPayHttpsLink, setWhatsappPayHttpsLink] = useState<string | null>(null);
  /** Optional image (QR / receipt) for IMAGE-header cold template or 24h media send. */
  const [whatsappAttachImage, setWhatsappAttachImage] = useState<{
    base64: string;
    mimeType: string;
    filename: string;
    previewUrl: string;
  } | null>(null);
  /** auto = dynamic UPI QR; manual = user photo; off = cleared / no QR. */
  const [whatsappQrMode, setWhatsappQrMode] = useState<'auto' | 'manual' | 'off'>('auto');
  const [whatsappQrGenerating, setWhatsappQrGenerating] = useState(false);
  const whatsappImageInputRef = useRef<HTMLInputElement | null>(null);
  /** Last completed job service_brand per customer — drives WhatsApp brand contact. */
  const [brandByCustomerId, setBrandByCustomerId] = useState<Record<string, DocumentBrand | null>>({});

  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<PendingPaymentReminder | null>(null);

  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [completeConfirmBusy, setCompleteConfirmBusy] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<PendingPaymentReminder | null>(null);
  const [offerWhatsAppAfterComplete, setOfferWhatsAppAfterComplete] = useState(true);

  const [postCompleteWhatsappOpen, setPostCompleteWhatsappOpen] = useState(false);
  const [postCompleteWhatsappTarget, setPostCompleteWhatsappTarget] = useState<PendingPaymentReminder | null>(null);
  /** Captured before reload — `load()` drops completed customers from `customerLabels`. */
  const [postCompleteCustomerLabel, setPostCompleteCustomerLabel] = useState<CustomerLabel | null>(null);
  /** True while Cloud API / template send is in flight (pending or payment-received dialogs). */
  const [whatsappSending, setWhatsappSending] = useState(false);

  const [highlightReminderId, setHighlightReminderId] = useState<string | null>(null);
  const deepLinkHandledRef = useRef<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [customerActionOpen, setCustomerActionOpen] = useState(false);
  const [customerActionTarget, setCustomerActionTarget] = useState<PendingPaymentReminder | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportCustomer, setReportCustomer] = useState<Customer | null>(null);
  const [reportTechnicians, setReportTechnicians] = useState<Technician[]>([]);
  const [reportOpening, setReportOpening] = useState(false);
  const [reportPhotoViewerOpen, setReportPhotoViewerOpen] = useState(false);
  const {
    openSuspendedViewer,
    closeSuspendedViewer,
    ignoreParentDismissWhileSuspended,
  } = useSuspendDialogForPhotoViewer();
  const [reportSelectedPhoto, setReportSelectedPhoto] = useState<{
    url: string;
    index: number;
    total: number;
  } | null>(null);
  const [reportSelectedBillPhotos, setReportSelectedBillPhotos] = useState<string[] | null>(null);
  const reportTechsLoadedRef = useRef(false);

  const openWhatsApp = async (
    phone: string,
    message: string,
    opts?: {
      customerName?: string;
      amount?: number;
      customerId?: string | null;
      dueDateYmd?: string | null;
      invoiceRef?: string | null;
      brand?: DocumentBrand | string | null;
      /** Use pending_payment Meta template when 24h window is closed (default true). */
      coldPendingTemplate?: boolean;
      /** Cold Meta template when 24h window is closed (default pending_payment). */
      coldTemplateKind?: 'pending_payment' | 'payment_overdue' | 'payment_received';
      /** When true, keep the pay link in the message (wa.me fallback if window closed). */
      includePayLink?: boolean;
      /** UPI pay HTTPS link — used for cold Pay now button (v4 template). */
      payHttpsLink?: string | null;
      /** Optional image for IMAGE-header cold template or 24h media+caption. */
      headerImage?: {
        imageBase64: string;
        filename?: string;
        mimeType?: string;
      } | null;
    }
  ): Promise<boolean> => {
    if (!phone) return false;
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error('Message is empty');
      return false;
    }

    setWhatsappSending(true);
    try {
      // Cloud API kill switch: still open phone WhatsApp like pre-API CRM.
      if (!cloudApiOn) {
        openWhatsAppMeDeepLink(phone, trimmed);
        toast.success('Opened phone WhatsApp');
        return true;
      }

      const payHttpsLink =
        opts?.payHttpsLink ||
        (() => {
          const m = trimmed.match(/https?:\/\/[^\s]+\/p\/[a-zA-Z0-9]+/i);
          return m?.[0] || null;
        })();
      const payButtonParams = buildPendingPaymentLetterButtonUrlParams(payHttpsLink);

      const hasPayLink =
        opts?.includePayLink === true ||
        Boolean(payHttpsLink) ||
        /https?:\/\/[^\s]+/i.test(trimmed);

      const brand = resolvePendingPaymentMessageBrand(opts?.brand);
      // Only when Pending Payments checkbox chose overdue notice (not merely past due date).
      const isOverdue = opts?.coldTemplateKind === 'payment_overdue';
      const headerImage = opts?.headerImage?.imageBase64
        ? {
            imageBase64: opts.headerImage.imageBase64,
            filename: opts.headerImage.filename || 'image.jpg',
            mimeType: opts.headerImage.mimeType || 'image/jpeg',
          }
        : null;
      const letterBodyParams = buildPendingPaymentLetterBodyParams(
        opts?.customerName || 'Customer',
        opts?.amount ?? 0,
        opts?.dueDateYmd,
        opts?.invoiceRef
      );
      const overdueTemplateName = resolvePendingPaymentOverdueTemplateName(brand);
      const balanceDueTemplateName = resolvePendingPaymentLetterTemplateName(brand, {
        withPayButton: payButtonParams.length > 0,
      });
      const coldTextTemplateName = isOverdue ? overdueTemplateName : balanceDueTemplateName;

      // Overdue + Pay now: prefer cold overdue template (Call us + Pay now) whenever we have a /p/ code.
      if (
        isOverdue &&
        opts?.coldTemplateKind !== 'payment_received' &&
        opts?.coldPendingTemplate !== false &&
        payButtonParams.length > 0
      ) {
        const coldOverdue = await sendAdminWhatsAppTemplate({
          to: phone,
          templateName: overdueTemplateName,
          languageCode: 'en',
          bodyParams: letterBodyParams,
          buttonUrlParams: payButtonParams,
          customerId: opts?.customerId,
          source: 'pending_payment',
        });
        if (coldOverdue.ok) {
          toast.success('Overdue notice sent with Pay now button');
          return true;
        }
        if (coldOverdue.featureDisabled) {
          toast.error(coldOverdue.error || 'WhatsApp pending payment is disabled in Settings');
          return false;
        }
        // Template not approved yet — fall through to 24h CTA / freeform with Pay now.
      }

      // QR / image: prefer IMAGE-header template with Pay now (works in and out of 24h).
      // Overdue notice uses text cold template (legal copy) — skip IMAGE balance-due.
      // Freeform media alone has no Pay now button — that looked broken to customers.
      if (headerImage && opts?.coldTemplateKind !== 'payment_received' && !isOverdue) {
        if (opts?.coldPendingTemplate !== false) {
          const coldResult = await sendAdminWhatsAppTemplate({
            to: phone,
            templateName: resolvePendingPaymentLetterImageTemplateName(brand),
            languageCode: 'en',
            bodyParams: letterBodyParams,
            buttonUrlParams: payButtonParams,
            headerImage,
            customerId: opts?.customerId,
            source: 'pending_payment',
          });
          if (coldResult.ok) {
            toast.success(
              payButtonParams.length > 0
                ? 'Sent with UPI QR and Pay now button'
                : 'Sent with UPI QR'
            );
            return true;
          }
          if (coldResult.featureDisabled) {
            toast.error(coldResult.error || 'WhatsApp pending payment is disabled in Settings');
            return false;
          }
          const textCold = await sendAdminWhatsAppTemplate({
            to: phone,
            templateName: balanceDueTemplateName,
            languageCode: 'en',
            bodyParams: letterBodyParams,
            buttonUrlParams: payButtonParams,
            customerId: opts?.customerId,
            source: 'pending_payment',
          });
          if (textCold.ok) {
            toast.message(
              payButtonParams.length > 0
                ? 'Image template unavailable — sent text with Pay now'
                : 'Image template unavailable — sent text balance-due template'
            );
            return true;
          }
        }

        const mediaResult = await sendAdminWhatsAppMedia({
          to: phone,
          fileBase64: headerImage.imageBase64,
          filename: headerImage.filename,
          mimeType: headerImage.mimeType,
          caption: trimmed,
          customerId: opts?.customerId,
          source: 'pending_payment',
        });
        if (mediaResult.ok) {
          if (payHttpsLink) {
            const ctaBody = buildPendingPaymentWhatsAppMessage(
              opts?.customerName || 'Customer',
              opts?.amount ?? 0,
              opts?.dueDateYmd,
              brand,
              { httpsLink: payHttpsLink },
              opts?.invoiceRef,
              { withQrImage: true, ctaButton: true }
            );
            const cta = await sendAdminWhatsAppCtaUrl({
              to: phone,
              text: ctaBody,
              url: payHttpsLink,
              displayText: 'Pay now',
              customerId: opts?.customerId,
              customerName: opts?.customerName,
              source: 'pending_payment',
              fallbackWaMe: false,
            });
            if (cta.ok) {
              toast.success('Sent QR + Pay now button');
              return true;
            }
          }
          toast.success(
            payHttpsLink
              ? 'WhatsApp reminder sent with QR (Pay now button unavailable — check 24h window)'
              : 'WhatsApp reminder sent with image'
          );
          return true;
        }
        if (mediaResult.featureDisabled) {
          toast.error(mediaResult.error || 'WhatsApp pending payment is disabled in Settings');
          return false;
        }
        openWhatsAppMeDeepLink(phone, trimmed);
        toast.error(mediaResult.error || 'API send failed — opened phone WhatsApp');
        return false;
      }

      // Overdue + QR (template above failed or no pay code): session image + Pay now CTA when possible.
      if (headerImage && isOverdue && opts?.coldTemplateKind !== 'payment_received') {
        const mediaResult = await sendAdminWhatsAppMedia({
          to: phone,
          fileBase64: headerImage.imageBase64,
          filename: headerImage.filename,
          mimeType: headerImage.mimeType,
          caption: trimmed,
          customerId: opts?.customerId,
          source: 'pending_payment',
        });
        if (mediaResult.ok) {
          if (payHttpsLink) {
            const cta = await sendAdminWhatsAppCtaUrl({
              to: phone,
              text: trimmed,
              url: payHttpsLink,
              displayText: 'Pay now',
              customerId: opts?.customerId,
              customerName: opts?.customerName,
              source: 'pending_payment',
              fallbackWaMe: false,
            });
            if (cta.ok) {
              toast.success('Overdue notice sent with QR + Pay now');
              return true;
            }
          }
          toast.success('Overdue notice sent with QR');
          return true;
        }
        if (mediaResult.featureDisabled) {
          toast.error(mediaResult.error || 'WhatsApp pending payment is disabled in Settings');
          return false;
        }
        openWhatsAppMeDeepLink(phone, trimmed);
        toast.error(mediaResult.error || 'API send failed — opened phone WhatsApp');
        return false;
      }

      if (hasPayLink && opts?.coldPendingTemplate !== false) {
        // 24h: interactive Pay now button. Outside 24h: cold template with Pay now URL button.
        if (payHttpsLink) {
          const ctaResult = await sendAdminWhatsAppCtaUrl({
            to: phone,
            text: trimmed,
            url: payHttpsLink,
            displayText: 'Pay now',
            customerId: opts?.customerId,
            customerName: opts?.customerName,
            source: 'pending_payment',
            fallbackWaMe: false,
          });
          if (ctaResult.ok) {
            toast.success(isOverdue ? 'Overdue notice sent with Pay now' : 'Sent with Pay now button');
            return true;
          }
          if (ctaResult.featureDisabled) {
            toast.error(ctaResult.error || 'WhatsApp pending payment is disabled in Settings');
            return false;
          }
          if (ctaResult.needsWindowOrTemplate) {
            const coldResult = await sendAdminWhatsAppTextWithOptionalTemplate({
              to: phone,
              text: trimmed,
              customerId: opts?.customerId,
              source: 'pending_payment',
              fallbackWaMe: true,
              coldTemplate: {
                name: coldTextTemplateName,
                languageCode: 'en',
                bodyParams: letterBodyParams,
                buttonUrlParams: payButtonParams,
              },
            });
            if (coldResult.ok && coldResult.usedTemplate) {
              toast.success(
                isOverdue
                  ? 'Cold overdue notice sent with Pay now button'
                  : 'Cold balance-due template sent with Pay now button'
              );
              return true;
            }
            if (coldResult.ok && coldResult.via === 'wa_me') {
              toast.message('24h window closed — opened WhatsApp with pay link');
              return true;
            }
            openWhatsAppMeDeepLink(phone, trimmed);
            toast.message('24h window closed — opened WhatsApp with pay link');
            return true;
          }
          openWhatsAppMeDeepLink(phone, trimmed);
          toast.error(ctaResult.error || 'API send failed — opened phone WhatsApp with pay link');
          return false;
        }

        const result = await sendAdminWhatsAppText({
          to: phone,
          text: trimmed,
          customerId: opts?.customerId,
          source: 'pending_payment',
          fallbackWaMe: false,
        });
        if (result.ok) {
          toast.success(
            isOverdue ? 'Overdue payment notice sent (with pay link)' : 'WhatsApp reminder sent (with pay link)'
          );
          return true;
        }
        if (result.featureDisabled) {
          toast.error(result.error || 'WhatsApp pending payment is disabled in Settings');
          return false;
        }
        if (result.needsWindowOrTemplate) {
          const coldResult = await sendAdminWhatsAppTextWithOptionalTemplate({
            to: phone,
            text: trimmed,
            customerId: opts?.customerId,
            source: 'pending_payment',
            fallbackWaMe: true,
            coldTemplate: {
              name: coldTextTemplateName,
              languageCode: 'en',
              bodyParams: letterBodyParams,
              buttonUrlParams: payButtonParams,
            },
          });
          if (coldResult.ok && coldResult.usedTemplate) {
            toast.success(
              isOverdue
                ? 'Cold overdue notice sent with Pay now button'
                : 'Cold balance-due template sent with Pay now button'
            );
            return true;
          }
          if (coldResult.ok && coldResult.via === 'wa_me') {
            toast.message('24h window closed — opened WhatsApp with pay link');
            return true;
          }
          openWhatsAppMeDeepLink(phone, trimmed);
          toast.message('24h window closed — opened WhatsApp with pay link');
          return true;
        }
        openWhatsAppMeDeepLink(phone, trimmed);
        toast.error(result.error || 'API send failed — opened phone WhatsApp with pay link');
        return false;
      }

      const allowColdTpl = opts?.coldPendingTemplate !== false;
      const coldKind =
        opts?.coldTemplateKind || (isOverdue ? 'payment_overdue' : 'pending_payment');
      const coldTemplate = allowColdTpl
        ? coldKind === 'payment_received'
          ? resolveColdPaymentReceived(opts?.customerName || 'Customer', opts?.amount ?? 0, brand)
          : {
              name: coldTextTemplateName,
              languageCode: 'en',
              bodyParams: letterBodyParams,
              buttonUrlParams: payButtonParams,
            }
        : null;

      const result = await sendAdminWhatsAppTextWithOptionalTemplate({
        to: phone,
        text: trimmed,
        customerId: opts?.customerId,
        source: 'pending_payment',
        fallbackWaMe: true,
        coldTemplate: coldTemplate || undefined,
      });

      const isPaymentReceived = opts?.coldTemplateKind === 'payment_received';
      if (result.ok) {
        if (result.usedTemplate) {
          toast.success(
            isPaymentReceived
              ? 'Payment thanks sent (cold template — 24h window was closed)'
              : isOverdue
                ? 'Cold overdue notice sent (24h window was closed)'
                : 'Cold balance-due template sent (24h window was closed)'
          );
        } else if (result.via === 'wa_me') {
          toast.message('Opened phone WhatsApp');
        } else {
          toast.success(
            isPaymentReceived
              ? 'Payment thanks sent'
              : isOverdue
                ? 'Overdue payment notice sent'
                : 'WhatsApp reminder sent'
          );
        }
        return true;
      }

      toast.error(result.error || 'WhatsApp send failed');
      return false;
    } finally {
      setWhatsappSending(false);
    }
  };

  const openCall = (phone: string) => {
    if (!phone) return;
    const formatted = formatPhoneForWhatsApp(phone);
    const tel =
      formatted.startsWith('+')
        ? formatted
        : formatted.startsWith('91') && formatted.length === 12
          ? `+${formatted}`
          : formatted;
    window.location.href = `tel:${tel}`;
  };

  const brandForCustomer = (customerId: string | null | undefined): DocumentBrand =>
    normalizeDocumentBrand(customerId ? brandByCustomerId[customerId] : null) || 'hydrogenro';

  const syncUpiAccountsFromStorage = async () => {
    const { accounts: next } = await fetchUpiPaymentAccounts();
    setUpiAccounts(next);
    return next;
  };

  const clearWhatsappAttachImage = () => {
    setWhatsappAttachImage((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const openPendingWhatsAppDialog = async (payment: PendingPaymentReminder) => {
    const accounts = await syncUpiAccountsFromStorage();
    const preferred = resolvePreferredUpiAccount(accounts);
    setWhatsappUpiAccountId(preferred?.id ?? accounts[0]?.id ?? '');
    setWhatsappIncludeUpi(Boolean(preferred || accounts[0]));
    // Past due → show overdue option; leave unchecked so admin opts in.
    setWhatsappUseOverdueNotice(false);
    setWhatsappManageUpiOpen(false);
    clearWhatsappAttachImage();
    setWhatsappQrMode(preferred || accounts[0] ? 'auto' : 'off');
    setWhatsappTarget(payment);
    setWhatsappDialogOpen(true);
  };

  const buildPendingPaymentMessage = async (
    payment: PendingPaymentReminder,
    customer: CustomerLabel,
    opts?: { includeUpi?: boolean; upiAccountId?: string; withQrImage?: boolean }
  ): Promise<{ text: string; payHttpsLink: string | null }> => {
    const includeUpi = opts?.includeUpi ?? whatsappIncludeUpi;
    let upiAccountId = opts?.upiAccountId ?? whatsappUpiAccountId;
    if (includeUpi && !upiAccountId && upiAccounts.length > 0) {
      upiAccountId = resolvePreferredUpiAccount(upiAccounts)?.id ?? upiAccounts[0]?.id ?? '';
    }
    let upiOpts = null as
      | { label: string; upiId: string; phone?: string; deepLink?: string | null; httpsLink?: string | null }
      | null;
    if (includeUpi && upiAccountId) {
      const account = upiAccounts.find((a) => a.id === upiAccountId);
      if (account) {
        const share = await buildPendingPaymentUpiShare(
          account,
          Number(payment.amount_pending) || 0,
          payment.job_number || payment.job_id || null,
          { brand: brandForCustomer(payment.entity_id as string | undefined) }
        );
        if (share) {
          upiOpts = {
            label: share.account.label,
            upiId: share.account.upiId,
            phone: share.account.phone || undefined,
            deepLink: share.deepLink,
            httpsLink: share.httpsLink,
          };
        }
      }
    }
    const dueYmd = payment.reminder_at ? String(payment.reminder_at).slice(0, 10) : null;
    const brand = brandForCustomer(payment.entity_id as string | undefined);
    const amount = Number(payment.amount_pending) || 0;
    const invoiceRef = payment.job_number || payment.job_id || null;
    const withQrImage = opts?.withQrImage ?? Boolean(whatsappAttachImage);
    const payHttpsLink = (upiOpts?.httpsLink || '').trim() || null;

    if (whatsappUseOverdueNotice && isPendingPaymentPastDueForOverdueNotice(dueYmd)) {
      return {
        text: buildPendingPaymentOverdueWhatsAppMessage(
          customer.name,
          amount,
          dueYmd,
          brand,
          upiOpts,
          invoiceRef,
          { ctaButton: true }
        ),
        payHttpsLink,
      };
    }

    return {
      text: buildPendingPaymentWhatsAppMessage(
        customer.name,
        amount,
        dueYmd,
        brand,
        upiOpts,
        invoiceRef,
        { withQrImage, ctaButton: true }
      ),
      payHttpsLink,
    };
  };

  useEffect(() => {
    if (!whatsappDialogOpen || !whatsappTarget) {
      setWhatsappDraftMessage('');
      setWhatsappPayHttpsLink(null);
      setWhatsappDraftLoading(false);
      return;
    }
    const customer = whatsappTarget.entity_id
      ? customerLabels[whatsappTarget.entity_id as string]
      : undefined;
    if (!customer) {
      setWhatsappDraftMessage('');
      setWhatsappPayHttpsLink(null);
      return;
    }
    let cancelled = false;
    setWhatsappDraftLoading(true);
    void (async () => {
      try {
        const built = await buildPendingPaymentMessage(whatsappTarget, customer, {
          includeUpi: whatsappIncludeUpi,
          upiAccountId: whatsappUpiAccountId,
          withQrImage: Boolean(whatsappAttachImage),
        });
        if (!cancelled) {
          setWhatsappDraftMessage(built.text);
          setWhatsappPayHttpsLink(whatsappIncludeUpi ? built.payHttpsLink : null);
        }
      } finally {
        if (!cancelled) setWhatsappDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild when dialog UPI / QR options change
  }, [
    whatsappDialogOpen,
    whatsappTarget,
    whatsappIncludeUpi,
    whatsappUseOverdueNotice,
    whatsappUpiAccountId,
    whatsappAttachImage,
    upiAccounts,
    customerLabels,
    brandByCustomerId,
  ]);

  /** Auto-generate dynamic UPI QR when Include UPI is on (manual upload / cleared skip). */
  useEffect(() => {
    if (!whatsappDialogOpen || !whatsappTarget) return;
    if (!whatsappIncludeUpi || whatsappQrMode !== 'auto') return;
    const account = upiAccounts.find((a) => a.id === whatsappUpiAccountId);
    if (!account) {
      clearWhatsappAttachImage();
      return;
    }
    let cancelled = false;
    setWhatsappQrGenerating(true);
    void (async () => {
      try {
        const amount = Number(whatsappTarget.amount_pending) || 0;
        const noteParts = ['Pending payment'];
        const jobRef = whatsappTarget.job_number || whatsappTarget.job_id;
        if (jobRef) noteParts.push(String(jobRef));
        const brand = brandForCustomer(whatsappTarget.entity_id as string | undefined);
        const png = await generateUpiQrPngBase64({
          upiId: account.upiId,
          payeeName: account.payeeName || account.label,
          amount,
          note: noteParts.join(' '),
          phone: account.phone || undefined,
          brand,
        });
        if (cancelled) return;
        if (!png) {
          toast.message('Could not generate UPI QR — attach a photo manually if needed');
          return;
        }
        const bytes = Uint8Array.from(atob(png.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: png.mimeType });
        setWhatsappAttachImage((prev) => {
          if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
          return {
            base64: png.base64,
            mimeType: png.mimeType,
            filename: png.filename,
            previewUrl: URL.createObjectURL(blob),
          };
        });
      } finally {
        if (!cancelled) setWhatsappQrGenerating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto QR when UPI account / amount / mode change
  }, [
    whatsappDialogOpen,
    whatsappTarget,
    whatsappIncludeUpi,
    whatsappUpiAccountId,
    whatsappQrMode,
    upiAccounts,
    brandByCustomerId,
  ]);

  const buildPaymentReceivedMessage = (payment: PendingPaymentReminder, customer: CustomerLabel) =>
    buildPendingPaymentReceivedWhatsAppMessage(
      customer.name,
      Number(payment.amount_pending) || 0,
      brandForCustomer(payment.entity_id as string | undefined)
    );

  useEffect(() => {
    if (!open) return;
    if (initialAction === 'add') {
      // Important: reset list state so we don't show previously loaded payments in the background.
      // The component stays mounted, so we must clear cached list data explicitly.
      setLoaded(false);
      setPayments([]);
      setCustomerLabels({});
      setBrandByCustomerId({});
      setSearchQuery('');
      setLoading(false);
      setEditReminder(null);
      setFormOpen(true);
      setCallDialogOpen(false);
      setCallTarget(null);
    } else {
      setFormOpen(false);
      setEditReminder(null);
    }
  }, [open, initialAction]);

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      const c = p.entity_id ? customerLabels[p.entity_id as string] : undefined;
      const due = p.reminder_at ? format(new Date(p.reminder_at), 'yyyy-MM-dd') : '';
      const amount = p.amount_pending ? String(p.amount_pending) : '';
      return (
        (c?.name || '').toLowerCase().includes(q) ||
        (c?.customerId || '').toLowerCase().includes(q) ||
        (p.entity_id || '').toLowerCase().includes(q) ||
        due.includes(q) ||
        amount.includes(q)
      );
    });
  }, [payments, customerLabels, searchQuery]);

  const totalPending = useMemo(
    () => filteredPayments.reduce((sum, p) => sum + (Number(p.amount_pending) || 0), 0),
    [filteredPayments]
  );

  const load = async (
    focusId?: string | null
  ): Promise<{ list: PendingPaymentReminder[]; brands: Record<string, DocumentBrand | null> }> => {
    setLoading(true);
    let result: PendingPaymentReminder[] = [];
    let brandMap: Record<string, DocumentBrand | null> = {};
    try {
      const from = 0;
      const to = PAGE_SIZE - 1;
      const { data: reminderRows, error: reminderError } = await supabase
        .from('reminders')
        .select(REMINDER_ROW_COLUMNS)
        .eq('entity_type', 'customer')
        .eq('title', PENDING_PAYMENT_TITLE)
        .is('completed_at', null)
        .order('reminder_at', { ascending: true })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (reminderError) throw reminderError;

      let list = ((reminderRows || []) as Reminder[]).map((r) => {
        const parsed = parsePendingPaymentReminderNotes(r.notes);
        return {
          ...r,
          amount_pending: parsed.amount_pending,
          note: parsed.note,
          job_id: parsed.job_id,
          job_number: parsed.job_number,
        };
      }) as PendingPaymentReminder[];

      if (focusId && !list.some((r) => r.id === focusId)) {
        const { data: oneRow, error: oneErr } = await supabase
          .from('reminders')
          .select(REMINDER_ROW_COLUMNS)
          .eq('id', focusId)
          .maybeSingle();
        if (!oneErr && oneRow) {
          const parsed = parsePendingPaymentReminderNotes(oneRow.notes);
          list = [
            {
              ...(oneRow as Reminder),
              amount_pending: parsed.amount_pending,
              note: parsed.note,
              job_id: parsed.job_id,
              job_number: parsed.job_number,
            } as PendingPaymentReminder,
            ...list,
          ];
        }
      }

      const customerIds = [...new Set(list.filter((r) => !!r.entity_id).map((r) => r.entity_id as string))];
      const { data: custRows, error: custError } = await supabase
        .from('customers')
        .select('id, full_name, customer_id, phone, alternate_phone')
        .in('id', customerIds);
      if (custError) throw custError;

      const labelMap: Record<string, CustomerLabel> = {};
      (custRows || []).forEach((c: any) => {
        if (c?.id) labelMap[c.id] = getCustomerLabelFromRow(c);
      });

      const brandMapNext: Record<string, DocumentBrand | null> = {};
      if (customerIds.length > 0) {
        const { data: brands } = await db.jobs.getLastServiceBrandByCustomerIds(customerIds);
        for (const id of customerIds) {
          brandMapNext[id] = normalizeDocumentBrand(brands?.[id]) || null;
        }
      }
      brandMap = brandMapNext;

      setPayments(list);
      setCustomerLabels(labelMap);
      setBrandByCustomerId(brandMapNext);
      setLoaded(true);
      result = list;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load pending payments');
    } finally {
      setLoading(false);
    }
    return { list: result, brands: brandMap };
  };

  useEffect(() => {
    if (!open || !initialReminderId || initialAction === 'add') return;
    const key = `${initialReminderId}:${initialAction || 'list'}`;
    if (deepLinkHandledRef.current === key) return;
    deepLinkHandledRef.current = key;

    void (async () => {
      const { list } = await load(initialReminderId);
      setHighlightReminderId(initialReminderId);
      window.setTimeout(() => {
        rowRefs.current[initialReminderId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);

      if (initialAction !== 'whatsapp') return;
      const target = list.find((p) => p.id === initialReminderId);
      if (!target) return;
      const customer = target.entity_id ? customerLabels[target.entity_id as string] : undefined;
      // customerLabels may not be updated yet — read from fresh load path below
      const { data: custRows } = await supabase
        .from('customers')
        .select('id, full_name, customer_id, phone, alternate_phone')
        .eq('id', target.entity_id as string)
        .maybeSingle();
      const label = custRows ? getCustomerLabelFromRow(custRows) : customer;
      if (!label) {
        toast.error('Customer info not loaded');
        return;
      }
      const primary = label.phone;
      const alternate = label.alternatePhone;
      if (!primary && !alternate) {
        toast.error('Customer phone number is missing');
        return;
      }
      setCustomerLabels((prev) => ({
        ...prev,
        [target.entity_id as string]: label,
      }));
      void openPendingWhatsAppDialog(target);
    })();
  }, [open, initialReminderId, initialAction]);

  // When user is adding/editing, render ONLY the add/edit dialog.
  // This prevents the pending list UI from showing behind the form.
  if (open && (initialAction === 'add' || formOpen)) {
    return (
      <PendingPaymentFormDialogV2
        open={open}
        onOpenChange={(o) => {
          if (!o) onOpenChange(false);
        }}
        editReminder={editReminder}
        onSaved={() => {
          // Don’t auto-load list after add/edit; user clicks "Load pending payments" when needed.
          setLoaded(false);
          setPayments([]);
          setCustomerLabels({});
          setBrandByCustomerId({});
          setSearchQuery('');
        }}
      />
    );
  }

  const handleOpenAdd = () => {
    setEditReminder(null);
    setFormOpen(true);
  };

  const openEdit = (r: Reminder) => {
    setEditReminder(r);
    setFormOpen(true);
  };

  const handleMarkCompleted = (r: Reminder) => {
    setOfferWhatsAppAfterComplete(true);
    setCompleteTarget(r as PendingPaymentReminder);
    setCompleteConfirmOpen(true);
  };

  const confirmMarkCompleted = async () => {
    if (!completeTarget) return;
    const marked = completeTarget;
    const entityId = marked.entity_id as string | undefined;
    // Snapshot before load(): reload rebuilds `customerLabels` from pending rows only, so the
    // completed customer disappears from the map and the WhatsApp dialog would render empty.
    let customerForReceipt = entityId ? customerLabels[entityId] : undefined;
    setCompleteConfirmBusy(true);
    try {
      const settledAt = new Date().toISOString();
      const { error } = await db.reminders.update(completeTarget.id, { completed_at: settledAt });
      if (error) throw new Error(error.message);

      // Linked job from complete-job pending payment — mark customer payment PAID + settle in requirements.
      // Do not touch technician_payments (commission already based on full bill).
      const linkedJobId =
        marked.job_id || parsePendingPaymentReminderNotes(marked.notes).job_id;
      if (linkedJobId) {
        try {
          const { data: jobRow, error: jobFetchErr } = await db.jobs.getById(linkedJobId);
          if (jobFetchErr) {
            console.error('[pending-payment] job fetch on collect failed', jobFetchErr);
            toast.warning('Marked collected, but could not update the linked job.');
          } else if (jobRow) {
            const nextReqs = markPendingPaymentSettledInRequirements(
              (jobRow as any).requirements,
              settledAt
            );
            const { error: jobUpdateErr } = await db.jobs.update(linkedJobId, {
              payment_status: 'PAID',
              requirements: nextReqs,
            });
            if (jobUpdateErr) {
              console.error('[pending-payment] job settle on collect failed', jobUpdateErr);
              toast.warning('Marked collected, but linked job payment status update failed.');
            }
          }
        } catch (jobErr) {
          console.error('[pending-payment] job settle on collect exception', jobErr);
          toast.warning('Marked collected, but linked job update failed.');
        }
      }

      toast.success('Marked pending payment as collected');
      await load(); // reload current page
      setCompleteConfirmOpen(false);
      setCompleteTarget(null);

      if (offerWhatsAppAfterComplete) {
        if (!customerForReceipt && entityId) {
          const { data, error: custErr } = await db.customers.getById(entityId);
          if (!custErr && data) customerForReceipt = getCustomerLabelFromRow(data);
        }
        const primary = customerForReceipt?.phone?.trim();
        const alternate = customerForReceipt?.alternatePhone?.trim();
        if (!customerForReceipt) {
          toast.error('Customer info not loaded — open WhatsApp from the customer profile if needed');
        } else if (!primary && !alternate) {
          toast.error('Customer phone number is missing — add a phone to send WhatsApp');
        } else {
          setPostCompleteCustomerLabel(customerForReceipt);
          setPostCompleteWhatsappTarget(marked);
          setPostCompleteWhatsappOpen(true);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark collected');
    } finally {
      setCompleteConfirmBusy(false);
    }
  };

  const handleOpenCustomer = (p: PendingPaymentReminder) => {
    setCustomerActionTarget(p);
    setCustomerActionOpen(true);
  };

  const handleCustomerSearch = () => {
    const p = customerActionTarget;
    setCustomerActionOpen(false);
    setCustomerActionTarget(null);
    if (!p) return;
    const customer = p.entity_id ? customerLabels[p.entity_id as string] : undefined;
    const query =
      (customer?.phone || '').trim() ||
      (customer?.customerId || '').trim() ||
      (customer?.name || '').trim();
    if (!query) {
      toast.error('No phone or customer id to search');
      return;
    }
    onOpenChange(false);
    navigate(`/admin?search=${encodeURIComponent(query)}`);
  };

  const handleCustomerReports = async () => {
    const p = customerActionTarget;
    setCustomerActionOpen(false);
    if (!p?.entity_id) {
      setCustomerActionTarget(null);
      toast.error('Customer not linked to this payment');
      return;
    }
    setReportOpening(true);
    try {
      const [{ data: customer, error }, techResult] = await Promise.all([
        db.customers.getById(String(p.entity_id)),
        reportTechsLoadedRef.current
          ? Promise.resolve({ data: reportTechnicians })
          : db.technicians.getList(100, { activeRosterOnly: false }),
      ]);
      if (error || !customer) {
        toast.error(error?.message || 'Failed to load customer for report');
        return;
      }
      if (!reportTechsLoadedRef.current) {
        const techs = (((techResult as any)?.data || []) as any[]).map((t) => ({
          ...t,
          fullName: t.fullName || t.full_name,
          full_name: t.full_name || t.fullName,
        })) as Technician[];
        setReportTechnicians(techs);
        reportTechsLoadedRef.current = true;
      }
      const row = customer as any;
      setReportCustomer({
        ...row,
        fullName: row.fullName || row.full_name || '',
        full_name: row.full_name || row.fullName || '',
        customerId: row.customerId || row.customer_id || '',
        customer_id: row.customer_id || row.customerId || '',
      } as Customer);
      setReportDialogOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to open customer report');
    } finally {
      setReportOpening(false);
      setCustomerActionTarget(null);
    }
  };

  const handleWhatsAppClick = (p: PendingPaymentReminder) => {
    const customer = p.entity_id ? customerLabels[p.entity_id as string] : undefined;
    if (!customer) {
      toast.error('Customer info not loaded');
      return;
    }
    const primary = customer.phone;
    const alternate = customer.alternatePhone;
    if (!primary && !alternate) {
      toast.error('Customer phone number is missing');
      return;
    }

    void openPendingWhatsAppDialog(p);
  };

  const handleCallClick = (p: PendingPaymentReminder) => {
    const customer = p.entity_id ? customerLabels[p.entity_id as string] : undefined;
    if (!customer) {
      toast.error('Customer info not loaded');
      return;
    }
    const primary = customer.phone;
    const alternate = customer.alternatePhone;
    if (!primary && !alternate) {
      toast.error('Customer phone number is missing');
      return;
    }

    if (alternate && alternate.trim() && alternate.trim() !== primary?.trim()) {
      setCallTarget(p);
      setCallDialogOpen(true);
      return;
    }

    openCall(primary || alternate || '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Badge className="bg-blue-600 text-white">₹</Badge>
            Pending payments
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            Use <strong>Load</strong> to fetch pending payments. Add/edit amount & due date. Mark as completed when received.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {!loaded ? (
            <div className="flex flex-col gap-3">
              <Button onClick={load} disabled={loading} className="w-full sm:w-auto min-h-9">
                {loading ? 'Loading...' : 'Load pending payments'}
              </Button>
              <Button onClick={handleOpenAdd} variant="outline" disabled={loading} className="w-full sm:w-auto min-h-9">
                <Plus className="w-4 h-4 mr-2" />
                Add pending payment
              </Button>
              <p className="text-sm text-muted-foreground">
                Stored as customer reminders titled <span className="font-mono">{PENDING_PAYMENT_TITLE}</span>.
              </p>
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-muted-foreground">No pending payments found.</div>
              <Button onClick={handleOpenAdd} className="w-full sm:w-auto min-h-9">
                <Plus className="w-4 h-4 mr-2" />
                Add pending payment
              </Button>
              <Button variant="outline" onClick={load} disabled={loading} className="w-full sm:w-auto min-h-9">
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Input
                    placeholder="Search customer, due date, amount..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus={false}
                    className="min-h-10 sm:min-h-9 border border-input focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus:outline-none"
                  />
                </div>
                <Button
                  onClick={handleOpenAdd}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  disabled={loading}
                  title="Add pending payment"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={load}
                  disabled={loading}
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-3">
                {filteredPayments.map((p) => {
                  const due = p.reminder_at ? parseReminderAtLocalDate(p.reminder_at) : null;
                  const customer = p.entity_id ? customerLabels[p.entity_id as string] : undefined;
                  const dueLabel =
                    due && !Number.isNaN(due.getTime()) ? format(due, 'PPP') : '—';

                  return (
                    <div
                      key={p.id}
                      ref={(el) => {
                        rowRefs.current[p.id] = el;
                      }}
                      className={`flex flex-col gap-3 rounded-lg border p-3 bg-background sm:flex-row sm:items-start sm:justify-between ${
                        highlightReminderId === p.id ? 'ring-2 ring-amber-500 border-amber-300' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleOpenCustomer(p)}
                              className="font-medium text-gray-900 dark:text-gray-100 truncate text-left hover:underline underline-offset-2"
                              title="Open customer"
                            >
                              {customer?.name ?? 'Customer'}
                            </button>
                            {customer?.customerId && (
                              <span className="text-xs text-muted-foreground font-mono shrink-0">
                                ({customer.customerId})
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                              Due: {dueLabel}
                            </span>
                            {(p.job_number || p.job_id) && (
                              <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                                From job {p.job_number || String(p.job_id).slice(0, 8)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-muted-foreground">Pending amount</div>
                          <div className="text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                            ₹{(Number(p.amount_pending) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        {p.note && (
                          <div className="text-xs text-muted-foreground break-words">
                            Note: {p.note}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-5 gap-2 sm:flex sm:shrink-0 sm:items-center sm:gap-2 border-t pt-2.5 sm:border-0 sm:pt-0">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleOpenCustomer(p)}
                          className="h-10 w-full sm:h-9 sm:w-9"
                          title="Open customer"
                        >
                          <UserRound className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openEdit(p)}
                          className="h-10 w-full sm:h-9 sm:w-9"
                          title="Edit pending payment"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          onClick={() => handleMarkCompleted(p)}
                          className="h-10 w-full sm:h-9 sm:w-9 bg-green-600 hover:bg-green-700"
                          title="Completed"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          onClick={() => handleWhatsAppClick(p)}
                          className="h-10 w-full sm:h-9 sm:w-9 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200"
                          title="Notify on WhatsApp"
                        >
                          <WhatsAppIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          onClick={() => handleCallClick(p)}
                          className="h-10 w-full sm:h-9 sm:w-9 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                          title="Call customer"
                        >
                          <PhoneCall className="h-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Total pending: <span className="font-medium text-foreground">₹{totalPending.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <Dialog
          open={customerActionOpen}
          onOpenChange={(o) => {
            setCustomerActionOpen(o);
            if (!o) setCustomerActionTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-sm p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Open customer</DialogTitle>
              <DialogDescription>
                {(() => {
                  const c = customerActionTarget?.entity_id
                    ? customerLabels[customerActionTarget.entity_id as string]
                    : undefined;
                  return c
                    ? `${c.name}${c.customerId ? ` (${c.customerId})` : ''}`
                    : 'Choose where to open this customer.';
                })()}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 pt-1">
              <Button
                onClick={() => void handleCustomerReports()}
                disabled={reportOpening}
                className="min-h-11 justify-start gap-2"
              >
                <FileText className="h-4 w-4" />
                {reportOpening ? 'Opening report…' : 'Reports'}
              </Button>
              <Button
                variant="outline"
                onClick={handleCustomerSearch}
                disabled={reportOpening}
                className="min-h-11 justify-start gap-2"
              >
                <Search className="h-4 w-4" />
                Search
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {reportCustomer && (
          <CustomerReportDialog
            open={reportDialogOpen}
            photoViewerOpen={reportPhotoViewerOpen}
            onOpenChange={(o) => {
              if (!o && ignoreParentDismissWhileSuspended()) return;
              setReportDialogOpen(o);
              if (!o) {
                setReportCustomer(null);
                setReportPhotoViewerOpen(false);
              }
            }}
            customer={reportCustomer}
            technicians={reportTechnicians}
            onPhotoClick={(url, index, total, photos) => {
              const list = photos && photos.length > 0 ? photos : [url];
              const safeIndex = Math.min(Math.max(0, index), list.length - 1);
              openSuspendedViewer(
                () => setReportDialogOpen(false),
                () => {
                  setReportSelectedBillPhotos(list);
                  setReportSelectedPhoto({
                    url: list[safeIndex] || url,
                    index: safeIndex,
                    total: list.length || total,
                  });
                  setReportPhotoViewerOpen(true);
                }
              );
            }}
            onBillPhotosClick={(photos, index) => {
              if (!photos.length) return;
              const safeIndex = Math.min(Math.max(0, index), photos.length - 1);
              openSuspendedViewer(
                () => setReportDialogOpen(false),
                () => {
                  setReportSelectedBillPhotos(photos);
                  setReportSelectedPhoto({
                    url: photos[safeIndex],
                    index: safeIndex,
                    total: photos.length,
                  });
                  setReportPhotoViewerOpen(true);
                }
              );
            }}
          />
        )}

        {reportPhotoViewerOpen && (
          <PhotoViewerDialog
            open={reportPhotoViewerOpen}
            onOpenChange={(open) => {
              if (open) {
                setReportPhotoViewerOpen(true);
                return;
              }
              closeSuspendedViewer(
                () => setReportDialogOpen(true),
                () => {
                  setReportPhotoViewerOpen(false);
                  setReportSelectedPhoto(null);
                  setReportSelectedBillPhotos(null);
                }
              );
            }}
            selectedPhoto={reportSelectedPhoto}
            selectedBillPhotos={reportSelectedBillPhotos}
            selectedJobPhotos={null}
            showNavigation={Boolean(reportSelectedBillPhotos && reportSelectedBillPhotos.length > 1)}
            onPrevious={() => {
              if (
                !reportSelectedPhoto ||
                !reportSelectedBillPhotos ||
                reportSelectedBillPhotos.length <= 1
              ) {
                return;
              }
              const newIndex =
                reportSelectedPhoto.index > 0
                  ? reportSelectedPhoto.index - 1
                  : reportSelectedBillPhotos.length - 1;
              setReportSelectedPhoto({
                url: reportSelectedBillPhotos[newIndex],
                index: newIndex,
                total: reportSelectedBillPhotos.length,
              });
            }}
            onNext={() => {
              if (
                !reportSelectedPhoto ||
                !reportSelectedBillPhotos ||
                reportSelectedBillPhotos.length <= 1
              ) {
                return;
              }
              const newIndex =
                reportSelectedPhoto.index < reportSelectedBillPhotos.length - 1
                  ? reportSelectedPhoto.index + 1
                  : 0;
              setReportSelectedPhoto({
                url: reportSelectedBillPhotos[newIndex],
                index: newIndex,
                total: reportSelectedBillPhotos.length,
              });
            }}
            onDownload={(photoUrl) => {
              const a = document.createElement('a');
              a.href = photoUrl;
              a.download = 'photo';
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.click();
            }}
            onClose={() => {
              closeSuspendedViewer(
                () => setReportDialogOpen(true),
                () => {
                  setReportPhotoViewerOpen(false);
                  setReportSelectedPhoto(null);
                  setReportSelectedBillPhotos(null);
                }
              );
            }}
          />
        )}

        <AlertDialog
          open={completeConfirmOpen}
          onOpenChange={(o) => {
            setCompleteConfirmOpen(o);
            if (!o) setCompleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark as collected?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark this pending payment as completed and remove it from the pending list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex items-start gap-3 py-2 px-1">
              <Checkbox
                id="offer-wa-after-complete"
                checked={offerWhatsAppAfterComplete}
                onCheckedChange={(v) => setOfferWhatsAppAfterComplete(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="offer-wa-after-complete" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                After marking, offer to send a WhatsApp message confirming the amount received (thanks)
              </label>
            </div>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                onClick={confirmMarkCompleted}
                disabled={completeConfirmBusy}
              >
                {completeConfirmBusy ? 'Updating...' : 'Mark as collected'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={postCompleteWhatsappOpen}
          onOpenChange={(o) => {
            setPostCompleteWhatsappOpen(o);
            if (!o) {
              setPostCompleteWhatsappTarget(null);
              setPostCompleteCustomerLabel(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            {postCompleteWhatsappTarget && postCompleteCustomerLabel && (
              <>
                {(() => {
                  const customer = postCompleteCustomerLabel;
                  const primaryPhone = customer?.phone;
                  const alternatePhone = customer?.alternatePhone;
                  const message = buildPaymentReceivedMessage(postCompleteWhatsappTarget, customer);
                  const hasAlternate = !!alternatePhone && alternatePhone.trim() !== (primaryPhone || '').trim();

                  return (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <WhatsAppIcon className="w-5 h-5 text-green-600" />
                          Payment received — WhatsApp
                        </DialogTitle>
                        <DialogDescription>
                          Send a short thank-you message confirming the received amount.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="py-4 space-y-3">
                        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                          <div className="text-sm text-gray-700">
                            <strong>Customer:</strong> {customer?.name ?? 'Customer'}
                          </div>
                          <div className="text-sm text-gray-700">
                            <strong>Primary:</strong> {primaryPhone ?? '—'}
                          </div>
                          {hasAlternate && (
                            <div className="text-sm text-gray-700">
                              <strong>Alternate:</strong> {alternatePhone}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Message preview</Label>
                          <div className="mt-1 p-3 bg-white border border-gray-200 rounded text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {message}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {hasAlternate ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Button
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                disabled={whatsappSending || !primaryPhone}
                                onClick={() => {
                                  if (!primaryPhone) return;
                                  void (async () => {
                                    const ok = await openWhatsApp(primaryPhone, message, {
                                      customerName: customer?.name,
                                      amount: Number(postCompleteWhatsappTarget.amount_pending) || 0,
                                      customerId: postCompleteWhatsappTarget.entity_id as string | undefined,
                                      brand: brandForCustomer(
                                        postCompleteWhatsappTarget.entity_id as string | undefined
                                      ),
                                      coldTemplateKind: 'payment_received',
                                    });
                                    if (ok) setPostCompleteWhatsappOpen(false);
                                  })();
                                }}
                              >
                                {whatsappSending ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <WhatsAppIcon className="w-4 h-4 mr-2" />
                                )}
                                {whatsappSending ? 'Sending…' : `Primary: ${primaryPhone}`}
                              </Button>
                              <Button
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                disabled={whatsappSending || !alternatePhone}
                                onClick={() => {
                                  if (!alternatePhone) return;
                                  void (async () => {
                                    const ok = await openWhatsApp(alternatePhone, message, {
                                      customerName: customer?.name,
                                      amount: Number(postCompleteWhatsappTarget.amount_pending) || 0,
                                      customerId: postCompleteWhatsappTarget.entity_id as string | undefined,
                                      brand: brandForCustomer(
                                        postCompleteWhatsappTarget.entity_id as string | undefined
                                      ),
                                      coldTemplateKind: 'payment_received',
                                    });
                                    if (ok) setPostCompleteWhatsappOpen(false);
                                  })();
                                }}
                              >
                                {whatsappSending ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <WhatsAppIcon className="w-4 h-4 mr-2" />
                                )}
                                {whatsappSending ? 'Sending…' : `Alternate: ${alternatePhone}`}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="default"
                              className="w-full bg-green-600 hover:bg-green-700 text-white"
                              disabled={whatsappSending || !(primaryPhone || alternatePhone)}
                              onClick={() => {
                                const phone = primaryPhone || alternatePhone;
                                if (!phone) return;
                                void (async () => {
                                  const ok = await openWhatsApp(phone, message, {
                                    customerName: customer?.name,
                                    amount: Number(postCompleteWhatsappTarget.amount_pending) || 0,
                                    customerId: postCompleteWhatsappTarget.entity_id as string | undefined,
                                    brand: brandForCustomer(
                                      postCompleteWhatsappTarget.entity_id as string | undefined
                                    ),
                                    coldTemplateKind: 'payment_received',
                                  });
                                  if (ok) setPostCompleteWhatsappOpen(false);
                                })();
                              }}
                            >
                              {whatsappSending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <WhatsAppIcon className="w-4 h-4 mr-2" />
                              )}
                              {whatsappSending ? 'Sending…' : 'Send WhatsApp message'}
                            </Button>
                          )}
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setPostCompleteWhatsappOpen(false);
                            setPostCompleteWhatsappTarget(null);
                            setPostCompleteCustomerLabel(null);
                          }}
                        >
                          Skip
                        </Button>
                      </DialogFooter>
                    </>
                  );
                })()}
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={whatsappDialogOpen}
          onOpenChange={(o) => {
            setWhatsappDialogOpen(o);
            if (!o) {
              setWhatsappTarget(null);
              setWhatsappManageUpiOpen(false);
              setWhatsappIncludeUpi(false);
              setWhatsappUseOverdueNotice(false);
              setWhatsappPayHttpsLink(null);
              if (whatsappAttachImage?.previewUrl) {
                URL.revokeObjectURL(whatsappAttachImage.previewUrl);
              }
              setWhatsappAttachImage(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            {whatsappTarget && (
              <>
                {(() => {
                  const customer = whatsappTarget.entity_id
                    ? customerLabels[whatsappTarget.entity_id as string]
                    : undefined;
                  const primaryPhone = customer?.phone;
                  const alternatePhone = customer?.alternatePhone;
                  const message = whatsappDraftMessage;
                  const hasAlternate =
                    !!alternatePhone && alternatePhone.trim() !== (primaryPhone || '').trim();
                  const resolvedUpiAccountId =
                    whatsappUpiAccountId ||
                    resolvePreferredUpiAccount(upiAccounts)?.id ||
                    upiAccounts[0]?.id ||
                    '';
                  const canIncludeUpi =
                    whatsappIncludeUpi &&
                    Boolean(resolvedUpiAccountId) &&
                    upiAccounts.some((a) => a.id === resolvedUpiAccountId);
                  const messageHasPayLink =
                    Boolean(whatsappPayHttpsLink) || /https?:\/\/[^\s]+/i.test(message);

                  const dueYmd = whatsappTarget.reminder_at
                    ? String(whatsappTarget.reminder_at).slice(0, 10)
                    : null;
                  const canSendOverdueNotice = isPendingPaymentPastDueForOverdueNotice(dueYmd);
                  const sendOverdue = canSendOverdueNotice && whatsappUseOverdueNotice;

                  const sendWithPhone = (phone: string) => {
                    if (!phone) return;
                    if (whatsappSending) return;
                    if (whatsappIncludeUpi && !canIncludeUpi) {
                      toast.error('Select a UPI account, or uncheck “Include UPI pay details”');
                      return;
                    }
                    if (whatsappIncludeUpi && canIncludeUpi && whatsappDraftLoading) {
                      toast.error('Pay link still generating — wait a moment and try again');
                      return;
                    }
                    if (whatsappIncludeUpi && canIncludeUpi && !messageHasPayLink) {
                      toast.error('Pay link unavailable — try again or uncheck UPI details');
                      return;
                    }
                    if (whatsappDraftLoading || !message.trim()) {
                      toast.error('Preparing message… try again in a moment');
                      return;
                    }
                    if (canIncludeUpi) {
                      setLastSelectedUpiAccountId(resolvedUpiAccountId);
                    }
                    void (async () => {
                      const ok = await openWhatsApp(phone, message, {
                        customerName: customer?.name,
                        amount: Number(whatsappTarget.amount_pending) || 0,
                        customerId: whatsappTarget.entity_id as string | undefined,
                        dueDateYmd: dueYmd,
                        invoiceRef: whatsappTarget.job_number || whatsappTarget.job_id || null,
                        brand: brandForCustomer(whatsappTarget.entity_id as string | undefined),
                        includePayLink: canIncludeUpi || messageHasPayLink,
                        payHttpsLink: whatsappPayHttpsLink,
                        coldTemplateKind: sendOverdue ? 'payment_overdue' : 'pending_payment',
                        headerImage: whatsappAttachImage
                          ? {
                              imageBase64: whatsappAttachImage.base64,
                              filename: whatsappAttachImage.filename,
                              mimeType: whatsappAttachImage.mimeType,
                            }
                          : null,
                      });
                      if (ok) setWhatsappDialogOpen(false);
                    })();
                  };

                  return (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <WhatsAppIcon className="w-5 h-5 text-green-600" />
                          Notify via WhatsApp
                        </DialogTitle>
                        <DialogDescription>
                          {sendOverdue
                            ? 'Overdue notice: promises / warranty / agreements no longer valid; advance not returned. Reply here for help.'
                            : 'Message includes amount due, due date, and UPI pay link when enabled.'}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="py-4 space-y-3">
                        <div className="bg-gray-50 dark:bg-muted/40 rounded-lg p-4 space-y-2">
                          <div className="text-sm text-foreground">
                            <strong>Customer:</strong> {customer?.name ?? 'Customer'}
                          </div>
                          <div className="text-sm text-foreground">
                            <strong>Amount due:</strong> ₹
                            {(Number(whatsappTarget.amount_pending) || 0).toLocaleString('en-IN', {
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          <div className="text-sm text-foreground">
                            <strong>Due by:</strong>{' '}
                            {formatPendingPaymentDueLabel(
                              whatsappTarget.reminder_at
                                ? String(whatsappTarget.reminder_at).slice(0, 10)
                                : null
                            ) || 'At your earliest convenience'}
                          </div>
                          {canIncludeUpi ? (
                            <div className="text-sm text-foreground">
                              <strong>Pay link:</strong>{' '}
                              {whatsappDraftLoading
                                ? 'Generating…'
                                : whatsappPayHttpsLink ||
                                  (() => {
                                    const match = message.match(/https?:\/\/[^\s]+/);
                                    return match ? match[0] : 'Pay now button (link ready)';
                                  })()}
                            </div>
                          ) : null}
                          <div className="text-sm text-foreground">
                            <strong>Primary:</strong> {primaryPhone ?? '—'}
                          </div>
                          {hasAlternate && (
                            <div className="text-sm text-foreground">
                              <strong>Alternate:</strong> {alternatePhone}
                            </div>
                          )}
                        </div>

                        {canSendOverdueNotice ? (
                          <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="send-overdue-notice"
                                checked={whatsappUseOverdueNotice}
                                onCheckedChange={(v) => setWhatsappUseOverdueNotice(v === true)}
                                className="mt-0.5"
                              />
                              <div className="min-w-0 flex-1">
                                <label
                                  htmlFor="send-overdue-notice"
                                  className="text-sm font-medium cursor-pointer leading-snug"
                                >
                                  Send overdue notice
                                </label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Due date has passed. Says promises, warranty, and service agreements are
                                  no longer valid; advance will not be returned. Uncheck to send the normal
                                  balance-due reminder instead.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="rounded-md border p-3 space-y-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id="include-upi-pay"
                              checked={whatsappIncludeUpi}
                              onCheckedChange={(v) => {
                                const on = v === true;
                                setWhatsappIncludeUpi(on);
                                if (on) {
                                  if (!whatsappUpiAccountId && upiAccounts[0]) {
                                    setWhatsappUpiAccountId(
                                      resolvePreferredUpiAccount(upiAccounts)?.id ?? upiAccounts[0].id
                                    );
                                  }
                                  if (whatsappQrMode !== 'manual') setWhatsappQrMode('auto');
                                } else {
                                  clearWhatsappAttachImage();
                                  setWhatsappQrMode('off');
                                }
                              }}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <label
                                htmlFor="include-upi-pay"
                                className="text-sm font-medium cursor-pointer leading-snug"
                              >
                                Include amount, due date &amp; UPI pay link in message
                              </label>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Adds payment link, UPI ID, and pre-filled amount. Uncheck for a short reminder only.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs shrink-0"
                              onClick={() => setWhatsappManageUpiOpen((v) => !v)}
                            >
                              {whatsappManageUpiOpen ? 'Hide' : 'Manage'}
                            </Button>
                          </div>

                          {whatsappIncludeUpi ? (
                            <div className="space-y-2 pl-7">
                              <Label>Pay to UPI</Label>
                              <Select
                                value={whatsappUpiAccountId || undefined}
                                onValueChange={setWhatsappUpiAccountId}
                                disabled={upiAccounts.length === 0}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select UPI account" />
                                </SelectTrigger>
                                <SelectContent>
                                  {upiAccounts.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                      {a.label} — {a.upiId}
                                      {a.phone ? ` · ${a.phone}` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {upiAccounts.length === 0 && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                  Add a UPI account below, or uncheck to send without UPI.
                                </p>
                              )}
                            </div>
                          ) : null}

                          {whatsappManageUpiOpen || (whatsappIncludeUpi && upiAccounts.length === 0) ? (
                            <div className="rounded-md border p-3 bg-background">
                              <UpiPaymentAccountsManager
                                compact
                                onAccountsChange={(next) => {
                                  setUpiAccounts(next);
                                  if (
                                    whatsappUpiAccountId &&
                                    !next.some((a) => a.id === whatsappUpiAccountId)
                                  ) {
                                    const preferred = resolvePreferredUpiAccount(next);
                                    setWhatsappUpiAccountId(preferred?.id ?? '');
                                    if (!preferred) setWhatsappIncludeUpi(false);
                                  } else if (!whatsappUpiAccountId && next.length > 0) {
                                    setWhatsappUpiAccountId(
                                      resolvePreferredUpiAccount(next)?.id ?? next[0].id
                                    );
                                  }
                                }}
                              />
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label>UPI QR code</Label>
                          <input
                            ref={whatsappImageInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              const err = validateWhatsAppAttachFile(file);
                              if (err) {
                                toast.error(err);
                                return;
                              }
                              if (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
                                toast.error('Only JPEG, PNG, or WebP images');
                                return;
                              }
                              void (async () => {
                                try {
                                  const read = await readFileAsBase64(file);
                                  clearWhatsappAttachImage();
                                  setWhatsappQrMode('manual');
                                  setWhatsappAttachImage({
                                    base64: read.base64,
                                    mimeType: read.mimeType || file.type || 'image/jpeg',
                                    filename: read.filename || file.name || 'upi-qr.jpg',
                                    previewUrl: URL.createObjectURL(file),
                                  });
                                } catch {
                                  toast.error('Could not read image');
                                }
                              })();
                            }}
                          />
                          {whatsappQrGenerating && !whatsappAttachImage ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Generating dynamic UPI QR…
                            </div>
                          ) : null}
                          {whatsappAttachImage ? (
                            <div className="flex items-center gap-3 rounded-md border p-2">
                              <img
                                src={whatsappAttachImage.previewUrl}
                                alt=""
                                className="h-14 w-14 rounded object-cover bg-muted"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm truncate">{whatsappAttachImage.filename}</p>
                                <p className="text-xs text-muted-foreground">
                                  {whatsappQrMode === 'auto'
                                    ? 'Dynamic QR (amount pre-filled) — sent as photo + caption'
                                    : 'Attached photo — sent as photo + caption / IMAGE template'}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => {
                                  clearWhatsappAttachImage();
                                  setWhatsappQrMode('off');
                                }}
                                aria-label="Remove QR image"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : !whatsappQrGenerating ? (
                            <div className="flex flex-wrap gap-2">
                              {whatsappIncludeUpi && whatsappUpiAccountId ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => setWhatsappQrMode('auto')}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Generate dynamic QR
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => whatsappImageInputRef.current?.click()}
                              >
                                <ImagePlus className="h-4 w-4" />
                                Attach photo
                              </Button>
                            </div>
                          ) : null}
                          {whatsappAttachImage && whatsappQrMode === 'auto' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-muted-foreground"
                              onClick={() => whatsappImageInputRef.current?.click()}
                            >
                              Replace with custom photo
                            </Button>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="pending-wa-message">Message</Label>
                          <Textarea
                            id="pending-wa-message"
                            value={message}
                            onChange={(e) => setWhatsappDraftMessage(e.target.value)}
                            rows={10}
                            disabled={whatsappDraftLoading}
                            className="text-sm font-normal resize-y min-h-[160px]"
                            placeholder={whatsappDraftLoading ? 'Preparing short pay link…' : 'Edit message before sending'}
                          />
                          {canIncludeUpi ? (
                            <p className="text-xs text-muted-foreground">
                              Pay link included. If the customer&apos;s 24h chat window is closed, WhatsApp opens on
                              your phone with the full message and link (cold templates cannot carry URLs).
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          {hasAlternate ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Button
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                disabled={whatsappSending || whatsappDraftLoading}
                                onClick={() => {
                                  if (!primaryPhone) return;
                                  sendWithPhone(primaryPhone);
                                }}
                              >
                                {whatsappSending ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <WhatsAppIcon className="w-4 h-4 mr-2" />
                                )}
                                {whatsappSending ? 'Sending…' : `Primary: ${primaryPhone}`}
                              </Button>
                              <Button
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                disabled={whatsappSending || whatsappDraftLoading}
                                onClick={() => {
                                  if (!alternatePhone) return;
                                  sendWithPhone(alternatePhone);
                                }}
                              >
                                {whatsappSending ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <WhatsAppIcon className="w-4 h-4 mr-2" />
                                )}
                                {whatsappSending ? 'Sending…' : `Alternate: ${alternatePhone}`}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="default"
                              className="w-full bg-green-600 hover:bg-green-700 text-white"
                              disabled={whatsappSending || whatsappDraftLoading}
                              onClick={() => {
                                const phone = primaryPhone || alternatePhone;
                                if (!phone) return;
                                sendWithPhone(phone);
                              }}
                            >
                              {whatsappSending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <WhatsAppIcon className="w-4 h-4 mr-2" />
                              )}
                              {whatsappSending ? 'Sending…' : 'Send WhatsApp message'}
                            </Button>
                          )}
                        </div>
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => setWhatsappDialogOpen(false)}>
                          Close
                        </Button>
                      </DialogFooter>
                    </>
                  );
                })()}
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={callDialogOpen}
          onOpenChange={(o) => {
            setCallDialogOpen(o);
            if (!o) setCallTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            {callTarget && (
              <>
                {(() => {
                  const customer = callTarget.entity_id ? customerLabels[callTarget.entity_id as string] : undefined;
                  const primaryPhone = customer?.phone;
                  const alternatePhone = customer?.alternatePhone;
                  const hasAlternate = !!alternatePhone && alternatePhone.trim() !== (primaryPhone || '').trim();

                  return (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <PhoneCall className="w-5 h-5 text-blue-600" />
                          Call customer
                        </DialogTitle>
                        <DialogDescription>
                          Choose which number to call (if you have both primary and alternate).
                        </DialogDescription>
                      </DialogHeader>

                      <div className="py-4 space-y-3">
                        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                          <div className="text-sm text-gray-700">
                            <strong>Customer:</strong> {customer?.name ?? 'Customer'}
                          </div>
                          <div className="text-sm text-gray-700">
                            <strong>Primary:</strong> {primaryPhone ?? '—'}
                          </div>
                          {hasAlternate && (
                            <div className="text-sm text-gray-700">
                              <strong>Alternate:</strong> {alternatePhone}
                            </div>
                          )}
                        </div>

                        {hasAlternate ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Button
                              variant="default"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => {
                                if (!primaryPhone) return;
                                openCall(primaryPhone);
                                setCallDialogOpen(false);
                              }}
                            >
                              <PhoneCall className="w-4 h-4 mr-2" />
                              Primary: {primaryPhone}
                            </Button>
                            <Button
                              variant="default"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => {
                                if (!alternatePhone) return;
                                openCall(alternatePhone);
                                setCallDialogOpen(false);
                              }}
                            >
                              <PhoneCall className="w-4 h-4 mr-2" />
                              Alternate: {alternatePhone}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="default"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => {
                              if (!primaryPhone) return;
                              openCall(primaryPhone);
                              setCallDialogOpen(false);
                            }}
                          >
                            <PhoneCall className="w-4 h-4 mr-2" />
                            Call {primaryPhone}
                          </Button>
                        )}
                      </div>

                      <DialogFooter>
                        <Button variant="outline" onClick={() => setCallDialogOpen(false)}>
                          Close
                        </Button>
                      </DialogFooter>
                    </>
                  );
                })()}
              </>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

