import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** A4 width at 96dpi — keep document readable on mobile via horizontal scroll. */
const PREVIEW_PAGE_WIDTH_PX = 794;

/** Desktop only: stretch preview to dialog width. */
const PREVIEW_FIT_DESKTOP_CSS = `
  @media (min-width: 640px) {
    html {
      background: #f8fafc;
      overflow-x: hidden;
    }
    body {
      width: 100% !important;
      max-width: 100% !important;
      min-height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .bill-container {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 14mm 12mm !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
  }
`;

/** Mobile: natural page width — scroll horizontally instead of squashing text. */
const PREVIEW_MOBILE_CSS = `
  @media (max-width: 639px) {
    html {
      background: #f8fafc;
    }
    body {
      width: ${PREVIEW_PAGE_WIDTH_PX}px !important;
      max-width: ${PREVIEW_PAGE_WIDTH_PX}px !important;
      min-height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .bill-container {
      box-shadow: none !important;
      border-radius: 0 !important;
    }
  }
`;

type DocumentHtmlPreviewProps = {
  html: string;
  title: string;
  className?: string;
  fillHeight?: boolean;
};

/** Local HTML document preview — same template as PDF export, no server call. */
export default function DocumentHtmlPreview({
  html,
  title,
  className,
  fillHeight = false,
}: DocumentHtmlPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    if (fillHeight) {
      const style = doc.createElement('style');
      style.textContent = `${PREVIEW_MOBILE_CSS}\n${PREVIEW_FIT_DESKTOP_CSS}`;
      doc.head?.appendChild(style);
    }
  }, [html, fillHeight]);

  if (fillHeight) {
    return (
      <div className={cn('min-h-0', className)}>
        <div className="overflow-x-auto overflow-y-visible sm:overflow-x-hidden">
          <iframe
            ref={iframeRef}
            title={title}
            className="block min-h-[70vh] shrink-0 rounded-md border border-slate-300/80 bg-white shadow-sm w-[794px] max-w-none sm:w-full sm:max-w-full"
            sandbox="allow-same-origin"
          />
        </div>
        <p className="mt-1.5 text-center text-[11px] text-slate-500 sm:hidden">
          Swipe left/right to read the full page
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-slate-100/60 p-2 sm:overflow-x-hidden sm:p-3">
        <iframe
          ref={iframeRef}
          title={title}
          className="mx-auto block shrink-0 rounded-md border border-slate-300/80 bg-white shadow-lg w-[794px] max-w-none sm:w-full sm:max-w-[820px]"
          style={{ minHeight: 'min(1120px, 78vh)' }}
          sandbox="allow-same-origin"
        />
      </div>
      <p className="mt-1.5 text-center text-[11px] text-slate-500 sm:hidden">
        Swipe left/right to read the full page
      </p>
    </div>
  );
}
