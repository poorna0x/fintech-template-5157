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
  /** Customer photo gallery list (admin). */
  selectedCustomerPhotos?: string[] | null;
  onPrevious: () => void;
  onNext: () => void;
  onDownload: (photoUrl: string, photoIndex: number) => void;
  onClose: () => void;
  showDownload?: boolean;
  /** Prev/next when the open list has more than one photo. */
  showNavigation?: boolean;
}

type Slide = { src: string; width: number; height: number; alt: string };

function resolveUrls(
  selectedPhoto: PhotoViewerDialogProps['selectedPhoto'],
  selectedBillPhotos: string[] | null,
  selectedJobPhotos: PhotoViewerDialogProps['selectedJobPhotos'],
  selectedCustomerPhotos?: string[] | null,
): string[] {
  if (selectedBillPhotos && selectedBillPhotos.length > 0) return selectedBillPhotos;
  if (selectedCustomerPhotos && selectedCustomerPhotos.length > 0) return selectedCustomerPhotos;
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

type ZoomLevelLike = {
  fit: number;
  panAreaSize: { x?: number; y?: number } | null;
  elementSize: { x: number; y: number } | null;
};

/**
 * Same rule for every photo: object-fit contain.
 * PhotoSwipe's built-in `fit` caps at 1× so small payment shots stay tiny while
 * large ones fill the screen — that looked inconsistent. This scales up or down.
 */
function containZoom(z: ZoomLevelLike): number {
  const panW = z.panAreaSize?.x ?? 0;
  const panH = z.panAreaSize?.y ?? 0;
  const imgW = z.elementSize?.x ?? 0;
  const imgH = z.elementSize?.y ?? 0;
  if (!panW || !panH || !imgW || !imgH) return z.fit;
  const level = Math.min(panW / imgW, panH / imgH);
  return Number.isFinite(level) && level > 0 ? level : z.fit;
}

/** Update slide pixel size; re-fit only when size changes or forceFit (never mid-pinch). */
function applyRealSizeAndFit(
  pswp: PhotoSwipe,
  slideIndex: number,
  width: number,
  height: number,
  opts?: { forceFit?: boolean },
) {
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

  // loadComplete / decode finishing mid-pinch was snapping zoom back → mobile jerk
  const gestures = (pswp as unknown as { gestures?: { isMultitouch?: boolean; isDragging?: boolean } }).gestures;
  if (gestures?.isMultitouch || gestures?.isDragging) return;
  if (!changed && !opts?.forceFit) return;

  try {
    if (changed) slide.updateContentSize(true);
    const z = slide.zoomLevels;
    if (!z) return;
    const level = containZoom(z);
    const cx = pswp.viewportSize.x / 2;
    const cy = pswp.viewportSize.y / 2;
    slide.zoomTo(level, { x: cx, y: cy }, 0);
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
.pswp__img,
.pswp__zoom-wrap {
  will-change: transform;
  backface-visibility: hidden;
}
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
  selectedCustomerPhotos = null,
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
  /** Set while tearing down for remount/cleanup — destroy() fires 'close'; don't dismiss UI then. */
  const suppressCloseCallbackRef = useRef(false);

  /** Photo painted and sized — only then show arrows/download (close stays). */
  const [photoReady, setPhotoReady] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  const urls = useMemo(() => {
    if (!showNavigation) {
      return selectedPhoto?.url ? [selectedPhoto.url] : [];
    }
    return resolveUrls(selectedPhoto, selectedBillPhotos, selectedJobPhotos, selectedCustomerPhotos);
  }, [showNavigation, selectedPhoto, selectedBillPhotos, selectedJobPhotos, selectedCustomerPhotos]);
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

  // Multi-slide: do NOT put index in the key — parent index updates must not destroy PhotoSwipe
  // (destroy() calls close() which was wrongly dismissing the whole viewer).
  const sessionKey = !open || !selectedPhoto?.url
    ? ''
    : parentDrivenNav
      ? `p|${selectedPhoto.url}|${selectedPhoto.index}`
      : `g|${urlsKey}`;

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
      suppressCloseCallbackRef.current = true;
      try {
        pswpRef.current.destroy();
      } catch {
        /* ignore */
      }
      pswpRef.current = null;
      suppressCloseCallbackRef.current = false;
    }

    const openViewer = async () => {
      // Real sizes for every slide up front — wrong aspect on neighbors made
      // arrow-next jump between tiny / tall / over-zoomed.
      const sizes = await Promise.all(list.map((src) => loadNaturalSize(src)));
      if (cancelled) return;

      const slides: Slide[] = list.map((src, i) => ({
        src,
        width: sizes[i]?.width || FALLBACK_W,
        height: sizes[i]?.height || FALLBACK_H,
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
        // One rule everywhere: contain in viewport (scale up or down).
        initialZoomLevel: (z) => containZoom(z),
        secondaryZoomLevel: (z) => containZoom(z) * 2.5,
        maxZoomLevel: (z) => Math.max(4, containZoom(z) * 4),
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
          applyRealSizeAndFit(pswp, pswp.currIndex, el.naturalWidth, el.naturalHeight, {
            forceFit: true,
          });
          setPhotoReady(true);
        }
      };

      pswp.on('change', () => {
        setSlideIndex(pswp.currIndex);
        // Reset to contain when changing slides (no leftover zoom).
        const el = pswp.currSlide?.content?.element;
        if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
          applyRealSizeAndFit(pswp, pswp.currIndex, el.naturalWidth, el.naturalHeight, {
            forceFit: true,
          });
          setPhotoReady(true);
        } else {
          setPhotoReady(false);
          const z = pswp.currSlide?.zoomLevels;
          if (z) {
            try {
              const level = containZoom(z);
              const cx = pswp.viewportSize.x / 2;
              const cy = pswp.viewportSize.y / 2;
              pswp.currSlide?.zoomTo(level, { x: cx, y: cy }, 0);
            } catch {
              /* ignore */
            }
          }
          requestAnimationFrame(syncReadyFromCurrent);
        }
      });

      pswp.on('loadComplete', (e) => {
        if (cancelled || e.isError) return;
        const el = e.content?.element;
        // Only correct size if wrong — never re-fit (that jerked active pinches).
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
        // destroy() always ends up in close() — ignore when remounting/cleaning up
        if (suppressCloseCallbackRef.current) return;
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
    };

    void openViewer();

    return () => {
      cancelled = true;
      setPhotoReady(false);
      if (pswpRef.current) {
        suppressCloseCallbackRef.current = true;
        try {
          pswpRef.current.destroy();
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
        suppressCloseCallbackRef.current = false;
      }
      scrubPhotoViewerSideEffects();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const handleClose = () => {
    const pswp = pswpRef.current;
    if (pswp) {
      try {
        pswp.close(); // 'close' → onClose (Escape / X)
      } catch {
        scrubPhotoViewerSideEffects();
        onClose();
        return;
      }
      window.setTimeout(() => {
        if (pswpRef.current !== pswp) {
          scrubPhotoViewerSideEffects();
          return;
        }
        suppressCloseCallbackRef.current = true;
        try {
          pswp.destroy();
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
        suppressCloseCallbackRef.current = false;
        scrubPhotoViewerSideEffects();
        onClose();
      }, 80);
      return;
    }
    scrubPhotoViewerSideEffects();
    onClose();
  };

  const stopDialogDismiss = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePrevious = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (parentDrivenNav) {
      onPrevious();
      return;
    }
    pswpRef.current?.prev();
  };

  const handleNext = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
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
          onPointerDown={stopDialogDismiss}
          onClick={(e) => {
            stopDialogDismiss(e);
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
            onPointerDown={stopDialogDismiss}
            onClick={handlePrevious}
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
            onPointerDown={stopDialogDismiss}
            onClick={handleNext}
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
              onPointerDown={stopDialogDismiss}
              onClick={(e) => {
                stopDialogDismiss(e);
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
