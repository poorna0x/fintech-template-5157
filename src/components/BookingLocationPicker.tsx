import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { ensureGoogleMapsApi } from '@/lib/googleMapsLink';
import {
  geolocationFailureMessage,
  getDeviceLocation,
  isGeolocationPositionError,
} from '@/lib/geolocation';
import { haversineKm, removePlusCode, googleMapsPinUrl } from '@/lib/maps';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const DEFAULT_ZOOM = 18;
const NEARBY_BUSINESS_MAX_METERS = 28;
const GENERIC_PLACE_TYPES = new Set([
  'route',
  'street_address',
  'plus_code',
  'political',
  'locality',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'neighborhood',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'country',
  'postal_code',
  'geocode',
]);

export type BookingLocationValue = {
  address: string;
  coordinates: { lat: number; lng: number };
  googleMapsLink: string;
  houseFlat: string;
  landmark: string;
};

type PlacePrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

type PickerView = 'search' | 'map';

type BookingLocationPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startOn?: PickerView;
  initial?: Partial<BookingLocationValue>;
  onSave: (value: BookingLocationValue) => void;
  inlineSearch?: boolean;
  invalid?: boolean;
  showCancel?: boolean;
  onCancelSearch?: () => void;
  onRequestSearch?: () => void;
};

function hasCoords(coords?: { lat?: number; lng?: number } | null): boolean {
  const lat = coords?.lat;
  const lng = coords?.lng;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    (lat !== 0 || lng !== 0)
  );
}

function streetTitleFromComponents(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  formatted: string
): string {
  const comps = components || [];
  const pick = (...types: string[]) =>
    comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name;
  const title =
    pick('route') ||
    pick('neighborhood', 'sublocality_level_2') ||
    pick('sublocality', 'sublocality_level_1') ||
    pick('premise', 'establishment') ||
    removePlusCode(formatted).split(',')[0];
  return (title || 'Selected location').trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

function reverseGeocode(
  location: { lat: number; lng: number }
): Promise<{ address: string; title: string } | null> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) {
      resolve(null);
      return;
    }
    try {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location }, (results, status) => {
        if (status === window.google.maps.GeocoderStatus.OK && results?.[0]) {
          const formatted = removePlusCode(results[0].formatted_address || '');
          resolve({
            address: formatted,
            title: streetTitleFromComponents(results[0].address_components, formatted),
          });
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

function isNamedBusiness(place: google.maps.places.PlaceResult): boolean {
  const name = (place.name || '').trim();
  if (!name) return false;
  const types = place.types || [];
  if (types.length > 0 && types.every((type) => GENERIC_PLACE_TYPES.has(type))) {
    return false;
  }
  if (/^\d+$/.test(name)) return false;
  if (/^(road|rd|street|st|cross|main)$/i.test(name)) return false;
  return true;
}

function findNearbyBusiness(
  location: { lat: number; lng: number },
  host?: HTMLElement | null
): Promise<{ name: string } | null> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.places?.PlacesService) {
      resolve(null);
      return;
    }

    const pickClosest = (results: google.maps.places.PlaceResult[] | null) => {
      if (!results?.length) return null;
      let best: { name: string; meters: number } | null = null;
      for (const place of results.slice(0, 20)) {
        const loc = place.geometry?.location;
        if (!loc || !isNamedBusiness(place)) continue;
        const meters =
          haversineKm(location.lat, location.lng, loc.lat(), loc.lng()) * 1000;
        if (meters > NEARBY_BUSINESS_MAX_METERS) continue;
        if (!best || meters < best.meters) {
          best = { name: (place.name || '').trim(), meters };
        }
      }
      return best;
    };

    const finish = (results: google.maps.places.PlaceResult[] | null) => {
      const closest = pickClosest(results);
      resolve(closest ? { name: closest.name } : null);
    };

    try {
      const el = host || document.createElement('div');
      const service = new window.google.maps.places.PlacesService(el);
      service.nearbySearch(
        {
          location,
          rankBy: window.google.maps.places.RankBy.DISTANCE,
          type: 'establishment',
        },
        (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK) {
            finish(results);
            return;
          }
          service.nearbySearch(
            { location, radius: 40 },
            (fallbackResults, fallbackStatus) => {
              if (fallbackStatus !== window.google.maps.places.PlacesServiceStatus.OK) {
                resolve(null);
                return;
              }
              finish(fallbackResults);
            }
          );
        }
      );
    } catch {
      resolve(null);
    }
  });
}

function mergeBusinessLabel(
  geo: { address: string; title: string } | null,
  business: string | null | undefined
): { address: string; title: string } | null {
  const name = business?.trim();
  if (!name) return geo;
  const address = geo?.address || '';
  const already = address.toLowerCase().includes(name.split('|')[0].trim().toLowerCase());
  return {
    title: name,
    address: already ? address : [name, address].filter(Boolean).join(', '),
  };
}

function looksLikeCopiedAddress(house: string, address: string): boolean {
  const h = house.trim().toLowerCase();
  const a = address.trim().toLowerCase();
  if (!h) return false;
  if (!a) return false;
  if (h === a) return true;
  if (a.startsWith(`${h},`) || a.startsWith(`${h} `)) return true;
  if (h.length > 48) return true;
  return /bengaluru|bangalore|karnataka|\blayout\b|\broad\b|\brd\b/.test(h) && h.includes(',');
}

function CloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_2px_10px_rgba(0,0,0,0.18)] transition-colors duration-200 hover:bg-neutral-50"
    >
      <X className="h-5 w-5" strokeWidth={2.25} />
    </button>
  );
}

/** Urban Company-style map pin: target head + needle. Tip of the stem is the map point. */
function MapCenterPin({ lifting }: { lifting: boolean }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[46%] z-10 flex flex-col items-center"
      style={{ transform: 'translate(-50%, calc(-100% + 3px))' }}
    >
      <div className="mb-1.5 max-w-[min(16.5rem,calc(100vw-2.5rem))] rounded-md bg-neutral-900 px-3 py-1.5 text-center text-xs font-medium leading-snug text-white shadow-md">
        Place the pin accurately on map
      </div>
      <div
        className={`flex flex-col items-center motion-reduce:translate-y-0 motion-reduce:transition-none ${
          lifting ? '-translate-y-2' : 'translate-y-0'
        }`}
        style={{ transition: 'transform 180ms ease-out' }}
      >
        <svg
          width="40"
          height="54"
          viewBox="0 0 40 54"
          fill="none"
          aria-hidden="true"
          className="drop-shadow-[0_3px_6px_rgba(226,60,82,0.45)]"
        >
          <ellipse cx="20" cy="51.5" rx="6" ry="2.2" fill="rgba(0,0,0,0.28)" />
          <path d="M20 30v19" stroke="#E23C52" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="20" cy="16" r="15" fill="#E23C52" />
          <circle cx="20" cy="16" r="8.2" fill="white" />
          <circle cx="20" cy="16" r="4.4" fill="#E23C52" />
        </svg>
      </div>
    </div>
  );
}

function CenterPinMap({
  center,
  zoom,
  cameraNonce,
  onIdleCenter,
}: {
  center: { lat: number; lng: number };
  zoom: number;
  cameraNonce: number;
  onIdleCenter: (coords: { lat: number; lng: number }) => void;
}) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const skipIdleRef = useRef(true);
  const onIdleRef = useRef(onIdleCenter);
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const [loaded, setLoaded] = useState(false);

  onIdleRef.current = onIdleCenter;
  centerRef.current = center;
  zoomRef.current = zoom;

  useEffect(() => {
    let cancelled = false;
    let idleListener: google.maps.MapsEventListener | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let sizePoll: number | null = null;
    const mapEl = mapElRef.current;

    const tryCreate = (): boolean => {
      if (cancelled || mapRef.current || !mapElRef.current) return Boolean(mapRef.current);
      if (!window.google?.maps?.Map) return false;
      const el = mapElRef.current;
      if (el.clientWidth < 8 || el.clientHeight < 8) return false;

      skipIdleRef.current = true;
      const map = new window.google.maps.Map(el, {
        center: centerRef.current,
        zoom: zoomRef.current,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
        scrollwheel: true,
        disableDoubleClickZoom: false,
        draggable: true,
        keyboardShortcuts: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: false,
      });
      idleListener = map.addListener('idle', () => {
        if (skipIdleRef.current) {
          skipIdleRef.current = false;
          return;
        }
        const next = map.getCenter();
        if (!next) return;
        onIdleRef.current({ lat: next.lat(), lng: next.lng() });
      });
      mapRef.current = map;
      setLoaded(true);
      window.setTimeout(() => {
        if (cancelled || !mapRef.current) return;
        try {
          google.maps.event.trigger(mapRef.current, 'resize');
        } catch {
          /* ignore */
        }
        skipIdleRef.current = true;
        mapRef.current.setCenter(centerRef.current);
      }, 80);
      return true;
    };

    const watchSize = () => {
      if (tryCreate()) return;
      if (mapElRef.current && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (tryCreate()) {
            resizeObserver?.disconnect();
            resizeObserver = null;
          }
        });
        resizeObserver.observe(mapElRef.current);
      }
      sizePoll = window.setInterval(() => {
        if (tryCreate() || cancelled) {
          if (sizePoll != null) window.clearInterval(sizePoll);
          sizePoll = null;
          resizeObserver?.disconnect();
          resizeObserver = null;
        }
      }, 80);
    };

    void (async () => {
      try {
        await ensureGoogleMapsApi();
      } catch {
        if (!cancelled) toast.error('Failed to load Google Maps. Please check your connection.');
        return;
      }
      if (!cancelled) watchSize();
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (sizePoll != null) window.clearInterval(sizePoll);
      if (idleListener) {
        try {
          google.maps.event.removeListener(idleListener);
        } catch {
          /* ignore */
        }
      }
      mapRef.current = null;
      mapEl?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    skipIdleRef.current = true;
    mapRef.current.panTo({ lat: centerRef.current.lat, lng: centerRef.current.lng });
    mapRef.current.setZoom(zoomRef.current);
  }, [cameraNonce]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapElRef} className="h-full w-full touch-none" />
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
        </div>
      )}
    </div>
  );
}

export default function BookingLocationPicker({
  open,
  onOpenChange,
  startOn = 'search',
  initial,
  onSave,
  inlineSearch = false,
  invalid = false,
  showCancel = false,
  onCancelSearch,
  onRequestSearch,
}: BookingLocationPickerProps) {
  const [view, setView] = useState<PickerView>('search');
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [center, setCenter] = useState(BENGALURU);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [cameraNonce, setCameraNonce] = useState(0);
  const [address, setAddress] = useState('');
  const [title, setTitle] = useState('');
  const [houseFlat, setHouseFlat] = useState('');
  const [landmark, setLandmark] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const placesHostRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const geocodeTimerRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const pinLabelSeqRef = useRef(0);
  const lastLabelLookupRef = useRef<{ lat: number; lng: number } | null>(null);
  const pinLabelCacheRef = useRef(
    new Map<string, { address: string; title: string }>()
  );
  const skipNextIdleLabelRef = useRef(false);
  const skipSeedOnOpenRef = useRef(false);
  const overlayFormRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);
  const initialRef = useRef(initial);
  const startOnRef = useRef(startOn);
  initialRef.current = initial;
  startOnRef.current = startOn;

  useEffect(() => {
    if (!open) return;
    if (skipSeedOnOpenRef.current) {
      skipSeedOnOpenRef.current = false;
    } else {
      const seed = initialRef.current;
      const coords = hasCoords(seed?.coordinates) ? seed!.coordinates! : BENGALURU;
      setView(startOnRef.current);
      setQuery('');
      setPredictions([]);
      setCenter(coords);
      setZoom(hasCoords(seed?.coordinates) ? DEFAULT_ZOOM : 12);
      setCameraNonce((n) => n + 1);
      setAddress(seed?.address ? removePlusCode(seed.address) : '');
      setTitle(seed?.address ? removePlusCode(seed.address).split(',')[0].trim() : '');
      const seededHouse = (seed?.houseFlat || '').trim();
      const seededAddress = seed?.address ? removePlusCode(seed.address) : '';
      setHouseFlat(looksLikeCopiedAddress(seededHouse, seededAddress) ? '' : seededHouse);
      setLandmark((seed?.landmark || '').trim());
      setSearching(false);
      setGpsLoading(false);
      setResolvingPlace(false);
      setGeocoding(false);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const form = overlayFormRef.current;
    const viewport = window.visualViewport;
    if (!form || !viewport) return;

    const syncHeight = () => {
      if (window.innerWidth >= 640) {
        form.style.height = '';
        return;
      }
      form.style.height = `${Math.round(viewport.height)}px`;
    };
    syncHeight();
    viewport.addEventListener('resize', syncHeight);
    viewport.addEventListener('scroll', syncHeight);
    return () => {
      viewport.removeEventListener('resize', syncHeight);
      viewport.removeEventListener('scroll', syncHeight);
      form.style.height = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      if (geocodeTimerRef.current != null) window.clearTimeout(geocodeTimerRef.current);
    };
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
          if (
            status !== window.google.maps.places.PlacesServiceStatus.OK ||
            !results?.length
          ) {
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

  const paintPinLabel = (coords: { lat: number; lng: number }) => {
    const last = lastLabelLookupRef.current;
    if (
      last &&
      haversineKm(last.lat, last.lng, coords.lat, coords.lng) * 1000 < 16
    ) {
      return;
    }

    const cacheKey = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
    const cached = pinLabelCacheRef.current.get(cacheKey);
    if (cached) {
      lastLabelLookupRef.current = coords;
      setAddress(cached.address);
      setTitle(cached.title);
      setGeocoding(false);
      return;
    }

    const seq = ++pinLabelSeqRef.current;
    lastLabelLookupRef.current = coords;
    if (!title && !address) setGeocoding(true);
    const safety = window.setTimeout(() => {
      if (seq === pinLabelSeqRef.current) setGeocoding(false);
    }, 4000);

    void reverseGeocode(coords)
      .then((geo) => {
        if (seq !== pinLabelSeqRef.current) return;
        window.clearTimeout(safety);
        if (geo) {
          setAddress(geo.address);
          setTitle(geo.title);
          pinLabelCacheRef.current.set(cacheKey, geo);
        }
        setGeocoding(false);

        void withTimeout(findNearbyBusiness(coords, placesHostRef.current), 1200, null).then(
          (nearby) => {
            if (seq !== pinLabelSeqRef.current) return;
            const merged = mergeBusinessLabel(geo, nearby?.name);
            if (merged) {
              setAddress(merged.address);
              setTitle(merged.title);
              pinLabelCacheRef.current.set(cacheKey, merged);
            }
          }
        );
      })
      .catch(() => {
        if (seq !== pinLabelSeqRef.current) return;
        window.clearTimeout(safety);
        setGeocoding(false);
      });
  };

  const applyCoords = async (
    coords: { lat: number; lng: number },
    preset?: { address?: string; title?: string }
  ) => {
    setCenter(coords);
    setZoom(DEFAULT_ZOOM);
    setCameraNonce((n) => n + 1);
    setView('map');
    skipSeedOnOpenRef.current = true;
    onOpenChange(true);
    if (preset?.address) {
      setAddress(removePlusCode(preset.address));
      setTitle(preset.title || removePlusCode(preset.address).split(',')[0].trim());
      skipNextIdleLabelRef.current = true;
      lastLabelLookupRef.current = coords;
      return;
    }
    paintPinLabel(coords);
  };

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    setResolvingPlace(true);
    try {
      await ensureGoogleMapsApi();
      const host = placesHostRef.current || document.createElement('div');
      const service = new window.google.maps.places.PlacesService(host);
      await new Promise<void>((resolve) => {
        service.getDetails(
          {
            placeId: prediction.placeId,
            fields: ['formatted_address', 'geometry', 'address_components', 'name'],
            ...(sessionTokenRef.current ? { sessionToken: sessionTokenRef.current } : {}),
          },
          (place, status) => {
            sessionTokenRef.current = null;
            if (
              status === window.google.maps.places.PlacesServiceStatus.OK &&
              place?.geometry?.location
            ) {
              const coords = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
              };
              const formatted = removePlusCode(place.formatted_address || prediction.mainText);
              const placeName = (place.name || prediction.mainText || '').trim();
              const streetTitle = streetTitleFromComponents(place.address_components, formatted);
              void applyCoords(coords, {
                address: placeName && formatted && !formatted.toLowerCase().includes(placeName.toLowerCase())
                  ? `${placeName}, ${formatted}`
                  : formatted,
                title: placeName || streetTitle,
              });
            } else {
              toast.error('Could not open that place. Try another search.');
            }
            resolve();
          }
        );
      });
    } catch {
      toast.error('Could not open that place. Try again.');
    } finally {
      setResolvingPlace(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setGpsLoading(true);
    try {
      await ensureGoogleMapsApi();
      const loc = await getDeviceLocation();
      await applyCoords({ lat: loc.lat, lng: loc.lng });
    } catch (error) {
      const message = isGeolocationPositionError(error)
        ? geolocationFailureMessage(error)
        : error instanceof Error
          ? error.message
          : 'Could not get your current location.';
      toast.error(message);
    } finally {
      setGpsLoading(false);
    }
  };

  const handleMapIdle = (coords: { lat: number; lng: number }) => {
    setCenter(coords);
    if (skipNextIdleLabelRef.current) {
      skipNextIdleLabelRef.current = false;
      lastLabelLookupRef.current = coords;
      return;
    }
    if (geocodeTimerRef.current != null) window.clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = window.setTimeout(() => {
      paintPinLabel(coords);
    }, 450);
  };

  const canSave = houseFlat.trim().length > 0 && hasCoords(center) && Boolean(address.trim());

  const handleSave = () => {
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    onSave({
      address: address.trim(),
      coordinates: center,
      googleMapsLink: googleMapsPinUrl(center.lat, center.lng),
      houseFlat: houseFlat.trim(),
      landmark: landmark.trim(),
    });
    setQuery('');
    setPredictions([]);
    onOpenChange(false);
    window.setTimeout(() => {
      savingRef.current = false;
    }, 400);
  };

  const searchResults = (
    <>
      {resolvingPlace ? (
        <div className="flex items-center gap-2 px-1 py-3 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening map…
        </div>
      ) : null}
      {searching && !resolvingPlace ? (
        <div className="flex items-center gap-2 px-1 py-3 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching…
        </div>
      ) : null}
      {!searching && query.trim().length >= 2 && predictions.length === 0 && !resolvingPlace ? (
        <p className="px-1 py-3 text-sm text-neutral-500">
          No matching places. Try a nearby landmark or street name.
        </p>
      ) : null}
      <ul>
        {predictions.map((item, index) => (
          <li key={item.placeId}>
            <button
              type="button"
              onClick={() => void handleSelectPlace(item)}
              className="flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-lg px-1 py-3 text-left transition-colors duration-150 hover:bg-neutral-50"
            >
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
              <span
                className={`min-w-0 flex-1 ${
                  index < predictions.length - 1 ? 'border-b border-neutral-100 pb-2.5' : ''
                }`}
              >
                <span className="block truncate text-[15px] font-semibold text-neutral-900">
                  {item.mainText}
                </span>
                {item.secondaryText ? (
                  <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
                    {item.secondaryText}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {predictions.length > 0 ? (
        <p className="px-1 pb-1 pt-1 text-[11px] text-neutral-400">
          powered by <span className="font-medium text-neutral-500">Google</span>
        </p>
      ) : null}
    </>
  );

  const searchCard = inlineSearch ? (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-card ${
        invalid ? 'border-red-500' : 'border-neutral-200 dark:border-border'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Select service location</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Search or use current location, then place the pin on the map
          </p>
        </div>
        {showCancel ? (
          <button
            type="button"
            onClick={onCancelSearch}
            className="mt-0.5 shrink-0 cursor-pointer text-sm font-medium text-sky-600 transition-colors duration-200 hover:text-sky-700"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400" />
        <input
          ref={searchInputRef}
          id="booking-location-search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search for area, street name…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-sky-500 bg-white pl-10 pr-10 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setPredictions([]);
              searchInputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-neutral-200 text-neutral-600 transition-colors duration-200 hover:bg-neutral-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => void handleUseCurrentLocation()}
        disabled={gpsLoading}
        className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 py-1.5 text-[15px] font-medium text-sky-600 transition-colors duration-200 hover:text-sky-700 disabled:opacity-60"
      >
        {gpsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
        {gpsLoading ? 'Getting current location…' : 'Use current location'}
      </button>

      {(searching || resolvingPlace || predictions.length > 0 || query.trim().length >= 2) ? (
        <div className="mt-2 max-h-[min(16rem,40vh)] overflow-y-auto overscroll-contain">{searchResults}</div>
      ) : null}
    </div>
  ) : null;

  const mapOverlay =
    open && typeof document !== 'undefined' ? (
      <div
        className="fixed inset-0 z-[80] flex justify-center overflow-hidden bg-neutral-900/50 overscroll-none sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Place pin on map"
      >
        <form
          ref={overlayFormRef}
          className="relative flex h-[100svh] w-full max-w-lg flex-col overflow-hidden bg-white text-neutral-900 sm:h-[min(100dvh,840px)] sm:rounded-2xl sm:shadow-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          autoComplete="off"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="relative min-h-[28vh] flex-1">
            <CenterPinMap
              center={center}
              zoom={zoom}
              cameraNonce={cameraNonce}
              onIdleCenter={handleMapIdle}
            />
            <CloseButton onClick={() => onOpenChange(false)} label="Close map" />

            <MapCenterPin lifting={geocoding || gpsLoading} />

            <button
              type="button"
              onClick={() => void handleUseCurrentLocation()}
              disabled={gpsLoading}
              aria-label="Use current location"
              className="absolute right-3 top-[max(3.75rem,calc(env(safe-area-inset-top)+3rem))] z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_2px_10px_rgba(0,0,0,0.18)] transition-colors duration-200 hover:bg-neutral-50 disabled:opacity-60"
            >
              {gpsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <LocateFixed className="h-5 w-5" />
              )}
            </button>
          </div>

          <div className="max-h-[58svh] shrink-0 overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pb-4 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold leading-snug text-neutral-900">
                  {geocoding && !title ? 'Finding address…' : title || 'Selected location'}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-neutral-500">
                  {geocoding && !address ? 'Updating from the map pin…' : address}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setView('search');
                  setQuery('');
                  setPredictions([]);
                  onOpenChange(false);
                  onRequestSearch?.();
                }}
              className="mt-0.5 min-h-11 shrink-0 cursor-pointer rounded-lg border border-sky-600 px-3.5 py-1.5 text-sm font-medium text-sky-600 transition-colors duration-200 hover:bg-sky-50"
              >
                Change
              </button>
            </div>

            <input
              id="booking-house-flat"
              name="hro-house-flat"
              value={houseFlat}
              onChange={(e) => setHouseFlat(e.target.value)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
              placeholder="House/Flat Number*"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              data-1p-ignore="true"
              data-lpignore="true"
              maxLength={80}
              className="mt-3 h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15"
            />
            <input
              id="booking-landmark"
              name="hro-landmark"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })}
              placeholder="Landmark (Optional)"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              data-1p-ignore="true"
              data-lpignore="true"
              maxLength={80}
              className="mt-2.5 h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15"
            />

            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={`mt-3 flex h-12 w-full min-h-12 cursor-pointer items-center justify-center rounded-lg text-[15px] font-semibold transition-colors duration-200 ${
                canSave
                  ? 'bg-sky-600 text-white hover:bg-sky-700'
                  : 'cursor-not-allowed bg-neutral-200 text-white'
              }`}
            >
              Save and proceed
            </button>
            {!canSave ? (
              <p className="mt-2 pb-1 text-center text-xs text-neutral-500">
                {!address.trim()
                  ? 'Wait for the address, or move the pin slightly.'
                  : 'Enter your house / flat number to continue.'}
              </p>
            ) : null}
          </div>
        </form>
      </div>
    ) : null;

  return (
    <>
      <div ref={placesHostRef} className="hidden" aria-hidden="true" />
      {searchCard}
      {mapOverlay && typeof document !== 'undefined' ? createPortal(mapOverlay, document.body) : null}
    </>
  );
}
