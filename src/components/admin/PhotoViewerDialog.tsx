import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar, X } from 'lucide-react';

interface PhotoViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPhoto: { url: string; index: number; total: number } | null;
  selectedBillPhotos: string[] | null;
  selectedJobPhotos: { jobId: string; photos: string[]; type: 'before' | 'after' } | null;
  onPrevious: () => void;
  onNext: () => void;
  onDownload: (photoUrl: string, photoIndex: number) => void;
  onClose: () => void;
}

const PhotoViewerDialog: React.FC<PhotoViewerDialogProps> = ({
  open,
  onOpenChange,
  selectedPhoto,
  selectedBillPhotos,
  selectedJobPhotos,
  onPrevious,
  onNext,
  onDownload,
  onClose
}) => {
  const handleClose = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-[95vw] max-h-[95vh] p-0 bg-black border-none"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <style dangerouslySetInnerHTML={{__html: `
          [data-radix-dialog-content] button[data-radix-dialog-close] {
            display: none !important;
          }
        `}} />
        <DialogHeader className="sr-only">
          <DialogTitle>Photo Viewer</DialogTitle>
          <DialogDescription>Full-screen photo viewer</DialogDescription>
        </DialogHeader>
        <div className="relative w-full h-full flex items-center justify-center min-h-[500px]">
          {/* Close button */}
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-4 right-4 z-50 bg-black/70 text-white hover:bg-black/90 rounded-full w-10 h-10 p-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            <X className="w-5 h-5" />
          </Button>

          {/* Previous button */}
          {selectedPhoto && selectedPhoto.total > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute left-4 top-1/2 transform -translate-y-1/2 z-50 bg-black/70 text-white hover:bg-black/90 rounded-full w-10 h-10 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onPrevious();
              }}
            >
              <span className="text-2xl">‹</span>
            </Button>
          )}

          {/* Next button */}
          {selectedPhoto && selectedPhoto.total > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-4 top-1/2 transform -translate-y-1/2 z-50 bg-black/70 text-white hover:bg-black/90 rounded-full w-10 h-10 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
            >
              <span className="text-2xl">›</span>
            </Button>
          )}

          {/* Photo counter */}
          {selectedPhoto && selectedPhoto.total > 1 && (
            <div className="absolute top-4 left-4 z-10 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
              {selectedPhoto.index + 1} / {selectedPhoto.total}
            </div>
          )}

          {/* Action buttons */}
          {selectedPhoto && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onDownload(selectedPhoto.url, selectedPhoto.index)}
                className="bg-white/90 text-black hover:bg-white"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          )}

          {/* Main photo */}
          {selectedPhoto && (
            <img
              src={selectedPhoto.url}
              alt={`Photo ${selectedPhoto.index + 1}`}
              className="max-w-full max-h-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoViewerDialog;

