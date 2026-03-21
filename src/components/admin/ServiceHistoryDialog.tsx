import React from 'react';
import { customerNameClassName } from '@/lib/customerDisplay';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Customer, Job } from '@/types';
import { Wrench, User, Calendar, History } from 'lucide-react';

interface ServiceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  history: Job[];
}

const ServiceHistoryDialog: React.FC<ServiceHistoryDialogProps> = ({
  open,
  onOpenChange,
  customer,
  history
}) => {
  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Service History</DialogTitle>
          <DialogDescription asChild>
            <span>
              Complete service history for {customer.customer_id || customer.customerId} -{' '}
              <span className={customerNameClassName(customer)}>
                {customer.fullName || customer.full_name}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {history.length > 0 ? (
            <div className="space-y-4">
              {history.map((job, index) => {
                const lastServiceDate = job.completedAt || job.scheduledDate || job.createdAt;
                const serviceDate = lastServiceDate ? new Date(lastServiceDate) : null;
                
                return (
                  <Card key={job.id} className="p-4 border-l-4 border-l-blue-500">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono text-xs font-semibold">
                            {job.jobNumber || job.job_number || `Job #${index + 1}`}
                          </Badge>
                          <Badge 
                            variant={
                              job.status === 'COMPLETED' ? 'default' :
                              job.status === 'IN_PROGRESS' ? 'secondary' :
                              job.status === 'CANCELLED' ? 'destructive' : 
                              job.status === 'ASSIGNED' ? 'outline' : 'outline'
                            }
                            className="text-xs"
                          >
                            {job.status?.replace('_', ' ') || 'PENDING'}
                          </Badge>
                          {job.priority && (
                            <Badge variant="outline" className="text-xs">
                              {job.priority}
                            </Badge>
                          )}
                        </div>
                        {serviceDate && (
                          <div className="text-right">
                            <div className="text-sm font-semibold text-gray-900">
                              {job.completedAt ? 'Completed' : job.status === 'IN_PROGRESS' ? 'In Progress' : 'Scheduled'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {serviceDate.toLocaleDateString('en-IN', { 
                                day: 'numeric', 
                                month: 'short', 
                                year: 'numeric' 
                              })}
                            </div>
                            {job.completedAt && (
                              <div className="text-xs text-gray-500">
                                {new Date(job.completedAt).toLocaleTimeString('en-IN', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-gray-500" />
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {job.serviceType || job.service_type || 'N/A'} - {job.serviceSubType || job.service_sub_type || 'N/A'}
                              </div>
                              {(job.brand && job.model && 
                                !job.brand.toLowerCase().includes('not specified') && 
                                !job.brand.toLowerCase().includes('n/a') &&
                                !job.model.toLowerCase().includes('not specified') && 
                                !job.model.toLowerCase().includes('n/a')) && (
                                <div className="text-xs text-gray-600">
                                  {job.brand} {job.model}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {job.assignedTechnician ? (
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-500" />
                              <div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {job.assignedTechnician.fullName}
                                </div>
                                {job.assignedTechnician.phone && (
                                  <div className="text-xs text-gray-600">
                                    {job.assignedTechnician.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <User className="w-4 h-4" />
                              <span>No technician assigned</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {job.scheduledDate && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>
                            Scheduled: {new Date(job.scheduledDate).toLocaleDateString('en-IN', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric' 
                            })}
                            {job.scheduledTimeSlot && (
                              <span className="ml-1">
                                ({job.scheduledTimeSlot.replace('_', ' ')})
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      {job.description && (
                        <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md">
                          <div className="font-medium mb-1">Description:</div>
                          <div className="break-words">{job.description}</div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
                        {job.estimated_cost !== undefined && job.estimated_cost > 0 && (
                          <div>
                            <div className="text-xs text-gray-500">Estimated Cost</div>
                            <div className="text-sm font-semibold">₹{job.estimated_cost}</div>
                          </div>
                        )}
                        {job.actual_cost !== undefined && job.actual_cost > 0 && (
                          <div>
                            <div className="text-xs text-gray-500">Actual Cost</div>
                            <div className="text-sm font-semibold">₹{job.actual_cost}</div>
                          </div>
                        )}
                        {job.payment_status && (
                          <div>
                            <div className="text-xs text-gray-500">Payment Status</div>
                            <Badge 
                              variant={job.payment_status === 'PAID' ? 'default' : 'outline'}
                              className="text-xs mt-1"
                            >
                              {job.payment_status}
                            </Badge>
                          </div>
                        )}
                        {job.estimatedDuration && (
                          <div>
                            <div className="text-xs text-gray-500">Duration</div>
                            <div className="text-sm font-semibold">{job.estimatedDuration} min</div>
                          </div>
                        )}
                      </div>

                      {job.completionNotes && (
                        <div className="text-sm text-gray-700 bg-green-50 p-3 rounded-md border border-green-200">
                          <div className="font-medium mb-1 text-green-800">Completion Notes:</div>
                          <div className="break-words text-green-900">{job.completionNotes}</div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <History className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <div className="text-lg font-medium">No service history yet</div>
              <div className="text-sm">Create a new job to start building service history</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceHistoryDialog;

