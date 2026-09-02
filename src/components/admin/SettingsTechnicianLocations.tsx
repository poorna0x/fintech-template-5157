import { useEffect, useState } from 'react';
import { Clock, Loader2, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Technician } from '@/types';
import { fetchTechFieldDay, isAfterNinePmIst, todayIstDateKey, type TechFieldDayRow } from '@/lib/techFieldDay';

export function SettingsTechnicianLocations({
  technicians,
  canLoadHours,
}: {
  technicians: Technician[];
  canLoadHours: boolean;
}) {
  const afterNine = isAfterNinePmIst();
  const [hoursById, setHoursById] = useState<Record<string, TechFieldDayRow>>({});
  const [hoursLoaded, setHoursLoaded] = useState(false);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const showHours = canLoadHours && afterNine;

  useEffect(() => {
    if (!showHours) return;
    let cancelled = false;
    void (async () => {
      setHoursError(null);
      setHoursLoaded(false);
      const result = await fetchTechFieldDay(todayIstDateKey());
      if (cancelled) return;
      if (!result.ok) {
        setHoursError(result.error || 'Could not load hours');
        setHoursLoaded(true);
        return;
      }
      const next: Record<string, TechFieldDayRow> = {};
      for (const row of result.rows) next[row.technicianId] = row;
      setHoursById(next);
      setHoursLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [showHours]);

  const locationTechnicians = technicians.filter((t) => {
    const status = String((t as any).account_status || 'ACTIVE').toUpperCase();
    return status === 'ACTIVE';
  });

  return (
    <>
      {showHours && !hoursLoaded && !hoursError ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          Loading today’s hours and travel km…
        </p>
      ) : null}
      {hoursError ? (
        <p className="text-xs text-amber-800 dark:text-amber-400 mb-4">{hoursError}</p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {locationTechnicians.map((technician) => {
          const hasLocation =
            technician.currentLocation &&
            technician.currentLocation.latitude &&
            technician.currentLocation.longitude;
          const lastUpdated = technician.currentLocation?.lastUpdated
            ? new Date(technician.currentLocation.lastUpdated).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })
            : null;
          const hours = hoursById[technician.id];

          return (
            <Card key={technician.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">
                      {technician.fullName}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">{technician.employeeId}</p>
                  </div>
                  {hours?.hoursLabel ? (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                      {hours.hoursLabel}
                    </span>
                  ) : null}
                </div>

                {hasLocation ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        const url = `https://www.google.com/maps?q=${technician.currentLocation?.latitude},${technician.currentLocation?.longitude}`;
                        window.open(url, '_blank');
                      }}
                      className="flex items-center gap-2 w-full p-2 rounded-lg border border-blue-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group cursor-pointer"
                      title="Click to open location in Google Maps"
                    >
                      <MapPin className="w-5 h-5 text-blue-600 group-hover:text-blue-700 shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-xs font-medium text-foreground/90 dark:text-gray-300">
                          View Location
                        </div>
                      </div>
                    </button>
                    {lastUpdated ? (
                      <div className="text-xs text-muted-foreground dark:text-muted-foreground/70">
                        Last updated: {lastUpdated}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground/70 p-2">
                    <MapPin className="w-5 h-5 shrink-0" />
                    <span className="text-xs">No location data available</span>
                  </div>
                )}

                {showHours && !hoursLoaded ? (
                  <p className="mt-3 text-xs text-muted-foreground">Loading hours…</p>
                ) : hoursLoaded && hours ? (
                  <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      <span>
                        {hours.live
                          ? `Still out${hours.fromLabel ? ` · started ${hours.fromLabel}` : ''}`
                          : hours.fromLabel && hours.toLabel
                            ? `${hours.fromLabel} → ${hours.toLabel}`
                            : 'No completed span yet'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {hours.kmLabel ? `${hours.kmLabel} travelled` : 'Travel km not available'}
                    </p>
                  </div>
                ) : hoursLoaded && showHours ? (
                  <p className="mt-3 text-xs text-muted-foreground">No jobs started today</p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
        {locationTechnicians.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No technicians found.
          </div>
        ) : null}
      </div>
    </>
  );
}
