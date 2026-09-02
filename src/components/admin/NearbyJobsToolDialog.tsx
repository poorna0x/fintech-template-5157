import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, MapPinned, Radar } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Technician } from '@/types';
import { isActiveTechnicianAccount } from '@/lib/technicianAccountStatus';
import {
  clampNearbyRadiusKm,
  DEFAULT_NEARBY_RADIUS_KM,
  fetchTechnicianJobsForNearbyOrigin,
  formatNearbyDistanceLabel,
  formatNearbyKmLabel,
  isNearbyKmDraft,
  MAX_NEARBY_RADIUS_KM,
  NEARBY_RADIUS_PRESETS_KM,
  parseNearbyKmInput,
  resolveTechnicianCurrentCoords,
  searchNearbyJobs,
  type NearbyJobOriginKind,
  type NearbyJobResult,
  type NearbyJobsMode,
  type NearbyOriginJobOption,
} from '@/lib/adminNearbyJobs';
import { resolveJobLatLngFromRow } from '@/lib/jobLocationHelpers';

type NearbyJobsToolDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technicians: Technician[];
  initialTechnicianId?: string | null;
};

function techDisplayName(t: Technician): string {
  return String(t.fullName || (t as any).full_name || 'Technician').trim() || 'Technician';
}

export default function NearbyJobsToolDialog({
  open,
  onOpenChange,
  technicians,
  initialTechnicianId = null,
}: NearbyJobsToolDialogProps) {
  const activeTechs = useMemo(
    () =>
      technicians
        .filter((t) => {
          if ((t as any).isActive === false) return false;
          return isActiveTechnicianAccount(t);
        })
        .slice()
        .sort((a, b) => techDisplayName(a).localeCompare(techDisplayName(b))),
    [technicians]
  );

  const [technicianId, setTechnicianId] = useState('');
  const [mode, setMode] = useState<NearbyJobsMode>('ongoing');
  const [originKind, setOriginKind] = useState<NearbyJobOriginKind>('tech_location');
  const [originJobId, setOriginJobId] = useState('');
  const [originOptions, setOriginOptions] = useState<NearbyOriginJobOption[]>([]);
  const [originRowsById, setOriginRowsById] = useState<Record<string, Record<string, unknown>>>({});
  const [loadingOriginJobs, setLoadingOriginJobs] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_NEARBY_RADIUS_KM);
  /** Local draft so backspace / "0." clear fully without snapping to min. */
  const [radiusKmDraft, setRadiusKmDraft] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<NearbyJobResult[]>([]);
  const [originSummary, setOriginSummary] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const loadOriginJobs = useCallback(async (techId: string) => {
    if (!techId) {
      setOriginOptions([]);
      setOriginRowsById({});
      setOriginJobId('');
      return;
    }
    setLoadingOriginJobs(true);
    try {
      const { data, rows, error } = await fetchTechnicianJobsForNearbyOrigin(techId);
      if (error) {
        toast.error(error.message || 'Failed to load technician jobs');
        setOriginOptions([]);
        setOriginRowsById({});
        setOriginJobId('');
        return;
      }
      setOriginOptions(data);
      const map: Record<string, Record<string, unknown>> = {};
      for (const row of rows) map[String(row.id)] = row;
      setOriginRowsById(map);
      setOriginJobId((prev) => (prev && map[prev] ? prev : data[0]?.id || ''));
    } finally {
      setLoadingOriginJobs(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const nextTech =
      initialTechnicianId && activeTechs.some((t) => t.id === initialTechnicianId)
        ? initialTechnicianId
        : activeTechs[0]?.id || '';
    setTechnicianId(nextTech);
    setMode('ongoing');
    setOriginKind('tech_location');
    setRadiusKm(DEFAULT_NEARBY_RADIUS_KM);
    setRadiusKmDraft(null);
    setResults([]);
    setOriginSummary(null);
    setHasSearched(false);
    void loadOriginJobs(nextTech);
  }, [open, initialTechnicianId, activeTechs, loadOriginJobs]);

  const handleTechnicianChange = (techId: string) => {
    setTechnicianId(techId);
    setResults([]);
    setHasSearched(false);
    setOriginSummary(null);
    void loadOriginJobs(techId);
  };

  const resolveOrigin = async (): Promise<{
    lat: number;
    lng: number;
    summary: string;
    excludeJobId: string | null;
  } | null> => {
    if (!technicianId) {
      toast.error('Select a technician');
      return null;
    }

    if (originKind === 'tech_location') {
      const coords = await resolveTechnicianCurrentCoords(technicianId);
      if (!coords) {
        toast.error('No location for this technician. Ping them from Technician location, or pick a job.');
        return null;
      }
      const age = coords.updatedAt
        ? ` · ${new Date(coords.updatedAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}`
        : '';
      const sourceLabel = coords.source === 'live' ? 'Live / last GPS' : 'Saved current location';
      return {
        lat: coords.lat,
        lng: coords.lng,
        summary: `${sourceLabel}${age}`,
        excludeJobId: null,
      };
    }

    if (!originJobId) {
      toast.error('Select a job to use as the origin');
      return null;
    }
    const row = originRowsById[originJobId];
    if (!row) {
      toast.error('Origin job not found');
      return null;
    }
    const resolved = await resolveJobLatLngFromRow(row);
    if (!resolved) {
      toast.error('Could not resolve coordinates for that job');
      return null;
    }
    const opt = originOptions.find((o) => o.id === originJobId);
    return {
      lat: resolved.lat,
      lng: resolved.lng,
      summary: opt?.label || `Job ${originJobId.slice(0, 8)}`,
      excludeJobId: originJobId,
    };
  };

  const handleSearch = async () => {
    setSearching(true);
    setHasSearched(false);
    try {
      const origin = await resolveOrigin();
      if (!origin) return;

      const radius =
        radiusKmDraft != null
          ? clampNearbyRadiusKm(
              parseNearbyKmInput(radiusKmDraft) ?? DEFAULT_NEARBY_RADIUS_KM
            )
          : clampNearbyRadiusKm(radiusKm);
      setRadiusKm(radius);
      setRadiusKmDraft(null);

      const { data, error } = await searchNearbyJobs({
        origin: { lat: origin.lat, lng: origin.lng },
        radiusKm: radius,
        mode,
        technicianId,
        excludeJobId: origin.excludeJobId,
      });

      if (error) {
        toast.error(error.message);
        setResults([]);
        return;
      }

      setResults(data);
      setOriginSummary(origin.summary);
      setHasSearched(true);
      if (data.length === 0) {
        toast.message(
          mode === 'ongoing'
            ? `No ongoing jobs for this tech within ${formatNearbyKmLabel(radius)}`
            : `No follow-up jobs within ${formatNearbyKmLabel(radius)}`
        );
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Radar className="h-5 w-5 text-sky-700" />
            Nearby jobs
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            From a technician&apos;s location or one of his jobs, find ongoing jobs assigned to him
            — or any follow-up nearby (assignment not required).
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-2">
            <Label>Technician</Label>
            <Select value={technicianId} onValueChange={handleTechnicianChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select technician" />
              </SelectTrigger>
              <SelectContent>
                {activeTechs.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {techDisplayName(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Look for</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === 'ongoing' ? 'default' : 'outline'}
                className={cn(mode === 'ongoing' && 'bg-sky-700 hover:bg-sky-800')}
                onClick={() => {
                  setMode('ongoing');
                  setResults([]);
                  setHasSearched(false);
                }}
              >
                Ongoing
              </Button>
              <Button
                type="button"
                variant={mode === 'followup' ? 'default' : 'outline'}
                className={cn(mode === 'followup' && 'bg-sky-700 hover:bg-sky-800')}
                onClick={() => {
                  setMode('followup');
                  setResults([]);
                  setHasSearched(false);
                }}
              >
                Follow-up
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === 'ongoing'
                ? 'Only this technician’s assigned open jobs.'
                : 'Any follow-up job in range — does not need to be assigned to him.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Origin</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={originKind === 'tech_location' ? 'default' : 'outline'}
                className={cn(originKind === 'tech_location' && 'bg-sky-700 hover:bg-sky-800')}
                onClick={() => {
                  setOriginKind('tech_location');
                  setResults([]);
                  setHasSearched(false);
                }}
              >
                His location
              </Button>
              <Button
                type="button"
                variant={originKind === 'job' ? 'default' : 'outline'}
                className={cn(originKind === 'job' && 'bg-sky-700 hover:bg-sky-800')}
                onClick={() => {
                  setOriginKind('job');
                  setResults([]);
                  setHasSearched(false);
                }}
              >
                One of his jobs
              </Button>
            </div>

            {originKind === 'job' && (
              <div className="space-y-1.5 pt-1">
                <Select
                  value={originJobId}
                  onValueChange={(v) => {
                    setOriginJobId(v);
                    setResults([]);
                    setHasSearched(false);
                  }}
                  disabled={loadingOriginJobs || originOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingOriginJobs
                          ? 'Loading jobs…'
                          : originOptions.length === 0
                            ? 'No jobs for this tech'
                            : 'Select job'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {originOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nearby_radius_km">Distance</Label>
            <div className="flex items-center gap-2">
              <Input
                id="nearby_radius_km"
                type="text"
                inputMode="decimal"
                value={radiusKmDraft != null ? radiusKmDraft : String(radiusKm)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                  setRadiusKmDraft(raw);
                  setResults([]);
                  setHasSearched(false);
                  if (isNearbyKmDraft(raw)) return;
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 0) return;
                  setRadiusKm(Math.min(n, MAX_NEARBY_RADIUS_KM));
                }}
                onBlur={() => {
                  const n =
                    radiusKmDraft != null
                      ? parseNearbyKmInput(radiusKmDraft)
                      : radiusKm;
                  const clamped = clampNearbyRadiusKm(
                    n == null ? DEFAULT_NEARBY_RADIUS_KM : n
                  );
                  setRadiusKm(clamped);
                  setRadiusKmDraft(null);
                }}
                className="max-w-[9rem]"
              />
              <span className="text-sm text-muted-foreground">km</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NEARBY_RADIUS_PRESETS_KM.map((km) => (
                <Button
                  key={km}
                  type="button"
                  size="sm"
                  variant={radiusKm === km && radiusKmDraft == null ? 'default' : 'outline'}
                  className={cn(
                    'h-7 px-2 text-xs',
                    radiusKm === km && radiusKmDraft == null && 'bg-sky-700 hover:bg-sky-800'
                  )}
                  onClick={() => {
                    setRadiusKm(km);
                    setRadiusKmDraft(null);
                    setResults([]);
                    setHasSearched(false);
                  }}
                >
                  {formatNearbyKmLabel(km)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Enter km — e.g. 0.5 means 500 m (max 50 km).
            </p>
          </div>

          {hasSearched && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">
                  Results
                  {results.length > 0 ? ` (${results.length})` : ''}
                </Label>
                {originSummary && (
                  <span className="truncate text-xs text-muted-foreground" title={originSummary}>
                    From: {originSummary}
                  </span>
                )}
              </div>

              {results.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  Nothing within {formatNearbyKmLabel(radiusKm)}.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {results.map((r) => (
                    <li key={r.id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-sm">
                            {r.job_number ? `#${r.job_number}` : 'Job'}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {r.status.replace('_', ' ')}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] tabular-nums">
                            {formatNearbyDistanceLabel(r.distance_m)}
                          </Badge>
                        </div>
                        <p className="truncate text-sm">{r.customer_name}</p>
                        {r.visible_address ? (
                          <p className="truncate text-xs text-muted-foreground">{r.visible_address}</p>
                        ) : null}
                        {(r.follow_up_date || r.scheduled_date) && (
                          <p className="text-xs text-muted-foreground">
                            {r.follow_up_date
                              ? `Follow-up: ${r.follow_up_date}`
                              : `Scheduled: ${r.scheduled_date}`}
                          </p>
                        )}
                        {mode === 'followup' && !r.assigned_technician_id && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">Unassigned</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 self-start"
                        onClick={() =>
                          window.open(
                            `https://www.google.com/maps?q=${r.lat},${r.lng}`,
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                      >
                        <MapPinned className="mr-1.5 h-3.5 w-3.5" />
                        Maps
                        <ExternalLink className="ml-1 h-3 w-3 opacity-60" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            className="bg-sky-700 hover:bg-sky-800"
            disabled={searching || !technicianId || (originKind === 'job' && !originJobId)}
            onClick={() => void handleSearch()}
          >
            {searching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching…
              </>
            ) : (
              'Find nearby'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
