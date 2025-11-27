import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { Job, Technician } from '@/types';
import { TechnicianDistance } from '@/lib/distance';

interface ReassignJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  selectedTechnicianId: string;
  assignmentType: 'direct' | 'distance';
  technicianDistances: TechnicianDistance[];
  loadingDistances: boolean;
  onTechnicianSelect: (id: string) => void;
  onAssignmentTypeChange: (type: 'direct' | 'distance') => void;
  onCalculateDistances: () => Promise<void>;
  onReloadTechnicians: () => Promise<void>;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

const ReassignJobDialog: React.FC<ReassignJobDialogProps> = ({
  open,
  onOpenChange,
  job,
  technicians,
  selectedTechnicianId,
  assignmentType,
  technicianDistances,
  loadingDistances,
  onTechnicianSelect,
  onAssignmentTypeChange,
  onCalculateDistances,
  onReloadTechnicians,
  onSave,
  onCancel
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[600px] max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Reassign Job to Technician</DialogTitle>
          <DialogDescription className="text-sm">
            Choose how to reassign this job
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 sm:space-y-6 overflow-y-auto flex-1 pr-1 sm:pr-2">
          {/* Job Details */}
          {job && (
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                <span className="font-mono font-bold text-base sm:text-lg">{(job as any)?.job_number}</span>
                <Badge className="bg-blue-100 text-blue-800 text-xs sm:text-sm w-fit">
                  {(job as any)?.service_type} - {(job as any)?.service_sub_type}
                </Badge>
              </div>
              <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                <p><strong>Customer:</strong> {(job as any)?.customer?.full_name || 'N/A'}</p>
                <p><strong>Scheduled:</strong> {(job as any)?.scheduled_date} - {(job as any)?.scheduled_time_slot}</p>
                <p className="truncate"><strong>Location:</strong> {(job as any)?.service_address?.street || 'N/A'}</p>
              </div>
              {(job as any)?.service_location?.googleLocation && (
                <a 
                  href={(job as any)?.service_location?.googleLocation}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs sm:text-sm font-medium mt-2"
                >
                  <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
                  Open in Google Maps
                </a>
              )}
            </div>
          )}

          {/* Assignment Type Selection */}
          <div className="space-y-3">
            <Label className="text-sm sm:text-base font-semibold">Assignment Method</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onAssignmentTypeChange('direct')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  assignmentType === 'direct'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="radio"
                    checked={assignmentType === 'direct'}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="font-medium text-sm sm:text-base">Direct Assignment</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">Assign directly to one technician</p>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  onAssignmentTypeChange('distance');
                  // Don't calculate distances automatically - user must click Refresh Distances button
                }}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  assignmentType === 'distance'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="radio"
                    checked={assignmentType === 'distance'}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="font-medium text-sm sm:text-base">By Distance</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">Auto-select nearest technician</p>
              </button>
            </div>
          </div>

          {/* Direct Assignment */}
          {assignmentType === 'direct' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <Label htmlFor="technician-select" className="text-sm sm:text-base">Select Technician</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onReloadTechnicians}
                  className="text-xs w-full sm:w-auto"
                >
                  🔄 Refresh List
                </Button>
              </div>
              <Select value={selectedTechnicianId} onValueChange={onTechnicianSelect}>
                <SelectTrigger className="w-full border border-gray-300 focus:border-blue-500 focus:ring-0 focus:ring-offset-0">
                  <SelectValue placeholder="Choose a technician" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] overflow-y-auto">
                  {technicians.length === 0 ? (
                    <SelectItem value="no-technicians" disabled>
                      No technicians available
                    </SelectItem>
                  ) : (
                    technicians
                      .filter(tech => tech.account_status !== 'INACTIVE')
                      .map((technician) => (
                        <SelectItem
                          key={technician.id}
                          value={technician.id || 'unknown'}
                        >
                          <div className="flex items-center gap-2">
                            <span>{technician.fullName || 'Unknown Technician'}</span>
                            {technician.employeeId && (
                              <span className="text-xs text-gray-500">({technician.employeeId})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Distance-based Assignment */}
          {assignmentType === 'distance' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <Label className="text-sm sm:text-base">Technicians ranked by distance</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await onReloadTechnicians();
                    await onCalculateDistances();
                  }}
                  className="text-xs w-full sm:w-auto"
                  disabled={loadingDistances}
                >
                  {loadingDistances ? (
                    <>
                      <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-1" />
                      Calculating...
                    </>
                  ) : (
                    <>
                      🔄 Refresh Distances
                    </>
                  )}
                </Button>
              </div>

              {loadingDistances ? (
                <div className="flex items-center justify-center p-6">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3" />
                  <span className="text-sm text-gray-600">Calculating distances...</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {technicians.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No technicians available</p>
                  ) : (
                    technicians
                      .filter(tech => tech.account_status !== 'INACTIVE')
                      .map(tech => {
                        const distanceInfo = technicianDistances.find(d => d.technicianId === tech.id);
                        return { tech, distanceInfo };
                      })
                      .sort((a, b) => {
                        if (!a.distanceInfo?.distance || a.distanceInfo.distance.status !== 'OK') return 1;
                        if (!b.distanceInfo?.distance || b.distanceInfo.distance.status !== 'OK') return -1;
                        return a.distanceInfo.distance.duration.value - b.distanceInfo.distance.duration.value;
                      })
                      .map(({ tech, distanceInfo }, index) => {
                        const hasDistance = distanceInfo?.distance && distanceInfo.distance.status === 'OK';
                        const isSelected = selectedTechnicianId === tech.id;
                        const rank = hasDistance ? index + 1 : undefined;
                        
                        return (
                          <div
                            key={tech.id}
                            onClick={() => onTechnicianSelect(tech.id)}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all outline-none ${
                              isSelected 
                                ? 'border-blue-500 bg-blue-50 ring-0' 
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {rank && rank <= 3 && (
                                  <span className={`text-sm font-bold flex-shrink-0 ${
                                    rank === 1 ? 'text-green-600' :
                                    rank === 2 ? 'text-blue-600' :
                                    'text-purple-600'
                                  }`}>
                                    #{rank}
                                  </span>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm sm:text-base truncate">{tech.fullName || 'Unknown'}</div>
                                  {tech.employeeId && (
                                    <div className="text-xs text-gray-500">{tech.employeeId}</div>
                                  )}
                                </div>
                              </div>
                              {hasDistance ? (
                                <div className="text-right flex-shrink-0">
                                  <div className="font-semibold text-sm text-gray-900">
                                    {distanceInfo.distance.duration.text}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {distanceInfo.distance.distance.text}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-gray-400 flex-shrink-0">
                                  No distance data
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter className="mt-4 flex-shrink-0 flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!selectedTechnicianId}
            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
          >
            Reassign Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReassignJobDialog;

