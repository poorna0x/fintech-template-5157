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
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  GitCompare,
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
        <Minus className="h-3 w-3" />
        0{suffix === '₹' ? '' : suffix}
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
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? '+' : ''}
      {suffix === '₹' ? formatInrCompact(value) : `${value}${suffix}`}
    </span>
  );
}

function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5 min-w-0', className)}>
      <Label className="text-[11px] font-medium text-slate-500">{label}</Label>
      {children}
    </div>
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

  const rangeLabel = useMemo(() => {
    const a = toLocalDateKey(activeRange.startDate);
    const b = toLocalDateKey(activeRange.endDate);
    const fmt = (key: string) => {
      const d = parseLocalDateKey(key);
      if (!d) return key;
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    return `${fmt(a)} – ${fmt(b)}`;
  }, [activeRange]);

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

  const granularity = useMemo(() => {
    if (granularityOverride !== 'auto') return granularityOverride;
    return pickTrendGranularity(activeRange.startDate, activeRange.endDate);
  }, [granularityOverride, activeRange]);

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
    return pickLeadSourceTrendSeriesKeys(filteredSources, 8);
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

  return (
    <div className="space-y-4 min-w-0">
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-3 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">RO · both brands</p>
            <p className="text-xs text-slate-500 truncate">{rangeLabel}</p>
          </div>
          {loading ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating…
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <FilterField label="Timeline">
            <Select
              value={timelinePreset}
              onValueChange={(v) => setTimelinePreset(v as TrendTimelinePreset)}
            >
              <SelectTrigger className="h-9 bg-white border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="custom_month">Custom month</SelectItem>
                <SelectItem value="6m">Last 6 months</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
                <SelectItem value="24m">Last 24 months</SelectItem>
                <SelectItem value="ytd">Year to date</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          {timelinePreset === 'custom_month' ? (
            <FilterField label="Month">
              <Input
                type="month"
                value={customMonth}
                onChange={(e) => setCustomMonth(e.target.value)}
                max={toLocalDateKey(new Date()).slice(0, 7)}
                className="h-9 bg-white border-slate-200"
              />
            </FilterField>
          ) : null}

          {timelinePreset === 'custom' ? (
            <>
              <FilterField label="From">
                <DatePicker
                  value={customStart}
                  onChange={(v) => setCustomStart(v || '')}
                  placeholder="Start"
                  className="h-9 w-full bg-white"
                />
              </FilterField>
              <FilterField label="To">
                <DatePicker
                  value={customEnd}
                  onChange={(v) => setCustomEnd(v || '')}
                  placeholder="End"
                  className="h-9 w-full bg-white"
                />
              </FilterField>
            </>
          ) : null}

          <FilterField label="Lead source">
            <Select value={leadSourceKey} onValueChange={setLeadSourceKey}>
              <SelectTrigger className="h-9 bg-white border-slate-200">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sources</SelectItem>
                {(payload?.sources || []).map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Metric">
            <Select value={metric} onValueChange={(v) => setMetric(v as LeadSourceTrendMetric)}>
              <SelectTrigger className="h-9 bg-white border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jobs">Jobs</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Buckets">
            <Select
              value={granularityOverride}
              onValueChange={(v) => setGranularityOverride(v as typeof granularityOverride)}
            >
              <SelectTrigger className="h-9 bg-white border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="day">Day</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      </div>

      {loading && !payload ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading lead-source trend…
        </div>
      ) : !payload ? (
        <p className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-lg">
          No lead-source trend data for this period.
        </p>
      ) : (
        <Tabs defaultValue="timeline" className="space-y-3">
          <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-slate-100/80">
            <TabsTrigger value="timeline" className="gap-1 text-xs sm:text-sm">
              <TrendingUp className="h-3.5 w-3.5" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="months" className="gap-1 text-xs sm:text-sm">
              <GitCompare className="h-3.5 w-3.5" />
              Compare months
            </TabsTrigger>
            <TabsTrigger value="ranges" className="gap-1 text-xs sm:text-sm">
              <GitCompare className="h-3.5 w-3.5" />
              Compare ranges
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {glanceCards.map((card) => {
                const active =
                  leadSourceKey === ALL || card.keys.some((k) => k === leadSourceKey);
                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => {
                      if (card.keys.length === 1) {
                        setLeadSourceKey((prev) =>
                          prev === card.keys[0] ? ALL : card.keys[0]
                        );
                      } else if (card.keys.length > 1) {
                        setLeadSourceKey((prev) =>
                          card.keys.includes(prev) ? ALL : card.keys[0]
                        );
                      }
                    }}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 space-y-0.5 text-left transition-colors',
                      active
                        ? 'border-sky-200 bg-sky-50/60 shadow-sm'
                        : 'border-slate-200/80 bg-white opacity-55 hover:opacity-80'
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      {card.icon ? <card.icon className="h-3 w-3" /> : null}
                      {card.title}
                    </div>
                    <div className="text-base font-semibold tabular-nums text-slate-900">
                      {card.jobs} jobs
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {formatInrCompact(card.revenue)}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 sm:p-3 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2 px-1">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {metric === 'jobs' ? 'Jobs' : 'Revenue'} · {selectedSourceLabel}
                  </p>
                  <p className="text-xs text-slate-500">
                    {filteredSummary.jobs} jobs · {formatInrCompact(filteredSummary.revenue)} ·{' '}
                    {granularity} buckets
                  </p>
                </div>
              </div>
              {chartRows.length === 0 || filteredSummary.jobs === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No completed RO jobs for this selection.
                </p>
              ) : (
                <ChartContainer config={chartConfig} className="h-[280px] w-full aspect-auto">
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
                        return (
                          <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md space-y-1">
                            <div className="font-medium">{label}</div>
                            {tipPayload.map((entry) => (
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
                    {leadSourceKey === ALL ? (
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    ) : null}
                    {seriesMeta.keys.map((key, i) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        name={seriesMeta.labels[key] || key}
                        stackId={leadSourceKey === ALL ? 'lead' : undefined}
                        fill={leadSourceTrendColor(i)}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={leadSourceKey === ALL ? 36 : 48}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              )}
            </div>

            <div className="rounded-xl border border-slate-200/80 overflow-x-auto bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Lead source</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg bill</TableHead>
                    <TableHead className="text-right">Share</TableHead>
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
                          className="cursor-pointer hover:bg-sky-50/50"
                          onClick={() =>
                            setLeadSourceKey((prev) => (prev === row.key ? ALL : row.key))
                          }
                        >
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.jobs}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatInrCompact(row.revenue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatInrCompact(row.avgBill || 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
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

          <TabsContent value="months" className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <FilterField label="Month A" className="flex-1">
                <Select value={monthA} onValueChange={setMonthA}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="Pick month" />
                  </SelectTrigger>
                  <SelectContent>
                    {(payload.monthCatalog || []).map((m) => (
                      <SelectItem key={m.periodKey} value={m.periodKey}>
                        {m.label} · {m.jobs} jobs
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Month B" className="flex-1">
                <Select value={monthB} onValueChange={setMonthB}>
                  <SelectTrigger className="h-9 bg-white">
                    <SelectValue placeholder="Pick month" />
                  </SelectTrigger>
                  <SelectContent>
                    {(payload.monthCatalog || []).map((m) => (
                      <SelectItem key={m.periodKey} value={m.periodKey}>
                        {m.label} · {m.jobs} jobs
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </div>
            <div className="rounded-xl border overflow-x-auto bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
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
                        <TableCell className="text-right tabular-nums">
                          {formatInrCompact(row.aRevenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
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

          <TabsContent value="ranges" className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border bg-white p-3 space-y-2 shadow-sm">
                <p className="text-xs font-medium text-slate-500">Range A</p>
                <div className="flex gap-2">
                  <DatePicker
                    value={rangeAStart}
                    onChange={(v) => setRangeAStart(v || '')}
                    className="h-9 flex-1"
                    placeholder="Start"
                  />
                  <DatePicker
                    value={rangeAEnd}
                    onChange={(v) => setRangeAEnd(v || '')}
                    className="h-9 flex-1"
                    placeholder="End"
                  />
                </div>
              </div>
              <div className="rounded-xl border bg-white p-3 space-y-2 shadow-sm">
                <p className="text-xs font-medium text-slate-500">Range B</p>
                <div className="flex gap-2">
                  <DatePicker
                    value={rangeBStart}
                    onChange={(v) => setRangeBStart(v || '')}
                    className="h-9 flex-1"
                    placeholder="Start"
                  />
                  <DatePicker
                    value={rangeBEnd}
                    onChange={(v) => setRangeBEnd(v || '')}
                    className="h-9 flex-1"
                    placeholder="End"
                  />
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
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitCompare className="h-3.5 w-3.5" />
              )}
              Compare ranges
            </Button>
            {(rangeA || rangeB) && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border px-3 py-2 bg-white shadow-sm">
                  <div className="text-xs text-muted-foreground">Range A</div>
                  <div className="font-semibold tabular-nums">
                    {filterPayloadSources(rangeA)?.jobs ?? 0} jobs
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatInrCompact(filterPayloadSources(rangeA)?.revenue ?? 0)}
                  </div>
                </div>
                <div className="rounded-xl border px-3 py-2 bg-white shadow-sm">
                  <div className="text-xs text-muted-foreground">Range B</div>
                  <div className="font-semibold tabular-nums">
                    {filterPayloadSources(rangeB)?.jobs ?? 0} jobs
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatInrCompact(filterPayloadSources(rangeB)?.revenue ?? 0)}
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-xl border overflow-x-auto bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
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
                        <TableCell className="text-right tabular-nums">
                          {formatInrCompact(row.aRevenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
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
