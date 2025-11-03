// Cloudinary service for image uploads
// This handles image uploads for the booking form

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
}

class CloudinaryService {
  private config: CloudinaryConfig;

  constructor() {
    this.config = {
      cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
      uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
      apiKey: import.meta.env.VITE_CLOUDINARY_API_KEY || '',
    };
  }

  async uploadImage(file: File, folder: string = 'ro-service'): Promise<CloudinaryUploadResult> {
    if (!this.config.cloudName || !this.config.uploadPreset) {
      throw new Error('Cloudinary configuration is missing. Please check your environment variables.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.config.uploadPreset);
    formData.append('folder', folder);
    
    // Note: For unsigned uploads, only these parameters are allowed:
    // upload_preset, callback, public_id, folder, asset_folder, tags, context, 
    // metadata, face_coordinates, custom_coordinates, source, filename_override, 
    // manifest_transformation, manifest_json, template, template_vars, regions, public_id_prefix

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData,
          mode: 'cors',
          credentials: 'omit',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        
        // Check for specific error messages
        if (errorText.includes('Upload preset must be specified')) {
          throw new Error('Upload preset not found. Please check your Cloudinary configuration.');
        }
        
        if (errorText.includes('Invalid upload preset')) {
          throw new Error('Upload preset is invalid. Please ensure it is set to "Unsigned" mode in your Cloudinary dashboard.');
        }
        
        if (errorText.includes('unsigned upload')) {
          throw new Error('Upload preset must be configured as "Unsigned" mode. Please check your Cloudinary dashboard settings.');
        }
        
        throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
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
      // Handle specific error types
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        throw new Error('Network error: Unable to connect to Cloudinary. Please check your internet connection and try again.');
      }
      
      if (error instanceof Error && error.message.includes('CORS')) {
        throw new Error('CORS error: Please check your Cloudinary configuration and upload preset settings.');
      }
      
      throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async uploadMultipleImages(files: File[], folder: string = 'ro-service'): Promise<CloudinaryUploadResult[]> {
    const uploadPromises = files.map(file => this.uploadImage(file, folder));
    return Promise.all(uploadPromises);
  }

  getImageUrl(publicId: string, transformations?: string): string {
    if (!this.config.cloudName) {
      throw new Error('Cloudinary cloud name is not configured');
    }

    const baseUrl = `https://res.cloudinary.com/${this.config.cloudName}/image/upload`;
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
  } = {}): string {
    const { width, height, quality = 'auto', format = 'auto' } = options;
    
    const transformations = [];
    if (width) transformations.push(`w_${width}`);
    if (height) transformations.push(`h_${height}`);
    if (quality) transformations.push(`q_${quality}`);
    if (format) transformations.push(`f_${format}`);
    
    return this.getImageUrl(publicId, transformations.join(','));
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
        await this.deleteImage(result.public_id);
      }
      
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Delete image from Cloudinary
  async deleteImage(publicId: string): Promise<boolean> {
    if (!this.config.apiKey) {
      console.warn('Cloudinary API key not configured. Cannot delete image.');
      return false;
    }

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/destroy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            public_id: publicId,
            api_key: this.config.apiKey,
            timestamp: Math.round(new Date().getTime() / 1000),
          }),
        }
      );

      return response.ok;
    } catch (error) {
      console.error('Error deleting image:', error);
      return false;
    }
  }
}

// Export singleton instance
export const cloudinaryService = new CloudinaryService();

// Utility functions for image handling
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB (will be compressed to ~500KB-1MB)
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Please upload a valid image file (JPEG, PNG, or WebP)',
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

export const compressImage = (file: File, maxWidth: number = 1280, quality: number = 0.6): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        file.type,
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};
