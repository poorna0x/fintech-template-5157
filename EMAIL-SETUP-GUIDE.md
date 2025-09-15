# Email Confirmation Setup Guide

This guide will help you set up email confirmations for service bookings using your Hostinger email.

## Prerequisites

- Hostinger email account (e.g., `noreply@hydrogenro.com`)
- Netlify account for hosting
- Domain configured with Netlify

## Step 1: Configure Hostinger Email

1. **Log into your Hostinger control panel**
2. **Go to Email section**
3. **Create an email account** (e.g., `noreply@hydrogenro.com`)
4. **Note down the email credentials**:
   - Email: `noreply@hydrogenro.com`
   - Password: `your-email-password`

## Step 2: Set Environment Variables in Netlify

1. **Go to your Netlify dashboard**
2. **Select your site**
3. **Go to Site settings → Environment variables**
4. **Add these variables**:

```
HOSTINGER_EMAIL_USER = noreply@hydrogenro.com
HOSTINGER_EMAIL_PASS = your-email-password
VITE_EMAIL_FROM = noreply@hydrogenro.com
```

## Step 3: Deploy to Netlify

1. **Push your code to GitHub**
2. **Netlify will automatically deploy**
3. **The email function will be available at**: `https://yourdomain.com/.netlify/functions/send-email`

## Step 4: Test Email Functionality

1. **Make a test booking** on your website
2. **Check if confirmation email is sent**
3. **Check Netlify function logs** for any errors

## Email Template Features

The confirmation email includes:

- ✅ **Professional HTML design**
- ✅ **Booking details** (ID, service type, date, time)
- ✅ **Customer information**
- ✅ **Service address**
- ✅ **Next steps information**
- ✅ **Contact details**
- ✅ **Mobile-responsive design**

## Troubleshooting

### Email not sending?

1. **Check Netlify function logs**:
   - Go to Netlify dashboard
   - Click on your site
   - Go to Functions tab
   - Check logs for errors

2. **Verify environment variables**:
   - Make sure `HOSTINGER_EMAIL_USER` and `HOSTINGER_EMAIL_PASS` are set
   - Check if credentials are correct

3. **Test SMTP connection**:
   - Use an SMTP testing tool
   - Verify Hostinger SMTP settings:
     - Host: `smtp.hostinger.com`
     - Port: `587`
     - Security: `STARTTLS`

### Common Issues

**"Authentication failed"**
- Check email username and password
- Make sure email account is active in Hostinger

**"Connection timeout"**
- Check if port 587 is blocked
- Try port 465 with SSL

**"Function not found"**
- Make sure `netlify.toml` is in root directory
- Redeploy the site

## Email Content Customization

To customize the email template:

1. **Edit** `src/lib/email.ts`
2. **Modify** the `emailTemplates.bookingConfirmation` function
3. **Update** HTML and text content as needed
4. **Redeploy** to see changes

## Security Notes

- ✅ **Environment variables** are secure in Netlify
- ✅ **CORS headers** are properly configured
- ✅ **Input validation** is implemented
- ✅ **Error handling** is in place

## Support

If you need help:
1. Check Netlify function logs
2. Verify Hostinger email settings
3. Test with a simple email first
4. Contact support if issues persist

---

**Your email confirmation system is now ready!** 🎉

When customers book a service, they'll automatically receive a professional confirmation email with all the details.
