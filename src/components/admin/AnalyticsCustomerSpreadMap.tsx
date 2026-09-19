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
  formatSpreadInr,
  maxSpreadValue,
  parseSpreadPayload,
  spreadCircleRadiusMeters,
  spreadFillColor,
  type SpreadCell,
  type SpreadColorMode,
  type SpreadPayload,
} from '@/lib/analyticsCustomerSpread';

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; payload: SpreadPayload }>();

const COLOR_MODES: Array<{ id: SpreadColorMode; label: string }> = [
  { id: 'customers', label: 'Customers' },
  { id: 'billing', label: 'Billing' },
  { id: 'brand', label: 'Brand / model' },
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

  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);
  const fitKeyRef = useRef('');
  const selectedRef = useRef<SpreadCell | null>(null);
  selectedRef.current = selected;

  const cacheKey = `v2|${startISO || 'all'}|${endISO || 'all'}`;
  const cells = payload?.cells || [];
  const maxValue = useMemo(() => maxSpreadValue(cells, colorMode), [cells, colorMode]);
  const maxCustomers = useMemo(
    () => cells.reduce((max, cell) => Math.max(max, cell.customers), 0),
    [cells]
  );
  const insights = useMemo(() => buildSpreadInsights(cells, hubs), [cells, hubs]);

  const load = useCallback(async () => {
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
        }),
        fetchBookingServiceHubs({ includeInactive: false }),
      ]);
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
        toast.info('No mapped customer pins for this period.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load customer spread');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, endISO, startISO]);

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
        radius: spreadCircleRadiusMeters(cell, maxCustomers),
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
      bounds.extend({ lat: cell.lat, lng: cell.lng });
      hasPoint = true;
    }

    if (hasPoint && fitKeyRef.current !== cacheKey) {
      fitKeyRef.current = cacheKey;
      map.fitBounds(bounds, 48);
    }
  }, [cacheKey, cells, colorMode, hubs, maxCustomers, maxValue, selected, showHubs]);

  useEffect(() => {
    paint();
  }, [paint, loading]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {COLOR_MODES.map((mode) => (
          <Button
            key={mode.id}
            type="button"
            size="sm"
            variant={colorMode === mode.id ? 'default' : 'outline'}
            className="h-11 cursor-pointer sm:h-9"
            onClick={() => setColorMode(mode.id)}
          >
            {mode.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={showHubs ? 'secondary' : 'outline'}
          className="h-11 cursor-pointer sm:h-9"
          onClick={() => setShowHubs((v) => !v)}
        >
          <Layers className="mr-1.5 h-4 w-4" />
          {showHubs ? 'Hubs on' : 'Hubs off'}
        </Button>
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
            label="Pins missing"
            value={String(Math.max(0, payload.jobs_total - payload.jobs_with_pin))}
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="relative h-[min(52dvh,420px)] min-h-[240px] md:h-[min(58dvh,560px)]">
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
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-end justify-between gap-2">
            <Legend mode={colorMode} />
            <p className="rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
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
              onClick={() => {
                setSelected(row.cell);
                const map = mapRef.current;
                if (map) {
                  map.panTo({ lat: row.cell.lat, lng: row.cell.lng });
                  map.setZoom(Math.max(map.getZoom() || 12, 13));
                }
              }}
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
            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <MiniStat label="Billing" value={formatSpreadInr(selected.revenue)} />
            <MiniStat label="Avg bill" value={formatSpreadInr(selected.avg_bill)} />
            <MiniStat label="Install / service" value={`${selected.installation} / ${selected.service}`} />
            <MiniStat label="Avg TDS" value={selected.avg_tds != null ? `${selected.avg_tds}` : '—'} />
          </div>
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top brands + models here</p>
            {(selected.brands.length ? selected.brands : [{ name: selected.top_brand, jobs: selected.top_brand_jobs, revenue: selected.revenue }]).map(
              (brand) => {
                const share = selected.jobs > 0 ? Math.round((brand.jobs / selected.jobs) * 100) : 0;
                return (
                  <div key={brand.name} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{brand.name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-2 rounded-full"
                        style={{ width: `${Math.max(8, share)}%`, backgroundColor: brandColor(brand.name) }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                      {share}% · {formatSpreadInr(brand.revenue)}
                    </span>
                  </div>
                );
              }
            )}
          </div>
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

function StatChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
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
