import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Monitor, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildBookingConfirmationEmail,
  getEmailLogoUrl,
  SAMPLE_BOOKING_CONFIRMATION_EMAIL,
  type BookingConfirmationEmailData,
} from '@/lib/booking-confirmation-email';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { emailService } from '@/lib/email';

type PreviewMode = 'mobile' | 'desktop';

export default function EmailPreviewPage() {
  const { user, isAdmin, authInitializing } = useAuth();
  const [form, setForm] = useState<BookingConfirmationEmailData>({
    ...SAMPLE_BOOKING_CONFIRMATION_EMAIL,
  });
  const [sendTo, setSendTo] = useState('');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('mobile');
  const [sending, setSending] = useState(false);

  const emailPreview = useMemo(
    () => buildBookingConfirmationEmail(form, { siteOrigin: window.location.origin }),
    [form]
  );

  const logoUrl = getEmailLogoUrl();

  const updateField = <K extends keyof BookingConfirmationEmailData>(
    key: K,
    value: BookingConfirmationEmailData[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSendTest = async () => {
    if (!sendTo.trim()) {
      toast.error('Enter a recipient email address');
      return;
    }

    setSending(true);
    const result = await emailService.sendPreviewEmail(sendTo.trim(), {
      ...form,
      email: sendTo.trim(),
    });
    setSending(false);

    if (result.ok) {
      toast.success('Test email sent');
    } else {
      toast.error(result.error || 'Could not send test email');
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
              Booking Email Preview
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Preview the confirmation email layout. Same logo for both brands — only the brand name changes.
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
              <CardTitle>Sample data</CardTitle>
              <CardDescription>Edit fields to see the live preview update.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Brand name</Label>
                  <Select
                    value={form.documentBrand || 'hydrogenro'}
                    onValueChange={(value: DocumentBrand) =>
                      updateField('documentBrand', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hydrogenro">Hydrogen RO</SelectItem>
                      <SelectItem value="elevenro">Eleven RO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Job number</Label>
                  <Input
                    value={form.jobNumber}
                    onChange={(e) => updateField('jobNumber', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer name</Label>
                  <Input
                    value={form.customerName}
                    onChange={(e) => updateField('customerName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time slot</Label>
                  <Select
                    value={form.scheduledTimeSlot}
                    onValueChange={(value) => updateField('scheduledTimeSlot', value)}
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
                    value={form.serviceType}
                    onChange={(e) => updateField('serviceType', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Service sub-type</Label>
                  <Input
                    value={form.serviceSubType}
                    onChange={(e) => updateField('serviceSubType', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Device brand</Label>
                  <Input
                    value={form.brand}
                    onChange={(e) => updateField('brand', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Device model</Label>
                  <Input
                    value={form.model}
                    onChange={(e) => updateField('model', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Service date</Label>
                <Input
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) => updateField('scheduledDate', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Service address</Label>
                <Textarea
                  rows={3}
                  value={form.serviceAddress}
                  onChange={(e) => updateField('serviceAddress', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send test email</CardTitle>
              <CardDescription>
                Requires <code className="text-xs">VITE_EMAIL_PREVIEW_SECRET</code> in{' '}
                <code className="text-xs">.env.local</code> (must match{' '}
                <code className="text-xs">EMAIL_PREVIEW_SECRET</code> on the server). Use Netlify
                dev so the function can send via SMTP.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <Input
                type="email"
                placeholder="you@example.com"
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
                {sending ? 'Sending…' : 'Send test'}
              </Button>
            </CardContent>
          </Card>

          <p className="text-xs text-slate-500 px-1">
            Logo URL in email: <span className="font-mono">{logoUrl}</span> — must be publicly
            reachable when the email is opened (localhost works for preview only).
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">
              Preview — {getDocumentBrandLabel(form.documentBrand || 'hydrogenro')}
            </p>
            <p className="text-xs text-slate-500 truncate">{emailPreview.subject}</p>
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
              title="Booking confirmation email preview"
              srcDoc={emailPreview.html}
              className="w-full bg-white border-0"
              style={{ height: previewMode === 'mobile' ? '720px' : '820px' }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
