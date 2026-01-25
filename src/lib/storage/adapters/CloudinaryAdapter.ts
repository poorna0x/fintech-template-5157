// Cloudinary storage adapter - wraps the existing CloudinaryService
import { IStorageService, StorageUploadResult } from '../types';
import { cloudinaryService, CloudinaryUploadResult } from '../../cloudinary';

export class CloudinaryStorageAdapter implements IStorageService {
  async uploadImage(file: File, folder: string = 'ro-service'): Promise<StorageUploadResult> {
    // Use the existing CloudinaryService
    const result: CloudinaryUploadResult = await cloudinaryService.uploadImage(file, folder, false);
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      provider: 'cloudinary'
    };
  }

  async uploadMultipleImages(files: File[], folder: string = 'ro-service'): Promise<StorageUploadResult[]> {
    const results = await cloudinaryService.uploadMultipleImages(files, folder, false);
    
    return results.map(result => ({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      provider: 'cloudinary'
    }));
  }

  async deleteImage(identifier: string): Promise<boolean> {
    // Extract public_id from URL if needed
    const publicId = this.extractIdentifier(identifier) || identifier;
    return cloudinaryService.deleteImage(publicId, false);
  }

  getOptimizedUrl(url: string, options?: {
    width?: number;
    height?: number;
    quality?: number | 'auto';
    format?: 'auto' | 'webp' | 'jpg' | 'png';
  }): string {
    const publicId = this.extractIdentifier(url);
    if (!publicId) return url;
    
    return cloudinaryService.getOptimizedImageUrl(publicId, {
      width: options?.width,
      height: options?.height,
      quality: options?.quality,
      format: options?.format,
      useSecondary: false
    });
  }

  extractIdentifier(url: string): string | null {
    const result = cloudinaryService.extractPublicId(url);
    return result?.publicId || null;
  }

  getProviderName(): string {
    return 'cloudinary';
  }
}
