import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface PhotoGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedJobPhotos: { jobId: string; photos: string[]; type: 'before' | 'after' } | null;
  onViewPhoto: (photoUrl: string, photoIndex: number, totalPhotos: number) => void;
  onDeletePhoto: (jobId: string, photoIndex: number, photoUrl: string) => void;
}

const PhotoGalleryDialog: React.FC<PhotoGalleryDialogProps> = ({
  open,
  onOpenChange,
  selectedJobPhotos,
  onViewPhoto,
  onDeletePhoto
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Job Photos</DialogTitle>
          <DialogDescription>
            Click on any photo to view it in full size or use the delete button to remove photos
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {selectedJobPhotos?.photos && Array.isArray(selectedJobPhotos.photos) && selectedJobPhotos.photos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {selectedJobPhotos.photos.map((photo, index) => {
                const isValidUrl = photo && typeof photo === 'string' && (photo.startsWith('http') || photo.startsWith('data:') || photo.startsWith('/'));
                
                return (
                  <div key={`photo-${index}-${photo?.slice(-10) || 'unknown'}`} className="relative group">
                    {isValidUrl ? (
                      <img
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-48 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (photo && photo.trim()) {
                            onViewPhoto(photo, index, selectedJobPhotos.photos.length);
                          } else {
                            toast.error('Invalid photo URL');
                          }
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                        <div className="text-center text-gray-500">
                          <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">Invalid photo URL</p>
                          <p className="text-xs text-gray-400">{photo || 'No URL provided'}</p>
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (photo && photo.trim()) {
                              onViewPhoto(photo, index, selectedJobPhotos.photos.length);
                            } else {
                              toast.error('Invalid photo URL');
                            }
                          }}
                        >
                          View Full Size
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePhoto(selectedJobPhotos.jobId, index, photo);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No photos available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoGalleryDialog;

