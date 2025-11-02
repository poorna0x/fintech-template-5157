# 🗺️ **Netlify Google Maps Setup Guide**

## 🚨 **InvalidKeyMapError Fix**

The `InvalidKeyMapError` means your Google Maps API key is either:
1. **Missing** in Netlify environment variables
2. **Incorrect** or has been invalidated
3. **Restricted** and doesn't allow your domain
4. Missing required **API permissions**

---

## ✅ **Solution: Add Google Maps API Key to Netlify**

### **Step 1: Get Your Google Maps API Key**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create a new one)
3. Enable these APIs:
   - **Maps JavaScript API** ✅
   - **Geocoding API** ✅
   - **Places API** ✅
   - **Distance Matrix API** ✅

4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy your API key

### **Step 2: Configure API Key Restrictions (Recommended)**

For security, restrict your API key:

1. Click on your API key in Google Cloud Console
2. Under **Application restrictions**, choose:
   - **HTTP referrers (websites)**
   - Add your domains:
     ```
     https://yourdomain.netlify.app/*
     https://yourdomain.com/*
     http://localhost:*/*
     ```
3. Under **API restrictions**:
   - **Restrict key**
   - Select: Maps JavaScript API, Geocoding API, Places API, Distance Matrix API
4. **Save** the restrictions

### **Step 3: Add to Netlify Environment Variables**

1. Log into [Netlify Dashboard](https://app.netlify.com)
2. Go to your site → **Site Settings** → **Environment Variables**
3. Click **Add a variable**
4. Add:
   - **Key**: `VITE_GOOGLE_MAPS_API_KEY`
   - **Value**: `your_actual_google_maps_api_key_here`
5. Click **Save**

### **Step 4: Redeploy**

After adding the environment variable:

1. Go to **Deploys** tab in Netlify
2. Click **Trigger deploy** → **Deploy site**
3. Or push a commit to trigger automatic deploy

---

## 🔍 **Verify the Fix**

1. Open your deployed site
2. Navigate to the booking page
3. Try to use the location search
4. Check browser console for errors

**Expected Results:**
- ✅ Location autocomplete works
- ✅ Map loads properly
- ✅ "Get Current Location" works
- ✅ Dragging marker works

---

## 🛠️ **Troubleshooting**

### **Error: InvalidKeyMapError**

**Causes:**
- API key missing in Netlify env vars
- API key incorrect or copied wrong
- API restrictions don't allow your domain

**Fix:**
- Verify API key is set in Netlify → Site Settings → Environment Variables
- Check API key restrictions allow your domain
- Redeploy after adding the variable

### **Error: RefererNotAllowedMapError**

**Cause:** API key restrictions are too strict

**Fix:**
- Go to Google Cloud Console → API key settings
- Add your domain to HTTP referrers:
  - `https://yourdomain.netlify.app/*`
  - `https://yourdomain.com/*`

### **Error: ApiNotActivatedMapError**

**Cause:** Required APIs not enabled

**Fix:**
- Go to Google Cloud Console → APIs & Services → Enabled APIs
- Enable:
  - Maps JavaScript API
  - Geocoding API
  - Places API
  - Distance Matrix API

### **Error: This API key is not authorized**

**Cause:** API restrictions too strict

**Fix:**
- In Google Cloud Console → API key → API restrictions
- Either:
  - Select "Don't restrict key" (not recommended for production)
  - Or add all required APIs to the restricted list

### **Warning: Autocomplete is deprecated**

**Message:** "As of March 1st, 2025, google.maps.places.Autocomplete is not available to new customers"

**Note:** 
- The application currently uses the legacy `Autocomplete` API which still works for existing customers
- `PlaceAutocompleteElement` is recommended for new customers
- The app uses `@googlemaps/js-api-loader` for proper API loading
- This warning is informational and doesn't break functionality
- Migration to `PlaceAutocompleteElement` will be done in a future update

---

## 💰 **Billing Note**

Google Maps API is **not free** anymore. You need:

1. **Billing enabled** in Google Cloud Console
2. **Payment method** added
3. **$200 free credits** per month (covers most small to medium usage)

**Cost estimates:**
- Maps JavaScript API: ~$7 per 1000 loads
- Geocoding API: ~$5 per 1000 requests
- Places API: ~$17-32 per 1000 requests

**Monitor usage:**
- Set up billing alerts in Google Cloud Console
- Monitor API usage in the dashboard
- Set quotas to prevent unexpected charges

---

## 🔐 **Security Best Practices**

1. ✅ **Always restrict API keys** to specific domains
2. ✅ **Enable only required APIs**
3. ✅ **Use environment variables** (never commit keys to git)
4. ✅ **Rotate keys** periodically
5. ✅ **Monitor usage** for unusual activity

---

## 📋 **Complete Environment Variables Checklist**

Add these to Netlify Environment Variables:

```bash
# Required
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Email (Required)
HOSTINGER_EMAIL_USER=your-email@yourdomain.com
HOSTINGER_EMAIL_PASS=your-email-password

# Google Maps (Optional but recommended)
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...your_key_here

# Cashfree Payments (Required for payments)
VITE_CASHFREE_APP_ID=your_cashfree_app_id
VITE_CASHFREE_SECRET_KEY=your_cashfree_secret_key
VITE_CASHFREE_ENVIRONMENT=sandbox

# Cloudinary (Optional)
VITE_CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=your_cloudinary_upload_preset
```

---

## 🆘 **Still Having Issues?**

1. Check **Netlify Deploy Logs** for build errors
2. Verify environment variables show in deploy logs (values are hidden for security)
3. Test locally with `.env.local` file first
4. Check browser console for specific error messages
5. Verify Google Cloud Console shows API usage from your domain

---

## 📚 **Resources**

- [Google Maps JavaScript API Docs](https://developers.google.com/maps/documentation/javascript)
- [Netlify Environment Variables](https://docs.netlify.com/environment-variables/overview/)
- [Google Maps API Pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Enable Maps APIs](https://console.cloud.google.com/google/maps-apis)
