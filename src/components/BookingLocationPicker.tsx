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
  /** Fired whenever the pin is placed (search, GPS, or map settle) so the job always has coords. */
  onPinChange?: (value: { coordinates: { lat: number; lng: number }; googleMapsLink: string }) => void;
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

function coordsFromPlaceGeometry(
  place: google.maps.places.PlaceResult | null
): { lat: number; lng: number } | null {
  const loc = place?.geometry?.location;
  if (loc && typeof loc.lat === 'function' && typeof loc.lng === 'function') {
    const lat = loc.lat();
    const lng = loc.lng();
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      return { lat, lng };
    }
  }
  const viewport = place?.geometry?.viewport;
  if (viewport && typeof viewport.getCenter === 'function') {
    const center = viewport.getCenter();
    const lat = center.lat();
    const lng = center.lng();
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      return { lat, lng };
    }
  }
  return null;
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

function firstResolvedPin(
  ...attempts: Promise<{ coords: { lat: number; lng: number }; address: string } | null>[]
): Promise<{ coords: { lat: number; lng: number }; address: string } | null> {
  return new Promise((resolve) => {
    let pending = attempts.length;
    let settled = false;
    const finish = (
      value: { coords: { lat: number; lng: number }; address: string } | null
    ) => {
      if (settled) return;
      if (value?.coords) {
        settled = true;
        resolve(value);
        return;
      }
      pending -= 1;
      if (pending <= 0) {
        settled = true;
        resolve(null);
      }
    };
    for (const attempt of attempts) {
      attempt.then(finish, () => finish(null));
    }
  });
}

function pinFromGeocoderResults(
  results: google.maps.GeocoderResult[] | null
): { coords: { lat: number; lng: number }; address: string } | null {
  const result = results?.[0];
  const loc = result?.geometry?.location;
  if (!loc || typeof loc.lat !== 'function') return null;
  const coords = { lat: loc.lat(), lng: loc.lng() };
  if (!hasCoords(coords)) return null;
  return {
    coords,
    address: removePlusCode(result.formatted_address || ''),
  };
}

function geocodeByPlaceId(
  placeId: string
): Promise<{ coords: { lat: number; lng: number }; address: string } | null> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) {
      resolve(null);
      return;
    }
    try {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId }, (results, status) => {
        if (status === window.google.maps.GeocoderStatus.OK) {
          resolve(pinFromGeocoderResults(results));
          return;
        }
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

function reverseGeocode(location: { lat: number; lng: number }): Promise<string | null> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) {
      resolve(null);
      return;
    }
    try {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location }, (results, status) => {
        if (status === window.google.maps.GeocoderStatus.OK && results?.[0]) {
          resolve(removePlusCode(results[0].formatted_address || '') || null);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
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
  onPinChange,
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
  const pinLabelCacheRef = useRef(new Map<string, string>());
  const skipNextIdleLabelRef = useRef(false);
  const skipSeedOnOpenRef = useRef(false);
  const savingRef = useRef(false);
  const centerLiveRef = useRef(BENGALURU);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  onPinChangeRef.current = onPinChange;
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
      const timer = window.setTimeout(() => {
        setSearching(false);
      }, 6000);
      service.getPlacePredictions(
        {
          input: trimmed,
          componentRestrictions: { country: 'in' },
          ...(token ? { sessionToken: token } : {}),
        },
        (results, status) => {
          window.clearTimeout(timer);
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
    const minMoveMeters = 4;
    if (
      last &&
      haversineKm(last.lat, last.lng, coords.lat, coords.lng) * 1000 < minMoveMeters
    ) {
      setGeocoding(false);
      return;
    }

    const cacheKey = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
    const cached = pinLabelCacheRef.current.get(cacheKey);
    if (cached) {
      lastLabelLookupRef.current = coords;
      setAddress(cached);
      setGeocoding(false);
      return;
    }

    const seq = ++pinLabelSeqRef.current;
    lastLabelLookupRef.current = coords;
    setGeocoding(true);
    const safety = window.setTimeout(() => {
      if (seq === pinLabelSeqRef.current) setGeocoding(false);
    }, 4000);

    void withTimeout(reverseGeocode(coords), 4000, null)
      .then((geo) => {
        if (seq !== pinLabelSeqRef.current) return;
        window.clearTimeout(safety);
        if (geo) {
          setAddress(geo);
          pinLabelCacheRef.current.set(cacheKey, geo);
        }
        setGeocoding(false);
      })
      .catch(() => {
        if (seq !== pinLabelSeqRef.current) return;
        window.clearTimeout(safety);
        setGeocoding(false);
      });
  };
  paintPinLabelRef.current = paintPinLabel;

  const emitPin = (coords: { lat: number; lng: number }) => {
    if (!hasCoords(coords)) return;
    centerLiveRef.current = coords;
    onPinChangeRef.current?.({
      coordinates: coords,
      googleMapsLink: googleMapsPinUrl(coords.lat, coords.lng),
    });
  };

  const readLivePin = () => {
    const intended = centerLiveRef.current;
    const mapCenter = mapInstanceRef.current?.getCenter();
    if (mapCenter) {
      const fromMap = { lat: mapCenter.lat(), lng: mapCenter.lng() };
      if (hasCoords(fromMap)) {
        if (!hasCoords(intended)) return fromMap;
        const meters =
          haversineKm(intended.lat, intended.lng, fromMap.lat, fromMap.lng) * 1000;
        // Search/GPS already stored the intended pin; map may not have finished panning.
        if (meters > 80) return intended;
        return fromMap;
      }
    }
    return intended;
  };

  const applyCoords = async (
    coords: { lat: number; lng: number },
    preset?: { address?: string }
  ) => {
    setCenter(coords);
    emitPin(coords);
    setZoom(DEFAULT_ZOOM);
    setCameraNonce((n) => n + 1);
    skipSeedOnOpenRef.current = true;
    if (preset?.address) {
      skipNextIdleLabelRef.current = true;
      lastLabelLookupRef.current = coords;
      setAddress(removePlusCode(preset.address));
      setGeocoding(false);
    }
    onOpenChange(true);
    if (preset?.address) return;
    paintPinLabel(coords);
  };

  const detailsForPrediction = (
    prediction: PlacePrediction
  ): Promise<{ coords: { lat: number; lng: number }; address: string } | null> => {
    return new Promise((resolve) => {
      const host = placesHostRef.current || document.createElement('div');
      if (!window.google?.maps?.places?.PlacesService) {
        resolve(null);
        return;
      }
      const service = new window.google.maps.places.PlacesService(host);
      service.getDetails(
        {
          placeId: prediction.placeId,
          fields: ['formatted_address', 'geometry'],
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
    });
  };

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    setResolvingPlace(true);
    setGeocoding(false);
    try {
      await ensureGoogleMapsApi();
      const pin = await withTimeout(
        firstResolvedPin(geocodeByPlaceId(prediction.placeId), detailsForPrediction(prediction)),
        5000,
        null
      );
      if (!pin?.coords) {
        toast.error('Could not open that place. Try another search.');
        return;
      }
      void applyCoords(pin.coords, {
        address: pin.address || prediction.mainText,
      });
    } catch {
      toast.error('Could not open that place. Try again.');
    } finally {
      setResolvingPlace(false);
      setGeocoding(false);
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
    emitPin(coords);
    if (skipNextIdleLabelRef.current) {
      skipNextIdleLabelRef.current = false;
      lastLabelLookupRef.current = coords;
      setGeocoding(false);
      return;
    }
    if (geocodeTimerRef.current != null) window.clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = window.setTimeout(() => {
      paintPinLabelRef.current(coords);
    }, 40);
  }, []);

  const canSave =
    houseFlat.trim().length > 0 &&
    hasCoords(centerLiveRef.current) &&
    Boolean(address.trim());

  const handleSave = () => {
    const pin = readLivePin();
    if (!canSave || savingRef.current || !hasCoords(pin)) return;
    savingRef.current = true;
    emitPin(pin);
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
    <div className="w-full overflow-hidden bg-white dark:bg-card">
      <p className="px-4 pb-3 pt-1 text-sm text-muted-foreground sm:px-6">
        Use two fingers to move the pin. One finger scrolls the page.
      </p>
      <div className="relative w-full">
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
            if (skipNextIdleLabelRef.current) {
              setGeocoding(false);
              return;
            }
            paintPinLabelRef.current(centerLiveRef.current);
          }}
          onMoveStart={() => setGeocoding(true)}
          onLocationChange={handleMapIdle}
        />
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3 sm:hidden">
          <span className="rounded-full bg-black/55 px-3 py-1 text-[12px] font-medium text-white shadow">
            Two fingers to move pin
          </span>
        </div>
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

      <div className="px-4 pb-4 pt-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-neutral-900 dark:text-foreground">
            {geocoding ? (
              <span className="inline-flex max-w-full items-center gap-2">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" />
                <span className="truncate">{address || 'Updating from the map pin…'}</span>
              </span>
            ) : (
              address || 'Selected location'
            )}
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
