/** Types + mappers for `get_analytics_dashboard` RPC (admin-only, SECURITY DEFINER). */

export type AnalyticsDashboardRpc = {
  period_job_count: number;
  status_counts: {
    completed: number;
    denied: number;
    pending: number;
    assigned: number;
    in_progress: number;
  };
  completed_in_period_count: number;
  billing_total: number;
  billing_average: number;
  total_spare_parts_cost: number;
  lead_source_breakdown: Array<{
    normalized_key: string;
    display_name: string;
    count: number;
    amount: number;
    lead_cost: number;
    spare_cost: number;
    service_types: Array<{ service_type: string; count: number; amount: number }>;
  }>;
  service_type_breakdown: Array<{ service_type: string; count: number; amount: number }>;
  payment_method_breakdown: Array<{ method: string; count: number; amount: number }>;
  daily_stats: Array<{ date: string; jobs: number; revenue: number }>;
  technician_stats: Array<{
    technician_id: string;
    total_jobs: number;
    completed_jobs: number;
    period_earnings: number;
    service_types: Array<{ service_type: string; count: number; amount: number }>;
  }>;
  softener: {
    period_job_count: number;
    status_counts: AnalyticsDashboardRpc['status_counts'];
    completed_in_period_count: number;
    billing_total: number;
    billing_average: number;
    service_type_breakdown: AnalyticsDashboardRpc['service_type_breakdown'];
    payment_method_breakdown: AnalyticsDashboardRpc['payment_method_breakdown'];
    daily_stats: AnalyticsDashboardRpc['daily_stats'];
    technician_stats: Array<{
      technician_id: string;
      total_jobs: number;
      completed_jobs: number;
      period_earnings: number;
    }>;
  };
};

const CANONICAL_LEAD_NAMES: Record<string, string> = {
  website: 'Website',
  directcall: 'Direct call',
  rocareindia: 'RO care india',
  hometriangle: 'Home Triangle',
  'hometriangle-srujan': 'Home Triangle-Srujan',
  hometrianglesrujan: 'Home Triangle-Srujan',
  'hometriangle-3': 'Home Triangle-3',
  hometriangle3: 'Home Triangle-3',
  localramu: 'Local Ramu',
  admincreated: 'Admin Created',
  unknown: 'Direct call',
  other: 'Other',
};

export function normalizeLeadSourceKey(source: string): string {
  if (!source) return 'unknown';
  return source
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w]/g, '')
    .trim();
}

export function getCanonicalLeadDisplayName(normalizedKey: string, originalSource: string): string {
  if (CANONICAL_LEAD_NAMES[normalizedKey]) return CANONICAL_LEAD_NAMES[normalizedKey];
  const words = originalSource.trim().split(/\s+/);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export function mapLeadSourceBreakdownFromDashboard(
  rows: AnalyticsDashboardRpc['lead_source_breakdown']
): Array<{
  leadType: string;
  count: number;
  amount: number;
  leadCost: number;
  spareCost: number;
  serviceTypes: Array<{ serviceType: string; count: number; amount: number }>;
}> {
  return rows.map((row) => {
    const key = row.normalized_key || normalizeLeadSourceKey(row.display_name);
    const leadType = getCanonicalLeadDisplayName(key, row.display_name || 'Direct call');
    return {
      leadType,
      count: Number(row.count) || 0,
      amount: Number(row.amount) || 0,
      leadCost: Number(row.lead_cost) || 0,
      spareCost: Number(row.spare_cost) || 0,
      serviceTypes: (row.service_types || []).map((st) => ({
        serviceType: st.service_type,
        count: Number(st.count) || 0,
        amount: Number(st.amount) || 0,
      })),
    };
  });
}

export function mapTechnicianStatsFromDashboard(
  rows: AnalyticsDashboardRpc['technician_stats'],
  technicians: Array<{ id: string; full_name?: string; account_status?: string }>
): Array<{
  id: string;
  name: string;
  totalJobs: number;
  completedJobs: number;
  periodEarnings: number;
  returnComplaints: number;
  serviceTypeBreakdown: Array<{ serviceType: string; count: number; amount: number }>;
}> {
  return rows.map((row) => {
    const tech = technicians.find((t) => t.id === row.technician_id);
    const inactive = tech?.account_status === 'INACTIVE' ? ' (Inactive)' : '';
    return {
      id: row.technician_id,
      name: `${tech?.full_name || 'Unknown'}${inactive}`,
      totalJobs: Number(row.total_jobs) || 0,
      completedJobs: Number(row.completed_jobs) || 0,
      periodEarnings: Number(row.period_earnings) || 0,
      returnComplaints: 0,
      serviceTypeBreakdown: (row.service_types || []).map((st) => ({
        serviceType: st.service_type,
        count: Number(st.count) || 0,
        amount: Number(st.amount) || 0,
      })),
    };
  });
}

export function parseAnalyticsDashboardRpc(data: unknown): AnalyticsDashboardRpc | null {
  if (!data || typeof data !== 'object') return null;
  return data as AnalyticsDashboardRpc;
}

export type ReturnComplaintsRpc = {
  total: number;
  by_technician: Array<{ technician_id: string; count: number }>;
};

export type DirectWebsiteConversionsRpc = {
  total_jobs: number;
  total_revenue: number;
  by_original_source: Array<{ lead_type: string; count: number; revenue: number }>;
  by_technician: Array<{
    technician_id: string | null;
    technician_key: string;
    count: number;
    revenue: number;
  }>;
};

export function parseReturnComplaintsRpc(data: unknown): ReturnComplaintsRpc | null {
  if (!data || typeof data !== 'object') return null;
  return data as ReturnComplaintsRpc;
}

export function parseDirectWebsiteConversionsRpc(data: unknown): DirectWebsiteConversionsRpc | null {
  if (!data || typeof data !== 'object') return null;
  return data as DirectWebsiteConversionsRpc;
}

export function mapReturnComplaintsFromRpc(
  rpc: ReturnComplaintsRpc,
  technicians: Array<{ id: string; full_name?: string }>
): {
  total: number;
  byTechnician: Array<{ technicianId: string; technicianName: string; count: number; jobs: [] }>;
  countsByTechId: Record<string, number>;
} {
  const countsByTechId: Record<string, number> = {};
  const byTechnician = (rpc.by_technician || []).map((row) => {
    countsByTechId[row.technician_id] = Number(row.count) || 0;
    const tech = technicians.find((t) => t.id === row.technician_id);
    return {
      technicianId: row.technician_id,
      technicianName: tech?.full_name || 'Unknown',
      count: Number(row.count) || 0,
      jobs: [] as [],
    };
  });
  return {
    total: Number(rpc.total) || 0,
    byTechnician,
    countsByTechId,
  };
}

export function mapDirectWebsiteConversionsFromRpc(
  rpc: DirectWebsiteConversionsRpc,
  technicians: Array<{ id: string; full_name?: string }>
): {
  totalJobs: number;
  totalRevenue: number;
  byOriginalSource: Array<{ leadType: string; count: number; revenue: number }>;
  byTechnician: Array<{ technicianId: string; technicianName: string; count: number; revenue: number }>;
} {
  const byOriginalSource = (rpc.by_original_source || []).map((row) => ({
    leadType: row.lead_type,
    count: Number(row.count) || 0,
    revenue: Number(row.revenue) || 0,
  }));
  const byTechnician = (rpc.by_technician || []).map((row) => {
    const key = row.technician_key || row.technician_id || '__unassigned__';
    const name =
      key === '__unassigned__'
        ? 'Unassigned'
        : technicians.find((t) => t.id === row.technician_id)?.full_name || 'Unknown';
    return {
      technicianId: row.technician_id || key,
      technicianName: name,
      count: Number(row.count) || 0,
      revenue: Number(row.revenue) || 0,
    };
  });
  return {
    totalJobs: Number(rpc.total_jobs) || 0,
    totalRevenue: Number(rpc.total_revenue) || 0,
    byOriginalSource,
    byTechnician,
  };
}

export type RepeatVsNewRpc = {
  active_customers: number;
  new_customers: number;
  repeat_customers: number;
  repeat_rate: number;
  new_revenue: number;
  repeat_revenue: number;
  is_all_time: boolean;
  monthly: Array<{
    month: string;
    new_customers: number;
    returning_customers: number;
    revenue: number;
  }>;
};

export function parseRepeatVsNewRpc(data: unknown): RepeatVsNewRpc | null {
  if (!data || typeof data !== 'object') return null;
  return data as RepeatVsNewRpc;
}

export function mapRepeatVsNewFromRpc(rpc: RepeatVsNewRpc) {
  const monthly = (rpc.monthly || []).map((row) => {
    const [y, mm] = row.month.split('-').map(Number);
    const label = new Date(y, (mm || 1) - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    return {
      month: row.month,
      label,
      newCustomers: Number(row.new_customers) || 0,
      returningCustomers: Number(row.returning_customers) || 0,
      revenue: Number(row.revenue) || 0,
    };
  });

  return {
    activeCustomers: Number(rpc.active_customers) || 0,
    newCustomers: Number(rpc.new_customers) || 0,
    repeatCustomers: Number(rpc.repeat_customers) || 0,
    repeatRate: Number(rpc.repeat_rate) || 0,
    newRevenue: Number(rpc.new_revenue) || 0,
    repeatRevenue: Number(rpc.repeat_revenue) || 0,
    isAllTime: Boolean(rpc.is_all_time),
    monthly,
  };
}

export type AnalyticsExpenseTotalsRpc = {
  total_technician_expenses: number;
  total_technician_advances: number;
  total_business_expenses: number;
  total_business_expenses_for_profit: number;
  total_business_expenses_for_profit_jobs_only: number;
  total_other_business_ledger_expenses: number;
  total_other_business_expenses: number;
};

export function parseAnalyticsExpenseTotalsRpc(data: unknown): {
  totalTechnicianExpenses: number;
  totalTechnicianAdvances: number;
  totalBusinessExpenses: number;
  totalBusinessExpensesForProfit: number;
  totalBusinessExpensesForProfitJobsOnly: number;
  totalOtherBusinessLedgerExpenses: number;
  totalOtherBusinessExpenses: number;
} | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as AnalyticsExpenseTotalsRpc;
  return {
    totalTechnicianExpenses: Number(row.total_technician_expenses) || 0,
    totalTechnicianAdvances: Number(row.total_technician_advances) || 0,
    totalBusinessExpenses: Number(row.total_business_expenses) || 0,
    totalBusinessExpensesForProfit: Number(row.total_business_expenses_for_profit) || 0,
    totalBusinessExpensesForProfitJobsOnly: Number(row.total_business_expenses_for_profit_jobs_only) || 0,
    totalOtherBusinessLedgerExpenses: Number(row.total_other_business_ledger_expenses) || 0,
    totalOtherBusinessExpenses: Number(row.total_other_business_expenses) || 0,
  };
}

export function parseAnalyticsCommissionTotalsRpc(data: unknown): {
  paymentByTech: Map<string, number>;
  extraByTech: Map<string, number>;
} | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as {
    payment_commissions?: Array<{ technician_id?: string; total?: number }>;
    extra_commissions?: Array<{ technician_id?: string; total?: number }>;
  };
  const paymentByTech = new Map<string, number>();
  const extraByTech = new Map<string, number>();
  for (const entry of row.payment_commissions || []) {
    if (!entry?.technician_id) continue;
    paymentByTech.set(entry.technician_id, Number(entry.total) || 0);
  }
  for (const entry of row.extra_commissions || []) {
    if (!entry?.technician_id) continue;
    extraByTech.set(entry.technician_id, Number(entry.total) || 0);
  }
  return { paymentByTech, extraByTech };
}

export function parseAnalyticsCalendarSalaryTotalsRpc(data: unknown): {
  totalSalaryBeforeAdvance: number;
  totalSalaryBeforeAdvanceIncludingAll: number;
} | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as {
    total_salary_before_advance?: number;
    total_salary_before_advance_including_all?: number;
  };
  return {
    totalSalaryBeforeAdvance: Number(row.total_salary_before_advance) || 0,
    totalSalaryBeforeAdvanceIncludingAll:
      Number(row.total_salary_before_advance_including_all) || 0,
  };
}

export type AnalyticsMonthlyTrendsRpc = {
  granularity: 'month' | 'week' | 'day';
  total_jobs: number;
  total_revenue: number;
  best_period: { period_key: string; revenue: number; jobs: number } | null;
  worst_period: { period_key: string; revenue: number; jobs: number } | null;
  rows: Array<{
    period_key: string;
    jobs: number;
    revenue: number;
    avg_bill: number;
  }>;
};

export type AnalyticsTrendPeriodRow = {
  periodKey: string;
  label: string;
  jobs: number;
  revenue: number;
  avgBill: number;
  revenueChangePct: number | null;
  jobsChangePct: number | null;
};

export type AnalyticsTrendSummary = {
  granularity: 'month' | 'week' | 'day';
  totalJobs: number;
  totalRevenue: number;
  overallTrendPct: number | null;
  bestPeriod: { periodKey: string; label: string; revenue: number; jobs: number } | null;
  worstPeriod: { periodKey: string; label: string; revenue: number; jobs: number } | null;
  rows: AnalyticsTrendPeriodRow[];
};

function formatTrendPeriodLabel(periodKey: string, granularity: 'month' | 'week' | 'day'): string {
  if (granularity === 'day') {
    const d = new Date(periodKey + 'T12:00:00');
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
    }
    return periodKey;
  }
  if (granularity === 'week') {
    const match = periodKey.match(/^(\d{4})-W(\d{1,2})$/);
    if (match) return `W${match[2]} ${match[1]}`;
    return periodKey;
  }
  const [y, m] = periodKey.split('-').map(Number);
  if (!y || !m) return periodKey;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function parseAnalyticsMonthlyTrendsRpc(data: unknown): AnalyticsMonthlyTrendsRpc | null {
  if (!data || typeof data !== 'object') return null;
  return data as AnalyticsMonthlyTrendsRpc;
}

export function mapMonthlyTrendsFromRpc(rpc: AnalyticsMonthlyTrendsRpc): AnalyticsTrendSummary {
  const granularity =
    rpc.granularity === 'week' ? 'week' : rpc.granularity === 'day' ? 'day' : 'month';
  const sortedRows = [...(rpc.rows || [])].sort((a, b) =>
    a.period_key.localeCompare(b.period_key)
  );

  const rows: AnalyticsTrendPeriodRow[] = sortedRows.map((row, index) => {
    const prev = index > 0 ? sortedRows[index - 1] : null;
    const jobs = Number(row.jobs) || 0;
    const revenue = Number(row.revenue) || 0;
    const avgBill = Number(row.avg_bill) || (jobs > 0 ? revenue / jobs : 0);
    return {
      periodKey: row.period_key,
      label: formatTrendPeriodLabel(row.period_key, granularity),
      jobs,
      revenue,
      avgBill,
      revenueChangePct: prev ? pctChange(revenue, Number(prev.revenue) || 0) : null,
      jobsChangePct: prev ? pctChange(jobs, Number(prev.jobs) || 0) : null,
    };
  });

  const firstRevenue = rows[0]?.revenue ?? 0;
  const lastRevenue = rows[rows.length - 1]?.revenue ?? 0;
  const overallTrendPct =
    rows.length >= 2 ? pctChange(lastRevenue, firstRevenue) : null;

  const mapExtreme = (
    extreme: AnalyticsMonthlyTrendsRpc['best_period']
  ): AnalyticsTrendSummary['bestPeriod'] => {
    if (!extreme?.period_key) return null;
    return {
      periodKey: extreme.period_key,
      label: formatTrendPeriodLabel(extreme.period_key, granularity),
      revenue: Number(extreme.revenue) || 0,
      jobs: Number(extreme.jobs) || 0,
    };
  };

  return {
    granularity,
    totalJobs: Number(rpc.total_jobs) || 0,
    totalRevenue: Number(rpc.total_revenue) || 0,
    overallTrendPct,
    bestPeriod: mapExtreme(rpc.best_period),
    worstPeriod: mapExtreme(rpc.worst_period),
    rows,
  };
}

/** Roll up daily dashboard stats into monthly rows (RPC fallback, filters not supported). */
export function rollupDailyStatsToMonthlyTrends(
  daily: Array<{ date: string; jobs: number; revenue: number }>
): AnalyticsTrendSummary {
  const bucket = new Map<string, { jobs: number; revenue: number }>();
  for (const day of daily) {
    const key = (day.date || '').slice(0, 7);
    if (!key || key.length < 7) continue;
    const prev = bucket.get(key) ?? { jobs: 0, revenue: 0 };
    bucket.set(key, {
      jobs: prev.jobs + (Number(day.jobs) || 0),
      revenue: prev.revenue + (Number(day.revenue) || 0),
    });
  }

  const rpcLike: AnalyticsMonthlyTrendsRpc = {
    granularity: 'month',
    total_jobs: 0,
    total_revenue: 0,
    best_period: null,
    worst_period: null,
    rows: [...bucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period_key, v]) => ({
        period_key,
        jobs: v.jobs,
        revenue: v.revenue,
        avg_bill: v.jobs > 0 ? v.revenue / v.jobs : 0,
      })),
  };

  rpcLike.total_jobs = rpcLike.rows.reduce((s, r) => s + r.jobs, 0);
  rpcLike.total_revenue = rpcLike.rows.reduce((s, r) => s + r.revenue, 0);

  if (rpcLike.rows.length > 0) {
    const best = [...rpcLike.rows].sort((a, b) => b.revenue - a.revenue)[0];
    const worst = [...rpcLike.rows].sort((a, b) => a.revenue - b.revenue)[0];
    rpcLike.best_period = {
      period_key: best.period_key,
      revenue: best.revenue,
      jobs: best.jobs,
    };
    rpcLike.worst_period = {
      period_key: worst.period_key,
      revenue: worst.revenue,
      jobs: worst.jobs,
    };
  }

  return mapMonthlyTrendsFromRpc(rpcLike);
}

export type TrendTimelinePreset = '6m' | '12m' | '24m' | 'ytd' | 'custom';

export function resolveTrendTimelineRange(
  preset: TrendTimelinePreset,
  customStart?: string,
  customEnd?: string
): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();

  if (preset === 'custom' && customStart && customEnd) {
    const start = new Date(customStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  switch (preset) {
    case 'ytd':
      startDate.setMonth(0, 1);
      break;
    case '24m':
      startDate.setMonth(startDate.getMonth() - 24);
      break;
    case '6m':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '12m':
    default:
      startDate.setMonth(startDate.getMonth() - 12);
      break;
  }
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

export function getShiftedTrendRange(
  startDate: Date,
  endDate: Date,
  mode: 'previous_period' | 'previous_year'
): { startDate: Date; endDate: Date } {
  if (mode === 'previous_year') {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setFullYear(start.getFullYear() - 1);
    end.setFullYear(end.getFullYear() - 1);
    return { startDate: start, endDate: end };
  }
  const ms = endDate.getTime() - startDate.getTime() + 1;
  const end = new Date(startDate.getTime() - 1);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - ms + 1);
  start.setHours(0, 0, 0, 0);
  return { startDate: start, endDate: end };
}

export function pickTrendGranularity(startDate: Date, endDate: Date): 'month' | 'week' | 'day' {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 45) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

export function alignTrendSeriesByIndex(
  primary: AnalyticsTrendPeriodRow[],
  secondary: AnalyticsTrendPeriodRow[]
): Array<{
  indexLabel: string;
  primaryLabel: string;
  secondaryLabel: string;
  revenue: number;
  jobs: number;
  compareRevenue: number;
  compareJobs: number;
}> {
  const maxLen = Math.max(primary.length, secondary.length);
  const rows: ReturnType<typeof alignTrendSeriesByIndex> = [];
  for (let i = 0; i < maxLen; i++) {
    const a = primary[i];
    const b = secondary[i];
    rows.push({
      indexLabel: `P${i + 1}`,
      primaryLabel: a?.label ?? '—',
      secondaryLabel: b?.label ?? '—',
      revenue: a?.revenue ?? 0,
      jobs: a?.jobs ?? 0,
      compareRevenue: b?.revenue ?? 0,
      compareJobs: b?.jobs ?? 0,
    });
  }
  return rows;
}

export function compareTrendMonths(
  a: AnalyticsTrendPeriodRow | undefined,
  b: AnalyticsTrendPeriodRow | undefined
) {
  const revenueA = a?.revenue ?? 0;
  const revenueB = b?.revenue ?? 0;
  const jobsA = a?.jobs ?? 0;
  const jobsB = b?.jobs ?? 0;
  const avgA = jobsA > 0 ? revenueA / jobsA : 0;
  const avgB = jobsB > 0 ? revenueB / jobsB : 0;
  return {
    a,
    b,
    revenueDelta: revenueA - revenueB,
    revenueDeltaPct: pctChange(revenueA, revenueB),
    jobsDelta: jobsA - jobsB,
    jobsDeltaPct: pctChange(jobsA, jobsB),
    avgBillDelta: avgA - avgB,
    avgBillDeltaPct: pctChange(avgA, avgB),
  };
}
