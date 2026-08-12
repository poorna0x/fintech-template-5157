import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PhotoSwipe, { type PhotoSwipeOptions } from 'photoswipe';
import 'photoswipe/style.css';
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type InboxPhotoSlide = {
  src: string;
  alt: string;
};

type Props = {
  open: boolean;
  slides: InboxPhotoSlide[];
  startIndex: number;
  onClose: () => void;
  onDownload?: (index: number) => void;
};

type PswpSlide = { src: string; width: number; height: number; alt: string };

const FALLBACK_W = 1080;
const FALLBACK_H = 1920;

const PSWP_CSS = `
.pswp.pswp-inbox { --pswp-bg: #0b141a; z-index: 9999 !important; }
.pswp-inbox .pswp__bg { background: #0b141a !important; }
.pswp-inbox .pswp__img,
.pswp-inbox .pswp__zoom-wrap {
  will-change: transform;
  backface-visibility: hidden;
  touch-action: none;
}
.pswp-inbox .pswp__top-bar,
.pswp-inbox .pswp__button--close,
.pswp-inbox .pswp__button--zoom,
.pswp-inbox .pswp__button--arrow--prev,
.pswp-inbox .pswp__button--arrow--next,
.pswp-inbox .pswp__counter,
.pswp-inbox .pswp__preloader {
  display: none !important;
}
`;

function loadNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (width: number, height: number) => {
      if (settled) return;
      settled = true;
      resolve({ width, height });
    };
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

function scrubPswp() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.pswp-inbox').forEach((el) => {
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

function containZoom(z: ZoomLevelLike): number {
  const panW = z.panAreaSize?.x ?? 0;
  const panH = z.panAreaSize?.y ?? 0;
  const imgW = z.elementSize?.x ?? 0;
  const imgH = z.elementSize?.y ?? 0;
  if (!panW || !panH || !imgW || !imgH) return z.fit;
  const level = Math.min(panW / imgW, panH / imgH);
  return Number.isFinite(level) && level > 0 ? level : z.fit;
}

function applyRealSizeAndFit(
  pswp: PhotoSwipe,
  slideIndex: number,
  width: number,
  height: number,
  opts?: { forceFit?: boolean }
) {
  if (!width || !height) return;
  const dataSource = pswp.options.dataSource;
  if (!Array.isArray(dataSource)) return;
  const item = dataSource[slideIndex] as PswpSlide | undefined;
  if (!item) return;

  const changed = item.width !== width || item.height !== height;
  item.width = width;
  item.height = height;

  const slide = pswp.currSlide;
  if (!slide || slide.index !== slideIndex) return;

  const gestures = (pswp as unknown as { gestures?: { isMultitouch?: boolean; isDragging?: boolean } })
    .gestures;
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

export function WhatsAppInboxPhotoViewer({
  open,
  slides,
  startIndex,
  onClose,
  onDownload,
}: Props) {
  const pswpRef = useRef<PhotoSwipe | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const suppressCloseRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);

  const sessionKey =
    open && slides.length > 0 ? slides.map((s) => s.src).join('\n') + `#${startIndex}` : '';

  useEffect(() => {
    if (!sessionKey) {
      setReady(false);
      return;
    }

    let cancelled = false;
    setReady(false);
    setIndex(Math.min(Math.max(startIndex, 0), slides.length - 1));

    if (pswpRef.current) {
      suppressCloseRef.current = true;
      try {
        pswpRef.current.destroy();
      } catch {
        /* ignore */
      }
      pswpRef.current = null;
      suppressCloseRef.current = false;
    }

    const run = async () => {
      const sizes = await Promise.all(slides.map((s) => loadNaturalSize(s.src)));
      if (cancelled) return;

      const data: PswpSlide[] = slides.map((s, i) => ({
        src: s.src,
        alt: s.alt,
        width: sizes[i]?.width || FALLBACK_W,
        height: sizes[i]?.height || FALLBACK_H,
      }));

      const initial = Math.min(Math.max(startIndex, 0), data.length - 1);

      const options: PhotoSwipeOptions = {
        dataSource: data,
        index: initial,
        mainClass: 'pswp-inbox',
        bgOpacity: 1,
        showHideAnimationType: 'none',
        pinchToClose: false,
        closeOnVerticalDrag: false,
        tapAction: false,
        doubleTapAction: 'zoom',
        initialZoomLevel: (z) => containZoom(z),
        secondaryZoomLevel: (z) => containZoom(z) * 2.5,
        maxZoomLevel: (z) => Math.max(4, containZoom(z) * 4),
        padding: { top: 56, bottom: 72, left: 0, right: 0 },
        preload: [1, 1],
        zoom: false,
        close: false,
        arrowPrev: false,
        arrowNext: false,
        counter: false,
      };

      const pswp = new PhotoSwipe(options);
      pswpRef.current = pswp;

      const syncFit = () => {
        if (cancelled) return;
        const el = pswp.currSlide?.content?.element;
        if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
          applyRealSizeAndFit(pswp, pswp.currIndex, el.naturalWidth, el.naturalHeight, {
            forceFit: true,
          });
          setReady(true);
        }
      };

      pswp.on('change', () => {
        setIndex(pswp.currIndex);
        const el = pswp.currSlide?.content?.element;
        if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
          applyRealSizeAndFit(pswp, pswp.currIndex, el.naturalWidth, el.naturalHeight, {
            forceFit: true,
          });
          setReady(true);
        } else {
          setReady(false);
          requestAnimationFrame(syncFit);
        }
      });

      pswp.on('loadComplete', (e) => {
        if (cancelled || e.isError) return;
        const el = e.content?.element;
        if (el instanceof HTMLImageElement && el.naturalWidth > 0) {
          applyRealSizeAndFit(pswp, e.slide.index, el.naturalWidth, el.naturalHeight);
        }
        if (e.slide.index === pswp.currIndex) setReady(true);
      });

      pswp.on('close', () => {
        setReady(false);
        scrubPswp();
        if (suppressCloseRef.current) return;
        onCloseRef.current();
      });

      pswp.on('destroy', () => {
        if (pswpRef.current === pswp) pswpRef.current = null;
        setReady(false);
        scrubPswp();
      });

      pswp.init();
      setIndex(pswp.currIndex);
      requestAnimationFrame(syncFit);
    };

    void run();

    return () => {
      cancelled = true;
      setReady(false);
      if (pswpRef.current) {
        suppressCloseRef.current = true;
        try {
          pswpRef.current.destroy();
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
        suppressCloseRef.current = false;
      }
      scrubPswp();
    };
  }, [sessionKey, slides, startIndex]);

  const handleClose = () => {
    const pswp = pswpRef.current;
    if (pswp) {
      try {
        pswp.close();
      } catch {
        scrubPswp();
        onClose();
        return;
      }
      window.setTimeout(() => {
        suppressCloseRef.current = true;
        try {
          pswp.destroy();
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
        suppressCloseRef.current = false;
        scrubPswp();
        onClose();
      }, 80);
      return;
    }
    scrubPswp();
    onClose();
  };

  const goPrev = () => pswpRef.current?.prev();
  const goNext = () => pswpRef.current?.next();

  if (!open || typeof document === 'undefined' || slides.length === 0) return null;

  const current = slides[index] || slides[0];
  const hasNav = slides.length > 1;

  return createPortal(
    <>
      <style>{PSWP_CSS}</style>
      <div
        className="pointer-events-none fixed inset-0 z-[10000] flex flex-col"
        style={{ touchAction: 'none' }}
      >
        <header
          className="pointer-events-auto flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#111b21] px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-10 w-10 shrink-0 text-[#aebac1] hover:bg-white/10 hover:text-white"
            onClick={handleClose}
            aria-label="Close photo"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#e9edef]">
              {current?.alt || 'Photo'}
            </p>
            {hasNav ? (
              <p className="text-xs text-[#8696a0]">
                {index + 1} / {slides.length}
              </p>
            ) : null}
          </div>
          {onDownload ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 shrink-0 text-[#aebac1] hover:bg-white/10 hover:text-white"
              onClick={() => onDownload(index)}
              aria-label="Download photo"
            >
              <Download className="h-5 w-5" />
            </Button>
          ) : null}
        </header>

        {!ready ? (
          <div className="pointer-events-none flex flex-1 items-center justify-center bg-[#0b141a]">
            <Loader2 className="h-8 w-8 animate-spin text-[#8696a0]" />
          </div>
        ) : null}

        {ready && hasNav ? (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              className="pointer-events-auto absolute left-2 top-1/2 z-[10002] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white active:bg-black/75 sm:left-4"
              style={{ top: 'calc(50% + 24px)' }}
              onClick={() => goPrev()}
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              className="pointer-events-auto absolute right-2 top-1/2 z-[10002] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white active:bg-black/75 sm:right-4"
              style={{ top: 'calc(50% + 24px)' }}
              onClick={() => goNext()}
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        ) : null}

        {ready ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-[max(4.5rem,env(safe-area-inset-bottom))] text-center text-[11px] text-white/55">
            Pinch or double-tap to zoom
            {hasNav ? ' · Swipe for more' : ''}
          </p>
        ) : null}

        {ready && onDownload ? (
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center px-4"
            style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <Button
              type="button"
              size="sm"
              className="pointer-events-auto bg-[#00a884] text-white hover:bg-[#06cf9c]"
              onClick={() => onDownload(index)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        ) : null}
      </div>
    </>,
    document.body
  );
}
