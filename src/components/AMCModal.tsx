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
}

export default function AMCModal({ isOpen, onClose, customer }: AMCModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePrintAMC = (bill: Bill, action?: 'print' | 'pdf') => {
    setIsGenerating(true);
    
    try {
      generateAMCPDF(bill);
      const message = action === 'print' ? 'AMC Agreement sent to printer!' : 'AMC Agreement saved as PDF!';
      toast.success(message);
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="sticky top-0 bg-white z-10 border-b p-6 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              Generate AMC Agreement {customer ? `for ${customer.fullName}` : ''}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isGenerating}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="p-6 pt-0">
          {customer ? (
            <AMCGenerator
              customer={customer}
              onPrint={handlePrintAMC}
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
