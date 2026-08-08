import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isR2MediaRef } from '@/lib/whatsappInbox';
import { fetchWhatsAppR2MediaBytes } from '@/lib/sendAdminWhatsAppApi';

type Props = {
  messageId: string;
  mediaUrl: string;
  filename?: string | null;
  className?: string;
  onOpen: () => void;
};

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfJs() {
  if (!pdfjsReady) {
    pdfjsReady = (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return pdfjs;
    })();
  }
  return pdfjsReady;
}

/**
 * First-page PDF thumbnail for inbox bubbles (R2 via same-origin proxy / https).
 */
export function WhatsAppPdfThumbnail({
  messageId,
  mediaUrl,
  filename,
  className,
  onOpen,
}: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setFailed(false);
      try {
        let pdfSource: { url?: string; data?: Uint8Array };

        if (isR2MediaRef(mediaUrl) || mediaUrl.startsWith('whatsapp-media:')) {
          const fetched = await fetchWhatsAppR2MediaBytes({
            mediaUrl,
            messageId,
          });
          if (!fetched.ok) throw new Error(fetched.error || 'media');
          if (fetched.bytes) {
            pdfSource = { data: new Uint8Array(fetched.bytes) };
          } else if (fetched.url) {
            pdfSource = { url: fetched.url };
          } else {
            throw new Error('no media bytes');
          }
        } else if (/^https:\/\//i.test(mediaUrl)) {
          pdfSource = { url: mediaUrl };
        } else {
          throw new Error('unsupported media');
        }

        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({
          ...pdfSource,
          withCredentials: false,
        }).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const targetW = 220;
        const scale = targetW / viewport.width;
        const scaled = page.getViewport({ scale: Math.min(Math.max(scale, 0.5), 1.5) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(scaled.width);
        canvas.height = Math.floor(scaled.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        if (!cancelled) setThumbUrl(dataUrl);
        await doc.destroy();
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [messageId, mediaUrl]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'mb-1 block w-full min-w-[180px] max-w-[240px] overflow-hidden rounded-md border border-slate-200/80 bg-white text-left shadow-sm transition hover:brightness-[0.98]',
        className
      )}
    >
      <div className="relative flex min-h-[140px] items-center justify-center bg-slate-100">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        ) : thumbUrl ? (
          <img
            src={thumbUrl}
            alt={filename || 'PDF preview'}
            className="max-h-52 w-full object-cover object-top"
          />
        ) : (
          <span className="flex flex-col items-center gap-1 px-3 py-6 text-slate-500">
            <FileText className="h-10 w-10 text-red-500" />
            <span className="text-[11px]">{failed ? 'Preview unavailable' : 'PDF'}</span>
          </span>
        )}
        <span className="absolute bottom-1.5 right-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          PDF
        </span>
      </div>
      <div className="truncate border-t border-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-800">
        {filename || 'Document.pdf'}
      </div>
    </button>
  );
}
