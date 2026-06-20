import React, { lazy, Suspense, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { Customer, Bill } from '@/types';
import { toast } from 'sonner';

const AMCGenerator = lazy(() => import('@/components/AMCGenerator'));

interface AMCModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onAMCSaved?: () => void;
}

export default function AMCModal({ isOpen, onClose, customer, onAMCSaved }: AMCModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePrintAMC = async (bill: Bill, action?: 'print' | 'pdf') => {
    setIsGenerating(true);
    
    try {
      const { generateAMCPDF } = await import('@/lib/amc-pdf-generator');
      generateAMCPDF(bill, action ?? 'pdf');
    } catch (error) {
      console.error('Error generating AMC:', error);
      toast.error('Failed to generate AMC Agreement');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0 w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-full">
        <DialogHeader className="sticky top-0 z-10 border-b bg-gradient-to-r from-violet-50/90 to-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <DialogTitle className="text-lg sm:text-xl font-bold text-violet-950 leading-tight">
                {customer ? `AMC Agreement for ${customer.fullName}` : 'AMC Agreement'}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">
                Fill in details below, then save or export the agreement.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isGenerating}
              className="h-8 w-8 shrink-0 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-6 pt-3 sm:pt-4">
          {customer ? (
            <Suspense
              fallback={
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-600">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                  <p className="text-sm">Loading AMC form…</p>
                </div>
              }
            >
              <AMCGenerator
                customer={customer}
                onPrint={handlePrintAMC}
                onAMCSaved={onAMCSaved}
                embedded
              />
            </Suspense>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-gray-500">
                <p>No customer selected</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
