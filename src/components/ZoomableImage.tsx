import React from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * Pinch / double-tap / wheel zoom for photo viewers.
 * Wrapper is sized to its parent (viewport stage) — never grows the dialog,
 * which broke iPhone layout when combined with Radix translate centering.
 */
export function ZoomableImage({ src, alt = '', className, onError }: ZoomableImageProps) {
  return (
    <TransformWrapper
      key={src}
      initialScale={1}
      minScale={1}
      maxScale={5}
      centerOnInit
      doubleClick={{ mode: 'toggle', step: 1.8 }}
      wheel={{ step: 0.12 }}
      pinch={{ step: 8 }}
      panning={{ velocityDisabled: true }}
      limitToBounds
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
