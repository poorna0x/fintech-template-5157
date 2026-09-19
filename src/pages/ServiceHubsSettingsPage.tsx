import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  PhoneCall,
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
import { Textarea } from '@/components/ui/textarea';
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
import {
  clearPlacesSessionToken,
  fetchGooglePlacePredictions,
  getOrCreatePlacesSessionToken,
  MIN_PLACE_QUERY_LEN,
  resolveGooglePlaceDetails,
} from '@/lib/googlePlacesSearch';
import { haversineKm } from '@/lib/maps';
import DraggableMap from '@/components/DraggableMap';
import {
  clampHubRadiusKm,
  circleToHubPolygon,
  createBookingServiceHub,
  DEFAULT_HUB_POLYGON_POINTS,
  DEFAULT_HUB_RADIUS_KM,
  DEFAULT_OUT_OF_AREA_MESSAGE,
  deleteBookingServiceHub,
  fetchBookingServiceHubs,
  hubContainsPoint,
  hubKindLabel,
  hubKindMessagePlaceholder,
  hubMapColors,
  HUB_KIND_OPTIONS,
  hubPolygonMetrics,
  hubPolygonOrCircle,
  MAX_CUSTOMER_NOTE_LEN,
  MAX_HUB_RADIUS_KM,
  MAX_OUT_OF_AREA_MESSAGE_LEN,
  MIN_HUB_RADIUS_KM,
  parseHubPolygon,
  scaleHubPolygon,
  translateHubPolygon,
  updateBookingHubSettings,
  updateBookingServiceHub,
  type BookingServiceHub,
  type HubLatLng,
  type HubServiceKind,
} from '@/lib/bookingServiceHubs';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const MAP_LARGE_STORAGE_KEY = 'hro-service-hubs-map-large';

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
  polygon: HubLatLng[];
  service_kind: HubServiceKind;
  customer_note: string;
};

function KindIcon({
  kind,
  className,
  style,
}: {
  kind: HubServiceKind;
  className?: string;
  style?: CSSProperties;
}) {
  if (kind === 'callback') return <PhoneCall className={className} style={style} />;
  if (kind === 'no_service') return <Ban className={className} style={style} />;
  return <CheckCircle2 className={className} style={style} />;
}

function KindBadge({ kind, paused }: { kind: HubServiceKind; paused?: boolean }) {
  if (paused) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        Paused
      </span>
    );
  }
  const colors = hubMapColors(kind, false, true);
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: colors.stroke, backgroundColor: colors.fill }}
    >
      {hubKindLabel(kind)}
    </span>
  );
}

type Props = {
  onBack: () => void;
};

function pathToHubPoints(path: google.maps.MVCArray<google.maps.LatLng>): HubLatLng[] {
  const pts: HubLatLng[] = [];
  const len = path.getLength();
  for (let i = 0; i < len; i += 1) {
    const ll = path.getAt(i);
    pts.push({ lat: ll.lat(), lng: ll.lng() });
  }
  return parseHubPolygon(pts);
}

export default function ServiceHubsSettingsPage({ onBack }: Props) {
  const [hubs, setHubs] = useState<BookingServiceHub[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftHub | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [outOfAreaMessage, setOutOfAreaMessage] = useState(DEFAULT_OUT_OF_AREA_MESSAGE);
  const [missingMessagesTable, setMissingMessagesTable] = useState(false);

  const [mapLarge, setMapLarge] = useState(() => {
    try {
      return window.sessionStorage.getItem(MAP_LARGE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [desktopMap, setDesktopMap] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);

  const placesHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const debounceRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const hubsRef = useRef(hubs);
  const draftRef = useRef(draft);
  const skipPaintRef = useRef(false);
  const fitKeyRef = useRef('');
  const mapClickBoundRef = useRef(false);
  const editableCircleRef = useRef<google.maps.Polygon | null>(null);
  const onMapClickRef = useRef<(event: google.maps.MapMouseEvent) => void>(() => {});

  hubsRef.current = hubs;
  draftRef.current = draft;

  const selected = useMemo(
    () => hubs.find((h) => h.id === selectedId) || null,
    [hubs, selectedId]
  );
  const draftAnchor = draft
    ? `${draft.lat.toFixed(4)},${draft.lng.toFixed(4)}:${draft.service_kind}`
    : '';

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchBookingServiceHubs({ includeInactive: true, force: true });
    setMissingTable(result.missingTable);
    if (result.error && !result.missingTable) {
      toast.error(result.error);
    }
    setHubs(result.hubs);
    setOutOfAreaMessage(result.settings.out_of_area_message);
    setMissingMessagesTable(result.missingSettingsTable);
    setLoading(false);
    if (!selectedId && result.hubs[0]) setSelectedId(result.hubs[0].id);
  }, [selectedId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPredictions = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (trimmed.length < MIN_PLACE_QUERY_LEN) {
      setPredictions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      await ensureGoogleMapsApi();
      const token = getOrCreatePlacesSessionToken(sessionTokenRef);
      const results = await fetchGooglePlacePredictions(trimmed, token);
      setPredictions(results);
    } catch {
      setPredictions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchPredictions(value);
    }, 400);
  };

  const persistSelectedGeometry = useCallback(
    (patch: Partial<Pick<BookingServiceHub, 'lat' | 'lng' | 'radius_km' | 'polygon'>>) => {
      if (!selectedId) return;
      if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        void (async () => {
          const result = await updateBookingServiceHub(selectedId, patch);
          if (result.error || !result.hub) {
            toast.error(result.error || 'Could not update hub');
            return;
          }
          skipPaintRef.current = true;
          setHubs((prev) => prev.map((h) => (h.id === result.hub!.id ? result.hub! : h)));
        })();
      }, 450);
    },
    [selectedId]
  );

  const placeDraftAt = useCallback(
    (lat: number, lng: number, kind: HubServiceKind = 'normal', radiusKm = DEFAULT_HUB_RADIUS_KM) => {
      const label =
        kind === 'no_service' ? 'No service' : kind === 'callback' ? 'Call back' : 'New hub';
      setSelectedId(null);
      setDraft({
        name: label,
        address: '',
        lat,
        lng,
        radius_km: radiusKm,
        polygon: circleToHubPolygon(lat, lng, radiusKm, DEFAULT_HUB_POLYGON_POINTS),
        service_kind: kind,
        customer_note: '',
      });
    },
    []
  );

  const startNewHub = (kind: HubServiceKind) => {
    const center = mapRef.current?.getCenter();
    placeDraftAt(center?.lat() ?? BENGALURU.lat, center?.lng() ?? BENGALURU.lng, kind);
    const label = hubKindLabel(kind);
    toast.message(`${label} hub dropped on the map. Drag the corners, then save.`);
  };

  const paintMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    for (const overlay of overlaysRef.current) {
      (overlay as google.maps.Polygon | google.maps.Marker).setMap(null);
    }
    overlaysRef.current = [];
    editableCircleRef.current = null;

    const draftNow = draftRef.current;
    const rows: Array<{
      id: string;
      lat: number;
      lng: number;
      radius_km: number;
      polygon: HubLatLng[];
      kind: HubServiceKind;
      active: boolean;
      selected: boolean;
    }> = hubs.map((h) => ({
      id: h.id,
      lat: h.lat,
      lng: h.lng,
      radius_km: h.radius_km,
      polygon: hubPolygonOrCircle(h),
      kind: h.service_kind,
      active: h.is_active,
      selected: !draftNow && h.id === selectedId,
    }));
    if (draftNow) {
      rows.push({
        id: 'draft',
        lat: draftNow.lat,
        lng: draftNow.lng,
        radius_km: draftNow.radius_km,
        polygon: hubPolygonOrCircle(draftNow),
        kind: draftNow.service_kind,
        active: true,
        selected: true,
      });
    }

    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;

    for (const row of rows) {
      const colors = hubMapColors(row.kind, row.selected, row.active);
      const polygon = new window.google.maps.Polygon({
        map,
        paths: row.polygon,
        fillColor: colors.fill,
        fillOpacity: 1,
        strokeColor: colors.stroke,
        strokeOpacity: 0.9,
        strokeWeight: row.selected ? 2.5 : 1.5,
        clickable: row.selected || !draftNow,
        editable: row.selected,
        draggable: row.selected,
        geodesic: false,
        zIndex: row.selected ? 12 : row.kind === 'no_service' ? 8 : row.kind === 'callback' ? 4 : 2,
      });
      if (row.selected) {
        editableCircleRef.current = polygon;
        const applyPath = () => {
          const ring = pathToHubPoints(polygon.getPath());
          const metrics = hubPolygonMetrics(ring);
          if (!metrics) return;
          skipPaintRef.current = true;
          if (row.id === 'draft') {
            setDraft((prev) => (prev ? { ...prev, ...metrics, polygon: ring } : prev));
          } else {
            setHubs((prev) =>
              prev.map((h) => (h.id === row.id ? { ...h, ...metrics, polygon: ring } : h))
            );
            persistSelectedGeometry({ ...metrics, polygon: ring });
          }
        };
        const path = polygon.getPath();
        path.addListener('set_at', applyPath);
        path.addListener('insert_at', applyPath);
        path.addListener('remove_at', applyPath);
        polygon.addListener('dragend', applyPath);
      }
      if (row.id !== 'draft' && !draftNow) {
        const selectThis = () => {
          setDraft(null);
          setSelectedId(row.id);
        };
        polygon.addListener('click', selectThis);
      }
      const marker = new window.google.maps.Marker({
        map,
        position: { lat: row.lat, lng: row.lng },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: row.selected ? 8 : 6,
          fillColor: row.selected ? colors.stroke : '#ffffff',
          fillOpacity: 1,
          strokeColor: colors.stroke,
          strokeWeight: 2,
        },
        clickable: row.id !== 'draft' && !draftNow,
      });
      if (row.id !== 'draft' && !draftNow) {
        marker.addListener('click', () => {
          setDraft(null);
          setSelectedId(row.id);
        });
      }
      overlaysRef.current.push(polygon, marker);
      const path = polygon.getPath();
      for (let i = 0; i < path.getLength(); i += 1) {
        bounds.extend(path.getAt(i));
        hasPoint = true;
      }
    }

    const focus = draftNow || hubs.find((h) => h.id === selectedId) || null;
    const fitKey = draftNow
      ? `draft:${draftNow.lat.toFixed(4)},${draftNow.lng.toFixed(4)}`
      : `sel:${selectedId || ''}`;
    if (focus && fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      const radiusDeg = Math.max(0.02, (focus.radius_km * 1000) / 111_000) * 1.35;
      map.fitBounds({
        north: focus.lat + radiusDeg,
        south: focus.lat - radiusDeg,
        east: focus.lng + radiusDeg,
        west: focus.lng - radiusDeg,
      });
    } else if (!focus && hasPoint && !fitKeyRef.current) {
      map.fitBounds(bounds, 36);
      fitKeyRef.current = 'all';
    }
    try {
      window.google.maps.event.trigger(map, 'resize');
    } catch {
      /* ignore */
    }
  }, [draftAnchor, hubs, persistSelectedGeometry, selectedId]);

  onMapClickRef.current = (event) => {
    const latLng = event.latLng;
    if (!latLng) return;
    const lat = latLng.lat();
    const lng = latLng.lng();
    const existing = draftRef.current;
    if (existing) {
      const moved = translateHubPolygon(
        hubPolygonOrCircle(existing),
        { lat: existing.lat, lng: existing.lng },
        { lat, lng }
      );
      setDraft({ ...existing, lat, lng, polygon: moved });
      return;
    }
    const hit = hubsRef.current
      .map((hub) => ({ hub, distanceKm: haversineKm(lat, lng, hub.lat, hub.lng) }))
      .filter((row) => hubContainsPoint(row.hub, lat, lng))
      .sort((a, b) => a.distanceKm - b.distanceKm)[0];
    if (hit) {
      setSelectedId(hit.hub.id);
      return;
    }
    placeDraftAt(lat, lng);
  };

  const handleMapReady = useCallback(
    (map: google.maps.Map | null) => {
      mapRef.current = map;
      if (!map) {
        mapClickBoundRef.current = false;
        return;
      }
      if (!mapClickBoundRef.current) {
        mapClickBoundRef.current = true;
        map.addListener('click', (event: google.maps.MapMouseEvent) => {
          onMapClickRef.current(event);
        });
      }
      paintMap();
    },
    [paintMap]
  );

  useEffect(() => {
    if (skipPaintRef.current) {
      skipPaintRef.current = false;
      return;
    }
    paintMap();
  }, [paintMap, loading]);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
    };
  }, []);

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    setResolvingPlace(true);
    try {
      const details = await resolveGooglePlaceDetails(prediction.placeId, {
        sessionToken: sessionTokenRef.current,
        fallbackName: prediction.mainText,
        host: mapRef.current || placesHostRef.current,
      });
      if (!details) {
        toast.error('Could not open that place. Try another search.');
        return;
      }
      const overlapping = hubs.find(
        (h) => haversineKm(h.lat, h.lng, details.coords.lat, details.coords.lng) < 0.4
      );
      setSelectedId(null);
      setDraft({
        name: (details.name || prediction.mainText).slice(0, 80),
        address: details.address,
        lat: details.coords.lat,
        lng: details.coords.lng,
        radius_km: DEFAULT_HUB_RADIUS_KM,
        polygon: circleToHubPolygon(
          details.coords.lat,
          details.coords.lng,
          DEFAULT_HUB_RADIUS_KM
        ),
        service_kind: 'normal',
        customer_note: '',
      });
      if (overlapping) {
        toast.message(`Overlaps ${overlapping.name} — that’s fine. Save this as another hub.`);
      }
      setQuery('');
      setPredictions([]);
    } catch {
      toast.error('Could not open that place. Try again.');
    } finally {
      clearPlacesSessionToken(sessionTokenRef);
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
      polygon: hubPolygonOrCircle(draft),
      service_kind: draft.service_kind,
      sort_order: hubs.length,
      customer_note: draft.customer_note,
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
    patch: Partial<
      Pick<
        BookingServiceHub,
        'name' | 'radius_km' | 'polygon' | 'is_active' | 'customer_note' | 'lat' | 'lng' | 'service_kind'
      >
    >
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

  const applyKind = (kind: HubServiceKind) => {
    if (draft) {
      setDraft({ ...draft, service_kind: kind });
      return;
    }
    if (selected) void handlePatchSelected({ service_kind: kind });
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
  const editorKind: HubServiceKind = editor?.service_kind || 'normal';
  const configuredCount = hubs.filter((h) => h.is_active).length;
  const kindCounts = {
    normal: hubs.filter((h) => h.is_active && h.service_kind === 'normal').length,
    callback: hubs.filter((h) => h.is_active && h.service_kind === 'callback').length,
    no_service: hubs.filter((h) => h.is_active && h.service_kind === 'no_service').length,
  };

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setDesktopMap(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggleMapLarge = () => {
    setMapLarge((prev) => {
      const next = !prev;
      try {
        window.sessionStorage.setItem(MAP_LARGE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    const timer = window.setTimeout(() => {
      try {
        window.google.maps.event.trigger(map, 'resize');
      } catch {
        /* ignore */
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [mapLarge, desktopMap]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-y-contain bg-background">
      <div ref={placesHostRef} className="hidden" />
      <header className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2.5 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-11 min-w-11 cursor-pointer px-2"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          <span className="hidden sm:inline">Location Hubs</span>
          <span className="sm:hidden">Hubs</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-11 cursor-pointer gap-1.5 px-2.5 sm:px-3"
          onClick={toggleMapLarge}
        >
          {mapLarge ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          <span className="hidden sm:inline">{mapLarge ? 'Smaller map' : 'Larger map'}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-11 cursor-pointer gap-1.5"
          onClick={() => startNewHub('normal')}
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
      {missingMessagesTable ? (
        <div className="px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Run <code className="rounded bg-muted px-1">scripts/add-booking-service-hub-messages.sql</code> in
          the Supabase SQL editor to save custom booking messages.
        </div>
      ) : null}

      <div
        className={cn(
          'relative w-full shrink-0 overflow-hidden bg-muted',
          mapLarge
            ? 'h-[min(42dvh,440px)] max-h-[calc(100dvh-18rem)] min-h-[200px] md:h-[min(46dvh,500px)]'
            : 'h-[min(28dvh,260px)] max-h-[calc(100dvh-20rem)] min-h-[180px] md:h-[min(32dvh,300px)]'
        )}
      >
        <DraggableMap
          center={BENGALURU}
          zoom={11}
          height="100%"
          hideMarker
          gestureHandling="cooperative"
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
              placeholder="Search, or tap the map to add"
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
        <p className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[14rem] rounded-lg bg-black/55 px-2.5 py-1 text-right text-[11px] font-medium text-white sm:max-w-none">
          Tap the map or use the buttons below to add a hub
        </p>
      </div>

      <div className="shrink-0 border-b border-border bg-card px-3 py-2.5 sm:px-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Add a hub on the map</p>
        <div className="grid grid-cols-3 gap-2">
          {HUB_KIND_OPTIONS.map((opt) => {
            const colors = hubMapColors(opt.id, false, true);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => startNewHub(opt.id)}
                className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-white shadow-sm"
                style={{ backgroundColor: colors.stroke }}
              >
                <KindIcon kind={opt.id} className="h-4 w-4" />
                <span className="text-xs font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="md:border-r md:border-border">
          <div className="space-y-3 border-b border-border bg-card px-4 py-3">
            <Label htmlFor="out-of-area-message" className="text-sm font-medium">
              Outside coverage message
            </Label>
            <p className="text-xs text-muted-foreground">
              Shown when the pin is outside every serving hub. Optional: type {'{hubs}'} to list nearby areas.
            </p>
            <Textarea
              id="out-of-area-message"
              value={outOfAreaMessage}
              maxLength={MAX_OUT_OF_AREA_MESSAGE_LEN}
              rows={3}
              onChange={(e) => setOutOfAreaMessage(e.target.value.slice(0, MAX_OUT_OF_AREA_MESSAGE_LEN))}
              placeholder={DEFAULT_OUT_OF_AREA_MESSAGE}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-11 cursor-pointer"
              disabled={saving}
              onClick={() => {
                void (async () => {
                  setSaving(true);
                  const result = await updateBookingHubSettings({ out_of_area_message: outOfAreaMessage });
                  setSaving(false);
                  if (result.error || !result.settings) {
                    toast.error(result.error || 'Could not save message');
                    return;
                  }
                  setOutOfAreaMessage(result.settings.out_of_area_message);
                  toast.success('Outside-coverage message saved');
                })();
              }}
            >
              Save message
            </Button>
          </div>
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
                <p className="mb-2 text-sm font-medium">What happens here</p>
                <div className="grid grid-cols-3 gap-2">
                  {HUB_KIND_OPTIONS.map((opt) => {
                    const selectedKind = editorKind === opt.id;
                    const colors = hubMapColors(opt.id, selectedKind, true);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => applyKind(opt.id)}
                        className={cn(
                          'flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-colors duration-200',
                          selectedKind ? 'shadow-sm' : 'border-border bg-card hover:bg-muted/60'
                        )}
                        style={
                          selectedKind
                            ? { borderColor: colors.stroke, backgroundColor: colors.fill }
                            : undefined
                        }
                      >
                        <KindIcon kind={opt.id} className="h-4 w-4" style={{ color: colors.stroke }} />
                        <span className="text-xs font-semibold" style={{ color: colors.stroke }}>
                          {opt.label}
                        </span>
                        <span className="hidden text-[10px] leading-tight text-muted-foreground sm:block">
                          {opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {editorKind === 'no_service'
                    ? 'Hubs can overlap. A no-service pocket still blocks booking even when a Normal hub covers the same streets.'
                    : editorKind === 'callback'
                      ? 'Hubs can overlap. If a Normal hub also covers this pin, booking stays normal; otherwise we show the call-back message.'
                      : 'Hubs can overlap. Normal wins over Call back. A No-service hole still blocks that pocket.'}
                </p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Coverage size</span>
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
                    const current = draft || selected;
                    if (!current) return;
                    const scaled = scaleHubPolygon(
                      hubPolygonOrCircle(current),
                      { lat: current.lat, lng: current.lng },
                      current.radius_km,
                      radius
                    );
                    const shape = editableCircleRef.current;
                    if (shape) shape.setPath(scaled);
                    skipPaintRef.current = true;
                    if (draft) setDraft({ ...draft, radius_km: radius, polygon: scaled });
                    else if (selected) {
                      setHubs((prev) =>
                        prev.map((h) =>
                          h.id === selected.id ? { ...h, radius_km: radius, polygon: scaled } : h
                        )
                      );
                    }
                  }}
                  onValueCommit={([value]) => {
                    if (draft || !selected) return;
                    const shape = editableCircleRef.current;
                    const ring = shape
                      ? pathToHubPoints(shape.getPath())
                      : hubPolygonOrCircle(selected);
                    void handlePatchSelected({
                      radius_km: clampHubRadiusKm(value),
                      polygon: ring,
                    });
                  }}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 cursor-pointer"
                    onClick={() => {
                      const current = draft || selected;
                      if (!current) return;
                      const ring = circleToHubPolygon(current.lat, current.lng, current.radius_km);
                      const shape = editableCircleRef.current;
                      if (shape) shape.setPath(ring);
                      skipPaintRef.current = true;
                      if (draft) setDraft({ ...draft, polygon: ring });
                      else if (selected) {
                        setHubs((prev) =>
                          prev.map((h) => (h.id === selected.id ? { ...h, polygon: ring } : h))
                        );
                        void handlePatchSelected({ polygon: ring });
                      }
                    }}
                  >
                    Round shape
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Drag a white corner to cut that side out. Drag the smaller midpoint between corners to
                  add another point.
                </p>
              </div>
              <div>
                <Label htmlFor="hub-note" className="text-sm font-medium">
                  {editorKind === 'callback'
                    ? 'Call-back message'
                    : editorKind === 'no_service'
                      ? 'No-service message'
                      : 'Note for this area (optional)'}
                </Label>
                <p className="mb-2 mt-1 text-xs text-muted-foreground">
                  {editorKind === 'callback'
                    ? 'Shown after they pin here. Leave blank to use the default call-back copy.'
                    : editorKind === 'no_service'
                      ? 'Shown when they pin in this blocked pocket. Leave blank for the default no-service copy.'
                      : 'Shown when the pin is inside this hub. Example: “We may be a bit late in this area.”'}
                </p>
                <Textarea
                  id="hub-note"
                  value={draft ? draft.customer_note : selected?.customer_note || ''}
                  maxLength={MAX_CUSTOMER_NOTE_LEN}
                  rows={2}
                  placeholder={hubKindMessagePlaceholder(editorKind)}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, MAX_CUSTOMER_NOTE_LEN);
                    if (draft) setDraft({ ...draft, customer_note: next });
                    else if (selected) {
                      setHubs((prev) =>
                        prev.map((h) => (h.id === selected.id ? { ...h, customer_note: next } : h))
                      );
                    }
                  }}
                  onBlur={(e) => {
                    if (!draft && selected) void handlePatchSelected({ customer_note: e.target.value });
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
                  {editorKind === 'no_service'
                    ? 'Save hub — bookings blocked here'
                    : editorKind === 'callback'
                      ? 'Save hub — we’ll call them back'
                      : 'Save hub — bookings allowed here'}
                </Button>
              ) : selected ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selected.is_active}
                      disabled={saving}
                      onCheckedChange={(v) => void handlePatchSelected({ is_active: v })}
                      aria-label={editorKind === 'no_service' ? 'Exclusion is active' : 'Hub accepts bookings'}
                    />
                    <span className="text-sm text-muted-foreground">
                      {selected.is_active
                        ? editorKind === 'no_service'
                          ? 'Exclusion on'
                          : 'Accepts bookings'
                        : 'Paused'}
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
        </div>

        <div className="px-4 py-3 pb-10">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Configured hubs</h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {kindCounts.normal} normal · {kindCounts.callback} call back · {kindCounts.no_service} no service
              {configuredCount ? ` · ${configuredCount} on` : ''}
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading hubs…
            </div>
          ) : hubs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No hubs yet. Tap the map or Add hub, then pick Normal, Call back, or No service. Until you
              add a serving hub, website and WhatsApp booking stay open everywhere (except No-service
              pockets).
            </p>
          ) : (
            <ul className="space-y-2 pb-8">
              {hubs.map((hub) => {
                const isSel = !draft && hub.id === selectedId;
                const colors = hubMapColors(hub.service_kind, isSel, hub.is_active);
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
                        isSel ? 'shadow-sm' : 'border-border bg-card hover:bg-muted/50',
                        !hub.is_active && 'opacity-60'
                      )}
                      style={isSel ? { borderColor: colors.stroke, backgroundColor: colors.fill } : undefined}
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: colors.stroke }}
                      >
                        <KindIcon kind={hub.service_kind} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="block truncate font-medium text-foreground">{hub.name}</span>
                          <KindBadge kind={hub.service_kind} paused={!hub.is_active} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {hub.radius_km.toFixed(1)} km
                          {hub.customer_note ? ' · custom message' : ''}
                        </span>
                      </span>
                      {isSel ? <Check className="h-5 w-5 shrink-0" style={{ color: colors.stroke }} /> : null}
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
              People will no longer be able to book from this coverage area (unless another hub
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
