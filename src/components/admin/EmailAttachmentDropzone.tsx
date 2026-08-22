import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  EMAIL_ATTACHMENT_ACCEPT,
  EMAIL_ATTACHMENT_MAX_BYTES,
  EMAIL_ATTACHMENT_MAX_COUNT,
  EMAIL_ATTACHMENT_TYPES_LABEL,
  fileToEmailAttachment,
  formatAttachmentSize,
  isAllowedEmailAttachment,
  type EmailAttachmentItem,
} from '@/lib/admin-email-attachments';

interface EmailAttachmentDropzoneProps {
  attachments: EmailAttachmentItem[];
  onChange: (attachments: EmailAttachmentItem[]) => void;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

type UploadRow =
  | { kind: 'uploading'; id: string; filename: string; size: number }
  | { kind: 'error'; id: string; filename: string; size: number; errorMessage: string };

function attachmentIcon(contentType: string, filename = '') {
  const mime = (contentType || '').toLowerCase();
  const name = filename.toLowerCase();
  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(name)) {
    return <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />;
  }
  if (
    mime.includes('sheet') ||
    mime.includes('excel') ||
    mime === 'text/csv' ||
    /\.(xlsx?|csv)$/i.test(name)
  ) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />;
  }
  return <FileText className="w-4 h-4 text-red-600 shrink-0" />;
}

export default function EmailAttachmentDropzone({
  attachments,
  onChange,
  disabled = false,
  onUploadingChange,
}: EmailAttachmentDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);

  const totalReadyBytes = useMemo(
    () => attachments.reduce((sum, file) => sum + file.size, 0),
    [attachments]
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;

      const accumulated = [...attachments];
      let pendingCount = uploadRows.length;

      for (const file of list) {
        if (accumulated.length + pendingCount + 1 > EMAIL_ATTACHMENT_MAX_COUNT) {
          toast.error(`Maximum ${EMAIL_ATTACHMENT_MAX_COUNT} attachments`);
          break;
        }

        if (!isAllowedEmailAttachment(file)) {
          toast.error(`${file.name}: only ${EMAIL_ATTACHMENT_TYPES_LABEL}`);
          continue;
        }
        if (file.size > EMAIL_ATTACHMENT_MAX_BYTES) {
          toast.error(`${file.name}: max ${formatAttachmentSize(EMAIL_ATTACHMENT_MAX_BYTES)}`);
          continue;
        }
        if (accumulated.some((a) => a.filename === file.name && a.size === file.size)) {
          toast.warning(`${file.name} is already attached`);
          continue;
        }

        const rowId = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        pendingCount += 1;
        setUploadRows((prev) => [...prev, { kind: 'uploading', id: rowId, filename: file.name, size: file.size }]);
        toast.loading(`Uploading ${file.name}…`, { id: rowId });

        try {
          const payload = await fileToEmailAttachment(file);
          accumulated.push({ ...payload, id: rowId });
          pendingCount -= 1;
          setUploadRows((prev) => prev.filter((row) => row.id !== rowId));
          onChange([...accumulated]);
          toast.success(`${file.name} uploaded successfully`, { id: rowId });
        } catch (error) {
          pendingCount -= 1;
          const message = error instanceof Error ? error.message : 'Could not add file';
          setUploadRows((prev) =>
            prev.map((row) =>
              row.id === rowId
                ? { kind: 'error' as const, id: rowId, filename: file.name, size: file.size, errorMessage: message }
                : row
            )
          );
          toast.error(`${file.name}: ${message}`, { id: rowId });
        }
      }
    },
    [attachments, onChange, uploadRows.length]
  );

  const removeAttachment = (id: string) => {
    onChange(attachments.filter((item) => item.id !== id));
  };

  const dismissUploadRow = (id: string) => {
    setUploadRows((prev) => prev.filter((row) => row.id !== id));
  };

  const hasActivity = attachments.length > 0 || uploadRows.length > 0;
  const isUploading = uploadRows.some((row) => row.kind === 'uploading');
  const uploadingCount = uploadRows.filter((row) => row.kind === 'uploading').length;

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          void addFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        className={cn(
          'rounded-xl border-2 border-dashed px-3 py-6 sm:px-4 sm:py-8 text-center transition-colors cursor-pointer',
          dragging
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        <Upload className="w-7 h-7 sm:w-8 sm:h-8 mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-700">Drag & drop files here</p>
        <p className="text-xs text-slate-500 mt-1 px-2">
          {EMAIL_ATTACHMENT_TYPES_LABEL} · up to {formatAttachmentSize(EMAIL_ATTACHMENT_MAX_BYTES)}{' '}
          each · {EMAIL_ATTACHMENT_MAX_COUNT} files max
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3" disabled={disabled}>
          <Paperclip className="w-4 h-4 mr-1.5" />
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={EMAIL_ATTACHMENT_ACCEPT}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) {
              void addFiles(e.target.files);
            }
            e.target.value = '';
          }}
        />
      </div>

      {hasActivity && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
          {isUploading && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
              <Loader2 className="w-3 h-3 animate-spin" />
              Uploading {uploadingCount} file{uploadingCount === 1 ? '' : 's'}…
            </span>
          )}
          {attachments.length > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              {attachments.length} uploaded · {formatAttachmentSize(totalReadyBytes)}
            </span>
          )}
        </div>
      )}

      {(attachments.length > 0 || uploadRows.length > 0) && (
        <ul className="space-y-2">
          {uploadRows.map((row) => (
            <li
              key={row.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2',
                row.kind === 'error'
                  ? 'border-red-200 bg-red-50'
                  : 'border-amber-200 bg-amber-50/80'
              )}
            >
              {row.kind === 'uploading' ? (
                <Loader2 className="w-4 h-4 text-amber-600 shrink-0 animate-spin" />
              ) : (
                <X className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{row.filename}</p>
                <p className="text-xs text-amber-700 font-medium">
                  {row.kind === 'uploading'
                    ? `Uploading ${formatAttachmentSize(row.size)}…`
                    : row.errorMessage}
                </p>
              </div>
              {row.kind === 'error' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-slate-500"
                  onClick={() => dismissUploadRow(row.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </li>
          ))}

          {attachments.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-white px-3 py-2"
            >
              {attachmentIcon(file.contentType, file.filename)}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{file.filename}</p>
                <p className="text-xs text-emerald-700 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  Uploaded successfully · {formatAttachmentSize(file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-slate-500 hover:text-red-600"
                onClick={() => removeAttachment(file.id)}
                disabled={disabled}
              >
                <X className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
