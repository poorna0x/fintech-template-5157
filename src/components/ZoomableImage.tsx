import React from 'react';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * @deprecated Photo zoom now uses PhotoSwipe in PhotoViewerDialog.
 * Kept as a plain contained image for any leftover imports.
 */
export function ZoomableImage({ src, alt = '', className, onError }: ZoomableImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={className ?? 'max-h-full max-w-full select-none object-contain'}
      onError={onError}
    />
  );
}

export default ZoomableImage;
