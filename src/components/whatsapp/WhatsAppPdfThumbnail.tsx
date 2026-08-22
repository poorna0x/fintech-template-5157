import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWhatsAppMediaBytesCached } from '@/lib/sendAdminWhatsAppApi';
import { isR2MediaRef } from '@/lib/whatsappInbox';
import { whatsappDocumentTypeLabel } from '@/lib/whatsappDocumentLabel';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type Props = {
  messageId: string;
  mediaUrl: string;
  filename?: string | null;
  mediaMime?: string | null;
  className?: string;
  onOpen: () => void;
  onDownload?: () => void;
};

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfJs() {
  if (!pdfjsReady) {
    pdfjsReady = (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdfjs;
    })();
  }
  return pdfjsReady;
}

async function loadPdfBytes(
  messageId: string,
  mediaUrl: string
): Promise<Uint8Array> {
  if (isR2MediaRef(mediaUrl) || mediaUrl.startsWith('whatsapp-media:') || /^https:\/\//i.test(mediaUrl)) {
    const fetched = await getWhatsAppMediaBytesCached({ mediaUrl, messageId });
    if (!fetched.ok) throw new Error(fetched.error || 'media');
    if (fetched.bytes) {
      // Copy — pdf.js may transfer/detach the buffer
      return new Uint8Array(fetched.bytes.slice(0));
    }
    if (fetched.url) {
      const res = await fetch(fetched.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }
    throw new Error('no media bytes');
  }

  throw new Error('unsupported media');
}

/** Compact WhatsApp-style file row (icon + name) — used for non-PDF docs and PDF fallback. */
export function WhatsAppDocumentFileCard({
  filename,
  mediaMime,
  loading,
  className,
  tone = 'light',
  onOpen,
  onDownload,
}: {
  filename?: string | null;
  mediaMime?: string | null;
  loading?: boolean;
  className?: string;
  /** Outbound/failed bubbles are dark; inbound PDF preview area is light. */
  tone?: 'light' | 'dark';
  onOpen: () => void;
  onDownload?: () => void;
}) {
  const typeLabel = whatsappDocumentTypeLabel(filename, mediaMime);
  const label = filename || `Document.${typeLabel.toLowerCase()}`;
  const dark = tone === 'dark';
  return (
    <div
      className={cn(
        'mb-1 flex w-full min-w-[200px] max-w-[280px] items-center gap-2 rounded-md px-2 py-2',
        dark ? 'bg-black/20' : 'bg-black/[0.04]',
        className
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
      >
        <span
          className={cn(
            'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md',
            dark ? 'bg-red-500/20 text-red-300' : 'bg-[#e53935]/10 text-[#e53935]'
          )}
        >
          {loading ? (
            <Loader2 className={cn('h-5 w-5 animate-spin', dark ? 'text-[#8696a0]' : 'text-[#8696a0]')} />
          ) : (
            <FileText className="h-6 w-6" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm font-medium',
              dark ? 'text-[#e9edef]' : 'text-[#111b21]'
            )}
          >
            {label}
          </span>
          <span className={cn('text-[11px]', dark ? 'text-[#8696a0]' : 'text-[#667781]')}>
            {loading ? 'Loading preview…' : `${typeLabel} · Tap to open`}
          </span>
        </span>
      </button>
      {onDownload && !loading ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className={cn(
            'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition',
            dark ? 'text-[#8696a0] hover:bg-white/5' : 'text-[#54656f] hover:bg-black/5'
          )}
          title="Download"
          aria-label={`Download ${typeLabel}`}
        >
          <Download className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * First-page PDF thumbnail when in viewport; otherwise compact file card (no eager download).
 */
export function WhatsAppPdfThumbnail({
  messageId,
  mediaUrl,
  filename,
  mediaMime,
  className,
  onOpen,
  onDownload,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin: '120px 0px', threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setThumbUrl(null);
      try {
        const data = await Promise.race([
          loadPdfBytes(messageId, mediaUrl),
          new Promise<Uint8Array>((_, reject) => {
            window.setTimeout(() => reject(new Error('PDF load timeout')), 25000);
          }),
        ]);
        if (cancelled) return;

        const pdfjs = await loadPdfJs();
        if (cancelled) return;

        const doc = await pdfjs.getDocument({
          data,
          disableRange: true,
          disableStream: true,
          withCredentials: false,
        }).promise;

        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const targetW = 220;
        const scale = Math.min(Math.max(targetW / base.width, 0.45), 1.4);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('no canvas');

        await page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        }).promise;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        if (!cancelled) setThumbUrl(dataUrl);
        await doc.destroy();
      } catch {
        if (!cancelled) setThumbUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [visible, messageId, mediaUrl]);

  if (!visible || loading || !thumbUrl) {
    return (
      <div ref={rootRef}>
        <WhatsAppDocumentFileCard
          filename={filename}
          mediaMime={mediaMime || 'application/pdf'}
          loading={visible && loading}
          className={className}
          onOpen={onOpen}
          onDownload={onDownload}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'mb-1 w-full min-w-[180px] max-w-[240px] overflow-hidden rounded-md bg-[#f0f2f5]',
        className
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full cursor-pointer text-left transition hover:brightness-[0.97]"
      >
        <div className="relative bg-[#e9edef]">
          <img
            src={thumbUrl}
            alt={filename || 'PDF preview'}
            className="max-h-52 w-full object-cover object-top"
            loading="lazy"
          />
          <span className="absolute bottom-1.5 left-1.5 rounded bg-[#e53935] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            PDF
          </span>
        </div>
      </button>
      <div className="flex items-center gap-1 border-t border-black/5 px-2 py-1.5">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left text-xs font-medium text-[#111b21] hover:underline"
        >
          {filename || 'Document.pdf'}
        </button>
        {onDownload ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
            title="Download"
            aria-label="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
