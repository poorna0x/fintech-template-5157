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

// Helper function to format time slots
const formatTimeSlot = (timeSlot: string): string => {
  const timeMap: { [key: string]: string } = {
    'FIRST_HALF': 'Morning (9 AM - 2 PM)',
    'SECOND_HALF': 'Afternoon (2 PM - 8 PM)',
    'MORNING': 'Morning (9 AM - 12 PM)',
    'AFTERNOON': 'Afternoon (12 PM - 5 PM)',
    'EVENING': 'Evening (5 PM - 8 PM)',
    'morning': 'Morning (9 AM - 12 PM)',
    'afternoon': 'Afternoon (12 PM - 5 PM)',
    'evening': 'Evening (5 PM - 8 PM)'
  };
  return timeMap[timeSlot] || timeSlot;
};

// Email templates
export const emailTemplates = {
  bookingConfirmation: (data: BookingConfirmationData) => ({
    subject: `Service Booking Confirmed - ${data.customerName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Service Booking Confirmed</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
            line-height: 1.6; 
            color: #1f2937; 
            background-color: #f9fafb;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          .header { 
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: white; 
            padding: 40px 30px; 
            text-align: center; 
          }
          .header h1 { 
            font-size: 28px; 
            font-weight: 700; 
            margin-bottom: 8px;
            line-height: 1.2;
          }
          .header p { 
            font-size: 16px; 
            opacity: 0.9;
          }
          .content { 
            padding: 40px 30px; 
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
            color: #374151;
          }
          .booking-details { 
            background: #f8fafc; 
            padding: 30px; 
            border-radius: 12px; 
            margin: 30px 0;
            border: 1px solid #e5e7eb;
          }
          .booking-details h3 {
            font-size: 20px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 20px;
            text-align: center;
          }
          .detail-row { 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            margin: 16px 0; 
            padding: 12px 0; 
            border-bottom: 1px solid #e5e7eb; 
          }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { 
            font-weight: 600; 
            color: #374151;
            font-size: 14px;
          }
          .detail-value { 
            color: #6b7280; 
            font-size: 14px;
            text-align: right;
            max-width: 60%;
          }
          .status-badge { 
            background: #10b981; 
            color: white; 
            padding: 6px 16px; 
            border-radius: 20px; 
            font-size: 12px; 
            font-weight: 600;
            display: inline-block;
          }
          .contact-section {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            padding: 30px;
            border-radius: 12px;
            margin: 30px 0;
            text-align: center;
          }
          .contact-section h4 {
            font-size: 20px;
            font-weight: 600;
            color: #1e40af;
            margin-bottom: 16px;
          }
          .contact-buttons {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
            margin: 20px 0;
          }
          .contact-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s;
            border: 2px solid transparent;
          }
          .btn-whatsapp {
            background: #25d366;
            color: white;
          }
          .btn-call {
            background: #3b82f6;
            color: white;
          }
          .btn-email {
            background: #6b7280;
            color: white;
          }
          .contact-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }
          .contact-info {
            margin-top: 20px;
            font-size: 14px;
            color: #6b7280;
          }
          .footer { 
            text-align: center; 
            margin-top: 40px; 
            padding-top: 30px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280; 
            font-size: 14px; 
          }
          .footer p {
            margin-bottom: 8px;
          }
          .company-name {
            font-weight: 600;
            color: #1f2937;
          }
          .next-steps {
            background: #fef3c7;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #f59e0b;
          }
          .next-steps h4 {
            color: #92400e;
            margin-bottom: 12px;
            font-size: 16px;
          }
          .next-steps ul {
            color: #92400e;
            padding-left: 20px;
          }
          .next-steps li {
            margin-bottom: 8px;
          }
          @media (max-width: 600px) {
            .container { margin: 0; border-radius: 0; }
            .header, .content { padding: 30px 20px; }
            .contact-buttons { flex-direction: column; align-items: center; }
            .contact-btn { width: 100%; max-width: 200px; justify-content: center; }
            .detail-row { flex-direction: column; align-items: flex-start; gap: 4px; }
            .detail-value { text-align: left; max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Service Booking Confirmed!</h1>
            <p>Thank you for choosing Hydrogen RO</p>
          </div>
          
          <div class="content">
            <div class="greeting">
              Hi ${data.customerName}! 👋
            </div>
            
            <p style="font-size: 16px; color: #4b5563; margin-bottom: 20px;">
              Your service request has been successfully submitted. Our expert technician will contact you soon to confirm the appointment.
            </p>
            
            <div class="booking-details">
              <h3>Service Details</h3>
              <div class="detail-row">
                <span class="detail-label">Service Type:</span>
                <span class="detail-value">${data.serviceType} - ${data.serviceSubType}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Device:</span>
                <span class="detail-value">${data.brand} ${data.model}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Service Date:</span>
                <span class="detail-value">${new Date(data.scheduledDate).toLocaleDateString('en-IN', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Time Slot:</span>
                <span class="detail-value">${formatTimeSlot(data.scheduledTimeSlot)}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Address:</span>
                <span class="detail-value">${data.serviceAddress}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value"><span class="status-badge">Confirmed</span></span>
              </div>
            </div>
            
            <div class="next-steps">
              <h4>What happens next?</h4>
              <ul>
                <li>Our technician will contact you within 30 minutes</li>
                <li>You'll receive an SMS with technician details</li>
                <li>Our expert will arrive at your scheduled time</li>
                <li>Service will be completed as per your requirements</li>
              </ul>
            </div>
            
            <div class="contact-section">
              <h4>Need Help? Contact Us Instantly!</h4>
              <p style="color: #4b5563; margin-bottom: 20px;">
                Our team is here to help you 24/7. Choose your preferred way to reach us:
              </p>
              
              <div class="contact-buttons">
                <a href="https://wa.me/919876543210?text=Hi, I have a booking for ${data.serviceType} service. My name is ${data.customerName}" class="contact-btn btn-whatsapp">
                  WhatsApp
                </a>
                <a href="tel:+919876543210" class="contact-btn btn-call">
                  Call Now
                </a>
                <a href="mailto:info@hydrogenro.com?subject=Service Booking Query - ${data.customerName}" class="contact-btn btn-email">
                  Email
                </a>
              </div>
              
              <div class="contact-info">
                <p><strong>Phone:</strong> +91-9876543210</p>
                <p><strong>Email:</strong> info@hydrogenro.com</p>
                <p><strong>Available:</strong> 24/7 Emergency Support</p>
              </div>
            </div>
            
            <p style="font-size: 16px; color: #4b5563; text-align: center; margin: 30px 0;">
              Thank you for trusting us with your water purifier needs! 💧
            </p>
            
            <div class="footer">
              <p>Best regards,</p>
              <p class="company-name">Hydrogen RO Team</p>
              <p style="margin-top: 16px; font-size: 12px;">
                Your trusted partner for clean water solutions
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Service Booking Confirmed - ${data.customerName}
      
      Hi ${data.customerName}! 👋
      
      Your service request has been successfully submitted. Our expert technician will contact you soon to confirm the appointment.
      
      Service Details:
      - Service Type: ${data.serviceType} - ${data.serviceSubType}
      - Device: ${data.brand} ${data.model}
      - Service Date: ${new Date(data.scheduledDate).toLocaleDateString('en-IN', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}
      - Time Slot: ${formatTimeSlot(data.scheduledTimeSlot)}
      - Address: ${data.serviceAddress}
      - Status: Confirmed
      
      What happens next?
      - Our technician will contact you within 30 minutes
      - You'll receive an SMS with technician details
      - Our expert will arrive at your scheduled time
      - Service will be completed as per your requirements
      
      Need Help? Contact Us Instantly!
      - WhatsApp: https://wa.me/919876543210
      - Phone: +91-9876543210
      - Email: info@hydrogenro.com
      - Available: 24/7 Emergency Support
      
      Thank you for trusting us with your water purifier needs! 💧
      
      Best regards,
      Hydrogen RO Team
      Your trusted partner for clean water solutions
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
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // If it's a configuration error, log it but don't fail the booking
        if (response.status === 500 && errorData.error?.includes('configuration')) {
          console.warn('Email service not configured, booking will continue without email notification:', errorData);
          return true; // Return true to not block the booking process
        }
        
        throw new Error(`Email service error: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      console.log('Email sent successfully:', result);
      return true;

    } catch (error) {
      console.error('Error sending email:', error);
      
      // Don't fail the entire booking process if email fails
      // Just log the error and continue
      console.warn('Email notification failed, but booking will continue');
      return true;
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
