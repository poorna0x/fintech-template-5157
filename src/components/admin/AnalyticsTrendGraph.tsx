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
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/supabase';
import {
  alignTrendSeriesByIndex,
  compareTrendMonths,
  getShiftedTrendRange,
  mapMonthlyTrendsFromRpc,
  mapTrendDashboardFromRpc,
  mapTrendRangeCompareFromRpc,
  normalizeLeadSourceKey,
  parseAnalyticsMonthlyTrendsRpc,
  parseAnalyticsTrendDashboardRpc,
  pickTrendGranularity,
  resolveTrendTimelineRange,
  rollupDailyStatsToMonthlyTrends,
  type AnalyticsTrendInsights,
  type AnalyticsTrendPeriodRow,
  type AnalyticsTrendSummary,
  type TrendTimelinePreset,
} from '@/lib/analyticsDashboard';
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
};

const ALL = '__all__';
const TREND_CACHE_TTL_MS = 5 * 60 * 1000;

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

const chartConfig = {
  revenue: { label: 'Revenue', color: 'hsl(199 89% 48%)' },
  jobs: { label: 'Jobs', color: 'hsl(25 95% 53%)' },
  avgBill: { label: 'Avg bill', color: 'hsl(262 83% 58%)' },
  compareRevenue: { label: 'Compare revenue', color: 'hsl(215 16% 65%)' },
  compareJobs: { label: 'Compare jobs', color: 'hsl(25 55% 68%)' },
} satisfies ChartConfig;

type TrendFilters = {
  granularity: TrendGranularity | 'auto';
  metric: TrendMetric;
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
  dailyStatsFallback?: Array<{ date: string; jobs: number; revenue: number }>
): Promise<TrendDashboardPayload> {
  const cacheKey = buildTrendCacheKey(startDate, endDate, filters, overlay);
  const cached = trendDashboardCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TREND_CACHE_TTL_MS) {
    return cached.payload;
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
  overlay,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string; name?: string; payload?: Record<string, unknown> }>;
  label?: string;
  overlay?: TimelineOverlay;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Record<string, unknown> | undefined;
  const seen = new Set<string>();
  const items = payload.filter((entry) => {
    const key = String(entry.dataKey ?? entry.name ?? '');
    if (!key || seen.has(key)) return false;
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
        {overlay !== 'none' && row?.compareLabel ? (
          <p className="text-[10px] text-muted-foreground pt-1">{String(row.compareLabel)}</p>
        ) : null}
      </div>
    </div>
  );
}

export function AnalyticsTrendGraph({
  filterOptions,
  dailyStatsFallback,
  initialRange,
}: AnalyticsTrendGraphProps) {
  const [filters, setFilters] = useState<TrendFilters>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [timelinePreset, setTimelinePreset] = useState<TrendTimelinePreset>('this_month');
  const [customMonth, setCustomMonth] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [overlay, setOverlay] = useState<TimelineOverlay>('none');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsTrendSummary | null>(null);
  const [compareSummary, setCompareSummary] = useState<AnalyticsTrendSummary | null>(null);
  const [insights, setInsights] = useState<AnalyticsTrendInsights | null>(null);
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

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const dashboard = await fetchTrendDashboard(
        activeRange.startDate,
        activeRange.endDate,
        filters,
        overlay,
        dailyStatsFallback
      );
      if (!dashboard.primary && hasActiveFilters(filters)) {
        toast.error('Deploy scripts/add-analytics-trend-dashboard-rpc.sql for filtered trends.');
      }
      setSummary(dashboard.primary);
      setCompareSummary(dashboard.compare);
      setInsights(dashboard.insights);
      setMonthCatalog(dashboard.monthCatalog);
      setRpcEquipmentBrands(dashboard.rpcEquipmentBrands);
      setRpcLeadSources(dashboard.rpcLeadSources);
      setUsingFallback(dashboard.usingFallback);
    } finally {
      setLoading(false);
    }
  }, [activeRange, filters, overlay, dailyStatsFallback]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

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
    const compareRows = compareSummary?.rows ?? [];
    return rows.map((row, index) => {
      const compare = compareRows[index];
      const overlayLabel =
        overlay === 'previous_year'
          ? `vs ${compare?.label ?? 'prior year'}`
          : overlay === 'previous_period'
            ? `vs ${compare?.label ?? 'prior period'}`
            : undefined;
      return {
        periodKey: row.periodKey,
        label: row.label,
        revenue: row.revenue,
        jobs: row.jobs,
        avgBill: Math.round(row.avgBill),
        revenueChangePct: row.revenueChangePct,
        jobsChangePct: row.jobsChangePct,
        compareRevenue: compare?.revenue ?? null,
        compareJobs: compare?.jobs ?? null,
        compareLabel: overlayLabel,
      };
    });
  }, [summary, compareSummary, overlay]);

  const avgRevenue = useMemo(() => {
    if (!summary?.rows.length) return 0;
    return summary.totalRevenue / summary.rows.length;
  }, [summary]);

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
        revenueChangePct: null,
        jobsChangePct: null,
      },
      {
        periodKey: 'b',
        label: 'Range B',
        jobs: rangeCompareB.totalJobs,
        revenue: rangeCompareB.totalRevenue,
        avgBill: rangeCompareB.totalJobs > 0 ? rangeCompareB.totalRevenue / rangeCompareB.totalJobs : 0,
        revenueChangePct: null,
        jobsChangePct: null,
      }
    );
  }, [rangeCompareA, rangeCompareB]);

  return (
    <div className="space-y-5">
      {usingFallback ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Limited mode: using daily stats rollup. Run{' '}
          <code className="text-[11px]">scripts/add-analytics-trend-dashboard-rpc.sql</code> in Supabase for
          one-call loading, filters, comparisons &amp; insights.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <FilterSelect
            label="Timeline"
            value={timelinePreset}
            onValueChange={(v) => setTimelinePreset(v as TrendTimelinePreset)}
            className="w-[150px]"
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
                className="w-[150px] h-9"
              />
            </div>
          ) : null}
          {timelinePreset === 'custom' ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">From</Label>
                <DatePicker value={customStart} onChange={(v) => v && setCustomStart(v)} placeholder="Start" className="w-[140px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">To</Label>
                <DatePicker value={customEnd} onChange={(v) => v && setCustomEnd(v)} placeholder="End" className="w-[140px]" />
              </div>
            </>
          ) : null}
          <FilterSelect
            label="Overlay"
            value={overlay}
            onValueChange={(v) => setOverlay(v as TimelineOverlay)}
            className="w-[160px]"
            options={[
              { value: 'none', label: 'No comparison' },
              { value: 'previous_period', label: 'Previous period' },
              { value: 'previous_year', label: 'Previous year' },
            ]}
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 self-start lg:self-auto" onClick={() => setFiltersOpen((o) => !o)}>
          {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Filters {hasActiveFilters(filters) ? '(active)' : ''}
        </Button>
      </div>

      {filtersOpen ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border bg-muted/20 p-4">
          <FilterSelect label="Granularity" value={filters.granularity} onValueChange={(v) => setFilters((f) => ({ ...f, granularity: v as TrendFilters['granularity'] }))} options={[
            { value: 'auto', label: 'Auto' }, { value: 'month', label: 'Monthly' }, { value: 'week', label: 'Weekly' }, { value: 'day', label: 'Daily' },
          ]} />
          <FilterSelect label="Chart" value={filters.metric} onValueChange={(v) => setFilters((f) => ({ ...f, metric: v as TrendMetric }))} options={[
            { value: 'combined', label: 'Revenue + jobs' }, { value: 'revenue', label: 'Revenue' }, { value: 'jobs', label: 'Jobs' }, { value: 'avgBill', label: 'Avg bill' },
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
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="timeline" className="gap-1.5 text-xs sm:text-sm py-2">
            <LineChart className="w-4 h-4 shrink-0" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="months" className="gap-1.5 text-xs sm:text-sm py-2">
            <CalendarRange className="w-4 h-4 shrink-0" />
            Compare months
          </TabsTrigger>
          <TabsTrigger value="ranges" className="gap-1.5 text-xs sm:text-sm py-2">
            <GitCompare className="w-4 h-4 shrink-0" />
            Compare ranges
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4 space-y-4">
          {loading ? (
            <LoadingState />
          ) : !summary?.rows.length ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Total revenue" value={`₹ ${formatCurrency(summary.totalRevenue)}`} icon={<TrendingUp className="w-4 h-4 text-sky-600" />} sub={<ChangeBadge value={summary.overallTrendPct} size="md" />} />
                <StatCard title="Total jobs" value={String(summary.totalJobs)} icon={<LineChart className="w-4 h-4 text-orange-500" />} sub={`Avg ₹ ${formatCurrency(summary.totalJobs > 0 ? summary.totalRevenue / summary.totalJobs : 0)} / job`} />
                <StatCard title="Best period" value={summary.bestPeriod ? `₹ ${formatCurrency(summary.bestPeriod.revenue)}` : '—'} icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} sub={summary.bestPeriod?.label} />
                <StatCard title="Lowest period" value={summary.worstPeriod ? `₹ ${formatCurrency(summary.worstPeriod.revenue)}` : '—'} icon={<TrendingDown className="w-4 h-4 text-red-500" />} sub={summary.worstPeriod?.label} />
              </div>

              {insights ? <TrendInsightsPanel insights={insights} /> : null}

              <div className="rounded-2xl border bg-gradient-to-b from-sky-50/80 to-background p-3 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {effectiveGranularity === 'day' ? 'Daily' : effectiveGranularity === 'week' ? 'Weekly' : 'Monthly'} performance
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {toDateInputValue(activeRange.startDate)} → {toDateInputValue(activeRange.endDate)}
                  </p>
                </div>
                <ChartContainer config={chartConfig} className="aspect-[16/10] sm:aspect-[2.2/1] w-full min-h-[280px]">
                  <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={20} />
                    {(filters.metric === 'combined' || filters.metric === 'jobs') && (
                      <YAxis yAxisId="jobs" tickLine={false} axisLine={false} width={34} allowDecimals={false} />
                    )}
                    {(filters.metric === 'combined' || filters.metric === 'revenue' || filters.metric === 'avgBill') && (
                      <YAxis yAxisId="revenue" orientation="right" tickLine={false} axisLine={false} width={54} tickFormatter={(v) => formatCompactCurrency(Number(v))} />
                    )}
                    <ChartTooltip content={<RichTooltip overlay={overlay} />} />
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
                        dot={{ r: 3, fill: 'var(--color-jobs)' }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                      />
                    )}
                    {(filters.metric === 'combined' || filters.metric === 'revenue') && (
                      <Bar
                        yAxisId="revenue"
                        dataKey="revenue"
                        name="Revenue"
                        fill="var(--color-revenue)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={36}
                        fillOpacity={0.88}
                      />
                    )}
                    {overlay !== 'none' && (filters.metric === 'combined' || filters.metric === 'revenue') && (
                      <Line
                        yAxisId="revenue"
                        type="monotone"
                        dataKey="compareRevenue"
                        name="Compare revenue"
                        stroke="var(--color-compareRevenue)"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                        connectNulls
                      />
                    )}
                    {overlay !== 'none' && (filters.metric === 'combined' || filters.metric === 'jobs') && (
                      <Line
                        yAxisId="jobs"
                        type="monotone"
                        dataKey="compareJobs"
                        name="Compare jobs"
                        stroke="var(--color-compareJobs)"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={false}
                        connectNulls
                      />
                    )}
                    {filters.metric === 'avgBill' && (
                      <Line yAxisId="revenue" type="monotone" dataKey="avgBill" stroke="var(--color-avgBill)" strokeWidth={2.5} dot={{ r: 3 }} />
                    )}
                    {filters.metric === 'combined' || overlay !== 'none' ? (
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    ) : null}
                  </ComposedChart>
                </ChartContainer>
              </div>

              <TrendTable rows={summary.rows} granularity={effectiveGranularity} />
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
        <SelectTrigger className="h-9 text-sm">
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

function TrendInsightsPanel({ insights }: { insights: AnalyticsTrendInsights }) {
  const totalJobs = insights.installationJobs + insights.serviceJobs;
  const installShare = totalJobs > 0 ? (insights.installationJobs / totalJobs) * 100 : 0;
  const totalMixRevenue = insights.installationRevenue + insights.serviceRevenue;
  const installRevShare = totalMixRevenue > 0 ? (insights.installationRevenue / totalMixRevenue) * 100 : 0;

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-sky-50/80 to-background">
        <Sparkles className="w-4 h-4 text-sky-600" />
        <p className="text-sm font-semibold text-foreground">Business insights</p>
        <span className="text-[11px] text-muted-foreground ml-auto">For selected filters &amp; range</span>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

          <RankedInsightList
            title="Top lead sources"
            rows={insights.topLeadSources.map((r) => ({
              label: r.label,
              revenue: r.revenue,
              jobs: r.jobs,
            }))}
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
      <p className="text-lg font-bold tabular-nums">{value}</p>
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
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
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
    <div className="rounded-xl border bg-gradient-to-br from-background to-sky-50/40 px-4 py-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        {icon}
      </div>
      <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{value}</p>
      {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
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

function TrendTable({ rows, granularity }: { rows: AnalyticsTrendPeriodRow[]; granularity: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{granularity === 'day' ? 'Day' : granularity === 'week' ? 'Week' : 'Month'}</TableHead>
            <TableHead className="text-right">Jobs</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Avg bill</TableHead>
            <TableHead className="text-right">Rev. Δ</TableHead>
            <TableHead className="text-right">Jobs Δ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.periodKey}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right tabular-nums">{row.jobs}</TableCell>
              <TableCell className="text-right tabular-nums text-emerald-700">₹ {formatCurrency(row.revenue)}</TableCell>
              <TableCell className="text-right tabular-nums">₹ {formatCurrency(Math.round(row.avgBill))}</TableCell>
              <TableCell className="text-right"><ChangeBadge value={row.revenueChangePct} /></TableCell>
              <TableCell className="text-right"><ChangeBadge value={row.jobsChangePct} /></TableCell>
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
