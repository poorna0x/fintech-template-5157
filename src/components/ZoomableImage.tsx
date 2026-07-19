import React, { useCallback } from 'react';
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

/**
 * Pinch / double-tap / wheel zoom for photo viewers.
 * Fills the parent stage only — never grows the dialog. Delayed centerView
 * avoids iOS Safari centering before layout (which shoved the image sideways).
 */
export function ZoomableImage({ src, alt = '', className, onError }: ZoomableImageProps) {
  const handleInit = useCallback((ref: ReactZoomPanPinchRef) => {
    // Wait for layout + image decode so center isn't computed against 0×0 on iOS
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          ref.centerView(1, 0);
        } catch {
          /* ignore if unmounted */
        }
      });
    });
  }, []);

  return (
    <TransformWrapper
      key={src}
      initialScale={1}
      minScale={1}
      maxScale={5}
      centerOnInit={false}
      onInit={handleInit}
      doubleClick={{ mode: 'toggle', step: 1.8 }}
      wheel={{ step: 0.12 }}
      pinch={{ step: 8 }}
      panning={{ velocityDisabled: true }}
      limitToBounds
      disablePadding
      autoAlignment={{ disabled: true }}
      velocityAnimation={{ disabled: true }}
    >
      <TransformComponent
        wrapperClass="!h-full !w-full !max-h-full !max-w-full overflow-hidden"
        contentClass="!flex !h-full !w-full !max-h-full !max-w-full items-center justify-center"
        wrapperStyle={{
          width: '100%',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          cursor: 'grab',
          touchAction: 'none',
        }}
        contentStyle={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={className ?? 'max-h-full max-w-full select-none object-contain'}
          onError={onError}
        />
      </TransformComponent>
    </TransformWrapper>
  );
}

export default ZoomableImage;
