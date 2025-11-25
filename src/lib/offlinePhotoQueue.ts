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
  try {
    // Convert file to base64
    const fileData = await fileToDataURL(file);
    
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
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(existingQueue));
    
    console.log('📸 Photo queued for offline upload:', queuedPhoto.id);
    return queuedPhoto.id;
  } catch (error) {
    console.error('Error queueing photo:', error);
    throw error;
  }
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

