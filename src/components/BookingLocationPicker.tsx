import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { ensureGoogleMapsApi } from '@/lib/googleMapsLink';
import {
  geolocationFailureMessage,
  getDeviceLocation,
  isGeolocationPositionError,
} from '@/lib/geolocation';
import { haversineKm, removePlusCode, googleMapsPinUrl } from '@/lib/maps';
import DraggableMap from '@/components/DraggableMap';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const DEFAULT_ZOOM = 18;
const NEARBY_BUSINESS_MAX_METERS = 80;
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
  host?: HTMLElement | google.maps.Map | null
): Promise<{ name: string } | null> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.places?.PlacesService) {
      resolve(null);
      return;
    }

    const pickClosest = (results: google.maps.places.PlaceResult[] | null) => {
      if (!results?.length) return null;
      let best: { name: string; meters: number } | null = null;
      for (const place of results.slice(0, 24)) {
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

    try {
      const service = new window.google.maps.places.PlacesService(
        host && 'getCenter' in host
          ? (host as google.maps.Map)
          : ((host as HTMLElement | null) || document.createElement('div'))
      );
      const finish = (results: google.maps.places.PlaceResult[] | null) => {
        const closest = pickClosest(results);
        resolve(closest ? { name: closest.name } : null);
      };
      service.nearbySearch(
        { location, radius: 120 },
        (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK) {
            finish(results);
            return;
          }
          service.nearbySearch(
            {
              location,
              rankBy: window.google.maps.places.RankBy.DISTANCE,
              type: 'store',
            },
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

export default function BookingLocationPicker({
  open,
  onOpenChange,
  startOn: _startOn = 'search',
  initial,
  onSave,
  inlineSearch = false,
  invalid = false,
  showCancel = false,
  onCancelSearch,
  onRequestSearch,
}: BookingLocationPickerProps) {
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
  const [myLocation, setMyLocation] = useState<{
    lat: number;
    lng: number;
    accuracyMeters?: number;
  } | null>(null);

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
  const savingRef = useRef(false);
  const centerLiveRef = useRef(BENGALURU);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const paintPinLabelRef = useRef<(coords: { lat: number; lng: number }) => void>(() => {});
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    if (!open) return;
    if (skipSeedOnOpenRef.current) {
      skipSeedOnOpenRef.current = false;
    } else {
      const seed = initialRef.current;
      const coords = hasCoords(seed?.coordinates) ? seed!.coordinates! : BENGALURU;
      setQuery('');
      setPredictions([]);
      setCenter(coords);
      centerLiveRef.current = coords;
      setZoom(hasCoords(seed?.coordinates) ? DEFAULT_ZOOM : 12);
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
    if (!open || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        };
        setMyLocation((prev) => {
          if (
            prev &&
            haversineKm(prev.lat, prev.lng, next.lat, next.lng) * 1000 < 4 &&
            Math.abs((prev.accuracyMeters || 0) - (next.accuracyMeters || 0)) < 8
          ) {
            return prev;
          }
          return next;
        });
      },
      () => {
        /* permission denied or unavailable — locate button still works */
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [open]);

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
    const minMoveMeters = 12;
    if (
      last &&
      haversineKm(last.lat, last.lng, coords.lat, coords.lng) * 1000 < minMoveMeters
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
        }
        setGeocoding(false);

        void withTimeout(
          findNearbyBusiness(coords, mapInstanceRef.current || placesHostRef.current),
          2500,
          null
        ).then((nearby) => {
          if (seq !== pinLabelSeqRef.current) return;
          const merged = mergeBusinessLabel(geo, nearby?.name);
          if (merged) {
            setAddress(merged.address);
            setTitle(merged.title);
            pinLabelCacheRef.current.set(cacheKey, merged);
          } else if (geo) {
            pinLabelCacheRef.current.set(cacheKey, geo);
          }
        });
      })
      .catch(() => {
        if (seq !== pinLabelSeqRef.current) return;
        window.clearTimeout(safety);
        setGeocoding(false);
      });
  };
  paintPinLabelRef.current = paintPinLabel;

  const applyCoords = async (
    coords: { lat: number; lng: number },
    preset?: { address?: string; title?: string }
  ) => {
    setCenter(coords);
    centerLiveRef.current = coords;
    setZoom(DEFAULT_ZOOM);
    setCameraNonce((n) => n + 1);
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
      setMyLocation({
        lat: loc.lat,
        lng: loc.lng,
        accuracyMeters: loc.accuracyMeters,
      });
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

  const handleMapIdle = useCallback((coords: { lat: number; lng: number }) => {
    centerLiveRef.current = coords;
    if (skipNextIdleLabelRef.current) {
      skipNextIdleLabelRef.current = false;
      lastLabelLookupRef.current = coords;
      return;
    }
    if (geocodeTimerRef.current != null) window.clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = window.setTimeout(() => {
      paintPinLabelRef.current(coords);
    }, 300);
  }, []);

  const canSave = houseFlat.trim().length > 0 && hasCoords(centerLiveRef.current) && Boolean(address.trim());

  const handleSave = () => {
    const pin = centerLiveRef.current;
    if (!canSave || savingRef.current || !hasCoords(pin)) return;
    savingRef.current = true;
    onSave({
      address: address.trim(),
      coordinates: pin,
      googleMapsLink: googleMapsPinUrl(pin.lat, pin.lng),
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

  const searchCard = inlineSearch && !open ? (
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

  const mapCard = open ? (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-border dark:bg-card">
      <p className="mb-3 text-sm text-muted-foreground">
        Move the map to place the pin on your door. Your location stays as the blue dot.
      </p>
      <div className="relative">
        <DraggableMap
          center={center}
          zoom={zoom}
          height="400px"
          cameraNonce={cameraNonce}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          zoomControl={false}
          centerPin
          myLocation={myLocation}
          onMapReady={(map) => {
            mapInstanceRef.current = map;
            if (!map) return;
            const pin = centerLiveRef.current;
            pinLabelCacheRef.current.delete(`${pin.lat.toFixed(4)},${pin.lng.toFixed(4)}`);
            lastLabelLookupRef.current = null;
            paintPinLabelRef.current(pin);
          }}
          onLocationChange={handleMapIdle}
        />
        <button
          type="button"
          onClick={() => void handleUseCurrentLocation()}
          disabled={gpsLoading}
          aria-label="Use current location"
          className="absolute bottom-4 right-3 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-sky-600 text-white shadow-[0_2px_10px_rgba(14,165,233,0.45)] transition-colors duration-200 hover:bg-sky-700 disabled:opacity-60"
        >
          {gpsLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <LocateFixed className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold leading-snug text-neutral-900 dark:text-foreground">
            {geocoding && !title ? 'Finding address…' : title || 'Selected location'}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-neutral-500">
            {geocoding && !address ? 'Updating from the map pin…' : address}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setPredictions([]);
            onOpenChange(false);
            onRequestSearch?.();
          }}
          className="mt-0.5 min-h-11 shrink-0 cursor-pointer rounded-lg border border-sky-600 px-3.5 py-1.5 text-sm font-medium text-sky-600 transition-colors duration-200 hover:bg-sky-50 dark:hover:bg-sky-950/40"
        >
          Change
        </button>
      </div>

      <input
        id="booking-house-flat"
        name="hro-house-flat"
        value={houseFlat}
        onChange={(e) => setHouseFlat(e.target.value)}
        placeholder="House/Flat Number*"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        data-1p-ignore="true"
        data-lpignore="true"
        maxLength={80}
        className="mt-3 h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 dark:border-border dark:bg-background dark:text-foreground"
      />
      <input
        id="booking-landmark"
        name="hro-landmark"
        value={landmark}
        onChange={(e) => setLandmark(e.target.value)}
        placeholder="Landmark (Optional)"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        data-1p-ignore="true"
        data-lpignore="true"
        maxLength={80}
        className="mt-2.5 h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 dark:border-border dark:bg-background dark:text-foreground"
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
            ? 'Wait for the address, or move the map slightly.'
            : 'Enter your house / flat number to continue.'}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <div ref={placesHostRef} className="hidden" aria-hidden="true" />
      {searchCard}
      {mapCard}
    </>
  );
}
