import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Customer, Job, Technician } from '@/types';
import { db } from '@/lib/supabase';
import { getCustomerGstNumber } from '@/lib/customerGst';
import { CheckCircle } from 'lucide-react';
import { customerNameClassName } from '@/lib/customerDisplay';
import { getJobEquipmentDisplay, isOfficeCompletedJob } from '@/lib/adminUtils';
import { formatCompletedWhen } from '@/lib/relativeTime';
import { getDocumentBrandLabel, normalizeDocumentBrand } from '@/lib/service-brands';

interface CustomerReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  technicians: Technician[];
  onPhotoClick?: (url: string, index: number, total: number) => void;
  onBillPhotosClick?: (photos: string[], index: number) => void;
  /** Admin: jump to Completed tab for this job's completion date. */
  onNavigateToCompletedJob?: (customer: Customer, job: Job) => void;
}

const CustomerReportDialog: React.FC<CustomerReportDialogProps> = ({
  open,
  onOpenChange,
  customer,
  technicians,
  onPhotoClick,
  onBillPhotosClick,
  onNavigateToCompletedJob,
}) => {
  const [customerReportJobs, setCustomerReportJobs] = useState<any[]>([]);
  const [loadingCustomerReportJobs, setLoadingCustomerReportJobs] = useState(false);

  const customerId = customer?.id;

  useEffect(() => {
    if (!open) {
      setCustomerReportJobs([]);
      return;
    }
    if (!customerId) return;

    let cancelled = false;
    const loadCustomerReportJobs = async () => {
      setLoadingCustomerReportJobs(true);
      try {
        const { data, error } = await db.jobs.getByCustomerIdForReportEnriched(customerId);
        if (cancelled) return;
        if (error) {
          console.error('Error loading customer report jobs:', error);
          return;
        }
        setCustomerReportJobs(data || []);
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading customer report jobs:', error);
        }
      } finally {
        if (!cancelled) {
          setLoadingCustomerReportJobs(false);
        }
      }
    };

    void loadCustomerReportJobs();
    return () => {
      cancelled = true;
    };
  }, [open, customerId]);

  if (!customer) return null;

  const customerGstin = getCustomerGstNumber(customer);

  const completedJobs = customerReportJobs
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>
            Customer Report -{' '}
            <span className={customerNameClassName(customer)}>{customer.fullName || 'Unknown'}</span>
          </DialogTitle>
          <DialogDescription>
            Complete service history and job details
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Customer Info */}
          <div className="bg-muted/40 p-4 rounded-lg">
            <h3 className="font-semibold text-lg mb-3">Customer Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="min-w-0 break-words">
                <span className="text-muted-foreground">Name:</span>{' '}
                <span className={customerNameClassName(customer)}>{customer.fullName}</span>
              </div>
              <div className="min-w-0 break-words">
                <span className="text-muted-foreground">Customer ID:</span> {customer.customerId}
              </div>
              <div className="min-w-0 break-words">
                <span className="text-muted-foreground">Phone:</span> {customer.phone}
              </div>
              <div className="min-w-0 break-all">
                <span className="text-muted-foreground break-normal">Email:</span> {customer.email && customer.email.trim() && !customer.email.toLowerCase().includes('nomail') && !customer.email.toLowerCase().includes('no@mail')
                  ? customer.email
                  : 'nomail@mail'}
              </div>
              {customerGstin ? (
                <div className="min-w-0 break-words sm:col-span-2">
                  <span className="text-muted-foreground">GSTIN:</span>{' '}
                  <span className="font-mono tracking-wide">{customerGstin}</span>
                </div>
              ) : null}
              {((customer as any).raw_water_tds != null && (customer as any).raw_water_tds > 0) && (
                <div className="min-w-0 break-words">
                  <span className="text-muted-foreground">Raw Water TDS:</span> {(customer as any).raw_water_tds} ppm
                </div>
              )}
            </div>
          </div>

          {/* Completed Jobs */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Completed Jobs ({completedJobs.length})</h3>
            {loadingCustomerReportJobs ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3"></div>
                <p className="text-sm">Loading completed jobs...</p>
              </div>
            ) : completedJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground/70" />
                <p className="text-sm">No completed jobs found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {completedJobs.map((job) => {
                  const completionNotes = (job as any).completion_notes || job.completionNotes || '';
                  const completedAt = (job as any).completed_at || job.completedAt || null;
                  const completedWhenLabel = completedAt ? formatCompletedWhen(completedAt) : null;
                  const equipmentDisplay = getJobEquipmentDisplay(
                    job as Record<string, unknown>,
                    customer as Record<string, unknown>
                  );
                  const completedBy = (job as any).completed_by || job.completedBy || null;
                  const actualCost = (job as any).actual_cost || job.actual_cost || null;
                  const paymentAmount = (job as any).payment_amount || job.payment_amount || null;
                  const paymentMethod = (job as any).payment_method || job.payment_method || null;
                  
                  const isDirectSale = ((job as any).service_sub_type || job.serviceSubType) === 'Direct Sale';
                  let completedByName = 'Unknown';
                  if (isDirectSale || isOfficeCompletedJob(job)) {
                    completedByName = 'Office';
                  } else if (completedBy) {
                    if (completedBy === 'admin' || completedBy === 'Admin') {
                      completedByName = 'Admin';
                    } else {
                      const completedByTechnician = technicians.find(tech => (tech.id || (tech as any).id) === completedBy);
                      completedByName = completedByTechnician?.fullName || (completedByTechnician as any)?.full_name || 'Technician';
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
                  const billPhotosReq = requirements.find((r: any) => r?.bill_photos)?.bill_photos;
                  const toUrl = (v: any): string | null => {
                    if (!v) return null;
                    if (typeof v === 'string') {
                      const s = v.trim();
                      return s.startsWith('http') ? s : null;
                    }
                    if (typeof v === 'object') {
                      const s =
                        (typeof v.secure_url === 'string' ? v.secure_url : null) ||
                        (typeof v.url === 'string' ? v.url : null);
                      if (s) {
                        const trimmed = s.trim();
                        return trimmed.startsWith('http') ? trimmed : null;
                      }
                    }
                    return null;
                  };

                  const billPhotos = Array.isArray(billPhotosReq)
                    ? billPhotosReq.map(toUrl).filter((u): u is string => !!u)
                    : [];

                  const afterPhotoUrls: string[] = Array.isArray((job as any).after_photos || (job as any).afterPhotos)
                    ? ((job as any).after_photos || (job as any).afterPhotos).map(toUrl).filter((u): u is string => !!u)
                    : [];

                  // All payment screenshots: from qr_photos.payment_screenshot (online) and payment_photos (CASH or all)
                  const paymentScreenshots: string[] = [];
                  const qrPayment = toUrl(qrPhotos?.payment_screenshot);
                  if (qrPayment) paymentScreenshots.push(qrPayment);
                  const paymentPhotosReq = requirements.find((r: any) => r?.payment_photos);
                  const paymentPhotos = paymentPhotosReq?.payment_photos;
                  if (Array.isArray(paymentPhotos)) {
                    paymentPhotos.forEach((p: any) => {
                      const u = toUrl(p);
                      if (u && !paymentScreenshots.some(ex => ex.split('?')[0].toLowerCase() === u.split('?')[0].toLowerCase())) {
                        paymentScreenshots.push(u);
                      }
                    });
                  }
                  // Exclude all payment URLs from bill photos so they only show under Payment (no limit)
                  const paymentNormSet = new Set(paymentScreenshots.map(u => u.split('?')[0].toLowerCase()));
                  let billPhotosOnly = billPhotos.filter((url: string) => {
                    const norm = typeof url === 'string' ? url.split('?')[0].toLowerCase() : '';
                    return norm && !paymentNormSet.has(norm);
                  });

                  // Fallback: if requirements didn't include bill/payment photos but we have after_photos saved,
                  // show them so Reports still displays photos for older/inconsistent job rows.
                  if (paymentScreenshots.length === 0 && billPhotosOnly.length === 0 && afterPhotoUrls.length > 0) {
                    billPhotosOnly = afterPhotoUrls;
                  }

                  return (
                    <div key={job.id} className="border border-border rounded-lg p-4 bg-card">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold text-lg">
                            {(job as any).job_number || job.jobNumber}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {(job as any).service_type || job.serviceType} - {(job as any).service_sub_type || job.serviceSubType}
                          </div>
                          {completedWhenLabel && (
                            onNavigateToCompletedJob ? (
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:underline mt-1 text-left cursor-pointer"
                                onClick={() => onNavigateToCompletedJob(customer, job as Job)}
                              >
                                Completed {completedWhenLabel}
                              </button>
                            ) : (
                              <div className="text-xs text-muted-foreground mt-1">
                                Completed {completedWhenLabel}
                              </div>
                            )
                          )}
                        </div>
                        <Badge className="bg-green-100 text-green-800">Completed</Badge>
                      </div>
                      
                      <div className="space-y-3 mt-4 pt-4 border-t border-border">
                        {(actualCost || paymentAmount) && (
                          <div className="flex items-start gap-2">
                            <span className="text-sm font-medium text-foreground/90 w-36 shrink-0">Amount:</span>
                            <span className="text-sm text-foreground flex-1 min-w-0 break-words">₹{actualCost || paymentAmount}</span>
                          </div>
                        )}
                        
                        {paymentMethod && (
                          <div className="flex items-start gap-2">
                            <span className="text-sm font-medium text-foreground/90 w-36 shrink-0">Payment Mode:</span>
                            <span className="text-sm text-foreground flex-1 min-w-0 break-words">{
                              paymentMethod === 'CASH' ? 'Cash' : 
                              paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER' ? 'Online' : 
                              paymentMethod
                            }</span>
                          </div>
                        )}

                        {(() => {
                          const rawBrand = (job as any).service_brand ?? (job as any).serviceBrand;
                          const brand = normalizeDocumentBrand(rawBrand);
                          if (!brand) return null;
                          return (
                            <div className="flex items-start gap-2">
                              <span className="text-sm font-medium text-foreground/90 w-36 shrink-0">Service Brand:</span>
                              <span className="text-sm text-foreground flex-1 min-w-0 break-words">{getDocumentBrandLabel(brand)}</span>
                            </div>
                          );
                        })()}
                        
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
                              <div className="flex items-start gap-2">
                                <span className="text-sm font-medium text-foreground/90 w-36 shrink-0">Lead Source:</span>
                                <span className="text-sm text-foreground flex-1 min-w-0 break-words">{leadSource}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {(() => {
                          const tds = (customer as any).raw_water_tds ?? (customer as any).rawWaterTds;
                          return tds != null && tds > 0 ? (
                            <div className="flex items-start gap-2">
                              <span className="text-sm font-medium text-foreground/90 w-36 shrink-0">Raw Water TDS:</span>
                              <span className="text-sm text-foreground flex-1 min-w-0 break-words">{tds} ppm</span>
                            </div>
                          ) : null;
                        })()}
                        
                        {(paymentMethod === 'ONLINE' || paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') && qrPhotos?.selected_qr_code_name && (
                          <div className="flex items-start gap-2">
                            <span className="text-sm font-medium text-foreground/90 w-36 shrink-0">QR Code:</span>
                            <span className="text-sm text-foreground flex-1 min-w-0 break-words">{qrPhotos.selected_qr_code_name}</span>
                          </div>
                        )}

                        {equipmentDisplay && (
                          <div className="flex items-start gap-2">
                            <span className="text-sm font-medium text-foreground/90 w-36 shrink-0">{equipmentDisplay.label}:</span>
                            <span className="text-sm text-foreground flex-1 min-w-0 break-words">{equipmentDisplay.value}</span>
                          </div>
                        )}

                        {completionNotes && (
                          <div className="rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-2.5">
                            <div className="text-xs font-semibold uppercase tracking-wide text-violet-800 mb-1">
                              Notes
                            </div>
                            <div className="text-sm text-violet-950/90 whitespace-pre-wrap">{completionNotes}</div>
                          </div>
                        )}
                        
                        {paymentScreenshots.length > 0 || (billPhotosOnly && billPhotosOnly.length > 0) ? (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="font-medium text-foreground mb-3">Payment & Bill Documents</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {paymentScreenshots.map((paymentUrl, idx) => (
                                <div 
                                  key={`payment-${idx}`}
                                  className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-blue-300 hover:border-blue-500 transition-all"
                                  onClick={() => {
                                    if (onPhotoClick) {
                                      onPhotoClick(paymentUrl, idx, paymentScreenshots.length);
                                    }
                                  }}
                                >
                                  <img 
                                    src={paymentUrl} 
                                    alt={`Payment ${idx + 1}`} 
                                    className="w-full h-40 sm:h-48 object-cover transition-transform group-hover:scale-105" 
                                  />
                                  <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded">
                                    Payment {paymentScreenshots.length > 1 ? idx + 1 : ''}
                                  </div>
                                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium bg-black bg-opacity-50 px-3 py-1 rounded">
                                      Click to view
                                    </div>
                                  </div>
                                </div>
                              ))}
                              
                              {billPhotosOnly && billPhotosOnly.length > 0 && billPhotosOnly.map((photo: string, idx: number) => (
                                <div 
                                  key={idx} 
                                  className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-green-300 hover:border-green-500 transition-all"
                                  onClick={() => {
                                    if (onBillPhotosClick) {
                                      onBillPhotosClick(billPhotosOnly, idx);
                                    } else if (onPhotoClick) {
                                      onPhotoClick(photo, idx, billPhotosOnly.length);
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
                              <div className="font-semibold text-foreground">AMC Details</div>
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground font-medium w-32">Start Date:</span>
                                <span className="text-foreground font-semibold">{amcInfo.date_given ? new Date(amcInfo.date_given).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground font-medium w-32">End Date:</span>
                                <span className="text-foreground font-semibold">{amcInfo.end_date ? new Date(amcInfo.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground font-medium w-32">Duration:</span>
                                <span className="text-foreground font-semibold">{amcInfo.years || 1} {amcInfo.years === 1 ? 'year' : 'years'}</span>
                              </div>
                              {amcInfo.includes_prefilter !== undefined && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground font-medium w-32">Includes Prefilter:</span>
                                  <span className="text-foreground font-semibold">{amcInfo.includes_prefilter ? 'Yes' : 'No'}</span>
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
                                        <div className="text-muted-foreground font-medium mb-2">Description / Summary:</div>
                                        <div className="text-foreground whitespace-pre-wrap bg-card p-2 rounded border border-green-200">{description}</div>
                                      </div>
                                    )}
                                    {additionalInfo && !description && (
                                <div className="mt-3 pt-3 border-t border-green-200">
                                  <div className="text-muted-foreground font-medium mb-2">Additional Info:</div>
                                        <div className="text-foreground whitespace-pre-wrap bg-card p-2 rounded border border-green-200">{additionalInfo}</div>
                                </div>
                              )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                        
                        {completedByName && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="flex items-start gap-2">
                              <span className="text-sm font-medium text-foreground/90 w-36 shrink-0">Completed By:</span>
                              <span className="text-sm text-foreground flex-1 min-w-0 break-words">{completedByName}</span>
                            </div>
                          </div>
                        )}

                        {job.description && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="font-medium text-foreground mb-1">Description:</div>
                            <div className="text-sm text-foreground/90 whitespace-pre-wrap">{job.description}</div>
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

