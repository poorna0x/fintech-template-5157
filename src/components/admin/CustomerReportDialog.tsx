import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Customer, Job, Technician } from '@/types';
import { db } from '@/lib/supabase';
import { CheckCircle } from 'lucide-react';

interface CustomerReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  technicians: Technician[];
  onPhotoClick?: (url: string, index: number, total: number) => void;
  onBillPhotosClick?: (photos: string[], index: number) => void;
}

const CustomerReportDialog: React.FC<CustomerReportDialogProps> = ({
  open,
  onOpenChange,
  customer,
  technicians,
  onPhotoClick,
  onBillPhotosClick
}) => {
  const [customerReportJobs, setCustomerReportJobs] = useState<any[]>([]);
  const [loadingCustomerReportJobs, setLoadingCustomerReportJobs] = useState(false);

  useEffect(() => {
    if (open && customer) {
      loadCustomerReportJobs();
    } else {
      // Reset when dialog closes
      setCustomerReportJobs([]);
    }
  }, [open, customer]);

  const loadCustomerReportJobs = async () => {
    if (!customer) return;
    
    setLoadingCustomerReportJobs(true);
    try {
      const { data, error } = await db.jobs.getByCustomerId(customer.id);
      if (error) {
        console.error('Error loading customer report jobs:', error);
        return;
      }
      setCustomerReportJobs(data || []);
    } catch (error) {
      console.error('Error loading customer report jobs:', error);
    } finally {
      setLoadingCustomerReportJobs(false);
    }
  };

  if (!customer) return null;

  const completedJobs = customerReportJobs
    .filter(job => {
      const jobStatus = (job as any).status || job.status;
      return jobStatus === 'COMPLETED';
    })
    .sort((a, b) => {
      // Sort by completion date - latest completed job first
      const aCompletedAt = (a as any).completed_at || (a as any).end_time || a.completedAt || a.endTime || null;
      const bCompletedAt = (b as any).completed_at || (b as any).end_time || b.completedAt || b.endTime || null;
      
      if (!aCompletedAt && !bCompletedAt) return 0;
      if (!aCompletedAt) return 1; // Put jobs without completion date at end
      if (!bCompletedAt) return -1;
      
      // Sort descending (newest first)
      return new Date(bCompletedAt).getTime() - new Date(aCompletedAt).getTime();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customer Report - {customer.fullName || 'Unknown'}</DialogTitle>
          <DialogDescription>
            Complete service history and job details
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Customer Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-lg mb-3">Customer Information</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Name:</span> {customer.fullName}
              </div>
              <div>
                <span className="text-gray-500">Customer ID:</span> {customer.customerId}
              </div>
              <div>
                <span className="text-gray-500">Phone:</span> {customer.phone}
              </div>
              <div>
                <span className="text-gray-500">Email:</span> {customer.email && customer.email.trim() && !customer.email.toLowerCase().includes('nomail') && !customer.email.toLowerCase().includes('no@mail')
                  ? customer.email
                  : 'nomail@mail'}
              </div>
            </div>
          </div>

          {/* Completed Jobs */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Completed Jobs ({completedJobs.length})</h3>
            {loadingCustomerReportJobs ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3"></div>
                <p className="text-sm">Loading completed jobs...</p>
              </div>
            ) : completedJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm">No completed jobs found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {completedJobs.map((job) => {
                  const completionNotes = (job as any).completion_notes || job.completionNotes || '';
                  const completedAt = (job as any).completed_at || job.completedAt || null;
                  const formattedCompletedAt = completedAt ? new Date(completedAt).toLocaleString() : null;
                  const completedBy = (job as any).completed_by || job.completedBy || null;
                  const actualCost = (job as any).actual_cost || job.actual_cost || null;
                  const paymentAmount = (job as any).payment_amount || job.payment_amount || null;
                  const paymentMethod = (job as any).payment_method || job.payment_method || null;
                  
                  let completedByName = 'Unknown';
                  if (completedBy) {
                    if (completedBy === 'admin' || completedBy === 'Admin') {
                      completedByName = 'Admin';
                    } else {
                      const completedByTechnician = technicians.find(tech => tech.id === completedBy);
                      completedByName = completedByTechnician?.fullName || 'Technician';
                    }
                  }
                  
                  let requirements: any[] = [];
                  try {
                    const reqData = (job as any).requirements || job.requirements;
                    if (typeof reqData === 'string') {
                      requirements = JSON.parse(reqData);
                    } else if (Array.isArray(reqData)) {
                      requirements = reqData;
                    } else if (reqData && typeof reqData === 'object') {
                      requirements = [reqData];
                    }
                  } catch (e) {
                    requirements = [];
                  }
                  
                  const amcInfo = requirements.find((r: any) => r?.amc_info)?.amc_info || null;
                  const qrPhotos = requirements.find((r: any) => r?.qr_photos)?.qr_photos || null;
                  const billPhotos = requirements.find((r: any) => r?.bill_photos)?.bill_photos || [];
                  const paymentScreenshot = qrPhotos?.payment_screenshot || null;
                  
                  return (
                    <div key={job.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold text-lg">
                            {(job as any).job_number || job.jobNumber}
                          </div>
                          <div className="text-sm text-gray-600">
                            {(job as any).service_type || job.serviceType} - {(job as any).service_sub_type || job.serviceSubType}
                          </div>
                          {formattedCompletedAt && (
                            <div className="text-xs text-gray-500 mt-1">
                              Completed on {formattedCompletedAt}
                            </div>
                          )}
                        </div>
                        <Badge className="bg-green-100 text-green-800">Completed</Badge>
                      </div>
                      
                      <div className="space-y-3 mt-4 pt-4 border-t border-gray-200">
                        {(actualCost || paymentAmount) && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700 w-32">Amount:</span>
                            <span className="text-sm text-gray-900">₹{actualCost || paymentAmount}</span>
                          </div>
                        )}
                        
                        {paymentMethod && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700 w-32">Payment Mode:</span>
                            <span className="text-sm text-gray-900">{
                              paymentMethod === 'CASH' ? 'Cash' : 
                              paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER' ? 'Online' : 
                              paymentMethod
                            }</span>
                          </div>
                        )}
                        
                        {(() => {
                          let leadSource: string | null = null;
                          for (const req of requirements) {
                            if (req && typeof req === 'object') {
                              if (req.lead_source) {
                                leadSource = req.lead_source;
                                break;
                              }
                            }
                          }
                          if (!leadSource && requirements.length > 0) {
                            const flatReq = requirements.flat();
                            for (const req of flatReq) {
                              if (req && typeof req === 'object' && req.lead_source) {
                                leadSource = req.lead_source;
                                break;
                              }
                            }
                          }
                          
                          if (leadSource) {
                            return (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700 w-32">Lead Source:</span>
                                <span className="text-sm text-gray-900">{leadSource}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        
                        {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && qrPhotos?.selected_qr_code_name && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700 w-32">QR Code:</span>
                            <span className="text-sm text-gray-900">{qrPhotos.selected_qr_code_name}</span>
                          </div>
                        )}
                        
                        {paymentScreenshot || (billPhotos && Array.isArray(billPhotos) && billPhotos.length > 0) ? (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="font-medium text-gray-900 mb-3">Payment & Bill Documents</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {paymentScreenshot && (
                                <div 
                                  className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-blue-300 hover:border-blue-500 transition-all"
                                  onClick={() => {
                                    if (onPhotoClick) {
                                      onPhotoClick(paymentScreenshot, 0, 1);
                                    }
                                  }}
                                >
                                  <img 
                                    src={paymentScreenshot} 
                                    alt="Payment Screenshot" 
                                    className="w-full h-40 sm:h-48 object-cover transition-transform group-hover:scale-105" 
                                  />
                                  <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded">
                                    Payment
                                  </div>
                                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium bg-black bg-opacity-50 px-3 py-1 rounded">
                                      Click to view
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {billPhotos && Array.isArray(billPhotos) && billPhotos.length > 0 && billPhotos.map((photo, idx) => (
                                <div 
                                  key={idx} 
                                  className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-green-300 hover:border-green-500 transition-all"
                                  onClick={() => {
                                    if (onBillPhotosClick) {
                                      onBillPhotosClick(billPhotos, idx);
                                    } else if (onPhotoClick) {
                                      onPhotoClick(photo, idx, billPhotos.length);
                                    }
                                  }}
                                >
                                  <img 
                                    src={photo} 
                                    alt={`Bill photo ${idx + 1}`} 
                                    className="w-full h-40 sm:h-48 object-cover transition-transform group-hover:scale-105" 
                                  />
                                  <div className="absolute top-2 left-2 bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded">
                                    Bill {idx + 1}
                                  </div>
                                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium bg-black bg-opacity-50 px-3 py-1 rounded">
                                      Click to view
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        
                        {amcInfo && (
                          <div className="mt-3 pt-3 border-t border-green-300 bg-green-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-green-600 text-white">AMC Active</Badge>
                              <div className="font-semibold text-gray-900">AMC Details</div>
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600 font-medium w-32">Start Date:</span>
                                <span className="text-gray-900 font-semibold">{amcInfo.date_given ? new Date(amcInfo.date_given).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600 font-medium w-32">End Date:</span>
                                <span className="text-gray-900 font-semibold">{amcInfo.end_date ? new Date(amcInfo.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600 font-medium w-32">Duration:</span>
                                <span className="text-gray-900 font-semibold">{amcInfo.years || 1} {amcInfo.years === 1 ? 'year' : 'years'}</span>
                              </div>
                              {amcInfo.includes_prefilter !== undefined && (
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-600 font-medium w-32">Includes Prefilter:</span>
                                  <span className="text-gray-900 font-semibold">{amcInfo.includes_prefilter ? 'Yes' : 'No'}</span>
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
                                      <div className="mt-3 pt-3 border-t border-green-200">
                                        <div className="text-gray-600 font-medium mb-2">Description / Summary:</div>
                                        <div className="text-gray-900 whitespace-pre-wrap bg-white p-2 rounded border border-green-200">{description}</div>
                                      </div>
                                    )}
                                    {additionalInfo && !description && (
                                <div className="mt-3 pt-3 border-t border-green-200">
                                  <div className="text-gray-600 font-medium mb-2">Additional Info:</div>
                                        <div className="text-gray-900 whitespace-pre-wrap bg-white p-2 rounded border border-green-200">{additionalInfo}</div>
                                </div>
                              )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                        
                        {completionNotes && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="font-medium text-gray-900 mb-1">Notes:</div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap">{completionNotes}</div>
                          </div>
                        )}
                        
                        {completedByName && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-700 w-32">Completed By:</span>
                              <span className="text-sm text-gray-900">{completedByName}</span>
                            </div>
                          </div>
                        )}
                        
                        {job.description && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="font-medium text-gray-900 mb-1">Description:</div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerReportDialog;

