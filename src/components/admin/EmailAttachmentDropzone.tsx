import React, { useCallback, useRef, useState } from 'react';
import { FileText, ImageIcon, Paperclip, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  EMAIL_ATTACHMENT_MAX_BYTES,
  EMAIL_ATTACHMENT_MAX_COUNT,
  fileToEmailAttachment,
  formatAttachmentSize,
  isAllowedEmailAttachment,
  type EmailAttachmentItem,
} from '@/lib/admin-email-attachments';

interface EmailAttachmentDropzoneProps {
  attachments: EmailAttachmentItem[];
  onChange: (attachments: EmailAttachmentItem[]) => void;
  disabled?: boolean;
}

function attachmentIcon(contentType: string) {
  if (contentType === 'application/pdf') {
    return <FileText className="w-4 h-4 text-red-600 shrink-0" />;
  }
  return <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />;
}

export default function EmailAttachmentDropzone({
  attachments,
  onChange,
  disabled = false,
}: EmailAttachmentDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;

      if (attachments.length + list.length > EMAIL_ATTACHMENT_MAX_COUNT) {
        toast.error(`Maximum ${EMAIL_ATTACHMENT_MAX_COUNT} attachments`);
        return;
      }

      const next = [...attachments];

      for (const file of list) {
        if (!isAllowedEmailAttachment(file)) {
          toast.error(`${file.name}: only PDF and images allowed`);
          continue;
        }
        if (file.size > EMAIL_ATTACHMENT_MAX_BYTES) {
          toast.error(`${file.name}: max ${formatAttachmentSize(EMAIL_ATTACHMENT_MAX_BYTES)}`);
          continue;
        }
        if (next.some((a) => a.filename === file.name && a.size === file.size)) {
          continue;
        }

        try {
          const payload = await fileToEmailAttachment(file);
          next.push({
            ...payload,
            id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not add file');
        }
      }

      onChange(next);
    },
    [attachments, onChange]
  );

  const removeAttachment = (id: string) => {
    onChange(attachments.filter((item) => item.id !== id));
  };

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
          'rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors cursor-pointer',
          dragging
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-700">Drag & drop PDF or photos here</p>
        <p className="text-xs text-slate-500 mt-1">
          PDF, JPG, PNG, WebP, GIF · up to {formatAttachmentSize(EMAIL_ATTACHMENT_MAX_BYTES)} each ·{' '}
          {EMAIL_ATTACHMENT_MAX_COUNT} files max
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3" disabled={disabled}>
          <Paperclip className="w-4 h-4 mr-1.5" />
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,image/gif"
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

      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              {attachmentIcon(file.contentType)}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{file.filename}</p>
                <p className="text-xs text-slate-500">{formatAttachmentSize(file.size)}</p>
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
