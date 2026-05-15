import React from 'react';
import { BRAND_FULL_LOGO_SRC, getBrandWordmarkParts } from '@/lib/brand-logo-markup';
import { DocumentBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import { cn } from '@/lib/utils';

interface DocumentBrandLogoProps {
  brand: DocumentBrand;
  className?: string;
}

/** Same horizontal logo as fulllogo.webp — Hydrogen uses full image, Eleven swaps the wordmark text only. */
export default function DocumentBrandLogo({ brand, className }: DocumentBrandLogoProps) {
  if (brand === 'hydrogenro') {
    return (
      <img
        src={BRAND_FULL_LOGO_SRC}
        alt={getDocumentBrandLabel(brand)}
        className={cn('h-12 sm:h-14 w-auto max-w-[200px] max-h-[60px] object-contain', className)}
      />
    );
  }

  const { primary, accent } = getBrandWordmarkParts(brand);

  return (
    <div
      className={cn(
        'inline-flex flex-row items-center justify-center gap-2.5 max-w-[200px] max-h-[60px] mx-auto',
        className
      )}
    >
      <div className="h-[52px] w-[52px] shrink-0 overflow-hidden flex items-center">
        <img
          src={BRAND_FULL_LOGO_SRC}
          alt=""
          className="h-[52px] w-auto min-w-[160px] max-w-none object-cover object-left block"
        />
      </div>
      <span
        className="font-[Poppins,sans-serif] text-[22px] sm:text-2xl font-bold leading-none whitespace-nowrap text-[#2d3748]"
      >
        {primary}
        <span className="text-[#0ea5e9]">{accent}</span>
      </span>
    </div>
  );
}
