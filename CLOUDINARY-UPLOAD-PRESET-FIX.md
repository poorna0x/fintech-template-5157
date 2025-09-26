# 🚨 URGENT: Cloudinary Upload Preset Fix

## ❌ Current Issue
**Error**: `Network error: Unable to connect to Cloudinary. Please check your internet connection and try again.`

**Root Cause**: The upload preset `ro-service-uploads` is **NOT configured as "Unsigned" mode**, which is required for client-side uploads.

## ✅ IMMEDIATE FIX REQUIRED

### Step 1: Access Cloudinary Dashboard
1. Go to [https://cloudinary.com/console](https://cloudinary.com/console)
2. Log in to your account
3. Select your project (cloud name: `dnbpshwiz`)

### Step 2: Configure Upload Preset
1. Navigate to **Settings** → **Upload**
2. Scroll down to **Upload presets**
3. Find the preset named `ro-service-uploads`
4. Click **Edit** or **Configure**

### Step 3: CRITICAL SETTINGS
Make sure these settings are **EXACTLY** as shown:

```
Preset name: ro-service-uploads
Signing Mode: Unsigned ⚠️ THIS IS THE KEY FIX
Folder: ro-service-booking
Access mode: Public
Auto-upload: ✅ Enabled
```

### Step 4: Save and Test
1. Click **Save** to save the preset
2. Test the image upload in your booking form
3. The error should be resolved immediately

## 🔍 Why This Happens

When an upload preset is set to "Signed" mode:
- It requires server-side authentication
- Client-side uploads fail with "Failed to fetch"
- The browser cannot authenticate the request

When set to "Unsigned" mode:
- No authentication required
- Client-side uploads work perfectly
- Perfect for web applications

## 🧪 Test After Fix

After configuring the preset as "Unsigned", test with:

1. **Browser Test**: Open `test-cloudinary.html` in your browser
2. **Booking Form**: Try uploading an image in the booking form
3. **Console Check**: Look for success messages in browser console

## 📋 Expected Results After Fix

✅ **Console Log**: "Cloudinary config: { cloudName: '✓ Set', uploadPreset: '✓ Set', apiKey: '✓ Set' }"
✅ **Upload Success**: Images upload without errors
✅ **Database Save**: Image URLs are saved to the database
✅ **Admin View**: Images appear in the admin dashboard

## 🆘 If Still Not Working

If you still get errors after setting to "Unsigned":

1. **Create New Preset**:
   - Name: `ro-service-uploads-v2`
   - Mode: `Unsigned`
   - Folder: `ro-service-booking`

2. **Update Environment**:
   ```env
   VITE_CLOUDINARY_UPLOAD_PRESET=ro-service-uploads-v2
   ```

3. **Restart Server**:
   ```bash
   npm run dev
   ```

## ⚡ Quick Verification

Run this command to test the preset:
```bash
curl -X POST "https://api.cloudinary.com/v1_1/dnbpshwiz/image/upload" \
  -F "upload_preset=ro-service-uploads" \
  -F "file=@/path/to/test-image.jpg"
```

If it returns a JSON response with `public_id` and `secure_url`, the preset is working correctly.

## 🎯 This Fix Will Resolve

- ✅ "Failed to fetch" errors
- ✅ "Network error" messages  
- ✅ Image upload failures
- ✅ Booking form submission issues
- ✅ All Cloudinary connectivity problems

**The fix is simple but critical - just change the upload preset to "Unsigned" mode!**
