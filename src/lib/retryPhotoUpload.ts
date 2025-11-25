// Retry Photo Upload Service
// Processes queued photos and uploads them when network is available

import { cloudinaryService, compressImage } from '@/lib/cloudinary';
import {
  getQueuedPhotos,
  removeQueuedPhoto,
  updateQueuedPhotoRetry,
  dataURLToFile,
  isOnline,
  QueuedPhoto,
} from './offlinePhotoQueue';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';

let isProcessing = false;
let retryInterval: NodeJS.Timeout | null = null;

/**
 * Process a single queued photo
 */
const processQueuedPhoto = async (photo: QueuedPhoto): Promise<boolean> => {
  try {
    // Convert data URL back to File
    const file = dataURLToFile(photo.fileData, photo.fileName);
    
    // Compress if needed (using stored settings)
    let fileToUpload = file;
    if (photo.maxWidth || photo.quality) {
      const compressionWidth = photo.maxWidth || 1280;
      const compressionQuality = photo.quality || 0.7;
      fileToUpload = await compressImage(file, compressionWidth, compressionQuality, true);
    }
    
    // Upload to Cloudinary
    const uploadResult = await cloudinaryService.uploadImage(
      fileToUpload,
      photo.folder,
      photo.useSecondaryAccount || false
    );
    
    console.log('✅ Successfully uploaded queued photo:', photo.id, uploadResult.secure_url);
    
    // If photo is linked to a job, update the job's requirements with the new photo URL
    if (photo.jobId && photo.photoType) {
      try {
        const { data: jobData } = await db.jobs.getById(photo.jobId);
        if (jobData) {
          const currentRequirements = (jobData as any).requirements || [];
          let requirements: any[] = [];
          
          // Parse requirements if it's a string
          if (typeof currentRequirements === 'string') {
            try {
              requirements = JSON.parse(currentRequirements);
              if (!Array.isArray(requirements)) {
                requirements = [];
              }
            } catch {
              requirements = [];
            }
          } else if (Array.isArray(currentRequirements)) {
            requirements = [...currentRequirements];
          }
          
          // Find or create the appropriate photo entry based on photoType
          if (photo.photoType === 'bill') {
            // Remove existing bill_photos entries
            requirements = requirements.filter((req: any) => !req.bill_photos);
            
            // Get existing bill photos from job
            const existingBillPhotos: string[] = [];
            const billPhotosReq = requirements.find((req: any) => req.bill_photos);
            if (billPhotosReq && Array.isArray(billPhotosReq.bill_photos)) {
              existingBillPhotos.push(...billPhotosReq.bill_photos);
            }
            
            // Add new photo URL if not already present
            if (!existingBillPhotos.includes(uploadResult.secure_url)) {
              existingBillPhotos.push(uploadResult.secure_url);
            }
            
            // Add bill_photos entry
            if (existingBillPhotos.length > 0) {
              requirements.push({ bill_photos: existingBillPhotos });
            }
          } else if (photo.photoType === 'payment') {
            // Handle payment photos similarly
            requirements = requirements.filter((req: any) => !req.payment_photos);
            const existingPaymentPhotos: string[] = [];
            const paymentPhotosReq = requirements.find((req: any) => req.payment_photos);
            if (paymentPhotosReq && Array.isArray(paymentPhotosReq.payment_photos)) {
              existingPaymentPhotos.push(...paymentPhotosReq.payment_photos);
            }
            if (!existingPaymentPhotos.includes(uploadResult.secure_url)) {
              existingPaymentPhotos.push(uploadResult.secure_url);
            }
            if (existingPaymentPhotos.length > 0) {
              requirements.push({ payment_photos: existingPaymentPhotos });
            }
          }
          
          // Update job with new requirements
          await db.jobs.update(photo.jobId, {
            requirements: JSON.stringify(requirements)
          });
          
          console.log(`✅ Added uploaded photo to job ${photo.jobId} requirements`);
        }
      } catch (error) {
        console.error('Error updating job with uploaded photo:', error);
        // Don't fail the upload if job update fails
      }
    }
    
    // Remove from queue on success
    removeQueuedPhoto(photo.id);
    
    return true;
  } catch (error: any) {
    console.error('❌ Failed to upload queued photo:', photo.id, error);
    
    // Check if it's still a network error
    const isNetworkError = !isOnline() || 
      error?.message?.includes('network') || 
      error?.message?.includes('fetch') ||
      error?.message?.includes('Failed to fetch');
    
    if (!isNetworkError) {
      // Non-network error - increment retry count
      updateQueuedPhotoRetry(photo.id);
    }
    
    return false;
  }
};

/**
 * Process all queued photos
 */
export const processQueuedPhotos = async (): Promise<{ success: number; failed: number }> => {
  if (!isOnline()) {
    console.log('📴 Offline - skipping photo queue processing');
    return { success: 0, failed: 0 };
  }

  if (isProcessing) {
    console.log('⏳ Already processing queued photos');
    return { success: 0, failed: 0 };
  }

  const queuedPhotos = getQueuedPhotos();
  
  if (queuedPhotos.length === 0) {
    return { success: 0, failed: 0 };
  }

  isProcessing = true;
  console.log(`🔄 Processing ${queuedPhotos.length} queued photo(s)...`);

  let successCount = 0;
  let failedCount = 0;

  // Process photos one by one to avoid overwhelming the network
  for (const photo of queuedPhotos) {
    const success = await processQueuedPhoto(photo);
    if (success) {
      successCount++;
    } else {
      failedCount++;
    }
    
    // Small delay between uploads to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  isProcessing = false;

  if (successCount > 0) {
    toast.success(`✅ ${successCount} saved photo(s) uploaded successfully!`, {
      duration: 4000,
    });
  }

  if (failedCount > 0 && isOnline()) {
    toast.warning(`⚠️ ${failedCount} photo(s) still waiting. Will retry automatically.`, {
      duration: 5000,
    });
  }

  return { success: successCount, failed: failedCount };
};

/**
 * Start automatic retry processing
 */
export const startRetryProcessing = (intervalMs: number = 30000): void => {
  if (retryInterval) {
    return; // Already started
  }

  // Process immediately
  processQueuedPhotos();

  // Then process periodically
  retryInterval = setInterval(() => {
    if (isOnline() && !isProcessing) {
      processQueuedPhotos();
    }
  }, intervalMs);

  console.log('🚀 Started automatic photo retry processing');
};

/**
 * Stop automatic retry processing
 */
export const stopRetryProcessing = (): void => {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
    console.log('🛑 Stopped automatic photo retry processing');
  }
};

/**
 * Process queued photos when network comes back online
 * Returns cleanup function
 */
export const setupOnlineListener = (): (() => void) => {
  const handleOnline = () => {
    console.log('🌐 Network online - processing queued photos');
    processQueuedPhotos();
  };

  window.addEventListener('online', handleOnline);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
  };
};

