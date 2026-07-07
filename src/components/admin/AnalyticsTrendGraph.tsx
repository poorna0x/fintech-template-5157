import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  GitCompare,
  LineChart,
  Loader2,
  Minus,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { db } from '@/lib/supabase';
import {
  alignTrendSeriesByIndex,
  buildTrendLeadSourceInsights,
  compareTrendMonths,
  computeWeekdayPatternFromRows,
  formatAnalyticsPeriodLabel,
  getShiftedTrendRange,
  mapAnalyticsPeriodToTrend,
  mapMonthlyTrendsFromRpc,
  mapTrendDashboardFromRpc,
  mapTrendRangeCompareFromRpc,
  normalizeLeadSourceKey,
  parseAnalyticsMonthlyTrendsRpc,
  parseAnalyticsTrendDashboardRpc,
  pickTrendGranularity,
  rangesMatchDay,
  resolveTrendTimelineRange,
  rollupDailyStatsToMonthlyTrends,
  getProratedRevenueTargetLine,
  MIN_MONTHLY_TARGET_LAKHS,
  LAKHS_TO_INR,
  inrToLakhs,
  formatLakhs,
  type AnalyticsPeriodSyncInput,
  type AnalyticsTrendInsights,
  type AnalyticsTrendPeriodRow,
  type AnalyticsTrendSummary,
  type TrendTimelinePreset,
  type WeekdayPatternRow,
} from '@/lib/analyticsDashboard';
import { TrendPeriodDrilldownDialog } from '@/components/admin/TrendPeriodDrilldownDialog';
import { isJobCompletedInRange } from '@/lib/jobAnalytics';
import { toast } from 'sonner';

type TrendMetric = 'combined' | 'revenue' | 'jobs' | 'avgBill';
type TrendGranularity = 'month' | 'week' | 'day';
type TimelineOverlay = 'none' | 'previous_period' | 'previous_year';

export type AnalyticsTrendFilterOptions = {
  leadSources: Array<{ key: string; label: string }>;
  technicians: Array<{ id: string; name: string }>;
  serviceSubTypes: Array<{ label: string }>;
  paymentMethods: Array<{ label: string }>;
  equipmentBrands: Array<{ label: string }>;
};

type AnalyticsTrendGraphProps = {
  filterOptions: AnalyticsTrendFilterOptions;
  dailyStatsFallback?: Array<{ date: string; jobs: number; revenue: number }>;
  initialRange?: { startDate: Date | null; endDate: Date | null };
  analyticsPeriod?: AnalyticsPeriodSyncInput;
};

const ALL = '__all__';
const TREND_CACHE_TTL_MS = 5 * 60 * 1000;
const TREND_PREFS_KEY = 'hydrogenro-analytics-trend-prefs';
const TREND_REVENUE_TARGET_KEY = 'hydrogenro-analytics-revenue-target';

function loadSavedTargetLakhs(): string {
  const fallback = String(MIN_MONTHLY_TARGET_LAKHS);
  try {
    const raw = localStorage.getItem(TREND_REVENUE_TARGET_KEY);
    if (!raw) return fallback;
    const inr = Number(raw);
    if (!Number.isFinite(inr) || inr < MIN_MONTHLY_TARGET_LAKHS * LAKHS_TO_INR) return fallback;
    return formatLakhs(inrToLakhs(inr));
  } catch {
    return fallback;
  }
}

function parseTargetLakhsInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lakhs = Number(trimmed);
  if (!Number.isFinite(lakhs)) return null;
  return lakhs;
}

type SavedTrendPrefs = {
  timelinePreset: TrendTimelinePreset;
  customMonth: string;
  customStart: string;
  customEnd: string;
  filters: TrendFilters;
};

type TrendDashboardPayload = {
  primary: AnalyticsTrendSummary | null;
  compare: AnalyticsTrendSummary | null;
  monthCatalog: AnalyticsTrendPeriodRow[];
  insights: AnalyticsTrendInsights | null;
  rpcEquipmentBrands: string[];
  rpcLeadSources: Array<{ key: string; label: string }>;
  usingFallback: boolean;
};

const trendDashboardCache = new Map<string, { at: number; payload: TrendDashboardPayload }>();

function clearTrendDashboardCache() {
  trendDashboardCache.clear();
}

function loadTrendPrefs(): SavedTrendPrefs | null {
  try {
    const raw = localStorage.getItem(TREND_PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedTrendPrefs;
  } catch {
    return null;
  }
}

function saveTrendPrefs(prefs: SavedTrendPrefs) {
  try {
    localStorage.setItem(TREND_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

function formatLoadedAgo(at: number | null): string {
  if (!at) return '';
  const secs = Math.floor((Date.now() - at) / 1000);
  if (secs < 45) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const chartConfig = {
  revenue: { label: 'Revenue', color: 'hsl(199 89% 48%)' },
  jobs: { label: 'Jobs', color: 'hsl(25 95% 53%)' },
  avgBill: { label: 'Avg bill', color: 'hsl(262 83% 58%)' },
  compareRevenue: { label: 'Compare revenue', color: 'hsl(215 16% 65%)' },
  compareJobs: { label: 'Compare jobs', color: 'hsl(25 55% 68%)' },
  marginPct: { label: 'Margin %', color: 'hsl(262 83% 58%)' },
  revenueTarget: { label: 'Revenue target', color: 'hsl(142 71% 40%)' },
} satisfies ChartConfig;

type TrendFilters = {
  granularity: TrendGranularity | 'auto';
  metric: TrendMetric;
  showMarginTrend: boolean;
  serviceType: string;
  serviceSubType: string;
  equipmentBrand: string;
  serviceBrand: string;
  leadSourceKey: string;
  technicianId: string;
  paymentMethod: string;
};

const defaultFilters: TrendFilters = {
  granularity: 'auto',
  metric: 'combined',
  showMarginTrend: true,
  serviceType: ALL,
  serviceSubType: ALL,
  equipmentBrand: ALL,
  serviceBrand: ALL,
  leadSourceKey: ALL,
  technicianId: ALL,
  paymentMethod: ALL,
};

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatCompactCurrency(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${formatCurrency(amount)}`;
}

function formatPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hasActiveFilters(filters: TrendFilters): boolean {
  return (
    filters.serviceType !== ALL ||
    filters.serviceSubType !== ALL ||
    filters.equipmentBrand !== ALL ||
    filters.serviceBrand !== ALL ||
    filters.leadSourceKey !== ALL ||
    filters.technicianId !== ALL ||
    filters.paymentMethod !== ALL
  );
}

function buildRpcFilterArgs(filters: TrendFilters) {
  return {
    serviceType: filters.serviceType === ALL ? null : filters.serviceType,
    serviceSubType: filters.serviceSubType === ALL ? null : filters.serviceSubType,
    equipmentBrand: filters.equipmentBrand === ALL ? null : filters.equipmentBrand,
    serviceBrand: filters.serviceBrand === ALL ? null : filters.serviceBrand,
    leadSourceKey: filters.leadSourceKey === ALL ? null : filters.leadSourceKey,
    technicianId: filters.technicianId === ALL ? null : filters.technicianId,
    paymentMethod: filters.paymentMethod === ALL ? null : filters.paymentMethod,
  };
}

async function fetchTrendSummary(
  startDate: Date,
  endDate: Date,
  filters: TrendFilters,
  dailyStatsFallback?: Array<{ date: string; jobs: number; revenue: number }>
): Promise<{ summary: AnalyticsTrendSummary | null; usingFallback: boolean }> {
  const granularity =
    filters.granularity === 'auto'
      ? pickTrendGranularity(startDate, endDate)
      : filters.granularity;

  const { data, error } = await db.analyticsPaginated.getMonthlyTrends({
    startDate,
    endDate,
    granularity,
    ...buildRpcFilterArgs(filters),
  });

  if (!error && data) {
    const parsed = parseAnalyticsMonthlyTrendsRpc(data);
    if (parsed) return { summary: mapMonthlyTrendsFromRpc(parsed), usingFallback: false };
  }

  if (hasActiveFilters(filters)) {
    return { summary: null, usingFallback: false };
  }

  if (dailyStatsFallback?.length && granularity === 'month') {
    const filtered = dailyStatsFallback.filter((d) => {
      const t = new Date(d.date + 'T12:00:00').getTime();
      return t >= startDate.getTime() && t <= endDate.getTime();
    });
    if (filtered.length) {
      return { summary: rollupDailyStatsToMonthlyTrends(filtered), usingFallback: true };
    }
  }

  return { summary: null, usingFallback: false };
}

function buildTrendCacheKey(
  startDate: Date,
  endDate: Date,
  filters: TrendFilters,
  overlay: TimelineOverlay
): string {
  return JSON.stringify({
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    overlay,
    filters,
  });
}

async function fetchTrendDashboard(
  startDate: Date,
  endDate: Date,
  filters: TrendFilters,
  overlay: TimelineOverlay,
  dailyStatsFallback?: Array<{ date: string; jobs: number; revenue: number }>,
  opts?: { skipCache?: boolean }
): Promise<TrendDashboardPayload> {
  const cacheKey = buildTrendCacheKey(startDate, endDate, filters, overlay);
  if (!opts?.skipCache) {
    const cached = trendDashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.at < TREND_CACHE_TTL_MS) {
      return cached.payload;
    }
  }

  const granularity =
    filters.granularity === 'auto'
      ? pickTrendGranularity(startDate, endDate)
      : filters.granularity;
  const compareMode = overlay === 'none' ? null : overlay;

  const { data, error } = await db.analyticsPaginated.getTrendDashboard({
    startDate,
    endDate,
    granularity,
    compareMode,
    ...buildRpcFilterArgs(filters),
  });

  if (!error && data) {
    const parsed = parseAnalyticsTrendDashboardRpc(data);
    if (parsed) {
      const mapped = mapTrendDashboardFromRpc(parsed);
      const payload: TrendDashboardPayload = {
        primary: mapped.primary,
        compare: mapped.compare,
        monthCatalog: mapped.monthCatalog,
        insights: mapped.insights,
        rpcEquipmentBrands: mapped.filterOptions.equipmentBrands,
        rpcLeadSources: mapped.filterOptions.leadSources,
        usingFallback: false,
      };
      trendDashboardCache.set(cacheKey, { at: Date.now(), payload });
      return payload;
    }
  }

  const primary = await fetchTrendSummary(startDate, endDate, filters, dailyStatsFallback);
  let compare: AnalyticsTrendSummary | null = null;
  if (overlay !== 'none' && primary.summary) {
    const shifted = getShiftedTrendRange(
      startDate,
      endDate,
      overlay === 'previous_year' ? 'previous_year' : 'previous_period'
    );
    const secondary = await fetchTrendSummary(
      shifted.startDate,
      shifted.endDate,
      filters,
      dailyStatsFallback
    );
    compare = secondary.summary;
  }

  const wideStart = new Date();
  wideStart.setMonth(wideStart.getMonth() - 36);
  wideStart.setHours(0, 0, 0, 0);
  const wide = await fetchTrendSummary(wideStart, endDate, filters, dailyStatsFallback);

  const payload: TrendDashboardPayload = {
    primary: primary.summary,
    compare,
    monthCatalog: wide.summary?.rows ?? [],
    insights: null,
    rpcEquipmentBrands: [],
    rpcLeadSources: [],
    usingFallback: primary.usingFallback,
  };
  return payload;
}

function ChangeBadge({ value, size = 'sm' }: { value: number | null; size?: 'sm' | 'md' }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
        <Minus className="w-3 h-3" /> —
      </span>
    );
  }
  const up = value > 0;
  const down = value < 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-semibold',
        size === 'md' ? 'text-sm' : 'text-xs',
        up && 'text-emerald-600',
        down && 'text-red-600',
        !up && !down && 'text-muted-foreground'
      )}
    >
      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : down ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
      {formatPct(value)}
    </span>
  );
}

function tooltipDotColor(dataKey: string, entryColor?: string): string {
  const fromConfig = chartConfig[dataKey as keyof typeof chartConfig]?.color;
  if (fromConfig) return fromConfig;
  if (entryColor && !entryColor.startsWith('var(')) return entryColor;
  return 'hsl(var(--muted-foreground))';
}

function RichTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string; name?: string; payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Record<string, unknown> | undefined;
  const seen = new Set<string>();
  const items = payload.filter((entry) => {
    const key = String(entry.dataKey ?? entry.name ?? '');
    if (!key || seen.has(key)) return false;
    if (key === 'compareRevenue' || key === 'compareJobs') return false;
    seen.add(key);
    return true;
  });
  return (
    <div className="rounded-xl border bg-background/95 backdrop-blur px-3 py-2.5 shadow-lg text-xs min-w-[180px]">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      <div className="space-y-1.5">
        {items.map((entry) => {
          const key = String(entry.dataKey ?? '');
          const val = Number(entry.value) || 0;
          const isMoney = key.includes('revenue') || key.includes('Bill');
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: tooltipDotColor(key, entry.color) }}
                />
                {chartConfig[key as keyof typeof chartConfig]?.label ?? entry.name}
              </span>
              <span className="font-medium tabular-nums">
                {isMoney ? `₹ ${formatCurrency(val)}` : val}
              </span>
            </div>
          );
        })}
        {row?.revenueChangePct != null ? (
          <div className="pt-1 border-t flex justify-between text-muted-foreground">
            <span>vs previous</span>
            <ChangeBadge value={row.revenueChangePct as number | null} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AnalyticsTrendGraph({
  filterOptions,
  dailyStatsFallback,
  initialRange,
  analyticsPeriod,
}: AnalyticsTrendGraphProps) {
  const isMobile = useIsMobile();
  const [prefsReady, setPrefsReady] = useState(false);
  const [filters, setFilters] = useState<TrendFilters>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [timelinePreset, setTimelinePreset] = useState<TrendTimelinePreset>('this_month');
  const [customMonth, setCustomMonth] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [summary, setSummary] = useState<AnalyticsTrendSummary | null>(null);
  const [insights, setInsights] = useState<AnalyticsTrendInsights | null>(null);
  const [leadSourceInsights, setLeadSourceInsights] = useState<
    Array<{ label: string; revenue: number; jobs: number; avgBill: number }>
  >([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [rpcEquipmentBrands, setRpcEquipmentBrands] = useState<string[]>([]);
  const [rpcLeadSources, setRpcLeadSources] = useState<Array<{ key: string; label: string }>>([]);

  const [monthA, setMonthA] = useState('');
  const [monthB, setMonthB] = useState('');
  const [rangeAStart, setRangeAStart] = useState('');
  const [rangeAEnd, setRangeAEnd] = useState('');
  const [rangeBStart, setRangeBStart] = useState('');
  const [rangeBEnd, setRangeBEnd] = useState('');
  const [rangeCompareA, setRangeCompareA] = useState<AnalyticsTrendSummary | null>(null);
  const [rangeCompareB, setRangeCompareB] = useState<AnalyticsTrendSummary | null>(null);
  const [rangeCompareLoading, setRangeCompareLoading] = useState(false);

  const [monthCatalog, setMonthCatalog] = useState<AnalyticsTrendPeriodRow[]>([]);
  const [drilldownPeriodKey, setDrilldownPeriodKey] = useState<string | null>(null);
  const [drilldownPeriodLabel, setDrilldownPeriodLabel] = useState<string | null>(null);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [monthlyTargetLakhs, setMonthlyTargetLakhs] = useState(loadSavedTargetLakhs);

  const monthlyRevenueTarget = useMemo(() => {
    const lakhs = parseTargetLakhsInput(monthlyTargetLakhs);
    if (lakhs == null || lakhs < MIN_MONTHLY_TARGET_LAKHS) return 0;
    return lakhs * LAKHS_TO_INR;
  }, [monthlyTargetLakhs]);

  const activeRange = useMemo(() => {
    if (timelinePreset === 'custom_month') {
      return resolveTrendTimelineRange('custom_month', undefined, undefined, customMonth || undefined);
    }
    if (timelinePreset === 'custom' && customStart && customEnd) {
      return resolveTrendTimelineRange('custom', customStart, customEnd);
    }
    return resolveTrendTimelineRange(timelinePreset);
  }, [timelinePreset, customMonth, customStart, customEnd]);

  useEffect(() => {
    const saved = loadTrendPrefs();
    if (saved) {
      setTimelinePreset(saved.timelinePreset);
      setCustomMonth(saved.customMonth || '');
      setCustomStart(saved.customStart || '');
      setCustomEnd(saved.customEnd || '');
      setFilters({ ...defaultFilters, ...saved.filters, showMarginTrend: saved.filters.showMarginTrend ?? true });
    } else if (analyticsPeriod) {
      const mapped = mapAnalyticsPeriodToTrend(analyticsPeriod);
      setTimelinePreset(mapped.preset);
      if (mapped.customMonth) setCustomMonth(mapped.customMonth);
      if (mapped.customStart) setCustomStart(mapped.customStart);
      if (mapped.customEnd) setCustomEnd(mapped.customEnd);
    }
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    try {
      if (monthlyRevenueTarget > 0) {
        localStorage.setItem(TREND_REVENUE_TARGET_KEY, String(monthlyRevenueTarget));
      } else {
        localStorage.removeItem(TREND_REVENUE_TARGET_KEY);
      }
    } catch {
      // ignore
    }
  }, [monthlyRevenueTarget]);

  const handleMonthlyTargetBlur = useCallback(() => {
    const lakhs = parseTargetLakhsInput(monthlyTargetLakhs);
    if (lakhs == null) {
      setMonthlyTargetLakhs(String(MIN_MONTHLY_TARGET_LAKHS));
      return;
    }
    if (lakhs < MIN_MONTHLY_TARGET_LAKHS) {
      setMonthlyTargetLakhs(String(MIN_MONTHLY_TARGET_LAKHS));
      toast.message(`Minimum monthly target is ${MIN_MONTHLY_TARGET_LAKHS} L`);
      return;
    }
    setMonthlyTargetLakhs(formatLakhs(lakhs));
  }, [monthlyTargetLakhs]);

  useEffect(() => {
    if (!prefsReady) return;
    saveTrendPrefs({
      timelinePreset,
      customMonth,
      customStart,
      customEnd,
      filters,
    });
  }, [prefsReady, timelinePreset, customMonth, customStart, customEnd, filters]);

  useEffect(() => {
    if (timelinePreset === 'custom_month' && !customMonth) {
      setCustomMonth(new Date().toISOString().slice(0, 7));
    }
  }, [timelinePreset, customMonth]);

  useEffect(() => {
    if (!initialRange?.startDate || !initialRange?.endDate) return;
    const start = toDateInputValue(initialRange.startDate);
    const end = toDateInputValue(initialRange.endDate);
    setRangeAStart((prev) => prev || start);
    setRangeAEnd((prev) => prev || end);
    const shifted = getShiftedTrendRange(initialRange.startDate, initialRange.endDate, 'previous_period');
    setRangeBStart((prev) => prev || toDateInputValue(shifted.startDate));
    setRangeBEnd((prev) => prev || toDateInputValue(shifted.endDate));
  }, [initialRange]);

  const mergedLeadSources = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of filterOptions.leadSources) map.set(s.key, s.label);
    for (const s of rpcLeadSources) map.set(s.key, s.label);
    return Array.from(map, ([key, label]) => ({ key, label }));
  }, [filterOptions.leadSources, rpcLeadSources]);

  const mergedBrandOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const b of filterOptions.equipmentBrands) labels.add(b.label);
    for (const b of rpcEquipmentBrands) labels.add(b);
    return Array.from(labels).map((label) => ({ label }));
  }, [filterOptions.equipmentBrands, rpcEquipmentBrands]);

  const loadTimeline = useCallback(async (opts?: { skipCache?: boolean }) => {
    setLoading(true);
    try {
      const filterArgs = buildRpcFilterArgs(filters);
      const [dashboard, jobsResult] = await Promise.all([
        fetchTrendDashboard(
          activeRange.startDate,
          activeRange.endDate,
          filters,
          'none',
          dailyStatsFallback,
          opts
        ),
        db.jobs.getCompletedJobsForTrendDrilldown(
          activeRange.startDate,
          activeRange.endDate
        ),
      ]);
      if (!dashboard.primary && hasActiveFilters(filters)) {
        toast.error('Deploy scripts/add-analytics-trend-dashboard-rpc.sql for filtered trends.');
      }
      setSummary(dashboard.primary);
      setInsights(dashboard.insights);
      setMonthCatalog(dashboard.monthCatalog);
      setRpcEquipmentBrands(dashboard.rpcEquipmentBrands);
      setRpcLeadSources(dashboard.rpcLeadSources);
      setUsingFallback(dashboard.usingFallback);
      setLoadedAt(Date.now());

      if (!jobsResult.error && jobsResult.data?.length) {
        const inRange = jobsResult.data.filter((job) =>
          isJobCompletedInRange(job, activeRange.startDate, activeRange.endDate)
        );
        setLeadSourceInsights(
          buildTrendLeadSourceInsights(inRange as Array<Record<string, unknown>>, filterArgs)
        );
      } else {
        setLeadSourceInsights([]);
      }
    } finally {
      setLoading(false);
    }
  }, [activeRange, filters, dailyStatsFallback]);

  const handleRefresh = useCallback(() => {
    clearTrendDashboardCache();
    void loadTimeline({ skipCache: true });
  }, [loadTimeline]);

  const applyAnalyticsPeriod = useCallback(() => {
    if (!analyticsPeriod) return;
    const mapped = mapAnalyticsPeriodToTrend(analyticsPeriod);
    setTimelinePreset(mapped.preset);
    if (mapped.customMonth) setCustomMonth(mapped.customMonth);
    if (mapped.customStart) setCustomStart(mapped.customStart);
    if (mapped.customEnd) setCustomEnd(mapped.customEnd);
  }, [analyticsPeriod]);

  const openPeriodDrilldown = useCallback((periodKey: string, label: string) => {
    setDrilldownPeriodKey(periodKey);
    setDrilldownPeriodLabel(label);
    setDrilldownOpen(true);
  }, []);

  const handleChartClick = useCallback(
    (state: { activePayload?: Array<{ payload?: Record<string, unknown> }> } | null) => {
      const row = state?.activePayload?.[0]?.payload;
      const periodKey = typeof row?.periodKey === 'string' ? row.periodKey : null;
      const label = typeof row?.label === 'string' ? row.label : periodKey;
      if (periodKey && label) openPeriodDrilldown(periodKey, label);
    },
    [openPeriodDrilldown]
  );

  useEffect(() => {
    if (!prefsReady) return;
    void loadTimeline();
  }, [loadTimeline, prefsReady]);

  useEffect(() => {
    const months = monthCatalog.map((m) => m.periodKey).filter((k) => /^\d{4}-\d{2}$/.test(k));
    if (months.length >= 2) {
      setMonthA((prev) => prev || months[months.length - 1]);
      setMonthB((prev) => prev || months[months.length - 2]);
    }
  }, [monthCatalog]);

  const monthOptions = useMemo(
    () => monthCatalog.filter((r) => /^\d{4}-\d{2}$/.test(r.periodKey)),
    [monthCatalog]
  );

  const monthComparison = useMemo(() => {
    const a = monthOptions.find((m) => m.periodKey === monthA);
    const b = monthOptions.find((m) => m.periodKey === monthB);
    return compareTrendMonths(a, b);
  }, [monthOptions, monthA, monthB]);

  const loadRangeComparison = useCallback(async () => {
    if (!rangeAStart || !rangeAEnd || !rangeBStart || !rangeBEnd) {
      toast.error('Select both date ranges to compare.');
      return;
    }
    setRangeCompareLoading(true);
    try {
      const aStart = new Date(rangeAStart);
      aStart.setHours(0, 0, 0, 0);
      const aEnd = new Date(rangeAEnd);
      aEnd.setHours(23, 59, 59, 999);
      const bStart = new Date(rangeBStart);
      bStart.setHours(0, 0, 0, 0);
      const bEnd = new Date(rangeBEnd);
      bEnd.setHours(23, 59, 59, 999);

      const granularity =
        filters.granularity === 'auto'
          ? pickTrendGranularity(aStart, aEnd)
          : filters.granularity;

      const { data, error } = await db.analyticsPaginated.getTrendRangeCompare({
        aStart,
        aEnd,
        bStart,
        bEnd,
        granularity,
        ...buildRpcFilterArgs(filters),
      });

      if (!error && data) {
        const mapped = mapTrendRangeCompareFromRpc(data);
        if (mapped) {
          setRangeCompareA(mapped.a);
          setRangeCompareB(mapped.b);
          return;
        }
      }

      const [a, b] = await Promise.all([
        fetchTrendSummary(aStart, aEnd, filters, dailyStatsFallback),
        fetchTrendSummary(bStart, bEnd, filters, dailyStatsFallback),
      ]);
      setRangeCompareA(a.summary);
      setRangeCompareB(b.summary);
    } finally {
      setRangeCompareLoading(false);
    }
  }, [rangeAStart, rangeAEnd, rangeBStart, rangeBEnd, filters, dailyStatsFallback]);

  const effectiveGranularity =
    filters.granularity === 'auto'
      ? pickTrendGranularity(activeRange.startDate, activeRange.endDate)
      : filters.granularity;

  const chartData = useMemo(() => {
    const rows = summary?.rows ?? [];
    return rows.map((row) => ({
      periodKey: row.periodKey,
      label: row.label,
      revenue: row.revenue,
      jobs: row.jobs,
      avgBill: Math.round(row.avgBill),
      marginPct: row.marginPct,
      revenueChangePct: row.revenueChangePct,
      jobsChangePct: row.jobsChangePct,
    }));
  }, [summary?.rows]);

  const avgRevenue = useMemo(() => {
    if (!summary?.rows.length) return 0;
    return summary.totalRevenue / summary.rows.length;
  }, [summary]);

  const weekdayPattern = useMemo(
    () => (summary?.rows ? computeWeekdayPatternFromRows(summary.rows) : null),
    [summary?.rows]
  );

  const analyticsPeriodLabel = analyticsPeriod
    ? formatAnalyticsPeriodLabel(analyticsPeriod)
    : null;

  const showSyncAnalyticsPeriod = useMemo(() => {
    if (!analyticsPeriod?.startDate || !analyticsPeriod?.endDate) return false;
    return !rangesMatchDay(activeRange, {
      startDate: analyticsPeriod.startDate,
      endDate: analyticsPeriod.endDate,
    });
  }, [analyticsPeriod, activeRange]);

  const drilldownFilters = useMemo(() => buildRpcFilterArgs(filters), [filters]);

  const effectiveLeadSources = useMemo(() => {
    if (leadSourceInsights.length > 0) return leadSourceInsights;
    return insights?.topLeadSources ?? [];
  }, [leadSourceInsights, insights?.topLeadSources]);

  const proratedRevenueTarget = useMemo(
    () =>
      getProratedRevenueTargetLine(monthlyRevenueTarget, effectiveGranularity, activeRange),
    [monthlyRevenueTarget, effectiveGranularity, activeRange]
  );

  const hasMarginData = useMemo(
    () => (summary?.rows ?? []).some((r) => r.marginPct != null && r.marginPct > 0),
    [summary?.rows]
  );

  const technicianTeamComparison = useMemo(() => {
    if (filters.technicianId === ALL || !summary || !insights) return null;
    if (insights.teamBaselineJobs == null || insights.teamBaselineRevenue == null) return null;
    const teamJobs = insights.teamBaselineJobs;
    const teamRevenue = insights.teamBaselineRevenue;
    if (teamJobs <= 0 && teamRevenue <= 0) return null;
    const techName =
      filterOptions.technicians.find((t) => t.id === filters.technicianId)?.name ?? 'Technician';
    return {
      techName,
      techJobs: summary.totalJobs,
      techRevenue: summary.totalRevenue,
      teamJobs,
      teamRevenue,
      jobsSharePct: teamJobs > 0 ? (summary.totalJobs / teamJobs) * 100 : null,
      revenueSharePct: teamRevenue > 0 ? (summary.totalRevenue / teamRevenue) * 100 : null,
      avgBillTech: summary.totalJobs > 0 ? summary.totalRevenue / summary.totalJobs : 0,
      avgBillTeam: teamJobs > 0 ? teamRevenue / teamJobs : 0,
    };
  }, [filters.technicianId, summary, insights, filterOptions.technicians]);

  const rangeOverlayData = useMemo(() => {
    if (!rangeCompareA?.rows.length && !rangeCompareB?.rows.length) return [];
    return alignTrendSeriesByIndex(rangeCompareA?.rows ?? [], rangeCompareB?.rows ?? []);
  }, [rangeCompareA, rangeCompareB]);

  const rangeTotalsCompare = useMemo(() => {
    if (!rangeCompareA || !rangeCompareB) return null;
    return compareTrendMonths(
      {
        periodKey: 'a',
        label: 'Range A',
        jobs: rangeCompareA.totalJobs,
        revenue: rangeCompareA.totalRevenue,
        avgBill: rangeCompareA.totalJobs > 0 ? rangeCompareA.totalRevenue / rangeCompareA.totalJobs : 0,
        marginPct: null,
        revenueChangePct: null,
        jobsChangePct: null,
      },
      {
        periodKey: 'b',
        label: 'Range B',
        jobs: rangeCompareB.totalJobs,
        revenue: rangeCompareB.totalRevenue,
        avgBill: rangeCompareB.totalJobs > 0 ? rangeCompareB.totalRevenue / rangeCompareB.totalJobs : 0,
        marginPct: null,
        revenueChangePct: null,
        jobsChangePct: null,
      }
    );
  }, [rangeCompareA, rangeCompareB]);

  const chartLayout = useMemo(
    () => ({
      margin: isMobile
        ? { top: 8, right: 4, left: 0, bottom: 0 }
        : { top: 12, right: 12, left: 0, bottom: 0 },
      revenueAxisWidth: isMobile ? 40 : 54,
      jobsAxisWidth: isMobile ? 28 : 34,
      maxBarSize: isMobile ? 22 : 36,
      dotRadius: isMobile ? 2 : 3,
      xAxisHeight: isMobile ? 54 : 30,
    }),
    [isMobile]
  );

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0 max-w-full overflow-x-hidden">
      {usingFallback ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Limited mode: using daily stats rollup. Run{' '}
          <code className="text-[11px]">scripts/add-analytics-trend-dashboard-rpc.sql</code> in Supabase for
          one-call loading, filters, comparisons &amp; insights.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between min-w-0">
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-2 w-full min-w-0">
          <FilterSelect
            label="Timeline"
            value={timelinePreset}
            onValueChange={(v) => setTimelinePreset(v as TrendTimelinePreset)}
            className="w-full min-w-0 sm:w-[150px]"
            options={[
              { value: 'this_month', label: 'This month' },
              { value: 'last_month', label: 'Last month' },
              { value: 'custom_month', label: 'Custom month' },
              { value: '6m', label: 'Last 6 months' },
              { value: '12m', label: 'Last 12 months' },
              { value: '24m', label: 'Last 24 months' },
              { value: 'ytd', label: 'Year to date' },
              { value: 'custom', label: 'Custom range' },
            ]}
          />
          {timelinePreset === 'custom_month' ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Month</Label>
              <Input
                type="month"
                value={customMonth}
                onChange={(e) => setCustomMonth(e.target.value)}
                max={new Date().toISOString().slice(0, 7)}
                className="w-full sm:w-[150px] h-9"
              />
            </div>
          ) : null}
          {timelinePreset === 'custom' ? (
            <>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">From</Label>
                <DatePicker value={customStart} onChange={(v) => v && setCustomStart(v)} placeholder="Start" className="w-full sm:w-[140px]" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">To</Label>
                <DatePicker value={customEnd} onChange={(v) => v && setCustomEnd(v)} placeholder="End" className="w-full sm:w-[140px]" />
              </div>
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:self-start lg:self-auto">
          {loadedAt && !loading ? (
            <span className="text-[11px] text-muted-foreground w-full sm:w-auto order-last sm:order-none">
              Updated {formatLoadedAgo(loadedAt)}
            </span>
          ) : null}
          {showSyncAnalyticsPeriod && analyticsPeriodLabel ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs h-8 flex-1 sm:flex-none min-w-0"
              onClick={applyAnalyticsPeriod}
            >
              <span className="truncate sm:hidden">Sync period</span>
              <span className="truncate hidden sm:inline">Match analytics ({analyticsPeriodLabel})</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 flex-1 sm:flex-none"
            onClick={() => handleRefresh()}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 flex-1 sm:flex-none"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Filters {hasActiveFilters(filters) ? '(active)' : ''}
          </Button>
        </div>
      </div>

      {filtersOpen ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border bg-muted/20 p-4">
          <FilterSelect label="Granularity" value={filters.granularity} onValueChange={(v) => setFilters((f) => ({ ...f, granularity: v as TrendFilters['granularity'] }))} options={[
            { value: 'auto', label: 'Auto' }, { value: 'month', label: 'Monthly' }, { value: 'week', label: 'Weekly' }, { value: 'day', label: 'Daily' },
          ]} />
          <FilterSelect label="Chart" value={filters.metric} onValueChange={(v) => setFilters((f) => ({ ...f, metric: v as TrendMetric }))} options={[
            { value: 'combined', label: 'Revenue + jobs' }, { value: 'revenue', label: 'Revenue' }, { value: 'jobs', label: 'Jobs' }, { value: 'avgBill', label: 'Avg bill' },
          ]} />
          <FilterSelect label="Margin trend" value={filters.showMarginTrend ? 'on' : 'off'} onValueChange={(v) => setFilters((f) => ({ ...f, showMarginTrend: v === 'on' }))} options={[
            { value: 'on', label: 'Show margin %' }, { value: 'off', label: 'Hide margin %' },
          ]} />
          <FilterSelect label="Category" value={filters.serviceType} onValueChange={(v) => setFilters((f) => ({ ...f, serviceType: v }))} options={[
            { value: ALL, label: 'All' }, { value: 'RO', label: 'RO' }, { value: 'SOFTENER', label: 'Softener' },
          ]} />
          <FilterSelect label="Company brand" value={filters.serviceBrand} onValueChange={(v) => setFilters((f) => ({ ...f, serviceBrand: v }))} options={[
            { value: ALL, label: 'All' }, { value: 'hydrogenro', label: 'Hydrogen RO' }, { value: 'elevenro', label: 'Eleven RO' },
          ]} />
          <FilterSelect label="Service type" value={filters.serviceSubType} onValueChange={(v) => setFilters((f) => ({ ...f, serviceSubType: v }))} options={[
            { value: ALL, label: 'All' }, ...filterOptions.serviceSubTypes.map((s) => ({ value: s.label, label: s.label })),
          ]} />
          <FilterSelect label="Lead source" value={filters.leadSourceKey} onValueChange={(v) => setFilters((f) => ({ ...f, leadSourceKey: v }))} options={[
            { value: ALL, label: 'All' }, ...mergedLeadSources.map((s) => ({ value: s.key, label: s.label })),
          ]} />
          <FilterSelect label="Equipment brand" value={filters.equipmentBrand} onValueChange={(v) => setFilters((f) => ({ ...f, equipmentBrand: v }))} options={[
            { value: ALL, label: 'All' }, ...mergedBrandOptions.map((b) => ({ value: b.label, label: b.label })),
          ]} />
          <FilterSelect label="Technician" value={filters.technicianId} onValueChange={(v) => setFilters((f) => ({ ...f, technicianId: v }))} options={[
            { value: ALL, label: 'All' }, ...filterOptions.technicians.map((t) => ({ value: t.id, label: t.name })),
          ]} />
          <FilterSelect label="Payment" value={filters.paymentMethod} onValueChange={(v) => setFilters((f) => ({ ...f, paymentMethod: v }))} options={[
            { value: ALL, label: 'All' }, ...filterOptions.paymentMethods.map((p) => ({ value: p.label, label: p.label })),
          ]} />
        </div>
      ) : null}

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1 gap-1">
          <TabsTrigger value="timeline" className="gap-1 text-[11px] sm:text-sm py-2 px-1 sm:px-3">
            <LineChart className="w-4 h-4 shrink-0" />
            <span className="truncate">Timeline</span>
          </TabsTrigger>
          <TabsTrigger value="months" className="gap-1 text-[11px] sm:text-sm py-2 px-1 sm:px-3">
            <CalendarRange className="w-4 h-4 shrink-0" />
            <span className="truncate sm:hidden">Months</span>
            <span className="truncate hidden sm:inline">Compare months</span>
          </TabsTrigger>
          <TabsTrigger value="ranges" className="gap-1 text-[11px] sm:text-sm py-2 px-1 sm:px-3">
            <GitCompare className="w-4 h-4 shrink-0" />
            <span className="truncate sm:hidden">Ranges</span>
            <span className="truncate hidden sm:inline">Compare ranges</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4 space-y-4">
          {loading ? (
            <LoadingState />
          ) : !summary?.rows.length ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Total revenue" value={`₹ ${formatCurrency(summary.totalRevenue)}`} icon={<TrendingUp className="w-4 h-4 text-sky-600" />} sub={<ChangeBadge value={summary.overallTrendPct} size="md" />} />
                <StatCard title="Total jobs" value={String(summary.totalJobs)} icon={<LineChart className="w-4 h-4 text-orange-500" />} sub={`Avg ₹ ${formatCurrency(summary.totalJobs > 0 ? summary.totalRevenue / summary.totalJobs : 0)} / job`} />
                <StatCard title="Best period" value={summary.bestPeriod ? `₹ ${formatCurrency(summary.bestPeriod.revenue)}` : '—'} icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} sub={summary.bestPeriod?.label} />
                <StatCard title="Lowest period" value={summary.worstPeriod ? `₹ ${formatCurrency(summary.worstPeriod.revenue)}` : '—'} icon={<TrendingDown className="w-4 h-4 text-red-500" />} sub={summary.worstPeriod?.label} />
              </div>

              {insights ? (
                <TrendInsightsPanel
                  insights={insights}
                  technicianComparison={technicianTeamComparison}
                  leadSources={effectiveLeadSources}
                  leadSourcesFromRequirements={leadSourceInsights.length > 0}
                />
              ) : null}

              {weekdayPattern ? <WeekdayPatternPanel rows={weekdayPattern} /> : null}

              <div className="rounded-2xl border bg-gradient-to-b from-sky-50/80 to-background p-3 sm:p-5 shadow-sm min-w-0 overflow-hidden">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {effectiveGranularity === 'day' ? 'Daily' : effectiveGranularity === 'week' ? 'Weekly' : 'Monthly'} performance
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Tap a bar or point to view completed jobs
                    </p>
                  </div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground shrink-0">
                    {toDateInputValue(activeRange.startDate)} → {toDateInputValue(activeRange.endDate)}
                  </p>
                </div>
                <div className="mb-3 rounded-lg border bg-muted/25 px-3 py-2.5 sm:px-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Label htmlFor="monthly-target-lakhs" className="text-[11px] text-muted-foreground shrink-0">
                        Monthly target
                      </Label>
                      <div className="inline-flex h-8 w-fit max-w-full shrink-0 items-stretch overflow-hidden rounded-md border bg-background shadow-sm">
                        <Input
                          id="monthly-target-lakhs"
                          type="number"
                          inputMode="decimal"
                          min={MIN_MONTHLY_TARGET_LAKHS}
                          step={0.5}
                          value={monthlyTargetLakhs}
                          onChange={(e) => setMonthlyTargetLakhs(e.target.value)}
                          onBlur={handleMonthlyTargetBlur}
                          className="h-8 !w-11 min-w-0 shrink-0 border-0 px-2 text-center text-xs tabular-nums shadow-none focus-visible:ring-0"
                          aria-label="Monthly revenue target in lakhs"
                        />
                        <span className="flex items-center border-l bg-muted/50 px-2.5 text-[11px] font-medium text-muted-foreground shrink-0">
                          Lakh
                        </span>
                      </div>
                    </div>
                    {proratedRevenueTarget > 0 ? (
                      <p className="text-[11px] text-muted-foreground sm:text-right">
                        Chart line:{' '}
                        <span className="font-semibold tabular-nums text-emerald-700">
                          {formatLakhs(inrToLakhs(proratedRevenueTarget))} L
                          <span className="font-normal text-muted-foreground">
                            {effectiveGranularity === 'day'
                              ? '/day'
                              : effectiveGranularity === 'week'
                                ? '/week'
                                : '/month'}
                          </span>
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
                <ChartContainer
                  config={chartConfig}
                  className="aspect-[5/4] sm:aspect-[16/10] md:aspect-[2.2/1] w-full min-h-[220px] sm:min-h-[280px] cursor-pointer -mx-1 sm:mx-0"
                >
                  <ComposedChart
                    data={chartData}
                    margin={chartLayout.margin}
                    onClick={handleChartClick}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={isMobile ? 4 : 20}
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      angle={isMobile ? -42 : 0}
                      textAnchor={isMobile ? 'end' : 'middle'}
                      height={chartLayout.xAxisHeight}
                      interval={isMobile ? 'preserveStartEnd' : undefined}
                    />
                    {(filters.metric === 'combined' || filters.metric === 'revenue' || filters.metric === 'avgBill') && (
                      <YAxis
                        yAxisId="revenue"
                        tickLine={false}
                        axisLine={false}
                        width={chartLayout.revenueAxisWidth}
                        tick={{ fontSize: isMobile ? 10 : 12 }}
                        tickFormatter={(v) => formatCompactCurrency(Number(v))}
                      />
                    )}
                    {(filters.metric === 'combined' || filters.metric === 'jobs') && (
                      <YAxis
                        yAxisId="jobs"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        width={chartLayout.jobsAxisWidth}
                        allowDecimals={false}
                        tick={{ fontSize: isMobile ? 10 : 12 }}
                      />
                    )}
                    <ChartTooltip content={<RichTooltip />} />
                    {filters.metric !== 'jobs' && filters.metric !== 'avgBill' && proratedRevenueTarget > 0 ? (
                      <ReferenceLine
                        yAxisId="revenue"
                        y={proratedRevenueTarget}
                        stroke="hsl(142 71% 40%)"
                        strokeDasharray="8 4"
                        strokeWidth={2}
                        label={
                          isMobile
                            ? undefined
                            : {
                                value: 'Target',
                                position: 'insideTopRight',
                                fill: 'hsl(142 40% 35%)',
                                fontSize: 10,
                              }
                        }
                      />
                    ) : null}
                    {filters.metric !== 'jobs' && filters.metric !== 'avgBill' ? (
                      <ReferenceLine yAxisId="revenue" y={avgRevenue} stroke="hsl(199 89% 48%)" strokeDasharray="6 4" strokeOpacity={0.45} />
                    ) : null}
                    {(filters.metric === 'combined' || filters.metric === 'jobs') && (
                      <Line
                        yAxisId="jobs"
                        type="monotone"
                        dataKey="jobs"
                        name="Jobs"
                        stroke="var(--color-jobs)"
                        strokeWidth={2.5}
                        dot={{ r: chartLayout.dotRadius, fill: 'var(--color-jobs)' }}
                        activeDot={{ r: isMobile ? 5 : 6, strokeWidth: 2 }}
                      />
                    )}
                    {(filters.metric === 'combined' || filters.metric === 'revenue') && (
                      <Bar
                        yAxisId="revenue"
                        dataKey="revenue"
                        name="Revenue"
                        fill="var(--color-revenue)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={chartLayout.maxBarSize}
                        fillOpacity={0.88}
                      />
                    )}
                    {filters.metric === 'avgBill' && (
                      <Line yAxisId="revenue" type="monotone" dataKey="avgBill" stroke="var(--color-avgBill)" strokeWidth={2.5} dot={{ r: chartLayout.dotRadius }} />
                    )}
                    {filters.metric === 'combined' ? (
                      <Legend
                        verticalAlign="bottom"
                        wrapperStyle={{ fontSize: isMobile ? 10 : 12, paddingTop: isMobile ? 4 : 0 }}
                      />
                    ) : null}
                  </ComposedChart>
                </ChartContainer>

                {filters.showMarginTrend && hasMarginData ? (
                  <MarginTrendStrip rows={summary.rows} />
                ) : null}
              </div>

              <TrendTable
                rows={summary.rows}
                granularity={effectiveGranularity}
                onPeriodClick={openPeriodDrilldown}
                compact={isMobile}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="months" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Month A</Label>
              <Input type="month" value={monthA} onChange={(e) => setMonthA(e.target.value)} max={new Date().toISOString().slice(0, 7)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Month B</Label>
              <Input type="month" value={monthB} onChange={(e) => setMonthB(e.target.value)} max={new Date().toISOString().slice(0, 7)} />
            </div>
          </div>

          {monthA && monthB ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <CompareDeltaCard label="Revenue" a={monthComparison.a?.revenue ?? 0} b={monthComparison.b?.revenue ?? 0} pct={monthComparison.revenueDeltaPct} isCurrency />
                <CompareDeltaCard label="Jobs" a={monthComparison.a?.jobs ?? 0} b={monthComparison.b?.jobs ?? 0} pct={monthComparison.jobsDeltaPct} />
                <CompareDeltaCard label="Avg bill" a={monthComparison.a ? monthComparison.a.revenue / Math.max(monthComparison.a.jobs, 1) : 0} b={monthComparison.b ? monthComparison.b.revenue / Math.max(monthComparison.b.jobs, 1) : 0} pct={monthComparison.avgBillDeltaPct} isCurrency />
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <ChartContainer config={chartConfig} className="aspect-[2/1] w-full min-h-[220px]">
                  <BarChart
                    data={[
                      { name: monthComparison.b?.label ?? 'Month B', revenue: monthComparison.b?.revenue ?? 0, jobs: monthComparison.b?.jobs ?? 0 },
                      { name: monthComparison.a?.label ?? 'Month A', revenue: monthComparison.a?.revenue ?? 0, jobs: monthComparison.a?.jobs ?? 0 },
                    ]}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="4 4" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tickFormatter={(v) => formatCompactCurrency(Number(v))} width={52} />
                    <YAxis yAxisId="right" orientation="right" allowDecimals={false} width={32} />
                    <ChartTooltip content={<RichTooltip />} />
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="var(--color-revenue)" radius={[8, 8, 0, 0]} maxBarSize={72} fillOpacity={0.88} />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="jobs"
                      name="Jobs"
                      stroke="var(--color-jobs)"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: 'var(--color-jobs)' }}
                    />
                    <Legend />
                  </BarChart>
                </ChartContainer>
              </div>
            </>
          ) : (
            <EmptyState message="Pick two months to compare side by side." />
          )}
        </TabsContent>

        <TabsContent value="ranges" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RangePicker title="Range A" start={rangeAStart} end={rangeAEnd} onStart={setRangeAStart} onEnd={setRangeAEnd} />
            <RangePicker title="Range B" start={rangeBStart} end={rangeBEnd} onStart={setRangeBStart} onEnd={setRangeBEnd} />
          </div>
          <Button type="button" onClick={() => void loadRangeComparison()} disabled={rangeCompareLoading} className="gap-2">
            {rangeCompareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompare className="w-4 h-4" />}
            Compare ranges
          </Button>

          {rangeCompareLoading ? <LoadingState /> : null}

          {!rangeCompareLoading && rangeTotalsCompare ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <CompareDeltaCard label="Total revenue" a={rangeCompareA?.totalRevenue ?? 0} b={rangeCompareB?.totalRevenue ?? 0} pct={rangeTotalsCompare.revenueDeltaPct} isCurrency />
                <CompareDeltaCard label="Total jobs" a={rangeCompareA?.totalJobs ?? 0} b={rangeCompareB?.totalJobs ?? 0} pct={rangeTotalsCompare.jobsDeltaPct} />
                <CompareDeltaCard label="Avg bill" a={rangeCompareA && rangeCompareA.totalJobs > 0 ? rangeCompareA.totalRevenue / rangeCompareA.totalJobs : 0} b={rangeCompareB && rangeCompareB.totalJobs > 0 ? rangeCompareB.totalRevenue / rangeCompareB.totalJobs : 0} pct={rangeTotalsCompare.avgBillDeltaPct} isCurrency />
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <p className="text-sm font-medium mb-3">Aligned period comparison (P1, P2, …)</p>
                <ChartContainer config={chartConfig} className="aspect-[2/1] w-full min-h-[280px]">
                  <ComposedChart data={rangeOverlayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" />
                    <XAxis dataKey="indexLabel" tickLine={false} axisLine={false} />
                    <YAxis yAxisId="rev" tickFormatter={(v) => formatCompactCurrency(Number(v))} width={52} />
                    <YAxis yAxisId="jobs" orientation="right" allowDecimals={false} width={32} />
                    <ChartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as { primaryLabel?: string; secondaryLabel?: string };
                        return (
                          <div className="rounded-xl border bg-background px-3 py-2 text-xs shadow-lg">
                            <p className="font-semibold mb-1">{label}</p>
                            <p className="text-muted-foreground">A: {row.primaryLabel}</p>
                            <p className="text-muted-foreground mb-2">B: {row.secondaryLabel}</p>
                            {payload.map((e) => (
                              <div key={String(e.dataKey)} className="flex justify-between gap-4">
                                <span>{e.name}</span>
                                <span className="font-medium">
                                  {String(e.dataKey).toLowerCase().includes('revenue')
                                    ? `₹ ${formatCurrency(Number(e.value) || 0)}`
                                    : e.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Bar yAxisId="rev" dataKey="revenue" name="Range A revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar yAxisId="rev" dataKey="compareRevenue" name="Range B revenue" fill="var(--color-compareRevenue)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Line yAxisId="jobs" type="monotone" dataKey="jobs" name="Range A jobs" stroke="var(--color-jobs)" strokeWidth={2} dot={false} />
                    <Line yAxisId="jobs" type="monotone" dataKey="compareJobs" name="Range B jobs" stroke="var(--color-compareJobs)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </ComposedChart>
                </ChartContainer>
              </div>
            </>
          ) : !rangeCompareLoading ? (
            <EmptyState message="Set two date ranges and click Compare ranges." />
          ) : null}
        </TabsContent>
      </Tabs>

      <TrendPeriodDrilldownDialog
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
        periodKey={drilldownPeriodKey}
        periodLabel={drilldownPeriodLabel}
        filters={drilldownFilters}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 text-sm w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={`${label}-${opt.value}`} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function WeekdayPatternPanel({ rows }: { rows: WeekdayPatternRow[] }) {
  const maxAvgRevenue = Math.max(...rows.map((r) => r.avgRevenue), 1);
  const best = [...rows].sort((a, b) => b.avgRevenue - a.avgRevenue)[0];

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center px-4 py-3 border-b bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarRange className="w-4 h-4 text-sky-600 shrink-0" />
          <p className="text-sm font-semibold text-foreground">Best days of the week</p>
        </div>
        {best ? (
          <span className="text-[11px] text-muted-foreground sm:ml-auto">
            Top: {best.label} · ₹ {formatCurrency(Math.round(best.avgRevenue))} avg
          </span>
        ) : null}
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {rows.map((row) => {
          const width = (row.avgRevenue / maxAvgRevenue) * 100;
          const isBest = best?.dayIndex === row.dayIndex;
          return (
            <div
              key={row.dayIndex}
              className={cn(
                'rounded-xl border px-2.5 py-2.5 text-center',
                isBest ? 'border-sky-300 bg-sky-50/60' : 'bg-background'
              )}
            >
              <p className="text-xs font-semibold text-foreground">{row.shortLabel}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{row.daysSampled}d sampled</p>
              <p className="text-sm font-bold tabular-nums mt-1">₹ {formatCurrency(Math.round(row.avgRevenue))}</p>
              <p className="text-[10px] text-muted-foreground">{row.avgJobs.toFixed(1)} jobs avg</p>
              <div className="h-1 rounded-full bg-muted mt-2 overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarginTrendStrip({ rows }: { rows: AnalyticsTrendPeriodRow[] }) {
  const data = rows
    .filter((r) => r.marginPct != null)
    .map((r) => ({ label: r.label, marginPct: r.marginPct as number }));

  if (data.length < 2) return null;

  return (
    <div className="mt-3 rounded-xl border bg-violet-50/30 px-3 py-3">
      <p className="text-xs font-medium text-foreground mb-2">Margin % trend (revenue − cost)</p>
      <ChartContainer config={chartConfig} className="aspect-[5/1] w-full min-h-[72px]">
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} minTickGap={24} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={36}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
            domain={[0, 'auto']}
          />
          <ChartTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border bg-background px-2.5 py-2 text-xs shadow">
                  <p className="font-medium mb-1">{label}</p>
                  <p>Margin: {Number(payload[0]?.value).toFixed(1)}%</p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="marginPct"
            name="Margin %"
            stroke="var(--color-marginPct)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: 'var(--color-marginPct)' }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

function TechnicianTeamComparisonCard({
  comparison,
}: {
  comparison: {
    techName: string;
    techJobs: number;
    techRevenue: number;
    teamJobs: number;
    teamRevenue: number;
    jobsSharePct: number | null;
    revenueSharePct: number | null;
    avgBillTech: number;
    avgBillTeam: number;
  };
}) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/40 px-4 py-3">
      <p className="text-xs font-semibold text-foreground mb-2">
        {comparison.techName} vs all technicians
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Jobs</p>
          <p className="font-bold tabular-nums">
            {comparison.techJobs} ·{' '}
            {comparison.jobsSharePct != null ? `${comparison.jobsSharePct.toFixed(1)}% of team` : '—'}
          </p>
          <p className="text-muted-foreground mt-0.5">Team total: {comparison.teamJobs}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Revenue</p>
          <p className="font-bold tabular-nums">
            ₹ {formatCurrency(comparison.techRevenue)} ·{' '}
            {comparison.revenueSharePct != null ? `${comparison.revenueSharePct.toFixed(1)}% of team` : '—'}
          </p>
          <p className="text-muted-foreground mt-0.5">Team total: ₹ {formatCurrency(comparison.teamRevenue)}</p>
        </div>
        <div className="sm:col-span-2 pt-1 border-t border-sky-200/80">
          <p className="text-muted-foreground">
            Avg bill: ₹ {formatCurrency(Math.round(comparison.avgBillTech))} vs team ₹{' '}
            {formatCurrency(Math.round(comparison.avgBillTeam))}
          </p>
        </div>
      </div>
    </div>
  );
}

function TrendInsightsPanel({
  insights,
  technicianComparison,
  leadSources,
  leadSourcesFromRequirements,
}: {
  insights: AnalyticsTrendInsights;
  technicianComparison: {
    techName: string;
    techJobs: number;
    techRevenue: number;
    teamJobs: number;
    teamRevenue: number;
    jobsSharePct: number | null;
    revenueSharePct: number | null;
    avgBillTech: number;
    avgBillTeam: number;
  } | null;
  leadSources: Array<{ label: string; revenue: number; jobs: number; avgBill: number }>;
  leadSourcesFromRequirements: boolean;
}) {
  const totalJobs = insights.installationJobs + insights.serviceJobs;
  const installShare = totalJobs > 0 ? (insights.installationJobs / totalJobs) * 100 : 0;
  const totalMixRevenue = insights.installationRevenue + insights.serviceRevenue;
  const installRevShare = totalMixRevenue > 0 ? (insights.installationRevenue / totalMixRevenue) * 100 : 0;

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center px-4 py-3 border-b bg-gradient-to-r from-sky-50/80 to-background">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
          <p className="text-sm font-semibold text-foreground">Business insights</p>
        </div>
        <span className="text-[11px] text-muted-foreground sm:ml-auto">For selected filters &amp; range</span>
      </div>

      <div className="p-4 space-y-4">
        {technicianComparison ? (
          <TechnicianTeamComparisonCard comparison={technicianComparison} />
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <InsightMiniCard
            title="Recent momentum"
            icon={<Zap className="w-4 h-4 text-amber-500" />}
            value={`₹ ${formatCurrency(insights.last3Revenue)}`}
            sub={
              <>
                Last 3 periods vs ₹ {formatCurrency(insights.prior3Revenue)} prior
                <div className="mt-1">
                  <ChangeBadge value={insights.last3GrowthPct} size="md" />
                </div>
              </>
            }
          />
          <InsightMiniCard
            title="Avg per period"
            icon={<Activity className="w-4 h-4 text-sky-600" />}
            value={`₹ ${formatCurrency(Math.round(insights.avgPeriodRevenue))}`}
            sub={`${insights.avgPeriodJobs.toFixed(1)} jobs · ₹ ${formatCurrency(Math.round(insights.avgBill))} avg bill`}
          />
          <InsightMiniCard
            title="Growth streak"
            icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
            value={insights.growingStreakMonths > 0 ? `${insights.growingStreakMonths} mo` : '—'}
            sub={
              insights.growingStreakMonths > 0
                ? 'Consecutive months with rising revenue'
                : 'No consecutive growth streak'
            }
          />
          <InsightMiniCard
            title="Revenue volatility"
            icon={<Activity className="w-4 h-4 text-violet-600" />}
            value={insights.revenueSwingsPct != null ? `${insights.revenueSwingsPct.toFixed(1)}%` : '—'}
            sub="Avg swing between consecutive periods"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-xl border p-4 space-y-3 bg-muted/10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Install vs service</p>
            <div className="space-y-2">
              <MixBar label="Jobs" installPct={installShare} installValue={insights.installationJobs} serviceValue={insights.serviceJobs} />
              <MixBar
                label="Revenue"
                installPct={installRevShare}
                installValue={insights.installationRevenue}
                serviceValue={insights.serviceRevenue}
                isCurrency
              />
            </div>
          </div>

          <LeadSourceEfficiencyList
            title="Lead source efficiency"
            rows={leadSources.map((r) => ({
              label: r.label,
              revenue: r.revenue,
              jobs: r.jobs,
              avgBill: r.avgBill,
            }))}
            fromRequirements={leadSourcesFromRequirements}
          />
          <RankedInsightList
            title="Top service types"
            rows={insights.topServiceTypes.map((r) => ({
              label: r.label,
              revenue: r.revenue,
              jobs: r.jobs,
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function InsightMiniCard({
  title,
  value,
  sub,
  icon,
}: {
  title: string;
  value: string;
  sub: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border px-3.5 py-3 bg-gradient-to-br from-background to-sky-50/30">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
        {icon}
      </div>
      <p className="text-base sm:text-lg font-bold tabular-nums">{value}</p>
      <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{sub}</div>
    </div>
  );
}

function MixBar({
  label,
  installPct,
  installValue,
  serviceValue,
  isCurrency,
}: {
  label: string;
  installPct: number;
  installValue: number;
  serviceValue: number;
  isCurrency?: boolean;
}) {
  const fmt = (n: number) => (isCurrency ? `₹ ${formatCurrency(n)}` : String(n));
  return (
    <div>
      <div className="flex justify-between gap-2 text-xs mb-1">
        <span className="text-muted-foreground shrink-0">{label}</span>
        <span className="tabular-nums text-right text-[10px] sm:text-xs leading-snug">
          Install {fmt(installValue)} · Service {fmt(serviceValue)}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
        <div className="h-full bg-sky-500 transition-all" style={{ width: `${installPct}%` }} />
        <div className="h-full bg-slate-300 transition-all" style={{ width: `${100 - installPct}%` }} />
      </div>
    </div>
  );
}

const LEAD_SOURCE_HINTS: Record<string, string> = {
  'Admin Created': 'Booked manually in admin — no website/lead channel stored on the job.',
  'Direct call': 'Customer called in directly (no tracked online lead).',
};

function LeadSourceEfficiencyList({
  title,
  rows,
  fromRequirements,
}: {
  title: string;
  rows: Array<{ label: string; revenue: number; jobs: number; avgBill: number }>;
  fromRequirements?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleLimit = 8;
  const sorted = [...rows].sort((a, b) => b.avgBill - a.avgBill);
  const visible = expanded ? sorted : sorted.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, sorted.length - visibleLimit);

  if (!rows.length) {
    return (
      <div className="rounded-xl border p-4 bg-muted/10">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</p>
        <p className="text-sm text-muted-foreground">No data for this selection.</p>
      </div>
    );
  }
  const maxAvg = Math.max(...rows.map((r) => r.avgBill), 1);
  return (
    <div className="rounded-xl border p-4 bg-muted/10">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        {title} ({sorted.length})
      </p>
      <p className="text-[10px] text-muted-foreground mb-3">
        Sorted by avg revenue per job
        {fromRequirements ? ' · resolved from job requirements' : ''}
      </p>
      <div className={cn('space-y-2.5', expanded && sorted.length > visibleLimit && 'max-h-72 overflow-y-auto pr-1')}>
        {visible.map((row, i) => {
          const width = (row.avgBill / maxAvg) * 100;
          return (
            <div key={`${title}-${row.label}`}>
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="font-medium truncate" title={LEAD_SOURCE_HINTS[row.label]}>
                  <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                  {row.label}
                </span>
                <span className="text-muted-foreground shrink-0">{row.jobs} jobs</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-violet-500/80 rounded-full" style={{ width: `${width}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums shrink-0">
                  ₹ {formatCurrency(Math.round(row.avgBill))}/job
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {hiddenCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7 w-full text-xs text-sky-700"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Show less' : `Show all ${sorted.length} lead sources`}
        </Button>
      ) : null}
      {sorted.some((r) => r.label === 'Admin Created') ? (
        <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
          <span className="font-medium text-foreground">Admin Created</span> — jobs added from the admin
          panel when no lead source was recorded (walk-in, phone without tracking, etc.). ₹0/job means
          zero billed revenue on that job.
        </p>
      ) : null}
    </div>
  );
}

function RankedInsightList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; revenue: number; jobs: number }>;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border p-4 bg-muted/10">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</p>
        <p className="text-sm text-muted-foreground">No data for this selection.</p>
      </div>
    );
  }
  const maxRevenue = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div className="rounded-xl border p-4 bg-muted/10">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
      <div className="space-y-2.5">
        {rows.map((row, i) => {
          const width = (row.revenue / maxRevenue) * 100;
          return (
            <div key={`${title}-${row.label}`}>
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="font-medium truncate">
                  <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                  {row.label}
                </span>
                <span className="text-muted-foreground shrink-0">{row.jobs} jobs</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-sky-500/80 rounded-full" style={{ width: `${width}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums shrink-0">₹ {formatCurrency(row.revenue)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, icon }: { title: string; value: string; sub?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-gradient-to-br from-background to-sky-50/40 px-3 py-3 sm:px-4 sm:py-3.5 shadow-sm min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">{title}</p>
        {icon}
      </div>
      <p className="text-lg sm:text-xl font-bold text-foreground mt-1 tabular-nums break-all sm:break-normal">{value}</p>
      {sub ? <div className="text-[11px] sm:text-xs text-muted-foreground mt-1 leading-relaxed">{sub}</div> : null}
    </div>
  );
}

function CompareDeltaCard({
  label,
  a,
  b,
  pct,
  isCurrency,
}: {
  label: string;
  a: number;
  b: number;
  pct: number | null;
  isCurrency?: boolean;
}) {
  const fmt = (n: number) => (isCurrency ? `₹ ${formatCurrency(n)}` : String(n));
  return (
    <div className="rounded-xl border px-4 py-3 bg-card">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-lg font-bold tabular-nums">{fmt(a)}</p>
          <p className="text-[11px] text-muted-foreground">vs {fmt(b)}</p>
        </div>
        <ChangeBadge value={pct} size="md" />
      </div>
    </div>
  );
}

function RangePicker({
  title,
  start,
  end,
  onStart,
  onEnd,
}: {
  title: string;
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-3 bg-muted/10">
      <p className="text-sm font-semibold">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Start</Label>
          <DatePicker value={start} onChange={(v) => v && onStart(v)} placeholder="Start" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">End</Label>
          <DatePicker value={end} onChange={(v) => v && onEnd(v)} placeholder="End" />
        </div>
      </div>
    </div>
  );
}

function TrendTable({
  rows,
  granularity,
  onPeriodClick,
  compact = false,
}: {
  rows: AnalyticsTrendPeriodRow[];
  granularity: string;
  onPeriodClick?: (periodKey: string, label: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border -mx-1 sm:mx-0">
      <Table className={compact ? 'text-xs sm:text-sm' : undefined}>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">{granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week' : 'Month'}</TableHead>
            <TableHead className="text-right whitespace-nowrap">Jobs</TableHead>
            <TableHead className="text-right whitespace-nowrap">Revenue</TableHead>
            <TableHead className={cn('text-right whitespace-nowrap', compact && 'hidden sm:table-cell')}>Avg bill</TableHead>
            <TableHead className={cn('text-right whitespace-nowrap', compact && 'hidden md:table-cell')}>Rev. Δ</TableHead>
            <TableHead className={cn('text-right whitespace-nowrap', compact && 'hidden md:table-cell')}>Jobs Δ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.periodKey}
              className={onPeriodClick ? 'cursor-pointer hover:bg-muted/40' : undefined}
              onClick={() => onPeriodClick?.(row.periodKey, row.label)}
            >
              <TableCell className="font-medium whitespace-nowrap">{row.label}</TableCell>
              <TableCell className="text-right tabular-nums">{row.jobs}</TableCell>
              <TableCell className="text-right tabular-nums text-emerald-700 whitespace-nowrap">
                {compact ? formatCompactCurrency(row.revenue) : `₹ ${formatCurrency(row.revenue)}`}
              </TableCell>
              <TableCell className={cn('text-right tabular-nums whitespace-nowrap', compact && 'hidden sm:table-cell')}>
                ₹ {formatCurrency(Math.round(row.avgBill))}
              </TableCell>
              <TableCell className={cn('text-right', compact && 'hidden md:table-cell')}>
                <ChangeBadge value={row.revenueChangePct} />
              </TableCell>
              <TableCell className={cn('text-right', compact && 'hidden md:table-cell')}>
                <ChangeBadge value={row.jobsChangePct} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground rounded-xl border border-dashed">
      <Loader2 className="w-5 h-5 animate-spin" />
      Loading trend data…
    </div>
  );
}

function EmptyState({ message = 'No completed jobs for this selection.' }: { message?: string }) {
  return (
    <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function buildTrendFilterOptions(analytics: {
  leadSourceBreakdown?: Array<{ leadType: string }>;
  technicianStats?: Array<{ id: string; name: string }>;
  serviceTypeBreakdown?: Array<{ serviceType: string }>;
  paymentMethodBreakdown?: Array<{ method: string }>;
  brandStats?: Array<{ displayName: string }>;
}): AnalyticsTrendFilterOptions {
  return {
    leadSources: (analytics.leadSourceBreakdown ?? []).map((row) => ({
      key: normalizeLeadSourceKey(row.leadType),
      label: row.leadType,
    })),
    technicians: (analytics.technicianStats ?? []).map((t) => ({ id: t.id, name: t.name })),
    serviceSubTypes: (analytics.serviceTypeBreakdown ?? []).map((s) => ({ label: s.serviceType })),
    paymentMethods: (analytics.paymentMethodBreakdown ?? []).map((p) => ({ label: p.method })),
    equipmentBrands: (analytics.brandStats ?? []).map((b) => ({ label: b.displayName })),
  };
}
