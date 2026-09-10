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
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart as ReLineChart, XAxis, YAxis } from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  GitCompare,
  LineChart,
  Loader2,
  Minus,
  Phone,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { db } from '@/lib/supabase';
import {
  pickTrendGranularity,
  resolveTrendTimelineRange,
  type TrendTimelinePreset,
} from '@/lib/analyticsDashboard';
import {
  buildLeadSourceTrendChartRows,
  compareLeadSourceMonths,
  formatInrCompact,
  leadSourceTrendColor,
  parseLeadSourceTrendRpc,
  pickLeadSourceTrendSeriesKeys,
  type LeadSourceTrendMetric,
  type LeadSourceTrendPayload,
  type LeadSourceTrendPeriodRow,
} from '@/lib/analyticsLeadSourceTrend';
import {
  TrendFilterSelect,
  TrendStatCard,
} from '@/components/admin/AnalyticsTrendGraph';
import { toast } from 'sonner';

const ALL = '__all__';
/** Always both brands; RO jobs only (product choice). */
const FIXED_SERVICE_BRAND: string | null = null;
const FIXED_SERVICE_TYPE = 'RO';
const PREFS_KEY = 'hydrogenro-analytics-lead-source-trend-prefs-v2';
const CACHE_TTL_MS = 5 * 60 * 1000;

type Prefs = {
  timelinePreset: TrendTimelinePreset;
  customMonth: string;
  customStart: string;
  customEnd: string;
  metric: LeadSourceTrendMetric;
  leadSourceKey: string;
  granularityOverride: 'auto' | 'month' | 'week' | 'day';
};

const cache = new Map<string, { at: number; payload: LeadSourceTrendPayload }>();

/** Local calendar YYYY-MM-DD — never use toISOString() (UTC shift). */
function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * All-sources + daily buckets is unreadable (many stacked colors).
 * Prefer month/week for overview; day only when focusing one source.
 */
function pickLeadSourceGranularity(
  startDate: Date,
  endDate: Date,
  focusingOneSource: boolean
): 'month' | 'week' | 'day' {
  if (!focusingOneSource) {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 21) return 'week';
    return 'month';
  }
  return pickTrendGranularity(startDate, endDate);
}

function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Prefs;
  } catch {
    return null;
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (!Number.isFinite(value) || value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
        <Minus className="w-3 h-3" /> —
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        up ? 'text-emerald-600' : 'text-red-600'
      )}
    >
      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {up ? '+' : ''}
      {suffix === '₹' ? formatInrCompact(value) : `${value}${suffix}`}
    </span>
  );
}

type AnalyticsLeadSourceTrendProps = {
  initialRange?: { startDate: Date | null; endDate: Date | null };
};

export function AnalyticsLeadSourceTrend({ initialRange }: AnalyticsLeadSourceTrendProps) {
  const isMobile = useIsMobile();
  const [prefsReady, setPrefsReady] = useState(false);
  const [timelinePreset, setTimelinePreset] = useState<TrendTimelinePreset>('this_month');
  const [customMonth, setCustomMonth] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [metric, setMetric] = useState<LeadSourceTrendMetric>('jobs');
  const [leadSourceKey, setLeadSourceKey] = useState(ALL);
  const [granularityOverride, setGranularityOverride] = useState<'auto' | 'month' | 'week' | 'day'>(
    'auto'
  );

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<LeadSourceTrendPayload | null>(null);

  const [monthA, setMonthA] = useState('');
  const [monthB, setMonthB] = useState('');

  const [rangeAStart, setRangeAStart] = useState('');
  const [rangeAEnd, setRangeAEnd] = useState('');
  const [rangeBStart, setRangeBStart] = useState('');
  const [rangeBEnd, setRangeBEnd] = useState('');
  const [rangeA, setRangeA] = useState<LeadSourceTrendPayload | null>(null);
  const [rangeB, setRangeB] = useState<LeadSourceTrendPayload | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  const activeRange = useMemo(() => {
    if (timelinePreset === 'custom_month') {
      return resolveTrendTimelineRange(
        'custom_month',
        undefined,
        undefined,
        customMonth || undefined
      );
    }
    if (timelinePreset === 'custom') {
      if (customStart && customEnd) {
        let start = parseLocalDateKey(customStart);
        let end = parseLocalDateKey(customEnd);
        if (start && end) {
          if (start.getTime() > end.getTime()) {
            const tmp = start;
            start = end;
            end = tmp;
          }
          end = new Date(end);
          end.setHours(23, 59, 59, 999);
          return { startDate: start, endDate: end };
        }
      }
      // Incomplete custom → fall back to this month so the chart still loads.
      return resolveTrendTimelineRange('this_month');
    }
    return resolveTrendTimelineRange(timelinePreset);
  }, [timelinePreset, customMonth, customStart, customEnd]);

  useEffect(() => {
    const saved = loadPrefs();
    if (saved) {
      setTimelinePreset(saved.timelinePreset || 'this_month');
      setCustomMonth(saved.customMonth || '');
      setCustomStart(saved.customStart || '');
      setCustomEnd(saved.customEnd || '');
      setMetric(saved.metric === 'revenue' ? 'revenue' : 'jobs');
      setLeadSourceKey(saved.leadSourceKey || ALL);
      setGranularityOverride(saved.granularityOverride || 'auto');
    } else if (initialRange?.startDate && initialRange?.endDate) {
      setTimelinePreset('custom');
      setCustomStart(toLocalDateKey(initialRange.startDate));
      setCustomEnd(toLocalDateKey(initialRange.endDate));
    }
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    savePrefs({
      timelinePreset,
      customMonth,
      customStart,
      customEnd,
      metric,
      leadSourceKey,
      granularityOverride,
    });
  }, [
    prefsReady,
    timelinePreset,
    customMonth,
    customStart,
    customEnd,
    metric,
    leadSourceKey,
    granularityOverride,
  ]);

  useEffect(() => {
    if (timelinePreset === 'custom_month' && !customMonth) {
      const now = new Date();
      setCustomMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
  }, [timelinePreset, customMonth]);

  const focusingOneSource = leadSourceKey !== ALL;

  const granularity = useMemo(() => {
    if (granularityOverride !== 'auto') return granularityOverride;
    return pickLeadSourceGranularity(
      activeRange.startDate,
      activeRange.endDate,
      focusingOneSource
    );
  }, [granularityOverride, activeRange, focusingOneSource]);

  const fetchTrend = useCallback(async () => {
    const cacheKey = [
      activeRange.startDate.toISOString(),
      activeRange.endDate.toISOString(),
      granularity,
      FIXED_SERVICE_TYPE,
      'both',
    ].join('|');
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setPayload(hit.payload);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await db.analyticsPaginated.getLeadSourceTrend({
        startDate: activeRange.startDate,
        endDate: activeRange.endDate,
        granularity,
        serviceBrand: FIXED_SERVICE_BRAND,
        serviceType: FIXED_SERVICE_TYPE,
      });
      if (error) throw error;
      const parsed = parseLeadSourceTrendRpc(data);
      if (!parsed) throw new Error('Empty lead-source trend response');
      cache.set(cacheKey, { at: Date.now(), payload: parsed });
      setPayload(parsed);
      setMonthA((prev) => prev || parsed.monthCatalog[0]?.periodKey || '');
      setMonthB((prev) => prev || parsed.monthCatalog[1]?.periodKey || '');
      // Drop stale lead-source pick if it vanished in this range.
      setLeadSourceKey((prev) => {
        if (prev === ALL) return prev;
        return parsed.sources.some((s) => s.key === prev) ? prev : ALL;
      });
    } catch (err) {
      console.error('[lead-source-trend]', err);
      toast.error(
        err instanceof Error && /not authorized|permission|42501/i.test(err.message)
          ? 'Not authorized for lead-source trend'
          : 'Could not load lead-source trend. Run scripts/add-analytics-lead-source-trend-rpc.sql in Supabase if this is the first time.'
      );
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [activeRange, granularity]);

  useEffect(() => {
    if (!prefsReady) return;
    void fetchTrend();
  }, [prefsReady, fetchTrend]);

  const filteredSources = useMemo(() => {
    const sources = payload?.sources || [];
    if (leadSourceKey === ALL) return sources;
    return sources.filter((s) => s.key === leadSourceKey);
  }, [payload?.sources, leadSourceKey]);

  const filteredPeriods = useMemo(() => {
    const periods = payload?.periods || [];
    if (leadSourceKey === ALL) return periods;
    return periods.map((p) => {
      const sources = p.sources.filter((s) => s.key === leadSourceKey);
      const jobs = sources.reduce((n, s) => n + s.jobs, 0);
      const revenue = sources.reduce((n, s) => n + s.revenue, 0);
      return { ...p, sources, jobs, revenue };
    });
  }, [payload?.periods, leadSourceKey]);

  const seriesMeta = useMemo(() => {
    if (leadSourceKey !== ALL && filteredSources[0]) {
      return {
        keys: [filteredSources[0].key],
        labels: { [filteredSources[0].key]: filteredSources[0].label },
        otherKey: null as string | null,
      };
    }
    return pickLeadSourceTrendSeriesKeys(filteredSources, 5);
  }, [filteredSources, leadSourceKey]);

  const chartRows = useMemo(
    () =>
      buildLeadSourceTrendChartRows(
        filteredPeriods,
        seriesMeta.keys,
        seriesMeta.otherKey,
        metric
      ),
    [filteredPeriods, seriesMeta, metric]
  );

  const chartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    seriesMeta.keys.forEach((key, i) => {
      cfg[key] = {
        label: seriesMeta.labels[key] || key,
        color: leadSourceTrendColor(i),
      };
    });
    return cfg;
  }, [seriesMeta]);

  const filteredSummary = useMemo(() => {
    const jobs = filteredSources.reduce((n, s) => n + s.jobs, 0);
    const revenue = filteredSources.reduce((n, s) => n + s.revenue, 0);
    return { jobs, revenue, sourceCount: filteredSources.length };
  }, [filteredSources]);

  const catalogByKey = useMemo(() => {
    const m = new Map<string, LeadSourceTrendPeriodRow>();
    for (const row of payload?.monthCatalog || []) {
      if (leadSourceKey === ALL) {
        m.set(row.periodKey, row);
        continue;
      }
      const sources = row.sources.filter((s) => s.key === leadSourceKey);
      m.set(row.periodKey, {
        ...row,
        sources,
        jobs: sources.reduce((n, s) => n + s.jobs, 0),
        revenue: sources.reduce((n, s) => n + s.revenue, 0),
      });
    }
    return m;
  }, [payload?.monthCatalog, leadSourceKey]);

  const monthCompareRows = useMemo(
    () =>
      compareLeadSourceMonths(catalogByKey.get(monthA) || null, catalogByKey.get(monthB) || null),
    [catalogByKey, monthA, monthB]
  );

  const loadRangeCompare = useCallback(async () => {
    if (!rangeAStart || !rangeAEnd || !rangeBStart || !rangeBEnd) {
      toast.error('Pick both date ranges.');
      return;
    }
    const aStart = parseLocalDateKey(rangeAStart);
    const aEndRaw = parseLocalDateKey(rangeAEnd);
    const bStart = parseLocalDateKey(rangeBStart);
    const bEndRaw = parseLocalDateKey(rangeBEnd);
    if (!aStart || !aEndRaw || !bStart || !bEndRaw) {
      toast.error('Invalid dates.');
      return;
    }
    const aEnd = new Date(aEndRaw);
    aEnd.setHours(23, 59, 59, 999);
    const bEnd = new Date(bEndRaw);
    bEnd.setHours(23, 59, 59, 999);
    setRangeLoading(true);
    try {
      const granA = pickTrendGranularity(aStart, aEnd);
      const granB = pickTrendGranularity(bStart, bEnd);
      const [resA, resB] = await Promise.all([
        db.analyticsPaginated.getLeadSourceTrend({
          startDate: aStart,
          endDate: aEnd,
          granularity: granA,
          serviceBrand: FIXED_SERVICE_BRAND,
          serviceType: FIXED_SERVICE_TYPE,
        }),
        db.analyticsPaginated.getLeadSourceTrend({
          startDate: bStart,
          endDate: bEnd,
          granularity: granB,
          serviceBrand: FIXED_SERVICE_BRAND,
          serviceType: FIXED_SERVICE_TYPE,
        }),
      ]);
      if (resA.error) throw resA.error;
      if (resB.error) throw resB.error;
      setRangeA(parseLeadSourceTrendRpc(resA.data));
      setRangeB(parseLeadSourceTrendRpc(resB.data));
    } catch (err) {
      console.error('[lead-source-trend-compare]', err);
      toast.error('Range compare failed.');
    } finally {
      setRangeLoading(false);
    }
  }, [rangeAStart, rangeAEnd, rangeBStart, rangeBEnd]);

  const filterPayloadSources = useCallback(
    (p: LeadSourceTrendPayload | null): LeadSourceTrendPeriodRow | null => {
      if (!p) return null;
      const sources =
        leadSourceKey === ALL ? p.sources : p.sources.filter((s) => s.key === leadSourceKey);
      return {
        periodKey: 'x',
        label: 'x',
        jobs: sources.reduce((n, s) => n + s.jobs, 0),
        revenue: sources.reduce((n, s) => n + s.revenue, 0),
        sources,
      };
    },
    [leadSourceKey]
  );

  const rangeCompareRows = useMemo(
    () => compareLeadSourceMonths(filterPayloadSources(rangeA), filterPayloadSources(rangeB)),
    [rangeA, rangeB, filterPayloadSources]
  );

  const glanceCards = useMemo(() => {
    const sources = payload?.sources || [];
    const find = (pred: (label: string) => boolean) =>
      sources.filter((s) => pred(s.label.toLowerCase()));
    const direct = find((l) => l === 'direct call' || l.includes('direct call'));
    const webHro = find((l) => l.includes('website') && l.includes('hydrogen'));
    const webEro = find((l) => l.includes('website') && l.includes('eleven'));
    const google = find((l) => l.includes('google'));
    const sum = (rows: typeof sources) => ({
      jobs: rows.reduce((n, r) => n + r.jobs, 0),
      revenue: rows.reduce((n, r) => n + r.revenue, 0),
      keys: rows.map((r) => r.key),
    });
    return [
      { title: 'Direct call', icon: Phone, ...sum(direct) },
      { title: 'Website (HydrogenRO)', ...sum(webHro) },
      { title: 'Website (ElevenRO)', ...sum(webEro) },
      { title: 'Google-Leads', ...sum(google) },
    ];
  }, [payload?.sources]);

  const selectedSourceLabel =
    leadSourceKey === ALL
      ? 'All lead sources'
      : payload?.sources.find((s) => s.key === leadSourceKey)?.label || 'Selected source';

  const leadSourceOptions = [
    { value: ALL, label: 'All sources' },
    ...(payload?.sources || []).map((s) => ({ value: s.key, label: s.label })),
  ];

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between min-w-0">
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-2 w-full min-w-0">
          <TrendFilterSelect
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
                max={toLocalDateKey(new Date()).slice(0, 7)}
                className="w-full sm:w-[150px] h-9"
              />
            </div>
          ) : null}
          {timelinePreset === 'custom' ? (
            <>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">From</Label>
                <DatePicker
                  value={customStart}
                  onChange={(v) => v && setCustomStart(v)}
                  placeholder="Start"
                  className="w-full sm:w-[140px]"
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">To</Label>
                <DatePicker
                  value={customEnd}
                  onChange={(v) => v && setCustomEnd(v)}
                  placeholder="End"
                  className="w-full sm:w-[140px]"
                />
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border bg-muted/20 p-4">
        <TrendFilterSelect
          label="Lead source"
          value={leadSourceKey}
          onValueChange={setLeadSourceKey}
          options={leadSourceOptions}
        />
        <TrendFilterSelect
          label="Chart"
          value={metric}
          onValueChange={(v) => setMetric(v as LeadSourceTrendMetric)}
          options={[
            { value: 'jobs', label: 'Jobs' },
            { value: 'revenue', label: 'Revenue' },
          ]}
        />
        <TrendFilterSelect
          label="Granularity"
          value={granularityOverride}
          onValueChange={(v) => setGranularityOverride(v as typeof granularityOverride)}
          options={[
            { value: 'auto', label: focusingOneSource ? 'Auto' : 'Auto (month/week)' },
            { value: 'month', label: 'Monthly' },
            { value: 'week', label: 'Weekly' },
            { value: 'day', label: 'Daily' },
          ]}
        />
        <div className="space-y-1.5 flex flex-col justify-end">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {focusingOneSource
              ? 'Single-source bars. Switch Lead source to All for trend lines.'
              : 'All sources: top 5 as lines by month/week (daily stacks stay off in Auto).'}
          </p>
        </div>
      </div>

      {loading && !payload ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground rounded-xl border border-dashed">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading lead-source trend…
        </div>
      ) : !payload ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">
          No completed RO jobs for this selection.
        </div>
      ) : (
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
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-3">
              {glanceCards.map((card) => {
                const active =
                  leadSourceKey === ALL || card.keys.some((k) => k === leadSourceKey);
                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => {
                      if (card.keys.length === 1) {
                        setLeadSourceKey((prev) => (prev === card.keys[0] ? ALL : card.keys[0]));
                      } else if (card.keys.length > 1) {
                        setLeadSourceKey((prev) => (card.keys.includes(prev) ? ALL : card.keys[0]));
                      }
                    }}
                    className={cn(
                      'text-left rounded-xl transition-opacity',
                      !active && 'opacity-55 hover:opacity-80'
                    )}
                  >
                    <TrendStatCard
                      title={card.title}
                      value={`${card.jobs} jobs`}
                      icon={
                        card.icon ? (
                          <card.icon className="w-4 h-4 text-sky-600" />
                        ) : (
                          <TrendingUp className="w-4 h-4 text-sky-600" />
                        )
                      }
                      sub={formatInrCompact(card.revenue)}
                    />
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border bg-gradient-to-b from-sky-50/80 to-background p-3 sm:p-5 shadow-sm min-w-0 overflow-hidden">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {granularity === 'day' ? 'Daily' : granularity === 'week' ? 'Weekly' : 'Monthly'}{' '}
                    {metric === 'jobs' ? 'jobs' : 'revenue'} · {selectedSourceLabel}
                  </p>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground shrink-0">
                  {toLocalDateKey(activeRange.startDate)} → {toLocalDateKey(activeRange.endDate)}
                </p>
              </div>

              {chartRows.length === 0 || filteredSummary.jobs === 0 ? (
                <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground bg-background/60">
                  No completed RO jobs for this selection.
                </div>
              ) : (
                <ChartContainer
                  config={chartConfig}
                  className="aspect-[5/4] sm:aspect-[16/10] md:aspect-[2.2/1] w-full min-h-[220px] sm:min-h-[280px] -mx-1 sm:mx-0"
                >
                  {focusingOneSource ? (
                    <BarChart data={chartRows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={6}
                        fontSize={isMobile ? 10 : 11}
                        interval={isMobile ? 'preserveStartEnd' : 0}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={metric === 'revenue' ? 52 : 36}
                        fontSize={11}
                        tickFormatter={(v) =>
                          metric === 'revenue'
                            ? formatInrCompact(Number(v)).replace('₹', '')
                            : String(v)
                        }
                      />
                      <ChartTooltip
                        content={({ active, payload: tipPayload, label }) => {
                          if (!active || !tipPayload?.length) return null;
                          const rows = tipPayload.filter((e) => Number(e.value) > 0);
                          if (!rows.length) return null;
                          return (
                            <div className="rounded-xl border bg-background/95 backdrop-blur px-3 py-2.5 shadow-lg text-xs min-w-[160px]">
                              <p className="font-semibold text-foreground mb-2">{label}</p>
                              {rows.map((entry) => (
                                <div
                                  key={String(entry.dataKey)}
                                  className="flex justify-between gap-4"
                                >
                                  <span className="text-muted-foreground">{entry.name}</span>
                                  <span className="font-medium tabular-nums">
                                    {metric === 'revenue'
                                      ? formatInrCompact(Number(entry.value) || 0)
                                      : Number(entry.value) || 0}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      {seriesMeta.keys.map((key, i) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          name={seriesMeta.labels[key] || key}
                          fill={leadSourceTrendColor(i)}
                          radius={[3, 3, 0, 0]}
                          maxBarSize={48}
                        />
                      ))}
                    </BarChart>
                  ) : (
                    <ReLineChart data={chartRows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={6}
                        fontSize={isMobile ? 10 : 11}
                        interval={isMobile ? 'preserveStartEnd' : 0}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={metric === 'revenue' ? 52 : 36}
                        fontSize={11}
                        tickFormatter={(v) =>
                          metric === 'revenue'
                            ? formatInrCompact(Number(v)).replace('₹', '')
                            : String(v)
                        }
                      />
                      <ChartTooltip
                        content={({ active, payload: tipPayload, label }) => {
                          if (!active || !tipPayload?.length) return null;
                          const rows = tipPayload
                            .filter((e) => Number(e.value) > 0)
                            .sort((a, b) => Number(b.value) - Number(a.value));
                          if (!rows.length) return null;
                          return (
                            <div className="rounded-xl border bg-background/95 backdrop-blur px-3 py-2.5 shadow-lg text-xs min-w-[180px]">
                              <p className="font-semibold text-foreground mb-2">{label}</p>
                              <div className="space-y-1.5">
                                {rows.map((entry) => (
                                  <div
                                    key={String(entry.dataKey)}
                                    className="flex items-center justify-between gap-4"
                                  >
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                      <span
                                        className="h-2 w-2 shrink-0 rounded-full"
                                        style={{ background: String(entry.color || '#0ea5e9') }}
                                      />
                                      {entry.name}
                                    </span>
                                    <span className="font-medium tabular-nums">
                                      {metric === 'revenue'
                                        ? formatInrCompact(Number(entry.value) || 0)
                                        : Number(entry.value) || 0}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {seriesMeta.keys.map((key, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={seriesMeta.labels[key] || key}
                          stroke={leadSourceTrendColor(i)}
                          strokeWidth={2.25}
                          dot={{ r: isMobile ? 2 : 3 }}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </ReLineChart>
                  )}
                </ChartContainer>
              )}

              <p className="text-[11px] text-muted-foreground mt-3">
                {filteredSummary.jobs} jobs · {formatInrCompact(filteredSummary.revenue)} ·{' '}
                {filteredSummary.sourceCount} source
                {filteredSummary.sourceCount === 1 ? '' : 's'}
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border -mx-1 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead source</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Avg bill</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSources.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No sources in this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSources.map((row) => {
                      const baseJobs = payload.summary.jobs || 1;
                      const share = Math.round((row.jobs / baseJobs) * 1000) / 10;
                      return (
                        <TableRow
                          key={row.key}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() =>
                            setLeadSourceKey((prev) => (prev === row.key ? ALL : row.key))
                          }
                        >
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.jobs}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700 whitespace-nowrap">
                            {formatInrCompact(row.revenue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums hidden sm:table-cell">
                            {formatInrCompact(row.avgBill || 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground hidden md:table-cell">
                            {share}%
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="months" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TrendFilterSelect
                label="Month A"
                value={monthA}
                onValueChange={setMonthA}
                options={(payload.monthCatalog || []).map((m) => ({
                  value: m.periodKey,
                  label: `${m.label} · ${m.jobs} jobs`,
                }))}
              />
              <TrendFilterSelect
                label="Month B"
                value={monthB}
                onValueChange={setMonthB}
                options={(payload.monthCatalog || []).map((m) => ({
                  value: m.periodKey,
                  label: `${m.label} · ${m.jobs} jobs`,
                }))}
              />
            </div>
            <div className="overflow-x-auto rounded-xl border -mx-1 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead source</TableHead>
                    <TableHead className="text-right">A jobs</TableHead>
                    <TableHead className="text-right">B jobs</TableHead>
                    <TableHead className="text-right">Δ jobs</TableHead>
                    <TableHead className="text-right">A revenue</TableHead>
                    <TableHead className="text-right">B revenue</TableHead>
                    <TableHead className="text-right">Δ revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthCompareRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Pick two months to compare.
                      </TableCell>
                    </TableRow>
                  ) : (
                    monthCompareRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.aJobs}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.bJobs}</TableCell>
                        <TableCell className="text-right">
                          <Delta value={row.jobsDelta} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">
                          {formatInrCompact(row.aRevenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">
                          {formatInrCompact(row.bRevenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Delta value={row.revenueDelta} suffix="₹" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="ranges" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border p-4 space-y-3 bg-muted/10">
                <p className="text-sm font-semibold">Range A</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Start</Label>
                    <DatePicker
                      value={rangeAStart}
                      onChange={(v) => v && setRangeAStart(v)}
                      placeholder="Start"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">End</Label>
                    <DatePicker
                      value={rangeAEnd}
                      onChange={(v) => v && setRangeAEnd(v)}
                      placeholder="End"
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border p-4 space-y-3 bg-muted/10">
                <p className="text-sm font-semibold">Range B</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Start</Label>
                    <DatePicker
                      value={rangeBStart}
                      onChange={(v) => v && setRangeBStart(v)}
                      placeholder="Start"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">End</Label>
                    <DatePicker
                      value={rangeBEnd}
                      onChange={(v) => v && setRangeBEnd(v)}
                      placeholder="End"
                    />
                  </div>
                </div>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void loadRangeCompare()}
              disabled={rangeLoading}
              className="gap-1.5"
            >
              {rangeLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <GitCompare className="w-3.5 h-3.5" />
              )}
              Compare ranges
            </Button>
            {(rangeA || rangeB) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TrendStatCard
                  title="Range A"
                  value={`${filterPayloadSources(rangeA)?.jobs ?? 0} jobs`}
                  sub={formatInrCompact(filterPayloadSources(rangeA)?.revenue ?? 0)}
                  icon={<LineChart className="w-4 h-4 text-orange-500" />}
                />
                <TrendStatCard
                  title="Range B"
                  value={`${filterPayloadSources(rangeB)?.jobs ?? 0} jobs`}
                  sub={formatInrCompact(filterPayloadSources(rangeB)?.revenue ?? 0)}
                  icon={<LineChart className="w-4 h-4 text-sky-600" />}
                />
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border -mx-1 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead source</TableHead>
                    <TableHead className="text-right">A jobs</TableHead>
                    <TableHead className="text-right">B jobs</TableHead>
                    <TableHead className="text-right">Δ jobs</TableHead>
                    <TableHead className="text-right">A revenue</TableHead>
                    <TableHead className="text-right">B revenue</TableHead>
                    <TableHead className="text-right">Δ revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rangeCompareRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Run compare to see lead-source deltas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rangeCompareRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.aJobs}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.bJobs}</TableCell>
                        <TableCell className="text-right">
                          <Delta value={row.jobsDelta} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">
                          {formatInrCompact(row.aRevenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">
                          {formatInrCompact(row.bRevenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Delta value={row.revenueDelta} suffix="₹" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
