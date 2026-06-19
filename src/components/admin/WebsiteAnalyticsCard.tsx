import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { subDays, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart3,
  RefreshCw,
  Users,
  Eye,
  Phone,
  MousePointerClick,
  CheckCircle2,
  TrendingUp,
  Globe,
  CalendarRange,
} from 'lucide-react';
import { db } from '@/lib/supabase';
import { getPublicSiteLabel, type PublicSiteKey } from '@/lib/websiteSiteKey';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import type { TrendPoint } from './websiteAnalyticsTypes';

const WebsiteAnalyticsTrendChart = lazy(() => import('./WebsiteAnalyticsTrendChart'));

const IST = 'Asia/Kolkata';
const MAX_FETCH_DAYS = 90;

type SiteDayStats = {
  site_key: PublicSiteKey;
  visitors: number;
  page_views: number;
  phone_clicks: number;
  whatsapp_clicks: number;
  booking_clicks: number;
  booking_submits: number;
};

type DailyRow = SiteDayStats & { day: string };

type Summary = {
  today: SiteDayStats[];
  daily: DailyRow[];
  days: number;
};

type SiteFilter = 'all' | PublicSiteKey;
type PresetDays = 7 | 14 | 30 | 90;
type PeriodMode = 'today' | PresetDays | 'custom';
type ChartMetric = 'visitors' | 'phone_clicks' | 'booking_submits';

type RecentEvent = {
  id: string;
  site_key: PublicSiteKey;
  event_type: string;
  page_path: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

const EVENT_LABELS: Record<string, string> = {
  page_view: 'Page view',
  phone_click: 'Call',
  whatsapp_click: 'WhatsApp',
  booking_click: 'Book click',
  booking_submit: 'Booking',
};

const EMPTY_STATS: SiteDayStats = {
  site_key: 'hydrogenro',
  visitors: 0,
  page_views: 0,
  phone_clicks: 0,
  whatsapp_clicks: 0,
  booking_clicks: 0,
  booking_submits: 0,
};

const SITE_OPTIONS: { value: SiteFilter; label: string; short: string }[] = [
  { value: 'all', label: 'All sites', short: 'All' },
  { value: 'hydrogenro', label: 'Hydrogen RO', short: 'Hydrogen' },
  { value: 'elevenro', label: 'Eleven RO', short: 'Eleven' },
];

const PRESET_OPTIONS: { value: PresetDays; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

function getTodayIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function istDateFromPreset(days: PresetDays): { from: string; to: string } {
  const to = getTodayIst();
  const from = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(subDays(parseISO(`${to}T12:00:00`), days - 1));
  return { from, to };
}

function formatRangeLabel(from: string, to: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  if (from === to) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}

function sumStats(rows: SiteDayStats[]): SiteDayStats {
  return rows.reduce(
    (acc, row) => ({
      site_key: row.site_key,
      visitors: acc.visitors + Number(row.visitors || 0),
      page_views: acc.page_views + Number(row.page_views || 0),
      phone_clicks: acc.phone_clicks + Number(row.phone_clicks || 0),
      whatsapp_clicks: acc.whatsapp_clicks + Number(row.whatsapp_clicks || 0),
      booking_clicks: acc.booking_clicks + Number(row.booking_clicks || 0),
      booking_submits: acc.booking_submits + Number(row.booking_submits || 0),
    }),
    { ...EMPTY_STATS }
  );
}

function formatIstDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatIstDayFull(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function pct(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

function inDateRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

function formatEventTimeIst(ev: RecentEvent): string {
  const raw =
    typeof ev.metadata?.client_at === 'string' && ev.metadata.client_at
      ? ev.metadata.client_at
      : ev.created_at;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType;
}

function formatPagePath(path: string | null | undefined): string {
  const p = (path || '/').trim();
  if (p === '/' || p === '') return 'Home';
  return p;
}

const REFERRER_LABELS: Record<string, string> = {
  direct: 'Direct',
  google: 'Google',
  search: 'Search',
  social: 'Social',
  internal: 'Internal',
  other: 'Other',
};

const OS_LABELS: Record<string, string> = {
  ios: 'iOS',
  android: 'Android',
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  chromeos: 'Chrome OS',
  other: 'Other',
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEventLocation(metadata?: Record<string, unknown> | null): string {
  const city = metadata?.geo_city;
  const country = metadata?.geo_country;
  const tz = metadata?.geo_tz;
  let base = '—';
  if (city && country) base = `${String(city)}, ${String(country)}`;
  else if (country) base = String(country);
  else if (city) base = String(city);
  if (base === '—') return '—';
  if (tz) {
    const tzLabel = String(tz) === 'Asia/Kolkata' ? 'IST' : String(tz).split('/').pop()?.replace(/_/g, ' ') || String(tz);
    return `${base} (${tzLabel})`;
  }
  return base;
}

function formatEventDevice(metadata?: Record<string, unknown> | null): string {
  const device = metadata?.device;
  const os = metadata?.os;
  const browser = metadata?.browser;
  if (!device && !os && !browser) return '—';
  const parts: string[] = [];
  if (device) parts.push(titleCase(String(device)));
  if (os) parts.push(OS_LABELS[String(os)] ?? titleCase(String(os)));
  if (browser) parts.push(titleCase(String(browser)));
  return parts.join(' · ');
}

function formatEventReferrer(metadata?: Record<string, unknown> | null): string {
  const ref = metadata?.referrer;
  if (!ref) return '—';
  const label = REFERRER_LABELS[String(ref)] ?? titleCase(String(ref));
  const host = metadata?.referrer_host;
  if (host && ref === 'other') return `${label} (${String(host)})`;
  return label;
}

function RecentActivityMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2 text-[10px] leading-snug min-w-0">
      <span className="text-muted-foreground shrink-0 w-14">{label}</span>
      <span className="text-foreground break-words min-w-0">{value}</span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  compact,
  iconTone = 'default',
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  hint?: string;
  compact?: boolean;
  iconTone?: 'default' | 'whatsapp';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card shadow-sm',
        compact ? 'px-2.5 py-2.5' : 'px-3 py-3'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
            {label}
          </p>
          <p
            className={cn(
              'mt-0.5 sm:mt-1 font-semibold tabular-nums leading-none',
              compact ? 'text-xl' : 'text-2xl'
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="mt-1 text-[10px] sm:text-[11px] text-muted-foreground line-clamp-2">{hint}</p>
          ) : null}
        </div>
        <div
          className={cn(
            'rounded-lg p-1.5 sm:p-2 shrink-0',
            iconTone === 'whatsapp' ? 'bg-green-500/10 text-green-600' : 'bg-primary/10 text-primary'
          )}
        >
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
      </div>
    </div>
  );
}

function DailyMobileCard({ row, showSite }: { row: DailyRow; showSite: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{formatIstDayFull(row.day)}</p>
          <p className="text-xs text-muted-foreground">{formatIstDay(row.day)}</p>
        </div>
        {showSite ? (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {getPublicSiteLabel(row.site_key)}
          </Badge>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/40 px-1 py-1.5">
          <p className="text-[10px] text-muted-foreground">Visitors</p>
          <p className="text-sm font-semibold tabular-nums">{row.visitors}</p>
        </div>
        <div className="rounded-lg bg-muted/40 px-1 py-1.5">
          <p className="text-[10px] text-muted-foreground">Calls</p>
          <p className="text-sm font-semibold tabular-nums">{row.phone_clicks}</p>
        </div>
        <div className="rounded-lg bg-muted/40 px-1 py-1.5">
          <p className="text-[10px] text-muted-foreground">Bookings</p>
          <p className="text-sm font-semibold tabular-nums">{row.booking_submits}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
        <span>{row.page_views} views</span>
        <span>·</span>
        <span>{row.whatsapp_clicks} WhatsApp</span>
        <span>·</span>
        <span>{row.booking_clicks} book clicks</span>
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-24 rounded-xl bg-muted/40" />
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/40" />
        ))}
      </div>
      <div className="h-52 rounded-xl bg-muted/40" />
    </div>
  );
}

export function WebsiteAnalyticsCard() {
  const todayIst = getTodayIst();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [siteFilter, setSiteFilter] = useState<SiteFilter>('all');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('today');
  const [customFrom, setCustomFrom] = useState(todayIst);
  const [customTo, setCustomTo] = useState(todayIst);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('visitors');

  const activeRange = useMemo(() => {
    if (periodMode === 'today') {
      return { from: todayIst, to: todayIst };
    }
    if (periodMode === 'custom') {
      let from = customFrom;
      let to = customTo;
      if (from && to && from > to) [from, to] = [to, from];
      return { from: from || todayIst, to: to || todayIst };
    }
    return istDateFromPreset(periodMode);
  }, [periodMode, customFrom, customTo, todayIst]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const siteKey = siteFilter === 'all' ? undefined : siteFilter;
      const [summaryRes, recentRes] = await Promise.all([
        db.websiteAnalytics.getSummary(MAX_FETCH_DAYS),
        db.websiteAnalytics.getRecentEvents({
          from: activeRange.from,
          to: activeRange.to,
          siteKey,
          limit: 100,
        }),
      ]);
      if (summaryRes.error) throw summaryRes.error;
      setSummary((summaryRes.data as Summary) || null);
      if (recentRes.error) {
        console.warn(recentRes.error);
        setRecentEvents([]);
      } else {
        setRecentEvents((recentRes.data as RecentEvent[]) || []);
      }
    } catch (e) {
      console.error(e);
      toast.error('Could not load website analytics. Run scripts/add-website-analytics.sql in Supabase.');
      setSummary(null);
      setRecentEvents([]);
    } finally {
      setLoading(false);
    }
  }, [activeRange.from, activeRange.to, siteFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDaily = useMemo(() => {
    const rows = summary?.daily ?? [];
    return rows.filter((row) => {
      if (siteFilter !== 'all' && row.site_key !== siteFilter) return false;
      return inDateRange(row.day, activeRange.from, activeRange.to);
    });
  }, [summary, siteFilter, activeRange]);

  const periodTotals = useMemo(() => sumStats(filteredDaily), [filteredDaily]);

  const todayStats = useMemo(() => {
    if (!inDateRange(todayIst, activeRange.from, activeRange.to)) {
      return { ...EMPTY_STATS, site_key: siteFilter === 'all' ? 'hydrogenro' : siteFilter };
    }
    const rows = summary?.today ?? [];
    if (siteFilter === 'all') return sumStats(rows);
    return rows.find((r) => r.site_key === siteFilter) ?? { ...EMPTY_STATS, site_key: siteFilter };
  }, [summary, siteFilter, todayIst, activeRange]);

  const chartData = useMemo((): TrendPoint[] => {
    const byDay = new Map<string, TrendPoint>();
    for (const row of filteredDaily) {
      const existing = byDay.get(row.day) ?? {
        day: row.day,
        label: formatIstDay(row.day),
        visitors: 0,
        phone_clicks: 0,
        booking_clicks: 0,
        booking_submits: 0,
      };
      byDay.set(row.day, {
        ...existing,
        visitors: existing.visitors + Number(row.visitors || 0),
        phone_clicks: existing.phone_clicks + Number(row.phone_clicks || 0),
        booking_clicks: existing.booking_clicks + Number(row.booking_clicks || 0),
        booking_submits: existing.booking_submits + Number(row.booking_submits || 0),
      });
    }
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [filteredDaily]);

  const tableRows = useMemo(
    () =>
      [...filteredDaily].sort((a, b) => {
        const dayCmp = b.day.localeCompare(a.day);
        if (dayCmp !== 0) return dayCmp;
        return a.site_key.localeCompare(b.site_key);
      }),
    [filteredDaily]
  );

  const siteLabel = siteFilter === 'all' ? 'All sites' : getPublicSiteLabel(siteFilter);
  const rangeLabel = formatRangeLabel(activeRange.from, activeRange.to);
  const showTodayInRange = inDateRange(todayIst, activeRange.from, activeRange.to);
  const hasData = filteredDaily.length > 0 || (showTodayInRange && (summary?.today?.length ?? 0) > 0);

  const handleToday = () => {
    setPeriodMode('today');
    setCustomFrom(todayIst);
    setCustomTo(todayIst);
  };

  const handlePresetChange = (days: PresetDays) => {
    setPeriodMode(days);
    const range = istDateFromPreset(days);
    setCustomFrom(range.from);
    setCustomTo(range.to);
  };

  const handleCustomFrom = (value: string | undefined) => {
    if (!value) return;
    setPeriodMode('custom');
    setCustomFrom(value);
    if (customTo && value > customTo) setCustomTo(value);
  };

  const handleCustomTo = (value: string | undefined) => {
    if (!value) return;
    setPeriodMode('custom');
    setCustomTo(value);
    if (customFrom && value < customFrom) setCustomFrom(value);
  };

  const chartMetricLabel =
    chartMetric === 'visitors' ? 'Visitors' : chartMetric === 'phone_clicks' ? 'Calls' : 'Bookings';

  return (
    <Card id="section-website-analytics" className="overflow-hidden">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <BarChart3 className="w-5 h-5 shrink-0" />
              Website analytics
            </CardTitle>
            <CardDescription className="text-sm mt-1 max-w-2xl">
              Visitors, calls, and bookings on hydrogenro.com and elevenro.com (IST). Call counts are
              button taps, not confirmed conversations. Filters below apply only to this section.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 w-full sm:w-auto"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-muted/15 p-3 sm:p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-6 sm:gap-y-3">
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                Website
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {SITE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={siteFilter === opt.value ? 'default' : 'outline'}
                    className="h-8 text-xs px-2"
                    onClick={() => setSiteFilter(opt.value)}
                  >
                    <span className="sm:hidden">{opt.short}</span>
                    <span className="hidden sm:inline">{opt.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 flex-[2] min-w-0">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                <CalendarRange className="h-3 w-3" />
                Date range
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={periodMode === 'today' ? 'default' : 'outline'}
                  className="h-8 px-2.5 text-xs"
                  onClick={handleToday}
                >
                  Today
                </Button>
                {PRESET_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={periodMode === opt.value ? 'default' : 'outline'}
                    className="h-8 px-2.5 text-xs"
                    onClick={() => handlePresetChange(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant={periodMode === 'custom' ? 'default' : 'outline'}
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setPeriodMode('custom')}
                >
                  Custom
                </Button>
              </div>
            </div>
          </div>

          {periodMode === 'custom' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">From</label>
                <DatePicker
                  value={customFrom}
                  onChange={handleCustomFrom}
                  placeholder="Start date"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">To</label>
                <DatePicker
                  value={customTo}
                  onChange={handleCustomTo}
                  placeholder="End date"
                  className="h-9"
                />
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-0 space-y-6">
        {loading && !summary ? (
          <AnalyticsSkeleton />
        ) : !hasData ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No data for this filter</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Try a wider date range or another site. Events appear after visitors use the public
              websites.
            </p>
          </div>
        ) : (
          <>
            {showTodayInRange ? (
              <div className="rounded-xl border border-border bg-gradient-to-br from-muted/30 to-muted/10 p-3 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Today</Badge>
                  <span className="text-sm font-medium text-foreground">{siteLabel}</span>
                  <span className="text-xs text-muted-foreground">· IST</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                  <KpiCard label="Visitors" value={todayStats.visitors} icon={Users} compact />
                  <KpiCard label="Page views" value={todayStats.page_views} icon={Eye} compact />
                  <KpiCard label="Calls" value={todayStats.phone_clicks} icon={Phone} compact />
                  <KpiCard
                    label="WhatsApp"
                    value={todayStats.whatsapp_clicks}
                    icon={WhatsAppIcon}
                    iconTone="whatsapp"
                    compact
                  />
                  <KpiCard
                    label="Book clicks"
                    value={todayStats.booking_clicks}
                    icon={MousePointerClick}
                    compact
                  />
                  <KpiCard
                    label="Bookings"
                    value={todayStats.booking_submits}
                    icon={CheckCircle2}
                    compact
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  <h4 className="text-sm font-medium truncate">
                    {rangeLabel}
                  </h4>
                </div>
                <div className="sm:hidden">
                  <Select
                    value={chartMetric}
                    onValueChange={(v) => setChartMetric(v as ChartMetric)}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Metric" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visitors">Visitors</SelectItem>
                      <SelectItem value="phone_clicks">Calls</SelectItem>
                      <SelectItem value="booking_submits">Bookings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ToggleGroup
                  type="single"
                  value={chartMetric}
                  onValueChange={(v) => v && setChartMetric(v as ChartMetric)}
                  className="hidden sm:flex justify-start"
                >
                  <ToggleGroupItem value="visitors" className="h-8 px-3 text-xs">
                    Visitors
                  </ToggleGroupItem>
                  <ToggleGroupItem value="phone_clicks" className="h-8 px-3 text-xs">
                    Calls
                  </ToggleGroupItem>
                  <ToggleGroupItem value="booking_submits" className="h-8 px-3 text-xs">
                    Bookings
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="rounded-xl border border-border bg-card p-2 sm:p-3 overflow-x-auto">
                <Suspense
                  fallback={
                    <div className="h-48 sm:h-52 rounded-lg border border-dashed border-border animate-pulse bg-muted/30" />
                  }
                >
                  <WebsiteAnalyticsTrendChart data={chartData} metric={chartMetric} />
                </Suspense>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground px-1">
                <span>
                  <span className="font-medium text-foreground">{periodTotals[chartMetric]}</span>{' '}
                  {chartMetricLabel.toLowerCase()}
                </span>
                <span className="hidden sm:inline text-border">|</span>
                <span>
                  {periodTotals.phone_clicks} calls ({pct(periodTotals.phone_clicks, periodTotals.visitors)})
                </span>
                <span className="hidden sm:inline text-border">|</span>
                <span>
                  {periodTotals.booking_submits} bookings ({pct(periodTotals.booking_submits, periodTotals.visitors)})
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium px-0.5">By day</h4>

              <div className="space-y-2 md:hidden">
                {tableRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No rows for this filter.</p>
                ) : (
                  tableRows.map((row) => (
                    <DailyMobileCard
                      key={`${row.day}-${row.site_key}`}
                      row={row}
                      showSite={siteFilter === 'all'}
                    />
                  ))
                )}
              </div>

              <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="whitespace-nowrap">Date</TableHead>
                        {siteFilter === 'all' ? <TableHead>Site</TableHead> : null}
                        <TableHead className="text-right">Visitors</TableHead>
                        <TableHead className="text-right">Views</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead className="text-right">WhatsApp</TableHead>
                        <TableHead className="text-right">Book clicks</TableHead>
                        <TableHead className="text-right">Bookings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableRows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={siteFilter === 'all' ? 8 : 7}
                            className="text-center text-muted-foreground py-8"
                          >
                            No rows for this filter.
                          </TableCell>
                        </TableRow>
                      ) : (
                        tableRows.map((row) => (
                          <TableRow key={`${row.day}-${row.site_key}`}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {formatIstDayFull(row.day)}
                            </TableCell>
                            {siteFilter === 'all' ? (
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">
                                  {getPublicSiteLabel(row.site_key)}
                                </Badge>
                              </TableCell>
                            ) : null}
                            <TableCell className="text-right tabular-nums">{row.visitors}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.page_views}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.phone_clicks}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.whatsapp_clicks}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.booking_clicks}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {row.booking_submits}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium px-0.5">Recent activity</h4>
              <p className="text-xs text-muted-foreground px-0.5 leading-relaxed">
                Times in IST (newer events use browser time). Location is approximate from the visitor&apos;s IP
                (not GPS)—VPN, iCloud Private Relay, or ISP routing can show another country.
              </p>

              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6 rounded-lg border border-dashed border-border">
                  No events in this range.
                </p>
              ) : (
                <>
                  <div className="space-y-2 md:hidden">
                    {recentEvents.map((ev) => {
                      const location = formatEventLocation(ev.metadata);
                      const device = formatEventDevice(ev.metadata);
                      const referrer = formatEventReferrer(ev.metadata);
                      return (
                        <div
                          key={ev.id}
                          className="rounded-xl border border-border bg-card p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {eventLabel(ev.event_type)}
                            </Badge>
                            {siteFilter === 'all' ? (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {getPublicSiteLabel(ev.site_key)}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-[11px] font-medium tabular-nums">{formatEventTimeIst(ev)}</p>
                          <p className="text-xs text-muted-foreground break-words">
                            {formatPagePath(ev.page_path)}
                          </p>
                          {(location !== '—' || device !== '—' || referrer !== '—') && (
                            <div className="space-y-1 pt-2 border-t border-border/60">
                              {location !== '—' ? <RecentActivityMeta label="Location" value={location} /> : null}
                              {device !== '—' ? <RecentActivityMeta label="Device" value={device} /> : null}
                              {referrer !== '—' ? <RecentActivityMeta label="Referrer" value={referrer} /> : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="whitespace-nowrap">Time (IST)</TableHead>
                            <TableHead>Event</TableHead>
                            {siteFilter === 'all' ? <TableHead>Site</TableHead> : null}
                            <TableHead>Page</TableHead>
                            <TableHead className="hidden md:table-cell">Location</TableHead>
                            <TableHead className="hidden lg:table-cell">Device</TableHead>
                            <TableHead className="hidden lg:table-cell">Referrer</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentEvents.map((ev) => (
                            <TableRow key={ev.id}>
                              <TableCell className="whitespace-nowrap text-xs tabular-nums font-medium">
                                {formatEventTimeIst(ev)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px] font-normal">
                                  {eventLabel(ev.event_type)}
                                </Badge>
                              </TableCell>
                              {siteFilter === 'all' ? (
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">
                                    {getPublicSiteLabel(ev.site_key)}
                                  </Badge>
                                </TableCell>
                              ) : null}
                              <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                                <div className="truncate">{formatPagePath(ev.page_path)}</div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground/80 lg:hidden">
                                  {formatEventLocation(ev.metadata)}
                                  {formatEventDevice(ev.metadata) !== '—'
                                    ? ` · ${formatEventDevice(ev.metadata)}`
                                    : ''}
                                  {formatEventReferrer(ev.metadata) !== '—'
                                    ? ` · ${formatEventReferrer(ev.metadata)}`
                                    : ''}
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                                {formatEventLocation(ev.metadata)}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                                {formatEventDevice(ev.metadata)}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                                {formatEventReferrer(ev.metadata)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
