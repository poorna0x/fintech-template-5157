import React, { useEffect, useRef } from 'react';
import PhotoSwipe, { type PhotoSwipeOptions } from 'photoswipe';
import 'photoswipe/style.css';

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

function loadSlide(src: string, alt: string): Promise<Slide> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        src,
        width: img.naturalWidth || 1600,
        height: img.naturalHeight || 1200,
        alt,
      });
    };
    img.onerror = () => {
      resolve({ src, width: 1600, height: 1200, alt });
    };
    img.src = src;
  });
}

/**
 * Fullscreen photo viewer powered by PhotoSwipe (pinch / double-tap / pan).
 * Same black lightbox feel — no custom +/- controls.
 * Custom gesture code kept failing in APK WebView + PWA; PhotoSwipe owns touch.
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
}) => {
  const pswpRef = useRef<PhotoSwipe | null>(null);
  const closingFromPsRef = useRef(false);
  // Stable callbacks without re-opening on every parent render
  const onCloseRef = useRef(onClose);
  const onPreviousRef = useRef(onPrevious);
  const onNextRef = useRef(onNext);
  const onDownloadRef = useRef(onDownload);
  onCloseRef.current = onClose;
  onPreviousRef.current = onPrevious;
  onNextRef.current = onNext;
  onDownloadRef.current = onDownload;

  useEffect(() => {
    if (!open || !selectedPhoto?.url) return;

    let cancelled = false;
    const urls = resolveUrls(selectedPhoto, selectedBillPhotos, selectedJobPhotos);
    if (urls.length === 0) return;

    // If parent is driving a multi-photo set but only passed one URL, keep index 0
    // and use custom arrows that call onPrevious/onNext.
    const parentDrivenNav = urls.length === 1 && selectedPhoto.total > 1;
    const startIndex = parentDrivenNav
      ? 0
      : Math.min(Math.max(selectedPhoto.index, 0), urls.length - 1);

    const openViewer = async () => {
      const slides = await Promise.all(
        urls.map((url, i) => loadSlide(url, `Photo ${i + 1}`)),
      );
      if (cancelled) return;

      // Tear down any previous instance before opening a new one
      if (pswpRef.current) {
        try {
          pswpRef.current.destroy();
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
      }

      const options: PhotoSwipeOptions = {
        dataSource: slides,
        index: startIndex,
        bgOpacity: 1,
        showHideAnimationType: 'fade',
        pinchToClose: false,
        closeOnVerticalDrag: false,
        tapAction: 'toggle-controls',
        doubleTapAction: 'zoom',
        secondaryZoomLevel: 2.5,
        maxZoomLevel: 4,
        initialZoomLevel: 'fit',
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        // No +/- zoom control — pinch / double-tap only (user request)
        zoom: false,
        // Hide PS arrows when parent drives navigation with a single-slide source
        arrowPrev: !parentDrivenNav && urls.length > 1,
        arrowNext: !parentDrivenNav && urls.length > 1,
        counter: urls.length > 1 || parentDrivenNav,
      };

      const pswp = new PhotoSwipe(options);
      pswpRef.current = pswp;

      pswp.on('uiRegister', () => {
        if (showDownload) {
          pswp.ui?.registerElement({
            name: 'hroDownload',
            order: 9,
            isButton: true,
            tagName: 'button',
            title: 'Download',
            html: {
              isCustomSVG: true,
              inner:
                '<path d="M20.5 14.3v4.2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 3.5v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
              outlineID: 'pswp-hro-download',
            },
            onClick: () => {
              const slide = pswp.currSlide;
              const src = slide?.data?.src;
              if (typeof src === 'string') {
                onDownloadRef.current(src, pswp.currIndex);
              }
            },
          });
        }

        if (parentDrivenNav) {
          pswp.ui?.registerElement({
            name: 'hroPrev',
            className: 'pswp__button--arrow--prev',
            order: 10,
            isButton: true,
            appendTo: 'root',
            html: {
              isCustomSVG: true,
              inner: '<path d="M20 5.5 9 12l11 6.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
              outlineID: 'pswp-hro-prev',
            },
            onClick: () => onPreviousRef.current(),
          });
          pswp.ui?.registerElement({
            name: 'hroNext',
            className: 'pswp__button--arrow--next',
            order: 11,
            isButton: true,
            appendTo: 'root',
            html: {
              isCustomSVG: true,
              inner: '<path d="M4 5.5 15 12 4 18.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
              outlineID: 'pswp-hro-next',
            },
            onClick: () => onNextRef.current(),
          });
        }
      });

      pswp.on('close', () => {
        closingFromPsRef.current = true;
        onCloseRef.current();
      });

      pswp.on('destroy', () => {
        if (pswpRef.current === pswp) pswpRef.current = null;
      });

      pswp.init();

      // Parent-driven counter: "3 / 10"
      if (parentDrivenNav && pswp.counterElement) {
        pswp.counterElement.textContent = `${selectedPhoto.index + 1} / ${selectedPhoto.total}`;
      }
    };

    void openViewer();

    return () => {
      cancelled = true;
      if (pswpRef.current) {
        try {
          // If parent closed us, destroy without re-entering onClose
          if (!closingFromPsRef.current) {
            pswpRef.current.destroy();
          } else {
            pswpRef.current.destroy();
          }
        } catch {
          /* ignore */
        }
        pswpRef.current = null;
      }
      closingFromPsRef.current = false;
    };
    // Re-open when the active photo URL changes (parent-driven prev/next)
  }, [
    open,
    selectedPhoto?.url,
    selectedPhoto?.index,
    selectedPhoto?.total,
    selectedBillPhotos,
    selectedJobPhotos,
    showDownload,
  ]);

  // PhotoSwipe renders its own portal/DOM — nothing for React to paint.
  return null;
};

export default PhotoViewerDialog;
