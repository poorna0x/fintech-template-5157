import React, { useState } from 'react';
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
import { getLocalCalendarDateYmd } from '@/lib/pendingPaymentReminder';
import type { Customer } from '@/types';
import AmcSchedulePush, { useAmcNextDue } from '@/components/admin/AmcSchedulePush';

type AmcInfoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  amcInfo: any | null;
  loading: boolean;
  onClose: () => void;
  onEdit: () => void;
  onScheduleUpdated?: (nextServiceOn: string | null) => void;
};

function formatShortDate(value?: string | null): string {
  if (!value) return '—';
  const day = String(value).split('T')[0];
  return new Date(day + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function readAmcNotes(amcInfo: any): { amount: number | null; amountLabel: string; notes: string } {
  let description = '';
  let additionalInfo = '';
  let amcCost: number | null = null;
  let totalAmount: number | null = null;
  let agreedAmount: number | null = null;

  if (amcInfo?.additional_info) {
    try {
      const parsed =
        typeof amcInfo.additional_info === 'string'
          ? JSON.parse(amcInfo.additional_info)
          : amcInfo.additional_info;
      description = parsed.description || parsed.notes || '';
      additionalInfo = parsed.notes || '';
      amcCost = parsed.amc_cost || null;
      totalAmount = parsed.total_amount || null;
      agreedAmount = parsed.agreed_amount || parsed.agreed || null;
    } catch {
      additionalInfo = String(amcInfo.additional_info);
    }
  }

  const amount = agreedAmount || amcCost || totalAmount || amcInfo?.amount || null;
  const amountLabel = agreedAmount ? 'Agreed Amount' : 'AMC Amount';
  return { amount, amountLabel, notes: description || additionalInfo };
}

export default function AmcInfoDialog({
  open,
  onOpenChange,
  customer,
  amcInfo,
  loading,
  onClose,
  onEdit,
  onScheduleUpdated,
}: AmcInfoDialogProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const nextDue = useAmcNextDue({
    customerId: amcInfo?.customer_id || customer?.id,
    startDate: amcInfo?.start_date,
    endDate: amcInfo?.end_date,
    nextServiceOn: amcInfo?.next_service_on,
    servicePeriodMonths: amcInfo?.service_period_months,
  });
  const today = getLocalCalendarDateYmd();
  const notes = amcInfo ? readAmcNotes(amcInfo) : { amount: null, notes: '' };
  const active = String(amcInfo?.status || '').toUpperCase() === 'ACTIVE';

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && scheduleOpen) {
            setScheduleOpen(false);
            return;
          }
          if (!next) setScheduleOpen(false);
          onOpenChange(next);
        }}
      >
        <DialogContent
          className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
          onInteractOutside={(event) => {
            if (scheduleOpen) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (scheduleOpen) event.preventDefault();
          }}
        >
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 pr-10">
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
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Status</span>
                <Badge className={active ? 'bg-green-600 text-white border-0' : 'bg-gray-200 text-gray-800 border-0'}>
                  {active ? 'Active' : amcInfo.status || 'AMC'}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-sm gap-3">
                <span className="text-gray-600 font-medium">Service brand</span>
                <span className="text-gray-900 font-semibold text-right">{getAmcDocumentBrandLabel(amcInfo)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 font-medium">Start date</span>
                  <p className="text-gray-900 font-semibold mt-1">{formatShortDate(amcInfo.start_date)}</p>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">End date</span>
                  <p className="text-gray-900 font-semibold mt-1">{formatShortDate(amcInfo.end_date)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 font-medium">Duration</span>
                  <p className="text-gray-900 font-semibold mt-1">
                    {amcInfo.years} {amcInfo.years === 1 ? 'year' : 'years'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">Includes prefilter</span>
                  <p className="text-gray-900 font-semibold mt-1">{amcInfo.includes_prefilter ? 'Yes' : 'No'}</p>
                </div>
              </div>

              {notes.amount != null && (
                <div className="text-sm">
                  <span className="text-gray-600 font-medium">{notes.amountLabel}</span>
                  <p className="text-gray-900 font-semibold mt-1">
                    ₹
                    {Number(notes.amount).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}

              {notes.notes && (
                <div className="pt-3 border-t border-green-200">
                  <span className="text-gray-600 font-medium text-sm">Description</span>
                  <p className="text-gray-900 mt-2 whitespace-pre-wrap break-words">{notes.notes}</p>
                </div>
              )}

              {customer?.id &&
                amcInfo.id &&
                active &&
                (amcInfo.service_period_months == null || Number(amcInfo.service_period_months) > 0) && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-green-200 bg-white px-3 py-2.5">
                  <div>
                    <p className="text-xs text-gray-500">Next visit</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {nextDue
                        ? nextDue < today
                          ? `Due now · ${formatShortDate(nextDue)}`
                          : formatShortDate(nextDue)
                        : '—'}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-8 bg-white" onClick={() => setScheduleOpen(true)}>
                    Change
                  </Button>
                </div>
              )}
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

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md z-[60]" overlayClassName="z-[60]">
          <DialogHeader>
            <DialogTitle>Change next visit</DialogTitle>
            <DialogDescription>
              {customer?.fullName ? `${customer.fullName}. ` : ''}
              The job opens 10 days before this date.
            </DialogDescription>
          </DialogHeader>
          {customer?.id && amcInfo?.id && (
            <AmcSchedulePush
              plain
              contractId={String(amcInfo.id)}
              customerId={String(amcInfo.customer_id || customer.id)}
              customerName={customer.fullName || 'Customer'}
              startDate={String(amcInfo.start_date || '')}
              endDate={String(amcInfo.end_date || '')}
              nextServiceOn={amcInfo.next_service_on}
              servicePeriodMonths={amcInfo.service_period_months}
              onUpdated={onScheduleUpdated}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
