import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PhotoSwipe, { type PhotoSwipeOptions } from 'photoswipe';
import 'photoswipe/style.css';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';

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
  showDownload?: boolean;
  /** Prev/next for bill/payment sequences only. Gallery grids: false. */
  showNavigation?: boolean;
}

type Slide = { src: string; width: number; height: number; alt: string };

function resolveUrls(
  selectedPhoto: PhotoViewerDialogProps['selectedPhoto'],
  selectedBillPhotos: string[] | null,
  selectedJobPhotos: PhotoViewerDialogProps['selectedJobPhotos'],
): string[] {
  if (selectedBillPhotos && selectedBillPhotos.length > 0) return selectedBillPhotos;
  if (selectedJobPhotos?.photos && selectedJobPhotos.photos.length > 0) {
    return selectedJobPhotos.photos;
  }
  if (selectedPhoto?.url) return [selectedPhoto.url];
  return [];
}

/** Portrait-friendly fallback — never landscape 4:3 (that made payment shots tiny). */
const FALLBACK_W = 1080;
const FALLBACK_H = 1920;

function loadNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (width: number, height: number) => {
      if (settled) return;
      settled = true;
      resolve({ width, height });
    };
    // Don't freeze the UI if a URL hangs.
    const timer = window.setTimeout(() => finish(FALLBACK_W, FALLBACK_H), 1200);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(img.naturalWidth || FALLBACK_W, img.naturalHeight || FALLBACK_H);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(FALLBACK_W, FALLBACK_H);
    };
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      window.clearTimeout(timer);
      finish(img.naturalWidth, img.naturalHeight);
    }
  });
}

/** Clear PhotoSwipe leftovers that can leave buttons untappable. */
function scrubPhotoViewerSideEffects() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.pswp').forEach((el) => {
    try {
      el.remove();
    } catch {
      /* ignore */
    }
  });
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('touch-action');
}

/** Apply real pixel size and re-fit so portrait payment shots fill the screen (not a tiny landscape box). */
function applyRealSizeAndFit(pswp: PhotoSwipe, slideIndex: number, width: number, height: number) {
  if (!width || !height) return;
  const dataSource = pswp.options.dataSource;
  if (!Array.isArray(dataSource)) return;
  const item = dataSource[slideIndex] as Slide | undefined;
  if (!item) return;

  const changed = item.width !== width || item.height !== height;
  item.width = width;
  item.height = height;

  const slide = pswp.currSlide;
  if (!slide || slide.index !== slideIndex) return;

  try {
    if (changed) slide.updateContentSize(true);
    const fit = slide.zoomLevels?.fit;
    if (typeof fit === 'number' && Number.isFinite(fit)) {
      const cx = pswp.viewportSize.x / 2;
      const cy = pswp.viewportSize.y / 2;
      slide.zoomTo(fit, { x: cx, y: cy }, 0);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Old HRO chrome + PhotoSwipe zoom only.
 * Real image dimensions before open — wrong 4:3 placeholders made payment photos tiny.
 */
const PSWP_CSS = `
.pswp { --pswp-bg: #000; z-index: 200 !important; }
.pswp__bg { background: #000 !important; }
.pswp__top-bar,
.pswp__button--close,
.pswp__button--zoom,
.pswp__button--arrow--prev,
.pswp__button--arrow--next,
.pswp__counter,
.pswp__preloader {
  display: none !important;
}
`;

const PhotoViewerDialog: React.FC<PhotoViewerDialogProps> = ({
  open,
  onOpenChange: _onOpenChange,
  selectedPhoto,
  selectedBillPhotos,
  selectedJobPhotos,
  onPrevious,
  onNext,
  onDownload,
  onClose,
  showDownload = true,
  showNavigation = true,
}) => {
  const pswpRef = useRef<PhotoSwipe | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /** Photo painted and sized — only then show arrows/download (close stays). */
  const [photoReady, setPhotoReady] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  const urls = useMemo(() => {
    if (!showNavigation) {
      return selectedPhoto?.url ? [selectedPhoto.url] : [];
    }
    return resolveUrls(selectedPhoto, selectedBillPhotos, selectedJobPhotos);
  }, [showNavigation, selectedPhoto, selectedBillPhotos, selectedJobPhotos]);
  const urlsKey = urls.join('\n');

  const parentDrivenNav =
    showNavigation && urls.length === 1 && Boolean(selectedPhoto && selectedPhoto.total > 1);
  const hasNav = Boolean(
    showNavigation && selectedPhoto && (urls.length > 1 || (selectedPhoto.total > 1 && parentDrivenNav)),
  );
  const displayIndex = parentDrivenNav ? (selectedPhoto?.index ?? 0) : slideIndex;
  const displayTotal = parentDrivenNav
    ? (selectedPhoto?.total ?? 1)
    : Math.max(urls.length, 1);
  const currentUrl =
    (parentDrivenNav ? selectedPhoto?.url : urls[slideIndex]) || selectedPhoto?.url || '';

  const sessionKey = !open || !selectedPhoto?.url
    ? ''
    : parentDrivenNav
      ? `p|${selectedPhoto.url}|${selectedPhoto.index}`
      : `g|${urlsKey}|${selectedPhoto.index}`;

  useEffect(() => {
    if (!sessionKey || !selectedPhoto?.url) {
      setPhotoReady(false);
      return;
    }

    const list = urlsKey ? urlsKey.split('\n').filter(Boolean) : [];
    if (list.length === 0) return;

    let cancelled = false;
    setPhotoReady(false);

    const startIndex = parentDrivenNav
      ? 0
      : Math.min(Math.max(selectedPhoto.index, 0), list.length - 1);

    if (pswpRef.current) {
      try {
        pswpRef.current.destroy();
      } catch {
        /* ignore */
      }
      pswpRef.current = null;
    }

    const openViewer = async () => {
      // Only block on the current photo size (fast). Neighbors refine on load.
      const startSize = await loadNaturalSize(list[startIndex]);
      if (cancelled) return;

      const slides: Slide[] = list.map((src, i) => ({
        src,
        // Portrait fallback for unpaid sizes — avoids tiny payment fit
        width: i === startIndex ? startSize.width : FALLBACK_W,
        height: i === startIndex ? startSize.height : FALLBACK_H,
        alt: `Photo ${i + 1}`,
      }));

      const options: PhotoSwipeOptions = {
        dataSource: slides,
        index: startIndex,
        bgOpacity: 1,
        showHideAnimationType: 'none',
        pinchToClose: false,
        closeOnVerticalDrag: false,
        tapAction: false,
        doubleTapAction: 'zoom',
        secondaryZoomLevel: 2.5,
        maxZoomLevel: 4,
        initialZoomLevel: 'fit',
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        preload: [1, 1],
        zoom: false,
        close: false,
        arrowPrev: false,
        arrowNext: false,
        counter: false,
      };

      const pswp = new PhotoSwipe(options);
      pswpRef.current = pswp;

      const syncReadyFromCurrent = () => {
        if (cancelled) return;
        const el = pswp.currSlide?.content?.element;
        if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
          applyRealSizeAndFit(pswp, pswp.currIndex, el.naturalWidth, el.naturalHeight);
          setPhotoReady(true);
        }
      };

      pswp.on('change', () => {
        setSlideIndex(pswp.currIndex);
        const el = pswp.currSlide?.content?.element;
        if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
          applyRealSizeAndFit(pswp, pswp.currIndex, el.naturalWidth, el.naturalHeight);
          setPhotoReady(true);
        } else {
          setPhotoReady(false);
          requestAnimationFrame(syncReadyFromCurrent);
        }
      });

      pswp.on('loadComplete', (e) => {
        if (cancelled || e.isError) return;
        const el = e.content?.element;
        if (el instanceof HTMLImageElement && el.naturalWidth > 0) {
          applyRealSizeAndFit(pswp, e.slide.index, el.naturalWidth, el.naturalHeight);
        }
        if (e.slide.index === pswp.currIndex) {
          setPhotoReady(true);
        }
      });

      pswp.on('close', () => {
        setPhotoReady(false);
        scrubPhotoViewerSideEffects();
        onCloseRef.current();
      });

      pswp.on('destroy', () => {
        if (pswpRef.current === pswp) pswpRef.current = null;
        setPhotoReady(false);
        scrubPhotoViewerSideEffects();
      });

      pswp.init();
      setSlideIndex(pswp.currIndex);
      requestAnimationFrame(syncReadyFromCurrent);

      // Warm real sizes for neighbors in background (no UI wait)
      list.forEach((src, i) => {
        if (i === startIndex) return;
        void loadNaturalSize(src).then((size) => {
          if (cancelled || !pswpRef.current) return;
          const dataSource = pswp.options.dataSource;
          if (!Array.isArray(dataSource)) return;
          const item = dataSource[i] as Slide | undefined;
          if (!item) return;
          item.width = size.width;
          item.height = size.height;
          if (pswp.currIndex === i) {
            applyRealSizeAndFit(pswp, i, size.width, size.height);
          }
        });
      });
    };

    void openViewer();

    return () => {
      cancelled = true;
      setPhotoReady(false);
      if (pswpRef.current) {
        try {
          pswpRef.current.destroy();
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
      }
      scrubPhotoViewerSideEffects();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const handleClose = () => {
    const pswp = pswpRef.current;
    if (pswp) {
      try {
        pswp.close(); // normal path: 'close' handler calls onClose
      } catch {
        scrubPhotoViewerSideEffects();
        onClose();
        return;
      }
      // If close() was a no-op, force unlock so the app isn't stuck
      window.setTimeout(() => {
        if (pswpRef.current !== pswp) {
          scrubPhotoViewerSideEffects();
          return;
        }
        try {
          pswp.destroy();
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
        scrubPhotoViewerSideEffects();
        onClose();
      }, 80);
      return;
    }
    scrubPhotoViewerSideEffects();
    onClose();
  };

  const handlePrevious = () => {
    if (parentDrivenNav) {
      onPrevious();
      return;
    }
    pswpRef.current?.prev();
  };

  const handleNext = () => {
    if (parentDrivenNav) {
      onNext();
      return;
    }
    pswpRef.current?.next();
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <style>{PSWP_CSS}</style>
      {/* Visual black only — must not capture taps or buttons feel stuck */}
      <div
        className="pointer-events-none fixed inset-0 z-[199] bg-black"
        style={{ zIndex: 199, pointerEvents: 'none' }}
        aria-hidden
      />

      <div
        className="pointer-events-none fixed inset-0 z-[210]"
        style={{ zIndex: 210 }}
      >
        {/* Close always available */}
        <button
          type="button"
          aria-label="Close"
          className="pointer-events-auto absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white active:bg-black/90"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleClose();
          }}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Arrows / counter / download only after photo is on screen — no early flash */}
        {photoReady && hasNav && (
          <div className="pointer-events-none absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full bg-black/50 px-3 py-1 text-sm text-white">
            {displayIndex + 1} / {displayTotal}
          </div>
        )}

        {photoReady && hasNav && (
          <button
            type="button"
            aria-label="Previous photo"
            className="pointer-events-auto absolute left-3 top-1/2 z-[70] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white active:bg-black/90"
            style={{ left: 12 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePrevious();
            }}
          >
            <ChevronLeft className="h-7 w-7" strokeWidth={2.5} />
          </button>
        )}

        {photoReady && hasNav && (
          <button
            type="button"
            aria-label="Next photo"
            className="pointer-events-auto absolute top-1/2 z-[70] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white active:bg-black/90"
            style={{ right: 12 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleNext();
            }}
          >
            <ChevronRight className="h-7 w-7" strokeWidth={2.5} />
          </button>
        )}

        {photoReady && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center text-xs text-white/70 sm:hidden">
            Pinch or double-tap to zoom
          </div>
        )}

        {/* Download stays available on every slide (not gated on photoReady —
            next/prev with a cached image was leaving ready=false forever). */}
        {showDownload && currentUrl && (
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
                onDownload(currentUrl, displayIndex);
              }}
              className="pointer-events-auto bg-card/90 text-black hover:bg-card"
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
};

export default PhotoViewerDialog;
