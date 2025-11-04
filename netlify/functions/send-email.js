// Netlify Function for sending emails via Hostinger SMTP
const nodemailer = require('nodemailer');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');

exports.handler = async (event, context) => {
  console.log('Email function called:', event.httpMethod, event.body);
  
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  // SECURITY: Check if origin is allowed
  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Forbidden: Origin not allowed',
      }),
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    console.log('Raw body:', event.body);
    const bodyData = JSON.parse(event.body);
    console.log('Parsed body:', bodyData);
    
    const { to, subject, html, text } = bodyData;
    console.log('Extracted data:', { to, subject, html: html ? 'HTML present' : 'No HTML', text: text ? 'Text present' : 'No text' });

    // Check environment variables
    console.log('Environment check:', {
      hasUser: !!process.env.HOSTINGER_EMAIL_USER,
      hasPass: !!process.env.HOSTINGER_EMAIL_PASS,
      user: process.env.HOSTINGER_EMAIL_USER
    });

    // Validate required fields
    if (!to || !subject || !html) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
      };
    }

    // Check if environment variables are set
    if (!process.env.HOSTINGER_EMAIL_USER || !process.env.HOSTINGER_EMAIL_PASS) {
      console.error('Missing environment variables');
      return {
        statusCode: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Email configuration missing',
          details: 'Environment variables HOSTINGER_EMAIL_USER and HOSTINGER_EMAIL_PASS not set. Please configure these in your hosting platform.',
          configuration: 'missing'
        }),
      };
    }

    // Create transporter using Hostinger SMTP
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.HOSTINGER_EMAIL_USER, // Your Hostinger email
        pass: process.env.HOSTINGER_EMAIL_PASS, // Your Hostinger email password
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Email options with spam prevention
    const mailOptions = {
      from: {
        name: 'Hydrogen RO - Water Purifier Services',
        address: process.env.HOSTINGER_EMAIL_USER
      },
      to: to,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      headers: {
        'X-Mailer': 'Hydrogen RO Service',
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal',
        'X-Report-Abuse': 'Please report abuse to abuse@hydrogenro.com',
        'List-Unsubscribe': '<mailto:unsubscribe@hydrogenro.com>',
        'Precedence': 'bulk'
      },
      replyTo: 'info@hydrogenro.com',
      // Add message ID for better deliverability
      messageId: `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@hydrogenro.com>`
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        success: true, 
        messageId: info.messageId,
        message: 'Email sent successfully' 
      }),
    };

  } catch (error) {
    console.error('Error sending email:', error);
    
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Failed to send email',
        details: error.message 
      }),
    };
  }
};
