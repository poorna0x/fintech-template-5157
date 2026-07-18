// Camera utility functions for better cross-platform compatibility
import { isNativeApp } from '@/lib/isNativeApp';

/**
 * Check if device is iOS
 */
export const isIOS = (): boolean => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * Check if browser is Chrome / Chromium (including Android WebView).
 * Note: Android WebView UA contains both "Chrome" and "Safari" — do not treat
 * "Safari" as a disqualifier or Capacitor APKs will miss Chrome detection.
 */
export const isChrome = (): boolean => {
  const ua = navigator.userAgent;
  return /Chrome|CriOS|Chromium/.test(ua) && !/Edg|OPR|Opera/.test(ua);
};

/**
 * Check if browser is Firefox
 */
export const isFirefox = (): boolean => {
  return /Firefox/.test(navigator.userAgent);
};

/**
 * Check if running in PWA
 */
export const isPWA = (): boolean => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true ||
         document.referrer.includes('android-app://');
};

/**
 * Check camera permission status (if supported)
 * Note: Permission API may return 'prompt' even when permission is granted in some browsers
 * So we should not rely solely on this check - always try getUserMedia
 */
export const checkCameraPermission = async (): Promise<PermissionState | 'unknown'> => {
  try {
    if (!navigator.permissions || !navigator.permissions.query) {
      return 'unknown';
    }

    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return result.state;
  } catch (error) {
    // Permission API not supported or camera permission not queryable
    // This is common on iOS and some Android browsers
    return 'unknown';
  }
};

/**
 * Request camera access with proper error handling
 * Note: Always try getUserMedia even if permission check suggests denied
 * Permission API can be unreliable, especially on mobile devices
 */
export const requestCameraAccess = async (): Promise<MediaStream | null> => {
  const getUserMedia = navigator.mediaDevices?.getUserMedia ||
                      (navigator as any).getUserMedia ||
                      (navigator as any).webkitGetUserMedia ||
                      (navigator as any).mozGetUserMedia;

  if (!getUserMedia) {
    return null;
  }

  // Don't check permission first - permission API is unreliable
  // Just try getUserMedia and handle errors appropriately

  // Try with ideal constraints first (back camera preferred)
  try {
    // Use modern API if available
    if (navigator.mediaDevices?.getUserMedia) {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // Back camera preferred
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        }
      });
    }
    // Fallback for older browsers
    return await getUserMedia({ video: { facingMode: 'environment' } });
  } catch (error: any) {
    // Fallback to simpler constraints if ideal fails
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
      }
      return await getUserMedia({ video: { facingMode: 'environment' } });
    } catch (fallbackError: any) {
      // Last resort: try any camera with minimal constraints
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          return await navigator.mediaDevices.getUserMedia({ video: true });
        }
        return await getUserMedia({ video: true });
      } catch (finalError: any) {
        console.error('Error requesting camera access:', finalError);
        throw finalError;
      }
    }
  }
};

/**
 * Create optimized video element for iOS and mobile devices
 */
export const createVideoElement = (): HTMLVideoElement => {
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // Required for autoplay on some devices
  video.setAttribute('playsinline', 'true'); // iOS Safari compatibility
  video.setAttribute('webkit-playsinline', 'true'); // iOS Safari compatibility
  video.setAttribute('x5-playsinline', 'true'); // Android X5 browser compatibility
  video.style.width = '100%';
  video.style.maxWidth = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover'; // Ensure video fills container
  video.style.borderRadius = '8px';

  // Prevent default video controls and gestures on mobile
  video.controls = false;
  video.setAttribute('controlslist', 'nodownload noplaybackrate');

  return video;
};

/**
 * Should use file input fallback instead of getUserMedia preview modal.
 * Capacitor APKs / iOS / Android Chrome+PWA: system camera via <input capture> is reliable.
 * Custom Capture Photo dialog often fails in Android WebView (videoReady / DataTransfer).
 */
export const shouldUseFileInputFallback = (): boolean => {
  // Capacitor Android/iOS WebView — always use native camera intent
  if (isNativeApp()) {
    return true;
  }

  // On iOS, especially in PWA, file input with capture attribute is more reliable
  if (isIOS()) {
    return true;
  }

  // For Android PWAs, also prefer file input as it's more consistent
  if (isPWA() && /Android/.test(navigator.userAgent)) {
    return true;
  }

  // Chrome / Chromium on Android (including many WebViews)
  if (isChrome() && /Android/.test(navigator.userAgent)) {
    return true;
  }

  return false;
};

/** Build a FileList from File[] without relying on DataTransfer (broken in some WebViews). */
export function filesToFileList(files: File[]): FileList {
  try {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt.files;
  } catch {
    const list = {
      length: files.length,
      item: (i: number) => files[i] ?? null,
      *[Symbol.iterator]() {
        for (const f of files) yield f;
      },
    } as unknown as FileList;
    files.forEach((f, i) => {
      (list as any)[i] = f;
    });
    return list;
  }
}

/**
 * Capture current video frame as a JPEG File.
 * Returns null if dimensions are not available yet.
 */
export async function captureVideoFrameToFile(
  video: HTMLVideoElement,
  filename = `camera-photo-${Date.now()}.jpg`,
  quality = 0.9
): Promise<File | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
  if (!blob) return null;

  return new File([blob], filename, { type: 'image/jpeg' });
}
