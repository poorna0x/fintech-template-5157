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
            color: #1a1a1a; 
            background-color: #f8f9fa;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid #e5e7eb;
          }
          .header { 
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            color: white; 
            padding: 48px 32px; 
            text-align: center; 
          }
          .header h1 { 
            font-size: 32px; 
            font-weight: 700; 
            margin-bottom: 12px;
            line-height: 1.2;
            letter-spacing: -0.5px;
          }
          .header p { 
            font-size: 18px; 
            opacity: 0.9;
            font-weight: 400;
          }
          .content { 
            padding: 48px 32px; 
          }
          .greeting {
            font-size: 20px;
            margin-bottom: 24px;
            color: #1a1a1a;
            font-weight: 600;
          }
          .booking-summary {
            margin: 32px 0;
          }
          .summary-card {
            background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
            border-radius: 20px;
            padding: 32px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          }
          .summary-item {
            display: flex;
            align-items: center;
            margin-bottom: 24px;
            padding: 16px 0;
          }
          .summary-item:last-child {
            margin-bottom: 0;
          }
          .summary-icon {
            font-size: 24px;
            margin-right: 16px;
            width: 40px;
            text-align: center;
          }
          .summary-content {
            flex: 1;
          }
          .summary-label {
            font-size: 14px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .summary-value {
            font-size: 18px;
            font-weight: 700;
            color: #1a1a1a;
            line-height: 1.3;
          }
          .status-badge { 
            background: linear-gradient(135deg, #059669 0%, #047857 100%); 
            color: white; 
            padding: 8px 20px; 
            border-radius: 24px; 
            font-size: 14px; 
            font-weight: 700;
            display: inline-block;
            letter-spacing: 0.5px;
            box-shadow: 0 2px 8px rgba(5, 150, 105, 0.3);
          }
          .contact-section {
            background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
            padding: 40px 32px;
            border-radius: 20px;
            margin: 32px 0;
            text-align: center;
            border: 1px solid #e2e8f0;
          }
          .contact-section h4 {
            font-size: 22px;
            font-weight: 600;
            color: #334155;
            margin-bottom: 16px;
            letter-spacing: -0.2px;
          }
          .contact-buttons {
            text-align: center;
            margin: 28px 0;
          }
          .contact-btn {
            display: block;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            transition: all 0.3s ease;
            border: 2px solid transparent;
            width: 200px;
            text-align: center;
            margin: 8px auto;
          }
          .btn-phone {
            background: #6b7280;
            color: white;
          }
          .btn-message {
            background: #6b7280;
            color: white;
          }
          .contact-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            background: #4b5563;
          }
          .contact-info {
            margin-top: 24px;
            font-size: 16px;
            color: #4a4a4a;
            font-weight: 500;
          }
          .contact-info p {
            margin-bottom: 8px;
          }
          .footer { 
            text-align: center; 
            margin-top: 48px; 
            padding-top: 32px;
            border-top: 2px solid #e5e7eb;
            color: #4a4a4a; 
            font-size: 16px; 
          }
          .footer p {
            margin-bottom: 12px;
          }
          .company-name {
            font-weight: 700;
            color: #1a1a1a;
            font-size: 18px;
          }
          .next-steps {
            background: #f8f9fa;
            padding: 24px;
            border-radius: 12px;
            margin: 24px 0;
            border-left: 4px solid #000000;
          }
          .next-steps h4 {
            color: #1a1a1a;
            margin-bottom: 16px;
            font-size: 18px;
            font-weight: 700;
          }
          .next-steps ul {
            color: #4a4a4a;
            padding-left: 20px;
            font-weight: 500;
          }
          .next-steps li {
            margin-bottom: 12px;
            line-height: 1.5;
          }
          @media (max-width: 600px) {
            .container { 
              margin: 0; 
              border-radius: 0; 
              border-left: none;
              border-right: none;
            }
            .header, .content { 
              padding: 32px 20px; 
            }
            .header h1 {
              font-size: 28px;
            }
            .header p {
              font-size: 16px;
            }
            .contact-btn { 
              padding: 10px 20px;
              font-size: 14px;
              width: 180px;
              margin: 6px auto;
            }
            .summary-card {
              padding: 24px 20px;
            }
            .summary-item {
              margin-bottom: 20px;
            }
            .summary-icon {
              font-size: 20px;
              width: 32px;
            }
            .summary-value {
              font-size: 16px;
            }
            .contact-section {
              padding: 32px 20px;
            }
            .contact-section h4 {
              font-size: 20px;
            }
          }
          @media (max-width: 480px) {
            .header, .content { 
              padding: 24px 16px; 
            }
            .header h1 {
              font-size: 24px;
            }
            .contact-btn {
              padding: 8px 16px;
              font-size: 13px;
              width: 160px;
              margin: 4px auto;
            }
            .summary-card {
              padding: 20px 16px;
            }
            .summary-item {
              margin-bottom: 16px;
            }
            .summary-icon {
              font-size: 18px;
              width: 28px;
            }
            .summary-value {
              font-size: 15px;
            }
            .contact-section {
              padding: 24px 16px;
            }
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
              Your service request has been successfully submitted. Our expert technician will contact you soon.
            </p>
            
            <div class="booking-summary">
              <div class="summary-card">
                <div class="summary-item">
                  <div class="summary-icon">🔧</div>
                  <div class="summary-content">
                    <div class="summary-label">Service Type</div>
                    <div class="summary-value">${data.serviceType || 'RO'} - ${data.serviceSubType || 'Service'}</div>
                  </div>
                </div>
                
                <div class="summary-item">
                  <div class="summary-icon">📅</div>
                  <div class="summary-content">
                    <div class="summary-label">Service Date</div>
                    <div class="summary-value">${new Date(data.scheduledDate).toLocaleDateString('en-IN', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}</div>
                  </div>
                </div>
                
                <div class="summary-item">
                  <div class="summary-icon">🕐</div>
                  <div class="summary-content">
                    <div class="summary-label">Time Slot</div>
                    <div class="summary-value">${formatTimeSlot(data.scheduledTimeSlot)}</div>
              </div>
              </div>
                
                <div class="summary-item">
                  <div class="summary-icon">📍</div>
                  <div class="summary-content">
                    <div class="summary-label">Location</div>
                    <div class="summary-value">${data.serviceAddress}</div>
              </div>
              </div>
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
                <a href="tel:+918884944288" class="contact-btn btn-phone">
                  📞 Phone
                </a>
                <a href="https://wa.me/918884944288?text=Hi, I have a booking for ${data.serviceType} service. My name is ${data.customerName}" class="contact-btn btn-message">
                  <img src="https://raw.githubusercontent.com/WhatsApp/WhatsApp-Logos/main/Logos/W-Logo/Green.png" alt="WhatsApp" style="width: 24px; height: 24px; vertical-align: middle; margin-right: 8px;" /> WhatsApp Us
                </a>
              </div>
              
              <div class="contact-info">
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
      // For development, don't actually send emails
      if (import.meta.env.DEV) {
        return false; // Return false in dev mode to indicate email wasn't actually sent
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
        
        // If it's a configuration error, don't fail the booking
        if (response.status === 500 && errorData.error?.includes('configuration')) {
          return false; // Return false to indicate email was not sent
        }
        
        throw new Error(`Email service error: ${errorData.error || response.statusText}`);
      }

      await response.json();
      return true;

    } catch (error) {
      // Silent failure - email errors shouldn't break the booking flow
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
