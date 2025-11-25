// Offline Job Completion Manager
// Handles storing complete job completion data in localStorage when network fails

import { isOnline } from './offlinePhotoQueue';

export interface OfflineJobCompletion {
  id: string; // Unique ID for this completion attempt
  jobId: string;
  timestamp: number;
  retryCount: number;
  
  // Job completion data
  billPhotos: string[];
  billAmount: string;
  completionNotes: string;
  paymentMode: 'CASH' | 'ONLINE' | '';
  paymentScreenshot: string;
  
  // QR Code data (if online payment)
  qrCodeType: string;
  selectedQrCodeId: string;
  selectedQrCodeUrl?: string;
  selectedQrCodeName?: string;
  
  // AMC data (if provided)
  hasAMC: boolean;
  amcDateGiven: string;
  amcEndDate: string;
  amcYears: number;
  amcIncludesPrefilter: boolean;
  
  // Customer prefilter
  customerHasPrefilter: boolean | null;
  
  // Current step (to restore progress)
  currentStep: number;
  
  // User info
  userId?: string;
  technicianId?: string;
}

const STORAGE_KEY = 'offline_job_completions';
const MAX_RETRY_COUNT = 5;
const MAX_QUEUE_SIZE = 20; // Maximum number of queued completions

/**
 * Get all queued job completions from localStorage
 */
export const getQueuedJobCompletions = (): OfflineJobCompletion[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const completions = JSON.parse(stored) as OfflineJobCompletion[];
    // Filter out completions that have exceeded max retry count
    return completions.filter(c => c.retryCount < MAX_RETRY_COUNT);
  } catch (error) {
    console.error('Error reading queued job completions:', error);
    return [];
  }
};

/**
 * Save a job completion to the queue
 */
export const queueJobCompletion = (completion: Omit<OfflineJobCompletion, 'id' | 'timestamp' | 'retryCount'>): string => {
  try {
    const queuedCompletion: OfflineJobCompletion = {
      ...completion,
      id: `completion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0,
    };

    const existingQueue = getQueuedJobCompletions();
    
    // Check if this job already has a queued completion
    const existingIndex = existingQueue.findIndex(c => c.jobId === completion.jobId);
    if (existingIndex >= 0) {
      // Update existing completion
      existingQueue[existingIndex] = queuedCompletion;
    } else {
      // Limit queue size - remove oldest if exceeded
      if (existingQueue.length >= MAX_QUEUE_SIZE) {
        existingQueue.sort((a, b) => a.timestamp - b.timestamp);
        existingQueue.shift(); // Remove oldest
      }
      existingQueue.push(queuedCompletion);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingQueue));
    
    console.log('💾 Job completion queued for offline submission:', queuedCompletion.id);
    return queuedCompletion.id;
  } catch (error) {
    console.error('Error queueing job completion:', error);
    throw error;
  }
};

/**
 * Remove a job completion from the queue
 */
export const removeQueuedJobCompletion = (completionId: string): void => {
  try {
    const queue = getQueuedJobCompletions();
    const filtered = queue.filter(c => c.id !== completionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing queued job completion:', error);
  }
};

/**
 * Update retry count for a queued completion
 */
export const updateQueuedCompletionRetry = (completionId: string): void => {
  try {
    const queue = getQueuedJobCompletions();
    const completion = queue.find(c => c.id === completionId);
    if (completion) {
      completion.retryCount += 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    }
  } catch (error) {
    console.error('Error updating queued completion retry:', error);
  }
};

/**
 * Get queued completions count
 */
export const getQueuedCompletionsCount = (): number => {
  return getQueuedJobCompletions().length;
};

/**
 * Get queued completion for a specific job
 */
export const getQueuedCompletionForJob = (jobId: string): OfflineJobCompletion | null => {
  const queue = getQueuedJobCompletions();
  return queue.find(c => c.jobId === jobId) || null;
};

/**
 * Clear all queued completions
 */
export const clearQueuedCompletions = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing queued completions:', error);
  }
};

/**
 * Save current job completion progress (for step-by-step saving)
 */
export const saveJobCompletionProgress = (
  jobId: string,
  progress: Partial<Omit<OfflineJobCompletion, 'id' | 'timestamp' | 'retryCount' | 'jobId'>>
): void => {
  try {
    const existing = getQueuedCompletionForJob(jobId);
    if (existing) {
      // Update existing
      const updated = { ...existing, ...progress };
      const queue = getQueuedJobCompletions();
      const index = queue.findIndex(c => c.id === existing.id);
      if (index >= 0) {
        queue[index] = updated;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
      }
    } else {
      // Create new with defaults
      const newCompletion: OfflineJobCompletion = {
        id: `completion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        jobId,
        timestamp: Date.now(),
        retryCount: 0,
        billPhotos: [],
        billAmount: '',
        completionNotes: '',
        paymentMode: '',
        paymentScreenshot: '',
        qrCodeType: '',
        selectedQrCodeId: '',
        hasAMC: false,
        amcDateGiven: '',
        amcEndDate: '',
        amcYears: 1,
        amcIncludesPrefilter: false,
        customerHasPrefilter: null,
        currentStep: 1,
        ...progress,
      };
      const queue = getQueuedJobCompletions();
      queue.push(newCompletion);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    }
  } catch (error) {
    console.error('Error saving job completion progress:', error);
  }
};

