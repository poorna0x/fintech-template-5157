import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { ensureGoogleMapsApi } from '@/lib/googleMapsLink';
import { haversineKm, removePlusCode } from '@/lib/maps';
import DraggableMap from '@/components/DraggableMap';
import {
  clampHubRadiusKm,
  createBookingServiceHub,
  DEFAULT_HUB_RADIUS_KM,
  deleteBookingServiceHub,
  fetchBookingServiceHubs,
  MAX_HUB_RADIUS_KM,
  MIN_HUB_RADIUS_KM,
  updateBookingServiceHub,
  type BookingServiceHub,
} from '@/lib/bookingServiceHubs';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };

type PlacePrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

type DraftHub = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_km: number;
};

type Props = {
  onBack: () => void;
};

function coordsFromPlaceGeometry(
  place: google.maps.places.PlaceResult | null
): { lat: number; lng: number } | null {
  const loc = place?.geometry?.location;
  if (!loc || typeof loc.lat !== 'function') return null;
  const lat = loc.lat();
  const lng = loc.lng();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

export default function ServiceHubsSettingsPage({ onBack }: Props) {
  const [hubs, setHubs] = useState<BookingServiceHub[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftHub | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);

  const placesHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const debounceRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const selected = useMemo(
    () => hubs.find((h) => h.id === selectedId) || null,
    [hubs, selectedId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchBookingServiceHubs({ includeInactive: true, force: true });
    setMissingTable(result.missingTable);
    if (result.error && !result.missingTable) {
      toast.error(result.error);
    }
    setHubs(result.hubs);
    setLoading(false);
    if (!selectedId && result.hubs[0]) setSelectedId(result.hubs[0].id);
  }, [selectedId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureSessionToken = () => {
    if (!window.google?.maps?.places?.AutocompleteSessionToken) return null;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  };

  const fetchPredictions = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (trimmed.length < 2) {
      setPredictions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      await ensureGoogleMapsApi();
      if (!window.google?.maps?.places?.AutocompleteService) {
        setSearching(false);
        return;
      }
      const service = new window.google.maps.places.AutocompleteService();
      const token = ensureSessionToken();
      service.getPlacePredictions(
        {
          input: trimmed,
          componentRestrictions: { country: 'in' },
          ...(token ? { sessionToken: token } : {}),
        },
        (results, status) => {
          setSearching(false);
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results?.length) {
            setPredictions([]);
            return;
          }
          setPredictions(
            results.map((item) => ({
              placeId: item.place_id,
              mainText: item.structured_formatting?.main_text || item.description,
              secondaryText: item.structured_formatting?.secondary_text || '',
            }))
          );
        }
      );
    } catch {
      setSearching(false);
      setPredictions([]);
    }
  }, []);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchPredictions(value);
    }, 220);
  };

  const paintMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    for (const overlay of overlaysRef.current) {
      (overlay as google.maps.Circle | google.maps.Marker).setMap(null);
    }
    overlaysRef.current = [];

    const rows: Array<{
      id: string;
      lat: number;
      lng: number;
      radius_km: number;
      active: boolean;
      selected: boolean;
    }> = hubs.map((h) => ({
      id: h.id,
      lat: h.lat,
      lng: h.lng,
      radius_km: h.radius_km,
      active: h.is_active,
      selected: !draft && h.id === selectedId,
    }));
    if (draft) {
      rows.push({
        id: 'draft',
        lat: draft.lat,
        lng: draft.lng,
        radius_km: draft.radius_km,
        active: true,
        selected: true,
      });
    }

    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;

    for (const row of rows) {
      const fill = row.selected
        ? 'rgba(2, 132, 199, 0.22)'
        : row.active
          ? 'rgba(71, 85, 105, 0.28)'
          : 'rgba(148, 163, 184, 0.18)';
      const stroke = row.selected ? '#0284c7' : row.active ? '#475569' : '#94a3b8';
      const circle = new window.google.maps.Circle({
        map,
        center: { lat: row.lat, lng: row.lng },
        radius: row.radius_km * 1000,
        fillColor: fill,
        fillOpacity: 1,
        strokeColor: stroke,
        strokeOpacity: 0.9,
        strokeWeight: row.selected ? 2 : 1,
        clickable: row.id !== 'draft',
      });
      if (row.id !== 'draft') {
        circle.addListener('click', () => {
          setDraft(null);
          setSelectedId(row.id);
        });
      }
      const marker = new window.google.maps.Marker({
        map,
        position: { lat: row.lat, lng: row.lng },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: row.selected ? 8 : 6,
          fillColor: row.selected ? '#0284c7' : '#ffffff',
          fillOpacity: 1,
          strokeColor: row.selected ? '#0369a1' : '#334155',
          strokeWeight: 2,
        },
        clickable: row.id !== 'draft',
      });
      if (row.id !== 'draft') {
        marker.addListener('click', () => {
          setDraft(null);
          setSelectedId(row.id);
        });
      }
      overlaysRef.current.push(circle, marker);
      const circleBounds = circle.getBounds();
      if (circleBounds) {
        bounds.union(circleBounds);
        hasPoint = true;
      }
    }

    const focus = draft || selected;
    if (focus) {
      const radiusDeg = Math.max(0.02, (focus.radius_km * 1000) / 111_000) * 1.35;
      map.fitBounds({
        north: focus.lat + radiusDeg,
        south: focus.lat - radiusDeg,
        east: focus.lng + radiusDeg,
        west: focus.lng - radiusDeg,
      });
    } else if (hasPoint) {
      map.fitBounds(bounds, 36);
    }
    try {
      window.google.maps.event.trigger(map, 'resize');
    } catch {
      /* ignore */
    }
  }, [draft, hubs, selected, selectedId]);

  const handleMapReady = useCallback(
    (map: google.maps.Map | null) => {
      mapRef.current = map;
      if (map) paintMap();
    },
    [paintMap]
  );

  useEffect(() => {
    paintMap();
  }, [paintMap, loading]);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    setResolvingPlace(true);
    try {
      await ensureGoogleMapsApi();
      const host = placesHostRef.current || document.createElement('div');
      const details = await new Promise<{ coords: { lat: number; lng: number }; address: string } | null>(
        (resolve) => {
          if (!window.google?.maps?.places?.PlacesService) {
            resolve(null);
            return;
          }
          const service = new window.google.maps.places.PlacesService(
            mapRef.current || host
          );
          service.getDetails(
            {
              placeId: prediction.placeId,
              fields: ['formatted_address', 'geometry', 'name'],
              ...(sessionTokenRef.current ? { sessionToken: sessionTokenRef.current } : {}),
            },
            (place, status) => {
              sessionTokenRef.current = null;
              if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
                resolve(null);
                return;
              }
              const coords = coordsFromPlaceGeometry(place);
              if (!coords) {
                resolve(null);
                return;
              }
              resolve({
                coords,
                address: removePlusCode(place?.formatted_address || prediction.mainText),
              });
            }
          );
        }
      );
      if (!details) {
        toast.error('Could not open that place. Try another search.');
        return;
      }
      const already = hubs.find(
        (h) => haversineKm(h.lat, h.lng, details.coords.lat, details.coords.lng) < 0.4
      );
      if (already) {
        setDraft(null);
        setSelectedId(already.id);
        toast.message(`${already.name} is already a hub`);
      } else {
        setSelectedId(null);
        setDraft({
          name: prediction.mainText.slice(0, 80),
          address: details.address,
          lat: details.coords.lat,
          lng: details.coords.lng,
          radius_km: DEFAULT_HUB_RADIUS_KM,
        });
      }
      setQuery('');
      setPredictions([]);
    } catch {
      toast.error('Could not open that place. Try again.');
    } finally {
      setResolvingPlace(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error('Give this hub a name');
      return;
    }
    setSaving(true);
    const result = await createBookingServiceHub({
      name,
      address: draft.address,
      lat: draft.lat,
      lng: draft.lng,
      radius_km: draft.radius_km,
      sort_order: hubs.length,
    });
    setSaving(false);
    if (result.error || !result.hub) {
      toast.error(result.error || 'Could not save hub');
      return;
    }
    setHubs((prev) => [...prev, result.hub!].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
    setSelectedId(result.hub.id);
    setDraft(null);
    toast.success(`${result.hub.name} added`);
  };

  const handlePatchSelected = async (
    patch: Partial<Pick<BookingServiceHub, 'name' | 'radius_km' | 'is_active'>>
  ) => {
    if (!selected) return;
    setSaving(true);
    const result = await updateBookingServiceHub(selected.id, patch);
    setSaving(false);
    if (result.error || !result.hub) {
      toast.error(result.error || 'Could not update hub');
      return;
    }
    setHubs((prev) => prev.map((h) => (h.id === result.hub!.id ? result.hub! : h)));
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    const result = await deleteBookingServiceHub(selected.id);
    setSaving(false);
    setDeleteOpen(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const next = hubs.filter((h) => h.id !== selected.id);
    setHubs(next);
    setSelectedId(next[0]?.id || null);
    toast.success(`${selected.name} removed`);
  };

  const editor = draft || selected;
  const configuredCount = hubs.filter((h) => h.is_active).length;

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background">
      <div ref={placesHostRef} className="hidden" />
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2.5 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-11 min-w-11 cursor-pointer px-2"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Location Hubs
        </Button>
        <Button
          type="button"
          size="sm"
          className="ml-auto h-11 cursor-pointer gap-1.5"
          onClick={() => {
            const el = document.getElementById('service-hub-search');
            el?.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Plus className="h-4 w-4" />
          Add hub
        </Button>
      </header>

      {missingTable ? (
        <div className="px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Run <code className="rounded bg-muted px-1">scripts/add-booking-service-hubs.sql</code> in
          the Supabase SQL editor, then reopen this page.
        </div>
      ) : null}

      <div
        className="relative w-full shrink-0 overflow-hidden bg-muted"
        style={{ height: 'min(38dvh, 420px)', minHeight: 240 }}
      >
        <DraggableMap
          center={BENGALURU}
          zoom={11}
          height="100%"
          hideMarker
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          onMapReady={handleMapReady}
        />
        <div className="absolute left-3 right-3 top-3 z-20">
          <div className="relative rounded-xl border border-border bg-card shadow-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="service-hub-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search area, landmark, or address"
              className="h-11 border-0 bg-transparent pl-9 pr-10 shadow-none focus-visible:ring-0"
              autoComplete="off"
            />
            {searching || resolvingPlace ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : query ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                onClick={() => {
                  setQuery('');
                  setPredictions([]);
                }}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {predictions.length > 0 ? (
            <ul className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-md">
              {predictions.map((p) => (
                <li key={p.placeId}>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/70"
                    onClick={() => void handleSelectPlace(p)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {p.mainText}
                      </span>
                      {p.secondaryText ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.secondaryText}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {editor ? (
          <div className="space-y-3 border-b border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="hub-name" className="text-sm font-medium">
                {draft ? 'New hub' : 'Selected hub'}
              </Label>
              {draft ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
            <Input
              id="hub-name"
              value={draft ? draft.name : selected?.name || ''}
              onChange={(e) => {
                if (draft) setDraft({ ...draft, name: e.target.value.slice(0, 80) });
              }}
              onBlur={(e) => {
                if (!draft && selected && e.target.value.trim() && e.target.value.trim() !== selected.name) {
                  void handlePatchSelected({ name: e.target.value });
                }
              }}
              placeholder="Hub name (HSR Layout, Bellandur…)"
            />
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Coverage radius</span>
                <span className="font-medium tabular-nums">
                  {(draft ? draft.radius_km : selected?.radius_km || DEFAULT_HUB_RADIUS_KM).toFixed(1)} km
                </span>
              </div>
              <Slider
                min={MIN_HUB_RADIUS_KM}
                max={MAX_HUB_RADIUS_KM}
                step={0.5}
                value={[draft ? draft.radius_km : selected?.radius_km || DEFAULT_HUB_RADIUS_KM]}
                onValueChange={([value]) => {
                  const radius = clampHubRadiusKm(value);
                  if (draft) setDraft({ ...draft, radius_km: radius });
                  else if (selected) {
                    setHubs((prev) =>
                      prev.map((h) => (h.id === selected.id ? { ...h, radius_km: radius } : h))
                    );
                  }
                }}
                onValueCommit={([value]) => {
                  if (!draft && selected) void handlePatchSelected({ radius_km: value });
                }}
              />
            </div>
            {draft ? (
              <Button
                type="button"
                className="h-11 w-full cursor-pointer"
                disabled={saving}
                onClick={() => void handleSaveDraft()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save hub — bookings allowed in this circle
              </Button>
            ) : selected ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={selected.is_active}
                    disabled={saving}
                    onCheckedChange={(v) => void handlePatchSelected({ is_active: v })}
                    aria-label="Hub accepts bookings"
                  />
                  <span className="text-sm text-muted-foreground">
                    {selected.is_active ? 'Accepts bookings' : 'Paused'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remove
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-foreground">Configured Hubs</h2>
            <span className="text-sm tabular-nums text-muted-foreground">{configuredCount}</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading hubs…
            </div>
          ) : hubs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No hubs yet. Search an area above (HSR, Bellandur, BTM…) and save a coverage
              circle. Until you add one, website and WhatsApp booking stay open everywhere.
            </p>
          ) : (
            <ul className="space-y-2 pb-8">
              {hubs.map((hub) => {
                const isSel = !draft && hub.id === selectedId;
                return (
                  <li key={hub.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(null);
                        setSelectedId(hub.id);
                      }}
                      className={cn(
                        'flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors duration-200',
                        isSel
                          ? 'border-sky-600 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40'
                          : 'border-border bg-card hover:bg-muted/50',
                        !hub.is_active && 'opacity-60'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          isSel ? 'bg-sky-600 text-white' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <MapPin className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{hub.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {hub.radius_km.toFixed(1)} km
                          {hub.is_active ? '' : ' · paused'}
                        </span>
                      </span>
                      {isSel ? <Check className="h-5 w-5 shrink-0 text-sky-700" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selected?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              People will no longer be able to book from this coverage circle (unless another hub
              still covers them).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Keep hub</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
