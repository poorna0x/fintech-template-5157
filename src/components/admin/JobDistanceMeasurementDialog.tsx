import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, ExternalLink, MapPin, Navigation, RefreshCw } from 'lucide-react';
import type { Job, Technician } from '@/types';

export type JobTechnicianDistanceRow = {
  technician: Technician;
  distance: string;
  duration: string;
  distanceValue?: number;
  durationValue?: number;
  estimatedArrival?: string;
  lastUpdated?: string;
  hasLocation: boolean;
  isCalculating: boolean;
  isAssigned?: boolean;
  isApproximate?: boolean;
};

export type JobCustomDistanceResult = {
  fromLabel: string;
  toLabel: string;
  distance: string;
  duration: string;
  isApproximate?: boolean;
};

type MeasureStopOption = { value: string; label: string };

type JobDistanceMeasurementDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedJob: Job | null;
  technicianDistances: JobTechnicianDistanceRow[];
  isCalculatingDistances: boolean;
  measureStopOptions: MeasureStopOption[];
  customDistanceFromId: string;
  customDistanceToId: string;
  onCustomDistanceFromChange: (value: string) => void;
  onCustomDistanceToChange: (value: string) => void;
  isLoadingCustomDistance: boolean;
  isOpeningCustomDistanceMaps: boolean;
  customDistanceResult: JobCustomDistanceResult | null;
  onCalculateCustomDistance: () => void;
  onOpenCustomDistanceInMaps: () => void;
};

export default function JobDistanceMeasurementDialog({
  open,
  onOpenChange,
  selectedJob,
  technicianDistances,
  isCalculatingDistances,
  measureStopOptions,
  customDistanceFromId,
  customDistanceToId,
  onCustomDistanceFromChange,
  onCustomDistanceToChange,
  isLoadingCustomDistance,
  isOpeningCustomDistanceMaps,
  customDistanceResult,
  onCalculateCustomDistance,
  onOpenCustomDistanceInMaps,
}: JobDistanceMeasurementDialogProps) {
  const customDistanceDisabled =
    isCalculatingDistances ||
    isLoadingCustomDistance ||
    isOpeningCustomDistanceMaps ||
    !customDistanceFromId ||
    !customDistanceToId ||
    customDistanceFromId === customDistanceToId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 shrink-0" />
            Measure distance
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Driving distance from this technician&apos;s last location to this job. Use custom distance
            below to compare other stops or open a route in Google Maps.
          </p>
        </DialogHeader>

        <div className="mt-4 min-w-0">
          {isCalculatingDistances ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mr-2" />
              <span className="text-gray-600">Calculating distances...</span>
            </div>
          ) : technicianDistances.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No technicians found</div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2">
                {technicianDistances.map((item) => (
                  <div
                    key={item.technician.id}
                    className={`p-4 border rounded-lg ${
                      item.isAssigned
                        ? 'border-blue-500 bg-blue-50 hover:bg-blue-100'
                        : item.hasLocation && item.distance
                          ? 'border-gray-200 hover:border-blue-300 bg-white'
                          : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4
                            className={`font-semibold truncate ${
                              item.isAssigned ? 'text-blue-900' : 'text-gray-900'
                            }`}
                          >
                            {item.technician.fullName}
                          </h4>
                          {item.isAssigned && (
                            <Badge className="bg-blue-600 text-white text-xs">Assigned</Badge>
                          )}
                        </div>
                        <p className={`text-sm mt-1 ${item.isAssigned ? 'text-blue-700' : 'text-gray-500'}`}>
                          {item.technician.employeeId}
                        </p>
                        {item.hasLocation ? (
                          <div className="mt-2 space-y-2">
                            {item.isCalculating ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Calculating...
                              </div>
                            ) : item.distance ? (
                              <div className="flex flex-wrap items-center gap-4">
                                {item.distanceValue !== undefined && item.distanceValue <= 1000 ? (
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-green-600" />
                                    <span className="font-medium text-green-600">
                                      Technician is at customer&apos;s location
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <MapPin className="h-4 w-4 text-blue-600" />
                                      <span
                                        className={`font-medium ${
                                          item.isAssigned ? 'text-blue-900' : 'text-gray-900'
                                        }`}
                                      >
                                        {item.distance}
                                      </span>
                                      {item.isApproximate && (
                                        <span className="text-[11px] text-gray-400 italic">
                                          approximate (straight-line)
                                        </span>
                                      )}
                                    </div>
                                    {item.duration && (
                                      <div
                                        className={`flex items-center gap-2 text-sm ${
                                          item.isAssigned ? 'text-blue-700' : 'text-gray-600'
                                        }`}
                                      >
                                        <Clock className="h-4 w-4" />
                                        {item.duration}
                                      </div>
                                    )}
                                    {item.isAssigned && item.estimatedArrival && (
                                      <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                                        <Clock className="h-4 w-4" />
                                        Estimated arrival: {item.estimatedArrival}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">Distance calculation failed</span>
                            )}
                            {item.lastUpdated && (
                              <div
                                className={`flex items-center gap-2 text-xs ${
                                  item.isAssigned ? 'text-blue-600' : 'text-gray-500'
                                }`}
                              >
                                <Clock className="h-3 w-3" />
                                Last updated: {item.lastUpdated}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            <div className="text-sm text-gray-400 flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              No location data available
                            </div>
                            {item.lastUpdated && (
                              <div
                                className={`flex items-center gap-2 text-xs ${
                                  item.isAssigned ? 'text-blue-600' : 'text-gray-500'
                                }`}
                              >
                                <Clock className="h-3 w-3" />
                                Last updated: {item.lastUpdated}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 space-y-3 min-w-0">
          <p className="text-sm font-medium text-gray-800">Custom distance</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="measure-from">From</Label>
              <Select
                value={customDistanceFromId}
                onValueChange={onCustomDistanceFromChange}
                disabled={!selectedJob || isCalculatingDistances}
              >
                <SelectTrigger id="measure-from" className="w-full max-w-full">
                  <SelectValue placeholder="Choose start" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(280px,50vh)] max-w-[min(calc(100vw-2rem),36rem)]">
                  {measureStopOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="measure-to">To</Label>
              <Select
                value={customDistanceToId}
                onValueChange={onCustomDistanceToChange}
                disabled={!selectedJob || isCalculatingDistances}
              >
                <SelectTrigger id="measure-to" className="w-full max-w-full">
                  <SelectValue placeholder="Choose end" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(280px,50vh)] max-w-[min(calc(100vw-2rem),36rem)]">
                  {measureStopOptions.map((o) => (
                    <SelectItem key={`to-${o.value}`} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              size="default"
              className="w-full justify-center shrink-0"
              disabled={customDistanceDisabled}
              onClick={onCalculateCustomDistance}
            >
              {isLoadingCustomDistance ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin shrink-0" />
                  Calculating…
                </>
              ) : (
                'Calculate in app'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="default"
              className="w-full justify-center shrink-0"
              disabled={customDistanceDisabled}
              onClick={onOpenCustomDistanceInMaps}
            >
              {isOpeningCustomDistanceMaps ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin shrink-0" />
                  Opening…
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2 shrink-0" />
                  Open route in Google Maps
                </>
              )}
            </Button>
          </div>
          {customDistanceResult && (
            <div className="rounded-md border border-blue-200 bg-blue-50/90 p-3 text-sm">
              <div className="font-medium text-gray-900 break-words">
                {customDistanceResult.fromLabel}
                <span className="text-gray-400 mx-1">→</span>
                {customDistanceResult.toLabel}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-gray-800">
                <span className="font-medium">{customDistanceResult.distance}</span>
                {customDistanceResult.isApproximate && (
                  <span className="text-[11px] text-gray-400 italic">approximate (straight-line)</span>
                )}
                {customDistanceResult.duration ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4 shrink-0" />
                    {customDistanceResult.duration}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
