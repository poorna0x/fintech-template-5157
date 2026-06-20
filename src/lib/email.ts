// Email service utility for sending booking confirmations via secured Netlify function.

import type { BookingAltchaContext } from '@/lib/bookingCustomer';
import {
  buildBookingConfirmationEmail,
  type BookingConfirmationEmailData,
} from '@/lib/booking-confirmation-email';

export type BookingConfirmationData = BookingConfirmationEmailData;

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
    this.previewSecret = import.meta.env.VITE_EMAIL_PREVIEW_SECRET || '';
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

  /** Admin preview tool — requires VITE_EMAIL_PREVIEW_SECRET + EMAIL_PREVIEW_SECRET on server. */
  async sendPreviewEmail(
    to: string,
    data: BookingConfirmationData
  ): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    if (!this.previewSecret) {
      return {
        ok: false,
        error: 'Preview send is not configured. Set VITE_EMAIL_PREVIEW_SECRET in .env.local.',
      };
    }

    const template = buildBookingConfirmationEmail(data);

    try {
      const response = await fetch(this.previewApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Email-Preview-Secret': this.previewSecret,
        },
        body: JSON.stringify({
          purpose: 'booking_confirmation',
          to,
          subject: template.subject,
          html: template.html,
          text: template.text,
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

  sendBookingConfirmation(
    data: BookingConfirmationData,
    ctx?: BookingAltchaContext,
    phone?: string
  ): Promise<boolean> {
    if (!ctx?.altchaLoginToken || !phone) {
      return Promise.resolve(false);
    }

    const template = emailTemplates.bookingConfirmation(data);

    return this.sendEmail(
      {
        to: data.email,
        subject: template.subject,
        template: 'bookingConfirmation',
        data: {
          ...data,
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
