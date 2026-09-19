import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Award, IndianRupee, Layers, Loader2, MapPin, Users } from 'lucide-react';
import { toast } from 'sonner';
import DraggableMap from '@/components/DraggableMap';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/supabase';
import {
  fetchBookingServiceHubs,
  hubMapColors,
  hubPolygonOrCircle,
  type BookingServiceHub,
} from '@/lib/bookingServiceHubs';
import {
  buildSpreadInsights,
  brandColor,
  cellOutsideHubs,
  customersWithoutMap,
  DEFAULT_SPREAD_CELL_KM,
  DEFAULT_SPREAD_SCOPE,
  formatSpreadInr,
  jobsWithoutMap,
  maxSpreadValue,
  parseSpreadPayload,
  pocketBrandRows,
  SPREAD_POCKET_SIZES,
  SPREAD_SCOPES,
  spreadCircleRadiusMeters,
  spreadFillColor,
  type SpreadCell,
  type SpreadColorMode,
  type SpreadPayload,
  type SpreadScope,
} from '@/lib/analyticsCustomerSpread';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; payload: SpreadPayload }>();

const COLOR_MODES: Array<{ id: SpreadColorMode; label: string }> = [
  { id: 'customers', label: 'Customers' },
  { id: 'billing', label: 'Billing' },
  { id: 'brand', label: 'Brand' },
];

type Props = {
  startISO: string | null;
  endISO: string | null;
};

export default function AnalyticsCustomerSpreadMap({ startISO, endISO }: Props) {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<SpreadPayload | null>(null);
  const [hubs, setHubs] = useState<BookingServiceHub[]>([]);
  const [colorMode, setColorMode] = useState<SpreadColorMode>('customers');
  const [showHubs, setShowHubs] = useState(true);
  const [selected, setSelected] = useState<SpreadCell | null>(null);
  const [cellKm, setCellKm] = useState(DEFAULT_SPREAD_CELL_KM);
  const [scope, setScope] = useState<SpreadScope>(DEFAULT_SPREAD_SCOPE);

  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const fitKeyRef = useRef('');
  const selectedRef = useRef<SpreadCell | null>(null);
  const loadGenRef = useRef(0);
  selectedRef.current = selected;

  const cacheKey = `v6|${startISO || 'all'}|${endISO || 'all'}|${cellKm}|${scope}`;
  const fitKey = `v6|${startISO || 'all'}|${endISO || 'all'}|${scope}`;
  const cells = payload?.cells || [];
  const maxValue = useMemo(() => maxSpreadValue(cells, colorMode), [cells, colorMode]);
  const maxCustomers = useMemo(
    () => cells.reduce((max, cell) => Math.max(max, cell.customers), 0),
    [cells]
  );
  const insights = useMemo(() => buildSpreadInsights(cells, hubs), [cells, hubs]);

  const focusCell = useCallback((cell: SpreadCell) => {
    setSelected(cell);
    const map = mapRef.current;
    if (map) {
      map.panTo({ lat: cell.lat, lng: cell.lng });
      map.setZoom(Math.max(map.getZoom() || 12, 13));
    }
  }, []);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setPayload(cached.payload);
      setLoading(false);
      void fetchBookingServiceHubs({ includeInactive: false }).then((hubRes) => setHubs(hubRes.hubs || []));
      return;
    }
    setLoading(true);
    try {
      const [spreadRes, hubRes] = await Promise.all([
        db.analyticsPaginated.getCustomerSpread({
          startISO,
          endISO,
          cellKm,
          activeOnly: scope === 'period',
        }),
        fetchBookingServiceHubs({ includeInactive: false }),
      ]);
      if (gen !== loadGenRef.current) return;
      if (spreadRes.error) {
        const msg = String(spreadRes.error.message || spreadRes.error);
        toast.error(
          msg.toLowerCase().includes('get_analytics_customer_spread')
            ? 'Run scripts/add-analytics-customer-spread-rpc.sql in Supabase first.'
            : `Could not load customer spread: ${msg}`
        );
        setPayload(null);
        return;
      }
      const next = parseSpreadPayload(spreadRes.data);
      cache.set(cacheKey, { at: Date.now(), payload: next });
      setPayload(next);
      setHubs(hubRes.hubs || []);
      if (next.cells.length === 0) {
        toast.info('No mapped customer pins yet.');
      }
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      toast.error(err instanceof Error ? err.message : 'Could not load customer spread');
      setPayload(null);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [cacheKey, cellKm, endISO, scope, startISO]);

  useEffect(() => {
    void load();
  }, [load]);

  const paint = useCallback(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    for (const overlay of overlaysRef.current) {
      (overlay as google.maps.Circle | google.maps.Polygon).setMap(null);
    }
    overlaysRef.current = [];

    if (showHubs) {
      for (const hub of hubs) {
        const colors = hubMapColors(hub.service_kind, false, hub.is_active);
        const polygon = new window.google.maps.Polygon({
          map,
          paths: hubPolygonOrCircle(hub),
          fillColor: colors.fill,
          fillOpacity: 0.18,
          strokeColor: colors.stroke,
          strokeOpacity: 0.55,
          strokeWeight: 1,
          clickable: false,
          geodesic: false,
        });
        overlaysRef.current.push(polygon);
      }
    }

    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;
    for (const cell of cells) {
      const colors = spreadFillColor(cell, maxValue, colorMode);
      const isSel =
        selectedRef.current &&
        Math.abs(selectedRef.current.lat - cell.lat) < 1e-6 &&
        Math.abs(selectedRef.current.lng - cell.lng) < 1e-6;
      const circle = new window.google.maps.Circle({
        map,
        center: { lat: cell.lat, lng: cell.lng },
        radius: spreadCircleRadiusMeters(cell, maxCustomers, payload?.cell_km || cellKm),
        fillColor: colors.stroke,
        fillOpacity: isSel ? 0.55 : 0.38,
        strokeColor: isSel ? '#0f172a' : colors.stroke,
        strokeOpacity: 0.95,
        strokeWeight: isSel ? 3 : 1.5,
        clickable: true,
        zIndex: isSel ? 20 : 1,
      });
      circle.addListener('click', () => setSelected(cell));
      overlaysRef.current.push(circle);
      const nearCore = Math.abs(cell.lat - BENGALURU.lat) < 0.45 && Math.abs(cell.lng - BENGALURU.lng) < 0.45;
      if (nearCore) {
        bounds.extend({ lat: cell.lat, lng: cell.lng });
        hasPoint = true;
      }
    }

    if (hasPoint && fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      map.fitBounds(bounds, 48);
    }
  }, [cellKm, cells, colorMode, fitKey, hubs, maxCustomers, maxValue, payload?.cell_km, selected, showHubs]);

  useEffect(() => {
    paint();
  }, [paint, loading]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Segmented
            className="sm:flex-1"
            items={COLOR_MODES}
            value={colorMode}
            onChange={(id) => setColorMode(id as SpreadColorMode)}
          />
          <Button
            type="button"
            size="sm"
            variant={showHubs ? 'secondary' : 'outline'}
            className="h-11 w-full cursor-pointer sm:h-9 sm:w-auto"
            onClick={() => setShowHubs((v) => !v)}
          >
            <Layers className="mr-1.5 h-4 w-4" />
            {showHubs ? 'Hubs on' : 'Hubs off'}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Show</p>
            <Segmented
              items={SPREAD_SCOPES}
              value={scope}
              onChange={(id) => {
                if (id === scope) return;
                setSelected(null);
                setScope(id as SpreadScope);
              }}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Pocket size</p>
            <Segmented
              items={SPREAD_POCKET_SIZES.map((size) => ({ id: String(size.km), label: size.label }))}
              value={String(cellKm)}
              onChange={(km) => {
                const next = Number(km);
                if (next === cellKm) return;
                setSelected(null);
                setCellKm(next);
              }}
            />
          </div>
        </div>
      </div>

      {payload ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatChip
            icon={<Users className="h-4 w-4" />}
            label="Mapped customers"
            value={String(payload.customers_with_pin)}
          />
          <StatChip
            icon={<MapPin className="h-4 w-4" />}
            label="Pockets"
            value={String(cells.length)}
          />
          <StatChip
            icon={<IndianRupee className="h-4 w-4" />}
            label="Mapped billing"
            value={formatSpreadInr(cells.reduce((sum, c) => sum + c.revenue, 0))}
          />
          <StatChip
            icon={<Award className="h-4 w-4" />}
            label="No map"
            value={String(customersWithoutMap(payload))}
          />
        </div>
      ) : null}
      {payload && jobsWithoutMap(payload) > 0 ? (
        <p className="text-xs text-muted-foreground">
          {jobsWithoutMap(payload)} jobs in this period have no map location, so they are not in the pockets.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="relative h-[min(56dvh,440px)] min-h-[280px] md:h-[min(58dvh,560px)]">
          <DraggableMap
            center={BENGALURU}
            zoom={11}
            height="100%"
            hideMarker
            mapTypeControl={false}
            streetViewControl={false}
            fullscreenControl={false}
            onMapReady={(map) => {
              mapRef.current = map;
              paint();
            }}
          />
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Mapping customers…
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex flex-col items-start gap-1.5 sm:flex-row sm:items-end sm:justify-between">
            <Legend mode={colorMode} />
            <p className="hidden rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white sm:block">
              Color = {colorMode === 'brand' ? 'top RO brand' : colorMode === 'billing' ? 'billing' : 'customer density'}. Tap a circle.
            </p>
          </div>
        </div>
      </div>

      {insights.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {insights.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => focusCell(row.cell)}
              className="min-h-14 cursor-pointer rounded-xl border border-border bg-card px-3 py-3 text-left hover:bg-muted/50"
            >
              <p className="text-sm font-semibold text-foreground">{row.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p>
            </button>
          ))}
        </div>
      ) : null}

      {selected ? (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-foreground">{selected.area}</p>
              <p className="text-xs text-muted-foreground">
                {selected.customers} customers · {selected.jobs} jobs
                {cellOutsideHubs(selected, hubs) ? ' · outside Location Hubs' : ''}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 shrink-0 cursor-pointer sm:h-9"
              onClick={() => setSelected(null)}
            >
              Close
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <MiniStat label="Billing" value={formatSpreadInr(selected.revenue)} />
            <MiniStat label="Avg bill" value={formatSpreadInr(selected.avg_bill)} />
            <MiniStat label="Install / service" value={`${selected.installation} / ${selected.service}`} />
            <MiniStat label="Avg TDS" value={selected.avg_tds != null ? `${selected.avg_tds}` : '—'} />
          </div>
          {pocketBrandRows(selected).length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top brands + models here</p>
              {pocketBrandRows(selected).map((brand) => {
                const share = selected.jobs > 0 ? Math.round((brand.jobs / selected.jobs) * 100) : 0;
                return (
                  <div key={brand.name} className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{brand.name}</span>
                    <span className="hidden h-2 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                      <span
                        className="block h-2 rounded-full"
                        style={{ width: `${Math.max(8, share)}%`, backgroundColor: brandColor(brand.name) }}
                      />
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted-foreground">
                      {share}% · {formatSpreadInr(brand.revenue)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : selected.jobs === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No jobs in the selected dates for this pocket.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Cooler colors are quieter pockets. Red / dark green are hot. Overlay Location Hubs to see customers we already
          cover vs pockets worth expanding into.
        </p>
      )}
    </div>
  );
}

function Segmented({
  items,
  value,
  onChange,
  className = '',
}: {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-1 rounded-xl border border-border bg-muted/40 p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`h-11 min-w-0 cursor-pointer rounded-lg px-1 text-sm font-medium transition-colors duration-200 sm:h-9 ${
              active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function StatChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background px-2.5 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Legend({ mode }: { mode: SpreadColorMode }) {
  if (mode === 'brand') {
    return (
      <p className="rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">Each color is a brand + model</p>
    );
  }
  const low = mode === 'billing' ? '#bbf7d0' : '#7dd3fc';
  const high = mode === 'billing' ? '#14532d' : '#e11d48';
  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
      <span>Low</span>
      <span
        className="h-2 w-20 rounded-full"
        style={{ background: `linear-gradient(90deg, ${low}, ${high})` }}
      />
      <span>High</span>
    </div>
  );
}
