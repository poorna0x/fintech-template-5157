// Camera utility functions for better cross-platform compatibility

/**
 * Check if device is iOS
 */
export const isIOS = (): boolean => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
 * Should use file input fallback instead of getUserMedia
 * iOS PWAs often work better with file input
 * Also use fallback for Android browsers that have getUserMedia issues
 */
export const shouldUseFileInputFallback = (): boolean => {
  // On iOS, especially in PWA, file input with capture attribute is more reliable
  // getUserMedia in iOS PWA often has issues with permissions and video playback
  if (isIOS()) {
    // Always use file input on iOS - it's more reliable
    return true;
  }
  
  // For Android PWAs, also prefer file input as it's more consistent
  if (isPWA() && /Android/.test(navigator.userAgent)) {
    return true;
  }
  
  return false;
};

