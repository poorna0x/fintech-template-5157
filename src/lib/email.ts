// Email service utility for sending booking confirmations
// This is a placeholder implementation - you'll need to integrate with your preferred email service

export interface EmailData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

export interface BookingConfirmationData {
  customerName: string;
  jobNumber: string;
  serviceType: string;
  serviceSubType: string;
  brand: string;
  model: string;
  scheduledDate: string;
  scheduledTimeSlot: string;
  serviceAddress: string;
  phone: string;
  email: string;
}

// Email templates
export const emailTemplates = {
  bookingConfirmation: (data: BookingConfirmationData) => ({
    subject: `Service Booking Confirmed - ${data.jobNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Service Booking Confirmed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .booking-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-label { font-weight: bold; color: #374151; }
          .detail-value { color: #6b7280; }
          .status-badge { background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
          .contact-info { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Service Booking Confirmed!</h1>
            <p>Thank you for choosing our RO service</p>
          </div>
          
          <div class="content">
            <p>Dear ${data.customerName},</p>
            
            <p>Your service request has been successfully submitted and confirmed. Here are the details:</p>
            
            <div class="booking-details">
              <h3>Booking Details</h3>
              <div class="detail-row">
                <span class="detail-label">Booking ID:</span>
                <span class="detail-value">${data.jobNumber}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Service Type:</span>
                <span class="detail-value">${data.serviceType} - ${data.serviceSubType}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Device:</span>
                <span class="detail-value">${data.brand} ${data.model}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Scheduled Date:</span>
                <span class="detail-value">${new Date(data.scheduledDate).toLocaleDateString('en-IN')}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Time Slot:</span>
                <span class="detail-value">${data.scheduledTimeSlot}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Service Address:</span>
                <span class="detail-value">${data.serviceAddress}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="status-badge">CONFIRMED</span>
              </div>
            </div>
            
            <div class="contact-info">
              <h4>What happens next?</h4>
              <ul>
                <li>Our technician will contact you within 30 minutes to confirm your appointment</li>
                <li>You'll receive an SMS notification with technician details</li>
                <li>Our expert will arrive at your scheduled time</li>
                <li>Service will be completed as per your requirements</li>
              </ul>
            </div>
            
            <p><strong>Important:</strong> Please keep this booking ID (${data.jobNumber}) for your reference.</p>
            
            <p>If you have any questions or need to reschedule, please contact us immediately.</p>
            
            <div class="footer">
              <p>Thank you for choosing our service!</p>
              <p>Best regards,<br>Hydrogen RO Team</p>
              <p>Phone: +91-8884944288 | Email: support@hydrogenro.com</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Service Booking Confirmed - ${data.jobNumber}
      
      Dear ${data.customerName},
      
      Your service request has been successfully submitted and confirmed.
      
      Booking Details:
      - Booking ID: ${data.jobNumber}
      - Service Type: ${data.serviceType} - ${data.serviceSubType}
      - Device: ${data.brand} ${data.model}
      - Scheduled Date: ${new Date(data.scheduledDate).toLocaleDateString('en-IN')}
      - Time Slot: ${data.scheduledTimeSlot}
      - Service Address: ${data.serviceAddress}
      - Status: CONFIRMED
      
      What happens next?
      - Our technician will contact you within 30 minutes
      - You'll receive an SMS notification
      - Our expert will arrive at your scheduled time
      - Service will be completed as per your requirements
      
      Please keep this booking ID for your reference: ${data.jobNumber}
      
      If you have any questions, please contact us at +91-8884944288
      
      Thank you for choosing our service!
      Hydrogen RO Team
    `
  })
};

// Email service class
export class EmailService {
  private apiUrl: string;
  private fromEmail: string;

  constructor() {
    // Use your deployed API URL (Netlify Functions, Vercel, etc.)
    this.apiUrl = import.meta.env.VITE_EMAIL_API_URL || '/.netlify/functions/send-email';
    this.fromEmail = import.meta.env.VITE_EMAIL_FROM || 'noreply@hydrogenro.com';
  }

  async sendEmail(emailData: EmailData): Promise<boolean> {
    try {
      console.log('Sending email:', {
        to: emailData.to,
        subject: emailData.subject,
        from: this.fromEmail,
        template: emailData.template
      });

      // For development, just log the email content
      if (import.meta.env.DEV) {
        console.log('Email content:', emailData);
        return true;
      }

      // Send email via API
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailData.to,
          subject: emailData.subject,
          html: emailData.data.html,
          text: emailData.data.text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Email service error: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      console.log('Email sent successfully:', result);
      return true;

    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async sendBookingConfirmation(data: BookingConfirmationData): Promise<boolean> {
    const template = emailTemplates.bookingConfirmation(data);
    
    return await this.sendEmail({
      to: data.email,
      subject: template.subject,
      template: 'bookingConfirmation',
      data: {
        ...data,
        html: template.html,
        text: template.text
      }
    });
  }
}

// Export singleton instance
export const emailService = new EmailService();
