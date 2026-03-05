import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Camera, X, Loader2, Image as ImageIcon, FileImage, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cloudinaryService, validateImageFile, compressImage } from '@/lib/cloudinary';
import { queuePhoto, isOnline, removeQueuedPhoto, getQueuedPhotosCount } from '@/lib/offlinePhotoQueue';
import { isIOS, isPWA, isChrome, shouldUseFileInputFallback, requestCameraAccess, createVideoElement, checkCameraPermission } from '@/lib/cameraUtils';

interface ImageUploadProps {
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  folder?: string;
  title?: string;
  description?: string;
  className?: string;
  // Compression options
  maxWidth?: number;
  quality?: number;
  aggressiveCompression?: boolean; // For documents/bills that don't need high quality
  // Use secondary Cloudinary account for optimized/temporary images
  useSecondaryAccount?: boolean;
  // Initial images to display (useful when navigating back to step)
  initialImages?: string[];
  // Callback to track upload state
  onUploadStateChange?: (isUploading: boolean) => void;
}

interface UploadedImage {
  id: string;
  url: string;
  publicId: string;
  name: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  onImagesChange,
  maxImages = 5,
  folder = 'ro-service',
  title = 'Upload Images',
  description = 'Upload images to help us understand your service needs',
  className = '',
  maxWidth = 1280,
  quality,
  aggressiveCompression = false,
  useSecondaryAccount = false,
  initialImages = [],
  onUploadStateChange,
}) => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>(() => {
    // Initialize with initialImages if provided
    if (initialImages && initialImages.length > 0) {
      return initialImages.map((url, index) => ({
        id: `img_${Date.now()}_${index}`,
        url,
        publicId: '', // Will be empty for initial images
        name: `Image ${index + 1}`,
      }));
    }
    return [];
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Sync with initialImages prop (useful when navigating back to step)
  // Use a ref to track previous initialImages to avoid unnecessary updates
  const prevInitialImagesRef = useRef<string[]>([]);
  
  useEffect(() => {
    const prevUrls = prevInitialImagesRef.current.sort().join(',');
    const currentUrls = (initialImages || []).sort().join(',');
    
    // Only sync if initialImages actually changed
    if (prevUrls !== currentUrls) {
      if (initialImages && initialImages.length > 0) {
        // Check if we need to sync with current state
        const existingUrls = uploadedImages.map(img => img.url).sort().join(',');
        
        if (existingUrls !== currentUrls) {
          // Rebuild uploadedImages from initialImages
          const syncedImages = initialImages.map((url, index) => ({
            id: `img_${Date.now()}_${index}_${url.slice(-10)}`, // Unique ID based on URL
            url,
            publicId: '',
            name: `Image ${index + 1}`,
          }));
          setUploadedImages(syncedImages);
        }
      } else {
        // Clear if initialImages is empty
        if (uploadedImages.length > 0) {
          setUploadedImages([]);
        }
      }
      
      prevInitialImagesRef.current = [...(initialImages || [])];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImages]);

  // Notify parent of upload state changes
  useEffect(() => {
    if (onUploadStateChange) {
      onUploadStateChange(isUploading);
    }
  }, [isUploading, onUploadStateChange]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // iOS PWA fix: Filter out directory entries and invalid files
    const fileArray = Array.from(files).filter(file => {
      // iOS sometimes includes directory entries - filter them out
      if (file.type === '' && file.size === 0 && file.name === '') {
        return false;
      }
      // Ensure it's actually a file
      if (!(file instanceof File)) {
        return false;
      }
      // iOS PWA: Sometimes files have no type but are valid images - check by extension
      if (!file.type && file.name) {
        const ext = file.name.toLowerCase().split('.').pop();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
        if (ext && imageExts.includes(ext)) {
          return true; // Valid image file even without type
        }
        return false;
      }
      return true;
    });

    if (fileArray.length === 0) {
      // iOS PWA: Sometimes file selection doesn't work properly
      toast.error('No valid files selected. Please try again.');
      return;
    }

    const remainingSlots = maxImages - uploadedImages.length;
    const filesToUpload = fileArray.slice(0, remainingSlots);

    if (filesToUpload.length === 0) {
      toast.error(`Maximum ${maxImages} images allowed`);
      return;
    }

      setIsUploading(true);
      setUploadProgress({});
      // Notify parent immediately
      if (onUploadStateChange) {
        onUploadStateChange(true);
      }

    try {
      // Process and upload images one by one for better progress tracking
      const newImages: UploadedImage[] = [];
      
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const fileId = `file_${Date.now()}_${i}`;
        
        // Update progress
        setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));

        // Validate file - iOS PWA: Handle files without type by checking extension
        let validation = validateImageFile(file);
        if (!validation.valid && !file.type && file.name) {
          // iOS PWA: Sometimes files don't have type but are valid images
          const ext = file.name.toLowerCase().split('.').pop();
          const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
          if (ext && imageExts.includes(ext)) {
            // Valid image file - override validation
            validation = { valid: true };
          }
        }
        
        if (!validation.valid) {
          toast.error(`Image: ${validation.error}`);
          continue;
        }

        try {
          // STEP 1: ALWAYS save to localStorage first (never lose the photo)
          let compressionWidth = maxWidth;
          let compressionQuality: number;
          const fileSizeMB = file.size / (1024 * 1024);
          
          // Determine compression settings
          if (aggressiveCompression) {
            if (quality && quality < 0.4) {
              compressionWidth = 800;
              compressionQuality = quality;
            } else {
              compressionWidth = 1024;
              if (fileSizeMB > 2) {
                compressionQuality = quality || 0.4;
              } else if (fileSizeMB > 1) {
                compressionQuality = quality || 0.5;
              } else {
                compressionQuality = quality || 0.6;
              }
            }
          } else {
            if (fileSizeMB > 2) {
              compressionQuality = quality || 0.5;
            } else if (fileSizeMB > 1) {
              compressionQuality = quality || 0.6;
            } else {
              compressionQuality = quality || 0.7;
            }
          }

          // Save to localStorage FIRST (before any upload attempt)
          // Retry logic is built into queuePhoto, but we'll handle it gracefully here too
          let queuedPhotoId: string | null = null;
          try {
            queuedPhotoId = await queuePhoto(file, folder, {
              maxWidth: compressionWidth,
              quality: compressionQuality,
              aggressiveCompression,
              useSecondaryAccount,
            });
            
            // Only log success if we got a real ID (not temp)
            if (queuedPhotoId && !queuedPhotoId.startsWith('temp_')) {
            console.log('✅ Photo saved to local storage:', file.name);
            } else {
              console.warn('⚠️ Photo not saved to localStorage (temp ID), but continuing with upload');
            }
          } catch (saveError: any) {
            console.error('Failed to save photo to localStorage after retries:', saveError);
            // Don't show error immediately - the photo might still work
            // Only show error if it's a critical issue
            if (saveError?.message?.includes('QuotaExceededError') || saveError?.code === 22 || saveError?.message?.includes('full')) {
              toast.error('Storage full. Please free up space and try again.');
            } else {
              // Continue anyway - the upload might still work
              console.warn('Photo not saved to queue, but continuing with upload attempt');
            }
            // Continue with upload - don't block
          }

          setUploadProgress(prev => ({ ...prev, [fileId]: 10 }));

          // STEP 2: Compress the image
          const compressedFile = await compressImage(file, compressionWidth, compressionQuality, true);
          setUploadProgress(prev => ({ ...prev, [fileId]: 30 }));

          // STEP 3: Try to upload to Cloudinary
          let uploadResult;
          try {
            uploadResult = await cloudinaryService.uploadImage(compressedFile, folder, useSecondaryAccount);
            setUploadProgress(prev => ({ ...prev, [fileId]: 100 }));

            // STEP 4: Upload successful - remove from localStorage
            if (queuedPhotoId) {
              removeQueuedPhoto(queuedPhotoId);
              console.log('✅ Photo uploaded and removed from local storage:', file.name);
            }

            // Log compression stats
            const originalSize = (file.size / 1024).toFixed(2);
            const compressedSize = (compressedFile.size / 1024).toFixed(2);
            const reduction = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
            console.log(`Image optimized: ${originalSize}KB → ${compressedSize}KB (${reduction}% reduction)`);

            // Add to new images
            newImages.push({
              id: `img_${Date.now()}_${i}`,
              url: uploadResult.secure_url,
              publicId: uploadResult.public_id,
              name: file.name,
            });

            // Notify parent after each successful upload so parent state is updated even if user navigates away before all uploads finish
            const currentList = [...uploadedImages, ...newImages];
            setUploadedImages(currentList);
            onImagesChange(currentList.map(img => img.url));

            toast.success('Photo uploaded', { duration: 3000 });

          } catch (uploadError: any) {
            // Upload failed - photo is already saved in localStorage, so it's safe
            console.warn(`Upload failed for ${file.name}, but photo is saved locally:`, uploadError);
            toast.error(`Upload failed for ${file.name}. You can try again or complete without it.`);
            // Photo remains in localStorage - will be retried automatically
          }

        } catch (error: any) {
          // Error processing - photo may be saved to localStorage, will retry automatically
          // No toast needed - will retry automatically from local storage
          console.error(`Error processing ${file.name}:`, error);
        }
      }

      // State and parent already updated after each successful upload above (so photos persist even if user navigates away)

      // Only show success message if photos were uploaded successfully
      // Failed photos are saved to localStorage and will retry automatically (no toast needed)
      // Individual success toasts are already shown for each photo above
    } catch (error) {
      // Error - photos may be saved to localStorage, will retry automatically
      // No toast needed - will retry automatically from local storage
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
      setUploadProgress({});
      // Notify parent that upload is complete
      if (onUploadStateChange) {
        onUploadStateChange(false);
      }
    }
  };

  const handleRemoveImage = (imageId: string) => {
    const updatedImages = uploadedImages.filter(img => img.id !== imageId);
    setUploadedImages(updatedImages);
    onImagesChange(updatedImages.map(img => img.url));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // iOS PWA: Sometimes files array is empty even when files were selected
    // Wait a bit and try again if needed
    const files = e.target.files;
    if (!files || files.length === 0) {
      // iOS PWA: Sometimes the file input doesn't work on first try
      setTimeout(() => {
        if (e.target.files && e.target.files.length > 0) {
          handleFileSelect(e.target.files);
        }
      }, 100);
      return;
    }
    
    handleFileSelect(files);
    // Reset input value - iOS PWA: Use setTimeout to ensure it works
    setTimeout(() => {
      e.target.value = '';
    }, 100);
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      // iOS PWA: Sometimes files are empty on first try
      setTimeout(() => {
        if (e.target.files && e.target.files.length > 0) {
    handleFileSelect(e.target.files);
        }
      }, 200);
    // Reset input value
      setTimeout(() => {
        e.target.value = '';
      }, 100);
      return;
    }
    
    handleFileSelect(files);
    // Reset input value - use setTimeout for iOS compatibility
    setTimeout(() => {
    e.target.value = '';
    }, 100);
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const openCameraDialog = async () => {
    // iOS, Android PWA, and Chrome on Android: Use file input with capture attribute
    // This opens the camera directly instead of file picker
    // File input with capture="environment" is more reliable than getUserMedia on mobile
    if (shouldUseFileInputFallback()) {
      console.log('Using file input with camera capture for mobile/PWA/Chrome');
      // Ensure input is reset and properly configured
      if (cameraInputRef.current) {
        cameraInputRef.current.value = ''; // Reset input
        // Click will trigger the camera directly due to capture="environment" attribute
        setTimeout(() => {
          cameraInputRef.current?.click();
        }, 100);
      }
      return;
    }

    // Check if getUserMedia is available (with fallback for older browsers)
    const getUserMedia = navigator.mediaDevices?.getUserMedia || 
                        (navigator as any).getUserMedia || 
                        (navigator as any).webkitGetUserMedia || 
                        (navigator as any).mozGetUserMedia;
    
    if (!getUserMedia) {
      // Fallback to file input with capture attribute
          setTimeout(() => {
            cameraInputRef.current?.click();
          }, 100);
          return;
        }

    try {
      // Don't check permission first - just try getUserMedia
      // Permission API is unreliable, especially on mobile

        // Request camera access with proper error handling
        const stream = await requestCameraAccess();
        if (!stream) {
          throw new Error('Failed to access camera');
        }
        
      // Create optimized video element for iOS/mobile
        const video = createVideoElement();
        video.srcObject = stream;
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        modal.style.zIndex = '9999';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.gap = '20px';
        modal.style.padding = '20px';
        
        // Video container
        const videoContainer = document.createElement('div');
        videoContainer.style.width = '100%';
        videoContainer.style.maxWidth = '500px';
      videoContainer.style.aspectRatio = '4/3';
        videoContainer.style.position = 'relative';
      videoContainer.style.backgroundColor = 'black';
      videoContainer.style.borderRadius = '8px';
      videoContainer.style.overflow = 'hidden';
        videoContainer.appendChild(video);
        
        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        
        // Capture button
        const captureBtn = document.createElement('button');
        captureBtn.textContent = 'Capture Photo';
        captureBtn.style.padding = '12px 24px';
        captureBtn.style.backgroundColor = '#3b82f6';
        captureBtn.style.color = 'white';
        captureBtn.style.border = 'none';
        captureBtn.style.borderRadius = '8px';
        captureBtn.style.cursor = 'pointer';
        captureBtn.style.fontSize = '16px';
        captureBtn.style.fontWeight = '600';
      captureBtn.style.transition = 'opacity 0.2s';
        
        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.padding = '12px 24px';
        cancelBtn.style.backgroundColor = '#6b7280';
        cancelBtn.style.color = 'white';
        cancelBtn.style.border = 'none';
        cancelBtn.style.borderRadius = '8px';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.fontSize = '16px';
        
      let streamActive = true;
        const cleanup = () => {
        if (!streamActive) return;
        streamActive = false;
        
        // Stop all tracks
        try {
          stream.getTracks().forEach(track => {
            track.stop();
          });
        } catch (e) {
          console.warn('Error stopping stream tracks:', e);
        }
        
        // Clear video srcObject
        try {
          if (video.srcObject) {
            video.srcObject = null;
          }
        } catch (e) {
          console.warn('Error clearing video srcObject:', e);
        }
        
        // Remove modal
        try {
          if (modal.parentNode) {
          document.body.removeChild(modal);
          }
        } catch (e) {
          console.warn('Error removing modal:', e);
        }
        };
        
        // Wait for video to be ready before allowing capture
        // iOS needs more time to initialize
        let videoReady = false;
      let readyCheckTimeout: NodeJS.Timeout | null = null;
      
        const enableCapture = () => {
        if (!streamActive) return;
        
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            videoReady = true;
            captureBtn.disabled = false;
          captureBtn.style.opacity = '1';
          if (readyCheckTimeout) {
            clearTimeout(readyCheckTimeout);
            readyCheckTimeout = null;
          }
          }
        };
        
      // Multiple event listeners for better compatibility
        video.onloadedmetadata = enableCapture;
        video.onloadeddata = enableCapture;
        video.oncanplay = enableCapture;
      video.onplaying = enableCapture;
        
      // Also check after delays (iOS sometimes needs this)
      readyCheckTimeout = setTimeout(() => {
        if (!videoReady && streamActive) {
            enableCapture();
          }
        }, 500);
      
      setTimeout(() => {
        if (!videoReady && streamActive && video.videoWidth > 0 && video.videoHeight > 0) {
          enableCapture();
        }
      }, 1000);
        
        captureBtn.disabled = true; // Disable until video is ready
      captureBtn.style.opacity = '0.5';
      
      captureBtn.onclick = () => {
        if (!streamActive) return;
        
          try {
            // Check if video is ready
            if (!video.videoWidth || !video.videoHeight || !videoReady) {
              toast.error('Camera not ready. Please wait a moment and try again.');
              return;
            }
            
            // Disable button during capture to prevent double-clicks
            captureBtn.disabled = true;
          captureBtn.style.opacity = '0.5';
            
            // Create canvas to capture the photo
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: false });
            
            if (!ctx) {
              toast.error('Failed to capture photo. Please try again.');
            captureBtn.disabled = false;
            captureBtn.style.opacity = '1';
              return;
            }
            
            try {
            // Draw video frame to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            } catch (drawError) {
              console.error('Error drawing video to canvas:', drawError);
              toast.error('Failed to capture photo. Please try again.');
            captureBtn.disabled = false;
            captureBtn.style.opacity = '1';
              return;
            }
            
          // Convert canvas to blob
            canvas.toBlob((blob) => {
            if (!streamActive) return;
            
              if (!blob) {
                toast.error('Failed to process photo. Please try again.');
                captureBtn.disabled = false;
              captureBtn.style.opacity = '1';
                return;
              }
              
              try {
                const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
                // Create a DataTransfer object to simulate file input
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
              
              // Clean up camera before processing file
              cleanup();
              
              // Process the file
                handleFileSelect(dataTransfer.files);
              } catch (fileError) {
                console.error('Error creating file:', fileError);
                toast.error('Failed to process photo. Please try again.');
                captureBtn.disabled = false;
              captureBtn.style.opacity = '1';
                cleanup();
              }
            }, 'image/jpeg', 0.9);
          } catch (error: any) {
            console.error('Error capturing photo:', error);
            toast.error(`Failed to capture photo: ${error?.message || 'Unknown error'}`);
            captureBtn.disabled = false;
          captureBtn.style.opacity = '1';
            cleanup();
          }
        };
        
        cancelBtn.onclick = cleanup;
        
        buttonContainer.appendChild(captureBtn);
        buttonContainer.appendChild(cancelBtn);
        
        modal.appendChild(videoContainer);
        modal.appendChild(buttonContainer);
        document.body.appendChild(modal);
        
        // Stop stream and remove modal when clicking outside
        modal.onclick = (e) => {
          if (e.target === modal) {
            cleanup();
          }
        };
        
      // Cleanup on page unload
      const unloadHandler = () => cleanup();
      window.addEventListener('beforeunload', unloadHandler);
      modal.addEventListener('remove', () => {
        window.removeEventListener('beforeunload', unloadHandler);
      });
      
      } catch (error: any) {
        console.warn('getUserMedia failed, falling back to file input:', error);
        
      // Silently fallback to file input with capture attribute
      // File input works reliably across all browsers and doesn't need explicit permissions
      // No need to show error message - the fallback will work seamlessly
      console.log('Camera access failed, silently using file input with capture fallback');
        
      // Always fallback to file input with capture attribute
      // This works even if camera permission is denied
      // File input is more reliable on Chrome Android and other mobile browsers
        setTimeout(() => {
          cameraInputRef.current?.click();
        }, 100);
    }
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  }, []);

  // Enhanced image optimization
  const getOptimizedImageUrl = (url: string, width: number = 400) => {
    // Use Cloudinary's transformation API for optimized images
    if (url.includes('cloudinary.com')) {
      const parts = url.split('/upload/');
      if (parts.length === 2) {
        return `${parts[0]}/upload/w_${width},h_${Math.round(width * 0.75)},c_fill,q_auto,f_auto/${parts[1]}`;
      }
    }
    return url;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h4 className="font-medium text-foreground mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {/* Drag and Drop Zone */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onTouchStart={(e) => {
          // Allow scrolling to work properly on mobile
          // Don't prevent default for touch events unless actually dragging
        }}
        style={{
          touchAction: 'manipulation', // Allow scrolling but prevent double-tap zoom
        }}
        className={`
          relative border-2 border-dashed rounded-lg p-4 sm:p-8 text-center transition-all duration-200
          ${isDragOver 
            ? 'border-primary bg-primary/5 scale-105' 
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
          }
          ${isUploading || uploadedImages.length >= maxImages ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        onClick={!isUploading && uploadedImages.length < maxImages ? openFileDialog : undefined}
      >
        <div className="space-y-2 sm:space-y-4">
          <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-muted rounded-full flex items-center justify-center">
            {isDragOver ? (
              <FileImage className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            ) : (
              <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground" />
            )}
          </div>
          
          <div>
            <h3 className="text-sm sm:text-lg font-medium text-foreground">
              {isDragOver ? 'Drop images here' : 'Drag & drop images here'}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              or click to browse files
            </p>
            <p className="text-xs text-muted-foreground mt-1 sm:mt-2 hidden sm:block">
              Supports JPEG, PNG, WebP • Max 5MB per image • Up to {maxImages} images
            </p>
          </div>

          {/* Upload Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                openFileDialog();
              }}
              disabled={isUploading || uploadedImages.length >= maxImages}
              className="flex items-center gap-2 text-sm sm:text-base py-2 sm:py-2"
            >
              {isUploading ? (
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {isUploading ? 'Uploading...' : 'Browse Files'}
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                openCameraDialog();
              }}
              disabled={isUploading || uploadedImages.length >= maxImages}
              className="flex items-center gap-2 text-sm sm:text-base py-2 sm:py-2"
            >
              <Camera className="w-4 h-4" />
              Take Photo
            </Button>
          </div>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,image/jpeg,image/jpg,image/png,image/gif,image/webp,image/heic,image/heif"
        multiple={maxImages > 1}
        onChange={handleFileInputChange}
        className="hidden"
        // iOS PWA: Prevent webkitdirectory which can cause issues
        // Don't set webkitdirectory attribute at all (undefined instead of false)
      />
      
      {/* Camera input with capture attribute - opens camera directly on mobile devices */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,image/jpeg,image/jpg,image/png,image/gif,image/webp,image/heic,image/heif"
        capture="environment"
        onChange={handleCameraCapture}
        className="hidden"
        // Additional attributes for better mobile compatibility
        multiple={false}
        // iOS PWA: Ensure webkitdirectory is not set
        // Don't set webkitdirectory attribute at all (undefined instead of false)
        // Additional capture attributes for better compatibility across browsers
        {...({ 'x-capture': 'environment' } as any)}
        {...({ 'webkit-capture': 'environment' } as any)}
      />

      {/* Uploaded Images Grid */}
      {uploadedImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {uploadedImages.map((image) => (
            <Card key={image.id} className="relative group overflow-hidden">
              <CardContent className="p-2">
                <div className="relative aspect-square">
                  <img
                    src={getOptimizedImageUrl(image.url, 300)}
                    alt={image.name}
                    className="w-full h-full object-cover rounded-md transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  
                  {/* Remove Button */}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    onClick={() => handleRemoveImage(image.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>

                  {/* Image Info Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-xs truncate">Image uploaded</p>
                  </div>
                </div>
                
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground truncate">
                    Image uploaded
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Optimized</span>
                    <span>✓</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Progress Indicators */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">Uploading...</h4>
          {Object.entries(uploadProgress).map(([fileId, progress]) => (
            <div key={fileId} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Processing image...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
          </div>
          Uploading images...
        </div>
      )}

      {/* Image Count */}
      <div className="text-xs text-muted-foreground">
        {uploadedImages.length} / {maxImages} images uploaded
      </div>
    </div>
  );
};

export default ImageUpload;
