/**
 * @deprecated Use Settings panel `pdf-authenticity` / PdfAuthenticityVerifyPage.
 * Kept as a thin dialog wrapper for any leftover callers.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShieldCheck } from 'lucide-react';
import PdfAuthenticityVerifyPage from '@/pages/PdfAuthenticityVerifyPage';

export function AmcAuthenticityVerifyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="sr-only">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Verify PDF authenticity
          </DialogTitle>
        </DialogHeader>
        <PdfAuthenticityVerifyPage hideHeader onBack={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
