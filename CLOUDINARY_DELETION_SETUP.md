# Cloudinary Photo Deletion Setup

## Overview
Photo deletion functionality requires `VITE_CLOUDINARY_API_SECRET` to be configured. Without it, photos will only be removed from the database but will remain in Cloudinary storage.

## Where Photo Deletion Happens

### 1. Job Photos (AdminDashboard)
- **Function**: `confirmDeletePhoto`
- **Location**: `src/components/AdminDashboard.tsx` (line ~6133)
- **Deletes from**: 
  - Database (job's `before_photos` or `after_photos`)
  - Cloudinary (if API secret is configured)
- **Success message**: 
  - "Photo deleted successfully from both database and Cloudinary" (if Cloudinary deletion succeeded)
  - "Photo removed from database. Note: Cloudinary deletion may have failed..." (if Cloudinary deletion failed)

### 2. Customer Photos (AdminDashboard)
- **Function**: `confirmDeleteCustomerPhoto`
- **Location**: `src/components/AdminDashboard.tsx` (line ~6261)
- **Deletes from**: 
  - Database (searches all customer jobs for photo in `before_photos`, `after_photos`, `images`, `requirements.bill_photos`, `requirements.payment_photos`, `requirements.qr_photos.payment_screenshot`)
  - Cloudinary (if API secret is configured)
- **Success message**: 
  - "Photo deleted successfully from both database and Cloudinary" (if Cloudinary deletion succeeded)
  - "Photo removed from database. Note: Cloudinary deletion requires API secret configuration." (if Cloudinary deletion failed)

### 3. Test Image Cleanup (Cloudinary Service)
- **Function**: `validateConfig` → `deleteImage`
- **Location**: `src/lib/cloudinary.ts` (line ~257)
- **Purpose**: Cleans up test image after configuration validation
- **Note**: Only runs if API key is available, and deleteImage will check for API secret

## Environment Variable Setup

### Local Development
Add to `.env.local` (already in `.gitignore`):
```
VITE_CLOUDINARY_API_SECRET=your_api_secret_here
```

### Production (Netlify)
1. Go to Netlify Dashboard → Site settings → Environment variables
2. Add `VITE_CLOUDINARY_API_SECRET` with your API secret value
3. Set scope to "Builds only" or "All scopes"
4. Redeploy the site

## Verification

### Check if API Secret is Configured
1. Open browser console
2. Delete a photo
3. Look for one of these messages:
   - ✅ `✅ Successfully deleted image from Cloudinary: [public_id]` - API secret is working
   - ⚠️ `⚠️ API secret not configured...` - API secret is missing

### Verify in Cloudinary Dashboard
1. Go to Cloudinary Media Library
2. Search for the deleted photo's public_id
3. Photo should be removed if deletion succeeded

## Troubleshooting

### Photos Not Deleting from Cloudinary
1. **Check API secret is set**: Verify `VITE_CLOUDINARY_API_SECRET` is in environment variables
2. **Check console logs**: Look for Cloudinary deletion errors
3. **Verify API secret is correct**: Test with Cloudinary API directly
4. **Check public_id extraction**: Some URLs might not extract public_id correctly

### Common Issues
- **"API secret not configured"**: Add `VITE_CLOUDINARY_API_SECRET` to environment variables
- **"Could not extract public_id"**: Photo URL might not be a Cloudinary URL
- **"Cloudinary deletion failed"**: Check API secret is correct and has delete permissions

## Code Flow

```
User clicks delete
  ↓
confirmDeletePhoto / confirmDeleteCustomerPhoto
  ↓
cloudinaryService.extractPublicId(photoUrl)
  ↓
cloudinaryService.deleteImage(publicId, useSecondary)
  ↓
Checks: activeConfig.apiSecret exists?
  ↓
YES → Generate signature → Call Cloudinary API → Delete from storage
NO → Log warning → Return false → Only remove from database
  ↓
Update database (remove photo from job/customer)
  ↓
Show success message
```

## All Deletion Paths Verified ✅

- ✅ Job photos deletion (AdminDashboard)
- ✅ Customer photos deletion (AdminDashboard)  
- ✅ Test image cleanup (Cloudinary service)
- ✅ All use `cloudinaryService.deleteImage()` which checks for API secret
- ✅ Proper error handling and user feedback

