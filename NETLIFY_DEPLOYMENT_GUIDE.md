# Netlify Deployment Guide

## ⚠️ SECURITY WARNING

**NEVER commit environment variables or secrets to git!**

- All environment variables should be set in Netlify Dashboard only
- Do NOT create files like `NETLIFY_ENV*.txt` or `netlify-env*.txt` with actual values
- Use `.env.local` for local development (already in `.gitignore`)
- If you accidentally commit secrets, rotate them immediately

## Quick Deploy Steps

1. Go to Deploys tab
2. Click "Trigger deploy" > "Deploy site"
3. Build should now succeed!

## Live site = main only

To make the **live** site deploy only from `main` (no other branch becomes production):

1. **Site settings** → **Build & deploy** → **Continuous deployment**
2. Set **Production branch** to `main`
3. Under **Branch deploys**, choose **Only deploy the production branch** (so only pushes to `main` update the live site)

## Environment Variables Setup

### IMPORTANT NOTES

- **VITE_*** variables are used at **BUILD TIME** (embedded in the JavaScript bundle)
- **Non-VITE_*** variables are used at **RUNTIME** (by Netlify Functions)
- Make sure to set the scope correctly:
  * "All scopes" for most variables
  * "Builds only" for VITE_* variables (optional, but recommended)
  * "Functions only" for server-side variables (optional)

## Required Environment Variables Checklist

### Build-Time Variables (VITE_*)

✅ **VITE_SUPABASE_URL** (REQUIRED - build will fail without this)
✅ **VITE_SUPABASE_ANON_KEY** (REQUIRED - build will fail without this)
✅ **VITE_EMAIL_API_URL**
✅ **VITE_EMAIL_FROM**
✅ **VITE_GOOGLE_MAPS_API_KEY**
✅ All **VITE_FIREBASE_*** variables
✅ All **VITE_CLOUDINARY_*** variables
  - **VITE_CLOUDINARY_CLOUD_NAME** (required for uploads)
  - **VITE_CLOUDINARY_UPLOAD_PRESET** (required for uploads)
  - **VITE_CLOUDINARY_API_KEY** (required for uploads)
  - **VITE_CLOUDINARY_API_SECRET** (REQUIRED for photo deletion - without this, photos will only be removed from database, not Cloudinary storage)

### Runtime Variables (Server-Side)

✅ **HOSTINGER_EMAIL_*** variables
✅ **FIREBASE_*** variables (non-VITE_*)
✅ Any other server-side configuration variables

## How to Set Environment Variables in Netlify

1. Go to your site dashboard
2. Navigate to **Site settings** > **Environment variables**
3. Click **Add a variable**
4. Enter the variable name and value
5. Set the appropriate scope:
   - **All scopes** for most variables
   - **Builds only** for VITE_* variables
   - **Functions only** for server-side variables
6. Click **Save**

## Troubleshooting

### Build Fails
- Check that all required VITE_* variables are set
- Verify variable names are correct (case-sensitive)
- Ensure variables are set to "Builds only" or "All scopes"

### Runtime Errors
- Check that runtime variables are set correctly
- Verify variable scopes include "Functions" or "All scopes"
- Check Netlify Functions logs for specific errors

