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
