import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { transformTechnicianData } from '@/lib/adminDashboardTransforms';
import {
  ensureGoogleMapsLoaded,
  formatDistanceKm,
  haversineDistanceMeters,
} from '@/lib/adminGoogleMapsDistance';
import { getLocationUnavailableMessage } from '@/lib/jobLocationHelpers';
import { resolveJobLatLngFromRow } from '@/lib/jobLocationHelpers';
import { openGoogleMapsDirectionsBetween } from '@/lib/maps';
import {
  collectOngoingJobsForMeasure,
  formatRouteStopLabel,
  formatTime12Hour,
} from '@/lib/adminRouteMeasureHelpers';
import { db } from '@/lib/supabase';
import type { Job, Technician } from '@/types';
import type {
  JobCustomDistanceResult,
  JobTechnicianDistanceRow,
} from '@/components/admin/JobDistanceMeasurementDialog';

export type AdminJobDistanceMeasureCtx = {
  technicians: Technician[];
  jobs: Job[];
  setTechnicians: Dispatch<SetStateAction<Technician[]>>;
  selectedJobForDistance: Job | null;
  customDistanceFromId: string;
  customDistanceToId: string;
  setSelectedJobForDistance: Dispatch<SetStateAction<Job | null>>;
  setCustomDistanceResult: Dispatch<SetStateAction<JobCustomDistanceResult | null>>;
  setIsLoadingCustomDistance: Dispatch<SetStateAction<boolean>>;
  setIsOpeningCustomDistanceMaps: Dispatch<SetStateAction<boolean>>;
  setCustomDistanceFromId: Dispatch<SetStateAction<string>>;
  setCustomDistanceToId: Dispatch<SetStateAction<string>>;
  setDistanceMeasurementDialogOpen: Dispatch<SetStateAction<boolean>>;
  setTechnicianDistances: Dispatch<SetStateAction<JobTechnicianDistanceRow[]>>;
  setIsCalculatingDistances: Dispatch<SetStateAction<boolean>>;
};

export async function resolveAdminJobCoordsForMeasure(
  job: Job | any,
  onResolvingLink?: () => void
): Promise<{ lat: number; lng: number; workingRow: any } | null> {
  return resolveJobLatLngFromRow(job, {
    getJobByIdFull: db.jobs.getByIdFull,
    onResolvingLink,
  });
}

export async function resolveAdminCustomDistanceStops(
  ctx: AdminJobDistanceMeasureCtx
): Promise<{
  origin: { lat: number; lng: number };
  dest: { lat: number; lng: number };
  fromLabel: string;
  toLabel: string;
} | null> {
  const workingJob = ctx.selectedJobForDistance;
  if (!workingJob || !ctx.customDistanceFromId || !ctx.customDistanceToId) {
    toast.error('Choose both From and To.');
    return null;
  }
  if (ctx.customDistanceFromId === ctx.customDistanceToId) {
    toast.error('From and To must be different.');
    return null;
  }

  const assignedTechnicianId =
    (workingJob as any).assigned_technician_id || workingJob.assignedTechnicianId || null;
  const assignedTechnician = ctx.technicians.find((t) => t.id === assignedTechnicianId);
  const techLocation =
    assignedTechnician?.currentLocation || (assignedTechnician as any)?.current_location;

  const ongoingJobsForRoute = collectOngoingJobsForMeasure(workingJob, ctx.jobs);
  const jobById = (id: string) =>
    ongoingJobsForRoute.find((j) => j.id === id) || ctx.jobs.find((j) => j.id === id);

  const labelForStop = (stopId: string): string => {
    if (stopId === '__tech__') {
      return assignedTechnician
        ? `${assignedTechnician.fullName} (last location)`
        : 'Technician';
    }
    const j = jobById(stopId);
    return j ? formatRouteStopLabel(j) : stopId;
  };

  let origin: { lat: number; lng: number } | null = null;
  let dest: { lat: number; lng: number } | null = null;

  if (ctx.customDistanceFromId === '__tech__') {
    if (!techLocation?.latitude || !techLocation?.longitude) {
      toast.error('Technician location not available.');
      return null;
    }
    origin = { lat: Number(techLocation.latitude), lng: Number(techLocation.longitude) };
  } else {
    const j = jobById(ctx.customDistanceFromId);
    if (!j) {
      toast.error('Could not find the From job.');
      return null;
    }
    const fromResolved = await resolveAdminJobCoordsForMeasure(j);
    origin = fromResolved ? { lat: fromResolved.lat, lng: fromResolved.lng } : null;
  }

  if (ctx.customDistanceToId === '__tech__') {
    if (!techLocation?.latitude || !techLocation?.longitude) {
      toast.error('Technician location not available.');
      return null;
    }
    dest = { lat: Number(techLocation.latitude), lng: Number(techLocation.longitude) };
  } else {
    const j = jobById(ctx.customDistanceToId);
    if (!j) {
      toast.error('Could not find the To job.');
      return null;
    }
    const toResolved = await resolveAdminJobCoordsForMeasure(j);
    dest = toResolved ? { lat: toResolved.lat, lng: toResolved.lng } : null;
  }

  if (!origin || !dest) {
    toast.error('Map coordinates missing for one of the stops. Check addresses or map links.');
    return null;
  }

  return {
    origin,
    dest,
    fromLabel: labelForStop(ctx.customDistanceFromId),
    toLabel: labelForStop(ctx.customDistanceToId),
  };
}

export async function calculateAdminCustomDistanceBetweenStops(
  ctx: AdminJobDistanceMeasureCtx
) {
  const stops = await resolveAdminCustomDistanceStops(ctx);
  if (!stops) return;

  const { origin, dest, fromLabel, toLabel } = stops;

  ctx.setIsLoadingCustomDistance(true);
  ctx.setCustomDistanceResult(null);

  try {
    await ensureGoogleMapsLoaded();
    if (!(window as any).google?.maps?.DistanceMatrixService) {
      throw new Error('DistanceMatrixService not available');
    }

    const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();

    distanceMatrix.getDistanceMatrix(
      {
        origins: [origin],
        destinations: [dest],
        travelMode: (window as any).google.maps.TravelMode.DRIVING,
        unitSystem: (window as any).google.maps.UnitSystem.METRIC,
      },
      (response: any, status: any) => {
        ctx.setIsLoadingCustomDistance(false);
        if (status === (window as any).google.maps.DistanceMatrixStatus.OK && response) {
          const el = response.rows[0]?.elements[0];
          if (el && el.status === (window as any).google.maps.DistanceMatrixElementStatus.OK) {
            const distanceValueM = el.distance?.value ?? 0;
            let distanceText = el.distance?.text || '';
            if (distanceValueM < 1000) {
              distanceText = `${(distanceValueM / 1000).toFixed(2)} km`;
            }
            const durationText = el.duration?.text || '';
            ctx.setCustomDistanceResult({
              fromLabel,
              toLabel,
              distance: distanceText,
              duration: durationText,
            });
            return;
          }
        }
        const m = haversineDistanceMeters(origin, dest);
        ctx.setCustomDistanceResult({
          fromLabel,
          toLabel,
          distance: formatDistanceKm(m) || '',
          duration: '',
          isApproximate: true,
        });
        toast.warning('Showing approximate distance (route unavailable)');
      }
    );
  } catch (error) {
    ctx.setIsLoadingCustomDistance(false);
    toast.error(
      `Failed to calculate: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function openAdminCustomDistanceInGoogleMaps(
  ctx: AdminJobDistanceMeasureCtx
) {
  ctx.setIsOpeningCustomDistanceMaps(true);
  try {
    const stops = await resolveAdminCustomDistanceStops(ctx);
    if (!stops) return;
    openGoogleMapsDirectionsBetween(stops.origin, stops.dest, 'driving');
    toast.success('Opening route in Google Maps');
  } finally {
    ctx.setIsOpeningCustomDistanceMaps(false);
  }
}

export function getAdminMeasureStopSelectOptions(
  ctx: AdminJobDistanceMeasureCtx
): { value: string; label: string }[] {
  const wj = ctx.selectedJobForDistance;
  if (!wj) return [];
  const tid = (wj as any).assigned_technician_id || wj.assignedTechnicianId;
  const tech = tid ? ctx.technicians.find((t) => t.id === tid) : null;
  const tl = tech?.currentLocation || (tech as any)?.current_location;
  const out: { value: string; label: string }[] = [];
  if (tech && tl?.latitude && tl?.longitude) {
    out.push({ value: '__tech__', label: `${tech.fullName} (last location)` });
  }
  for (const j of collectOngoingJobsForMeasure(wj, ctx.jobs)) {
    out.push({ value: j.id, label: formatRouteStopLabel(j) });
  }
  return out;
}

export async function openAdminJobDistanceMeasure(
  job: Job,
  ctx: AdminJobDistanceMeasureCtx
) {
  console.log('🔍 [AdminDashboard] handleMeasureDistance called for job:', {
    jobId: job.id,
    jobNumber: job.jobNumber || (job as any).job_number
  });

  let loadingToast: string | number | undefined;
  const resolved = await resolveAdminJobCoordsForMeasure(job, () => {
    loadingToast = toast.loading('Resolving map link...');
  });
  if (loadingToast !== undefined) toast.dismiss(loadingToast);

  if (!resolved) {
    console.error('❌ [AdminDashboard] No coordinates available for distance measurement');
    toast.error(getLocationUnavailableMessage(job));
    return;
  }

  const workingJob = resolved.workingRow as Job;
  const jobCoords = { lat: resolved.lat, lng: resolved.lng };

  ctx.setSelectedJobForDistance(workingJob);
  ctx.setCustomDistanceResult(null);

  const assignedTechnicianId =
    (workingJob as any).assigned_technician_id || workingJob.assignedTechnicianId || null;

  if (!assignedTechnicianId) {
    toast.error('No technician assigned to this job.');
    return;
  }

  let assignedTechnician = ctx.technicians.find((t) => t.id === assignedTechnicianId);
  try {
    const { data: freshRow, error: freshErr } = await db.technicians.getById(assignedTechnicianId);
    if (!freshErr && freshRow) {
      const fresh = transformTechnicianData(freshRow);
      assignedTechnician = fresh;
      ctx.setTechnicians((prev) => {
        const idx = prev.findIndex((t) => t.id === assignedTechnicianId);
        if (idx === -1) return [...prev, fresh];
        const next = [...prev];
        next[idx] = fresh;
        return next;
      });
    }
  } catch (e) {
    console.warn('[AdminDashboard] getById for measure distance (refresh technician location) failed:', e);
  }

  if (!assignedTechnician) {
    toast.error('Assigned technician not found.');
    return;
  }

  const techLocation =
    assignedTechnician.currentLocation ||
    (assignedTechnician as any).current_location;
  const hasLocation = !!(techLocation && techLocation.latitude && techLocation.longitude);

  if (!hasLocation) {
    toast.error('Assigned technician does not have location data available.');
    return;
  }

  let lastUpdatedFormatted: string | undefined;
  if (techLocation?.lastUpdated) {
    try {
      lastUpdatedFormatted = formatTime12Hour(techLocation.lastUpdated);
    } catch (e) {
      console.warn('Failed to format lastUpdated time:', e);
    }
  }

  const initialDistances = [{
    technician: assignedTechnician,
    distance: '',
    duration: '',
    distanceValue: undefined,
    durationValue: undefined,
    estimatedArrival: undefined,
    lastUpdated: lastUpdatedFormatted,
    hasLocation: true,
    isCalculating: true,
    isAssigned: true
  }];

  ctx.setTechnicianDistances(initialDistances);

  const ongoingStops = collectOngoingJobsForMeasure(workingJob as Job, ctx.jobs);
  const fromId = '__tech__';
  let toId = workingJob.id;
  if (fromId === toId) {
    const alt = ongoingStops.find((j) => j.id !== fromId);
    if (alt) toId = alt.id;
  }
  ctx.setCustomDistanceFromId(fromId);
  ctx.setCustomDistanceToId(toId);

  ctx.setDistanceMeasurementDialogOpen(true);
  ctx.setIsCalculatingDistances(true);

  const origin = {
    lat: Number(techLocation!.latitude),
    lng: Number(techLocation!.longitude)
  };
  const destination = { lat: Number(jobCoords.lat), lng: Number(jobCoords.lng) };

  const applySingleLegResult = (
    distanceText: string,
    durationText: string,
    distanceValue: number,
    durationValue: number
  ) => {
    let estimatedArrival: string | undefined;
    if (techLocation?.lastUpdated && durationValue > 0 && distanceValue > 1000) {
      try {
        const lastUpdatedDate = new Date(techLocation.lastUpdated);
        estimatedArrival = formatTime12Hour(
          new Date(lastUpdatedDate.getTime() + durationValue * 1000)
        );
      } catch {
        estimatedArrival = undefined;
      }
    }
    ctx.setTechnicianDistances([{
      technician: assignedTechnician,
      distance: distanceText,
      duration: durationText,
      distanceValue,
      durationValue,
      estimatedArrival,
      lastUpdated: lastUpdatedFormatted,
      hasLocation: true,
      isCalculating: false,
      isAssigned: true
    }]);
  };

  try {
    await ensureGoogleMapsLoaded();

    if (!(window as any).google?.maps?.DistanceMatrixService) {
      throw new Error('DistanceMatrixService not available');
    }

    const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();
    distanceMatrix.getDistanceMatrix(
      {
        origins: [origin],
        destinations: [destination],
        travelMode: (window as any).google.maps.TravelMode.DRIVING,
        unitSystem: (window as any).google.maps.UnitSystem.METRIC,
      },
      (response: any, status: any) => {
        ctx.setIsCalculatingDistances(false);

        if (status === (window as any).google.maps.DistanceMatrixStatus.OK && response) {
          const result = response.rows[0]?.elements[0];

          if (result && result.status === window.google.maps.DistanceMatrixElementStatus.OK) {
            const distanceValue = result.distance.value || 0;
            let distanceText = result.distance.text;
            if (distanceValue < 1000) {
              distanceText = `${(distanceValue / 1000).toFixed(2)} km`;
            }
            const durationText = result.duration?.text || '';
            const durationValue = result.duration?.value || 0;
            applySingleLegResult(distanceText, durationText, distanceValue, durationValue);
          } else if (result?.status === window.google.maps.DistanceMatrixElementStatus.ZERO_RESULTS) {
            const bicyclingMatrix = new (window as any).google.maps.DistanceMatrixService();
            bicyclingMatrix.getDistanceMatrix(
              {
                origins: [origin],
                destinations: [destination],
                travelMode: (window as any).google.maps.TravelMode.BICYCLING,
                unitSystem: (window as any).google.maps.UnitSystem.METRIC,
              },
              (bikeResponse: any, bikeStatus: any) => {
                ctx.setIsCalculatingDistances(false);
                if (bikeStatus === (window as any).google.maps.DistanceMatrixStatus.OK && bikeResponse) {
                  const bikeResult = bikeResponse.rows[0]?.elements[0];
                  if (bikeResult && bikeResult.status === window.google.maps.DistanceMatrixElementStatus.OK) {
                    const distanceValue = bikeResult.distance.value || 0;
                    let distanceText = bikeResult.distance.text;
                    if (distanceValue < 1000) {
                      distanceText = `${(distanceValue / 1000).toFixed(2)} km`;
                    }
                    const durationText = bikeResult.duration?.text || '';
                    const durationValue = bikeResult.duration?.value || 0;
                    applySingleLegResult(distanceText, durationText, distanceValue, distanceValue);
                  } else {
                    ctx.setTechnicianDistances([{
                      technician: assignedTechnician,
                      distance: '',
                      duration: '',
                      distanceValue: undefined,
                      durationValue: undefined,
                      estimatedArrival: undefined,
                      lastUpdated: lastUpdatedFormatted,
                      hasLocation: true,
                      isCalculating: false,
                      isAssigned: true
                    }]);
                  }
                } else {
                  ctx.setTechnicianDistances([{
                    technician: assignedTechnician,
                    distance: '',
                    duration: '',
                    distanceValue: undefined,
                    durationValue: undefined,
                    estimatedArrival: undefined,
                    lastUpdated: lastUpdatedFormatted,
                    hasLocation: true,
                    isCalculating: false,
                    isAssigned: true
                  }]);
                }
              }
            );
          } else {
            ctx.setTechnicianDistances([{
              technician: assignedTechnician,
              distance: '',
              duration: '',
              distanceValue: undefined,
              durationValue: undefined,
              estimatedArrival: undefined,
              lastUpdated: lastUpdatedFormatted,
              hasLocation: true,
              isCalculating: false,
              isAssigned: true
            }]);
          }
        } else {
          ctx.setIsCalculatingDistances(false);
          toast.error(`Distance calculation failed: ${status}`);
        }
      }
    );
  } catch (error) {
    console.error('Error calculating distances:', error);
    ctx.setIsCalculatingDistances(false);
    try {
      const techLoc: any = assignedTechnician.currentLocation || (assignedTechnician as any)?.current_location;
      if (techLoc?.latitude && techLoc?.longitude && jobCoords?.lat && jobCoords?.lng) {
        const approxMeters = haversineDistanceMeters(
          { lat: Number(techLoc.latitude), lng: Number(techLoc.longitude) },
          { lat: Number(jobCoords.lat), lng: Number(jobCoords.lng) }
        );
        const approxText = formatDistanceKm(approxMeters);
        if (approxText) {
          ctx.setTechnicianDistances([{
            technician: assignedTechnician,
            distance: approxText,
            duration: '',
            distanceValue: approxMeters,
            durationValue: undefined,
            estimatedArrival: undefined,
            lastUpdated: techLoc?.lastUpdated ? new Date(techLoc.lastUpdated).toLocaleString('en-IN') : '',
            hasLocation: true,
            isCalculating: false,
            isAssigned: true,
            isApproximate: true,
          } as any]);
          toast.warning('Showing approximate distance (route unavailable)');
          return;
        }
      }
    } catch {
      // ignore
    }
    toast.error(`Failed to calculate distances: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get ETA for share-technician-info dialog
export async function getAdminJobEtaForShareDialog(
  job: Job,
  technicians: Technician[]
): Promise<{ durationText?: string; estimatedArrival?: string } | null> {
  const resolved = await resolveAdminJobCoordsForMeasure(job);
  if (!resolved) return null;

  const workingJob = resolved.workingRow;
  const jobCoords = { lat: resolved.lat, lng: resolved.lng };

  const assignedTechnicianId =
    workingJob.assigned_technician_id || workingJob.assignedTechnicianId;
  if (!assignedTechnicianId) return null;
  const assignedTechnician = technicians.find((t) => t.id === assignedTechnicianId);
  const techLocation = assignedTechnician?.currentLocation || (assignedTechnician as any)?.current_location;
  if (!techLocation?.latitude || !techLocation?.longitude) return null;
  try {
    await ensureGoogleMapsLoaded();
    const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();
    const origin = { lat: Number(techLocation.latitude), lng: Number(techLocation.longitude) };
    const destination = { lat: jobCoords.lat, lng: jobCoords.lng };
    return new Promise((resolve) => {
      distanceMatrix.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [destination],
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
          unitSystem: (window as any).google.maps.UnitSystem.METRIC,
        },
        (response: any, status: any) => {
          if (status !== (window as any).google.maps.DistanceMatrixStatus.OK || !response) {
            resolve(null);
            return;
          }
          const result = response.rows?.[0]?.elements?.[0];
          if (!result || result.status !== (window as any).google.maps.DistanceMatrixElementStatus.OK) {
            resolve(null);
            return;
          }
          const durationText = result.duration?.text || '';
          const durationValue = result.duration?.value ?? 0;
          let estimatedArrival: string | undefined;
          if (techLocation?.lastUpdated && durationValue > 0) {
            try {
              const lastUpdatedDate = new Date((techLocation as any).lastUpdated);
              const arrivalDate = new Date(lastUpdatedDate.getTime() + durationValue * 1000);
              estimatedArrival = formatTime12Hour(arrivalDate);
            } catch {
              estimatedArrival = undefined;
            }
          }
          resolve({ durationText, estimatedArrival: estimatedArrival || undefined });
        }
      );
    });
  } catch {
    return null;
  }
}
