import React, { useState, useEffect } from 'react';
import { CheckCircle, Edit, Package, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Job, Technician } from '@/types';
import { WhatsAppIcon } from '../WhatsAppIcon';
import { findLeadSource } from '@/lib/adminUtils';
import JobPartsUsedDialog from './JobPartsUsedDialog';
import { db } from '@/lib/supabase';

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
  onAddReminder,
}) => {
  const [partsUsedDialogOpen, setPartsUsedDialogOpen] = useState(false);
  const [sparePartsCost, setSparePartsCost] = useState<number>(0);

  const fetchSparePartsCost = () => {
    if (!job?.id || job.status !== 'COMPLETED') return;
    db.jobPartsUsed.getByJob(job.id).then(({ data }) => {
      const cost = (data || []).reduce((sum: number, row: any) => {
        const qty = Number(row.quantity_used) || 0;
        const price = Number(row.inventory?.price) ?? 0;
        return sum + qty * price;
      }, 0);
      setSparePartsCost(cost);
    });
  };

  useEffect(() => {
    fetchSparePartsCost();
  }, [job?.id, job?.status]);

  if (job.status !== 'COMPLETED') return null;

  const leadSource = findLeadSource(requirements);
  const leadCost = Number((job as any).lead_cost) || 0;
  const billAmount = Number(actualCost || paymentAmount) || 0;
  const commission10 = billAmount * 0.1;
  const profit = billAmount - sparePartsCost - leadCost - commission10;
  const showProfit = billAmount > 0;
  
  // Find assigned technician
  const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
  const assignedTechnician = technicians.find(t => t.id === assignedTechnicianId) || null;
  const messageSent = requirements.some((r: any) => {
    if (r && typeof r === 'object') {
      return r.message_sent === true || r.message_sent === 'true';
    }
    return false;
  });
  const messageSentAt = requirements.find((r: any) => r?.message_sent_at)?.message_sent_at;
  
  // Extract OTP information
  const otpRequirement = requirements.find((r: any) => r?.require_otp === true);
  const otpVerified = otpRequirement?.otp_verified === true;
  const otpEntered = otpRequirement?.otp_entered || otpRequirement?.otp_code;

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
          {/* Partial payment breakdown: show how much cash and how much online */}
          {paymentMethod === 'PARTIAL' && requirements && Array.isArray(requirements) && (() => {
            const partialReq = requirements.find((r: any) => r?.partial_cash_amount != null || r?.partial_online_amount != null);
            const cash = Number(partialReq?.partial_cash_amount) || 0;
            const online = Number(partialReq?.partial_online_amount) || 0;
            if (cash > 0 || online > 0) {
              return (
                <div className="text-gray-700 break-words">
                  <span className="text-gray-500 font-medium">Payment:</span>{' '}
                  {cash > 0 && <span>₹{cash.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} cash</span>}
                  {cash > 0 && online > 0 && <span>, </span>}
                  {online > 0 && <span>₹{online.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} online</span>}
                </div>
              );
            }
            return null;
          })()}
          
          {/* Lead Source */}
          <div className="text-gray-700 break-words">
            <span className="text-gray-500 font-medium">Lead Source:</span> {leadSource || 'Direct call'}
          </div>

          {/* Raw Water TDS */}
          {((job as any).customer?.raw_water_tds != null && (job as any).customer?.raw_water_tds > 0) && (
            <div className="text-gray-700 break-words">
              <span className="text-gray-500 font-medium">Raw Water TDS:</span> {(job as any).customer.raw_water_tds} ppm
            </div>
          )}

          {/* Profit: Amount - spare parts - lead cost - 10% commission */}
          {showProfit && (
            <div className="text-gray-700 break-words pt-2 border-t border-green-200">
              <span className="text-gray-500 font-medium">Profit:</span>{' '}
              <span className={profit >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                ₹{profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-gray-500 ml-1">
                (Amount − spare parts ₹{sparePartsCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} − lead ₹{leadCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} − 10% commission ₹{commission10.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            </div>
          )}
          
          {/* QR Code Info (if online) */}
          {qrPhotos?.selected_qr_code_name && (
            <div className="text-gray-700 break-words">
              <span className="text-gray-500 font-medium">QR Code:</span> {qrPhotos.selected_qr_code_name}
            </div>
          )}
          
          {/* Payment Screenshot & Bill Photos - Combined */}
          {paymentScreenshot || (billPhotos && Array.isArray(billPhotos) && billPhotos.length > 0) ? (
            <div className="text-gray-700 mt-2 pt-2 border-t border-green-200">
              <span className="text-gray-500 font-medium">Payment & Bill Documents:</span>
              <button
                onClick={() => {
                  const allPhotos: string[] = [];
                  if (billPhotos && Array.isArray(billPhotos)) {
                    allPhotos.push(...billPhotos);
                  }
                  if (paymentScreenshot) {
                    allPhotos.push(paymentScreenshot);
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
                {(() => {
                  const billCount = billPhotos && Array.isArray(billPhotos) ? billPhotos.length : 0;
                  const hasPayment = !!paymentScreenshot;
                  const totalCount = billCount + (hasPayment ? 1 : 0);
                  
                  if (hasPayment && billCount > 0) {
                    return `View Payment Photo & Bill Photos (${totalCount})`;
                  } else if (hasPayment) {
                    return 'View Payment Photo';
                  } else {
                    return `View Bill Photos (${billCount})`;
                  }
                })()}
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
                {amcInfo.amount && (
                  <div>
                    <span className="text-gray-500">AMC Amount:</span> ₹{parseFloat(amcInfo.amount.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                )}
                {amcInfo.includes_prefilter !== undefined && (
                  <div>
                    <span className="text-gray-500">Includes Prefilter:</span> {amcInfo.includes_prefilter ? 'Yes' : 'No'}
                  </div>
                )}
                {(() => {
                  // Parse additional_info to extract description
                  let description = '';
                  let additionalInfo = '';
                  if (amcInfo.additional_info) {
                    try {
                      if (typeof amcInfo.additional_info === 'string') {
                        const parsed = JSON.parse(amcInfo.additional_info);
                        description = parsed.description || parsed.notes || '';
                        additionalInfo = parsed.notes || '';
                      } else {
                        description = amcInfo.additional_info.description || amcInfo.additional_info.notes || '';
                        additionalInfo = amcInfo.additional_info.notes || '';
                      }
                    } catch (e) {
                      // If not JSON, treat as plain text
                      additionalInfo = amcInfo.additional_info;
                    }
                  }
                  
                  return (
                    <>
                      {description && (
                        <div className="mt-2 pt-2 border-t border-green-300">
                          <span className="text-gray-500 font-medium">Description / Summary:</span>
                          <div className="text-gray-700 mt-1 whitespace-pre-wrap">{description}</div>
                        </div>
                      )}
                      {additionalInfo && !description && (
                  <div className="mt-2 pt-2 border-t border-green-300">
                    <span className="text-gray-500 font-medium">Additional Info:</span>
                          <div className="text-gray-700 mt-1 whitespace-pre-wrap">{additionalInfo}</div>
                  </div>
                )}
                    </>
                  );
                })()}
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
            <div className="text-xs text-gray-500 mt-1 break-words flex items-center gap-2">
              <span>Completed on {formattedCompletedAt}</span>
            </div>
          )}
          
          {/* OTP Verification Status */}
          {otpRequirement && (
            <div className={`text-xs mt-2 pt-2 border-t border-green-200 break-words font-medium ${
              otpVerified ? 'text-green-600' : 'text-red-600'
            }`}>
              {otpVerified ? (
                <>
                  ✓ OTP Entered: <span className="font-mono font-bold">{otpEntered || 'N/A'}</span>
                </>
              ) : (
                <>
                  ⚠ OTP Not Verified - Job requires OTP verification
                </>
              )}
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
              const completedAt = (job as any).completed_at || job.completedAt;
              const completedDate = completedAt ? new Date(completedAt).toISOString().split('T')[0] : '';
              const completedTime = completedAt ? new Date(completedAt).toTimeString().slice(0, 5) : '';
              
              // Extract lead source and custom lead source from requirements
              let leadSourceValue = leadSource || 'Direct call';
              let leadSourceCustomValue = '';
              
              // Check if lead source is "Other" and find custom value
              if (leadSourceValue === 'Other' || !leadSourceValue) {
                const leadSourceObj = requirements.find((r: any) => r && r.lead_source);
                if (leadSourceObj) {
                  leadSourceValue = leadSourceObj.lead_source === 'Other' ? 'Other' : (leadSourceObj.lead_source || 'Direct call');
                  leadSourceCustomValue = leadSourceObj.lead_source_custom || '';
                }
              }

              // Get lead_cost from job
              const leadCost = (job as any).lead_cost !== undefined && (job as any).lead_cost !== null 
                ? (job as any).lead_cost.toString() 
                : '0';

              const editData: any = {
                amount: actualCost || paymentAmount || '',
                paymentMethod: paymentMethod || 'CASH',
                leadSource: leadSourceValue,
                leadSourceCustom: leadSourceCustomValue,
                leadCost: leadCost,
                qrCodeName: qrPhotos?.selected_qr_code_name || '',
                amcInfo: amcInfo || null,
                completionNotes: completionNotes || '',
                completedBy: (job as any).completed_by || job.completedBy || '',
                completedAt: completedAt || null,
                completedDate: completedDate,
                completedTime: completedTime,
              };
              setCompletedJobEditData(editData);
              setEditCompletedJobDialogOpen(true);
            }}
            className="text-xs flex-1 sm:flex-none"
          >
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
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
            {messageSent ? 'Send Again' : 'Send Message'}
          </Button>
          {assignedTechnician && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPartsUsedDialogOpen(true);
              }}
              className="text-xs flex-1 sm:flex-none"
            >
              <Package className="w-3 h-3 mr-1" />
              Add Parts
            </Button>
          )}
          {onAddReminder && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAddReminder(job)}
              className="text-xs flex-1 sm:flex-none"
            >
              <Bell className="w-3 h-3 mr-1" />
              Add Reminder
            </Button>
          )}
        </div>
      </div>
      
      {/* Parts Used Dialog */}
      {assignedTechnician && (
        <JobPartsUsedDialog
          open={partsUsedDialogOpen}
          onOpenChange={(open) => {
            setPartsUsedDialogOpen(open);
            if (!open) fetchSparePartsCost();
          }}
          job={job}
          technician={assignedTechnician}
        />
      )}
    </div>
  );
};

