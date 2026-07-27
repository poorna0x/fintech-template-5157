import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
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
  /** Hide download (e.g. technician viewer). Default true. */
  showDownload?: boolean;
}

/** Kill Radix/Tailwind translate centering — required for iOS Safari. */
const FULLSCREEN_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  maxWidth: '100%',
  height: '100dvh',
  maxHeight: '100dvh',
  margin: 0,
  transform: 'none',
  borderRadius: 0,
};

/**
 * Full-viewport photo viewer.
 * Positioning uses inline styles (not only Tailwind) so iOS cannot keep the
 * default dialog left-50%/translate centering that stacks prev/next arrows.
 */
const PhotoViewerDialog: React.FC<PhotoViewerDialogProps> = ({
  open,
  onOpenChange,
  selectedPhoto,
  selectedBillPhotos: _selectedBillPhotos,
  selectedJobPhotos: _selectedJobPhotos,
  onPrevious,
  onNext,
  onDownload,
  onClose,
  showDownload = true,
}) => {
  const [loadError, setLoadError] = useState(false);
  const hasNav = Boolean(selectedPhoto && selectedPhoto.total > 1);

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
        overlayClassName="z-[100]"
        style={FULLSCREEN_STYLE}
        className={cn(
          // z-[100] sits above nested report/gallery dialogs (also z-50)
          'fixed inset-0 z-[100] flex !h-[100dvh] !max-h-[100dvh] !w-full !max-w-none',
          '!left-0 !top-0 !translate-x-0 !translate-y-0 gap-0 rounded-none border-none bg-black p-0 shadow-none',
          // Enter/exit animations use transform and break absolute left/right on iOS
          '!animate-none data-[state=open]:!animate-none data-[state=closed]:!animate-none',
          'data-[state=open]:!zoom-in-100 data-[state=closed]:!zoom-out-100',
          'data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0',
          'data-[state=closed]:!slide-out-to-left-0 data-[state=closed]:!slide-out-to-top-0',
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
          {/* Image stage — below controls; must never cover nav hits */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            {selectedPhoto && !loadError && (
              <ZoomableImage
                src={selectedPhoto.url}
                alt={`Photo ${selectedPhoto.index + 1}`}
                className="max-h-full max-w-full select-none object-contain"
                onError={() => setLoadError(true)}
              />
            )}
            {selectedPhoto && loadError && (
              <div className="flex h-full w-full items-center justify-center px-6 text-center text-white">
                <div className="max-w-lg">
                  <p className="mb-2 text-lg font-medium">Could not load this image</p>
                  <p className="break-all text-sm text-white/80">{selectedPhoto.url}</p>
                </div>
              </div>
            )}
          </div>

          {/* Controls layer — pointer-events only on buttons so pinch still works on image */}
          <div className="pointer-events-none absolute inset-0 z-[60]">
            <button
              type="button"
              aria-label="Close"
              className="pointer-events-auto absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white active:bg-black/90"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
            >
              <X className="h-5 w-5" />
            </button>

            {hasNav && selectedPhoto && (
              <div className="pointer-events-none absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full bg-black/50 px-3 py-1 text-sm text-white">
                {selectedPhoto.index + 1} / {selectedPhoto.total}
              </div>
            )}

            {hasNav && (
              <button
                type="button"
                aria-label="Previous photo"
                className="pointer-events-auto absolute left-3 top-1/2 z-[70] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white active:bg-black/90"
                style={{ left: 12 }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPrevious();
                }}
              >
                <ChevronLeft className="h-7 w-7" strokeWidth={2.5} />
              </button>
            )}

            {hasNav && (
              <button
                type="button"
                aria-label="Next photo"
                className="pointer-events-auto absolute top-1/2 z-[70] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white active:bg-black/90"
                style={{ right: 12 }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onNext();
                }}
              >
                <ChevronRight className="h-7 w-7" strokeWidth={2.5} />
              </button>
            )}

            {selectedPhoto && !loadError && (
              <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center text-xs text-white/70 sm:hidden">
                Pinch or double-tap to zoom
              </div>
            )}

            {showDownload && selectedPhoto && (
              <div
                className="pointer-events-none absolute inset-x-0 flex justify-center"
                style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDownload(selectedPhoto.url, selectedPhoto.index);
                  }}
                  className="pointer-events-auto bg-card/90 text-black hover:bg-card"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoViewerDialog;
