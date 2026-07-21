// Offline Photo Queue Manager
// Handles storing photos in localStorage when network fails and retrying uploads

export interface QueuedPhoto {
  id: string;
  fileData: string; // Base64 data URL
  fileName: string;
  folder: string;
  maxWidth?: number;
  quality?: number;
  aggressiveCompression?: boolean;
  useSecondaryAccount?: boolean;
  /** If true, fileData is already compressed; retry should upload as-is without re-compressing */
  alreadyCompressed?: boolean;
  timestamp: number;
  retryCount: number;
  jobId?: string; // Optional: associate with a job
  photoType?: 'bill' | 'before' | 'after' | 'payment' | 'other';
  /** Cloudinary URL captured on a prior successful upload. If set, the retry
   *  worker can skip re-uploading bytes and only re-attempt the job-link step. */
  uploadedUrl?: string;
}

const QUEUE_STORAGE_KEY = 'offline_photo_queue';
const MAX_RETRY_COUNT = 5;
const MAX_QUEUE_SIZE = 50; // Maximum number of queued photos
/** Photos already on Cloudinary (uploadedUrl set) only need a cheap DB patch to
 *  link them to their job — never give up on those via retry count. They only
 *  expire after this long, so a permanently-broken link can't grow the queue forever. */
const UPLOADED_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Remove up to `count` entries to free space, preferring entries whose bytes are
 * NOT yet on Cloudinary last-resort only. Entries with `uploadedUrl` have their
 * base64 cleared already (tiny) and evicting them permanently orphans the photo
 * (uploaded but never linked to the job) — so they are evicted only when nothing
 * else is left.
 */
const evictForSpace = (queue: QueuedPhoto[], count: number): void => {
  const byOldest = (a: QueuedPhoto, b: QueuedPhoto) => a.timestamp - b.timestamp;
  const victims = [
    ...queue.filter((p) => !p.uploadedUrl).sort(byOldest),
    ...queue.filter((p) => p.uploadedUrl).sort(byOldest),
  ].slice(0, count);
  for (const victim of victims) {
    const idx = queue.indexOf(victim);
    if (idx !== -1) queue.splice(idx, 1);
  }
};

/**
 * Convert File to base64 data URL for localStorage storage
 */
export const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Convert base64 data URL back to File object
 */
export const dataURLToFile = (dataURL: string, fileName: string): File => {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], fileName, { type: mime });
};

/**
 * Check if network is available
 */
export const isOnline = (): boolean => {
  return navigator.onLine;
};

/**
 * Get all queued photos from localStorage
 */
export const getQueuedPhotos = (): QueuedPhoto[] => {
  try {
    const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!stored) return [];
    const photos = JSON.parse(stored) as QueuedPhoto[];
    // Drop photos that exceeded max upload retries — EXCEPT ones already on
    // Cloudinary (uploadedUrl): those only need a cheap job-link patch, so they
    // stay until the link succeeds or they age out.
    return photos.filter(p =>
      p.uploadedUrl
        ? Date.now() - p.timestamp <= UPLOADED_LINK_TTL_MS
        : p.retryCount < MAX_RETRY_COUNT
    );
  } catch (error) {
    console.error('Error reading queued photos:', error);
    return [];
  }
};

/**
 * Save a photo to the queue
 * Improved error handling and retry logic for mobile devices
 */
export const queuePhoto = async (
  file: File,
  folder: string,
  options: {
    maxWidth?: number;
    quality?: number;
    aggressiveCompression?: boolean;
    useSecondaryAccount?: boolean;
    jobId?: string;
    photoType?: 'bill' | 'before' | 'after' | 'payment' | 'other';
    /** Set true when queueing an already-compressed file (faster retry, no re-compress) */
    alreadyCompressed?: boolean;
  } = {}
): Promise<string> => {
  // Retry logic for localStorage issues (common on mobile devices)
  const maxRetries = 5; // Increased retries
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Convert file to base64 with timeout
      // Use longer timeout for large files on slow devices
      const fileData = await Promise.race([
        fileToDataURL(file),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('File conversion timeout')), 30000) // Increased timeout
        )
      ]) as string;
      
      const queuedPhoto: QueuedPhoto = {
        id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fileData,
        fileName: file.name,
        folder,
        maxWidth: options.maxWidth,
        quality: options.quality,
        aggressiveCompression: options.aggressiveCompression,
        useSecondaryAccount: options.useSecondaryAccount,
        alreadyCompressed: options.alreadyCompressed,
        timestamp: Date.now(),
        retryCount: 0,
        jobId: options.jobId,
        photoType: options.photoType || 'other',
      };

      const existingQueue = getQueuedPhotos();
      
      // Limit queue size - evict (uploaded-but-unlinked entries last)
      if (existingQueue.length >= MAX_QUEUE_SIZE) {
        evictForSpace(existingQueue, existingQueue.length - MAX_QUEUE_SIZE + 1);
      }

      existingQueue.push(queuedPhoto);
      
      // Try to save to localStorage with retry
      try {
        // Stringify with error handling
        let queueString: string;
        try {
          queueString = JSON.stringify(existingQueue);
        } catch (stringifyError) {
          throw new Error('Failed to serialize photo data. The file may be too large.');
        }
        
        // Check if string is too large for localStorage
        if (queueString.length > 5 * 1024 * 1024) { // 5MB limit check
          console.warn('Queue data too large, removing oldest entries...');
          // Remove oldest 20% of entries (uploaded-but-unlinked entries last)
          evictForSpace(existingQueue, Math.floor(existingQueue.length * 0.2));
          queueString = JSON.stringify(existingQueue);
        }
        
        localStorage.setItem(QUEUE_STORAGE_KEY, queueString);
        console.log('📸 Photo queued for offline upload:', queuedPhoto.id);
        return queuedPhoto.id;
      } catch (storageError: any) {
        // localStorage might be full - try to clear old entries
        if (storageError.name === 'QuotaExceededError' || storageError.code === 22) {
          console.warn('localStorage full, clearing old entries...');
          // Remove oldest 20% or at least 5 entries (uploaded-but-unlinked last)
          const removeCount = Math.max(5, Math.floor(existingQueue.length * 0.2));
          evictForSpace(existingQueue, removeCount);
          
          try {
            const queueString = JSON.stringify(existingQueue);
            localStorage.setItem(QUEUE_STORAGE_KEY, queueString);
            console.log('📸 Photo queued after clearing old entries:', queuedPhoto.id);
            return queuedPhoto.id;
          } catch (retryError: any) {
            lastError = retryError;
            // If still failing, try to save just this one photo (emergency fallback)
            if (attempt === maxRetries - 1) {
              try {
                const singlePhotoQueue = [queuedPhoto];
                localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(singlePhotoQueue));
                console.log('📸 Photo queued as single entry (emergency):', queuedPhoto.id);
                return queuedPhoto.id;
              } catch (finalError) {
                // Can't save at all
                throw new Error('Unable to save photo. Storage is full. Please free up space.');
              }
            }
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
              continue;
            }
        }
        lastError = storageError;
        // Wait before retry with exponential backoff
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
          continue;
        }
        throw storageError;
      }
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
        continue;
      }
      console.error('Error queueing photo after retries:', error);
      // Don't throw - return a temporary ID so upload can proceed
      // The photo might still upload successfully even if localStorage save fails
      console.warn('⚠️ Could not save to localStorage, but continuing with upload attempt');
      return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }
  
  // Final fallback - return temp ID so upload can still proceed
  console.warn('⚠️ Could not save to localStorage after all retries, but continuing with upload');
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Remove a photo from the queue
 */
export const removeQueuedPhoto = (photoId: string): void => {
  try {
    const queue = getQueuedPhotos();
    const filtered = queue.filter(p => p.id !== photoId);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing queued photo:', error);
  }
};

/**
 * Update retry count for a queued photo
 */
export const updateQueuedPhotoRetry = (photoId: string): void => {
  try {
    const queue = getQueuedPhotos();
    const photo = queue.find(p => p.id === photoId);
    if (photo) {
      photo.retryCount += 1;
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    }
  } catch (error) {
    console.error('Error updating queued photo retry:', error);
  }
};

/**
 * Persist the Cloudinary URL of a successfully uploaded queued photo so a
 * follow-up retry (e.g. after a job-update RLS denial) doesn't have to
 * re-upload the file bytes — it can just re-attempt the job link step.
 */
export const setQueuedPhotoUploadedUrl = (photoId: string, url: string): void => {
  try {
    const queue = getQueuedPhotos();
    const photo = queue.find(p => p.id === photoId);
    if (photo) {
      photo.uploadedUrl = url;
      // Bytes are safe on Cloudinary now — drop the base64 copy so this entry
      // stops consuming localStorage quota (and never gets space-evicted while
      // waiting for its job-link patch).
      photo.fileData = '';
      // Link retries shouldn't inherit failed-upload attempts.
      photo.retryCount = 0;
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    }
  } catch (error) {
    console.error('Error caching queued photo URL:', error);
  }
};

/**
 * Get queued photos count
 */
export const getQueuedPhotosCount = (): number => {
  return getQueuedPhotos().length;
};

/**
 * Clear all queued photos
 */
export const clearQueuedPhotos = (): void => {
  try {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing queued photos:', error);
  }
};

/**
 * Link queued photos to a job
 */
export const linkQueuedPhotosToJob = (jobId: string, folder: string, photoType: 'bill' | 'before' | 'after' | 'payment' | 'other'): void => {
  try {
    const queue = getQueuedPhotos();
    let updated = false;
    
    queue.forEach(photo => {
      // Link photos that match the folder and don't have a jobId yet
      if (photo.folder === folder && !photo.jobId) {
        photo.jobId = jobId;
        photo.photoType = photoType;
        updated = true;
      }
    });
    
    if (updated) {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      console.log(`✅ Linked queued photos in folder "${folder}" to job ${jobId}`);
    }
  } catch (error) {
    console.error('Error linking queued photos to job:', error);
  }
};

