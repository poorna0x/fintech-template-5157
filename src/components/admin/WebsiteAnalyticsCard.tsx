import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  MessageCircle,
  MousePointerClick,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { db } from '@/lib/supabase';
import { getPublicSiteLabel, type PublicSiteKey } from '@/lib/websiteSiteKey';
import { toast } from 'sonner';
import type { TrendPoint } from './WebsiteAnalyticsTrendChart';

const WebsiteAnalyticsTrendChart = lazy(() => import('./WebsiteAnalyticsTrendChart'));

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
type PeriodDays = 7 | 14 | 30 | 90;
type ChartMetric = 'visitors' | 'phone_clicks' | 'booking_submits';

const EMPTY_STATS: SiteDayStats = {
  site_key: 'hydrogenro',
  visitors: 0,
  page_views: 0,
  phone_clicks: 0,
  whatsapp_clicks: 0,
  booking_clicks: 0,
  booking_submits: 0,
};

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

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums leading-none">{value}</p>
          {hint ? <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function WebsiteAnalyticsCard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [siteFilter, setSiteFilter] = useState<SiteFilter>('all');
  const [periodDays, setPeriodDays] = useState<PeriodDays>(14);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('visitors');

  const load = useCallback(async (days: PeriodDays) => {
    setLoading(true);
    try {
      const { data, error } = await db.websiteAnalytics.getSummary(days);
      if (error) throw error;
      setSummary((data as Summary) || null);
    } catch (e) {
      console.error(e);
      toast.error('Could not load website analytics. Run scripts/add-website-analytics.sql in Supabase.');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(periodDays);
  }, [load, periodDays]);

  const filteredDaily = useMemo(() => {
    const rows = summary?.daily ?? [];
    if (siteFilter === 'all') return rows;
    return rows.filter((r) => r.site_key === siteFilter);
  }, [summary, siteFilter]);

  const periodTotals = useMemo(() => sumStats(filteredDaily), [filteredDaily]);

  const todayStats = useMemo(() => {
    const rows = summary?.today ?? [];
    if (siteFilter === 'all') return sumStats(rows);
    return rows.find((r) => r.site_key === siteFilter) ?? { ...EMPTY_STATS, site_key: siteFilter };
  }, [summary, siteFilter]);

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
    return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
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

  const siteLabel =
    siteFilter === 'all' ? 'Both sites' : getPublicSiteLabel(siteFilter);

  const hasData = (summary?.today?.length ?? 0) > 0 || (summary?.daily?.length ?? 0) > 0;

  return (
    <Card id="section-website-analytics">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <BarChart3 className="w-5 h-5" />
              Website analytics
            </CardTitle>
            <CardDescription className="text-sm mt-1 max-w-2xl">
              Visitors, calls, and bookings on hydrogenro.com and elevenro.com (IST). Call counts are
              button taps, not confirmed conversations.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void load(periodDays)}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-xs font-medium text-muted-foreground">Site</span>
            <Select value={siteFilter} onValueChange={(v) => setSiteFilter(v as SiteFilter)}>
              <SelectTrigger className="w-full sm:w-[200px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                <SelectItem value="hydrogenro">Hydrogen RO</SelectItem>
                <SelectItem value="elevenro">Eleven RO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-xs font-medium text-muted-foreground">Period</span>
            <ToggleGroup
              type="single"
              value={String(periodDays)}
              onValueChange={(v) => v && setPeriodDays(Number(v) as PeriodDays)}
              className="justify-start flex-wrap"
            >
              {([7, 14, 30, 90] as const).map((d) => (
                <ToggleGroupItem key={d} value={String(d)} className="h-8 px-3 text-xs">
                  {d}d
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-0 space-y-6">
        {loading && !summary ? (
          <p className="text-sm text-muted-foreground">Loading analytics…</p>
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground">
            No events yet. Data appears after visitors use the public websites.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Today</Badge>
                <span className="text-sm font-medium">{siteLabel}</span>
                <span className="text-xs text-muted-foreground">India Standard Time</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                <KpiCard label="Visitors" value={todayStats.visitors} icon={Users} />
                <KpiCard label="Page views" value={todayStats.page_views} icon={Eye} />
                <KpiCard label="Calls" value={todayStats.phone_clicks} icon={Phone} />
                <KpiCard label="WhatsApp" value={todayStats.whatsapp_clicks} icon={MessageCircle} />
                <KpiCard label="Book clicks" value={todayStats.booking_clicks} icon={MousePointerClick} />
                <KpiCard
                  label="Bookings"
                  value={todayStats.booking_submits}
                  icon={CheckCircle2}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium">
                    Last {periodDays} days — {siteLabel}
                  </h4>
                </div>
                <ToggleGroup
                  type="single"
                  value={chartMetric}
                  onValueChange={(v) => v && setChartMetric(v as ChartMetric)}
                  className="justify-start"
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

              <Suspense
                fallback={
                  <div className="h-52 rounded-lg border border-dashed border-border animate-pulse bg-muted/30" />
                }
              >
                <WebsiteAnalyticsTrendChart data={chartData} metric={chartMetric} />
              </Suspense>

              <p className="text-xs text-muted-foreground">
                Period total: {periodTotals.visitors} visitors · {periodTotals.phone_clicks} call taps
                ({pct(periodTotals.phone_clicks, periodTotals.visitors)} of visitors) ·{' '}
                {periodTotals.booking_submits} completed bookings (
                {pct(periodTotals.booking_submits, periodTotals.visitors)} of visitors)
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Daily breakdown</h4>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Date</TableHead>
                      {siteFilter === 'all' ? <TableHead>Site</TableHead> : null}
                      <TableHead className="text-right">Visitors</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">WhatsApp</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Book clicks</TableHead>
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
                          <TableCell className="text-right tabular-nums hidden sm:table-cell">
                            {row.whatsapp_clicks}
                          </TableCell>
                          <TableCell className="text-right tabular-nums hidden md:table-cell">
                            {row.booking_clicks}
                          </TableCell>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
