// Email service utility for sending booking confirmations via secured Netlify function.

import type { BookingAltchaContext } from '@/lib/bookingCustomer';
import type { EmailAttachmentPayload } from '@/lib/admin-email-attachments';
import type { AdminEmailTemplateType } from '@/lib/admin-email-templates';
import {
  buildBookingConfirmationEmail,
  resolveBookingEmailDocumentBrand,
  type BookingConfirmationEmailData,
} from '@/lib/booking-confirmation-email';
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';

export type BookingConfirmationData = BookingConfirmationEmailData;

export interface AdminComposerEmailPayload {
  templateType: AdminEmailTemplateType;
  documentBrand: 'hydrogenro' | 'elevenro';
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachmentPayload[];
}

export interface EmailData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

export const emailTemplates = {
  bookingConfirmation: (data: BookingConfirmationData) => buildBookingConfirmationEmail(data),
};

// Email service class
export class EmailService {
  private apiUrl: string;
  private previewApiUrl: string;
  private previewSecret: string;

  constructor() {
    this.apiUrl = import.meta.env.VITE_EMAIL_API_URL || '/.netlify/functions/send-email';
    this.previewApiUrl =
      import.meta.env.VITE_EMAIL_PREVIEW_API_URL || '/.netlify/functions/send-email-preview';
    // Never bundle preview secret into production builds — local dev only.
    this.previewSecret = import.meta.env.DEV
      ? import.meta.env.VITE_EMAIL_PREVIEW_SECRET || ''
      : '';
  }

  async sendEmail(
    emailData: EmailData,
    ctx: BookingAltchaContext,
    phone: string
  ): Promise<boolean> {
    try {
      if (import.meta.env.DEV) {
        return false;
      }

      if (!ctx.altchaLoginToken) {
        return false;
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purpose: 'booking_confirmation',
          documentBrand: emailData.data.documentBrand,
          altchaLoginToken: ctx.altchaLoginToken,
          altchaPayload: ctx.altchaPayload,
          phone,
          to: emailData.to,
          subject: emailData.subject,
          html: emailData.data.html,
          text: emailData.data.text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

        if (response.status === 500 && errorData.error?.includes('configuration')) {
          return false;
        }

        throw new Error(`Email service error: ${errorData.error || response.statusText}`);
      }

      await response.json();
      return true;
    } catch {
      return false;
    }
  }

  /** AMC agreement with PDF attachment — admin or technician session. */
  async sendAmcAgreementEmail(
    payload: AdminComposerEmailPayload,
    accessToken?: string | null
  ): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    const sendOnce = async (token: string) => {
      const response = await fetch(this.previewApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          purpose: 'amc_agreement',
          documentBrand: payload.documentBrand,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          ...(payload.attachments?.length
            ? {
                attachments: payload.attachments.map(({ filename, contentType, content }) => ({
                  filename,
                  contentType,
                  content,
                })),
              }
            : {}),
        }),
      });

      const result = await response.json().catch(() => ({}));
      return { response, result };
    };

    let token = accessToken ?? (await resolveSupabaseAccessTokenForApi());
    if (!token && this.previewSecret) {
      // Dev-only fallback
      const response = await fetch(this.previewApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Email-Preview-Secret': this.previewSecret,
        },
        body: JSON.stringify({
          purpose: 'amc_agreement',
          documentBrand: payload.documentBrand,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          ...(payload.attachments?.length
            ? {
                attachments: payload.attachments.map(({ filename, contentType, content }) => ({
                  filename,
                  contentType,
                  content,
                })),
              }
            : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          error: result.error || response.statusText || 'Failed to send email',
        };
      }
      return { ok: true, messageId: result.messageId };
    }

    if (!token) {
      return {
        ok: false,
        error: 'Could not verify your session. Please try again.',
      };
    }

    try {
      let { response, result } = await sendOnce(token);

      if (response.status === 403) {
        const retryToken = await resolveSupabaseAccessTokenForApi();
        if (retryToken) {
          ({ response, result } = await sendOnce(retryToken));
        }
      }

      if (!response.ok) {
        const message =
          response.status === 403
            ? 'Could not send email — please try again in a moment'
            : result.error || response.statusText || 'Failed to send email';
        return {
          ok: false,
          error: message,
        };
      }

      return { ok: true, messageId: result.messageId };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /** Admin email composer — supports attachments; requires admin session or preview secret. */
  async sendAdminComposerEmail(
    payload: AdminComposerEmailPayload,
    accessToken?: string | null
  ): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    } else if (this.previewSecret) {
      headers['X-Email-Preview-Secret'] = this.previewSecret;
    } else {
      return {
        ok: false,
        error: 'Sign in as admin to send email.',
      };
    }

    const purpose =
      payload.templateType === 'booking_confirmation' ? 'booking_confirmation' : 'admin_composer';

    try {
      const response = await fetch(this.previewApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          purpose,
          documentBrand: payload.documentBrand,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          ...(payload.attachments?.length
            ? {
                attachments: payload.attachments.map(({ filename, contentType, content }) => ({
                  filename,
                  contentType,
                  content,
                })),
              }
            : {}),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          ok: false,
          error: result.error || response.statusText || 'Failed to send email',
        };
      }

      return { ok: true, messageId: result.messageId };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /** @deprecated Use sendAdminComposerEmail */
  async sendPreviewEmail(
    to: string,
    data: BookingConfirmationData
  ): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    const template = buildBookingConfirmationEmail(data);
    const documentBrand = resolveBookingEmailDocumentBrand(
      data,
      typeof window !== 'undefined' ? window.location.origin : undefined
    );

    return this.sendAdminComposerEmail({
      templateType: 'booking_confirmation',
      documentBrand,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  sendBookingConfirmation(
    data: BookingConfirmationData,
    ctx?: BookingAltchaContext,
    phone?: string
  ): Promise<boolean> {
    if (!ctx?.altchaLoginToken || !phone) {
      return Promise.resolve(false);
    }

    const template = emailTemplates.bookingConfirmation(data);
    const documentBrand = resolveBookingEmailDocumentBrand(data);

    return this.sendEmail(
      {
        to: data.email,
        subject: template.subject,
        template: 'bookingConfirmation',
        data: {
          ...data,
          documentBrand,
          html: template.html,
          text: template.text,
        },
      },
      ctx,
      phone
    );
  }
}

export const emailService = new EmailService();
