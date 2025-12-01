import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Job, Technician } from '@/types';
import { MapPin, Loader2, Navigation } from 'lucide-react';
import { toast } from 'sonner';

interface AssignJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  technicians: Technician[];
  selectedTechnicianId: string;
  onTechnicianSelect: (technicianId: string) => void;
  onReloadTechnicians: () => Promise<void>;
  onSave: () => Promise<void>;
  onCancel: () => void;
}

interface TechnicianWithDistance extends Technician {
  distance?: string;
  duration?: string;
  distanceValue?: number; // in meters for sorting
  isCalculating?: boolean;
}

const AssignJobDialog: React.FC<AssignJobDialogProps> = ({
  open,
  onOpenChange,
  job,
  technicians,
  selectedTechnicianId,
  onTechnicianSelect,
  onReloadTechnicians,
  onSave,
  onCancel
}) => {
  // All hooks must be called before any conditional returns
  const [techniciansWithDistances, setTechniciansWithDistances] = useState<TechnicianWithDistance[]>([]);
  const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);

  // Ensure Google Maps is loaded
  const ensureGoogleMapsLoaded = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
        resolve();
        return;
      }

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        reject(new Error('Google Maps API key not configured'));
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
      if (existingScript) {
        // Wait for it to load
        existingScript.addEventListener('load', () => {
          setTimeout(() => {
            if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
              resolve();
            } else {
              reject(new Error('Google Maps failed to load'));
            }
          }, 1000);
        });
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      script.onload = () => {
        setTimeout(() => {
          if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
            resolve();
          } else {
            reject(new Error('Google Maps failed to load'));
          }
        }, 1000);
      };

      script.onerror = () => {
        reject(new Error('Failed to load Google Maps'));
      };
    });
  }, []);

  // Calculate distances for all technicians
  const calculateDistances = useCallback(async () => {
    if (!job || !open) return;

    // Get job location coordinates (prefer customer location)
    const customer = (job.customer as any) || job.customer;
    const customerLocation = customer?.location || {};
    const serviceLocation = (job.service_location as any) || job.serviceLocation || {};
    
    const jobLocation = (() => {
      if (customerLocation.latitude && customerLocation.longitude && 
          customerLocation.latitude !== 0 && customerLocation.longitude !== 0) {
        return { lat: customerLocation.latitude, lng: customerLocation.longitude };
      }
      if (serviceLocation.latitude && serviceLocation.longitude && 
          serviceLocation.latitude !== 0 && serviceLocation.longitude !== 0) {
        return { lat: serviceLocation.latitude, lng: serviceLocation.longitude };
      }
      return null;
    })();

    if (!jobLocation) return;

    // Filter technicians with valid locations
    const techniciansWithLocation = technicians.filter((tech) => {
      const location = (tech as any).current_location || tech.currentLocation;
      return (
        location &&
        location.latitude &&
        location.longitude &&
        location.latitude !== 0 &&
        location.longitude !== 0
      );
    });

    if (techniciansWithLocation.length === 0) {
      // No technicians with location, just show all technicians without distances
      setTechniciansWithDistances(technicians.map(t => ({ ...t })));
      return;
    }

    setIsCalculatingDistances(true);

    try {
      await ensureGoogleMapsLoaded();

      if (!(window as any).google?.maps?.DistanceMatrixService) {
        throw new Error('DistanceMatrixService not available');
      }

      const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();

      // Prepare destinations (technician locations)
      const destinations = techniciansWithLocation.map((tech) => {
        const location = (tech as any).current_location || tech.currentLocation;
        return {
          lat: Number(location.latitude),
          lng: Number(location.longitude),
        };
      });

      // Calculate distances
      distanceMatrix.getDistanceMatrix(
        {
          origins: [{ lat: jobLocation.lat, lng: jobLocation.lng }],
          destinations: destinations,
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
          unitSystem: (window as any).google.maps.UnitSystem.METRIC,
        },
        (response: any, status: any) => {
          if (status === (window as any).google.maps.DistanceMatrixStatus.OK && response) {
            const techniciansWithDist: TechnicianWithDistance[] = techniciansWithLocation.map((tech, index) => {
              const element = response.rows[0]?.elements[index];
              if (element?.status === (window as any).google.maps.DistanceMatrixElementStatus.OK) {
                return {
                  ...tech,
                  distance: element.distance?.text || 'N/A',
                  duration: element.duration?.text || 'N/A',
                  distanceValue: element.distance?.value || Infinity, // in meters
                  isCalculating: false,
                };
              } else {
                return {
                  ...tech,
                  distance: 'N/A',
                  duration: 'N/A',
                  distanceValue: Infinity,
                  isCalculating: false,
                };
              }
            });

            // Add technicians without location
            const techniciansWithoutLocation = technicians
              .filter(t => {
                const location = (t as any).current_location || t.currentLocation;
                return !location || !location.latitude || !location.longitude || 
                       location.latitude === 0 || location.longitude === 0;
              })
              .map(t => ({ ...t, distance: 'N/A', duration: 'N/A', distanceValue: Infinity }));

            // Combine and sort by distance
            const allTechnicians = [...techniciansWithDist, ...techniciansWithoutLocation];
            allTechnicians.sort((a, b) => {
              // Sort by distance value (meters), then by name
              if (a.distanceValue !== undefined && b.distanceValue !== undefined) {
                return a.distanceValue - b.distanceValue;
              }
              if (a.distanceValue !== undefined) return -1;
              if (b.distanceValue !== undefined) return 1;
              return (a.fullName || '').localeCompare(b.fullName || '');
            });

            setTechniciansWithDistances(allTechnicians);
          } else {
            // Error calculating distances, just show technicians without sorting
            setTechniciansWithDistances(technicians.map(t => ({ ...t })));
            console.error('Distance calculation failed:', status);
          }
          setIsCalculatingDistances(false);
        }
      );
    } catch (error) {
      console.error('Error calculating distances:', error);
      setTechniciansWithDistances(technicians.map(t => ({ ...t })));
      setIsCalculatingDistances(false);
    }
  }, [job, technicians, open, ensureGoogleMapsLoaded]);

  // Reset distances when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTechniciansWithDistances([]);
      setIsCalculatingDistances(false);
    }
  }, [open]);

  // Early return after all hooks
  if (!job) return null;

  // Calculate variables after all hooks
  const customer = (job.customer as any) || job.customer;
  const customerLocation = customer?.location || {};
  const serviceLocation = (job.service_location as any) || job.serviceLocation || {};
  
  // Get job location coordinates (prefer customer location)
  const jobLocation = (() => {
    if (customerLocation.latitude && customerLocation.longitude && 
        customerLocation.latitude !== 0 && customerLocation.longitude !== 0) {
      return { lat: customerLocation.latitude, lng: customerLocation.longitude };
    }
    if (serviceLocation.latitude && serviceLocation.longitude && 
        serviceLocation.latitude !== 0 && serviceLocation.longitude !== 0) {
      return { lat: serviceLocation.latitude, lng: serviceLocation.longitude };
    }
    return null;
  })();
  
  // Generate Google Maps link - ALWAYS prefer customer's current location (from customer edit)
  // over job's stored location, so all jobs of a customer show the same location
  const googleMapsLink = (() => {
    // Helper function to get Google Maps link from a location object
    const getLocationLink = (location: any) => {
      if (!location) return '';
      
      // First check for googleLocation field (actual Google Maps URL - including short URLs)
      if (location.googleLocation || location.google_location) {
        const googleLoc = location.googleLocation || location.google_location;
        // Accept any Google Maps URL (including short URLs like maps.app.goo.gl)
        if (googleLoc && typeof googleLoc === 'string' && 
            (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
            !googleLoc.includes('localhost') && 
            !googleLoc.includes('127.0.0.1')) {
          return googleLoc;
        }
      }
      // If we have coordinates, always generate Google Maps link from coordinates (most reliable)
      if (location.latitude && location.longitude && 
          location.latitude !== 0 && location.longitude !== 0) {
        return `https://www.google.com/maps/place/${location.latitude},${location.longitude}`;
      }
      // Only use formattedAddress if it's actually a proper Google Maps URL (not localhost)
      if (location.formattedAddress && 
          typeof location.formattedAddress === 'string' &&
          (location.formattedAddress.includes('google.com/maps') || location.formattedAddress.includes('maps.app.goo.gl')) &&
          !location.formattedAddress.includes('localhost') &&
          !location.formattedAddress.includes('127.0.0.1')) {
        return location.formattedAddress;
      }
      return '';
    };
    
    // Priority 1: Use customer's current location (from customer edit) - this ensures all jobs show same location
    const customerLink = getLocationLink(customerLocation);
    if (customerLink) return customerLink;
    
    // Priority 2: Fall back to job's stored location (for backward compatibility)
    return getLocationLink(serviceLocation);
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[600px] max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Assign Job to Technician</DialogTitle>
          <DialogDescription className="text-sm">
            Choose how to assign this job
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 px-1">
          {/* Job Information */}
          <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
            <div className="font-semibold text-sm sm:text-base">
              {(job as any).job_number || job.jobNumber}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">
              {customer?.full_name || customer?.fullName || 'Customer'}
            </div>
            {(() => {
              // Check all possible locations for visible_address
              const serviceAddress = (job.service_address as any) || (job as any).service_address || job.serviceAddress || {};
              const customerAddress = customer?.address || (customer as any)?.address || {};
              
              // Try multiple possible locations for visible_address (prioritize this)
              let visibleLocation = 
                serviceAddress?.visible_address || 
                (serviceAddress as any)?.visibleAddress ||
                customerAddress?.visible_address || 
                (customerAddress as any)?.visibleAddress ||
                (customer as any)?.visible_address ||
                '';
              
              // If visible_location contains a full address (has commas), extract just the first part (area name)
              if (visibleLocation && visibleLocation.includes(',')) {
                visibleLocation = visibleLocation.split(',')[0].trim();
              }
              
              // If no visible_address or it's invalid, try using the area field as fallback
              if (!visibleLocation || visibleLocation.trim().length === 0) {
                visibleLocation = serviceAddress?.area || customerAddress?.area || '';
                // If area also contains commas, extract first part
                if (visibleLocation && visibleLocation.includes(',')) {
                  visibleLocation = visibleLocation.split(',')[0].trim();
                }
              }
              
              // Filter out common city/state/country names
              const lowerLocation = visibleLocation?.toLowerCase() || '';
              const isCityOrState = 
                lowerLocation === 'bengaluru' || 
                lowerLocation === 'bangalore' ||
                lowerLocation === 'karnataka' ||
                lowerLocation === 'india' ||
                lowerLocation.includes('bengaluru') && lowerLocation.length < 15; // If it's just "Bengaluru" or very short with bengaluru
              
              // Only show if we have a valid visible location (not empty and not a full address)
              const isValidVisibleLocation = visibleLocation && 
                visibleLocation.trim().length > 0 && 
                visibleLocation.length < 50 && // Visible location should be short (one word/area name)
                !isCityOrState && // Should not be just city/state name
                !visibleLocation.includes('India') && // Should not contain country name
                !lowerLocation.includes('karnataka'); // Should not contain state name
              
              return isValidVisibleLocation ? (
                <div className="text-xs sm:text-sm text-gray-600 mt-1">
                  <strong>Location:</strong> {visibleLocation}
                </div>
              ) : null;
            })()}
            {googleMapsLink && (
              <a
                href={googleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors mt-2 w-full sm:w-auto justify-center sm:justify-start"
              >
                <MapPin className="w-4 h-4" />
                Open in Google Maps
              </a>
            )}
          </div>

          {/* Technician Selection */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <Label htmlFor="technician-select" className="text-sm sm:text-base">Select Technician</Label>
              {jobLocation && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={calculateDistances}
                  disabled={isCalculatingDistances}
                  className="text-xs w-full sm:w-auto"
                >
                  {isCalculatingDistances ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    <>
                      <Navigation className="w-3 h-3 mr-1" />
                      Sort by Distance
                    </>
                  )}
                </Button>
              )}
            </div>
            <Select value={selectedTechnicianId} onValueChange={onTechnicianSelect}>
              <SelectTrigger className="w-full border border-gray-300 focus:border-blue-500 focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Choose a technician" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {(techniciansWithDistances.length > 0 ? techniciansWithDistances : technicians).length === 0 ? (
                  <SelectItem value="no-technicians" disabled>
                    No technicians available
                  </SelectItem>
                ) : (
                  (techniciansWithDistances.length > 0 ? techniciansWithDistances : technicians)
                    .filter(tech => tech.account_status !== 'INACTIVE')
                    .map((technician) => {
                      const techWithDist = technician as TechnicianWithDistance;
                      return (
                        <SelectItem
                          key={technician.id}
                          value={technician.id || 'unknown'}
                        >
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="truncate flex-1 min-w-0">{technician.fullName || 'Unknown Technician'}</span>
                            {techWithDist.distance && techWithDist.distance !== 'N/A' && (
                              <div className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                                <Navigation className="w-3 h-3" />
                                <span>{techWithDist.distance}</span>
                                {techWithDist.duration && techWithDist.duration !== 'N/A' && (
                                  <span className="text-gray-500">• {techWithDist.duration}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })
                )}
              </SelectContent>
            </Select>
            {techniciansWithDistances.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                Technicians sorted by distance from job location
              </div>
            )}
          </div>
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
            Assign Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignJobDialog;

