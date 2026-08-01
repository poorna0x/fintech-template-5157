import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Loader2,
  Mail,
  Monitor,
  Moon,
  PenLine,
  Send,
  Smartphone,
  Sun,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import EmailAttachmentDropzone from '@/components/admin/EmailAttachmentDropzone';
import EmailSourcePicker from '@/components/admin/EmailSourcePicker';
import type { EmailSourceMode } from '@/lib/admin-email-sources';
import {
  applyEmailSourceForCustomer,
  applyEmailSourceRecord,
  resolveCustomerSendBrand,
  resolveDefaultEmailTemplateForCustomer,
} from '@/lib/admin-email-sources';
import { buildJobCompletionMessage } from '@/lib/job-completion-message';
import { getValidCustomerEmail } from '@/lib/customer-email';
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
  buildComposerAutoAttachments,
  getPredictedAutoAttachmentNames,
} from '@/lib/admin-composer-auto-attachments';
import {
  formatAttachmentSize,
  stripAttachmentPayload,
  type EmailAttachmentItem,
} from '@/lib/admin-email-attachments';
import {
  ADMIN_EMAIL_TEMPLATE_META,
  buildAdminEmail,
  createEmptyBookingForm,
  createEmptyDocumentForm,
  type AdminDocumentEmailData,
  type AdminEmailTemplateType,
} from '@/lib/admin-email-templates';
import type { BookingConfirmationEmailData } from '@/lib/booking-confirmation-email';
import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import { emailService } from '@/lib/email';
import {
  ensureSupabaseSessionForWrite,
  resolveSupabaseAccessTokenForApi,
} from '@/lib/ensureSupabaseSession';
import { forceLightSelectContentClass, forceLightThemeClass } from '@/lib/force-light-theme';
import { wrapEmailHtmlForPreview, type EmailPreviewTheme } from '@/lib/email-preview-html';

type PreviewMode = 'mobile' | 'desktop';
type MobilePanel = 'compose' | 'preview';
type SendPhase = 'compose' | 'confirm' | 'sending' | 'sent';

interface SentEmailSummary {
  to: string;
  subject: string;
  brandLabel: string;
  attachmentCount: number;
  attachmentBytes: number;
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

const COMPLETED_JOB_TEMPLATE_ORDER: AdminEmailTemplateType[] = ['job_completion'];

export type AdminEmailComposerContext = 'default' | 'completed_job';

export interface AdminEmailComposerPanelProps {
  initialCustomerId?: string | null;
  initialJobId?: string | null;
  initialTemplate?: AdminEmailTemplateType;
  composerContext?: AdminEmailComposerContext;
  initialForcedBrand?: DocumentBrand | null;
  onClose?: () => void;
  onCompletionMailSent?: (jobId: string) => void | Promise<void>;
}

export function AdminEmailComposerPanel({
  initialCustomerId,
  initialJobId,
  initialTemplate = 'general',
  composerContext = 'default',
  initialForcedBrand = null,
  onClose,
  onCompletionMailSent,
}: AdminEmailComposerPanelProps) {
  const loadedCustomerRef = useRef<string | null>(null);
  const confirmSectionRef = useRef<HTMLDivElement>(null);
  const [customerLoading, setCustomerLoading] = useState(
    Boolean(initialCustomerId) || Boolean(initialJobId && composerContext === 'completed_job')
  );
  const [templateType, setTemplateType] = useState<AdminEmailTemplateType>(
    composerContext === 'completed_job' ? 'job_completion' : initialTemplate
  );
  const [bookingForm, setBookingForm] = useState<BookingConfirmationEmailData>(() =>
    createEmptyBookingForm()
  );
  const [documentForm, setDocumentForm] = useState<AdminDocumentEmailData>(() =>
    createEmptyDocumentForm()
  );
  const [attachments, setAttachments] = useState<EmailAttachmentItem[]>([]);
  const [sendTo, setSendTo] = useState('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('mobile');
  const [previewTheme, setPreviewTheme] = useState<EmailPreviewTheme>('light');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('compose');
  const [sendPhase, setSendPhase] = useState<SendPhase>('compose');
  const [sentSummary, setSentSummary] = useState<SentEmailSummary | null>(null);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sourceMode, setSourceMode] = useState<EmailSourceMode>('crm');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [crmDataLoaded, setCrmDataLoaded] = useState(false);
  const [sendBrand, setSendBrand] = useState<DocumentBrand>('elevenro');
  const [lastServiceBrand, setLastServiceBrand] = useState<DocumentBrand | null>(null);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(initialCustomerId ?? null);
  const [linkedJobId, setLinkedJobId] = useState<string | null>(initialJobId ?? null);

  const templateOptions =
    composerContext === 'completed_job' ? COMPLETED_JOB_TEMPLATE_ORDER : TEMPLATE_ORDER;
  const isCompletedJobComposer = composerContext === 'completed_job';

  const templateMeta = ADMIN_EMAIL_TEMPLATE_META[templateType];
  const activeBrand: DocumentBrand = sendBrand;
  const activeBrandInfo = useMemo(() => getCompanyInfoForBrand(activeBrand), [activeBrand]);
  const activeBrandLabel = getDocumentBrandLabel(activeBrand);

  const predictedAutoAttachments = useMemo(
    () =>
      templateMeta.autoAttachPdf && selectedSourceId
        ? getPredictedAutoAttachmentNames(templateType, documentForm.documentRef)
        : [],
    [templateMeta.autoAttachPdf, selectedSourceId, templateType, documentForm.documentRef]
  );

  const emailPreview = useMemo(
    () =>
      buildAdminEmail(templateType, bookingForm, documentForm, {
        attachmentNames: [
          ...predictedAutoAttachments,
          ...attachments.map((a) => a.filename),
        ],
      }),
    [templateType, bookingForm, documentForm, attachments, predictedAutoAttachments]
  );
  const attachmentBytes = useMemo(
    () => attachments.reduce((sum, file) => sum + file.size, 0),
    [attachments]
  );
  const previewFrameHeight =
    previewMode === 'mobile' ? 'min(68dvh, 620px)' : 'min(72dvh, 880px)';

  const previewHtml = useMemo(
    () => wrapEmailHtmlForPreview(emailPreview.html, previewTheme),
    [emailPreview.html, previewTheme]
  );

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
  }, [templateType, sendTo, attachments.length, sendBrand, emailPreview.subject]);

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
      return `No completed service brand on file — defaulted to ${activeBrandLabel}. You can change below.`;
    }
    return `Default send brand is ${activeBrandLabel}. Load a customer to use their last served brand.`;
  }, [lastServiceBrand, linkedCustomerId, sendBrand, activeBrandLabel]);

  const handleApplySource = useCallback(
    (
      result: {
        bookingForm?: Partial<BookingConfirmationEmailData>;
        documentForm?: Partial<AdminDocumentEmailData>;
        recipientEmail?: string;
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
      if (result.recipientEmail?.trim()) {
        const email = getValidCustomerEmail(result.recipientEmail);
        if (email) setSendTo(email);
      }
    },
    []
  );

  const applyForcedCompletionBrand = useCallback((forcedBrand: DocumentBrand) => {
    setSendBrand(forcedBrand);
    setDocumentForm((prev) => {
      const amountCollected =
        parseFloat(String(prev.amount || '').replace(/[^\d.-]/g, '')) || 0;
      const amountPending =
        parseFloat(String(prev.completionPendingAmount || '').replace(/[^\d.-]/g, '')) || 0;
      return {
        ...prev,
        documentBrand: forcedBrand,
        message: buildJobCompletionMessage({
          customerName: prev.customerName,
          serviceType: prev.completionServiceType || '',
          serviceSubType: prev.completionServiceSubType || '',
          amountCollected,
          amountPending,
          pendingDueDate: prev.completionPendingDueDate || prev.dueDate || null,
          documentBrand: forcedBrand,
        }),
      };
    });
  }, []);

  const loadJobCompletionSource = useCallback(
    async (jobId: string, forcedBrand?: DocumentBrand | null) => {
      setSourceMode('crm');
      setCustomerLoading(true);

      try {
        const result = await applyEmailSourceRecord('job_completion', jobId);
        if (!result) {
          toast.error('Could not load completed job for email');
          return;
        }

        handleApplySource(result);
        setLinkedJobId(jobId);

        if (forcedBrand) {
          applyForcedCompletionBrand(forcedBrand);
        }

        const email = getValidCustomerEmail(result.recipientEmail);
        if (!email) {
          toast.error('This customer has no email on file');
          return;
        }

        toast.success('Loaded completed job details');
      } finally {
        setCustomerLoading(false);
      }
    },
    [handleApplySource, applyForcedCompletionBrand]
  );

  const loadCustomerSource = useCallback(
    async (customerId: string, tpl: AdminEmailTemplateType) => {
      setSourceMode('crm');
      setCustomerLoading(true);

      try {
        const result = await applyEmailSourceForCustomer(tpl, customerId);
        if (!result) {
          toast.error(
            tpl === 'service_bill'
              ? 'No completed job found for this customer'
              : 'Could not load customer for email'
          );
          return;
        }

        handleApplySource(result);

        const email = getValidCustomerEmail(result.recipientEmail);
        if (!email) {
          toast.error('This customer has no email on file');
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
    if (composerContext === 'completed_job') return;
    if (!initialCustomerId) return;

    const loadKey = `${initialCustomerId}:${initialTemplate}`;
    if (loadedCustomerRef.current === loadKey) return;
    loadedCustomerRef.current = loadKey;

    const tpl = TEMPLATE_ORDER.includes(initialTemplate) ? initialTemplate : 'general';

    void (async () => {
      let resolvedTpl = tpl;
      if (resolvedTpl === 'general') {
        resolvedTpl = await resolveDefaultEmailTemplateForCustomer(initialCustomerId);
      }
      setTemplateType(resolvedTpl);
      await loadCustomerSource(initialCustomerId, resolvedTpl);
    })();
  }, [composerContext, initialCustomerId, initialTemplate, loadCustomerSource]);

  useEffect(() => {
    if (composerContext !== 'completed_job' || !initialJobId) return;

    const loadKey = `job:${initialJobId}`;
    if (loadedCustomerRef.current === loadKey) return;
    loadedCustomerRef.current = loadKey;

    void (async () => {
      setTemplateType('job_completion');
      await loadJobCompletionSource(initialJobId, initialForcedBrand);
    })();
  }, [composerContext, initialJobId, initialForcedBrand, loadJobCompletionSource]);

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
      toast.error('Enter a recipient email address');
      return;
    }
    if (attachmentsUploading) {
      toast.error('Wait for attachments to finish uploading');
      return;
    }
    setMobilePanel('compose');
    setSendPhase('confirm');
  };

  const handleConfirmSend = async () => {
    if (!sendTo.trim()) {
      toast.error('Enter a recipient email address');
      return;
    }

    const sessionReady = await ensureSupabaseSessionForWrite();
    if (!sessionReady.ok) {
      toast.error('Could not refresh your session. Please try again in a moment.');
      setSendPhase('confirm');
      return;
    }

    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) {
      toast.error('Sign in as admin to send email');
      setSendPhase('confirm');
      return;
    }

    setSendPhase('sending');
    setSending(true);

    let sendAttachments = attachments.map(stripAttachmentPayload);
    if (templateMeta.autoAttachPdf && selectedSourceId) {
      try {
        const autoAttachments = await buildComposerAutoAttachments({
          templateType,
          sourceRecordId: selectedSourceId,
          documentBrand: activeBrand,
        });
        const existingNames = new Set(sendAttachments.map((a) => a.filename.toLowerCase()));
        for (const attachment of autoAttachments) {
          if (!existingNames.has(attachment.filename.toLowerCase())) {
            sendAttachments = [...sendAttachments, attachment];
          }
        }
      } catch (error) {
        setSending(false);
        setSendPhase('confirm');
        toast.error(
          error instanceof Error ? error.message : 'Could not generate PDF attachment'
        );
        return;
      }
    }

    const result = await emailService.sendAdminComposerEmail(
      {
        templateType,
        documentBrand: activeBrand,
        to: sendTo.trim(),
        subject: emailPreview.subject,
        html: emailPreview.html,
        text: emailPreview.text,
        attachments: sendAttachments,
        jobId: linkedJobId,
        customerId: linkedCustomerId,
      },
      accessToken
    );
    setSending(false);

    if (result.ok) {
      const summary: SentEmailSummary = {
        to: sendTo.trim(),
        subject: emailPreview.subject,
        brandLabel: getDocumentBrandLabel(activeBrand),
        attachmentCount: sendAttachments.length,
        attachmentBytes: sendAttachments.reduce((sum, file) => sum + file.size, 0),
      };
      setSentSummary(summary);
      setSendPhase('sent');
      toast.success(
        sendAttachments.length
          ? `Email sent from ${activeBrandLabel} to ${sendTo.trim()} with ${sendAttachments.length} attachment(s)`
          : `Email sent from ${activeBrandLabel} to ${sendTo.trim()}`
      );
      if (isCompletedJobComposer && linkedJobId && onCompletionMailSent) {
        await onCompletionMailSent(linkedJobId);
      }
    } else {
      setSendPhase('confirm');
      toast.error(result.error || 'Could not send email');
    }
  };

  const renderSendCard = (compact = false) => (
    <Card className={compact ? 'border-0 shadow-none rounded-none' : undefined}>
      {!compact && (
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Send email</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Uses the same Hostinger SMTP as booking confirmations. You must be signed in as admin.
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className={compact ? 'p-3 pt-0 space-y-3' : 'space-y-4'}>
        {sendPhase === 'sent' && sentSummary && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <AlertTitle className="text-emerald-900">Email sent successfully</AlertTitle>
            <AlertDescription className="text-emerald-800 space-y-2">
              <p>
                Sent as <span className="font-medium">{sentSummary.brandLabel}</span> to{' '}
                <span className="font-medium break-all">{sentSummary.to}</span>
              </p>
              <p className="text-xs sm:text-sm truncate" title={sentSummary.subject}>
                Subject: {sentSummary.subject}
              </p>
              {sentSummary.attachmentCount > 0 && (
                <p className="text-xs sm:text-sm">
                  {sentSummary.attachmentCount} attachment
                  {sentSummary.attachmentCount === 1 ? '' : 's'} (
                  {formatAttachmentSize(sentSummary.attachmentBytes)})
                </p>
              )}
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
              <p className="text-xs sm:text-sm text-slate-500 mb-1.5">You are about to send this email as</p>
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
              <div className="flex flex-col gap-1">
                <span className="text-slate-500">Subject</span>
                <span className="font-medium text-slate-900 break-words">{emailPreview.subject}</span>
              </div>
              {attachments.length > 0 ? (
                <div className="pt-1 border-t border-slate-100">
                  <p className="text-slate-500 mb-1.5">
                    {attachments.length} attachment{attachments.length === 1 ? '' : 's'} ·{' '}
                    {formatAttachmentSize(attachmentBytes)}
                  </p>
                  <ul className="space-y-1">
                    {attachments.map((file) => (
                      <li key={file.id} className="text-xs text-slate-700 truncate flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        {file.filename}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-500 pt-1 border-t border-slate-100">No attachments</p>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={sending}
                onClick={() => setSendPhase('compose')}
              >
                Back
              </Button>
              <Button
                type="button"
                className="w-full sm:flex-1 bg-black hover:bg-gray-800 text-white"
                disabled={sending}
                onClick={() => void handleConfirmSend()}
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send from {activeBrandLabel}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {sendPhase !== 'sent' && sendPhase !== 'confirm' && (
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <Label htmlFor="admin-email-recipient" className="text-sm">
                Recipient
              </Label>
              <Input
                id="admin-email-recipient"
                type="email"
                placeholder="customer@example.com"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                disabled={sending}
                className="w-full"
              />
            </div>
            <Button
              type="button"
              onClick={handleReviewSend}
              disabled={sending || attachmentsUploading}
              className="w-full bg-black hover:bg-gray-800 text-white hover:text-white"
            >
              {attachmentsUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading files…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Review & send
                </>
              )}
            </Button>
          </div>
        )}

        {sendPhase === 'sending' && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
            Sending email from {activeBrandLabel}…
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderPreviewPanel = () => (
    <div className="space-y-3 min-h-0">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700 min-w-0">
            Preview — {templateMeta.label} · {getDocumentBrandLabel(activeBrand)}
          </p>
          <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 shrink-0">
            <Button
              type="button"
              variant={previewTheme === 'light' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => setPreviewTheme('light')}
            >
              <Sun className="w-3.5 h-3.5 sm:mr-1" />
              <span className="hidden sm:inline text-xs">Light</span>
            </Button>
            <Button
              type="button"
              variant={previewTheme === 'dark' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => setPreviewTheme('dark')}
            >
              <Moon className="w-3.5 h-3.5 sm:mr-1" />
              <span className="hidden sm:inline text-xs">Dark</span>
            </Button>
          </div>
        </div>
        {!isPreviewEmpty && (
          <p className="text-xs text-slate-500 break-words leading-snug">
            Subject: {emailPreview.subject}
          </p>
        )}
        {isPreviewEmpty && (
          <p className="text-xs text-slate-500">Select a record or enter details to preview</p>
        )}
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
          <Mail className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">No preview yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            Search and select a customer or job above — customer details and email preview appear
            after you pick a record.
          </p>
        </div>
      ) : (
      <div
        className={
          previewMode === 'mobile'
            ? `mx-auto w-full max-w-[390px] rounded-xl border shadow-lg overflow-hidden ${
                previewTheme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-slate-200'
              }`
            : `w-full rounded-xl border shadow-lg overflow-hidden ${
                previewTheme === 'dark' ? 'border-slate-700 bg-slate-900' : 'border-slate-300 bg-slate-200'
              }`
        }
      >
        {previewMode === 'mobile' && (
          <div
            className={`h-6 flex items-center justify-center ${
              previewTheme === 'dark' ? 'bg-black' : 'bg-slate-800'
            }`}
          >
            <div className="w-16 h-1 rounded-full bg-slate-600" />
          </div>
        )}
        <iframe
          title="Email preview"
          srcDoc={previewHtml}
          className={`w-full border-0 ${previewTheme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}
          style={{ height: previewFrameHeight }}
          sandbox="allow-same-origin"
        />
      </div>
      )}
    </div>
  );

  const renderComposePanel = () => (
    <div className="space-y-4 pb-24 xl:pb-0">
      {!isCompletedJobComposer && (
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
            <SelectContent className={forceLightSelectContentClass()}>
              {templateOptions.map((key) => (
                <SelectItem key={key} value={key}>
                  {ADMIN_EMAIL_TEMPLATE_META[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      )}

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
            <SelectContent className={forceLightSelectContentClass()}>
              <SelectItem value="hydrogenro">Hydrogen RO</SelectItem>
              <SelectItem value="elevenro">Eleven RO</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Email content</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Edit fields to update the live preview.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isCompletedJobComposer && (
          <EmailSourcePicker
            templateType={templateType}
            sourceMode={sourceMode}
            onSourceModeChange={handleSourceModeChange}
            selectedSourceId={selectedSourceId}
            onSelectedSourceIdChange={setSelectedSourceId}
            onApply={handleApplySource}
            disabled={sending}
          />
          )}

          {sourceMode === 'crm' && customerLoading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700">Loading customer details…</p>
            </div>
          ) : sourceMode === 'crm' && !crmDataLoaded ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">No record selected</p>
              <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto">
                Search and select a customer or job above. Customer details and email preview will
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

          {templateMeta.showCustomSubject && (
            <div className="space-y-2">
              <Label>Subject line</Label>
              <Input
                value={documentForm.customSubject}
                onChange={(e) => updateDocumentField('customSubject', e.target.value)}
              />
            </div>
          )}

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
                    <SelectContent className={forceLightSelectContentClass()}>
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
                        : templateType === 'job_completion'
                          ? 'Job number'
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
                      <Label>
                        {templateType === 'job_completion'
                          ? documentForm.completionPendingAmount?.trim()
                            ? 'Amount collected today'
                            : 'Amount collected'
                          : 'Amount'}
                      </Label>
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
                <Label>
                  {templateType === 'job_completion'
                    ? 'Personal note'
                    : templateType === 'general'
                      ? 'Email body'
                      : 'Cover note'}
                </Label>
                <Textarea
                  rows={templateType === 'job_completion' ? 3 : 5}
                  value={documentForm.message}
                  onChange={(e) => updateDocumentField('message', e.target.value)}
                  placeholder={
                    templateType === 'job_completion'
                      ? 'Optional — shown below the completion headline in the email'
                      : undefined
                  }
                />
              </div>
            </>
          )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Attachments</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {templateMeta.autoAttachPdf
              ? 'The PDF is generated automatically when you send. You can add extra files below if needed.'
              : 'Drag & drop a PDF or photo — attached when you send (AMC, quotation, etc.).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {predictedAutoAttachments.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
              <p className="font-medium">Auto-attached on send</p>
              <ul className="mt-1 text-xs text-emerald-800 list-disc pl-4">
                {predictedAutoAttachments.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}
          <EmailAttachmentDropzone
            attachments={attachments}
            onChange={setAttachments}
            disabled={sending}
            onUploadingChange={setAttachmentsUploading}
          />
        </CardContent>
      </Card>

      <div className="hidden xl:block">{renderSendCard()}</div>
    </div>
  );

  return (
    <div className={forceLightThemeClass('flex flex-col h-full min-h-0 bg-slate-100')}>
      <div className="border-b bg-white shrink-0 safe-area-top">
        <div className="px-3 sm:px-6 py-3 sm:py-4 flex flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Mail className="w-5 h-5 text-slate-900 shrink-0" />
              Send email
            </h2>
            <p className="hidden sm:block text-sm text-slate-500 mt-0.5">
              Compose and send branded emails — booking, AMC, invoice, quotation, reminders, and more.
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

export interface AdminEmailComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCustomerId?: string | null;
  initialJobId?: string | null;
  initialTemplate?: AdminEmailTemplateType;
  composerContext?: AdminEmailComposerContext;
  initialForcedBrand?: DocumentBrand | null;
  onCompletionMailSent?: (jobId: string) => void | Promise<void>;
}

export default function AdminEmailComposerDialog({
  open,
  onOpenChange,
  initialCustomerId,
  initialJobId,
  initialTemplate = 'general',
  composerContext = 'default',
  initialForcedBrand = null,
  onCompletionMailSent,
}: AdminEmailComposerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          hideCloseButton
          className={forceLightThemeClass(
            'max-w-[100vw] sm:max-w-[98vw] w-full h-[100dvh] sm:h-[96vh] max-h-[100dvh] sm:max-h-[96vh] p-0 gap-0 overflow-hidden flex flex-col rounded-none sm:rounded-lg'
          )}
        >
        {open ? (
          <AdminEmailComposerPanel
            key={`${initialCustomerId ?? 'blank'}-${initialJobId ?? 'nojob'}-${initialTemplate}-${composerContext}-${initialForcedBrand ?? 'brand'}`}
            initialCustomerId={initialCustomerId}
            initialJobId={initialJobId}
            initialTemplate={initialTemplate}
            composerContext={composerContext}
            initialForcedBrand={initialForcedBrand}
            onCompletionMailSent={onCompletionMailSent}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
