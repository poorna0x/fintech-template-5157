/**
 * Lead-source performance trend — mappers + period formatting for Analytics.
 * Data from get_analytics_lead_source_trend (completed jobs by resolved lead_source).
 */

export type LeadSourceTrendMetric = 'jobs' | 'revenue';

export type LeadSourceTrendSourceRow = {
  key: string;
  label: string;
  jobs: number;
  revenue: number;
  avgBill?: number;
};

export type LeadSourceTrendPeriodRow = {
  periodKey: string;
  label: string;
  jobs: number;
  revenue: number;
  sources: LeadSourceTrendSourceRow[];
};

export type LeadSourceTrendPayload = {
  granularity: 'month' | 'week' | 'day';
  summary: { jobs: number; revenue: number; sourceCount: number };
  sources: LeadSourceTrendSourceRow[];
  periods: LeadSourceTrendPeriodRow[];
  monthCatalog: LeadSourceTrendPeriodRow[];
};

/** Stable palette for stacked bars (avoid purple / cream AI defaults). */
export const LEAD_SOURCE_TREND_COLORS = [
  '#0ea5e9', // sky
  '#16a34a', // green
  '#ea580c', // orange
  '#0891b2', // cyan
  '#ca8a04', // yellow
  '#dc2626', // red
  '#4f46e5', // indigo
  '#64748b', // slate
  '#db2777', // pink
  '#65a30d', // lime
] as const;

export function leadSourceTrendColor(index: number): string {
  return LEAD_SOURCE_TREND_COLORS[index % LEAD_SOURCE_TREND_COLORS.length];
}

export function formatLeadSourceTrendPeriodLabel(
  periodKey: string,
  granularity: 'month' | 'week' | 'day'
): string {
  if (granularity === 'day' || /^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
    const d = new Date(periodKey + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return periodKey;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  if (granularity === 'week' || /^\d{4}-W\d{1,2}$/i.test(periodKey)) {
    const match = periodKey.match(/^(\d{4})-W(\d{1,2})$/i);
    if (!match) return periodKey;
    return `W${Number(match[2])} ${match[1]}`;
  }
  const [y, m] = periodKey.split('-').map(Number);
  if (!y || !m) return periodKey;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function mapSource(raw: any): LeadSourceTrendSourceRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = String(raw.key || '').trim();
  const label = String(raw.label || key || 'Unknown').trim() || 'Unknown';
  if (!key && !label) return null;
  const jobs = Number(raw.jobs) || 0;
  const revenue = Number(raw.revenue) || 0;
  const avgBill =
    raw.avg_bill != null
      ? Number(raw.avg_bill) || 0
      : jobs > 0
        ? revenue / jobs
        : 0;
  return { key: key || label, label, jobs, revenue, avgBill };
}

function mapPeriod(
  raw: any,
  granularity: 'month' | 'week' | 'day'
): LeadSourceTrendPeriodRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const periodKey = String(raw.period_key || '').trim();
  if (!periodKey) return null;
  const sources = Array.isArray(raw.sources)
    ? (raw.sources.map(mapSource).filter(Boolean) as LeadSourceTrendSourceRow[])
    : [];
  return {
    periodKey,
    label: formatLeadSourceTrendPeriodLabel(periodKey, granularity),
    jobs: Number(raw.jobs) || 0,
    revenue: Number(raw.revenue) || 0,
    sources,
  };
}

export function parseLeadSourceTrendRpc(data: unknown): LeadSourceTrendPayload | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const granRaw = String(root.granularity || 'month').toLowerCase();
  const granularity: 'month' | 'week' | 'day' =
    granRaw === 'day' || granRaw === 'week' ? granRaw : 'month';
  const summaryRaw = (root.summary && typeof root.summary === 'object'
    ? root.summary
    : {}) as Record<string, unknown>;
  const sources = Array.isArray(root.sources)
    ? (root.sources.map(mapSource).filter(Boolean) as LeadSourceTrendSourceRow[])
    : [];
  const periods = Array.isArray(root.periods)
    ? (root.periods.map((p) => mapPeriod(p, granularity)).filter(Boolean) as LeadSourceTrendPeriodRow[])
    : [];
  const monthCatalog = Array.isArray(root.month_catalog)
    ? (root.month_catalog
        .map((p) => mapPeriod(p, 'month'))
        .filter(Boolean) as LeadSourceTrendPeriodRow[])
    : [];

  return {
    granularity,
    summary: {
      jobs: Number(summaryRaw.jobs) || 0,
      revenue: Number(summaryRaw.revenue) || 0,
      sourceCount: Number(summaryRaw.source_count) || sources.length,
    },
    sources,
    periods,
    monthCatalog,
  };
}

/** Top N sources by revenue; rest collapsed into Other for chart series. */
export function pickLeadSourceTrendSeriesKeys(
  sources: LeadSourceTrendSourceRow[],
  maxSeries = 8
): { keys: string[]; labels: Record<string, string>; otherKey: string | null } {
  const sorted = [...sources].sort(
    (a, b) => b.revenue - a.revenue || b.jobs - a.jobs || a.label.localeCompare(b.label)
  );
  if (sorted.length <= maxSeries) {
    return {
      keys: sorted.map((s) => s.key),
      labels: Object.fromEntries(sorted.map((s) => [s.key, s.label])),
      otherKey: null,
    };
  }
  const top = sorted.slice(0, maxSeries - 1);
  const otherKey = '__other__';
  return {
    keys: [...top.map((s) => s.key), otherKey],
    labels: {
      ...Object.fromEntries(top.map((s) => [s.key, s.label])),
      [otherKey]: 'Other',
    },
    otherKey,
  };
}

export type LeadSourceTrendChartRow = {
  periodKey: string;
  label: string;
  total: number;
  [sourceKey: string]: string | number;
};

export function buildLeadSourceTrendChartRows(
  periods: LeadSourceTrendPeriodRow[],
  seriesKeys: string[],
  otherKey: string | null,
  metric: LeadSourceTrendMetric
): LeadSourceTrendChartRow[] {
  const keySet = new Set(seriesKeys.filter((k) => k !== otherKey));
  return periods.map((p) => {
    const row: LeadSourceTrendChartRow = {
      periodKey: p.periodKey,
      label: p.label,
      total: metric === 'jobs' ? p.jobs : p.revenue,
    };
    for (const k of seriesKeys) row[k] = 0;
    let other = 0;
    for (const s of p.sources) {
      const val = metric === 'jobs' ? s.jobs : s.revenue;
      if (keySet.has(s.key)) {
        row[s.key] = (Number(row[s.key]) || 0) + val;
      } else if (otherKey) {
        other += val;
      }
    }
    if (otherKey) row[otherKey] = other;
    return row;
  });
}

export function compareLeadSourceMonths(
  a: LeadSourceTrendPeriodRow | null,
  b: LeadSourceTrendPeriodRow | null
): Array<{
  key: string;
  label: string;
  aJobs: number;
  bJobs: number;
  aRevenue: number;
  bRevenue: number;
  jobsDelta: number;
  revenueDelta: number;
}> {
  const map = new Map<
    string,
    { label: string; aJobs: number; bJobs: number; aRevenue: number; bRevenue: number }
  >();
  const bump = (
    sources: LeadSourceTrendSourceRow[],
    side: 'a' | 'b'
  ) => {
    for (const s of sources) {
      const cur = map.get(s.key) || {
        label: s.label,
        aJobs: 0,
        bJobs: 0,
        aRevenue: 0,
        bRevenue: 0,
      };
      if (side === 'a') {
        cur.aJobs += s.jobs;
        cur.aRevenue += s.revenue;
      } else {
        cur.bJobs += s.jobs;
        cur.bRevenue += s.revenue;
      }
      if (!cur.label) cur.label = s.label;
      map.set(s.key, cur);
    }
  };
  if (a) bump(a.sources, 'a');
  if (b) bump(b.sources, 'b');
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      aJobs: v.aJobs,
      bJobs: v.bJobs,
      aRevenue: v.aRevenue,
      bRevenue: v.bRevenue,
      jobsDelta: v.aJobs - v.bJobs,
      revenueDelta: v.aRevenue - v.bRevenue,
    }))
    .sort((x, y) => y.aRevenue + y.bRevenue - (x.aRevenue + x.bRevenue));
}

export function formatInrCompact(n: number): string {
  if (!Number.isFinite(n)) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
