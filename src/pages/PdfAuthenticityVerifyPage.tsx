import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  FileWarning,
  Hash,
  Loader2,
  ShieldCheck,
  Upload,
  X,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  formatBytes,
  normalizeVerifyCodeInput,
  resolvePdfAuthenticityByVerifyCode,
  verifyPdfFileAuthenticity,
  type PdfAuthenticityHit,
  type PdfAuthenticityResolve,
} from '@/lib/pdfAuthenticityVerify';

type Props = {
  hideHeader?: boolean;
  onBack?: () => void;
};

function HitDetails({ hit }: { hit: PdfAuthenticityHit }) {
  const row = hit.row;
  return (
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide opacity-60">Type</dt>
        <dd className="font-medium">{hit.typeLabel}</dd>
      </div>
      {hit.customerName && (
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide opacity-60">Customer</dt>
          <dd className="font-medium break-words">{hit.customerName}</dd>
        </div>
      )}
      {hit.kind === 'amc' && row.agreement_number && (
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide opacity-60">Agreement</dt>
          <dd className="font-medium break-all">{row.agreement_number}</dd>
        </div>
      )}
      {hit.kind === 'document' && row.document_ref && (
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide opacity-60">Reference</dt>
          <dd className="font-medium break-all">{row.document_ref}</dd>
        </div>
      )}
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide opacity-60">Verify code</dt>
        <dd className="font-mono tracking-wider font-semibold">{row.verify_code}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide opacity-60">Generated on</dt>
        <dd className="font-medium">{row.generated_on}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide opacity-60">PDF size</dt>
        <dd className="font-medium">{formatBytes(row.pdf_byte_length)}</dd>
      </div>
      {row.pdf_filename && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide opacity-60">Filename</dt>
          <dd className="font-medium break-all">{row.pdf_filename}</dd>
        </div>
      )}
      <div className="sm:col-span-2">
        <dt className="text-xs font-medium uppercase tracking-wide opacity-60">SHA-256</dt>
        <dd className="mt-0.5 break-all font-mono text-[11px] sm:text-xs leading-relaxed opacity-90">
          {row.sha256_hex}
        </dd>
      </div>
    </dl>
  );
}

export default function PdfAuthenticityVerifyPage({ hideHeader, onBack }: Props) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastHash, setLastHash] = useState<string | null>(null);
  const [result, setResult] = useState<PdfAuthenticityResolve | null>(null);
  const dragDepth = useRef(0);

  const resetResults = useCallback(() => {
    setResult(null);
    setLastHash(null);
  }, []);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    resetResults();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [resetResults]);

  const runFileVerify = useCallback(async (file: File) => {
    setSelectedFile(file);
    setBusy(true);
    resetResults();
    try {
      const resolved = await verifyPdfFileAuthenticity(file);
      if (resolved.sha256Hex) setLastHash(resolved.sha256Hex);
      setResult(resolved);
    } finally {
      setBusy(false);
    }
  }, [resetResults]);

  const onPickFiles = useCallback(
    (list: FileList | File[] | null) => {
      const file = list?.[0];
      if (!file) return;
      void runFileVerify(file);
    },
    [runFileVerify]
  );

  const handleVerifyCode = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await resolvePdfAuthenticityByVerifyCode(verifyCode));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (items && items.length > 0 && items[0]?.type.includes('pdf')) {
        e.preventDefault();
        void runFileVerify(items[0]!);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [runFileVerify]);

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    onPickFiles(e.dataTransfer.files);
  };

  const codeReady = normalizeVerifyCodeInput(verifyCode).length === 8;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {!hideHeader && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              Verify PDF authenticity
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              AMC, bills, quotations, invoices &amp; warranty cards
            </p>
          </div>
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
        </div>
      )}

      <div className="space-y-5 sm:space-y-6">
        <section
          className={cn(
            'relative rounded-2xl border-2 border-dashed transition-colors duration-200',
            'bg-gradient-to-b from-emerald-50/80 to-white',
            dragging
              ? 'border-emerald-500 bg-emerald-50 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)]'
              : 'border-emerald-200/80 hover:border-emerald-400',
            busy && 'pointer-events-none opacity-80'
          )}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              onPickFiles(e.target.files);
              // allow re-selecting the same file
              e.target.value = '';
            }}
          />

          <label
            htmlFor={inputId}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 px-4 py-10 sm:py-14 text-center',
              'touch-manipulation focus-within:outline-none'
            )}
          >
            <div
              className={cn(
                'flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl',
                'bg-emerald-600 text-white shadow-sm transition-transform duration-200',
                dragging && 'scale-105'
              )}
            >
              {busy ? (
                <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-7 w-7" aria-hidden />
              )}
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-base sm:text-lg font-semibold text-foreground">
                {dragging ? 'Drop PDF to verify' : 'Drag & drop PDF here'}
              </p>
              <p className="text-sm text-muted-foreground">
                or tap to browse · paste from clipboard on desktop
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              AMC · Bill · Quotation · Invoice · Warranty
            </span>
          </label>
        </section>

        {selectedFile && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 sm:px-4">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 cursor-pointer"
              disabled={busy}
              onClick={clearFile}
              aria-label="Clear file"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="relative flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            or enter code
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
          <Label htmlFor="pdf-verify-code" className="text-sm font-medium">
            Footer verify code
          </Label>
          <p className="mt-1 text-xs text-muted-foreground mb-3">
            8 characters from the PDF footer — confirms the code was issued; upload the file to prove
            it was not edited.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="pdf-verify-code"
              value={verifyCode}
              onChange={(e) => setVerifyCode(normalizeVerifyCodeInput(e.target.value).slice(0, 8))}
              placeholder="AB12CD34"
              maxLength={8}
              disabled={busy}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="h-11 font-mono text-base tracking-[0.2em] sm:tracking-[0.28em] uppercase"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && codeReady && !busy) void handleVerifyCode();
              }}
            />
            <Button
              type="button"
              className="h-11 w-full sm:w-auto shrink-0 cursor-pointer bg-emerald-600 hover:bg-emerald-700"
              disabled={busy || !codeReady}
              onClick={() => void handleVerifyCode()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
            </Button>
          </div>
        </section>

        {lastHash && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Hash className="h-3.5 w-3.5" />
              File SHA-256
            </div>
            <code className="block break-all text-[11px] sm:text-xs text-foreground/90 leading-relaxed">
              {lastHash}
            </code>
          </div>
        )}

        {result && (
          <div
            role="status"
            className={cn(
              'rounded-2xl border p-4 sm:p-5 text-sm transition-colors',
              result.status === 'match' &&
                'border-emerald-200 bg-emerald-50 text-emerald-950',
              result.status === 'code_found' && 'border-sky-200 bg-sky-50 text-sky-950',
              result.status === 'unknown' && 'border-amber-200 bg-amber-50 text-amber-950',
              result.status === 'error' && 'border-red-200 bg-red-50 text-red-950'
            )}
          >
            {result.status === 'match' && (
              <>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-base">Authentic — fingerprint matches</p>
                    <p className="mt-0.5 text-xs opacity-80">
                      This is the exact PDF bytes issued from CRM.
                    </p>
                  </div>
                </div>
                <HitDetails hit={result.hit} />
              </>
            )}
            {result.status === 'code_found' && (
              <>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                  <div>
                    <p className="font-semibold text-base">Code found in CRM</p>
                    <p className="mt-0.5 text-xs opacity-80">
                      Upload the PDF to confirm the file itself was not edited.
                    </p>
                  </div>
                </div>
                <HitDetails hit={result.hit} />
              </>
            )}
            {result.status === 'unknown' && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-base">Not verified</p>
                  <p className="mt-1 opacity-90">{result.message}</p>
                </div>
              </div>
            )}
            {result.status === 'error' && (
              <div className="flex items-start gap-2">
                <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <p className="font-semibold text-base">Could not verify</p>
                  <p className="mt-1 opacity-90">{result.message}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground leading-relaxed px-0.5 pb-2">
          Tip: use the PDF from Download / Email / WhatsApp. Browser Print → Save as PDF creates
          different bytes and will not match.
        </p>
      </div>
    </div>
  );
}
