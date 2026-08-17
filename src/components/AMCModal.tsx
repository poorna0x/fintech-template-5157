import React, { lazy, Suspense } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { Customer } from '@/types';
import type { JobAmcPrefill } from '@/lib/jobAmcInfo';

const AMCGenerator = lazy(() => import('@/components/AMCGenerator'));

interface AMCModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  /** Prefill from a completed job's technician/admin AMC reference fields. */
  initialFromJob?: JobAmcPrefill | null;
  onAMCSaved?: () => void;
  initialAiInstruction?: string | null;
}

export default function AMCModal({
  isOpen,
  onClose,
  customer,
  initialFromJob,
  onAMCSaved,
  initialAiInstruction,
}: AMCModalProps) {
  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent
        dismissible={false}
        hideCloseButton
        className="max-w-6xl max-h-[90vh] overflow-y-auto p-0 w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-full"
      >
        <DialogHeader className="sticky top-0 z-10 border-b bg-gradient-to-r from-violet-50/90 to-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <DialogTitle className="text-lg sm:text-xl font-bold text-violet-950 leading-tight">
                {customer ? `AMC Agreement for ${customer.fullName}` : 'AMC Agreement'}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">
                Fill in details below, preview the agreement, then save or export.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
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
                key={customer.id}
                customer={customer}
                initialFromJob={initialFromJob ?? null}
                onAMCSaved={onAMCSaved}
                embedded
                initialAiInstruction={initialAiInstruction}
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
