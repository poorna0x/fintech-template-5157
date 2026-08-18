import { supabase } from '@/lib/supabase';

type LatLng = { lat: number; lng: number };

async function postTravelLeg(token: string, payload: Record<string, unknown>) {
  const res = await fetch('/.netlify/functions/tech-travel-leg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Fire-and-forget: office → this job (or previous job → this job), avoid tolls. */
export function recordTechTravelLeg(jobId: string): void {
  if (!jobId) return;
  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      const first = await postTravelLeg(token, { jobId });
      if (!first || first.ok || first.reason !== 'need_client' || !first.origin || !first.dest) {
        return;
      }
      const { calculateDrivingDistance } = await import('@/lib/googleMapsDistance');
      const outbound = await calculateDrivingDistance(first.origin as LatLng, first.dest as LatLng, {
        fallbackToHaversine: false,
      });
      let returnKm: number | undefined;
      if (first.office) {
        try {
          const back = await calculateDrivingDistance(first.dest as LatLng, first.office as LatLng, {
            fallbackToHaversine: false,
          });
          returnKm = back.distanceMeters / 1000;
        } catch {
          /* return km optional */
        }
      }
      await postTravelLeg(token, {
        jobId,
        km: outbound.distanceMeters / 1000,
        ...(returnKm != null ? { returnKm } : {}),
      });
    } catch {
      /* never block Start Work */
    }
  })();
}
