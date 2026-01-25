// Storage service abstraction layer
// This allows switching between different storage providers (Cloudinary, S3, etc.)
// without changing application code

export interface StorageUploadResult {
  url: string; // Full URL to access the image
  publicId?: string; // Provider-specific identifier (optional)
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  provider?: string; // Track which provider stored this (e.g., 'cloudinary', 's3', 'cloudflare-r2')
}

export interface StorageConfig {
  provider: 'cloudinary' | 's3' | 'cloudflare-r2' | 'supabase-storage' | 'custom';
  // Provider-specific config will be in their respective implementations
  [key: string]: any;
}

export interface IStorageService {
  /**
   * Upload an image file
   * @param file - The image file to upload
   * @param folder - Optional folder/path for organization
   * @returns Promise with upload result containing the full URL
   */
  uploadImage(file: File, folder?: string): Promise<StorageUploadResult>;

  /**
   * Upload multiple images
   */
  uploadMultipleImages(files: File[], folder?: string): Promise<StorageUploadResult[]>;

  /**
   * Delete an image (if supported by provider)
   * @param identifier - URL or public_id to delete
   * @returns true if successful, false otherwise
   */
  deleteImage(identifier: string): Promise<boolean>;

  /**
   * Get optimized/transformed image URL (if supported)
   * @param url - Original image URL
   * @param options - Transformation options
   */
  getOptimizedUrl?(url: string, options?: {
    width?: number;
    height?: number;
    quality?: number | 'auto';
    format?: 'auto' | 'webp' | 'jpg' | 'png';
  }): string;

  /**
   * Extract provider identifier from URL (for deletion)
   */
  extractIdentifier?(url: string): string | null;

  /**
   * Get the provider name
   */
  getProviderName(): string;
}

/**
 * Helper to detect which provider a URL belongs to
 */
export function detectStorageProvider(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  // Cloudinary
  if (url.includes('res.cloudinary.com') || url.includes('cloudinary.com')) {
    return 'cloudinary';
  }
  
  // AWS S3
  if (url.includes('.s3.') || url.includes('s3.amazonaws.com') || url.includes('amazonaws.com/s3')) {
    return 's3';
  }
  
  // Cloudflare R2
  if (url.includes('r2.cloudflarestorage.com') || url.includes('.r2.dev')) {
    return 'cloudflare-r2';
  }
  
  // Supabase Storage
  if (url.includes('supabase.co/storage') || url.includes('supabase.storage')) {
    return 'supabase-storage';
  }
  
  // Generic HTTP/HTTPS URL (could be any provider)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return 'custom';
  }
  
  return null;
}

/**
 * Check if a URL is still accessible
 */
export async function checkUrlAccessibility(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
    // With no-cors, we can't read status, but if it doesn't throw, it's likely accessible
    return true;
  } catch {
    return false;
  }
}
