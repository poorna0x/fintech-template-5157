import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { Customer, Bill } from '@/types';
import AMCGenerator from '@/components/AMCGenerator';
import { generateAMCPDF } from '@/lib/amc-pdf-generator';
import { toast } from 'sonner';

interface AMCModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onAMCSaved?: () => void;
}

export default function AMCModal({ isOpen, onClose, customer, onAMCSaved }: AMCModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePrintAMC = (bill: Bill, action?: 'print' | 'pdf') => {
    setIsGenerating(true);
    
    try {
      generateAMCPDF(bill);
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
        <DialogHeader className="sticky top-0 bg-white z-10 border-b p-3 sm:p-4 md:p-6 pb-3 sm:pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
            <DialogTitle className="text-lg sm:text-xl font-semibold pr-2">
              Generate AMC Agreement {customer ? `for ${customer.fullName}` : ''}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isGenerating}
              className="h-8 w-8 p-0 self-end sm:self-auto"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="p-3 sm:p-4 md:p-6 pt-2 sm:pt-3 md:pt-4">
          {customer ? (
            <AMCGenerator
              customer={customer}
              onPrint={handlePrintAMC}
              onAMCSaved={onAMCSaved}
            />
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
