import React from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  documentGenerateBtnClass,
  documentGenerateVioletBtnClass,
  documentOutlineBtnClass,
  type DocumentGeneratorAccent,
} from '@/components/DocumentGeneratorPageHeader';
import { cn } from '@/lib/utils';
import DocumentHtmlPreview from '@/components/document/DocumentHtmlPreview';

const accentHeader: Record<DocumentGeneratorAccent, string> = {
  green: 'bg-gradient-to-r from-emerald-50/90 to-white',
  blue: 'bg-gradient-to-r from-blue-50/90 to-white',
  violet: 'bg-gradient-to-r from-violet-50/90 to-white',
  amber: 'bg-gradient-to-r from-amber-50/90 to-white',
};

const accentTitle: Record<DocumentGeneratorAccent, string> = {
  green: 'text-emerald-950',
  blue: 'text-blue-950',
  violet: 'text-violet-950',
  amber: 'text-amber-950',
};

type DocumentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  previewTitle: string;
  previewHtml: string | null;
  accent?: DocumentGeneratorAccent;
  generateBtnClass?: string;
  onDownload?: () => void;
  onPrint?: () => void;
  extraFooter?: React.ReactNode;
};

export default function DocumentPreviewDialog({
  open,
  onOpenChange,
  title,
  description = 'Same layout as the PDF — review before exporting.',
  previewTitle,
  previewHtml,
  accent = 'green',
  generateBtnClass,
  onDownload,
  onPrint,
  extraFooter,
}: DocumentPreviewDialogProps) {
  const printClass = generateBtnClass ?? (accent === 'violet' ? documentGenerateVioletBtnClass : documentGenerateBtnClass);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[100dvh] w-[calc(100vw-1rem)] max-w-[min(100vw-1rem,52.5rem)] flex-col overflow-hidden p-0 sm:max-h-[96vh]">
        <DialogHeader className={cn('shrink-0 border-b px-4 py-3 sm:px-5', accentHeader[accent])}>
          <DialogTitle className={cn('text-lg font-bold sm:text-xl', accentTitle[accent])}>
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100/80 px-2 py-2 sm:overflow-y-auto sm:overflow-x-hidden sm:px-3">
          {previewHtml ? (
            <DocumentHtmlPreview html={previewHtml} title={previewTitle} fillHeight />
          ) : null}
        </div>
        <DialogFooter
          className={cn(
            'shrink-0 grid gap-2 border-t bg-white px-3 py-3 sm:px-4',
            extraFooter ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'
          )}
        >
          {extraFooter}
          <Button type="button" variant="outline" className="h-10 w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onDownload ? (
            <Button
              type="button"
              variant="outline"
              className={cn(documentOutlineBtnClass, 'h-10 w-full')}
              onClick={onDownload}
            >
              <Download className="w-4 h-4 shrink-0" />
              <span className="truncate">Download</span>
            </Button>
          ) : null}
          {onPrint ? (
            <Button type="button" className={cn(printClass, 'h-10 w-full')} onClick={onPrint}>
              <Printer className="w-4 h-4 shrink-0" />
              <span className="truncate">Print</span>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
