import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { ZoomableImage } from '@/components/ZoomableImage';
import { cn } from '@/lib/utils';

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

/**
 * Full-viewport photo viewer. Uses inset-0 (no dialog translate centering) so
 * iOS Safari + react-zoom-pan-pinch don't shove the image aside and leave
 * controls floating in an empty black gutter.
 */
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
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (open && selectedPhoto?.url) {
      setLoadError(false);
    }
  }, [open, selectedPhoto?.url]);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        hideCloseButton
        className={cn(
          // Override default max-w-lg + 50%/translate centering — breaks iPhone zoom layout
          'fixed inset-0 left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none',
          'translate-x-0 translate-y-0 gap-0 rounded-none border-none bg-black p-0 shadow-none',
          'data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100',
          'data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0',
          'data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0',
        )}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Photo Viewer</DialogTitle>
          <DialogDescription>Full-screen photo viewer</DialogDescription>
        </DialogHeader>

        <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 h-10 w-10 rounded-full bg-black/70 p-0 text-white hover:bg-black/90"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
          >
            <X className="h-5 w-5" />
          </Button>

          {selectedPhoto && selectedPhoto.total > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute left-3 top-1/2 z-50 h-10 w-10 -translate-y-1/2 rounded-full bg-black/70 p-0 text-white hover:bg-black/90"
              onClick={(e) => {
                e.stopPropagation();
                onPrevious();
              }}
            >
              <span className="text-2xl leading-none">‹</span>
            </Button>
          )}

          {selectedPhoto && selectedPhoto.total > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-3 top-1/2 z-50 h-10 w-10 -translate-y-1/2 rounded-full bg-black/70 p-0 text-white hover:bg-black/90"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
            >
              <span className="text-2xl leading-none">›</span>
            </Button>
          )}

          {selectedPhoto && selectedPhoto.total > 1 && (
            <div className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
              {selectedPhoto.index + 1} / {selectedPhoto.total}
            </div>
          )}

          {selectedPhoto && !loadError && (
            <div className="pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2 text-xs text-white/70 sm:hidden">
              Pinch or double-tap to zoom
            </div>
          )}

          {selectedPhoto && (
            <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onDownload(selectedPhoto.url, selectedPhoto.index)}
                className="bg-card/90 text-black hover:bg-card"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          )}

          {/* Image stage — fixed to viewport so pan/zoom cannot expand the dialog */}
          <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
            {selectedPhoto && !loadError && (
              <ZoomableImage
                src={selectedPhoto.url}
                alt={`Photo ${selectedPhoto.index + 1}`}
                className="max-h-full max-w-full select-none object-contain"
                onError={() => setLoadError(true)}
              />
            )}
            {selectedPhoto && loadError && (
              <div className="max-w-lg px-6 text-center text-white">
                <p className="mb-2 text-lg font-medium">Could not load this image</p>
                <p className="break-all text-sm text-white/80">{selectedPhoto.url}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoViewerDialog;
