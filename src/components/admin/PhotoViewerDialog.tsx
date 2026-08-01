import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { ZoomableImage } from '@/components/ZoomableImage';

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

const LOCKED_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
/** While open: Android/Chrome will deliver pinch to JS. ZoomableImage preventDefaults page zoom. */
const OPEN_VIEWPORT =
  'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes';

/**
 * Fullscreen photo viewer (body portal — not Radix Dialog).
 * Same black UI / controls as before. No +/- zoom buttons.
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
  const hasNav = Boolean(selectedPhoto && selectedPhoto.total > 1);

  useEffect(() => {
    if (open && selectedPhoto?.url) setLoadError(false);
  }, [open, selectedPhoto?.url]);

  // Unlock viewport for pinch delivery; restore app lock when closed.
  useEffect(() => {
    if (!open) return;

    const meta =
      document.querySelector('meta[name="viewport"]') ||
      (() => {
        const m = document.createElement('meta');
        m.setAttribute('name', 'viewport');
        document.head.appendChild(m);
        return m;
      })();
    const prev = meta.getAttribute('content') || LOCKED_VIEWPORT;
    meta.setAttribute('content', OPEN_VIEWPORT);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

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
      meta.setAttribute('content', LOCKED_VIEWPORT);
      // Some WebViews keep a visual page zoom after unlocking; force reset.
      meta.setAttribute('content', LOCKED_VIEWPORT);
      document.body.style.overflow = prevOverflow;
      const bodyStyle = document.body.style as CSSStyleDeclaration & { zoom?: string };
      if (typeof bodyStyle.zoom === 'string') bodyStyle.zoom = '1';
      window.scrollTo(0, 0);
      window.removeEventListener('keydown', onKey);
      // Restore prior content after reset (usually same locked string).
      meta.setAttribute('content', prev || LOCKED_VIEWPORT);
    };
  }, [open, onClose, onPrevious, onNext, hasNav]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo Viewer"
      className="fixed inset-0 z-[200] flex h-[100dvh] max-h-[100dvh] w-full max-w-none bg-black"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        margin: 0,
        pointerEvents: 'auto',
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
        <div
          className="absolute inset-0 z-0 overflow-hidden"
          style={{ touchAction: 'none', pointerEvents: 'auto' }}
        >
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
    </div>,
    document.body,
  );
};

export default PhotoViewerDialog;
