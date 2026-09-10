import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
  RefreshCw,
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
const PREFS_KEY = 'hydrogenro-analytics-lead-source-trend-prefs';
const CACHE_TTL_MS = 5 * 60 * 1000;

type Prefs = {
  timelinePreset: TrendTimelinePreset;
  customMonth: string;
  customStart: string;
  customEnd: string;
  serviceBrand: string;
  serviceType: string;
  metric: LeadSourceTrendMetric;
};

const cache = new Map<string, { at: number; payload: LeadSourceTrendPayload }>();

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
        <Minus className="h-3 w-3" />0{suffix}
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

type AnalyticsLeadSourceTrendProps = {
  initialRange?: { startDate: Date | null; endDate: Date | null };
};

export function AnalyticsLeadSourceTrend({ initialRange }: AnalyticsLeadSourceTrendProps) {
  const isMobile = useIsMobile();
  const [prefsReady, setPrefsReady] = useState(false);
  const [timelinePreset, setTimelinePreset] = useState<TrendTimelinePreset>('12m');
  const [customMonth, setCustomMonth] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [serviceBrand, setServiceBrand] = useState(ALL);
  const [serviceType, setServiceType] = useState(ALL);
  const [metric, setMetric] = useState<LeadSourceTrendMetric>('jobs');
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
      return resolveTrendTimelineRange('custom_month', undefined, undefined, customMonth || undefined);
    }
    if (timelinePreset === 'custom' && customStart && customEnd) {
      return resolveTrendTimelineRange('custom', customStart, customEnd);
    }
    return resolveTrendTimelineRange(timelinePreset);
  }, [timelinePreset, customMonth, customStart, customEnd]);

  useEffect(() => {
    const saved = loadPrefs();
    if (saved) {
      setTimelinePreset(saved.timelinePreset || '12m');
      setCustomMonth(saved.customMonth || '');
      setCustomStart(saved.customStart || '');
      setCustomEnd(saved.customEnd || '');
      setServiceBrand(saved.serviceBrand || ALL);
      setServiceType(saved.serviceType || ALL);
      setMetric(saved.metric === 'revenue' ? 'revenue' : 'jobs');
    } else if (initialRange?.startDate && initialRange?.endDate) {
      setTimelinePreset('custom');
      setCustomStart(initialRange.startDate.toISOString().slice(0, 10));
      setCustomEnd(initialRange.endDate.toISOString().slice(0, 10));
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
      serviceBrand,
      serviceType,
      metric,
    });
  }, [
    prefsReady,
    timelinePreset,
    customMonth,
    customStart,
    customEnd,
    serviceBrand,
    serviceType,
    metric,
  ]);

  const granularity = useMemo(() => {
    if (granularityOverride !== 'auto') return granularityOverride;
    return pickTrendGranularity(activeRange.startDate, activeRange.endDate);
  }, [granularityOverride, activeRange]);

  const fetchTrend = useCallback(
    async (force = false) => {
      const brand = serviceBrand === ALL ? null : serviceBrand;
      const st = serviceType === ALL ? null : serviceType;
      const cacheKey = [
        activeRange.startDate.toISOString(),
        activeRange.endDate.toISOString(),
        granularity,
        brand || '',
        st || '',
      ].join('|');
      if (!force) {
        const hit = cache.get(cacheKey);
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
          setPayload(hit.payload);
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      try {
        const { data, error } = await db.analyticsPaginated.getLeadSourceTrend({
          startDate: activeRange.startDate,
          endDate: activeRange.endDate,
          granularity,
          serviceBrand: brand,
          serviceType: st,
        });
        if (error) throw error;
        const parsed = parseLeadSourceTrendRpc(data);
        if (!parsed) throw new Error('Empty lead-source trend response');
        cache.set(cacheKey, { at: Date.now(), payload: parsed });
        setPayload(parsed);
        setMonthA((prev) => prev || parsed.monthCatalog[0]?.periodKey || '');
        setMonthB((prev) => prev || parsed.monthCatalog[1]?.periodKey || '');
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
    },
    [activeRange, granularity, serviceBrand, serviceType]
  );

  useEffect(() => {
    if (!prefsReady) return;
    void fetchTrend();
  }, [prefsReady, fetchTrend]);

  const seriesMeta = useMemo(
    () => pickLeadSourceTrendSeriesKeys(payload?.sources || [], 8),
    [payload?.sources]
  );

  const chartRows = useMemo(
    () =>
      buildLeadSourceTrendChartRows(
        payload?.periods || [],
        seriesMeta.keys,
        seriesMeta.otherKey,
        metric
      ),
    [payload?.periods, seriesMeta, metric]
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

  const catalogByKey = useMemo(() => {
    const m = new Map<string, LeadSourceTrendPeriodRow>();
    for (const row of payload?.monthCatalog || []) m.set(row.periodKey, row);
    return m;
  }, [payload?.monthCatalog]);

  const monthCompareRows = useMemo(
    () => compareLeadSourceMonths(catalogByKey.get(monthA) || null, catalogByKey.get(monthB) || null),
    [catalogByKey, monthA, monthB]
  );

  const loadRangeCompare = useCallback(async () => {
    if (!rangeAStart || !rangeAEnd || !rangeBStart || !rangeBEnd) {
      toast.error('Pick both date ranges.');
      return;
    }
    const aStart = new Date(rangeAStart + 'T00:00:00');
    const aEnd = new Date(rangeAEnd + 'T23:59:59.999');
    const bStart = new Date(rangeBStart + 'T00:00:00');
    const bEnd = new Date(rangeBEnd + 'T23:59:59.999');
    if (Number.isNaN(aStart.getTime()) || Number.isNaN(aEnd.getTime()) || Number.isNaN(bStart.getTime()) || Number.isNaN(bEnd.getTime())) {
      toast.error('Invalid dates.');
      return;
    }
    setRangeLoading(true);
    const brand = serviceBrand === ALL ? null : serviceBrand;
    const st = serviceType === ALL ? null : serviceType;
    try {
      const granA = pickTrendGranularity(aStart, aEnd);
      const granB = pickTrendGranularity(bStart, bEnd);
      const [resA, resB] = await Promise.all([
        db.analyticsPaginated.getLeadSourceTrend({
          startDate: aStart,
          endDate: aEnd,
          granularity: granA,
          serviceBrand: brand,
          serviceType: st,
        }),
        db.analyticsPaginated.getLeadSourceTrend({
          startDate: bStart,
          endDate: bEnd,
          granularity: granB,
          serviceBrand: brand,
          serviceType: st,
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
  }, [rangeAStart, rangeAEnd, rangeBStart, rangeBEnd, serviceBrand, serviceType]);

  const rangeCompareRows = useMemo(() => {
    const fakeA: LeadSourceTrendPeriodRow | null = rangeA
      ? {
          periodKey: 'a',
          label: 'A',
          jobs: rangeA.summary.jobs,
          revenue: rangeA.summary.revenue,
          sources: rangeA.sources,
        }
      : null;
    const fakeB: LeadSourceTrendPeriodRow | null = rangeB
      ? {
          periodKey: 'b',
          label: 'B',
          jobs: rangeB.summary.jobs,
          revenue: rangeB.summary.revenue,
          sources: rangeB.sources,
        }
      : null;
    return compareLeadSourceMonths(fakeA, fakeB);
  }, [rangeA, rangeB]);

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
    });
    return [
      { title: 'Direct call', icon: Phone, ...sum(direct) },
      { title: 'Website (HydrogenRO)', ...sum(webHro) },
      { title: 'Website (ElevenRO)', ...sum(webEro) },
      { title: 'Google-Leads', ...sum(google) },
    ];
  }, [payload?.sources]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1 min-w-[9rem]">
          <Label className="text-xs text-muted-foreground">Timeline</Label>
          <Select
            value={timelinePreset}
            onValueChange={(v) => setTimelinePreset(v as TrendTimelinePreset)}
          >
            <SelectTrigger className="h-9">
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
        </div>
        {timelinePreset === 'custom_month' ? (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Month</Label>
            <input
              type="month"
              className="h-9 rounded-md border px-2 text-sm bg-background"
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value)}
            />
          </div>
        ) : null}
        {timelinePreset === 'custom' ? (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <DatePicker
                value={customStart}
                onChange={(v) => setCustomStart(v || '')}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <DatePicker value={customEnd} onChange={(v) => setCustomEnd(v || '')} className="h-9" />
            </div>
          </>
        ) : null}
        <div className="space-y-1 min-w-[8.5rem]">
          <Label className="text-xs text-muted-foreground">Company brand</Label>
          <Select value={serviceBrand} onValueChange={setServiceBrand}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="hydrogenro">HydrogenRO</SelectItem>
              <SelectItem value="elevenro">ElevenRO</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-[8rem]">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="RO">RO</SelectItem>
              <SelectItem value="SOFTENER">Softener</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-[7.5rem]">
          <Label className="text-xs text-muted-foreground">Metric</Label>
          <Select value={metric} onValueChange={(v) => setMetric(v as LeadSourceTrendMetric)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jobs">Jobs</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-[7.5rem]">
          <Label className="text-xs text-muted-foreground">Buckets</Label>
          <Select
            value={granularityOverride}
            onValueChange={(v) => setGranularityOverride(v as typeof granularityOverride)}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="day">Day</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => {
            cache.clear();
            void fetchTrend(true);
          }}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
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
          <TabsList className="grid w-full grid-cols-3 h-auto">
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
              {glanceCards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-lg border bg-card px-3 py-2.5 space-y-0.5"
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {card.icon ? <card.icon className="h-3 w-3" /> : null}
                    {card.title}
                  </div>
                  <div className="text-base font-semibold tabular-nums">{card.jobs} jobs</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatInrCompact(card.revenue)}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-card p-2 sm:p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2 px-1">
                <div>
                  <p className="text-sm font-medium">
                    {metric === 'jobs' ? 'Jobs' : 'Revenue'} by lead source
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {payload.summary.jobs} jobs · {formatInrCompact(payload.summary.revenue)} ·{' '}
                    {payload.summary.sourceCount} sources · {granularity} buckets
                  </p>
                </div>
              </div>
              {chartRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No completed jobs.</p>
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
                        metric === 'revenue' ? formatInrCompact(Number(v)).replace('₹', '') : String(v)
                      }
                    />
                    <ChartTooltip
                      content={({ active, payload: tipPayload, label }) => {
                        if (!active || !tipPayload?.length) return null;
                        return (
                          <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md space-y-1">
                            <div className="font-medium">{label}</div>
                            {tipPayload.map((entry) => (
                              <div key={String(entry.dataKey)} className="flex justify-between gap-4">
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
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {seriesMeta.keys.map((key, i) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        name={seriesMeta.labels[key] || key}
                        stackId="lead"
                        fill={leadSourceTrendColor(i)}
                        radius={i === seriesMeta.keys.length - 1 ? [2, 2, 0, 0] : 0}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              )}
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead source</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg bill</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payload.sources || []).map((row) => {
                    const share =
                      payload.summary.jobs > 0
                        ? Math.round((row.jobs / payload.summary.jobs) * 1000) / 10
                        : 0;
                    return (
                      <TableRow key={row.key}>
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
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="months" className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="space-y-1 flex-1">
                <Label className="text-xs text-muted-foreground">Month A</Label>
                <Select value={monthA} onValueChange={setMonthA}>
                  <SelectTrigger className="h-9">
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
              </div>
              <div className="space-y-1 flex-1">
                <Label className="text-xs text-muted-foreground">Month B</Label>
                <Select value={monthB} onValueChange={setMonthB}>
                  <SelectTrigger className="h-9">
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
              </div>
            </div>
            <div className="rounded-lg border overflow-x-auto">
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
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Range A</p>
                <div className="flex gap-2">
                  <DatePicker
                    value={rangeAStart}
                    onChange={(v) => setRangeAStart(v || '')}
                    className="h-9 flex-1"
                  />
                  <DatePicker
                    value={rangeAEnd}
                    onChange={(v) => setRangeAEnd(v || '')}
                    className="h-9 flex-1"
                  />
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Range B</p>
                <div className="flex gap-2">
                  <DatePicker
                    value={rangeBStart}
                    onChange={(v) => setRangeBStart(v || '')}
                    className="h-9 flex-1"
                  />
                  <DatePicker
                    value={rangeBEnd}
                    onChange={(v) => setRangeBEnd(v || '')}
                    className="h-9 flex-1"
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
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-xs text-muted-foreground">Range A</div>
                  <div className="font-semibold tabular-nums">{rangeA?.summary.jobs ?? 0} jobs</div>
                  <div className="text-xs text-muted-foreground">
                    {formatInrCompact(rangeA?.summary.revenue ?? 0)}
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-xs text-muted-foreground">Range B</div>
                  <div className="font-semibold tabular-nums">{rangeB?.summary.jobs ?? 0} jobs</div>
                  <div className="text-xs text-muted-foreground">
                    {formatInrCompact(rangeB?.summary.revenue ?? 0)}
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-lg border overflow-x-auto">
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
