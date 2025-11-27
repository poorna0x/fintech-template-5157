import React from 'react';
import { CheckCircle, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Job, Technician } from '@/types';
import { WhatsAppIcon } from '../WhatsAppIcon';
import { findLeadSource } from '@/lib/adminUtils';

interface CompletedJobSectionProps {
  job: Job;
  technicians: Technician[];
  requirements: any[];
  actualCost: number | null;
  paymentAmount: number | null;
  paymentMethod: string | null;
  qrPhotos: any;
  billPhotos: any[];
  paymentScreenshot: string | null;
  amcInfo: any;
  completionNotes: string;
  completedByName: string;
  formattedCompletedAt: string | null;
  setSelectedCompletedJob: (job: Job) => void;
  setCompletedJobEditData: (data: any) => void;
  setEditCompletedJobDialogOpen: (open: boolean) => void;
  setSelectedJobForMessage: (job: Job) => void;
  setSendMessageDialogOpen: (open: boolean) => void;
  setSelectedBillPhotos: (photos: string[]) => void;
  setSelectedPhoto: (photo: { url: string; index: number; total: number }) => void;
  setPhotoViewerOpen: (open: boolean) => void;
}

export const CompletedJobSection: React.FC<CompletedJobSectionProps> = ({
  job,
  technicians,
  requirements,
  actualCost,
  paymentAmount,
  paymentMethod,
  qrPhotos,
  billPhotos,
  paymentScreenshot,
  amcInfo,
  completionNotes,
  completedByName,
  formattedCompletedAt,
  setSelectedCompletedJob,
  setCompletedJobEditData,
  setEditCompletedJobDialogOpen,
  setSelectedJobForMessage,
  setSendMessageDialogOpen,
  setSelectedBillPhotos,
  setSelectedPhoto,
  setPhotoViewerOpen,
}) => {
  if (job.status !== 'COMPLETED') return null;

  const leadSource = findLeadSource(requirements);
  const messageSent = requirements.some((r: any) => {
    if (r && typeof r === 'object') {
      return r.message_sent === true || r.message_sent === 'true';
    }
    return false;
  });
  const messageSentAt = requirements.find((r: any) => r?.message_sent_at)?.message_sent_at;

  return (
    <div className="mt-4 mb-2">
      <div className="flex flex-col sm:flex-row items-start gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2">
        <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-2 text-sm text-gray-900 flex-1 min-w-0">
          <div className="font-semibold text-green-900">
            Job Completed
          </div>
          
          {/* Bill Amount */}
          {(actualCost || paymentAmount) && (
            <div className="text-gray-700 break-words">
              <span className="text-gray-500 font-medium">Amount:</span> ₹{actualCost || paymentAmount}
            </div>
          )}
          
          {/* Payment Mode */}
          {paymentMethod && (
            <div className="text-gray-700 break-words">
              <span className="text-gray-500 font-medium">Payment Mode:</span> {
                paymentMethod === 'CASH' ? 'Cash' : 
                paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER' ? 'Online' : 
                paymentMethod
              }
            </div>
          )}
          
          {/* Lead Source */}
          {leadSource && (
            <div className="text-gray-700 break-words">
              <span className="text-gray-500 font-medium">Lead Source:</span> {leadSource}
            </div>
          )}
          
          {/* QR Code Info (if online) */}
          {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && qrPhotos?.selected_qr_code_name && (
            <div className="text-gray-700 break-words">
              <span className="text-gray-500 font-medium">QR Code:</span> {qrPhotos.selected_qr_code_name}
            </div>
          )}
          
          {/* Payment Screenshot & Bill Photos - Combined */}
          {((paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && paymentScreenshot) || (billPhotos && Array.isArray(billPhotos) && billPhotos.length > 0) ? (
            <div className="text-gray-700 mt-2 pt-2 border-t border-green-200">
              <span className="text-gray-500 font-medium">Payment & Bill Documents:</span>
              <button
                onClick={() => {
                  const allPhotos: string[] = [];
                  if (paymentScreenshot) {
                    allPhotos.push(paymentScreenshot);
                  }
                  if (billPhotos && Array.isArray(billPhotos)) {
                    allPhotos.push(...billPhotos);
                  }
                  
                  if (allPhotos.length > 0) {
                    setSelectedBillPhotos(allPhotos);
                    setSelectedPhoto({ 
                      url: allPhotos[0], 
                      index: 0, 
                      total: allPhotos.length 
                    });
                    setPhotoViewerOpen(true);
                  }
                }}
                className="ml-2 text-blue-600 hover:underline break-all cursor-pointer"
              >
                View {paymentScreenshot && billPhotos && billPhotos.length > 0 ? `${billPhotos.length + 1} Photos` : paymentScreenshot ? 'Payment Screenshot' : `Bill Photos (${billPhotos.length})`}
              </button>
            </div>
          ) : null}
          
          {/* AMC Details */}
          {amcInfo && (
            <div className="mt-2 pt-2 border-t border-green-200">
              <div className="font-medium text-green-900 mb-1">AMC Details:</div>
              <div className="text-gray-700 space-y-1">
                <div>
                  <span className="text-gray-500">Start Date:</span> {amcInfo.date_given ? new Date(amcInfo.date_given).toLocaleDateString('en-IN') : 'N/A'}
                </div>
                <div>
                  <span className="text-gray-500">End Date:</span> {amcInfo.end_date ? new Date(amcInfo.end_date).toLocaleDateString('en-IN') : 'N/A'}
                </div>
                <div>
                  <span className="text-gray-500">Duration:</span> {amcInfo.years || 1} {amcInfo.years === 1 ? 'year' : 'years'}
                </div>
                {amcInfo.includes_prefilter !== undefined && (
                  <div>
                    <span className="text-gray-500">Includes Prefilter:</span> {amcInfo.includes_prefilter ? 'Yes' : 'No'}
                  </div>
                )}
                {amcInfo.additional_info && (
                  <div className="mt-2 pt-2 border-t border-green-300">
                    <span className="text-gray-500 font-medium">Additional Info:</span>
                    <div className="text-gray-700 mt-1 whitespace-pre-wrap">{amcInfo.additional_info}</div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Completion Notes */}
          {completionNotes && (
            <div className="text-gray-700 mt-2 pt-2 border-t border-green-200 break-words">
              <span className="text-gray-500 font-medium">Notes:</span> {completionNotes}
            </div>
          )}
          
          {/* Completed By */}
          {completedByName && (
            <div className="text-gray-700 mt-2 pt-2 border-t border-green-200 break-words">
              <span className="text-gray-500 font-medium">Completed By:</span> {completedByName}
            </div>
          )}
          
          {/* Completed At */}
          {formattedCompletedAt && (
            <div className="text-xs text-gray-500 mt-1 break-words">
              Completed on {formattedCompletedAt}
            </div>
          )}
          
          {/* Message Sent Status - Always show */}
          {messageSent ? (
            <div className="text-xs text-green-600 mt-2 pt-2 border-t border-green-200 break-words font-medium">
              ✓ Message Sent{messageSentAt ? ` on ${new Date(messageSentAt).toLocaleString()}` : ''}
            </div>
          ) : (
            <div className="text-xs text-orange-600 mt-2 pt-2 border-t border-green-200 break-words font-medium">
              ⚠ Message Not Sent
            </div>
          )}
        </div>
        <div className="flex flex-row sm:flex-col gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedCompletedJob(job);
              const editData: any = {
                amount: actualCost || paymentAmount || '',
                paymentMethod: paymentMethod || 'CASH',
                qrCodeName: qrPhotos?.selected_qr_code_name || '',
                amcInfo: amcInfo || null,
                completionNotes: completionNotes || '',
                completedBy: (job as any).completed_by || job.completedBy || '',
              };
              setCompletedJobEditData(editData);
              setEditCompletedJobDialogOpen(true);
            }}
            className="text-xs flex-1 sm:flex-none"
          >
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
          {!messageSent ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedJobForMessage(job);
                setSendMessageDialogOpen(true);
              }}
              className="text-xs flex-1 sm:flex-none"
            >
              <WhatsAppIcon className="w-3 h-3 mr-1" />
              Send Message
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="text-xs opacity-50 flex-1 sm:flex-none"
            >
              <WhatsAppIcon className="w-3 h-3 mr-1" />
              Message Sent
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

