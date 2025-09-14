# 🚀 Supabase Setup Guide for RO Business CRM

This guide will help you set up Supabase for your RO business CRM system.

## 📋 Prerequisites

1. A Supabase account (sign up at [supabase.com](https://supabase.com))
2. Node.js and npm installed on your system
3. Your project files ready

## 🛠️ Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose your organization
4. Enter project details:
   - **Name**: `ro-business-crm`
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose the closest region to your users
5. Click "Create new project"
6. Wait for the project to be created (usually 2-3 minutes)

## 🗄️ Step 2: Set Up Database Schema

1. In your Supabase dashboard, go to the **SQL Editor**
2. Click "New Query"
3. Copy the entire content from `supabase-schema.sql` file
4. Paste it into the SQL editor
5. Click "Run" to execute the schema

This will create all the necessary tables:
- `customers` - Customer information
- `jobs` - Service jobs and bookings
- `technicians` - Technician details and skills
- `service_areas` - Pincode coverage areas
- `parts_inventory` - Parts and equipment
- `notifications` - System notifications
- `admin_users` - Admin user management

## 🔑 Step 3: Get API Keys

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (looks like: `https://your-project-id.supabase.co`)
   - **Anon/Public Key** (starts with `eyJ...`)

## ⚙️ Step 4: Configure Environment Variables

For Vite projects, you should use `.env.local` for local development:

1. In your project root, create a `.env.local` file (copy from `env.example`)
2. Add your Supabase credentials:

```env
# Supabase Configuration (REQUIRED)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Email Configuration (OPTIONAL - for booking confirmations)
VITE_EMAIL_SERVICE_API_KEY=your_email_service_api_key
VITE_EMAIL_FROM=noreply@yourdomain.com

# Google Maps API (OPTIONAL - for location services)
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

**Important:** 
- Use `.env.local` for local development (this file is gitignored)
- Use `.env` for production deployment
- All environment variables for Vite must start with `VITE_`

## 🔒 Step 5: Configure Row Level Security (RLS)

The schema already includes RLS policies, but let's verify them:

1. Go to **Authentication** → **Policies** in your Supabase dashboard
2. You should see policies for all tables
3. The policies allow:
   - Public users to create customers and jobs (for booking form)
   - Authenticated users to read/update all data (for admin dashboard)

## 👤 Step 6: Create Admin User

1. Go to **Authentication** → **Users** in your Supabase dashboard
2. Click "Add user"
3. Create an admin user:
   - **Email**: `admin@roservice.com`
   - **Password**: Choose a strong password
   - **Auto Confirm User**: ✅ Check this

## 🧪 Step 7: Test the Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Test the booking form:
   - Go to `http://localhost:5173/book`
   - Fill out the form and submit
   - Check your Supabase dashboard → **Table Editor** → **customers** and **jobs** tables

3. Test the admin dashboard:
   - Go to `http://localhost:5173/admin`
   - You should see the dashboard with your test data

## 📧 Step 8: Email Service Setup (Optional)

For email confirmations, you can integrate with:

### Option 1: Resend (Recommended)
1. Sign up at [resend.com](https://resend.com)
2. Get your API key
3. Add to `.env`:
   ```env
   VITE_EMAIL_SERVICE_API_KEY=re_your_api_key_here
   VITE_EMAIL_FROM=noreply@yourdomain.com
   ```

### Option 2: SendGrid
1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Get your API key
3. Add to `.env`:
   ```env
   VITE_EMAIL_SERVICE_API_KEY=SG.your_api_key_here
   VITE_EMAIL_FROM=noreply@yourdomain.com
   ```

## 🗺️ Step 9: Google Maps Setup (Optional)

For location services:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable the following APIs:
   - Maps JavaScript API
   - Geocoding API
   - Places API
4. Create credentials (API Key)
5. Add to `.env`:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
   ```

## 🚀 Step 10: Production Deployment

### Deploy to Vercel (Recommended)

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Add environment variables in Vercel dashboard

### Deploy to Netlify

1. Build your project:
   ```bash
   npm run build
   ```

2. Upload the `dist` folder to Netlify
3. Add environment variables in Netlify dashboard

## 🔧 Troubleshooting

### Common Issues:

1. **"Missing Supabase environment variables"**
   - Check your `.env.local` file has the correct variable names
   - Make sure variables start with `VITE_`
   - Restart your development server after adding environment variables

2. **"Failed to create booking"**
   - Check your Supabase RLS policies
   - Verify the database schema was created correctly

3. **"Email not sending"**
   - Check your email service API key
   - Verify the email service is properly configured

4. **"Location not working"**
   - Check your Google Maps API key
   - Verify the Maps API is enabled

### Database Connection Issues:

1. Check your Supabase project is not paused
2. Verify your API keys are correct
3. Check the network tab in browser dev tools for errors

## 📊 Monitoring

### Supabase Dashboard:
- **Table Editor**: View and edit data
- **SQL Editor**: Run custom queries
- **Logs**: Monitor API calls and errors
- **API**: Check usage and limits

### Application Monitoring:
- Check browser console for errors
- Monitor network requests
- Use Supabase logs for backend issues

## 🔄 Backup and Maintenance

### Regular Backups:
1. Go to **Settings** → **Database** in Supabase
2. Set up automated backups
3. Download manual backups before major changes

### Database Maintenance:
1. Monitor table sizes
2. Clean up old notifications
3. Archive completed jobs periodically

## 📞 Support

If you encounter issues:

1. Check the [Supabase Documentation](https://supabase.com/docs)
2. Review the [Supabase Community](https://github.com/supabase/supabase/discussions)
3. Check your project's logs in the Supabase dashboard

---

## 🎉 You're All Set!

Your RO business CRM is now ready with:
- ✅ Customer booking system
- ✅ Admin dashboard
- ✅ Database with proper schema
- ✅ Email confirmations
- ✅ Location services
- ✅ Production-ready setup

Start by testing the booking form and then explore the admin dashboard to manage your business!
