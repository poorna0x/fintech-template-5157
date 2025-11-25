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
          toast.error(`${file.name}: ${validation.error}`);
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
            toast.error(`Failed to save ${file.name}. Please try again.`);
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

            toast.success(`${file.name} uploaded successfully`, { duration: 2000 });

          } catch (uploadError: any) {
            // Upload failed - photo is already saved in localStorage, so it's safe
            console.warn(`Upload failed for ${file.name}, but photo is saved locally:`, uploadError);
            
            const isNetworkError = !isOnline() || 
              uploadError?.message?.includes('network') || 
              uploadError?.message?.includes('fetch') ||
              uploadError?.message?.includes('Failed to fetch') ||
              uploadError?.code === 'NETWORK_ERROR' ||
              (uploadError?.name === 'TypeError' && uploadError?.message?.includes('fetch'));

            if (isNetworkError) {
              toast.warning(
                `${file.name} saved safely. Will upload automatically when internet is available.`, 
                { duration: 6000 }
              );
            } else {
              toast.warning(
                `${file.name} saved safely. Upload failed but will retry automatically.`, 
                { duration: 6000 }
              );
            }
            // Photo remains in localStorage - will be retried automatically
          }

        } catch (error: any) {
          console.error(`Error processing ${file.name}:`, error);
          toast.error(`Error processing ${file.name}. Please try again.`);
        }
      }

      // Update state with successfully uploaded images
      if (newImages.length > 0) {
        const updatedImages = [...uploadedImages, ...newImages];
        setUploadedImages(updatedImages);
        onImagesChange(updatedImages.map(img => img.url));
      }

      // Check if there are any photos still in queue (upload failed but saved)
      const queuedCount = getQueuedPhotosCount();
      if (queuedCount > 0 && newImages.length < filesToUpload.length) {
        const failedCount = filesToUpload.length - newImages.length;
        toast.info(
          `${failedCount} photo(s) saved safely and will upload automatically. ${newImages.length > 0 ? `${newImages.length} uploaded now.` : ''}`,
          { duration: 6000 }
        );
      } else if (newImages.length > 0) {
        toast.success(`${newImages.length} photo(s) uploaded successfully!`, { duration: 3000 });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload images. Please try again.');
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

  const openCameraDialog = () => {
    cameraInputRef.current?.click();
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
      
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
        className="hidden"
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
                    <p className="text-xs truncate">{image.name}</p>
                  </div>
                </div>
                
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground truncate">
                    {image.name}
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
