import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export type ZoomableImageHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

/**
 * Pinch / double-tap / wheel zoom — restored from the Jul 17 working approach
 * (react-zoom-pan-pinch) with the Jul 19 delayed centerView for iOS.
 * Do not add custom Touch/Pointer gesture layers on top of the library.
 */
export const ZoomableImage = forwardRef<ZoomableImageHandle, ZoomableImageProps>(
  function ZoomableImage({ src, alt = '', className, onError }, ref) {
    const apiRef = useRef<ReactZoomPanPinchRef | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => apiRef.current?.zoomIn(0.35, 200, 'easeOut'),
        zoomOut: () => apiRef.current?.zoomOut(0.35, 200, 'easeOut'),
        reset: () => apiRef.current?.resetTransform(200, 'easeOut'),
      }),
      [],
    );

    const handleInit = useCallback((api: ReactZoomPanPinchRef) => {
      apiRef.current = api;
      // Wait for layout + image decode (iOS Safari 0×0 center bug)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            api.centerView(1, 0);
          } catch {
            /* unmounted */
          }
        });
      });
    }, []);

    return (
      <div className="h-full w-full min-h-0 min-w-0" style={{ touchAction: 'none' }}>
        <TransformWrapper
          key={src}
          initialScale={1}
          minScale={1}
          maxScale={5}
          centerOnInit={false}
          onInit={handleInit}
          doubleClick={{ mode: 'toggle', step: 1.8 }}
          wheel={{ step: 0.12 }}
          pinch={{ step: 5 }}
          panning={{ velocityDisabled: true }}
          limitToBounds
          disablePadding
        >
          <TransformComponent
            wrapperStyle={{
              width: '100%',
              height: '100%',
              cursor: 'grab',
              touchAction: 'none',
            }}
            contentStyle={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={src}
              alt={alt}
              draggable={false}
              className={
                className ??
                'max-h-[100dvh] max-w-[100vw] select-none object-contain'
              }
              onError={onError}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    );
  },
);

export default ZoomableImage;
