# Technician ID Card System - Setup Guide

## Overview
This system allows you to create ID cards for technicians with photos and company details. Each technician gets a unique link that can be converted to a QR code for easy verification.

## Features
- ✅ Automatic link generation when technician is created
- ✅ Photo upload for technicians (stored in Cloudinary)
- ✅ Public ID card page accessible via QR code scan
- ✅ Company details displayed on ID card
- ✅ Copy link functionality for QR code generation

## Setup Steps

### 1. Database Migration
Run the SQL migration to add the photo field:

```sql
-- Run this in Supabase SQL Editor
-- File: add-technician-photo-field.sql
```

### 2. RLS Policy Update
Allow public access to technician ID card data:

```sql
-- Run this in Supabase SQL Editor
-- File: technician-id-card-rls.sql
```

### 3. How It Works

#### Creating a Technician:
1. Go to **Settings** page (`/settings`)
2. Click **"Add Technician"**
3. Fill in technician details
4. **Upload Technician Photo** (optional but recommended)
5. Click **"Create Technician"**
6. After creation, you'll see:
   - ✅ Success message
   - 📋 **ID Card Link** displayed
   - Copy button to copy the link
   - Open button to preview the ID card

#### Generating QR Code:
1. Copy the ID Card Link (e.g., `https://yourdomain.com/technician-id/abc-123-def-456`)
2. Visit any QR code generator:
   - [QR Code Generator](https://www.qr-code-generator.com)
   - [QRCode Monkey](https://www.qrcode-monkey.com)
   - Or any other QR generator
3. Paste the link
4. Generate and download the QR code image
5. Print the QR code for the technician

#### Viewing ID Card:
- When someone scans the QR code, they'll see:
  - Technician photo
  - Full name and Employee ID
  - Phone and email
  - Company details (address, phone, email, GST, PAN)
  - Verification note

## File Structure

### New Files Created:
1. `add-technician-photo-field.sql` - Database migration
2. `technician-id-card-rls.sql` - RLS policy for public access
3. `src/pages/TechnicianIdCard.tsx` - Public ID card display page

### Modified Files:
1. `src/App.tsx` - Added route `/technician-id/:id`
2. `src/pages/Settings.tsx` - Added photo upload and link generation

## Routes

### Public Route:
- `/technician-id/:id` - Displays technician ID card (public, no auth required)

## Database Schema

### technicians table - New Field:
```sql
photo TEXT -- Stores Cloudinary URL for technician photo
```

## Usage Examples

### Link Format:
```
https://yourdomain.com/technician-id/{technician-id}
```

Example:
```
https://hydrogenro.com/technician-id/550e8400-e29b-41d4-a716-446655440000
```

### In Settings Page:
- Each technician card shows their ID Card Link
- Click copy button to copy the link
- Use the link to generate QR code externally

## Security Notes

1. **Public Access**: The ID card page is publicly accessible (no authentication required)
2. **Limited Data**: Only basic technician info is exposed (name, ID, photo, contact)
3. **RLS Policy**: Public can only read basic fields needed for ID card display
4. **Sensitive Data**: Salary, performance metrics, etc. are NOT exposed

## Troubleshooting

### Photo not showing:
- Check if photo URL is valid
- Verify Cloudinary upload was successful
- Check browser console for image loading errors

### Link not working:
- Verify technician ID exists in database
- Check RLS policies are correctly set
- Ensure route is deployed correctly

### QR code not scanning:
- Ensure link is copied correctly (no extra spaces)
- Test the link in browser first
- Use a reliable QR code generator

## Next Steps

1. ✅ Run database migrations
2. ✅ Test creating a technician
3. ✅ Upload a photo
4. ✅ Copy the generated link
5. ✅ Generate QR code using external service
6. ✅ Test scanning QR code
7. ✅ Print QR codes for technicians

## Support

If you encounter any issues:
1. Check browser console for errors
2. Verify database migrations ran successfully
3. Check RLS policies in Supabase
4. Ensure Cloudinary is configured correctly

