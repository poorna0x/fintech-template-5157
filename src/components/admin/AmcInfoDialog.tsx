import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Edit, RefreshCw, Star } from 'lucide-react';
import { getAmcDocumentBrandLabel } from '@/lib/amc-brand';
import type { Customer } from '@/types';

type AmcInfoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  amcInfo: any | null;
  loading: boolean;
  onClose: () => void;
  onEdit: () => void;
};

function AmcAdditionalInfoSection({ amcInfo }: { amcInfo: any }) {
  let description = '';
  let additionalInfo = '';
  let amcCost: number | null = null;
  let totalAmount: number | null = null;
  let agreedAmount: number | null = null;

  if (amcInfo.additional_info) {
    try {
      let parsed: any = {};
      if (typeof amcInfo.additional_info === 'string') {
        parsed = JSON.parse(amcInfo.additional_info);
      } else {
        parsed = amcInfo.additional_info;
      }

      description = parsed.description || parsed.notes || '';
      additionalInfo = parsed.notes || '';
      amcCost = parsed.amc_cost || null;
      totalAmount = parsed.total_amount || null;
      agreedAmount = parsed.agreed_amount || parsed.agreed || null;
    } catch {
      additionalInfo = amcInfo.additional_info;
    }
  }

  const displayAmount = agreedAmount || amcCost || totalAmount || amcInfo.amount;
  const amountLabel = agreedAmount ? 'Agreed Amount' : amcCost || totalAmount ? 'AMC Amount' : 'AMC Cost';

  return (
    <>
      {displayAmount && (
        <div className="text-sm">
          <span className="text-gray-600 font-medium">{amountLabel}:</span>
          <p className="text-gray-900 font-semibold mt-1">
            ₹
            {parseFloat(displayAmount.toString()).toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
      )}
      {description && (
        <div className="pt-3 border-t border-green-200">
          <span className="text-gray-600 font-medium text-sm">Description / Summary:</span>
          <p className="text-gray-900 mt-2 whitespace-pre-wrap break-words">{description}</p>
        </div>
      )}
      {additionalInfo && !description && (
        <div className="pt-3 border-t border-green-200">
          <span className="text-gray-600 font-medium text-sm">Additional Information:</span>
          <p className="text-gray-900 mt-2 whitespace-pre-wrap break-words">{additionalInfo}</p>
        </div>
      )}
    </>
  );
}

export default function AmcInfoDialog({
  open,
  onOpenChange,
  customer,
  amcInfo,
  loading,
  onClose,
  onEdit,
}: AmcInfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-green-600" />
            AMC Information
          </DialogTitle>
          <DialogDescription>AMC details for {customer?.fullName || 'customer'}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
              <span className="text-gray-600">Loading AMC information...</span>
            </div>
          </div>
        ) : amcInfo ? (
          <div className="py-4 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Status:</span>
                <Badge className="bg-green-600 text-white border-0">{amcInfo.status}</Badge>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 font-medium">Service brand:</span>
                <span className="text-gray-900 font-semibold">{getAmcDocumentBrandLabel(amcInfo)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 font-medium">Start Date:</span>
                  <p className="text-gray-900 font-semibold mt-1">
                    {new Date(amcInfo.start_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">End Date:</span>
                  <p className="text-gray-900 font-semibold mt-1">
                    {new Date(amcInfo.end_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 font-medium">Duration:</span>
                  <p className="text-gray-900 font-semibold mt-1">
                    {amcInfo.years} {amcInfo.years === 1 ? 'year' : 'years'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">Includes Prefilter:</span>
                  <p className="text-gray-900 font-semibold mt-1">
                    {amcInfo.includes_prefilter ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>

              <AmcAdditionalInfoSection amcInfo={amcInfo} />

              <div className="pt-3 border-t border-green-200 text-xs text-gray-500">
                <p>Created: {new Date(amcInfo.created_at).toLocaleString('en-IN')}</p>
                {amcInfo.updated_at && amcInfo.updated_at !== amcInfo.created_at && (
                  <p>Last Updated: {new Date(amcInfo.updated_at).toLocaleString('en-IN')}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No active AMC contract found for this customer</p>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {amcInfo && !loading && (
            <Button onClick={onEdit} className="bg-green-600 hover:bg-green-700 text-white">
              <Edit className="w-4 h-4 mr-2" />
              Edit AMC
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
