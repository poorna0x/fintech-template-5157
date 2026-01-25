// Main storage service that routes to the appropriate provider
import { IStorageService, StorageUploadResult, detectStorageProvider } from './types';
import { CloudinaryStorageAdapter } from './adapters/CloudinaryAdapter';

class StorageService implements IStorageService {
  private adapter: IStorageService;
  private provider: string;

  constructor() {
    // Determine which provider to use based on environment variables
    const provider = import.meta.env.VITE_STORAGE_PROVIDER || 'cloudinary';
    
    this.provider = provider;
    
    // Initialize the appropriate adapter
    switch (provider) {
      case 'cloudinary':
        this.adapter = new CloudinaryStorageAdapter();
        break;
      // Future providers can be added here:
      // case 's3':
      //   this.adapter = new S3StorageAdapter();
      //   break;
      // case 'cloudflare-r2':
      //   this.adapter = new CloudflareR2Adapter();
      //   break;
      default:
        console.warn(`Unknown storage provider: ${provider}, falling back to Cloudinary`);
        this.adapter = new CloudinaryStorageAdapter();
    }
  }

  async uploadImage(file: File, folder: string = 'ro-service'): Promise<StorageUploadResult> {
    const result = await this.adapter.uploadImage(file, folder);
    // Add provider metadata to result
    return {
      ...result,
      provider: this.provider
    };
  }

  async uploadMultipleImages(files: File[], folder: string = 'ro-service'): Promise<StorageUploadResult[]> {
    const results = await this.adapter.uploadMultipleImages(files, folder);
    // Add provider metadata to each result
    return results.map(result => ({
      ...result,
      provider: this.provider
    }));
  }

  async deleteImage(identifier: string): Promise<boolean> {
    // Detect which provider the image belongs to
    const provider = detectStorageProvider(identifier);
    
    if (provider && provider !== this.provider) {
      console.warn(`Image belongs to ${provider} but current provider is ${this.provider}. Deletion may not work.`);
      // Try to delete anyway - the adapter might handle cross-provider deletion
    }
    
    return this.adapter.deleteImage(identifier);
  }

  getOptimizedUrl(url: string, options?: {
    width?: number;
    height?: number;
    quality?: number | 'auto';
    format?: 'auto' | 'webp' | 'jpg' | 'png';
  }): string {
    if (this.adapter.getOptimizedUrl) {
      return this.adapter.getOptimizedUrl(url, options);
    }
    // Fallback: return original URL if optimization not supported
    return url;
  }

  extractIdentifier(url: string): string | null {
    if (this.adapter.extractIdentifier) {
      return this.adapter.extractIdentifier(url);
    }
    return null;
  }

  getProviderName(): string {
    return this.provider;
  }

  /**
   * Get the adapter for a specific URL (useful for cross-provider operations)
   */
  getAdapterForUrl(url: string): IStorageService | null {
    const provider = detectStorageProvider(url);
    
    if (provider === 'cloudinary') {
      return new CloudinaryStorageAdapter();
    }
    
    // For other providers, return current adapter (they might handle it)
    return this.adapter;
  }
}

// Export singleton instance
export const storageService = new StorageService();
