import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { ZoomableImage, type ZoomableImageHandle } from '@/components/ZoomableImage';
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

const ctrlBtn =
  'flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white active:bg-black/90';

/**
 * Fullscreen photo viewer via body portal (avoids nested Radix stealing pinch).
 * Zoom uses the Jul-17 react-zoom-pan-pinch approach + always-on +/- buttons.
 */
const PhotoViewerDialog: React.FC<PhotoViewerDialogProps> = ({
  open,
  onOpenChange: _onOpenChange,
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
  const titleId = useId();
  const zoomRef = useRef<ZoomableImageHandle | null>(null);
  const hasNav = Boolean(selectedPhoto && selectedPhoto.total > 1);

  useEffect(() => {
    if (open && selectedPhoto?.url) setLoadError(false);
  }, [open, selectedPhoto?.url]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    const prevPointerEvents = document.body.style.pointerEvents;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.pointerEvents = 'auto';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && hasNav) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && hasNav) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      document.body.style.pointerEvents = prevPointerEvents;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, hasNav, onClose, onPrevious, onNext]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 flex bg-black"
      style={{
        zIndex: 2147483000,
        pointerEvents: 'auto',
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        touchAction: 'none',
        overscrollBehavior: 'none',
      }}
    >
      <h2 id={titleId} className="sr-only">
        Photo Viewer
      </h2>

      <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
        <div className="absolute inset-0 z-0 overflow-hidden">
          {selectedPhoto && !loadError && (
            <ZoomableImage
              key={selectedPhoto.url}
              ref={zoomRef}
              src={selectedPhoto.url}
              alt={`Photo ${selectedPhoto.index + 1}`}
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

        <button
          type="button"
          aria-label="Close"
          className={cn(ctrlBtn, 'absolute right-3 z-[2]')}
          style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="h-5 w-5" />
        </button>

        {hasNav && selectedPhoto && (
          <div
            className="pointer-events-none absolute left-3 z-[2] rounded-full bg-black/50 px-3 py-1 text-sm text-white"
            style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            {selectedPhoto.index + 1} / {selectedPhoto.total}
          </div>
        )}

        {hasNav && (
          <button
            type="button"
            aria-label="Previous photo"
            className={cn(ctrlBtn, 'absolute left-3 top-1/2 z-[2] h-12 w-12 -translate-y-1/2')}
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
            className={cn(ctrlBtn, 'absolute right-3 top-1/2 z-[2] h-12 w-12 -translate-y-1/2')}
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
          <div
            className="absolute left-1/2 z-[2] flex -translate-x-1/2 items-center gap-2"
            style={{
              bottom: showDownload
                ? 'max(4.5rem, calc(env(safe-area-inset-bottom) + 3.5rem))'
                : 'max(1.25rem, env(safe-area-inset-bottom))',
            }}
          >
            <button
              type="button"
              aria-label="Zoom out"
              className={ctrlBtn}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                zoomRef.current?.zoomOut();
              }}
            >
              <Minus className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              className={ctrlBtn}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                zoomRef.current?.reset();
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              className={ctrlBtn}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                zoomRef.current?.zoomIn();
              }}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        )}

        {selectedPhoto && !loadError && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[1] flex justify-center text-xs text-white/70 sm:hidden"
            style={{
              bottom: showDownload
                ? 'max(7.5rem, calc(env(safe-area-inset-bottom) + 6.5rem))'
                : 'max(4.25rem, calc(env(safe-area-inset-bottom) + 3.25rem))',
            }}
          >
            Pinch, double-tap, or use + / −
          </div>
        )}

        {showDownload && selectedPhoto && (
          <div
            className="absolute inset-x-0 z-[2] flex justify-center"
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
              className="bg-card/90 text-black hover:bg-card"
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PhotoViewerDialog;
