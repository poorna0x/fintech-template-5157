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
  /** Hide download (e.g. technician viewer). Default true. */
  showDownload?: boolean;
  /**
   * Show prev/next arrows + counter.
   * False when opened from a photo gallery grid (pick another thumb instead).
   * Default true (bill/payment/report sequences).
   */
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

/** Placeholder size so PhotoSwipe can open instantly (no preload wait). */
function placeholderSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 1600, height: 1200 };
  return {
    width: Math.max(1200, Math.round(window.innerWidth * 2)),
    height: Math.max(900, Math.round(window.innerHeight * 2)),
  };
}

function slidesFromUrls(urls: string[]): Slide[] {
  const { width, height } = placeholderSize();
  return urls.map((src, i) => ({
    src,
    width,
    height,
    alt: `Photo ${i + 1}`,
  }));
}

/** After decode, fix real dimensions so pinch zoom bounds match the image. */
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

/** Hide PhotoSwipe’s default chrome — we render the previous HRO controls on top. */
const PSWP_CHROME_CSS = `
.pswp { --pswp-bg: #000; z-index: 200 !important; }
.pswp__top-bar,
.pswp__button--close,
.pswp__button--zoom,
.pswp__button--arrow--prev,
.pswp__button--arrow--next,
.pswp__counter {
  display: none !important;
}
`;

/**
 * PhotoSwipe for pinch/double-tap zoom (APK + PWA).
 * Opens immediately (no dimension preload). Previous HRO controls overlaid.
 */
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

  const [pswpReady, setPswpReady] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  const urls = useMemo(() => {
    // Gallery grid already lets you pick photos — open a single slide only.
    if (!showNavigation) {
      return selectedPhoto?.url ? [selectedPhoto.url] : [];
    }
    return resolveUrls(selectedPhoto, selectedBillPhotos, selectedJobPhotos);
  }, [showNavigation, selectedPhoto, selectedBillPhotos, selectedJobPhotos]);
  const urlsKey = urls.join('\n');

  const parentDrivenNav =
    showNavigation && urls.length === 1 && Boolean(selectedPhoto && selectedPhoto.total > 1);
  const hasNav = Boolean(
    showNavigation && selectedPhoto && (selectedPhoto.total > 1 || urls.length > 1),
  );
  const displayIndex = parentDrivenNav
    ? (selectedPhoto?.index ?? 0)
    : slideIndex;
  const displayTotal = parentDrivenNav
    ? (selectedPhoto?.total ?? 1)
    : Math.max(urls.length, selectedPhoto?.total ?? 1);
  const currentUrl =
    (parentDrivenNav ? selectedPhoto?.url : urls[slideIndex]) || selectedPhoto?.url || '';

  // Remount key: multi-slide gallery stays alive across arrow taps; parent-driven swaps URL.
  const sessionKey = !open || !selectedPhoto?.url
    ? ''
    : parentDrivenNav
      ? `p|${selectedPhoto.url}|${selectedPhoto.index}`
      : `g|${urlsKey}|${selectedPhoto.index}`;

  useEffect(() => {
    if (!sessionKey || !selectedPhoto?.url) {
      setPswpReady(false);
      return;
    }

    const list = urlsKey ? urlsKey.split('\n').filter(Boolean) : [];
    if (list.length === 0) return;

    let cancelled = false;

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

    const options: PhotoSwipeOptions = {
      dataSource: slidesFromUrls(list),
      index: startIndex,
      bgOpacity: 1,
      showHideAnimationType: 'none',
      pinchToClose: false,
      closeOnVerticalDrag: false,
      tapAction: 'toggle-controls',
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

    pswp.on('change', () => {
      setSlideIndex(pswp.currIndex);
    });

    pswp.on('loadComplete', (e) => {
      if (cancelled || e.isError) return;
      const el = e.content?.element;
      if (el instanceof HTMLImageElement) {
        refineSlideSize(pswp, e.slide.index, el);
      }
    });

    pswp.on('close', () => {
      setPswpReady(false);
      onCloseRef.current();
    });

    pswp.on('destroy', () => {
      if (pswpRef.current === pswp) pswpRef.current = null;
      setPswpReady(false);
    });

    pswp.init();
    if (!cancelled) {
      setSlideIndex(pswp.currIndex);
      setPswpReady(true);
    }

    return () => {
      cancelled = true;
      setPswpReady(false);
      if (pswpRef.current) {
        try {
          pswpRef.current.destroy();
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionKey encodes open/urls/index
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
    const pswp = pswpRef.current;
    if (pswp && urls.length > 1) {
      pswp.prev();
      return;
    }
    onPrevious();
  };

  const handleNext = () => {
    if (parentDrivenNav) {
      onNext();
      return;
    }
    const pswp = pswpRef.current;
    if (pswp && urls.length > 1) {
      pswp.next();
      return;
    }
    onNext();
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <style>{PSWP_CHROME_CSS}</style>
      <div
        className="pointer-events-none fixed inset-0 z-[210]"
        style={{ zIndex: 210 }}
        aria-hidden={!pswpReady}
      >
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

        {hasNav && selectedPhoto && (
          <div className="pointer-events-none absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full bg-black/50 px-3 py-1 text-sm text-white">
            {displayIndex + 1} / {displayTotal}
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
              handlePrevious();
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
              handleNext();
            }}
          >
            <ChevronRight className="h-7 w-7" strokeWidth={2.5} />
          </button>
        )}

        {selectedPhoto && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center text-xs text-white/70 sm:hidden">
            Pinch or double-tap to zoom
          </div>
        )}

        {showDownload && selectedPhoto && currentUrl && (
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
