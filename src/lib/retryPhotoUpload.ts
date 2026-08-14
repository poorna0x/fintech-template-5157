// Retry Photo Upload Service
// Processes queued photos and uploads them when network is available

import { cloudinaryService, compressImage } from '@/lib/cloudinary';
import {
  getQueuedPhotos,
  removeQueuedPhoto,
  updateQueuedPhotoRetry,
  setQueuedPhotoUploadedUrl,
  dataURLToFile,
  isOnline,
  QueuedPhoto,
} from './offlinePhotoQueue';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { billPhotosRequirement, extractBillPhotoSources, isPhotoCaptureSource } from '@/lib/billPhotoCapture';

let isProcessing = false;
let retryInterval: NodeJS.Timeout | null = null;

const normalizePhotoUrlForCompare = (url: string): string =>
  url.split('?')[0].split('#')[0].trim().toLowerCase();

/** True when `list` (strings or Cloudinary-ish objects) already contains `url`. */
const photoListContainsUrl = (list: unknown, url: string): boolean => {
  if (!Array.isArray(list)) return false;
  const target = normalizePhotoUrlForCompare(url);
  return list.some((entry) => {
    const entryUrl =
      typeof entry === 'string'
        ? entry
        : (entry as any)?.url || (entry as any)?.secure_url;
    return typeof entryUrl === 'string' && normalizePhotoUrlForCompare(entryUrl) === target;
  });
};

/** Existing column value + new URL appended (preserves existing entries as-is). */
const appendPhotoUrl = (existing: unknown, url: string): unknown[] => {
  const list = Array.isArray(existing) ? [...existing] : [];
  list.push(url);
  return list;
};

/**
 * Process a single queued photo
 */
const processQueuedPhoto = async (photo: QueuedPhoto): Promise<boolean> => {
  try {
    let secureUrl: string;

    if (photo.uploadedUrl) {
      // Bytes already on Cloudinary from a prior tick — skip the re-upload and
      // jump straight to (re-)patching the job. Saves bandwidth and avoids
      // creating duplicate Cloudinary copies on repeated link failures.
      secureUrl = photo.uploadedUrl;
      console.log(
        '↩️ Reusing cached Cloudinary URL for queued photo:',
        photo.id,
        secureUrl
      );
    } else {
      // Convert data URL back to File
      const file = dataURLToFile(photo.fileData, photo.fileName);

      // Use as-is if already compressed (queued after compress in ImageUpload); otherwise compress
      let fileToUpload = file;
      if (!photo.alreadyCompressed && (photo.maxWidth || photo.quality)) {
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

      secureUrl = uploadResult.secure_url;
      console.log('✅ Successfully uploaded queued photo:', photo.id, secureUrl);

      // Cache the URL so any follow-up tick (e.g. after a job-update failure)
      // can re-attempt the link without re-uploading the file bytes.
      try {
        setQueuedPhotoUploadedUrl(photo.id, secureUrl);
      } catch {
        /* non-fatal */
      }
    }

    const uploadResult = { secure_url: secureUrl };

    // Track whether the linking step succeeded. If the photo is bound to a
    // job but we fail to patch the job's requirements, we KEEP the photo in
    // the queue so the next retry tick can try again. Removing it here would
    // turn a transient DB blip into a permanent orphan.
    let linkSucceeded = true;
    let linkRequired = false;

    // If photo is linked to a job, update the job's requirements with the new photo URL
    if (photo.jobId && photo.photoType) {
      linkRequired = true;
      try {
        const { data: jobData } = await db.jobs.getByIdFull(photo.jobId);
        if (jobData) {
          // Payload for db.jobs.update — filled per photoType below. Empty when
          // the photo turns out to be already linked (nothing to patch).
          const updatePayload: Record<string, unknown> = {};

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
            // Get existing bill photos BEFORE filtering them out
            const existingBillPhotos: string[] = [];
            const billPhotosReq = requirements.find((req: any) => req.bill_photos);
            if (billPhotosReq && Array.isArray(billPhotosReq.bill_photos)) {
              existingBillPhotos.push(...billPhotosReq.bill_photos);
            }
            
            // Add new photo URL if not already present
            if (!existingBillPhotos.includes(uploadResult.secure_url)) {
              existingBillPhotos.push(uploadResult.secure_url);
              console.log(`✅ Adding new bill photo to job ${photo.jobId}: ${uploadResult.secure_url}`);
            } else {
              console.log(`⚠️ Bill photo already exists in job ${photo.jobId}: ${uploadResult.secure_url}`);
            }
            
            const existingSources = extractBillPhotoSources(requirements);
            // Remove existing bill_photos entries
            requirements = requirements.filter((req: any) => !req.bill_photos);
            
            // Add updated bill_photos entry
            if (existingBillPhotos.length > 0) {
              const sources = { ...existingSources };
              if (isPhotoCaptureSource(photo.captureSource)) {
                sources[uploadResult.secure_url] = photo.captureSource;
              }
              requirements.push(billPhotosRequirement(existingBillPhotos, sources));
              console.log(`✅ Updated job ${photo.jobId} with ${existingBillPhotos.length} bill photo(s)`);
            }
          } else if (photo.photoType === 'payment') {
            // Get existing payment photos BEFORE filtering them out
            const existingPaymentPhotos: string[] = [];
            const paymentPhotosReq = requirements.find((req: any) => req.payment_photos);
            if (paymentPhotosReq && Array.isArray(paymentPhotosReq.payment_photos)) {
              existingPaymentPhotos.push(...paymentPhotosReq.payment_photos);
            }
            
            // Add new photo URL if not already present
            if (!existingPaymentPhotos.includes(uploadResult.secure_url)) {
              existingPaymentPhotos.push(uploadResult.secure_url);
              console.log(`✅ Adding new payment photo to job ${photo.jobId}: ${uploadResult.secure_url}`);
            } else {
              console.log(`⚠️ Payment photo already exists in job ${photo.jobId}: ${uploadResult.secure_url}`);
            }
            
            // Remove existing payment_photos entries
            requirements = requirements.filter((req: any) => !req.payment_photos);
            
            // Add updated payment_photos entry
            if (existingPaymentPhotos.length > 0) {
              requirements.push({ payment_photos: existingPaymentPhotos });
              console.log(`✅ Updated job ${photo.jobId} with ${existingPaymentPhotos.length} payment photo(s)`);
            }
          } else {
            // 'after' / 'before' / 'other' — these live in the job's photo
            // columns, not requirements. Previously this fell through and the
            // queue entry was deleted without ever writing to the DB (photo on
            // Cloudinary but invisible to admin/technician).
            const url = uploadResult.secure_url;
            if (photo.photoType === 'before') {
              if (!photoListContainsUrl((jobData as any).before_photos, url)) {
                updatePayload.before_photos = appendPhotoUrl((jobData as any).before_photos, url);
              }
            } else {
              // 'after' and 'other': completion-flow extras go to after_photos
              // (admin reports / completed cards) and images (customer gallery),
              // matching what handleCompleteJobSubmit writes.
              if (!photoListContainsUrl((jobData as any).after_photos, url) && photo.photoType === 'after') {
                updatePayload.after_photos = appendPhotoUrl((jobData as any).after_photos, url);
              }
              if (!photoListContainsUrl((jobData as any).images, url)) {
                updatePayload.images = appendPhotoUrl((jobData as any).images, url);
              }
            }
            if (Object.keys(updatePayload).length > 0) {
              console.log(
                `✅ Linking ${photo.photoType} photo to job ${photo.jobId} columns:`,
                Object.keys(updatePayload)
              );
            } else {
              console.log(`ℹ️ ${photo.photoType} photo already linked to job ${photo.jobId}`);
            }
          }

          if (photo.photoType === 'bill' || photo.photoType === 'payment') {
            updatePayload.requirements = JSON.stringify(requirements);
          }

          if (Object.keys(updatePayload).length > 0) {
            const { error: updateError } = await db.jobs.update(photo.jobId, updatePayload);

            if (updateError) {
              // RLS denial / network blip / 5xx — keep the photo in the queue so
              // the next retry tick (or app foreground) can re-attempt the patch.
              console.warn(
                `[retryPhotoUpload] Job update failed for ${photo.jobId}; keeping queue entry for retry`,
                updateError
              );
              linkSucceeded = false;
            } else {
              console.log(`✅ Added uploaded photo to job ${photo.jobId}`);
            }
          }
        } else {
          // Job vanished (deleted / merged / no read access). The photo is now
          // unrecoverable for this job — let it drop so the queue doesn't grow.
          console.warn(
            `[retryPhotoUpload] Job ${photo.jobId} not found while linking photo; dropping queue entry`
          );
          linkSucceeded = true;
        }
      } catch (error) {
        console.error('Error updating job with uploaded photo:', error);
        linkSucceeded = false;
      }
    }

    // Only remove on full success. If the patch failed but the upload itself
    // succeeded, leave the queue entry so the next retry tick can re-link it
    // without re-uploading bytes (we'll just patch again with the same URL).
    if (linkSucceeded) {
      removeQueuedPhoto(photo.id);
    } else if (linkRequired) {
      updateQueuedPhotoRetry(photo.id);
    }

    return linkSucceeded;
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

  // Only show success message for uploaded photos
  if (successCount > 0) {
    toast.success(`✅ ${successCount} photo(s) uploaded successfully!`, {
      duration: 3000,
    });
  }

  // Failed photos will retry automatically - no warning toast needed
  if (failedCount > 0) {
    console.log(`📸 ${failedCount} photo(s) still waiting. Will retry automatically.`);
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
 * Process queued photos when network comes back online OR when the technician
 * brings the PWA back to foreground. Mobile data on a tech's phone is most
 * likely to be healthy right after they unlock the device or switch back to
 * the app, so visibilitychange + focus give us a far faster reconciliation
 * window than waiting for the 30s interval tick.
 *
 * Returns a cleanup function for use in React effects.
 */
export const setupOnlineListener = (): (() => void) => {
  const handleOnline = () => {
    console.log('🌐 Network online - processing queued photos');
    processQueuedPhotos();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && isOnline()) {
      console.log('👀 App foregrounded - processing queued photos');
      processQueuedPhotos();
    }
  };

  const handleFocus = () => {
    if (isOnline()) {
      console.log('🎯 App focused - processing queued photos');
      processQueuedPhotos();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', handleFocus);

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('focus', handleFocus);
  };
};

