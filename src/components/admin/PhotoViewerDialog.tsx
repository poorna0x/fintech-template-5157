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

function loadNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const finish = () => {
      resolve({
        width: img.naturalWidth || 1600,
        height: img.naturalHeight || 1200,
      });
    };
    img.onload = finish;
    img.onerror = () => resolve({ width: 1600, height: 1200 });
    img.src = src;
    if (img.complete) finish();
  });
}

function refineSlideSize(pswp: PhotoSwipe, slideIndex: number, img: HTMLImageElement) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return;
  const dataSource = pswp.options.dataSource;
  if (!Array.isArray(dataSource)) return;
  const item = dataSource[slideIndex] as Slide | undefined;
  if (!item || (item.width === w && item.height === h)) return;
  item.width = w;
  item.height = h;
  const slide = pswp.currSlide;
  if (slide && slide.index === slideIndex) {
    try {
      slide.updateContentSize(true);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Old HRO chrome + PhotoSwipe zoom only.
 * - Black stage immediately (like before)
 * - No arrows/download until the photo has loaded
 * - Real image dimensions before open so size matches the old object-contain look
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
.pswp__img {
  object-fit: contain !important;
  object-position: center center !important;
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
      // Size every slide we can from cache before open — correct fit like old object-contain.
      const slides: Slide[] = await Promise.all(
        list.map(async (src, i) => {
          // Prioritize current slide; neighbors can use cache if available without blocking forever.
          if (i === startIndex) {
            const size = await loadNaturalSize(src);
            return { src, width: size.width, height: size.height, alt: `Photo ${i + 1}` };
          }
          // Neighbors: try sync cache via complete Image, else 4:3 fallback refined on load.
          const probe = new Image();
          probe.src = src;
          if (probe.complete && probe.naturalWidth > 0) {
            return {
              src,
              width: probe.naturalWidth,
              height: probe.naturalHeight,
              alt: `Photo ${i + 1}`,
            };
          }
          return { src, width: 1600, height: 1200, alt: `Photo ${i + 1}` };
        }),
      );
      if (cancelled) return;

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
          refineSlideSize(pswp, pswp.currIndex, el);
          setPhotoReady(true);
        }
      };

      pswp.on('change', () => {
        setSlideIndex(pswp.currIndex);
        // Preloaded/cached next slides often skip a second loadComplete — re-check now.
        const el = pswp.currSlide?.content?.element;
        if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
          refineSlideSize(pswp, pswp.currIndex, el);
          setPhotoReady(true);
        } else {
          setPhotoReady(false);
          // Next frame: content may attach after change.
          requestAnimationFrame(syncReadyFromCurrent);
        }
      });

      pswp.on('loadComplete', (e) => {
        if (cancelled || e.isError) return;
        const el = e.content?.element;
        if (el instanceof HTMLImageElement) {
          refineSlideSize(pswp, e.slide.index, el);
        }
        if (e.slide.index === pswp.currIndex) {
          setPhotoReady(true);
        }
      });

      pswp.on('close', () => {
        setPhotoReady(false);
        onCloseRef.current();
      });

      pswp.on('destroy', () => {
        if (pswpRef.current === pswp) pswpRef.current = null;
        setPhotoReady(false);
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
        try {
          pswpRef.current.destroy();
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const handleClose = () => {
    if (pswpRef.current) {
      try {
        pswpRef.current.close();
      } catch {
        onClose();
      }
      return;
    }
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
      {/* Instant black stage — same as old viewer while photo/zoom mounts */}
      <div
        className="fixed inset-0 z-[199] bg-black"
        style={{ zIndex: 199 }}
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
