import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Camera, X, Loader2, Image as ImageIcon, FileImage, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cloudinaryService, validateImageFile, compressImage } from '@/lib/cloudinary';
import { queuePhoto, isOnline, removeQueuedPhoto, getQueuedPhotosCount } from '@/lib/offlinePhotoQueue';

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
}) => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const remainingSlots = maxImages - uploadedImages.length;
    const filesToUpload = fileArray.slice(0, remainingSlots);

    if (filesToUpload.length === 0) {
      toast.error(`Maximum ${maxImages} images allowed`);
      return;
    }

    setIsUploading(true);
    setUploadProgress({});

    try {
      // Process and upload images one by one for better progress tracking
      const newImages: UploadedImage[] = [];
      
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const fileId = `file_${Date.now()}_${i}`;
        
        // Update progress
        setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));

        // Validate file
        const validation = validateImageFile(file);
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
          let queuedPhotoId: string | null = null;
          try {
            queuedPhotoId = await queuePhoto(file, folder, {
              maxWidth: compressionWidth,
              quality: compressionQuality,
              aggressiveCompression,
              useSecondaryAccount,
            });
            console.log('✅ Photo saved to local storage:', file.name);
          } catch (saveError) {
            console.error('Failed to save photo to localStorage:', saveError);
            toast.error('Failed to save image. Please try again.');
            continue; // Skip this file if we can't save it
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

            toast.success('Image uploaded', { duration: 2000 });

          } catch (uploadError: any) {
            // Upload failed - photo is already saved in localStorage, so it's safe
            // No toast needed - will retry automatically from local storage
            console.warn(`Upload failed for ${file.name}, but photo is saved locally:`, uploadError);
            // Photo remains in localStorage - will be retried automatically
          }

        } catch (error: any) {
          // Error processing - photo may be saved to localStorage, will retry automatically
          // No toast needed - will retry automatically from local storage
          console.error(`Error processing ${file.name}:`, error);
        }
      }

      // Update state with successfully uploaded images
      if (newImages.length > 0) {
        const updatedImages = [...uploadedImages, ...newImages];
        setUploadedImages(updatedImages);
        onImagesChange(updatedImages.map(img => img.url));
      }

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
    }
  };

  const handleRemoveImage = (imageId: string) => {
    const updatedImages = uploadedImages.filter(img => img.id !== imageId);
    setUploadedImages(updatedImages);
    onImagesChange(updatedImages.map(img => img.url));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    // Reset input value
    e.target.value = '';
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const openCameraDialog = async () => {
    // Check if getUserMedia is available (with fallback for older browsers)
    const getUserMedia = navigator.mediaDevices?.getUserMedia || 
                        (navigator as any).getUserMedia || 
                        (navigator as any).webkitGetUserMedia || 
                        (navigator as any).mozGetUserMedia;
    
    if (getUserMedia) {
      try {
        // Request camera access with multiple constraint options for better device compatibility
        let stream: MediaStream;
        try {
          // Try with ideal constraints first (back camera preferred)
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: { ideal: 'environment' }, // Back camera preferred
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            } 
          });
        } catch (error) {
          // Fallback to simpler constraints if ideal fails
          try {
            stream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: 'environment' }
            });
          } catch (fallbackError) {
            // Last resort: try any camera
            stream = await navigator.mediaDevices.getUserMedia({ 
              video: true 
            });
          }
        }
        
        // Create video element for preview
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; // Required for autoplay on some devices
        video.setAttribute('playsinline', 'true'); // iOS Safari compatibility
        video.style.width = '100%';
        video.style.maxWidth = '100%';
        video.style.height = 'auto';
        video.style.borderRadius = '8px';
        
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
        videoContainer.style.position = 'relative';
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
        
        const cleanup = () => {
          stream.getTracks().forEach(track => track.stop());
          document.body.removeChild(modal);
        };
        
        // Wait for video to be ready before allowing capture
        video.onloadedmetadata = () => {
          captureBtn.disabled = false;
        };
        
        captureBtn.disabled = true; // Disable until video is ready
        
        captureBtn.onclick = () => {
          try {
            // Check if video is ready
            if (!video.videoWidth || !video.videoHeight) {
              toast.error('Camera not ready. Please wait a moment and try again.');
              return;
            }
            
            // Create canvas to capture the photo
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
              toast.error('Failed to capture photo. Please try again.');
              cleanup();
              return;
            }
            
            try {
              ctx.drawImage(video, 0, 0);
            } catch (drawError) {
              console.error('Error drawing video to canvas:', drawError);
              toast.error('Failed to capture photo. Please try again.');
              cleanup();
              return;
            }
            
            canvas.toBlob((blob) => {
              if (!blob) {
                toast.error('Failed to process photo. Please try again.');
                cleanup();
                return;
              }
              
              try {
                const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
                // Create a DataTransfer object to simulate file input
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                handleFileSelect(dataTransfer.files);
                cleanup();
              } catch (fileError) {
                console.error('Error creating file:', fileError);
                toast.error('Failed to process photo. Please try again.');
                cleanup();
              }
            }, 'image/jpeg', 0.9);
          } catch (error: any) {
            console.error('Error capturing photo:', error);
            toast.error(`Failed to capture photo: ${error?.message || 'Unknown error'}`);
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
        
      } catch (error: any) {
        console.warn('getUserMedia failed, falling back to file input:', error);
        
        // Provide more specific error messages
        if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
          toast.error('Camera permission denied. Please allow camera access in your browser settings.');
        } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
          toast.error('No camera found on this device.');
        } else {
          toast.error('Camera access failed. Using file input instead...');
        }
        
        // Fallback to file input with capture attribute
        cameraInputRef.current?.click();
      }
    } else {
      // Fallback to file input with capture attribute
      cameraInputRef.current?.click();
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
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
      
      {/* Camera input with multiple capture attribute variations for better device compatibility */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
        className="hidden"
        // Additional attributes for better mobile compatibility
        multiple={false}
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
