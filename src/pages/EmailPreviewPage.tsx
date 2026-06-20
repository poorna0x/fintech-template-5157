import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Mail, Monitor, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import EmailAttachmentDropzone from '@/components/admin/EmailAttachmentDropzone';
import EmailSourcePicker from '@/components/admin/EmailSourcePicker';
import type { EmailSourceMode } from '@/lib/admin-email-sources';
import { applyEmailSourceRecord } from '@/lib/admin-email-sources';
import { getValidCustomerEmail } from '@/lib/customer-email';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { stripAttachmentPayload, type EmailAttachmentItem } from '@/lib/admin-email-attachments';
import {
  ADMIN_EMAIL_TEMPLATE_META,
  buildAdminEmail,
  getDefaultDocumentMessage,
  SAMPLE_ADMIN_DOCUMENT_EMAIL,
  SAMPLE_BOOKING_CONFIRMATION_EMAIL,
  type AdminDocumentEmailData,
  type AdminEmailTemplateType,
} from '@/lib/admin-email-templates';
import { getEmailLogoUrl } from '@/lib/booking-confirmation-email';
import type { BookingConfirmationEmailData } from '@/lib/booking-confirmation-email';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { emailService } from '@/lib/email';
import { supabase } from '@/lib/supabaseClient';

type PreviewMode = 'mobile' | 'desktop';

const TEMPLATE_ORDER: AdminEmailTemplateType[] = [
  'booking_confirmation',
  'amc_document',
  'invoice',
  'quotation',
  'service_reminder',
  'general',
];

export default function EmailPreviewPage() {
  const { user, isAdmin, authInitializing } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkLoaded = useRef(false);
  const [templateType, setTemplateType] = useState<AdminEmailTemplateType>('booking_confirmation');
  const [bookingForm, setBookingForm] = useState<BookingConfirmationEmailData>({
    ...SAMPLE_BOOKING_CONFIRMATION_EMAIL,
  });
  const [documentForm, setDocumentForm] = useState<AdminDocumentEmailData>({
    ...SAMPLE_ADMIN_DOCUMENT_EMAIL,
  });
  const [attachments, setAttachments] = useState<EmailAttachmentItem[]>([]);
  const [sendTo, setSendTo] = useState('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('mobile');
  const [sending, setSending] = useState(false);
  const [sourceMode, setSourceMode] = useState<EmailSourceMode>('crm');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sendBrand, setSendBrand] = useState<DocumentBrand>(
    SAMPLE_BOOKING_CONFIRMATION_EMAIL.documentBrand || 'hydrogenro'
  );
  const [lastServiceBrand, setLastServiceBrand] = useState<DocumentBrand | null>(null);

  const templateMeta = ADMIN_EMAIL_TEMPLATE_META[templateType];
  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const activeBrand: DocumentBrand = sendBrand;

  const emailPreview = useMemo(
    () =>
      buildAdminEmail(templateType, bookingForm, documentForm, {
        siteOrigin,
        attachmentNames: attachments.map((a) => a.filename),
      }),
    [templateType, bookingForm, documentForm, siteOrigin, attachments]
  );

  const logoUrl = getEmailLogoUrl(undefined, activeBrand);

  const updateSendBrand = (value: DocumentBrand) => {
    setSendBrand(value);
    setBookingForm((prev) => ({ ...prev, documentBrand: value }));
    setDocumentForm((prev) => ({ ...prev, documentBrand: value }));
  };

  const sendBrandHint = useMemo(() => {
    if (lastServiceBrand) {
      return `Default from customer's last completed service: ${getDocumentBrandLabel(lastServiceBrand)}`;
    }
    if (selectedSourceId) {
      return 'No prior service brand on file — using record default. You can switch below.';
    }
    return 'Logo, contact details, and from-address follow this brand.';
  }, [lastServiceBrand, selectedSourceId]);

  const handleTemplateChange = (value: AdminEmailTemplateType) => {
    setTemplateType(value);
    setSelectedSourceId(null);
    setLastServiceBrand(null);
    setSourceMode('crm');
    if (value !== 'booking_confirmation') {
      setDocumentForm((prev) => ({
        ...prev,
        message: getDefaultDocumentMessage(value),
        documentBrand: sendBrand,
        customerName: bookingForm.customerName || prev.customerName,
      }));
    }
  };

  const handleApplySource = useCallback(
    (
      result: {
        bookingForm?: Partial<BookingConfirmationEmailData>;
        documentForm?: Partial<AdminDocumentEmailData>;
        recipientEmail?: string;
        sendBrand?: DocumentBrand;
        lastServiceBrand?: DocumentBrand | null;
      } | null
    ) => {
      if (!result) return;
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

  useEffect(() => {
    if (authInitializing || !user || !isAdmin || deepLinkLoaded.current) return;

    const customerId = searchParams.get('customerId');
    if (!customerId) return;

    const templateParam = searchParams.get('template');
    const tpl =
      templateParam && TEMPLATE_ORDER.includes(templateParam as AdminEmailTemplateType)
        ? (templateParam as AdminEmailTemplateType)
        : 'general';

    deepLinkLoaded.current = true;

    void (async () => {
      setTemplateType(tpl);
      setSourceMode('crm');
      setSelectedSourceId(customerId);

      const result = await applyEmailSourceRecord(tpl, customerId);
      if (!result) {
        toast.error('Could not load customer for email');
        setSearchParams({}, { replace: true });
        return;
      }

      const email = getValidCustomerEmail(result.recipientEmail);
      if (!email) {
        toast.error('This customer has no email on file');
        setSearchParams({}, { replace: true });
        return;
      }

      handleApplySource(result);
      setSearchParams({}, { replace: true });
    })();
  }, [authInitializing, user, isAdmin, searchParams, setSearchParams, handleApplySource]);

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

  const handleSendTest = async () => {
    if (!sendTo.trim()) {
      toast.error('Enter a recipient email address');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error('Sign in as admin to send email');
      return;
    }

    setSending(true);
    const result = await emailService.sendAdminComposerEmail(
      {
        templateType,
        documentBrand: activeBrand,
        to: sendTo.trim(),
        subject: emailPreview.subject,
        html: emailPreview.html,
        text: emailPreview.text,
        attachments: attachments.map(stripAttachmentPayload),
      },
      session.access_token
    );
    setSending(false);

    if (result.ok) {
      toast.success(
        attachments.length
          ? `Email sent with ${attachments.length} attachment(s)`
          : 'Email sent'
      );
    } else {
      toast.error(result.error || 'Could not send email');
    }
  };

  if (authInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        Loading…
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Mail className="w-5 h-5 text-emerald-600" />
              Email composer
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Preview and send branded emails — booking, AMC, invoice, quotation, reminders, and more.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={previewMode === 'mobile' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreviewMode('mobile')}
            >
              <Smartphone className="w-4 h-4 mr-1.5" />
              Mobile
            </Button>
            <Button
              type="button"
              variant={previewMode === 'desktop' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreviewMode('desktop')}
            >
              <Monitor className="w-4 h-4 mr-1.5" />
              Desktop
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Template</CardTitle>
              <CardDescription>{templateMeta.description}</CardDescription>
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
            <CardHeader>
              <CardTitle>Send as</CardTitle>
              <CardDescription>{sendBrandHint}</CardDescription>
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
            <CardHeader>
              <CardTitle>Email content</CardTitle>
              <CardDescription>Edit fields to update the live preview.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <EmailSourcePicker
                templateType={templateType}
                sourceMode={sourceMode}
                onSourceModeChange={setSourceMode}
                selectedSourceId={selectedSourceId}
                onSelectedSourceIdChange={setSelectedSourceId}
                onApply={handleApplySource}
                disabled={sending}
              />

              <div className="space-y-2">
                <Label>Customer name</Label>
                <Input
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
              <CardDescription>
                Drag & drop a PDF or photo — attached when you send (AMC, invoice, quotation, etc.).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmailAttachmentDropzone
                attachments={attachments}
                onChange={setAttachments}
                disabled={sending}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send email</CardTitle>
              <CardDescription>
                Uses the same Hostinger SMTP as booking confirmations. You must be signed in as admin.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <Input
                type="email"
                placeholder="customer@example.com"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={() => void handleSendTest()}
                disabled={sending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white hover:text-white shrink-0"
              >
                <Send className="w-4 h-4 mr-2" />
                {sending ? 'Sending…' : 'Send email'}
              </Button>
            </CardContent>
          </Card>

          <p className="text-xs text-slate-500 px-1">
            Logo URL: <span className="font-mono">{logoUrl}</span>
            {attachments.length > 0 && (
              <>
                {' '}
                · {attachments.length} file{attachments.length === 1 ? '' : 's'} ready to attach
              </>
            )}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">
              Preview — {templateMeta.label} · {getDocumentBrandLabel(activeBrand)}
            </p>
            <p className="text-xs text-slate-500 truncate max-w-[50%]">{emailPreview.subject}</p>
          </div>

          <div
            className={
              previewMode === 'mobile'
                ? 'mx-auto w-full max-w-[390px] rounded-xl border border-slate-300 bg-slate-200 shadow-lg overflow-hidden'
                : 'w-full rounded-xl border border-slate-300 bg-slate-200 shadow-lg overflow-hidden'
            }
          >
            {previewMode === 'mobile' && (
              <div className="h-6 bg-slate-800 flex items-center justify-center">
                <div className="w-16 h-1 rounded-full bg-slate-600" />
              </div>
            )}
            <iframe
              title="Email preview"
              srcDoc={emailPreview.html}
              className="w-full bg-white border-0"
              style={{ height: previewMode === 'mobile' ? '780px' : '900px' }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
