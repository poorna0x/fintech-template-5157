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
 * Keeps global viewport user-scalable=no (page layout safe) while restoring
 * in-image zoom that mobile used to get from the browser.
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
        wrapperStyle={{
          width: '100%',
          height: '100%',
          maxHeight: '90vh',
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
          className={className ?? 'max-w-full max-h-[90vh] object-contain select-none'}
          onError={onError}
        />
      </TransformComponent>
    </TransformWrapper>
  );
}

export default ZoomableImage;
