import React, { useEffect, useState } from 'react';
import { resolveSensitiveMediaUrl, isSensitiveMediaUrl } from '@/lib/sensitiveMediaUrl';

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string | null | undefined;
};

/** Renders Cloudinary payment/bill images via short-lived signed URLs when logged in. */
export function SensitiveMediaImage({ src, alt, ...rest }: Props) {
  const [displaySrc, setDisplaySrc] = useState<string | undefined>(
    src && !isSensitiveMediaUrl(src) ? src : undefined
  );

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      setDisplaySrc(undefined);
      return;
    }
    if (!isSensitiveMediaUrl(src)) {
      setDisplaySrc(src);
      return;
    }
    void resolveSensitiveMediaUrl(src).then((resolved) => {
      if (!cancelled) setDisplaySrc(resolved || undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!displaySrc) {
    return (
      <div
        className={rest.className}
        style={{ ...rest.style, minHeight: 48, background: 'var(--muted, #f3f4f6)' }}
        aria-hidden
      />
    );
  }

  return <img {...rest} src={displaySrc} alt={alt ?? ''} />;
}
