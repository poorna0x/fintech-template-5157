import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Customer } from '@/types';
import { Camera, Upload, Download, MoreVertical, Image, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CustomerPhotoGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  customerPhotos: {[customerId: string]: string[]};
  uploadingThumbnails: {[key: string]: {url: string, uploading: boolean}};
  isUploadingPhoto: boolean;
  isLoadingPhotos: boolean;
  isDragOverPhotos: boolean;
  isCompressingImage: boolean;
  onPhotoUpload: (files: FileList) => void;
  onCameraCapture: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onPhotoClick: (photo: string, index: number, total: number) => void;
  onDeletePhoto: (photoUrl: string, photoIndex: number) => void;
}

const CustomerPhotoGalleryDialog: React.FC<CustomerPhotoGalleryDialogProps> = ({
  open,
  onOpenChange,
  customer,
  customerPhotos,
  uploadingThumbnails,
  isUploadingPhoto,
  isLoadingPhotos,
  isDragOverPhotos,
  isCompressingImage,
  onPhotoUpload,
  onCameraCapture,
  onDragOver,
  onDragLeave,
  onDrop,
  onPhotoClick,
  onDeletePhoto
}) => {
  if (!customer) return null;

  const customerId = customer.customer_id || customer.customerId || '';
  const photos = customerPhotos[customerId] || [];
  const uploadingCount = Object.keys(uploadingThumbnails).length;
  const hasPhotos = photos.length > 0 || uploadingCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Photo Gallery</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {customer.customer_id || customer.customerId} - {customer.fullName || customer.full_name}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files;
                      if (files) onPhotoUpload(files);
                    };
                    input.click();
                  }}>
                    <Upload className="w-4 h-4 mr-2" />
                    Add Photos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    toast.info('Download all photos feature coming soon');
                  }}>
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogTitle>
          <DialogDescription>
            View and manage photos for this customer
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Upload Area - Only show if no photos and no uploading thumbnails */}
          {!hasPhotos && (
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-all duration-200 ${
                isDragOverPhotos 
                  ? 'border-blue-500 bg-blue-100 scale-105' 
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
              } ${isUploadingPhoto ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = 'image/*';
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (files) onPhotoUpload(files);
                };
                input.click();
              }}
            >
              <div className="space-y-6">
                <div className="relative">
                  <Camera className={`w-16 h-16 mx-auto ${isDragOverPhotos ? 'text-blue-500' : 'text-gray-400'}`} />
                  {isCompressingImage && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="text-xl font-medium text-gray-600">
                    {isUploadingPhoto ? 'Uploading photos...' : isDragOverPhotos ? 'Drop photos here' : 'No photos found'}
                  </div>
                  <div className="text-sm text-gray-500">
                    Drag & drop photos here, click to browse, or use camera capture
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.accept = 'image/*';
                        input.onchange = (e) => {
                          const files = (e.target as HTMLInputElement).files;
                          if (files) onPhotoUpload(files);
                        };
                        input.click();
                      }}
                      disabled={isUploadingPhoto}
                      className="flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Browse Files
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCameraCapture();
                      }}
                      disabled={isUploadingPhoto}
                      className="flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      Capture Photo
                    </Button>
                  </div>
                  <div className="text-xs text-gray-400 pt-2">
                    Supports JPG, PNG, GIF up to 10MB • All photos stored in Cloudinary
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoadingPhotos && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <p className="text-sm text-gray-600">Loading photos...</p>
              </div>
            </div>
          )}

          {/* Photo Grid */}
          {!isLoadingPhotos && hasPhotos && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-lg font-medium">
                  {(() => {
                    const total = photos.length + uploadingCount;
                    return `${total} Photo${total !== 1 ? 's' : ''}${uploadingCount > 0 ? ` (${uploadingCount} uploading...)` : ''}`;
                  })()}
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.multiple = true;
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) onPhotoUpload(files);
                      };
                      input.click();
                    }}
                    disabled={isUploadingPhoto}
                    className="flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Add Files
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCameraCapture}
                    disabled={isUploadingPhoto}
                    className="flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    Capture
                  </Button>
                </div>
              </div>
              
              <div 
                className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4 rounded-lg border-2 border-dashed transition-all ${
                  isDragOverPhotos 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-transparent'
                }`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                {/* Show uploading thumbnails first */}
                {Object.entries(uploadingThumbnails).map(([thumbnailId, thumbnail]) => (
                  <div key={thumbnailId} className="relative group">
                    <div className="w-full h-40 bg-gray-100 rounded-lg border-2 border-dashed border-blue-400 overflow-hidden relative">
                      <img
                        src={thumbnail.url}
                        alt="Uploading..."
                        className="w-full h-full object-cover opacity-60"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <span className="text-xs text-white font-medium">Uploading...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Show uploaded photos */}
                {photos.map((photo, index) => (
                  <div key={`${customer.id}-${index}`} className="relative group">
                    <div className="w-full h-40 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden cursor-pointer">
                      <img
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onLoad={(e) => {
                          e.currentTarget.style.display = 'block';
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                        onClick={() => onPhotoClick(photo, index, photos.length)}
                      />
                      <div 
                        className="w-full h-full flex items-center justify-center text-gray-400"
                        style={{ display: 'none' }}
                      >
                        <div className="text-center">
                          <Image className="w-8 h-8 mx-auto mb-2" />
                          <div className="text-xs">Failed to load</div>
                        </div>
                      </div>
                      {/* Delete button - shown on hover */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePhoto(photo, index);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerPhotoGalleryDialog;

