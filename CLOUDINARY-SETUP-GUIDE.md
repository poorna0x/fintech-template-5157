# 📸 Cloudinary Setup Guide for Image Uploads

This guide will help you set up Cloudinary for image uploads in your RO business CRM.

## 📋 Prerequisites

1. A Cloudinary account (sign up at [cloudinary.com](https://cloudinary.com))
2. Your project with the image upload functionality

## 🛠️ Step 1: Create Cloudinary Account

1. Go to [cloudinary.com](https://cloudinary.com) and sign up
2. Choose the **Free Plan** (perfect for getting started)
3. Verify your email address
4. Complete the account setup

## 🔑 Step 2: Get Cloudinary Credentials

1. In your Cloudinary dashboard, go to **Dashboard**
2. Copy the following values:
   - **Cloud Name** (e.g., `your-cloud-name`)
   - **API Key** (e.g., `123456789012345`)
   - **API Secret** (keep this secure!)

## ⚙️ Step 3: Create Upload Preset

1. In your Cloudinary dashboard, go to **Settings** → **Upload**
2. Scroll down to **Upload presets**
3. Click **Add upload preset**
4. Configure the preset:
   - **Preset name**: `ro-service-uploads`
   - **Signing Mode**: `Unsigned` (for client-side uploads)
   - **Folder**: `ro-service-booking`
   - **Access mode**: `Public`
   - **Auto-upload**: ✅ Enable
   - **Eager transformations**: Add these for optimization:
     - `w_800,h_600,c_fill,q_auto,f_auto` (thumbnail)
     - `w_1920,h_1080,c_limit,q_auto,f_auto` (optimized)
5. Click **Save**

## 🔧 Step 4: Configure Environment Variables

Add these to your `.env.local` file:

```env
# Cloudinary Configuration
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name_here
VITE_CLOUDINARY_UPLOAD_PRESET=ro-service-uploads
VITE_CLOUDINARY_API_KEY=your_api_key_here
```

## 🧪 Step 5: Test Image Upload

1. Restart your development server:
   ```bash
   npm run dev
   ```

2. Go to your booking form
3. Try uploading an image in Step 3
4. Check your Cloudinary dashboard → **Media Library** for uploaded images

## 🎯 Features Included

### **Image Upload Component:**
- ✅ **Drag & drop** or click to upload
- ✅ **Camera capture** on mobile devices
- ✅ **Image compression** (automatic)
- ✅ **Multiple image upload** (up to 5 images)
- ✅ **Image preview** with remove option
- ✅ **Progress indicators** during upload
- ✅ **Error handling** and validation

### **Image Processing:**
- ✅ **Automatic compression** (max 5MB per image)
- ✅ **Format optimization** (WebP when supported)
- ✅ **Responsive images** (multiple sizes)
- ✅ **Secure uploads** (signed URLs)

### **Integration:**
- ✅ **Booking form** integration
- ✅ **Database storage** (image URLs)
- ✅ **Admin dashboard** image viewing
- ✅ **Email templates** with images

## 🔒 Security Best Practices

### **Upload Preset Security:**
- Use **unsigned uploads** for client-side uploads
- Set **folder restrictions** to organize images
- Enable **auto-upload** for better UX
- Set **access mode** to public for web display

### **Image Validation:**
- **File type validation** (JPEG, PNG, WebP only)
- **File size limits** (5MB maximum)
- **Image compression** before upload
- **Virus scanning** (Cloudinary handles this)

## 📊 Usage and Limits

### **Free Plan Limits:**
- **25 GB storage**
- **25 GB bandwidth/month**
- **25,000 transformations/month**
- **Perfect for small to medium businesses**

### **Optimization Tips:**
- Images are automatically compressed
- Multiple sizes generated for different use cases
- WebP format used when supported by browser
- Lazy loading implemented for better performance

## 🚀 Production Deployment

### **Environment Variables:**
Make sure to add your Cloudinary credentials to your production environment:

**Vercel:**
```bash
vercel env add VITE_CLOUDINARY_CLOUD_NAME
vercel env add VITE_CLOUDINARY_UPLOAD_PRESET
vercel env add VITE_CLOUDINARY_API_KEY
```

**Netlify:**
1. Go to Site settings → Environment variables
2. Add the three Cloudinary variables

## 🔧 Troubleshooting

### **Common Issues:**

1. **"Cloudinary configuration is missing"**
   - Check your `.env.local` file has the correct variable names
   - Make sure variables start with `VITE_`
   - Restart your development server

2. **"Upload failed"**
   - Check your upload preset is set to "Unsigned"
   - Verify your cloud name is correct
   - Check your internet connection

3. **"Images not displaying"**
   - Check the image URLs in your database
   - Verify images are uploaded to Cloudinary
   - Check browser console for errors

4. **"File too large"**
   - Images are automatically compressed
   - Maximum file size is 5MB
   - Try uploading a smaller image

### **Debug Mode:**
Add this to your `.env.local` for debugging:
```env
VITE_DEBUG_CLOUDINARY=true
```

## 📈 Monitoring

### **Cloudinary Dashboard:**
- **Media Library**: View all uploaded images
- **Usage**: Monitor storage and bandwidth
- **Analytics**: Track image performance
- **Transformations**: View optimization stats

### **Application Monitoring:**
- Check browser console for upload errors
- Monitor network requests in dev tools
- Track upload success/failure rates

## 🔄 Backup and Maintenance

### **Image Management:**
- Images are automatically backed up by Cloudinary
- Set up **auto-deletion** for old images if needed
- Monitor **storage usage** regularly
- Use **CDN** for faster image delivery

### **Cost Optimization:**
- Use **eager transformations** for common sizes
- Implement **lazy loading** for better performance
- Monitor **bandwidth usage** monthly
- Consider **upgrading plan** as you grow

## 🎉 You're All Set!

Your image upload system is now ready with:
- ✅ **Professional image upload** component
- ✅ **Automatic compression** and optimization
- ✅ **Mobile camera** support
- ✅ **Secure cloud storage** with Cloudinary
- ✅ **Database integration** for image URLs
- ✅ **Admin dashboard** image viewing
- ✅ **Production-ready** configuration

Start by testing the image upload in your booking form, then explore the admin dashboard to see how images are displayed with bookings!
