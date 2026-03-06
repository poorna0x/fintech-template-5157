// Cloudinary service for image uploads
// This handles image uploads for the booking form

/** Base URL for Netlify cloudinary-delete function (dev uses 8888 so secret stays server-side) */
function getCloudinaryDeleteFunctionUrl(): string {
  const path = '/.netlify/functions/cloudinary-delete';
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalNetwork = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname);
    const base = isLocalNetwork ? `http://${hostname}:8888` : 'http://localhost:8888';
    return `${base}${path}`;
  }
  return path;
}

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
  apiKey?: string;
  apiSecret?: string;
}

class CloudinaryService {
  private config: CloudinaryConfig;
  private secondaryConfig: CloudinaryConfig | null;

  constructor() {
    this.config = {
      cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
      uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
      apiKey: import.meta.env.VITE_CLOUDINARY_API_KEY || '',
      apiSecret: import.meta.env.VITE_CLOUDINARY_API_SECRET || '',
    };

    // Secondary Cloudinary account for optimized/temporary images
    const secondaryCloudName = import.meta.env.VITE_CLOUDINARY_SECONDARY_CLOUD_NAME;
    const secondaryUploadPreset = import.meta.env.VITE_CLOUDINARY_SECONDARY_UPLOAD_PRESET;
    const secondaryApiKey = import.meta.env.VITE_CLOUDINARY_SECONDARY_API_KEY;
    const secondaryApiSecret = import.meta.env.VITE_CLOUDINARY_SECONDARY_API_SECRET;

    if (secondaryCloudName && secondaryUploadPreset) {
      this.secondaryConfig = {
        cloudName: secondaryCloudName,
        uploadPreset: secondaryUploadPreset,
        apiKey: secondaryApiKey || '',
        apiSecret: secondaryApiSecret || '',
      };
    } else {
      this.secondaryConfig = null;
    }
  }

  async uploadImage(file: File, folder: string = 'ro-service', useSecondary: boolean = false): Promise<CloudinaryUploadResult> {
    // Use secondary account if requested, otherwise use primary
    let activeConfig: CloudinaryConfig;
    let isUsingSecondary = false;
    
    if (useSecondary) {
      // Secondary account is required
      if (!this.secondaryConfig) {
        throw new Error('Secondary Cloudinary account is not configured. Please add VITE_CLOUDINARY_SECONDARY_CLOUD_NAME and VITE_CLOUDINARY_SECONDARY_UPLOAD_PRESET to your environment variables.');
      }
      activeConfig = this.secondaryConfig;
      isUsingSecondary = true;
      
      // Debug logging in development
      if (import.meta.env.DEV) {
        console.log('[Cloudinary] Using secondary account:', {
          cloudName: activeConfig.cloudName,
          uploadPreset: activeConfig.uploadPreset,
          hasApiKey: !!activeConfig.apiKey
        });
      }
    } else {
      // Use primary account
      if (!this.config.cloudName || !this.config.uploadPreset) {
        throw new Error('Primary Cloudinary configuration is missing. Please check your environment variables.');
      }
      activeConfig = this.config;
      
      // Debug logging in development
      if (import.meta.env.DEV) {
        console.log('[Cloudinary] Using PRIMARY (main) account:', {
          cloudName: activeConfig.cloudName,
          uploadPreset: activeConfig.uploadPreset,
          folder: folder
        });
      }
    }
    
    // Validate active config
    if (!activeConfig.cloudName || !activeConfig.uploadPreset) {
      throw new Error('Cloudinary configuration is missing. Please check your environment variables.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', activeConfig.uploadPreset);
    formData.append('folder', folder);
    
    // Timeout so a slow/hanging request fails instead of leaving the UI stuck (user had to refresh)
    const UPLOAD_TIMEOUT_MS = 30_000; // 30 seconds max
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData,
          mode: 'cors',
          credentials: 'omit',
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson: any = {};
        
        try {
          errorJson = JSON.parse(errorText);
        } catch {
          // Not JSON, use text as is
        }
        
        // Debug logging in development
        if (import.meta.env.DEV) {
          console.error('[Cloudinary Upload Error]', {
            status: response.status,
            statusText: response.statusText,
            accountType: isUsingSecondary ? 'Secondary' : 'Primary',
            cloudName: activeConfig.cloudName,
            uploadPreset: activeConfig.uploadPreset,
            errorText: errorText,
            errorJson: errorJson
          });
        }
        
        // Check for specific error messages
        if (errorText.includes('Upload preset must be specified') || errorJson?.error?.message?.includes('preset')) {
          const accountType = isUsingSecondary ? 'Secondary' : 'Primary';
          throw new Error(`${accountType} Cloudinary upload preset "${activeConfig.uploadPreset}" not found. Please verify the preset name in your Cloudinary dashboard and environment variables.`);
        }
        
        if (errorText.includes('Invalid upload preset') || errorJson?.error?.message?.includes('Invalid')) {
          const accountType = isUsingSecondary ? 'Secondary' : 'Primary';
          throw new Error(`${accountType} Cloudinary upload preset "${activeConfig.uploadPreset}" is invalid. Please ensure it exists and is set to "Unsigned" mode in your Cloudinary dashboard.`);
        }
        
        if (errorText.includes('unsigned upload') || errorJson?.error?.message?.includes('unsigned')) {
          const accountType = isUsingSecondary ? 'Secondary' : 'Primary';
          throw new Error(`${accountType} Cloudinary upload preset "${activeConfig.uploadPreset}" must be configured as "Unsigned" mode. Go to Settings → Upload → Upload presets and set signing mode to "Unsigned".`);
        }
        
        if (errorText.includes('Unknown API key') || errorText.includes('Unauthorized') || response.status === 401 || response.status === 403) {
          if (isUsingSecondary) {
            const errorMsg = errorJson?.error?.message || errorText;
            throw new Error(`Secondary Cloudinary account error: ${errorMsg}. Please verify:\n1. Cloud Name: ${activeConfig.cloudName}\n2. Upload Preset: ${activeConfig.uploadPreset}\n3. Preset is set to "Unsigned" mode\n4. Environment variables are loaded (restart dev server after adding them)`);
          } else {
            throw new Error('Primary Cloudinary API key is invalid. Please check your environment variables.');
          }
        }
        
        const accountType = isUsingSecondary ? 'Secondary' : 'Primary';
        const errorMsg = errorJson?.error?.message || errorText;
        throw new Error(`${accountType} Cloudinary upload failed (${response.status}): ${errorMsg}`);
      }

      const result = await response.json();
      
      if (!result.public_id || !result.secure_url) {
        throw new Error('Invalid response from Cloudinary');
      }
      
      return {
        public_id: result.public_id,
        secure_url: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Upload timed out. Check your connection and try again, or use a smaller photo.');
      }
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        throw new Error('Network error: Unable to connect to Cloudinary. Please check your internet connection and try again.');
      }
      if (error instanceof Error && error.message.includes('CORS')) {
        throw new Error('CORS error: Please check your Cloudinary configuration and upload preset settings.');
      }
      throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async uploadMultipleImages(files: File[], folder: string = 'ro-service', useSecondary: boolean = false): Promise<CloudinaryUploadResult[]> {
    const uploadPromises = files.map(file => this.uploadImage(file, folder, useSecondary));
    return Promise.all(uploadPromises);
  }

  getImageUrl(publicId: string, transformations?: string, useSecondary: boolean = false): string {
    const activeConfig = useSecondary && this.secondaryConfig ? this.secondaryConfig : this.config;
    
    if (!activeConfig.cloudName) {
      throw new Error('Cloudinary cloud name is not configured');
    }

    const baseUrl = `https://res.cloudinary.com/${activeConfig.cloudName}/image/upload`;
    const transformString = transformations ? `/${transformations}` : '';
    
    return `${baseUrl}${transformString}/${publicId}`;
  }

  // Generate optimized image URLs for different use cases
  // Note: With unsigned uploads, transformations are applied at delivery time, not upload time
  getOptimizedImageUrl(publicId: string, options: {
    width?: number;
    height?: number;
    quality?: 'auto' | number;
    format?: 'auto' | 'webp' | 'jpg' | 'png';
    useSecondary?: boolean;
  } = {}): string {
    const { width, height, quality = 'auto', format = 'auto', useSecondary = false } = options;
    
    const transformations = [];
    if (width) transformations.push(`w_${width}`);
    if (height) transformations.push(`h_${height}`);
    if (quality) transformations.push(`q_${quality}`);
    if (format) transformations.push(`f_${format}`);
    
    return this.getImageUrl(publicId, transformations.join(','), useSecondary);
  }

  // Test Cloudinary configuration
  async testConfiguration(): Promise<{ valid: boolean; error?: string }> {
    if (!this.config.cloudName) {
      return { valid: false, error: 'Cloud name is missing' };
    }
    
    if (!this.config.uploadPreset) {
      return { valid: false, error: 'Upload preset is missing' };
    }
    
    try {
      // Test with a small dummy file
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png');
      });
      
      const testFile = new File([blob], 'test.png', { type: 'image/png' });
      const result = await this.uploadImage(testFile, 'test');
      
      // Clean up test image (only if API key is available)
      if (this.config.apiKey) {
        const del = await this.deleteImage(result.public_id);
        if (!del.success) return;
      }
      
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Generate signature for Cloudinary API calls
  private async generateSignature(params: Record<string, string | number>, apiSecret: string): Promise<string> {
    // Sort parameters alphabetically (excluding signature itself)
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    // Cloudinary signature format: SHA-1 hash of (sorted_params + apiSecret)
    // Note: apiSecret is appended WITHOUT an ampersand
    // IMPORTANT: api_key is NOT included in signature generation
    const message = paramString + apiSecret;
    
    console.log('🔐 Generating Cloudinary signature:', {
      paramString,
      stringToSign: paramString,
      messageLength: message.length,
      note: 'api_key is excluded from signature'
    });
    
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    // Convert hash bytes to hex string (Cloudinary expects hex, not base64)
    const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('✅ Generated signature (hex):', hexHash.substring(0, 20) + '...');
    
    return hexHash;
  }

  /** Delete image via Netlify function. Returns { success, error } so UI can show the real failure reason. */
  async deleteImage(publicId: string, useSecondary: boolean = false): Promise<{ success: boolean; error?: string }> {
    const functionUrl = getCloudinaryDeleteFunctionUrl();
    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId: publicId.trim(), useSecondary }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.deleted === true) {
        console.log(`✅ Deleted image from Cloudinary: ${publicId}`);
        return { success: true };
      }
      const errMsg = data.error || (response.status === 503 ? 'Cloudinary not configured (set CLOUDINARY_* in Netlify env)' : `HTTP ${response.status}`);
      console.warn(`⚠️ Cloudinary delete failed for ${publicId}:`, errMsg);
      return { success: false, error: errMsg };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Network or request failed';
      console.error('Error deleting image from Cloudinary:', error);
      return { success: false, error: errMsg };
    }
  }

  // Check if secondary account is available
  hasSecondaryAccount(): boolean {
    return this.secondaryConfig !== null;
  }

  // Extract public_id from Cloudinary URL
  extractPublicId(url: string): { publicId: string; useSecondary: boolean } | null {
    if (!url || typeof url !== 'string') return null;
    
    // Match Cloudinary URL pattern: https://res.cloudinary.com/{cloudName}/image/upload/{path}
    const match = url.match(/res\.cloudinary\.com\/([^\/]+)\/image\/upload\/(.+)/);
    if (match) {
      const cloudName = match[1];
      const pathAfterUpload = match[2];
      
      // Check if it's secondary account
      const useSecondary = this.secondaryConfig?.cloudName === cloudName;
      
      // Split path and filter out transformations
      // Transformations are like: v1234567890, w_500, h_500, c_fill, etc.
      const parts = pathAfterUpload.split('/');
      const validParts: string[] = [];
      
      for (const part of parts) {
        const cleanPart = part.split('?')[0]; // Remove query params
        
        // Skip transformations:
        // - Version: v1234567890
        // - Dimensions/effects: w_500, h_500, c_fill, q_auto, f_auto, etc.
        // - Any part containing underscore (likely transformation)
        if (cleanPart.match(/^v\d+$/) || cleanPart.includes('_') || cleanPart.match(/^[a-z]\d/)) {
          continue;
        }
        
        validParts.push(cleanPart);
      }
      
      if (validParts.length === 0) {
        console.warn(`Could not extract valid public_id from URL: ${url}`);
        return null;
      }
      
      // Join parts to get full public_id (including folder path)
      let publicId = validParts.join('/');
      
      // Remove file extension
      publicId = publicId.replace(/\.[^.]+$/, '');
      
      console.log(`Extracted public_id: ${url} -> ${publicId} (secondary: ${useSecondary})`);
      
      return {
        publicId: publicId,
        useSecondary: useSecondary || false
      };
    }
    
    console.warn(`Could not extract public_id from URL: ${url}`);
    return null;
  }
}

// Export singleton instance
export const cloudinaryService = new CloudinaryService();

// Utility functions for image handling
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB (will be compressed to ~500KB-1MB)
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  
  // iOS PWA: Sometimes files don't have type but are valid images - check by extension
  let isValidType = allowedTypes.includes(file.type);
  if (!isValidType && file.name) {
    const ext = file.name.toLowerCase().split('.').pop();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
    if (ext && imageExts.includes(ext)) {
      isValidType = true; // Valid image file even without type
    }
  }

  if (!isValidType) {
    return {
      valid: false,
      error: 'Please upload a valid image file (JPEG, PNG, WebP, or HEIC)',
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'Image size must be less than 10MB (will be compressed automatically)',
    };
  }

  return { valid: true };
};

export const compressImage = (file: File, maxWidth: number = 1280, quality: number = 0.6, useWebP: boolean = true): Promise<File> => {
  return new Promise((resolve, reject) => {
    // iOS PWA: HEIC/HEIF files can't be loaded into Image element directly
    // Cloudinary can handle HEIC files natively, so upload as-is for HEIC
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || 
                   file.name.toLowerCase().endsWith('.heic') || 
                   file.name.toLowerCase().endsWith('.heif');
    
    if (isHeic) {
      // For HEIC files, upload directly to Cloudinary (it handles conversion)
      // Cloudinary will automatically convert HEIC to a web-compatible format
      resolve(file);
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    // iOS PWA: Use createObjectURL with revoke after loading
    const objectUrl = URL.createObjectURL(file);
    
    // iOS PWA: Set crossOrigin to handle CORS issues (but only for blob URLs, not needed)
    // img.crossOrigin = 'anonymous'; // Not needed for blob URLs

    img.onload = () => {
      try {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        // Ensure dimensions are even numbers (better compression)
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 2) * 2;

        canvas.width = width;
        canvas.height = height;

        // Use high-quality image rendering
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
        }

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Try WebP first for better compression, fallback to JPEG if not supported
        const tryCompress = (format: string, outputQuality: number, isFallback: boolean = false) => {
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl); // Clean up
              if (blob) {
                // Generate filename with appropriate extension
                const ext = format === 'image/webp' ? '.webp' : '.jpg';
                const fileName = file.name.replace(/\.[^/.]+$/, '') + ext;
                const compressedFile = new File([blob], fileName, {
                  type: format,
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else if (!isFallback && useWebP && format === 'image/webp') {
                // WebP failed, try JPEG as fallback
                tryCompress('image/jpeg', quality, true);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            format,
            outputQuality
          );
        };
        
        // Try WebP first if enabled (better compression)
        if (useWebP) {
          // WebP typically needs slightly higher quality for same visual result
          const webpQuality = Math.min(quality + 0.1, 0.9);
          tryCompress('image/webp', webpQuality);
        } else {
          // Use original format or JPEG
          const outputFormat = file.type || 'image/jpeg';
          tryCompress(outputFormat, quality);
        }
      } catch (error) {
        URL.revokeObjectURL(objectUrl); // Clean up on error
        // iOS PWA: If compression fails, upload as-is
        console.warn('Compression failed, uploading as-is:', error);
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl); // Clean up
      // iOS PWA: If image fails to load, it might be a valid file but browser can't display it
      // Try to upload as-is (Cloudinary might handle it)
      console.warn('Image failed to load, uploading as-is');
      resolve(file);
    };
    
    img.src = objectUrl;
  });
};
