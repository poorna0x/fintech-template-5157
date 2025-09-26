# 🔧 Cloudinary Upload Fix Guide

## Issue: "Failed to fetch" Error

The "Failed to fetch" error when uploading images is typically caused by an incorrectly configured upload preset in Cloudinary.

## 🚨 Quick Fix

### Step 1: Check Upload Preset Configuration

1. Go to your [Cloudinary Dashboard](https://cloudinary.com/console)
2. Navigate to **Settings** → **Upload**
3. Scroll down to **Upload presets**
4. Find the preset named `ro-service-uploads`
5. Click **Edit** or **Configure**

### Step 2: Configure Upload Preset

Make sure these settings are correct:

- **Preset name**: `ro-service-uploads`
- **Signing Mode**: `Unsigned` ⚠️ **This is the most important setting**
- **Folder**: `ro-service-booking`
- **Access mode**: `Public`
- **Auto-upload**: ✅ **Enabled**
- **Eager transformations**: Add these for optimization:
  - `w_800,h_600,c_fill,q_auto,f_auto` (thumbnail)
  - `w_1920,h_1080,c_limit,q_auto,f_auto` (optimized)

### Step 3: Save and Test

1. Click **Save** to save the preset
2. Test the image upload in your booking form
3. Check the browser console for any error messages

## 🔍 Debugging Steps

### Check Browser Console

Open your browser's developer tools and look for:

1. **Cloudinary config log** - Should show all settings as "✓ Set"
2. **Upload request log** - Should show the upload details
3. **Error messages** - Look for specific error details

### Test with Simple HTML

Use the `test-cloudinary.html` file in your project root to test uploads directly:

1. Open `test-cloudinary.html` in your browser
2. Try uploading an image
3. Check the console for detailed error messages

### Common Error Messages

| Error | Solution |
|-------|----------|
| "Upload preset not found" | Check preset name is exactly `ro-service-uploads` |
| "Invalid upload preset" | Ensure preset is set to "Unsigned" mode |
| "CORS error" | Check browser console for specific CORS issues |
| "Network error" | Check internet connection and Cloudinary status |

## 🛠️ Alternative Solution

If the upload preset is still not working, you can create a new one:

### Create New Upload Preset

1. In Cloudinary Dashboard → **Settings** → **Upload**
2. Click **Add upload preset**
3. Use these exact settings:
   - **Preset name**: `ro-service-uploads-v2`
   - **Signing Mode**: `Unsigned`
   - **Folder**: `ro-service-booking`
   - **Access mode**: `Public`
   - **Auto-upload**: ✅ Enabled
4. Click **Save**

### Update Environment Variable

Update your `.env.local` file:

```env
VITE_CLOUDINARY_UPLOAD_PRESET=ro-service-uploads-v2
```

## ✅ Verification

After fixing the upload preset, you should see:

1. ✅ **Console log**: "Cloudinary config: { cloudName: '✓ Set', uploadPreset: '✓ Set', apiKey: '✓ Set' }"
2. ✅ **Upload log**: "Uploading to Cloudinary: { cloudName: 'dnbpshwiz', uploadPreset: 'ro-service-uploads', folder: 'ro-service-booking' }"
3. ✅ **Success**: Images upload successfully to Cloudinary
4. ✅ **Database**: Image URLs are saved to the database

## 🆘 Still Having Issues?

If you're still experiencing problems:

1. **Check Cloudinary Status**: Visit [status.cloudinary.com](https://status.cloudinary.com)
2. **Verify API Key**: Make sure your API key is correct in `.env.local`
3. **Test with cURL**: Use the test command in the terminal
4. **Contact Support**: Reach out to Cloudinary support if needed

## 📞 Support

- **Cloudinary Support**: [support.cloudinary.com](https://support.cloudinary.com)
- **Documentation**: [cloudinary.com/documentation](https://cloudinary.com/documentation)
- **Upload Preset Guide**: [cloudinary.com/documentation/upload_presets](https://cloudinary.com/documentation/upload_presets)
