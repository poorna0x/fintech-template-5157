import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, Loader2, Monitor, PenLine, Send, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';

import EmailSourcePicker from '@/components/admin/EmailSourcePicker';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import type { EmailSourceMode } from '@/lib/admin-email-sources';
import { applyEmailSourceForCustomer, resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  ADMIN_EMAIL_TEMPLATE_META,
  createEmptyBookingForm,
  createEmptyDocumentForm,
  type AdminDocumentEmailData,
  type AdminEmailTemplateType,
} from '@/lib/admin-email-templates';
import { buildAdminWhatsAppMessage } from '@/lib/admin-whatsapp-templates';
import { buildComposerAutoAttachments } from '@/lib/admin-composer-auto-attachments';
import type { BookingConfirmationEmailData } from '@/lib/booking-confirmation-email';
import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import { sendAdminWhatsAppDocument, sendAdminWhatsAppText, sendColdDocumentInvite } from '@/lib/sendAdminWhatsAppApi';

type PreviewMode = 'mobile' | 'desktop';
type MobilePanel = 'compose' | 'preview';
type SendPhase = 'compose' | 'confirm' | 'sent';

interface SentWhatsAppSummary {
  to: string;
  brandLabel: string;
  previewTitle: string;
  via?: 'api' | 'wa_me';
}

const TEMPLATE_ORDER: AdminEmailTemplateType[] = [
  'booking_confirmation',
  'service_bill',
  'invoice',
  'amc_document',
  'quotation',
  'service_reminder',
  'general',
];

export interface AdminWhatsAppComposerPanelProps {
  initialCustomerId?: string | null;
  initialTemplate?: AdminEmailTemplateType;
  onClose?: () => void;
}

export function AdminWhatsAppComposerPanel({
  initialCustomerId,
  initialTemplate = 'general',
  onClose,
}: AdminWhatsAppComposerPanelProps) {
  const loadedCustomerRef = useRef<string | null>(null);
  const confirmSectionRef = useRef<HTMLDivElement>(null);
  const [customerLoading, setCustomerLoading] = useState(Boolean(initialCustomerId));
  const [templateType, setTemplateType] = useState<AdminEmailTemplateType>(initialTemplate);
  const [bookingForm, setBookingForm] = useState<BookingConfirmationEmailData>(() =>
    createEmptyBookingForm()
  );
  const [documentForm, setDocumentForm] = useState<AdminDocumentEmailData>(() =>
    createEmptyDocumentForm()
  );
  const [sendTo, setSendTo] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('mobile');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('compose');
  const [sendPhase, setSendPhase] = useState<SendPhase>('compose');
  const [sentSummary, setSentSummary] = useState<SentWhatsAppSummary | null>(null);
  const [sourceMode, setSourceMode] = useState<EmailSourceMode>('crm');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [crmDataLoaded, setCrmDataLoaded] = useState(false);
  const [sendBrand, setSendBrand] = useState<DocumentBrand>('hydrogenro');
  const [lastServiceBrand, setLastServiceBrand] = useState<DocumentBrand | null>(null);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(initialCustomerId ?? null);
  const [sending, setSending] = useState(false);

  const templateMeta = ADMIN_EMAIL_TEMPLATE_META[templateType];
  const activeBrand: DocumentBrand = sendBrand;
  const activeBrandInfo = useMemo(() => getCompanyInfoForBrand(activeBrand), [activeBrand]);
  const activeBrandLabel = getDocumentBrandLabel(activeBrand);

  const whatsappPreview = useMemo(
    () => buildAdminWhatsAppMessage(templateType, bookingForm, documentForm),
    [templateType, bookingForm, documentForm]
  );

  const previewFrameHeight =
    previewMode === 'mobile' ? 'min(68dvh, 620px)' : 'min(72dvh, 880px)';

  const isPreviewEmpty = useMemo(() => {
    if (sourceMode === 'crm' && (!crmDataLoaded || customerLoading)) return true;
    if (templateType === 'booking_confirmation') {
      return (
        !bookingForm.customerName.trim() &&
        !bookingForm.jobNumber.trim() &&
        !bookingForm.serviceType.trim() &&
        !bookingForm.serviceAddress.trim()
      );
    }
    return !documentForm.customerName.trim() && !documentForm.message.trim() && !documentForm.documentRef.trim();
  }, [sourceMode, crmDataLoaded, customerLoading, templateType, bookingForm, documentForm]);

  const hasAlternate =
    alternatePhone.trim() !== '' && alternatePhone.trim() !== sendTo.trim();

  const handleSourceModeChange = (mode: EmailSourceMode) => {
    setSourceMode(mode);
    if (mode === 'manual') {
      setCrmDataLoaded(true);
      return;
    }
    setCrmDataLoaded(false);
    setSelectedSourceId(null);
  };

  const resetSendFlow = useCallback(() => {
    setSendPhase('compose');
    setSentSummary(null);
  }, []);

  useEffect(() => {
    if (sendPhase === 'sent') return;
    setSendPhase('compose');
  }, [templateType, sendTo, sendBrand, whatsappPreview.text]);

  useEffect(() => {
    if (sendPhase === 'confirm') {
      confirmSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [sendPhase]);

  const updateSendBrand = (value: DocumentBrand) => {
    setSendBrand(value);
    setBookingForm((prev) => ({ ...prev, documentBrand: value }));
    setDocumentForm((prev) => ({ ...prev, documentBrand: value }));
  };

  const sendBrandHint = useMemo(() => {
    if (lastServiceBrand) {
      const lastLabel = getDocumentBrandLabel(lastServiceBrand);
      if (sendBrand === lastServiceBrand) {
        return `Defaulted to last brand served (${lastLabel}). You can change below.`;
      }
      return `Last brand served: ${lastLabel}. Currently ${activeBrandLabel} — change below if needed.`;
    }
    if (linkedCustomerId) {
      return `No completed service brand on file — using ${activeBrandLabel}. You can change below.`;
    }
    return 'Load a customer to auto-pick their last served brand, or choose below.';
  }, [lastServiceBrand, linkedCustomerId, sendBrand, activeBrandLabel]);

  const handleApplySource = useCallback(
    (
      result: {
        bookingForm?: Partial<BookingConfirmationEmailData>;
        documentForm?: Partial<AdminDocumentEmailData>;
        recipientPhone?: string;
        alternatePhone?: string;
        sendBrand?: DocumentBrand;
        lastServiceBrand?: DocumentBrand | null;
        sourceRecordId?: string;
        customerId?: string;
      } | null
    ) => {
      if (!result) return;
      setCrmDataLoaded(true);
      if (result.customerId) {
        setLinkedCustomerId(result.customerId);
      }
      if (result.sourceRecordId) {
        setSelectedSourceId(result.sourceRecordId);
      }
      if (result.sendBrand) {
        setSendBrand(result.sendBrand);
        setBookingForm((prev) => ({ ...prev, documentBrand: result.sendBrand }));
        setDocumentForm((prev) => ({ ...prev, documentBrand: result.sendBrand! }));
      }
      setLastServiceBrand(result.lastServiceBrand ?? null);
      if (result.bookingForm) {
        setBookingForm((prev) => ({ ...prev, ...result.bookingForm }));
      }
      if (result.documentForm) {
        setDocumentForm((prev) => ({ ...prev, ...result.documentForm }));
      }
      if (result.recipientPhone?.trim()) {
        setSendTo(result.recipientPhone.trim());
      } else if (result.bookingForm?.phone?.trim()) {
        setSendTo(result.bookingForm.phone.trim());
      }
      setAlternatePhone(result.alternatePhone?.trim() || '');
    },
    []
  );

  const loadCustomerSource = useCallback(
    async (customerId: string, tpl: AdminEmailTemplateType) => {
      setSourceMode('crm');
      setCustomerLoading(true);

      try {
        const result = await applyEmailSourceForCustomer(tpl, customerId);
        if (!result) {
          toast.error('Could not load customer for WhatsApp');
          return;
        }

        handleApplySource(result);

        const phone = result.recipientPhone?.trim() || result.bookingForm?.phone?.trim();
        if (!phone) {
          toast.error('This customer has no phone number on file');
          return;
        }

        if (tpl === 'booking_confirmation') {
          const hasJob = Boolean(result.bookingForm?.jobNumber?.trim());
          if (hasJob) {
            toast.success('Loaded ongoing job details');
          } else {
            toast.message('No ongoing job found — filled customer details instead');
          }
        }
      } finally {
        setCustomerLoading(false);
      }
    },
    [handleApplySource]
  );

  const handleTemplateChange = (value: AdminEmailTemplateType) => {
    const sharedCustomerName =
      templateType === 'booking_confirmation'
        ? bookingForm.customerName.trim()
        : documentForm.customerName.trim();

    setTemplateType(value);
    setSelectedSourceId(null);
    setLastServiceBrand(null);
    setCrmDataLoaded(false);
    setSourceMode('crm');

    if (value === 'booking_confirmation') {
      setBookingForm({
        ...createEmptyBookingForm(sendBrand),
        ...(sharedCustomerName ? { customerName: sharedCustomerName } : {}),
      });
    } else {
      setDocumentForm({
        ...createEmptyDocumentForm(sendBrand),
        ...(sharedCustomerName ? { customerName: sharedCustomerName } : {}),
      });
    }

    if (initialCustomerId) {
      void loadCustomerSource(initialCustomerId, value);
    } else if (linkedCustomerId) {
      void resolveCustomerSendBrand(linkedCustomerId).then(({ sendBrand: brand, lastServiceBrand: last }) => {
        setSendBrand(brand);
        setLastServiceBrand(last);
        setBookingForm((prev) => ({ ...prev, documentBrand: brand }));
        setDocumentForm((prev) => ({ ...prev, documentBrand: brand }));
      });
    }
  };

  useEffect(() => {
    if (!initialCustomerId) return;

    const tpl = TEMPLATE_ORDER.includes(initialTemplate) ? initialTemplate : 'general';
    const loadKey = `${initialCustomerId}:${tpl}`;
    if (loadedCustomerRef.current === loadKey) return;
    loadedCustomerRef.current = loadKey;

    void (async () => {
      setTemplateType(tpl);
      await loadCustomerSource(initialCustomerId, tpl);
    })();
  }, [initialCustomerId, initialTemplate, loadCustomerSource]);

  const updateBookingField = <K extends keyof BookingConfirmationEmailData>(
    key: K,
    value: BookingConfirmationEmailData[K]
  ) => {
    setBookingForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateDocumentField = <K extends keyof AdminDocumentEmailData>(
    key: K,
    value: AdminDocumentEmailData[K]
  ) => {
    setDocumentForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleReviewSend = () => {
    if (!sendTo.trim()) {
      toast.error('Enter a recipient phone number');
      return;
    }
    setMobilePanel('compose');
    setSendPhase('confirm');
  };

  const handleOpenWhatsApp = async (phone: string) => {
    if (!phone.trim()) {
      toast.error('Enter a recipient phone number');
      return;
    }
    if (sending) return;
    setSending(true);
    try {
      const wantsPdf = Boolean(templateMeta.autoAttachPdf && selectedSourceId);
      if (wantsPdf) {
        toast.message('Generating PDF…');
        let attachments;
        try {
          attachments = await buildComposerAutoAttachments({
            templateType,
            sourceRecordId: selectedSourceId,
            documentBrand: activeBrand,
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not generate PDF');
          return;
        }
        const pdf = attachments[0];
        if (!pdf?.content) {
          toast.error('No PDF to send');
          return;
        }
        const docResult = await sendAdminWhatsAppDocument({
          to: phone.trim(),
          pdfBase64: pdf.content,
          filename: pdf.filename,
          caption: whatsappPreview.text.slice(0, 1024),
          customerId: linkedCustomerId,
        });
        if (!docResult.ok) {
          if (docResult.needsWindowOrTemplate) {
            const customerName =
              (templateType === 'booking_confirmation'
                ? bookingForm.customerName
                : documentForm.customerName
              ).trim() || 'Customer';
            const invite = await sendColdDocumentInvite({
              to: phone.trim(),
              kind: templateType,
              customerName,
              customerId: linkedCustomerId,
              ref: documentForm.documentRef?.trim() || undefined,
              amount: undefined,
              documentLabel:
                templateType === 'quotation'
                  ? 'quotation'
                  : templateType === 'invoice'
                    ? 'tax invoice'
                    : templateType === 'service_bill'
                      ? 'service bill'
                      : templateType === 'amc_document'
                        ? 'AMC agreement'
                        : templateType === 'warranty_document'
                          ? 'warranty card'
                          : 'document',
            });
            if (invite.ok) {
              toast.success(
                '24h window closed — invite template sent. When they reply, send the PDF again.'
              );
              return;
            }
            toast.error(
              invite.error ||
                '24h window closed — customer must message first before PDF can send'
            );
            return;
          }
          toast.error(docResult.error || 'PDF send failed');
          return;
        }
        setSentSummary({
          to: phone.trim(),
          brandLabel: activeBrandLabel,
          previewTitle: whatsappPreview.previewTitle,
          via: 'api',
        });
        setSendPhase('sent');
        toast.success(`PDF sent via WhatsApp to ${phone.trim()}`);
        return;
      }

      const result = await sendAdminWhatsAppText({
        to: phone.trim(),
        text: whatsappPreview.text,
        customerId: linkedCustomerId,
        fallbackWaMe: true,
      });
      if (!result.ok) {
        toast.error(result.error || 'Send failed');
        return;
      }
      setSentSummary({
        to: phone.trim(),
        brandLabel: activeBrandLabel,
        previewTitle: whatsappPreview.previewTitle,
        via: result.via,
      });
      setSendPhase('sent');
      if (result.via === 'api') {
        toast.success(`Sent via WhatsApp API to ${phone.trim()}`);
      } else {
        toast.message(
          result.needsWindowOrTemplate
            ? '24h window closed — opened phone WhatsApp instead'
            : `Opened WhatsApp for ${phone.trim()}`
        );
      }
    } finally {
      setSending(false);
    }
  };

  const renderSendCard = (compact = false) => (
    <Card className={compact ? 'border-0 shadow-none rounded-none' : undefined}>
      {!compact && (
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Send WhatsApp</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Sends via WhatsApp Cloud API when the 24h window is open. Service bill / tax invoice
            PDFs attach automatically when a source is selected.
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className={compact ? 'p-3 pt-0 space-y-3' : 'space-y-4'}>
        {sendPhase === 'sent' && sentSummary && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <AlertTitle className="text-emerald-900">WhatsApp opened</AlertTitle>
            <AlertDescription className="text-emerald-800 space-y-2">
              <p>
                Message prepared as <span className="font-medium">{sentSummary.brandLabel}</span> for{' '}
                <span className="font-medium break-all">{sentSummary.to}</span>
              </p>
              <p className="text-xs sm:text-sm">{sentSummary.previewTitle}</p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-emerald-300 bg-white hover:bg-emerald-50"
                  onClick={resetSendFlow}
                >
                  Send another
                </Button>
                {onClose && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-black hover:bg-gray-800 text-white"
                    onClick={onClose}
                  >
                    Done
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {sendPhase === 'confirm' && (
          <div
            ref={confirmSectionRef}
            className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-3"
          >
            <div className="rounded-lg border border-white/80 bg-white p-4 text-center">
              <p className="text-xs sm:text-sm text-slate-500 mb-1.5">You are about to send this message as</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{activeBrandLabel}</p>
              <p className="text-xs text-slate-500 mt-1.5">
                Phone: {activeBrandInfo.phone} · Email: {activeBrandInfo.email}
              </p>
            </div>

            <p className="text-sm font-semibold text-slate-900">Confirm before sending</p>
            <div className="rounded-lg border border-white/80 bg-white p-3 text-sm space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-slate-500">Send as</span>
                <span className="font-medium text-slate-900">{activeBrandLabel}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="text-slate-500">To</span>
                <span className="font-medium text-slate-900 break-all">{sendTo.trim()}</span>
              </div>
              <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                {whatsappPreview.text}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setSendPhase('compose')}
              >
                Back
              </Button>
              {hasAlternate ? (
                <>
                  <Button
                    type="button"
                    className="w-full sm:flex-1 bg-black hover:bg-gray-800 text-white"
                    disabled={sending}
                    onClick={() => void handleOpenWhatsApp(sendTo)}
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <WhatsAppIcon className="w-4 h-4 mr-2" />
                    )}
                    Primary: {sendTo}
                  </Button>
                  <Button
                    type="button"
                    className="w-full sm:flex-1 bg-black hover:bg-gray-800 text-white"
                    disabled={sending}
                    onClick={() => void handleOpenWhatsApp(alternatePhone)}
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <WhatsAppIcon className="w-4 h-4 mr-2" />
                    )}
                    Alternate: {alternatePhone}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  className="w-full sm:flex-1 bg-black hover:bg-gray-800 text-white"
                  disabled={sending}
                  onClick={() => void handleOpenWhatsApp(sendTo)}
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <WhatsAppIcon className="w-4 h-4 mr-2" />
                  )}
                  Send WhatsApp
                </Button>
              )}
            </div>
          </div>
        )}

        {sendPhase !== 'sent' && sendPhase !== 'confirm' && (
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <Label htmlFor="admin-whatsapp-recipient" className="text-sm">
                Recipient phone
              </Label>
              <Input
                id="admin-whatsapp-recipient"
                type="tel"
                placeholder="9876543210"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                className="w-full"
              />
              {hasAlternate && (
                <p className="text-xs text-slate-500">Alternate on file: {alternatePhone}</p>
              )}
            </div>
            <Button
              type="button"
              onClick={handleReviewSend}
              className="w-full bg-black hover:bg-gray-800 text-white hover:text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              Review & open WhatsApp
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderPreviewPanel = () => (
    <div className="space-y-3 min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">
          Preview — {templateMeta.label} · {activeBrandLabel}
        </p>
        <p className="text-xs text-slate-500 sm:truncate sm:max-w-[50%]">
          {isPreviewEmpty ? 'Select a record or enter details' : whatsappPreview.previewTitle}
        </p>
      </div>

      {isPreviewEmpty ? (
        <div
          className={
            previewMode === 'mobile'
              ? 'mx-auto w-full max-w-[390px] rounded-xl border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-center px-6'
              : 'w-full rounded-xl border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-center px-6'
          }
          style={{ height: previewFrameHeight, minHeight: '240px' }}
        >
          <WhatsAppIcon className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">No preview yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            Search and select a customer or job above — customer details and message preview appear
            after you pick a record.
          </p>
        </div>
      ) : (
        <div
          className={
            previewMode === 'mobile'
              ? 'mx-auto w-full max-w-[390px] rounded-xl border border-slate-300 bg-[#e5ddd5] shadow-lg overflow-hidden flex flex-col'
              : 'w-full rounded-xl border border-slate-300 bg-[#e5ddd5] shadow-lg overflow-hidden flex flex-col'
          }
          style={{ height: previewFrameHeight, minHeight: '240px' }}
        >
          {previewMode === 'mobile' && (
            <div className="h-6 bg-[#075e54] flex items-center justify-center shrink-0">
              <div className="w-16 h-1 rounded-full bg-white/30" />
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[88%] rounded-lg rounded-tr-none bg-[#dcf8c6] px-3 py-2 text-sm text-slate-900 whitespace-pre-wrap shadow-sm">
                {whatsappPreview.text}
              </div>
            </div>
            <p className="text-[10px] text-slate-500 text-right pr-1">Preview only</p>
          </div>
        </div>
      )}
    </div>
  );

  const renderComposePanel = () => (
    <div className="space-y-4 pb-24 xl:pb-0">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Template</CardTitle>
          <CardDescription className="text-xs sm:text-sm">{templateMeta.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={templateType} onValueChange={(v) => handleTemplateChange(v as AdminEmailTemplateType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {ADMIN_EMAIL_TEMPLATE_META[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Send as</CardTitle>
          <CardDescription className="text-xs sm:text-sm">{sendBrandHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={sendBrand} onValueChange={(value: DocumentBrand) => updateSendBrand(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hydrogenro">Hydrogen RO</SelectItem>
              <SelectItem value="elevenro">Eleven RO</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Message content</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Edit fields to update the live preview.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <EmailSourcePicker
            templateType={templateType}
            sourceMode={sourceMode}
            onSourceModeChange={handleSourceModeChange}
            selectedSourceId={selectedSourceId}
            onSelectedSourceIdChange={setSelectedSourceId}
            onApply={handleApplySource}
          />

          {sourceMode === 'crm' && customerLoading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700">Loading customer details…</p>
            </div>
          ) : sourceMode === 'crm' && !crmDataLoaded ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">No record selected</p>
              <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto">
                Search and select a customer or job above. Customer details and message preview will
                appear after you select a record.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Customer name</Label>
                <Input
                  placeholder="Customer name"
                  value={
                    templateType === 'booking_confirmation'
                      ? bookingForm.customerName
                      : documentForm.customerName
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    if (templateType === 'booking_confirmation') {
                      updateBookingField('customerName', value);
                    } else {
                      updateDocumentField('customerName', value);
                    }
                  }}
                />
              </div>

              {templateType === 'booking_confirmation' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Job number</Label>
                      <Input
                        value={bookingForm.jobNumber}
                        onChange={(e) => updateBookingField('jobNumber', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Time slot</Label>
                      <Select
                        value={bookingForm.scheduledTimeSlot}
                        onValueChange={(value) => updateBookingField('scheduledTimeSlot', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIRST_HALF">Morning (9 AM - 2 PM)</SelectItem>
                          <SelectItem value="SECOND_HALF">Afternoon (2 PM - 8 PM)</SelectItem>
                          <SelectItem value="MORNING">Morning (9 AM - 12 PM)</SelectItem>
                          <SelectItem value="AFTERNOON">Afternoon (12 PM - 5 PM)</SelectItem>
                          <SelectItem value="EVENING">Evening (5 PM - 8 PM)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Service type</Label>
                      <Input
                        value={bookingForm.serviceType}
                        onChange={(e) => updateBookingField('serviceType', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Service sub-type</Label>
                      <Input
                        value={bookingForm.serviceSubType}
                        onChange={(e) => updateBookingField('serviceSubType', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Device brand</Label>
                      <Input
                        value={bookingForm.brand}
                        onChange={(e) => updateBookingField('brand', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Device model</Label>
                      <Input
                        value={bookingForm.model}
                        onChange={(e) => updateBookingField('model', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Service date</Label>
                    <Input
                      type="date"
                      value={bookingForm.scheduledDate}
                      onChange={(e) => updateBookingField('scheduledDate', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Service address</Label>
                    <Textarea
                      rows={3}
                      value={bookingForm.serviceAddress}
                      onChange={(e) => updateBookingField('serviceAddress', e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  {templateMeta.showDocumentRef && (
                    <div className="space-y-2">
                      <Label>
                        {templateType === 'invoice'
                          ? 'Invoice number'
                          : templateType === 'quotation'
                            ? 'Quotation number'
                            : 'Reference number'}
                      </Label>
                      <Input
                        value={documentForm.documentRef}
                        onChange={(e) => updateDocumentField('documentRef', e.target.value)}
                      />
                    </div>
                  )}

                  {(templateMeta.showAmount || templateMeta.showDueDate) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {templateMeta.showAmount && (
                        <div className="space-y-2">
                          <Label>Amount</Label>
                          <Input
                            value={documentForm.amount}
                            onChange={(e) => updateDocumentField('amount', e.target.value)}
                            placeholder="₹4,500"
                          />
                        </div>
                      )}
                      {templateMeta.showDueDate && (
                        <div className="space-y-2">
                          <Label>
                            {templateType === 'service_reminder' ? 'Suggested date' : 'Valid / due date'}
                          </Label>
                          <Input
                            type="date"
                            value={documentForm.dueDate}
                            onChange={(e) => updateDocumentField('dueDate', e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea
                      rows={5}
                      value={documentForm.message}
                      onChange={(e) => updateDocumentField('message', e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="hidden xl:block">{renderSendCard()}</div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-100">
      <div className="border-b bg-white shrink-0 safe-area-top">
        <div className="px-3 sm:px-6 py-3 sm:py-4 flex flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <WhatsAppIcon className="w-5 h-5 text-slate-900 shrink-0" />
              Send WhatsApp
            </h2>
            <p className="hidden sm:block text-sm text-slate-500 mt-0.5">
              Compose branded WhatsApp messages — booking, AMC, invoice, quotation, reminders, and more.
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button
              type="button"
              variant={previewMode === 'mobile' ? 'default' : 'outline'}
              size="sm"
              className="px-2 sm:px-3"
              onClick={() => setPreviewMode('mobile')}
            >
              <Smartphone className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Mobile</span>
            </Button>
            <Button
              type="button"
              variant={previewMode === 'desktop' ? 'default' : 'outline'}
              size="sm"
              className="px-2 sm:px-3"
              onClick={() => setPreviewMode('desktop')}
            >
              <Monitor className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Desktop</span>
            </Button>
            {onClose && (
              <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-md hover:bg-muted/45 active:bg-muted/60 focus-visible:ring-0 focus-visible:ring-offset-0 [-webkit-tap-highlight-color:transparent]">
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        <Tabs
          value={mobilePanel}
          onValueChange={(value) => setMobilePanel(value as MobilePanel)}
          className="xl:hidden border-t bg-white px-3 pb-0"
        >
          <TabsList className="grid w-full grid-cols-2 h-10">
            <TabsTrigger value="compose" className="text-sm">
              <PenLine className="w-4 h-4 mr-1.5" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-sm">
              <Eye className="w-4 h-4 mr-1.5" />
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
          <div className="xl:hidden">
            {mobilePanel === 'compose' ? renderComposePanel() : renderPreviewPanel()}
          </div>
          <div className="hidden xl:grid xl:grid-cols-2 gap-6">
            {renderComposePanel()}
            {renderPreviewPanel()}
          </div>
        </div>
      </div>

      {(mobilePanel === 'compose' || sendPhase !== 'compose') && (
        <div className="xl:hidden shrink-0 border-t bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)] safe-area-bottom">
          {renderSendCard(true)}
        </div>
      )}
    </div>
  );
}

export interface AdminWhatsAppComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCustomerId?: string | null;
  initialTemplate?: AdminEmailTemplateType;
}

export default function AdminWhatsAppComposerDialog({
  open,
  onOpenChange,
  initialCustomerId,
  initialTemplate = 'general',
}: AdminWhatsAppComposerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-w-[100vw] sm:max-w-[98vw] w-full h-[100dvh] sm:h-[96vh] max-h-[100dvh] sm:max-h-[96vh] p-0 gap-0 overflow-hidden flex flex-col rounded-none sm:rounded-lg"
      >
        {open ? (
          <AdminWhatsAppComposerPanel
            key={`${initialCustomerId ?? 'blank'}-${initialTemplate}`}
            initialCustomerId={initialCustomerId}
            initialTemplate={initialTemplate}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
