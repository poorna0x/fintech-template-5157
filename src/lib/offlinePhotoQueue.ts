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
  timestamp: number;
  retryCount: number;
  jobId?: string; // Optional: associate with a job
  photoType?: 'bill' | 'before' | 'after' | 'payment' | 'other';
}

const QUEUE_STORAGE_KEY = 'offline_photo_queue';
const MAX_RETRY_COUNT = 5;
const MAX_QUEUE_SIZE = 50; // Maximum number of queued photos

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
    // Filter out photos that have exceeded max retry count
    return photos.filter(p => p.retryCount < MAX_RETRY_COUNT);
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
        timestamp: Date.now(),
        retryCount: 0,
        jobId: options.jobId,
        photoType: options.photoType || 'other',
      };

      const existingQueue = getQueuedPhotos();
      
      // Limit queue size - remove oldest if exceeded
      if (existingQueue.length >= MAX_QUEUE_SIZE) {
        existingQueue.sort((a, b) => a.timestamp - b.timestamp);
        existingQueue.shift(); // Remove oldest
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
          // Remove oldest 20% of entries
          existingQueue.sort((a, b) => a.timestamp - b.timestamp);
          const removeCount = Math.floor(existingQueue.length * 0.2);
          existingQueue.splice(0, removeCount);
          queueString = JSON.stringify(existingQueue);
        }
        
        localStorage.setItem(QUEUE_STORAGE_KEY, queueString);
        console.log('📸 Photo queued for offline upload:', queuedPhoto.id);
        return queuedPhoto.id;
      } catch (storageError: any) {
        // localStorage might be full - try to clear old entries
        if (storageError.name === 'QuotaExceededError' || storageError.code === 22) {
          console.warn('localStorage full, clearing old entries...');
          // Remove oldest entries (more aggressively)
          existingQueue.sort((a, b) => a.timestamp - b.timestamp);
          // Remove oldest 20% or at least 5 entries
          const removeCount = Math.max(5, Math.floor(existingQueue.length * 0.2));
          existingQueue.splice(0, removeCount);
          
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

