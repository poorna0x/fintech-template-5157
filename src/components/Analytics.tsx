import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { db, supabase } from '@/lib/supabase';
import {
  getJobCompletedAt,
  isJobCompletedInRange,
  resolveJobBillingAmount,
} from '@/lib/jobAnalytics';
import { getTotalSalaryForCalendarMonth, getTechnicianMonthlyBaseSalary } from '@/lib/technicianSalaryForPeriod';
import { technicianAccountStatusSuffix } from '@/lib/technicianAccountStatus';
import { toast } from 'sonner';
import {
  BarChart3,
  CheckCircle,
  XCircle,
  Users,
  DollarSign,
  TrendingUp,
  Award,
  AlertCircle,
  Calendar,
  Filter,
  Settings,
  Loader2,
  MapPin,
  Heart,
  PhoneForwarded,
  Package
} from 'lucide-react';
import { normalizeForComparison, normalizeLeadType, getLeadSourceFromJob } from '@/lib/adminUtils';
import {
  mapLeadSourceBreakdownFromDashboard,
  buildLeadSourceBreakdownFromJobs,
  mapTechnicianStatsFromDashboard,
  parseAnalyticsDashboardRpc,
  parseReturnComplaintsRpc,
  parseDirectWebsiteConversionsRpc,
  mapReturnComplaintsFromRpc,
  mapDirectWebsiteConversionsFromRpc,
  parseRepeatVsNewRpc,
  mapRepeatVsNewFromRpc,
  parseAnalyticsExpenseTotalsRpc,
  parseAnalyticsCommissionTotalsRpc,
  parseAnalyticsCalendarSalaryTotalsRpc,
  type AnalyticsDashboardRpc,
} from '@/lib/analyticsDashboard';
import {
  buildAnalyticsCacheKey,
  readAnalyticsSessionCache,
  writeAnalyticsSessionCache,
} from '@/lib/analyticsSessionCache';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Code-split: spare-parts analytics JS only downloads when the section is opened.
const SparePartsAnalytics = React.lazy(() => import('@/components/admin/SparePartsAnalytics'));
import {
  AnalyticsListPagination,
  AnalyticsListLoadingOverlay,
  ANALYTICS_LIST_SCROLL_ANCHOR_CLASS,
} from '@/components/admin/AnalyticsListPagination';
import { AdminInlineLoader } from '@/components/admin/AdminLoaders';
import { AnalyticsLoadSection } from '@/components/admin/AnalyticsLoadSection';
import {
  AnalyticsTrendGraph,
  buildTrendFilterOptions,
} from '@/components/admin/AnalyticsTrendGraph';

interface AnalyticsData {
  totalJobs: number;
  completedJobs: number;
  deniedJobs: number;
  pendingJobs: number;
  assignedJobs: number;
  inProgressJobs: number;
  totalBilling: number;
  averageBill: number;
  technicianStats: Array<{
    id: string;
    name: string;
    totalJobs: number;
    completedJobs: number;
    periodEarnings: number;
    returnComplaints?: number; // Return complaints allocated to this technician
    // Per service sub-type breakdown for this technician's completed jobs (for avg bill view).
    serviceTypeBreakdown?: Array<{ serviceType: string; count: number; amount: number }>;
  }>;
  completionRate: number;
  denialRate: number;
  returnComplaints?: {
    total: number;
    byTechnician: Array<{
      technicianId: string;
      technicianName: string;
      count: number;
      jobs: Array<{
        jobId: string;
        jobNumber: string;
        customerName: string;
        createdAt: string;
        originalJobDate: string;
        originalTechnicianName: string;
      }>;
    }>;
  };
  leadSourceBreakdown?: Array<{ 
    leadType: string; 
    count: number; 
    amount: number;
    leadCost: number;
    spareCost: number;
    serviceTypes: Array<{ serviceType: string; count: number; amount: number }>;
  }>;
  serviceTypeBreakdown?: Array<{ serviceType: string; count: number; amount: number }>;
  paymentMethodBreakdown?: Array<{ method: string; count: number; amount: number }>;
  dailyStats?: Array<{ date: string; jobs: number; revenue: number }>;
  // Expense and profit summary
  totalLeadCosts?: number;
  totalTechnicianExpenses?: number;
  totalTechnicianAdvances?: number;
  totalBusinessExpenses?: number;
  /** Other business expenses (other_expenses table; e.g. misc / from Payments section). */
  totalOtherBusinessExpenses?: number;
  /** Business expenses from business_expenses ledger with category JOB_COST (used as job cost). */
  totalJobCostBusinessExpenses?: number;
  /** business_expenses ledger with category OTHER_BUSINESS_EXPENSE (treated as "Other Business charges"). */
  totalOtherBusinessLedgerExpenses?: number;
  totalSparePartsCost?: number; // Cost of parts used on jobs (from jobs.parts_cost_total)
  totalSalaryDeductions?: number; // Salary before advance (adjusted base + commissions + extra), excl. excluded tech
  totalSalaryIncludingAll?: number; // Same including excluded technician(s), for brackets
  totalExpenses?: number; // Tech + salary + other business + spare parts (business_expenses ledger excluded)
  /** Net profit for the big green card (includes BUSINESS + JOB_COST from business_expenses). */
  totalProfit?: number; // Revenue - Lead Costs - Expenses (operating; lead costs only on completed jobs)
  /** Net profit for the small "Revenue − total costs above" (includes only JOB_COST from business_expenses). */
  totalProfitJobsOnly?: number;
  /** Net cash-in-hand style metric: Revenue − business expenses − salary − technician expenses. */
  netCashInHand?: number;
  /** Ishanga: 7% × max(0, revenue − technician − salary − business ledger); same base as Revenue − expense (core) */
  ishaDonationAmount?: number;
  softenerData?: {
    totalJobs: number;
    completedJobs: number;
    deniedJobs: number;
    pendingJobs: number;
    assignedJobs: number;
    inProgressJobs: number;
    totalBilling: number;
    averageBill: number;
    completionRate: number;
    serviceTypeBreakdown: Array<{ serviceType: string; count: number; amount: number }>;
    paymentMethodBreakdown: Array<{ method: string; count: number; amount: number }>;
    technicianStats: Array<{
      id: string;
      name: string;
      totalJobs: number;
      completedJobs: number;
      periodEarnings: number;
    }>;
    dailyStats: Array<{ date: string; jobs: number; revenue: number }>;
  };
  locationStats?: Array<{
    locationKey: string;
    displayName: string;
    jobCount: number;
    totalRevenue: number;
    serviceTypeBreakdown: Record<string, number>; // Only 'Installation' and 'Service'
    avgTds: number | null;
    avgCallBilling: number;
  }>;
  brandStats?: Array<{
    brandKey: string;
    displayName: string;
    jobCount: number;
    totalRevenue: number;
    serviceTypeBreakdown: Record<string, number>;
    avgCallBilling: number;
  }>;
  /** Loaded on demand: Direct/Website completed jobs in period vs first attributed lead source; technician column = last completed job before each conversion. */
  directWebsiteConversions?: {
    totalJobs: number;
    totalRevenue: number;
    byOriginalSource: Array<{ leadType: string; count: number; revenue: number }>;
    byTechnician: Array<{ technicianId: string; technicianName: string; count: number; revenue: number }>;
  };
  /** Loaded on demand: repeat vs new customer mix for the selected period (slim queries — minimal egress). */
  repeatVsNew?: {
    activeCustomers: number;
    newCustomers: number;
    repeatCustomers: number;
    repeatRate: number; // %
    newRevenue: number;
    repeatRevenue: number;
    isAllTime: boolean;
    monthly: Array<{
      month: string; // YYYY-MM
      label: string; // e.g. "Jan 2026"
      newCustomers: number;
      returningCustomers: number;
      revenue: number;
    }>;
  };
}


function mapLocationRpcRow(r: Record<string, unknown>): NonNullable<AnalyticsData['locationStats']>[number] {
  return {
    locationKey: String(r.location_key),
    displayName: String(r.display_name),
    jobCount: Number(r.job_count ?? 0),
    totalRevenue: Number(r.total_revenue ?? 0),
    serviceTypeBreakdown: (r.service_type_breakdown as Record<string, number>) ?? {},
    avgTds: r.avg_tds != null ? Number(r.avg_tds) : null,
    avgCallBilling: Number(r.avg_call_billing ?? 0),
  };
}

function mapBrandRpcRow(r: Record<string, unknown>): NonNullable<AnalyticsData['brandStats']>[number] {
  return {
    brandKey: String(r.brand_key),
    displayName: String(r.display_name),
    jobCount: Number(r.job_count ?? 0),
    totalRevenue: Number(r.total_revenue ?? 0),
    serviceTypeBreakdown: (r.service_type_breakdown as Record<string, number>) ?? {},
    avgCallBilling: Number(r.avg_call_billing ?? 0),
  };
}

type PeriodOption = '7d' | '30d' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'previousMonth' | 'customMonth' | '3m' | '6m' | '1y' | 'all' | 'custom';

/** Ishanga 7%: 7% of (Revenue − business expenses − salary − technician expenses). */
const ISHANGA_RATE = 0.07;

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper function to format currency with commas and without .00 when it's zero
const formatCurrency = (amount: number): string => {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
};

/** Net profit ÷ revenue × 100; `null` when revenue is zero. */
const formatProfitMarginPercent = (profit: number, revenue: number): string | null => {
  if (revenue == null || revenue <= 0) return null;
  const pct = (profit / revenue) * 100;
  return pct.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

// Map service_sub_type to Installation (install/reinstall/uninstall) or Service
const toInstallationOrService = (st: string): 'Installation' | 'Service' => {
  const s = (st || '').toLowerCase();
  if (/installation|reinstallation|uninstallation|re.?install|un.?install/.test(s)) return 'Installation';
  return 'Service';
};

/** Direct call or any Website-style lead (including labelled website variants). */
const isDirectOrWebsiteLead = (leadRaw: string): boolean => {
  const t = (leadRaw || '').trim();
  if (!t) return true;
  if (t.toLowerCase().includes('website')) return true;
  const n = normalizeLeadType(t);
  return n === 'Direct call' || n === 'Website';
};

/** Google-Leads: not credited as first-touch (same idea as excluding owned/repeat channels). */
const isGoogleLeadsLead = (leadRaw: string): boolean => {
  const t = (leadRaw || '').trim();
  if (!t) return false;
  return normalizeLeadType(t) === 'Google-Leads';
};

/** First job whose lead can receive attribution (not Direct, Website, or Google Leads). */
const isFirstTouchAttributionSource = (leadRaw: string): boolean => {
  return !isDirectOrWebsiteLead(leadRaw) && !isGoogleLeadsLead(leadRaw);
};

const getJobCompletionTime = getJobCompletedAt;

type AnalyticsExpenseTotals = {
  totalTechnicianExpenses: number;
  totalTechnicianAdvances: number;
  totalBusinessExpenses: number;
  totalBusinessExpensesForProfit: number;
  totalBusinessExpensesForProfitJobsOnly: number;
  totalOtherBusinessLedgerExpenses: number;
  totalOtherBusinessExpenses: number;
  totalSalaryDeductions: number;
  totalSalaryIncludingAll: number;
};

async function loadLeadSourceBreakdownForPeriod(
  startDate: Date | null,
  endDate: Date | null
): Promise<ReturnType<typeof buildLeadSourceBreakdownFromJobs>> {
  if (startDate && endDate) {
    const { data, error } = await db.jobs.getCompletedJobsForLeadBreakdownInRange(startDate, endDate);
    if (error || !data) return [];
    const completed = data.filter((job) => isJobCompletedInRange(job, startDate, endDate));
    return buildLeadSourceBreakdownFromJobs(completed);
  }
  const { data, error } = await db.jobs.getCompletedJobsForLeadBreakdown();
  if (error || !data) return [];
  return buildLeadSourceBreakdownFromJobs(data);
}

/** Map secured `get_analytics_dashboard` RPC → same shape as client-side job aggregation. */
function buildAnalyticsPayloadFromDashboard(
  dash: AnalyticsDashboardRpc,
  technicians: Array<{ id: string; full_name?: string; account_status?: string }>,
  expenses: AnalyticsExpenseTotals,
  options?: {
    leadSourceBreakdown?: Array<{
      leadType: string;
      count: number;
      amount: number;
      leadCost: number;
      spareCost: number;
      serviceTypes: Array<{ serviceType: string; count: number; amount: number }>;
    }>;
  }
) {
  const sc = dash.status_counts || {
    completed: 0,
    denied: 0,
    pending: 0,
    assigned: 0,
    in_progress: 0,
  };
  const soft = dash.softener;
  const emptyStatus = { completed: 0, denied: 0, pending: 0, assigned: 0, in_progress: 0 };
  const softSc = soft?.status_counts || emptyStatus;
  const periodBilling = Number(dash.billing_total) || 0;
  const completedCount = Number(dash.completed_in_period_count) || 0;
  const periodJobCount = Number(dash.period_job_count) || 0;

  const leadSourceBreakdown =
    options?.leadSourceBreakdown ??
    mapLeadSourceBreakdownFromDashboard(dash.lead_source_breakdown || []);
  const totalLeadCostsSum = leadSourceBreakdown.reduce((sum, row) => sum + row.leadCost, 0);
  const otherBusinessChargesTotal =
    expenses.totalOtherBusinessExpenses + expenses.totalOtherBusinessLedgerExpenses;
  const sparePartsCost = Number(dash.total_spare_parts_cost) || 0;
  const expenseTotalJobsOnly =
    expenses.totalTechnicianExpenses +
    expenses.totalSalaryDeductions +
    otherBusinessChargesTotal +
    sparePartsCost +
    expenses.totalBusinessExpensesForProfitJobsOnly;
  const expenseTotal =
    expenses.totalTechnicianExpenses +
    expenses.totalSalaryDeductions +
    otherBusinessChargesTotal +
    sparePartsCost +
    expenses.totalBusinessExpensesForProfit;
  const netProfitJobsOnly = periodBilling - totalLeadCostsSum - expenseTotalJobsOnly;
  const netProfit = periodBilling - totalLeadCostsSum - expenseTotal;
  const netCashInHand =
    periodBilling -
    expenses.totalBusinessExpenses -
    Math.max(0, expenses.totalSalaryDeductions) -
    expenses.totalTechnicianExpenses;
  const revenueMinusCoreForIshanga =
    periodBilling -
    expenses.totalBusinessExpenses -
    Math.max(0, expenses.totalSalaryDeductions) -
    expenses.totalTechnicianExpenses;
  const ishaDonationAmount = Math.max(0, revenueMinusCoreForIshanga) * ISHANGA_RATE;

  const softenerTechStats = (soft?.technician_stats || []).map((row) => {
    const tech = technicians.find((t) => t.id === row.technician_id);
    const inactive = technicianAccountStatusSuffix(tech);
    return {
      id: row.technician_id,
      name: `${tech?.full_name || 'Unknown'}${inactive}`,
      totalJobs: Number(row.total_jobs) || 0,
      completedJobs: Number(row.completed_jobs) || 0,
      periodEarnings: Number(row.period_earnings) || 0,
    };
  });

  return {
    totalJobs: completedCount,
    completedJobs: completedCount,
    deniedJobs: sc.denied,
    pendingJobs: sc.pending,
    assignedJobs: sc.assigned,
    inProgressJobs: sc.in_progress,
    totalBilling: periodBilling,
    averageBill: Number(dash.billing_average) || 0,
    completionRate: periodJobCount > 0 ? (completedCount / periodJobCount) * 100 : 0,
    denialRate: periodJobCount > 0 ? (sc.denied / periodJobCount) * 100 : 0,
    returnComplaints: undefined as undefined,
    technicianStats: mapTechnicianStatsFromDashboard(dash.technician_stats || [], technicians),
    leadSourceBreakdown,
    totalLeadCosts: totalLeadCostsSum,
    totalTechnicianExpenses: expenses.totalTechnicianExpenses,
    totalTechnicianAdvances: expenses.totalTechnicianAdvances,
    totalBusinessExpenses: expenses.totalBusinessExpenses,
    totalOtherBusinessExpenses: expenses.totalOtherBusinessExpenses,
    totalOtherBusinessLedgerExpenses: expenses.totalOtherBusinessLedgerExpenses,
    totalJobCostBusinessExpenses: expenses.totalBusinessExpensesForProfitJobsOnly,
    totalSparePartsCost: Number(dash.total_spare_parts_cost) || 0,
    totalSalaryDeductions: expenses.totalSalaryDeductions,
    totalSalaryIncludingAll: expenses.totalSalaryIncludingAll,
    totalExpenses: expenseTotal,
    totalProfit: netProfit,
    totalProfitJobsOnly: netProfitJobsOnly,
    netCashInHand,
    ishaDonationAmount,
    serviceTypeBreakdown: (dash.service_type_breakdown || []).map((row) => ({
      serviceType: row.service_type,
      count: Number(row.count) || 0,
      amount: Number(row.amount) || 0,
    })),
    paymentMethodBreakdown: (dash.payment_method_breakdown || [])
      .filter((row) => !(row.method === 'Unknown' && Number(row.amount) === 0))
      .map((row) => ({
        method: row.method,
        count: Number(row.count) || 0,
        amount: Number(row.amount) || 0,
      })),
    dailyStats: (dash.daily_stats || []).map((row) => ({
      date: row.date,
      jobs: Number(row.jobs) || 0,
      revenue: Number(row.revenue) || 0,
    })),
    softenerData: {
      totalJobs: Number(soft?.period_job_count) || 0,
      completedJobs: Number(soft?.completed_in_period_count) || 0,
      deniedJobs: softSc.denied,
      pendingJobs: softSc.pending,
      assignedJobs: softSc.assigned,
      inProgressJobs: softSc.in_progress,
      totalBilling: Number(soft?.billing_total) || 0,
      averageBill: Number(soft?.billing_average) || 0,
      completionRate:
        Number(soft?.period_job_count) > 0
          ? (Number(soft?.completed_in_period_count) || 0) / Number(soft.period_job_count) * 100
          : 0,
      serviceTypeBreakdown: (soft?.service_type_breakdown || []).map((row) => ({
        serviceType: row.service_type,
        count: Number(row.count) || 0,
        amount: Number(row.amount) || 0,
      })),
      paymentMethodBreakdown: (soft?.payment_method_breakdown || [])
        .filter((row) => !(row.method === 'Unknown' && Number(row.amount) === 0))
        .map((row) => ({
          method: row.method,
          count: Number(row.count) || 0,
          amount: Number(row.amount) || 0,
        })),
      technicianStats: softenerTechStats.sort((a, b) => b.completedJobs - a.completedJobs),
      dailyStats: (soft?.daily_stats || []).map((row) => ({
        date: row.date,
        jobs: Number(row.jobs) || 0,
        revenue: Number(row.revenue) || 0,
      })),
    },
  };
}

function computeExpenseTotals(
  techExpenses: any[] | null | undefined,
  techAdvances: any[] | null | undefined,
  businessExpenses: any[] | null | undefined,
  otherBusinessExpenses: any[] | null | undefined
): Pick<
  AnalyticsExpenseTotals,
  | 'totalTechnicianExpenses'
  | 'totalTechnicianAdvances'
  | 'totalBusinessExpenses'
  | 'totalBusinessExpensesForProfit'
  | 'totalBusinessExpensesForProfitJobsOnly'
  | 'totalOtherBusinessLedgerExpenses'
  | 'totalOtherBusinessExpenses'
> {
  const profitCats = new Set(['JOB_COST', 'BUSINESS']);
  const profitCatsJobsOnly = new Set(['JOB_COST']);
  return {
    totalTechnicianExpenses: (techExpenses || []).reduce(
      (sum: number, exp: any) => sum + Number(exp.amount || 0),
      0
    ),
    totalTechnicianAdvances: (techAdvances || []).reduce(
      (sum: number, adv: any) => sum + Number(adv.amount || 0),
      0
    ),
    totalBusinessExpenses: (businessExpenses || []).reduce(
      (sum: number, exp: any) => sum + Number(exp.amount || 0),
      0
    ),
    totalBusinessExpensesForProfit: (businessExpenses || []).reduce((sum: number, exp: any) => {
      const cat = (exp?.category || '').toString().toUpperCase();
      if (!profitCats.has(cat)) return sum;
      return sum + Number(exp.amount || 0);
    }, 0),
    totalBusinessExpensesForProfitJobsOnly: (businessExpenses || []).reduce((sum: number, exp: any) => {
      const cat = (exp?.category || '').toString().toUpperCase();
      if (!profitCatsJobsOnly.has(cat)) return sum;
      return sum + Number(exp.amount || 0);
    }, 0),
    totalOtherBusinessLedgerExpenses: (businessExpenses || []).reduce((sum: number, exp: any) => {
      const cat = (exp?.category || '').toString().toUpperCase();
      if (cat !== 'OTHER_BUSINESS_EXPENSE') return sum;
      return sum + Number(exp.amount || 0);
    }, 0),
    totalOtherBusinessExpenses: (otherBusinessExpenses || []).reduce(
      (sum: number, exp: any) => sum + Number(exp.amount || 0),
      0
    ),
  };
}

async function loadAnalyticsExpenseTotals(
  startStr?: string,
  endStr?: string
): Promise<ReturnType<typeof computeExpenseTotals>> {
  const rpcRes = await db.analyticsPaginated.getExpenseTotals(startStr, endStr);
  const parsed = parseAnalyticsExpenseTotalsRpc(rpcRes.data);
  if (!rpcRes.error && parsed) return parsed;

  const analyticsExpenseOpts = { forAnalytics: true as const };
  const [
    { data: techExpenses },
    { data: techAdvances },
    { data: businessExpenses },
    { data: otherBusinessExpenses },
  ] = await Promise.all([
    db.technicianExpenses.getAll(undefined, startStr, endStr, analyticsExpenseOpts),
    db.technicianAdvances.getAll(undefined, startStr, endStr, analyticsExpenseOpts),
    db.businessExpenses.getAll(startStr, endStr, analyticsExpenseOpts),
    db.otherExpenses.getAll(startStr, endStr, analyticsExpenseOpts),
  ]);
  return computeExpenseTotals(techExpenses, techAdvances, businessExpenses, otherBusinessExpenses);
}

const ANALYTICS_EXCLUDED_SALARY_EMPLOYEE_ID = 'TECH851703400';

/** Pro-rated base salary for a period: only count salary up to today (current month "up to this date"). */
function getProRatedBaseSalary(tech: any, periodStart: Date, periodEnd: Date): number {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const effectiveEnd = periodEnd > today ? today : periodEnd;
  if (periodStart > effectiveEnd) return 0;
  const start = new Date(periodStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(effectiveEnd);
  end.setHours(23, 59, 59, 999);
  let total = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const monthDays = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    const rangeStart = monthStart < start ? start : monthStart;
    const rangeEnd = monthEnd > end ? end : monthEnd;
    const daysInRange = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;
    const monthlyBaseSalary = getTechnicianMonthlyBaseSalary(tech, 8000, cur);
    total += (monthlyBaseSalary * daysInRange) / monthDays;
    cur.setMonth(cur.getMonth() + 1);
    cur.setDate(1);
  }
  return Math.round(total * 100) / 100;
}

async function loadAnalyticsSalaryTotals(
  technicians: any[],
  startDate: Date,
  endDate: Date,
  period: PeriodOption,
  startStr: string,
  endStr: string
): Promise<{ totalSalaryDeductions: number; totalSalaryIncludingAll: number }> {
  const usePaymentsSalary =
    (period === 'thisMonth' || period === 'previousMonth' || period === 'customMonth') &&
    startDate &&
    endDate;

  if (usePaymentsSalary) {
    try {
      const rpcRes = await db.analyticsPaginated.getCalendarSalaryTotals({
        startISO: startDate.toISOString(),
        endISO: endDate.toISOString(),
        startDate: startStr,
        endDate: endStr,
      });
      const parsed = parseAnalyticsCalendarSalaryTotalsRpc(rpcRes.data);
      if (!rpcRes.error && parsed) {
        return {
          totalSalaryDeductions: parsed.totalSalaryBeforeAdvance,
          totalSalaryIncludingAll: parsed.totalSalaryBeforeAdvanceIncludingAll,
        };
      }

      const result = await getTotalSalaryForCalendarMonth(
        startDate.getFullYear(),
        startDate.getMonth() + 1,
        { technicians }
      );
      return {
        totalSalaryDeductions: result.totalSalaryBeforeAdvance,
        totalSalaryIncludingAll: result.totalSalaryBeforeAdvanceIncludingAll,
      };
    } catch (e) {
      console.error('Error loading salary from Payments logic:', e);
      return { totalSalaryDeductions: 0, totalSalaryIncludingAll: 0 };
    }
  }

  if (technicians.length === 0 || !startDate || !endDate) {
    return { totalSalaryDeductions: 0, totalSalaryIncludingAll: 0 };
  }

  let paymentByTech = new Map<string, number>();
  let extraByTech = new Map<string, number>();

  try {
    const rpcRes = await db.analyticsPaginated.getCommissionTotals({
      startISO: startDate.toISOString(),
      endISO: endDate.toISOString(),
      startDate: startStr,
      endDate: endStr,
    });
    const parsed = parseAnalyticsCommissionTotalsRpc(rpcRes.data);
    if (!rpcRes.error && parsed) {
      paymentByTech = parsed.paymentByTech;
      extraByTech = parsed.extraByTech;
    } else {
      const [paymentsRes, extraCommissionsRes] = await Promise.all([
        db.analyticsData.getAllTechnicianPayments({
          startISO: startDate.toISOString(),
          endISO: endDate.toISOString(),
        }),
        db.technicianExtraCommissions.getAll(undefined, startStr, endStr, { forAnalytics: true }),
      ]);
      for (const p of paymentsRes.data || []) {
        const techId = p.technician_id;
        paymentByTech.set(techId, (paymentByTech.get(techId) || 0) + Number(p.commission_amount || 0));
      }
      for (const ec of extraCommissionsRes.data || []) {
        const techId = ec.technician_id;
        extraByTech.set(techId, (extraByTech.get(techId) || 0) + Number(ec.amount || 0));
      }
    }

    let totalSalaryPaid = 0;
    let totalSalaryIncludingAll = 0;
    technicians.forEach((tech: any) => {
      const techId = tech.id;
      const employeeId = tech.employee_id ?? tech.employeeId ?? '';
      const baseSalary = getProRatedBaseSalary(tech, startDate, endDate);
      const commissions = paymentByTech.get(techId) || 0;
      const extraCommissions = extraByTech.get(techId) || 0;
      const amount = baseSalary + commissions + extraCommissions;
      totalSalaryIncludingAll += amount;
      if (employeeId === ANALYTICS_EXCLUDED_SALARY_EMPLOYEE_ID) return;
      totalSalaryPaid += amount;
    });
    return {
      totalSalaryDeductions: totalSalaryPaid,
      totalSalaryIncludingAll,
    };
  } catch (e) {
    console.error('Error calculating salary deductions:', e);
    return { totalSalaryDeductions: 0, totalSalaryIncludingAll: 0 };
  }
}

const Analytics = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [returnComplaintsLoading, setReturnComplaintsLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [customMonthValue, setCustomMonthValue] = useState<string>(''); // YYYY-MM for Custom month
  const [locationSearch, setLocationSearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [loadingLocationStats, setLoadingLocationStats] = useState(false);
  const [loadingBrandStats, setLoadingBrandStats] = useState(false);
  const [loadingDirectConversion, setLoadingDirectConversion] = useState(false);
  const [loadingRepeatVsNew, setLoadingRepeatVsNew] = useState(false);
  const [selectedTechForAvg, setSelectedTechForAvg] = useState<string>('');
  // Spare parts analytics is opt-in: its component + data load only after click.
  const [showSpareParts, setShowSpareParts] = useState(false);
  const [locationRows, setLocationRows] = useState<NonNullable<AnalyticsData['locationStats']>>([]);
  const [locationTotal, setLocationTotal] = useState(0);
  const [locationPage, setLocationPage] = useState(1);
  const [locationPerPage, setLocationPerPage] = useState(10);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [brandRows, setBrandRows] = useState<NonNullable<AnalyticsData['brandStats']>>([]);
  const [brandTotal, setBrandTotal] = useState(0);
  const [brandPage, setBrandPage] = useState(1);
  const [brandPerPage, setBrandPerPage] = useState(10);
  const [brandsLoaded, setBrandsLoaded] = useState(false);
  const [trendGraphLoaded, setTrendGraphLoaded] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [period, customStartDate, customEndDate, customMonthValue]);

  useEffect(() => {
    setLocationsLoaded(false);
    setBrandsLoaded(false);
    setLocationRows([]);
    setBrandRows([]);
    setLocationTotal(0);
    setBrandTotal(0);
    setLocationPage(1);
    setBrandPage(1);
  }, [period, customStartDate, customEndDate, customMonthValue]);

  const getDateRange = (): { startDate: Date | null; endDate: Date | null } => {
    let endDate = new Date();
    
    if (period === 'all') {
      return { startDate: null, endDate: null };
    }
    
    if (period === 'custom') {
      if (!customStartDate || !customEndDate) {
        return { startDate: null, endDate: null };
      }
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      return { startDate: start, endDate: end };
    }

    if (period === 'customMonth' && customMonthValue) {
      const [y, m] = customMonthValue.split('-').map(Number);
      if (!y || !m) return { startDate: null, endDate: null };
      const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const end = new Date(y, m, 0, 23, 59, 59, 999);
      return { startDate: start, endDate: end };
    }
    
    const startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      case 'thisWeek': {
        // Start of this week (Monday)
        const dayOfWeek = startDate.getDay();
        const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
        startDate.setDate(diff);
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      }
      case 'thisMonth': {
        // Start of current month (1st)
        startDate.setDate(1);
        // End of current month (last day)
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      }
      case 'thisYear': {
        const year = new Date().getFullYear();
        return {
          startDate: new Date(year, 0, 1, 0, 0, 0, 0),
          endDate: new Date(year, 11, 31, 23, 59, 59, 999),
        };
      }
      case 'previousMonth':
        // First day of previous month to last day of previous month
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case '3m':
        startDate.setMonth(startDate.getMonth() - 3);
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      case '6m':
        startDate.setMonth(startDate.getMonth() - 6);
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      case '1y': {
        // Previous calendar year (matches “Previous Month” semantics).
        const prevYear = new Date().getFullYear() - 1;
        startDate.setFullYear(prevYear, 0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(prevYear, 11, 31, 23, 59, 59, 999);
        return { startDate, endDate };
      }
      default:
        endDate.setHours(23, 59, 59, 999); // End of today
    }
    startDate.setHours(0, 0, 0, 0);
    
    return { startDate, endDate };
  };

  const trendAnalyticsPeriod = useMemo(
    () => ({
      period,
      ...getDateRange(),
      customMonthValue,
    }),
    [period, customStartDate, customEndDate, customMonthValue]
  );

  const isDateInRange = (date: string | null | undefined, startDate: Date | null, endDate: Date | null): boolean => {
    if (!date) return false;
    if (!startDate || !endDate) return true; // All time
    
    try {
      const jobDate = new Date(date);
      return jobDate >= startDate && jobDate <= endDate;
    } catch (e) {
      return false;
    }
  };

  const loadAnalytics = async () => {
    const cacheKey = buildAnalyticsCacheKey({
      period,
      customStartDate,
      customEndDate,
      customMonthValue,
    });
    const cached = readAnalyticsSessionCache<AnalyticsData>(cacheKey);
    if (cached) {
      setAnalytics(cached);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      
      let totalTechnicianExpenses = 0;
      let totalTechnicianAdvances = 0;
      let totalBusinessExpenses = 0;
      let totalBusinessExpensesForProfit = 0;
      let totalBusinessExpensesForProfitJobsOnly = 0;
      let totalOtherBusinessLedgerExpenses = 0;
      let totalOtherBusinessExpenses = 0;
      let totalSparePartsCost = 0;
      let totalSalaryDeductions = 0;
      let totalSalaryIncludingAll = 0;
      let baseData: any = null;

      const startStr = startDate ? toLocalDateString(startDate) : undefined;
      const endStr = endDate ? toLocalDateString(endDate) : undefined;

      let jobs: any[] = [];
      let completedJobs: any[] = [];
      let technicians: any[] = [];
      let rangedPayments: { technician_id: string; commission_amount?: number | null; payment_status?: string | null }[] =
        [];

      if (startDate && endDate) {
        // Parallel fetch: dashboard RPC + slim expense/technician data (no full jobs unless RPC unavailable).
        const startISO = startDate.toISOString();
        const endISO = endDate.toISOString();
        const [
          techniciansRes,
          dashboardRes,
          expensePartial,
        ] = await Promise.all([
          db.technicians.getAllForAnalytics(100, { activeRosterOnly: false }),
          db.analyticsPaginated.getDashboard(startDate, endDate),
          loadAnalyticsExpenseTotals(startStr, endStr),
        ]);

        technicians = techniciansRes.data || [];

        totalTechnicianExpenses = expensePartial.totalTechnicianExpenses;
        totalTechnicianAdvances = expensePartial.totalTechnicianAdvances;
        totalBusinessExpenses = expensePartial.totalBusinessExpenses;
        totalBusinessExpensesForProfit = expensePartial.totalBusinessExpensesForProfit;
        totalBusinessExpensesForProfitJobsOnly = expensePartial.totalBusinessExpensesForProfitJobsOnly;
        totalOtherBusinessLedgerExpenses = expensePartial.totalOtherBusinessLedgerExpenses;
        totalOtherBusinessExpenses = expensePartial.totalOtherBusinessExpenses;

        const dash = parseAnalyticsDashboardRpc(dashboardRes.data);
        if (!dashboardRes.error && dash) {
          const salaryTotals = await loadAnalyticsSalaryTotals(
            technicians,
            startDate,
            endDate,
            period,
            startStr,
            endStr
          );
          const leadSourceBreakdown = await loadLeadSourceBreakdownForPeriod(startDate, endDate);
          const payload = buildAnalyticsPayloadFromDashboard(dash, technicians, {
            ...expensePartial,
            ...salaryTotals,
          }, { leadSourceBreakdown });
          setAnalytics(payload);
          writeAnalyticsSessionCache(cacheKey, payload);
          return;
        }

        const [paymentsInRangeRes, jobsInRangeResult, salaryTotals] = await Promise.all([
          db.analyticsData.getAllTechnicianPayments({ startISO, endISO }),
          db.jobs.getForAnalyticsInRange(startDate, endDate),
          loadAnalyticsSalaryTotals(technicians, startDate, endDate, period, startStr, endStr),
        ]);
        rangedPayments = paymentsInRangeRes.data || [];
        totalSalaryDeductions = salaryTotals.totalSalaryDeductions;
        totalSalaryIncludingAll = salaryTotals.totalSalaryIncludingAll;

        if (jobsInRangeResult.error || !jobsInRangeResult.data) {
          console.error('Error loading jobs for detailed analytics:', jobsInRangeResult.error);
          setAnalytics(null);
          return;
        }

        const jobsForBase = jobsInRangeResult.data || [];
        const payments = rangedPayments;
        const allInRange = Array.isArray(jobsInRangeResult.data) ? jobsInRangeResult.data : [];
        jobs = allInRange;
        completedJobs = allInRange.filter(
          (j: any) => j && isJobCompletedInRange(j, startDate, endDate)
        );

        const totalJobsCount = jobsForBase.length;
        const completedCount = completedJobs.length;
        const deniedCount = jobsForBase.filter((j: any) => j.status === 'DENIED' || j.status === 'CANCELLED').length;
        const pendingCount = jobsForBase.filter((j: any) => j.status === 'PENDING').length;
        const assignedCount = jobsForBase.filter((j: any) => j.status === 'ASSIGNED').length;
        const inProgressCount = jobsForBase.filter((j: any) => j.status === 'IN_PROGRESS').length;
        const periodBillingSum = completedJobs.reduce(
          (s: number, j: any) => s + resolveJobBillingAmount(j.payment_amount, j.actual_cost),
          0
        );
        baseData = {
          totalJobs: totalJobsCount,
          completedJobs: completedCount,
          deniedJobs: deniedCount,
          pendingJobs: pendingCount,
          assignedJobs: assignedCount,
          inProgressJobs: inProgressCount,
          totalBilling: periodBillingSum,
          averageBill: completedCount > 0 ? periodBillingSum / completedCount : 0,
          technicianStats: technicians.map((tech: any) => {
            const techJobs = jobsForBase.filter((j: any) => j.assigned_technician_id === tech.id);
            const techPayments = payments.filter((p: any) => p.technician_id === tech.id);
            const totalEarnings = techPayments.filter((p: any) => p.payment_status === 'PAID').reduce((s: number, p: any) => s + (Number(p.commission_amount) || 0), 0);
            const pendingEarnings = techPayments.filter((p: any) => p.payment_status === 'PENDING').reduce((s: number, p: any) => s + (Number(p.commission_amount) || 0), 0);
            return {
              id: tech.id,
              name: `${tech.full_name}${technicianAccountStatusSuffix(tech)}`,
              totalJobs: techJobs.length,
              completedJobs: techJobs.filter((j: any) => j.status === 'COMPLETED').length,
              totalEarnings,
              pendingEarnings
            };
          }),
          completionRate: totalJobsCount > 0 ? (completedCount / totalJobsCount) * 100 : 0,
          denialRate: totalJobsCount > 0 ? (deniedCount / totalJobsCount) * 100 : 0
        };
      } else {
        const [
          dashboardRes,
          techniciansRes,
          expensePartial,
        ] = await Promise.all([
          db.analyticsPaginated.getDashboard(undefined, undefined),
          db.technicians.getAllForAnalytics(100, { activeRosterOnly: false }),
          loadAnalyticsExpenseTotals(undefined, undefined),
        ]);
        technicians = techniciansRes.data || [];

        totalTechnicianExpenses = expensePartial.totalTechnicianExpenses;
        totalTechnicianAdvances = expensePartial.totalTechnicianAdvances;
        totalBusinessExpenses = expensePartial.totalBusinessExpenses;
        totalBusinessExpensesForProfit = expensePartial.totalBusinessExpensesForProfit;
        totalBusinessExpensesForProfitJobsOnly = expensePartial.totalBusinessExpensesForProfitJobsOnly;
        totalOtherBusinessLedgerExpenses = expensePartial.totalOtherBusinessLedgerExpenses;
        totalOtherBusinessExpenses = expensePartial.totalOtherBusinessExpenses;

        const dash = parseAnalyticsDashboardRpc(dashboardRes.data);
        if (!dashboardRes.error && dash) {
          const leadSourceBreakdown = await loadLeadSourceBreakdownForPeriod(null, null);
          const payload = buildAnalyticsPayloadFromDashboard(dash, technicians, {
            ...expensePartial,
            totalSalaryDeductions: 0,
            totalSalaryIncludingAll: 0,
          }, { leadSourceBreakdown });
          setAnalytics(payload);
          writeAnalyticsSessionCache(cacheKey, payload);
          return;
        }

        const [paymentsAllRes, jobsRes] = await Promise.all([
          db.analyticsData.getAllTechnicianPayments(),
          db.jobs.getForAnalytics(),
        ]);
        rangedPayments = paymentsAllRes.data || [];

        if (jobsRes.error || !jobsRes.data) {
          console.error('Error loading jobs for detailed analytics:', jobsRes.error);
          setAnalytics(null);
          return;
        }

        const allJobsList = Array.isArray(jobsRes.data) ? jobsRes.data : [];
        jobs = allJobsList;
        completedJobs = allJobsList.filter((j: any) => j && j.status === 'COMPLETED');

        const payments = rangedPayments;
        const totalJobsCount = jobs.length;
        const completedCount = completedJobs.length;
        const deniedCount = jobs.filter((j: any) => j.status === 'DENIED' || j.status === 'CANCELLED').length;
        const pendingCount = jobs.filter((j: any) => j.status === 'PENDING').length;
        const assignedCount = jobs.filter((j: any) => j.status === 'ASSIGNED').length;
        const inProgressCount = jobs.filter((j: any) => j.status === 'IN_PROGRESS').length;
        const periodBillingSum = completedJobs.reduce(
          (s: number, j: any) => s + resolveJobBillingAmount(j.payment_amount, j.actual_cost),
          0
        );
        baseData = {
          totalJobs: totalJobsCount,
          completedJobs: completedCount,
          deniedJobs: deniedCount,
          pendingJobs: pendingCount,
          assignedJobs: assignedCount,
          inProgressJobs: inProgressCount,
          totalBilling: periodBillingSum,
          averageBill: completedCount > 0 ? periodBillingSum / completedCount : 0,
          technicianStats: technicians.map((tech: any) => {
            const techJobs = jobs.filter((j: any) => j.assigned_technician_id === tech.id);
            const techPayments = payments.filter((p: any) => p.technician_id === tech.id);
            const totalEarnings = techPayments.filter((p: any) => p.payment_status === 'PAID').reduce((s: number, p: any) => s + (Number(p.commission_amount) || 0), 0);
            const pendingEarnings = techPayments.filter((p: any) => p.payment_status === 'PENDING').reduce((s: number, p: any) => s + (Number(p.commission_amount) || 0), 0);
            return {
              id: tech.id,
              name: `${tech.full_name}${technicianAccountStatusSuffix(tech)}`,
              totalJobs: techJobs.length,
              completedJobs: techJobs.filter((j: any) => j.status === 'COMPLETED').length,
              totalEarnings,
              pendingEarnings
            };
          }),
          completionRate: totalJobsCount > 0 ? (completedCount / totalJobsCount) * 100 : 0,
          denialRate: totalJobsCount > 0 ? (deniedCount / totalJobsCount) * 100 : 0
        };
      }

      // Spare parts cost: sum denormalized parts_cost_total from completed jobs in period
      totalSparePartsCost = completedJobs.reduce((sum: number, j: any) => sum + (Number(j.parts_cost_total) || 0), 0);

      // Lead Source Breakdown with Service Type details and lead costs
      const leadSourceBreakdown = await loadLeadSourceBreakdownForPeriod(startDate, endDate);
      const totalLeadCostsSum = leadSourceBreakdown.reduce((sum, row) => sum + row.leadCost, 0);
      
      // Service Type Breakdown (using service_sub_type like Installation, Service, etc.)
      const serviceTypeMap: Record<string, { count: number; amount: number }> = {};
      completedJobs.forEach((job: any) => {
        if (!job) return;
        // Use service_sub_type instead of service_type (e.g., Installation, Service, etc.)
        const serviceType = job.service_sub_type || job.serviceSubType || 'Unknown';
        const amount = Number(job.payment_amount || job.actual_cost || 0);
        if (!serviceTypeMap[serviceType]) {
          serviceTypeMap[serviceType] = { count: 0, amount: 0 };
        }
        serviceTypeMap[serviceType].count += 1;
        serviceTypeMap[serviceType].amount += amount;
      });
      
      // Calculate technician stats for selected period only
      const technicianStatsMap: Record<string, {
        id: string;
        name: string;
        totalJobs: number;
        completedJobs: number;
        periodEarnings: number;
        returnComplaints: number;
        serviceTypes: Record<string, { count: number; amount: number }>;
      }> = {};
      
      // Technicians loaded once above (getAllForAnalytics — slim roster, no GPS/phone blobs).

      // Calculate stats for each technician based on jobs in the selected period
      jobs.forEach((job: any) => {
        if (!job) return;
        const techId = job.assigned_technician_id || job.assignedTechnicianId;
        if (!techId) return;
        
        const tech: any = technicians.find((t: any) => t.id === techId);
        if (!tech) return;

        if (!technicianStatsMap[techId]) {
          technicianStatsMap[techId] = {
            id: techId,
            name: `${(tech as any).full_name || (tech as any).fullName || 'Unknown'}${technicianAccountStatusSuffix(tech)}`,
            totalJobs: 0,
            completedJobs: 0,
            periodEarnings: 0,
            returnComplaints: 0,
            serviceTypes: {}
          };
        }
        
        technicianStatsMap[techId].totalJobs += 1;
        
        if (job.status === 'COMPLETED') {
          const countsForPeriod =
            !startDate || !endDate || isJobCompletedInRange(job, startDate, endDate);
          if (!countsForPeriod) return;

          technicianStatsMap[techId].completedJobs += 1;
          
          // Calculate earnings for completed jobs in this period
          // Use payment_amount from completed jobs as earnings metric
          const jobAmount = Number(job.payment_amount || job.actual_cost || 0);
          technicianStatsMap[techId].periodEarnings += jobAmount;

          // Per service sub-type breakdown (for avg bill view) — reuses already-fetched jobs.
          const subType = job.service_sub_type || job.serviceSubType || 'Unknown';
          if (!technicianStatsMap[techId].serviceTypes[subType]) {
            technicianStatsMap[techId].serviceTypes[subType] = { count: 0, amount: 0 };
          }
          technicianStatsMap[techId].serviceTypes[subType].count += 1;
          technicianStatsMap[techId].serviceTypes[subType].amount += jobAmount;
        }
      });
      
      // Payment Method Breakdown
      const paymentMethodMap: Record<string, { count: number; amount: number }> = {};
      completedJobs.forEach((job: any) => {
        if (!job) return;
        const method = job.payment_method || 'Unknown';
        const amount = Number(job.payment_amount || job.actual_cost || 0);
        if (!paymentMethodMap[method]) {
          paymentMethodMap[method] = { count: 0, amount: 0 };
        }
        paymentMethodMap[method].count += 1;
        paymentMethodMap[method].amount += amount;
      });
      
      // Daily Stats (filtered by selected period)
      const dailyStatsMap: Record<string, { jobs: number; revenue: number }> = {};
      
      completedJobs.forEach((job: any) => {
        if (!job) return;
        const completedDate = job.completed_at || job.end_time;
        if (completedDate) {
          try {
            const date = new Date(completedDate).toISOString().split('T')[0];
            const jobDate = new Date(completedDate);
            if (!isNaN(jobDate.getTime())) {
              // If date range is set, check if date is in range
              if (startDate && endDate) {
                if (jobDate >= startDate && jobDate <= endDate) {
                  if (!dailyStatsMap[date]) {
                    dailyStatsMap[date] = { jobs: 0, revenue: 0 };
                  }
                  dailyStatsMap[date].jobs += 1;
                  dailyStatsMap[date].revenue += Number(job.payment_amount || job.actual_cost || 0);
                }
              } else {
                // All time - include all dates
                if (!dailyStatsMap[date]) {
                  dailyStatsMap[date] = { jobs: 0, revenue: 0 };
                }
                dailyStatsMap[date].jobs += 1;
                dailyStatsMap[date].revenue += Number(job.payment_amount || job.actual_cost || 0);
              }
            }
          } catch (e) {
            // Skip invalid dates
          }
        }
      });
      
      const dailyStats = Object.entries(dailyStatsMap)
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      // ========== SOFTENER-SPECIFIC ANALYTICS ==========
      // Filter jobs for softener services only
      const softenerJobs = jobs.filter((j: any) => {
        if (!j) return false;
        const serviceType = j.service_type || j.serviceType;
        return serviceType === 'SOFTENER' || serviceType === 'softener';
      });
      
      const softenerCompletedJobs = softenerJobs.filter((j: any) => j && j.status === 'COMPLETED');
      let softenerCompletedForBilling: typeof softenerCompletedJobs;
      if (startDate && endDate) {
        const filteredSoftenerCompleted = softenerCompletedJobs.filter((j: any) => {
          const completedDate = j.completed_at || j.end_time || j.completedAt;
          return isDateInRange(completedDate, startDate, endDate);
        });
        softenerCompletedForBilling = filteredSoftenerCompleted;
      } else {
        softenerCompletedForBilling = softenerCompletedJobs;
      }
      
      // Softener Service Type Breakdown
      const softenerServiceTypeMap: Record<string, { count: number; amount: number }> = {};
      softenerCompletedForBilling.forEach((job: any) => {
        if (!job) return;
        const serviceType = job.service_sub_type || job.serviceSubType || 'Unknown';
        const amount = Number(job.payment_amount || job.actual_cost || 0);
        if (!softenerServiceTypeMap[serviceType]) {
          softenerServiceTypeMap[serviceType] = { count: 0, amount: 0 };
        }
        softenerServiceTypeMap[serviceType].count += 1;
        softenerServiceTypeMap[serviceType].amount += amount;
      });
      
      // Softener Payment Method Breakdown
      const softenerPaymentMethodMap: Record<string, { count: number; amount: number }> = {};
      softenerCompletedForBilling.forEach((job: any) => {
        if (!job) return;
        const method = job.payment_method || 'Unknown';
        const amount = Number(job.payment_amount || job.actual_cost || 0);
        if (!softenerPaymentMethodMap[method]) {
          softenerPaymentMethodMap[method] = { count: 0, amount: 0 };
        }
        softenerPaymentMethodMap[method].count += 1;
        softenerPaymentMethodMap[method].amount += amount;
      });
      
      // Softener Technician Stats
      const softenerTechnicianStatsMap: Record<string, {
        id: string;
        name: string;
        totalJobs: number;
        completedJobs: number;
        periodEarnings: number;
      }> = {};
      
      softenerJobs.forEach((job: any) => {
        if (!job) return;
        const techId = job.assigned_technician_id || job.assignedTechnicianId;
        if (!techId) return;
        
        const tech: any = technicians.find((t: any) => t.id === techId);
        if (!tech) return;

        if (!softenerTechnicianStatsMap[techId]) {
          softenerTechnicianStatsMap[techId] = {
            id: techId,
            name: `${(tech as any).full_name || (tech as any).fullName || 'Unknown'}${technicianAccountStatusSuffix(tech)}`,
            totalJobs: 0,
            completedJobs: 0,
            periodEarnings: 0
          };
        }
        
        softenerTechnicianStatsMap[techId].totalJobs += 1;
        
        if (job.status === 'COMPLETED') {
          softenerTechnicianStatsMap[techId].completedJobs += 1;
          const jobAmount = Number(job.payment_amount || job.actual_cost || 0);
          softenerTechnicianStatsMap[techId].periodEarnings += jobAmount;
        }
      });
      
      // Softener Daily Stats
      const softenerDailyStatsMap: Record<string, { jobs: number; revenue: number }> = {};
      softenerCompletedForBilling.forEach((job: any) => {
        if (!job) return;
        const completedDate = job.completed_at || job.end_time;
        if (completedDate) {
          try {
            const date = new Date(completedDate).toISOString().split('T')[0];
            const jobDate = new Date(completedDate);
            if (!isNaN(jobDate.getTime())) {
              if (startDate && endDate) {
                if (jobDate >= startDate && jobDate <= endDate) {
                  if (!softenerDailyStatsMap[date]) {
                    softenerDailyStatsMap[date] = { jobs: 0, revenue: 0 };
                  }
                  softenerDailyStatsMap[date].jobs += 1;
                  softenerDailyStatsMap[date].revenue += Number(job.payment_amount || job.actual_cost || 0);
                }
              } else {
                if (!softenerDailyStatsMap[date]) {
                  softenerDailyStatsMap[date] = { jobs: 0, revenue: 0 };
                }
                softenerDailyStatsMap[date].jobs += 1;
                softenerDailyStatsMap[date].revenue += Number(job.payment_amount || job.actual_cost || 0);
              }
            }
          } catch (e) {
            // Skip invalid dates
          }
        }
      });
      
      const softenerDailyStats = Object.entries(softenerDailyStatsMap)
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      // Softener Total Billing
      const softenerBilling = softenerCompletedForBilling.reduce((sum: number, job: any) => {
        if (!job) return sum;
        const paymentAmount = Number(job.payment_amount || 0);
        if (paymentAmount > 0) {
          return sum + paymentAmount;
        }
        const actualCost = Number(job.actual_cost || 0);
        if (actualCost > 0) {
          return sum + actualCost;
        }
        return sum;
      }, 0);
      
      const softenerAverageBill = softenerCompletedForBilling.length > 0
        ? softenerBilling / softenerCompletedForBilling.length
        : 0;
      
      // ========== END SOFTENER ANALYTICS ==========
      
      const periodBilling = completedJobs.reduce(
        (sum: number, job: any) =>
          sum + resolveJobBillingAmount(job?.payment_amount, job?.actual_cost),
        0
      );

      const periodAverageBill = completedJobs.length > 0 ? periodBilling / completedJobs.length : 0;

      const otherBusinessChargesTotal = totalOtherBusinessExpenses + totalOtherBusinessLedgerExpenses;
      const expenseTotalJobsOnly =
        totalTechnicianExpenses +
        totalSalaryDeductions +
        otherBusinessChargesTotal +
        totalSparePartsCost +
        totalBusinessExpensesForProfitJobsOnly;

      const expenseTotal =
        totalTechnicianExpenses +
        totalSalaryDeductions +
        otherBusinessChargesTotal +
        totalSparePartsCost +
        totalBusinessExpensesForProfit;
      const netProfitJobsOnly = periodBilling - totalLeadCostsSum - expenseTotalJobsOnly;
      const netProfit = periodBilling - totalLeadCostsSum - expenseTotal;
      const netCashInHand =
        periodBilling -
        totalBusinessExpenses -
        Math.max(0, totalSalaryDeductions) -
        totalTechnicianExpenses;
      // Ishanga 7% base = Revenue − business expense − salary − technician expense
      const revenueMinusCoreForIshanga =
        periodBilling -
        totalBusinessExpenses -
        Math.max(0, totalSalaryDeductions) -
        totalTechnicianExpenses;
      const ishaDonationAmount = Math.max(0, revenueMinusCoreForIshanga) * ISHANGA_RATE;

      // Enhance analytics data (Top locations loaded on demand via Load button)
      const nextAnalytics: AnalyticsData = {
        ...baseData,
        totalBilling: periodBilling, // Use period-specific billing
        averageBill: periodAverageBill, // Use period-specific average
        totalJobs: completedJobs.length, // Show completed count (jobs completed in period)
        completedJobs: completedJobs.length, // Use period-specific completed jobs
        deniedJobs: jobs.filter((j: any) => j && (j.status === 'DENIED' || j.status === 'CANCELLED')).length,
        pendingJobs: jobs.filter((j: any) => j && j.status === 'PENDING').length,
        assignedJobs: jobs.filter((j: any) => j && j.status === 'ASSIGNED').length,
        inProgressJobs: jobs.filter((j: any) => j && j.status === 'IN_PROGRESS').length,
        completionRate: jobs.length > 0 ? (completedJobs.length / jobs.length) * 100 : 0,
        denialRate: jobs.length > 0 ? (jobs.filter((j: any) => j && (j.status === 'DENIED' || j.status === 'CANCELLED')).length / jobs.length) * 100 : 0,
        returnComplaints: undefined, // Loaded on demand when user clicks "Return Complaints" header
        technicianStats: Object.values(technicianStatsMap)
          .map((t) => ({
            ...t,
            serviceTypeBreakdown: Object.entries(t.serviceTypes)
              .map(([serviceType, s]) => ({ serviceType, count: s.count, amount: s.amount }))
              .sort((a, b) => b.amount - a.amount),
          }))
          .sort((a, b) => b.completedJobs - a.completedJobs),
        leadSourceBreakdown,
        totalLeadCosts: totalLeadCostsSum,
        // Expense totals
        totalTechnicianExpenses,
        totalTechnicianAdvances, // Keep for reference but don't show separately
        totalBusinessExpenses,
        totalOtherBusinessExpenses,
        totalOtherBusinessLedgerExpenses,
        totalJobCostBusinessExpenses: totalBusinessExpensesForProfitJobsOnly,
        totalSparePartsCost, // Parts used on jobs (job_parts_used × inventory price)
        totalSalaryDeductions, // Salary before advance (adjusted base + commissions + extra)
        totalSalaryIncludingAll, // Including excluded technician(s), for display in brackets
        totalExpenses: expenseTotal,
        totalProfit: netProfit,
        totalProfitJobsOnly: netProfitJobsOnly,
        netCashInHand,
        ishaDonationAmount,
        serviceTypeBreakdown: Object.entries(serviceTypeMap)
          .map(([serviceType, stats]) => ({ serviceType, ...stats }))
          .sort((a, b) => b.amount - a.amount),
        paymentMethodBreakdown: Object.entries(paymentMethodMap)
          .filter(([method, stats]) => !(method === 'Unknown' && stats.amount === 0))
          .map(([method, stats]) => ({ method, ...stats }))
          .sort((a, b) => b.amount - a.amount),
        dailyStats,
        softenerData: {
          totalJobs: softenerJobs.length,
          completedJobs: softenerCompletedForBilling.length,
          deniedJobs: softenerJobs.filter((j: any) => j && (j.status === 'DENIED' || j.status === 'CANCELLED')).length,
          pendingJobs: softenerJobs.filter((j: any) => j && j.status === 'PENDING').length,
          assignedJobs: softenerJobs.filter((j: any) => j && j.status === 'ASSIGNED').length,
          inProgressJobs: softenerJobs.filter((j: any) => j && j.status === 'IN_PROGRESS').length,
          totalBilling: softenerBilling,
          averageBill: softenerAverageBill,
          completionRate: softenerJobs.length > 0 ? (softenerCompletedForBilling.length / softenerJobs.length) * 100 : 0,
          serviceTypeBreakdown: Object.entries(softenerServiceTypeMap)
            .map(([serviceType, stats]) => ({ serviceType, ...stats }))
            .sort((a, b) => b.amount - a.amount),
          paymentMethodBreakdown: Object.entries(softenerPaymentMethodMap)
            .filter(([method, stats]) => !(method === 'Unknown' && stats.amount === 0))
            .map(([method, stats]) => ({ method, ...stats }))
            .sort((a, b) => b.amount - a.amount),
          technicianStats: Object.values(softenerTechnicianStatsMap)
            .sort((a, b) => b.completedJobs - a.completedJobs),
          dailyStats: softenerDailyStats
        }
      };
      setAnalytics(nextAnalytics);
      writeAnalyticsSessionCache(cacheKey, nextAnalytics);
    } catch (error: any) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load analytics: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadReturnComplaints = async () => {
    if (!analytics) return;
    if (returnComplaintsLoading || analytics.returnComplaints !== undefined) return;
    setReturnComplaintsLoading(true);
    try {
      const { startDate, endDate } = getDateRange();

      const [rpcRes, techniciansRes] = await Promise.all([
        db.analyticsPaginated.getReturnComplaints(startDate ?? undefined, endDate ?? undefined),
        db.technicians.getAllForAnalytics(100, { activeRosterOnly: false }),
      ]);
      const technicians = techniciansRes.data || [];
      const rpcParsed = parseReturnComplaintsRpc(rpcRes.data);
      if (!rpcRes.error && rpcParsed) {
        const mapped = mapReturnComplaintsFromRpc(rpcParsed, technicians);
        setAnalytics((prev) =>
          prev
            ? {
                ...prev,
                // Mark as loaded even when total is 0; otherwise the table shows "—" which looks like "not working".
                returnComplaints: { total: mapped.total, byTechnician: mapped.byTechnician },
                technicianStats: prev.technicianStats.map((tech) => ({
                  ...tech,
                  returnComplaints: mapped.countsByTechId[tech.id] || 0,
                })),
              }
            : prev
        );
        return;
      }

      let jobsCreatedInPeriod: any[];
      let allCompletedJobs: any[];
      const isReturnComplaint = (st: string): boolean => {
        const l = (st || '').toLowerCase().trim();
        return l.includes('return') && (l.includes('complaint') || l.includes('service'));
      };

      if (startDate && endDate) {
        const createdRes = await db.jobs.getJobsCreatedInRange(startDate, endDate);
        jobsCreatedInPeriod = createdRes.data || [];
        const hasCandidate = jobsCreatedInPeriod.some((j: any) =>
          isReturnComplaint(j.service_sub_type || j.serviceSubType || '')
        );
        if (hasCandidate) {
          const completedRes = await db.jobs.getCompletedJobsForReturnComplaintLookup(5000);
          allCompletedJobs = completedRes.data || [];
        } else {
          allCompletedJobs = [];
        }
        let returnComplaintsTotal = 0;
        const returnComplaintsByTechnician: Record<string, number> = {};
        jobsCreatedInPeriod.forEach((currentJob: any) => {
          if (!currentJob) return;
          const serviceSubType = currentJob.service_sub_type || currentJob.serviceSubType || '';
          if (!isReturnComplaint(serviceSubType)) return;
          const customerId = currentJob.customer_id;
          if (!customerId) return;
          const currentJobCreatedDate = new Date(currentJob.created_at || 0);
          if (isNaN(currentJobCreatedDate.getTime())) return;
          const previousCompletedJobs = allCompletedJobs.filter((prevJob: any) => {
            if (!prevJob || prevJob.id === currentJob.id) return false;
            if (prevJob.customer_id !== customerId) return false;
            const prevCompletedDate = prevJob.end_time || prevJob.completed_at;
            if (!prevCompletedDate) return false;
            const prevDate = new Date(prevCompletedDate);
            if (isNaN(prevDate.getTime())) return false;
            return prevDate < currentJobCreatedDate;
          });
          if (previousCompletedJobs.length > 0) {
            const lastCompletedJob = previousCompletedJobs.sort((a: any, b: any) => {
              const aDate = new Date(a.end_time || a.completed_at || 0);
              const bDate = new Date(b.end_time || b.completed_at || 0);
              return bDate.getTime() - aDate.getTime();
            })[0];
            const originalTechnicianId = lastCompletedJob.assigned_technician_id;
            if (!originalTechnicianId) return;
            if (currentJob.assigned_technician_id === originalTechnicianId) return;
            returnComplaintsTotal++;
            returnComplaintsByTechnician[originalTechnicianId] = (returnComplaintsByTechnician[originalTechnicianId] || 0) + 1;
          }
        });
        const byTechnician = Object.entries(returnComplaintsByTechnician).map(([techId, count]) => {
          const tech = technicians.find((t: any) => t.id === techId);
          return { technicianId: techId, technicianName: tech ? (tech.full_name || 'Unknown') : 'Unknown', count, jobs: [] };
        }).sort((a, b) => b.count - a.count);
        setAnalytics(prev => prev ? {
          ...prev,
          // Always load: show 0 instead of "—".
          returnComplaints: { total: returnComplaintsTotal, byTechnician },
          technicianStats: prev.technicianStats.map(tech => ({
            ...tech,
            returnComplaints: returnComplaintsByTechnician[tech.id] || 0
          }))
        } : prev);
      } else {
        const jobsRes = await db.jobs.getForAnalytics(5000);
        const jobs = jobsRes.data || [];
        jobsCreatedInPeriod = jobs;
        allCompletedJobs = jobs.filter((j: any) => j && j.status === 'COMPLETED');
        let returnComplaintsTotal = 0;
        const returnComplaintsByTechnician: Record<string, number> = {};
        jobsCreatedInPeriod.forEach((currentJob: any) => {
          if (!currentJob) return;
          const serviceSubType = currentJob.service_sub_type || currentJob.serviceSubType || '';
          if (!isReturnComplaint(serviceSubType)) return;
          const customerId = currentJob.customer_id;
          if (!customerId) return;
          const currentJobCreatedDate = new Date(currentJob.created_at || 0);
          if (isNaN(currentJobCreatedDate.getTime())) return;
          const previousCompletedJobs = allCompletedJobs.filter((prevJob: any) => {
            if (!prevJob || prevJob.id === currentJob.id) return false;
            if (prevJob.customer_id !== customerId) return false;
            const prevCompletedDate = prevJob.end_time || prevJob.completed_at;
            if (!prevCompletedDate) return false;
            const prevDate = new Date(prevCompletedDate);
            if (isNaN(prevDate.getTime())) return false;
            return prevDate < currentJobCreatedDate;
          });
          if (previousCompletedJobs.length > 0) {
            const lastCompletedJob = previousCompletedJobs.sort((a: any, b: any) => {
              const aDate = new Date(a.end_time || a.completed_at || 0);
              const bDate = new Date(b.end_time || b.completed_at || 0);
              return bDate.getTime() - aDate.getTime();
            })[0];
            const originalTechnicianId = lastCompletedJob.assigned_technician_id;
            if (!originalTechnicianId) return;
            if (currentJob.assigned_technician_id === originalTechnicianId) return;
            returnComplaintsTotal++;
            returnComplaintsByTechnician[originalTechnicianId] = (returnComplaintsByTechnician[originalTechnicianId] || 0) + 1;
          }
        });
        const byTechnician = Object.entries(returnComplaintsByTechnician).map(([techId, count]) => {
          const tech = technicians.find((t: any) => t.id === techId);
          return { technicianId: techId, technicianName: tech ? (tech.full_name || 'Unknown') : 'Unknown', count, jobs: [] };
        }).sort((a, b) => b.count - a.count);
        setAnalytics(prev => prev ? {
          ...prev,
          // Always load: show 0 instead of "—".
          returnComplaints: { total: returnComplaintsTotal, byTechnician },
          technicianStats: prev.technicianStats.map(tech => ({
            ...tech,
            returnComplaints: returnComplaintsByTechnician[tech.id] || 0
          }))
        } : prev);
      }
    } catch (err: any) {
      console.error('Error loading return complaints:', err);
      toast.error('Failed to load return complaints');
    } finally {
      setReturnComplaintsLoading(false);
    }
  };

  const loadTopLocations = async (page = 1, perPage = locationPerPage, search = locationSearch) => {
    setLoadingLocationStats(true);
    try {
      const { startDate, endDate } = getDateRange();
      const { data, error } = await db.analyticsPaginated.getTopLocations({
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        limit: perPage,
        offset: (page - 1) * perPage,
        search,
      });
      if (error) throw error;
      const rows = (data?.rows ?? []).map((r) => mapLocationRpcRow(r as Record<string, unknown>));
      setLocationRows(rows);
      setLocationTotal(data?.total ?? 0);
      setLocationPage(page);
      setLocationPerPage(perPage);
      setLocationsLoaded(true);
      if ((data?.total ?? 0) === 0 && !search.trim()) {
        toast.info('No job locations found for this period.');
      }
    } catch (e: unknown) {
      toast.error('Failed to load top locations: ' + (e instanceof Error ? e.message : 'Unknown error'));
      setLocationRows([]);
      setLocationTotal(0);
    } finally {
      setLoadingLocationStats(false);
    }
  };

  const loadTopBrands = async (page = 1, perPage = brandPerPage, search = brandSearch) => {
    setLoadingBrandStats(true);
    try {
      const { startDate, endDate } = getDateRange();
      const { data, error } = await db.analyticsPaginated.getTopBrands({
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
        limit: perPage,
        offset: (page - 1) * perPage,
        search,
      });
      if (error) throw error;
      const rows = (data?.rows ?? []).map((r) => mapBrandRpcRow(r as Record<string, unknown>));
      setBrandRows(rows);
      setBrandTotal(data?.total ?? 0);
      setBrandPage(page);
      setBrandPerPage(perPage);
      setBrandsLoaded(true);
      if ((data?.total ?? 0) === 0 && !search.trim()) {
        toast.info('No brand data found for this period.');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error('Failed to load top brands: ' + message);
      setBrandRows([]);
      setBrandTotal(0);
    } finally {
      setLoadingBrandStats(false);
    }
  };

  useEffect(() => {
    if (!locationsLoaded) return;
    const t = window.setTimeout(() => {
      void loadTopLocations(1, locationPerPage, locationSearch);
    }, 350);
    return () => window.clearTimeout(t);
  }, [locationSearch]);

  useEffect(() => {
    if (!brandsLoaded) return;
    const t = window.setTimeout(() => {
      void loadTopBrands(1, brandPerPage, brandSearch);
    }, 350);
    return () => window.clearTimeout(t);
  }, [brandSearch]);

  const loadDirectWebsiteConversions = async () => {
    if (loadingDirectConversion) return;
    setLoadingDirectConversion(true);
    try {
      const { startDate, endDate } = getDateRange();

      const [rpcRes, techniciansRes] = await Promise.all([
        db.analyticsPaginated.getDirectWebsiteConversions(startDate ?? undefined, endDate ?? undefined),
        db.technicians.getAllForAnalytics(100, { activeRosterOnly: false }),
      ]);
      const technicians = techniciansRes.data || [];
      const rpcParsed = parseDirectWebsiteConversionsRpc(rpcRes.data);
      if (!rpcRes.error && rpcParsed) {
        const mapped = mapDirectWebsiteConversionsFromRpc(rpcParsed, technicians);
        setAnalytics((prev) =>
          prev
            ? {
                ...prev,
                directWebsiteConversions: {
                  totalJobs: mapped.totalJobs,
                  totalRevenue: mapped.totalRevenue,
                  byOriginalSource: mapped.byOriginalSource,
                  byTechnician: mapped.byTechnician,
                },
              }
            : prev
        );
        if (mapped.totalJobs === 0) {
          toast.info('No direct/website conversion jobs found for this period.');
        }
        return;
      }

      let jobs: any[] = [];

      if (startDate && endDate) {
        const { data: rangeJobs, error: rangeErr } = await db.jobs.getForConversionAnalyticsInRange(startDate, endDate);
        if (rangeErr) throw rangeErr;
        const inRange = Array.isArray(rangeJobs) ? rangeJobs : [];
        const customerIds = [...new Set(inRange.map((j: any) => j?.customer_id).filter(Boolean))] as string[];
        if (customerIds.length === 0) {
          setAnalytics((prev) =>
            prev
              ? {
                  ...prev,
                  directWebsiteConversions: { totalJobs: 0, totalRevenue: 0, byOriginalSource: [], byTechnician: [] }
                }
              : prev
          );
          toast.info('No jobs in the selected period for this report.');
          return;
        }
        const { data: priorRows, error: priorErr2 } = await db.jobs.getPriorJobsForConversionSlim(customerIds, startDate);
        if (priorErr2) throw priorErr2;
        const prior = Array.isArray(priorRows) ? priorRows : [];
        const byId = new Map<string, any>();
        for (const j of prior) {
          if (j?.id) byId.set(j.id, j);
        }
        for (const j of inRange) {
          if (!j?.id) continue;
          const prevRow = byId.get(j.id);
          byId.set(j.id, prevRow ? { ...prevRow, ...j } : j);
        }
        jobs = [...byId.values()];
      } else {
        const { data: rows, error } = await db.jobs.getForConversionAnalyticsRecent(5000);
        if (error) throw error;
        jobs = Array.isArray(rows) ? rows : [];
      }

      const byCustomer = new Map<string, any[]>();
      for (const j of jobs) {
        if (!j?.customer_id) continue;
        const cid = j.customer_id;
        if (!byCustomer.has(cid)) byCustomer.set(cid, []);
        byCustomer.get(cid)!.push(j);
      }

      const sourceAgg: Record<string, { count: number; revenue: number; display: string }> = {};
      const techAgg: Record<string, { count: number; revenue: number }> = {};

      const completionCompletedInPeriod = (job: any): boolean => {
        if (job.status !== 'COMPLETED') return false;
        const cd = getJobCompletionTime(job);
        if (!cd) return false;
        if (!startDate || !endDate) return true;
        return cd >= startDate && cd <= endDate;
      };

      for (const [, list] of byCustomer) {
        const sorted = [...list].sort(
          (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );

        let firstTouchLead: string | null = null;
        let firstTouchCreated = 0;
        for (const job of sorted) {
          if (job.status !== 'COMPLETED') continue;
          const lead = getLeadSourceFromJob(job);
          if (isFirstTouchAttributionSource(lead)) {
            firstTouchLead = lead;
            firstTouchCreated = new Date(job.created_at || 0).getTime();
            break;
          }
        }
        if (!firstTouchLead) continue;

        const groupKey = (normalizeLeadType(firstTouchLead) || firstTouchLead).trim() || firstTouchLead;
        const displayLead = groupKey;

        for (const job of sorted) {
          const created = new Date(job.created_at || 0).getTime();
          if (created <= firstTouchCreated) continue;

          const lead = getLeadSourceFromJob(job);
          if (!isDirectOrWebsiteLead(lead)) continue;
          if (!completionCompletedInPeriod(job)) continue;

          const amount = Number(job.payment_amount || job.actual_cost || 0);
          if (!sourceAgg[groupKey]) {
            sourceAgg[groupKey] = { count: 0, revenue: 0, display: displayLead };
          }
          sourceAgg[groupKey].count += 1;
          sourceAgg[groupKey].revenue += amount;

          const convCreated = new Date(job.created_at || 0).getTime();
          const previousCompleted = sorted.filter((prevJob: any) => {
            if (!prevJob?.id || prevJob.id === job.id) return false;
            if (prevJob.status !== 'COMPLETED') return false;
            const prevDone = getJobCompletionTime(prevJob);
            if (!prevDone) return false;
            return prevDone.getTime() < convCreated;
          });
          if (previousCompleted.length > 0) {
            const lastCompleted = previousCompleted.sort(
              (a: any, b: any) =>
                getJobCompletionTime(b)!.getTime() - getJobCompletionTime(a)!.getTime()
            )[0];
            const tid = String(lastCompleted.assigned_technician_id || lastCompleted.assignedTechnicianId || '').trim();
            const tKey = tid || '__unassigned__';
            if (!techAgg[tKey]) techAgg[tKey] = { count: 0, revenue: 0 };
            techAgg[tKey].count += 1;
            techAgg[tKey].revenue += amount;
          }
        }
      }

      const byOriginalSource = Object.values(sourceAgg)
        .map((v) => ({ leadType: v.display, count: v.count, revenue: v.revenue }))
        .sort((a, b) => b.count - a.count);

      const totalJobs = byOriginalSource.reduce((s, x) => s + x.count, 0);
      const totalRevenue = byOriginalSource.reduce((s, x) => s + x.revenue, 0);

      let byTechnician: Array<{ technicianId: string; technicianName: string; count: number; revenue: number }> = [];
      if (Object.keys(techAgg).length > 0) {
        byTechnician = Object.entries(techAgg)
          .map(([technicianId, v]) => {
            const name =
              technicianId === '__unassigned__'
                ? 'Unassigned'
                : (technicians.find((t: any) => t.id === technicianId)?.full_name as string) || 'Unknown';
            return { technicianId, technicianName: name, count: v.count, revenue: v.revenue };
          })
          .sort((a, b) => b.revenue - a.revenue || b.count - a.count);
      }

      setAnalytics((prev) =>
        prev
          ? {
              ...prev,
              directWebsiteConversions: { totalJobs, totalRevenue, byOriginalSource, byTechnician }
            }
          : prev
      );
      if (totalJobs === 0) {
        toast.info('No direct/website conversion jobs found for this period.');
      }
    } catch (e: any) {
      toast.error('Failed to load direct/website conversions: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoadingDirectConversion(false);
    }
  };

  const loadRepeatVsNew = async () => {
    if (loadingRepeatVsNew) return;
    setLoadingRepeatVsNew(true);
    try {
      const { startDate, endDate } = getDateRange();

      const rpcRes = await db.analyticsPaginated.getRepeatVsNew(startDate ?? undefined, endDate ?? undefined);
      const rpcParsed = parseRepeatVsNewRpc(rpcRes.data);
      if (!rpcRes.error && rpcParsed) {
        const mapped = mapRepeatVsNewFromRpc(rpcParsed);
        setAnalytics((prev) => (prev ? { ...prev, repeatVsNew: mapped } : prev));
        if (mapped.activeCustomers === 0) {
          toast.info('No customer activity found for this period.');
        }
        return;
      }

      const isAllTime = !(startDate && endDate);

      let rows: any[] = [];
      const returningSet = new Set<string>();

      if (startDate && endDate) {
        // Ranged: jobs created within the period (slim) + which of those customers existed before the period.
        const { data, error } = await db.jobs.getCustomerActivityInRange(startDate, endDate);
        if (error) throw error;
        rows = Array.isArray(data) ? data : [];
        const customerIds = [...new Set(rows.map((r: any) => r?.customer_id).filter(Boolean))] as string[];
        if (customerIds.length > 0) {
          const { data: ret, error: retErr } = await db.jobs.getReturningCustomerIds(customerIds, startDate);
          if (retErr) throw retErr;
          for (const cid of ret || []) returningSet.add(cid);
        }
      } else {
        // All-time: recent slim jobs; "returning" = customers with more than one job overall.
        const { data, error } = await db.jobs.getCustomerActivitySlimRecent(8000);
        if (error) throw error;
        rows = Array.isArray(data) ? data : [];
        const counts = new Map<string, number>();
        for (const r of rows) {
          const cid = r?.customer_id;
          if (!cid) continue;
          counts.set(cid, (counts.get(cid) || 0) + 1);
        }
        for (const [cid, c] of counts) if (c > 1) returningSet.add(cid);
      }

      const monthKey = (iso: string): string => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };
      const jobAmount = (r: any): number =>
        r?.status === 'COMPLETED' ? Number(r.payment_amount || r.actual_cost || 0) : 0;

      // Aggregate per customer (active months, earliest month, revenue).
      const byCustomer = new Map<string, { months: Set<string>; firstMonth: string; revenue: number }>();
      for (const r of rows) {
        const cid = r?.customer_id;
        const m = r?.created_at ? monthKey(r.created_at) : '';
        if (!cid || !m) continue;
        let agg = byCustomer.get(cid);
        if (!agg) {
          agg = { months: new Set(), firstMonth: m, revenue: 0 };
          byCustomer.set(cid, agg);
        }
        agg.months.add(m);
        if (m < agg.firstMonth) agg.firstMonth = m;
        agg.revenue += jobAmount(r);
      }

      let newCustomers = 0;
      let repeatCustomers = 0;
      let newRevenue = 0;
      let repeatRevenue = 0;
      const monthlyMap = new Map<string, { newCustomers: number; returningCustomers: number; revenue: number }>();
      const ensureMonth = (m: string) => {
        let bucket = monthlyMap.get(m);
        if (!bucket) {
          bucket = { newCustomers: 0, returningCustomers: 0, revenue: 0 };
          monthlyMap.set(m, bucket);
        }
        return bucket;
      };

      for (const [cid, agg] of byCustomer) {
        const isNew = !returningSet.has(cid);
        if (isNew) {
          newCustomers += 1;
          newRevenue += agg.revenue;
        } else {
          repeatCustomers += 1;
          repeatRevenue += agg.revenue;
        }
        for (const m of agg.months) {
          const bucket = ensureMonth(m);
          if (isNew && m === agg.firstMonth) bucket.newCustomers += 1;
          else bucket.returningCustomers += 1;
        }
      }

      // Per-month revenue (job level) so the trend revenue matches the period revenue.
      for (const r of rows) {
        const m = r?.created_at ? monthKey(r.created_at) : '';
        if (!m) continue;
        ensureMonth(m).revenue += jobAmount(r);
      }

      const monthly = [...monthlyMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, v]) => {
          const [y, mm] = month.split('-').map(Number);
          const label = new Date(y, (mm || 1) - 1, 1).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          });
          return { month, label, ...v };
        });

      const activeCustomers = byCustomer.size;
      const repeatRate = activeCustomers > 0 ? (repeatCustomers / activeCustomers) * 100 : 0;

      setAnalytics((prev) =>
        prev
          ? {
              ...prev,
              repeatVsNew: {
                activeCustomers,
                newCustomers,
                repeatCustomers,
                repeatRate,
                newRevenue,
                repeatRevenue,
                isAllTime,
                monthly,
              },
            }
          : prev
      );

      if (activeCustomers === 0) {
        toast.info('No customer activity found for this period.');
      }
    } catch (e: any) {
      toast.error('Failed to load repeat vs new customers: ' + (e?.message || 'Unknown error'));
    } finally {
      setLoadingRepeatVsNew(false);
    }
  };

  const filteredLocationStats = useMemo(() => locationRows, [locationRows]);
  const filteredBrandStats = useMemo(() => brandRows, [brandRows]);

  const locationTotalPages = Math.max(1, Math.ceil(locationTotal / locationPerPage));
  const brandTotalPages = Math.max(1, Math.ceil(brandTotal / brandPerPage));

  const getPeriodLabel = (): string => {
    switch (period) {
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case 'thisWeek': return 'This Week';
      case 'thisMonth': return 'This Month';
      case 'thisYear': {
        const y = new Date().getFullYear();
        return `This Year (${y})`;
      }
      case 'previousMonth': return 'Previous Month';
      case 'customMonth': return customMonthValue
        ? new Date(customMonthValue + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        : 'Custom month';
      case '3m': return 'Last 3 Months';
      case '6m': return 'Last 6 Months';
      case '1y': {
        const y = new Date().getFullYear() - 1;
        return `Previous Year (${y})`;
      }
      case 'all': return 'All Time';
      case 'custom': return 'Custom Range';
      default: return 'Last 30 Days';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 w-full sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Analytics Dashboard</h2>
          <p className="text-gray-600">Comprehensive performance metrics and insights</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end w-full sm:w-auto sm:ml-auto sm:shrink-0">
          <Filter className="w-4 h-4 text-gray-500 shrink-0" />
          <Label htmlFor="period-select" className="text-sm font-medium text-gray-700 whitespace-nowrap shrink-0">
            Period:
          </Label>
          <Select value={period} onValueChange={(value) => setPeriod(value as PeriodOption)}>
            <SelectTrigger id="period-select" className="w-[180px] shrink-0">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisWeek">This Week</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="thisYear">This Year</SelectItem>
              <SelectItem value="previousMonth">Previous Month</SelectItem>
              <SelectItem value="customMonth">Custom month</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="3m">Last 3 Months</SelectItem>
              <SelectItem value="6m">Last 6 Months</SelectItem>
              <SelectItem value="1y">Previous Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {period === 'customMonth' ? (
            <Input
              type="month"
              value={customMonthValue}
              onChange={(e) => setCustomMonthValue(e.target.value)}
              className="w-[160px] shrink-0 h-10"
              max={new Date().toISOString().slice(0, 7)}
              aria-label="Custom month"
            />
          ) : null}
          {period === 'custom' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <DatePicker
                value={customStartDate}
                onChange={(v) => v && setCustomStartDate(v)}
                placeholder="Start date"
                className="w-auto min-w-[140px]"
              />
              <span className="text-gray-500 text-sm shrink-0">to</span>
              <DatePicker
                value={customEndDate}
                onChange={(v) => v && setCustomEndDate(v)}
                placeholder="End date"
                className="w-auto min-w-[140px]"
              />
            </div>
          ) : null}
        </div>
      </div>
      
      {period === 'custom' && (!customStartDate || !customEndDate) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          Please select both start and end dates to view custom range analytics.
        </div>
      )}

      {period === 'customMonth' && !customMonthValue && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          Please select a month to view analytics.
        </div>
      )}

      {loading ? (
        <AdminInlineLoader message="Loading analytics..." />
      ) : !analytics ? (
        <div className="text-center py-12 text-gray-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>No analytics data available</p>
        </div>
      ) : (
      <>
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Jobs Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{analytics.totalJobs}</div>
            <div className="text-xs text-gray-500 mt-1">completed in period</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{analytics.completedJobs}</div>
            <div className="text-xs text-gray-500 mt-1">
              {analytics.completionRate.toFixed(1)}% completion rate
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              Denied/Cancelled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{analytics.deniedJobs}</div>
            <div className="text-xs text-gray-500 mt-1">
              {analytics.denialRate.toFixed(1)}% denial rate
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Total Billing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">₹ {formatCurrency(analytics.totalBilling)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Technician Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5" />
            Technician Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead>Total Jobs</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={loadReturnComplaints}
                      disabled={returnComplaintsLoading || analytics.returnComplaints !== undefined}
                      className="text-left font-medium hover:underline disabled:no-underline disabled:cursor-default text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1 -mx-1"
                      title={analytics.returnComplaints !== undefined ? 'Loaded' : returnComplaintsLoading ? 'Loading…' : 'Click to load return complaints'}
                    >
                      {returnComplaintsLoading ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                          Loading…
                        </span>
                      ) : analytics.returnComplaints !== undefined ? (
                        'Return Complaints'
                      ) : (
                        'Return Complaints (click to load)'
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Completion Rate</TableHead>
                  <TableHead className="text-right">Total Billing ({getPeriodLabel()})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.technicianStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                      No technician data available
                    </TableCell>
                  </TableRow>
                ) : (
                  analytics.technicianStats
                    .sort((a, b) => b.completedJobs - a.completedJobs)
                    .map((tech) => {
                      const completionRate = tech.totalJobs > 0
                        ? (tech.completedJobs / tech.totalJobs) * 100
                        : 0;
                      const returnComplaintsCount = tech.returnComplaints || 0;
                      
                      return (
                        <TableRow key={tech.id}>
                          <TableCell className="font-medium">{tech.name}</TableCell>
                          <TableCell>{tech.totalJobs}</TableCell>
                          <TableCell className="text-green-600 font-semibold">
                            {tech.completedJobs}
                          </TableCell>
                          <TableCell>
                            {returnComplaintsLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400 inline" />
                            ) : analytics.returnComplaints === undefined ? (
                              <span className="text-gray-400">—</span>
                            ) : returnComplaintsCount > 0 ? (
                              <span className="text-orange-600 font-semibold">{returnComplaintsCount}</span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-green-600 h-2 rounded-full"
                                  style={{ width: `${completionRate}%` }}
                                />
                              </div>
                              <span className="text-sm text-gray-600 w-12">
                                {completionRate.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            ₹ {formatCurrency(tech.periodEarnings)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Technician avg bill by service type (derived from already-loaded technicianStats — no extra egress) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Technician avg bill by service type
            </CardTitle>
            <div className="w-full sm:w-64">
              <Select
                value={selectedTechForAvg}
                onValueChange={(v) => setSelectedTechForAvg(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a technician" />
                </SelectTrigger>
                <SelectContent>
                  {analytics.technicianStats
                    .filter((t) => (t.serviceTypeBreakdown?.length ?? 0) > 0)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <CardDescription>Avg bill per service sub-type for {getPeriodLabel()}</CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedTechForAvg ? (
            <p className="text-sm text-gray-500 py-4">Select a technician to see their average bill per service type.</p>
          ) : (() => {
            const tech = analytics.technicianStats.find((t) => t.id === selectedTechForAvg);
            const rows = tech?.serviceTypeBreakdown ?? [];
            if (!tech || rows.length === 0) {
              return <p className="text-sm text-gray-500 py-4">No completed jobs for this technician in the selected period.</p>;
            }
            const totalCount = rows.reduce((s, r) => s + r.count, 0);
            const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
            return (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service Type</TableHead>
                      <TableHead className="text-right">Completed Jobs</TableHead>
                      <TableHead className="text-right">Total Billing</TableHead>
                      <TableHead className="text-right">Avg Bill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.serviceType}>
                        <TableCell className="font-medium">{r.serviceType}</TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          ₹ {formatCurrency(r.amount)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">
                          ₹ {formatCurrency(r.count > 0 ? r.amount / r.count : 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-gray-200">
                      <TableCell className="font-semibold">All service types</TableCell>
                      <TableCell className="text-right font-semibold">{totalCount}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        ₹ {formatCurrency(totalAmount)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        ₹ {formatCurrency(totalCount > 0 ? totalAmount / totalCount : 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Completion Rate</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${analytics.completionRate}%` }}
                  />
                </div>
                <span className="font-semibold w-16 text-right">
                  {analytics.completionRate.toFixed(1)}%
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Denial Rate</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-red-600 h-2 rounded-full"
                    style={{ width: `${analytics.denialRate}%` }}
                  />
                </div>
                <span className="font-semibold w-16 text-right">
                  {analytics.denialRate.toFixed(1)}%
                </span>
              </div>
            </div>
            
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                <span className="text-sm">Completed</span>
              </div>
              <span className="font-semibold">{analytics.completedJobs}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                <span className="text-sm">Denied/Cancelled</span>
              </div>
              <span className="font-semibold">{analytics.deniedJobs}</span>
            </div>
            
          </CardContent>
        </Card>
      </div>

      {/* Lead Source Breakdown with Service Types */}
      {analytics.leadSourceBreakdown && analytics.leadSourceBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Lead Source Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {analytics.leadSourceBreakdown.map((leadSource) => (
                <div
                  key={leadSource.leadType}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4 sm:p-5 shadow-sm"
                >
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">{leadSource.leadType}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 border border-gray-100 dark:border-gray-700/50">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Jobs</div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{leadSource.count}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 border border-gray-100 dark:border-gray-700/50">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Billing</div>
                      <div className="text-lg font-semibold text-green-600 dark:text-green-500">₹ {formatCurrency(leadSource.amount)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 border border-gray-100 dark:border-gray-700/50">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avg Bill</div>
                      <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-500">₹ {formatCurrency(leadSource.count > 0 ? leadSource.amount / leadSource.count : 0)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 border border-gray-100 dark:border-gray-700/50">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Lead Cost</div>
                      <div className="text-lg font-semibold text-orange-600 dark:text-orange-500">₹ {formatCurrency(leadSource.leadCost || 0)}</div>
                    </div>
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 border border-gray-100 dark:border-gray-700/50">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Spare Cost</div>
                      <div className="text-lg font-semibold text-blue-600 dark:text-blue-500">₹ {formatCurrency(leadSource.spareCost ?? 0)}</div>
                    </div>
                  </div>
                  
                  {leadSource.serviceTypes && leadSource.serviceTypes.length > 0 && (
                    <div className="mt-2 ml-0 sm:ml-2">
                      <div className="text-sm font-medium text-gray-700 mb-2">Service Type Breakdown:</div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Service Type</TableHead>
                              <TableHead className="text-right">Jobs</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-right">Avg Bill</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {leadSource.serviceTypes.map((serviceType) => (
                              <TableRow key={`${leadSource.leadType}-${serviceType.serviceType}`}>
                                <TableCell className="font-medium">{serviceType.serviceType}</TableCell>
                                <TableCell className="text-right">{serviceType.count}</TableCell>
                                <TableCell className="text-right font-semibold text-green-600">
                                  ₹ {formatCurrency(serviceType.amount)}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-emerald-600">
                                  ₹ {formatCurrency(serviceType.count > 0 ? serviceType.amount / serviceType.count : 0)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Type Breakdown */}
      {analytics.serviceTypeBreakdown && analytics.serviceTypeBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Service Type Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service Type</TableHead>
                    <TableHead className="text-right">Number of Calls</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                    <TableHead className="text-right">Avg Bill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.serviceTypeBreakdown.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.serviceType}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        ₹ {formatCurrency(item.amount)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        ₹ {formatCurrency(item.count > 0 ? item.amount / item.count : 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Method Breakdown */}
      {analytics.paymentMethodBreakdown && analytics.paymentMethodBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Payment Method Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Method</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.paymentMethodBreakdown.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.method}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        ₹ {formatCurrency(item.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Stats Summary */}
      {analytics.dailyStats && analytics.dailyStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Daily Summary ({getPeriodLabel()})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {analytics.dailyStats.map((day, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {new Date(day.date).toLocaleDateString('en-IN', { 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-500">{day.jobs} jobs</span>
                    <span className="font-medium text-green-600">
                      ₹{formatCurrency(day.revenue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Business performance trend - load on demand */}
      <AnalyticsLoadSection
        title="Business performance trend"
        description="Compare revenue and jobs across months, weeks, or custom timelines. Overlay previous period or year, compare any two months, or compare two date ranges."
        icon={<TrendingUp />}
        loadLabel="Open trend graph"
        loadingLabel="Opening…"
        onLoad={() => setTrendGraphLoaded(true)}
        loaded={trendGraphLoaded}
        keepActionVisible
        emptyHint="Load the trend graph to explore monthly performance, compare any two months, or compare custom date ranges."
      >
        {analytics ? (
          <AnalyticsTrendGraph
            filterOptions={buildTrendFilterOptions(analytics)}
            dailyStatsFallback={analytics.dailyStats}
            initialRange={{
              startDate: getDateRange().startDate,
              endDate: getDateRange().endDate,
            }}
            analyticsPeriod={trendAnalyticsPeriod}
          />
        ) : null}
      </AnalyticsLoadSection>

      {/* Top locations - load on demand */}
      <AnalyticsLoadSection
        title="Top locations"
        description="Jobs by one-word location (e.g. KR Puram, JP Nagar). Installation includes Installation, Reinstallation, Uninstallation; all other types count as Service."
        icon={<MapPin />}
        loadLabel="Load top locations"
        loadingLabel="Loading top locations…"
        onLoad={() => void loadTopLocations(1, locationPerPage, locationSearch)}
        loading={loadingLocationStats}
        loaded={locationsLoaded}
        emptyHint="Load top locations for the selected period. Uses server-side pagination to save data."
      >
            <>
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  placeholder="Search location..."
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
              {loadingLocationStats && locationRows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground rounded-lg border border-dashed border-border">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading locations…
                </div>
              ) : locationTotal === 0 && !locationSearch.trim() ? (
                <p className="text-sm text-gray-500 text-center py-6 rounded-lg border border-dashed border-gray-200">
                  No location data for this period.
                </p>
              ) : (
                <>
                  <div
                    id="top-locations-list-top"
                    className={cn(ANALYTICS_LIST_SCROLL_ANCHOR_CLASS, 'h-0')}
                    aria-hidden
                  />
                  <div className="relative min-h-[8rem]">
                    <AnalyticsListLoadingOverlay loading={loadingLocationStats} />
                    <div
                      className={cn(
                        'overflow-x-auto transition-opacity duration-150',
                        loadingLocationStats && locationRows.length > 0 && 'opacity-40 pointer-events-none'
                      )}
                    >
                      <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Jobs</TableHead>
                          <TableHead className="text-right">Installation</TableHead>
                          <TableHead className="text-right">Service</TableHead>
                          <TableHead className="text-right">Avg TDS (ppm)</TableHead>
                          <TableHead className="text-right">Avg call billing</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLocationStats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-gray-500 py-6">
                              No locations match your search.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredLocationStats.map((loc) => (
                            <TableRow key={loc.locationKey}>
                              <TableCell className="font-medium">{loc.displayName}</TableCell>
                              <TableCell className="text-right">{loc.jobCount}</TableCell>
                              <TableCell className="text-right">
                                {loc.serviceTypeBreakdown?.Installation ?? '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {loc.serviceTypeBreakdown?.Service ?? '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {loc.avgTds != null ? loc.avgTds : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                ₹ {formatCurrency(loc.avgCallBilling ?? 0)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-green-600">
                                ₹ {formatCurrency(loc.totalRevenue)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                  {locationTotal > 10 ? (
                    <AnalyticsListPagination
                      currentPage={locationPage}
                      totalPages={locationTotalPages}
                      totalItems={locationTotal}
                      itemsPerPage={locationPerPage}
                      itemLabel="locations"
                      scrollAnchorId="top-locations-list-top"
                      loading={loadingLocationStats}
                      onPageChange={(p) => void loadTopLocations(p, locationPerPage, locationSearch)}
                      onItemsPerPageChange={(s) => void loadTopLocations(1, s, locationSearch)}
                    />
                  ) : null}
                </>
              )}
            </>
      </AnalyticsLoadSection>

      {/* Top brands - load on demand */}
      <AnalyticsLoadSection
        title="Top brands"
        description="Jobs grouped by RO brand name for the selected period. Model names are not shown."
        icon={<Award />}
        loadLabel="Load top brands"
        loadingLabel="Loading top brands…"
        onLoad={() => void loadTopBrands(1, brandPerPage, brandSearch)}
        loading={loadingBrandStats}
        loaded={brandsLoaded}
        emptyHint="Load top brands for the selected period."
      >
            <>
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  placeholder="Search brand..."
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
              {loadingBrandStats && brandRows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground rounded-lg border border-dashed border-border">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading brands…
                </div>
              ) : brandTotal === 0 && !brandSearch.trim() ? (
                <p className="text-sm text-gray-500 text-center py-6 rounded-lg border border-dashed border-gray-200">
                  No brand data for this period.
                </p>
              ) : (
                <>
                  <div
                    id="top-brands-list-top"
                    className={cn(ANALYTICS_LIST_SCROLL_ANCHOR_CLASS, 'h-0')}
                    aria-hidden
                  />
                  <div className="relative min-h-[8rem]">
                    <AnalyticsListLoadingOverlay loading={loadingBrandStats} />
                    <div
                      className={cn(
                        'overflow-x-auto transition-opacity duration-150',
                        loadingBrandStats && brandRows.length > 0 && 'opacity-40 pointer-events-none'
                      )}
                    >
                      <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Brand</TableHead>
                          <TableHead className="text-right">Jobs</TableHead>
                          <TableHead className="text-right">Installation</TableHead>
                          <TableHead className="text-right">Service</TableHead>
                          <TableHead className="text-right">Avg call billing</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBrandStats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-gray-500 py-6">
                              No brands match your search.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredBrandStats.map((brand) => (
                            <TableRow key={brand.brandKey}>
                              <TableCell className="font-medium">{brand.displayName}</TableCell>
                              <TableCell className="text-right">{brand.jobCount}</TableCell>
                              <TableCell className="text-right">
                                {brand.serviceTypeBreakdown?.Installation ?? '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {brand.serviceTypeBreakdown?.Service ?? '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                ₹ {formatCurrency(brand.avgCallBilling ?? 0)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-green-600">
                                ₹ {formatCurrency(brand.totalRevenue)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                  {brandTotal > 10 ? (
                    <AnalyticsListPagination
                      currentPage={brandPage}
                      totalPages={brandTotalPages}
                      totalItems={brandTotal}
                      itemsPerPage={brandPerPage}
                      itemLabel="brands"
                      scrollAnchorId="top-brands-list-top"
                      loading={loadingBrandStats}
                      onPageChange={(p) => void loadTopBrands(p, brandPerPage, brandSearch)}
                      onItemsPerPageChange={(s) => void loadTopBrands(1, s, brandSearch)}
                    />
                  ) : null}
                </>
              )}
            </>
      </AnalyticsLoadSection>

      {/* Spare parts usage - lazy: component + data load only when opened */}
      <AnalyticsLoadSection
        title="Spare parts usage"
        description={`Parts logged by technicians for ${getPeriodLabel()}. Loaded on demand.`}
        icon={<Package />}
        loadLabel="Load spare parts usage"
        loadingLabel="Loading spare parts…"
        onLoad={() => setShowSpareParts(true)}
        loaded={showSpareParts}
        emptyHint="Load spare parts usage for the selected period."
      >
            <React.Suspense
              fallback={
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading spare parts usage…
                </div>
              }
            >
              {(() => {
                const { startDate, endDate } = getDateRange();
                return (
                  <SparePartsAnalytics
                    startISO={startDate ? startDate.toISOString() : null}
                    endISO={endDate ? endDate.toISOString() : null}
                  />
                );
              })()}
            </React.Suspense>
      </AnalyticsLoadSection>

      <AnalyticsLoadSection
        title="Direct / website conversions"
        icon={<PhoneForwarded />}
        loadLabel="Load direct / website conversions"
        loadingLabel="Loading conversions…"
        onLoad={loadDirectWebsiteConversions}
        loading={loadingDirectConversion}
        loaded={analytics.directWebsiteConversions !== undefined}
        keepActionVisible
        emptyHint="Load conversion breakdown by first-touch lead source for the selected period."
      >
          {analytics.directWebsiteConversions &&
            analytics.directWebsiteConversions.byOriginalSource.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-6 text-sm">
                  <span className="font-semibold">{analytics.directWebsiteConversions.totalJobs} jobs</span>
                  <span className="font-semibold text-green-600">
                    ₹ {formatCurrency(analytics.directWebsiteConversions.totalRevenue)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>First-touch lead source</TableHead>
                        <TableHead className="text-right">Jobs</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.directWebsiteConversions.byOriginalSource.map((row) => (
                        <TableRow key={row.leadType}>
                          <TableCell className="font-medium">{row.leadType}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            ₹ {formatCurrency(row.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {(analytics.directWebsiteConversions.byTechnician ?? []).length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Technician</TableHead>
                          <TableHead className="text-right">Returns</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(analytics.directWebsiteConversions.byTechnician ?? []).map((row) => (
                          <TableRow key={row.technicianId}>
                            <TableCell className="font-medium">{row.technicianName}</TableCell>
                            <TableCell className="text-right">{row.count}</TableCell>
                            <TableCell className="text-right font-medium text-green-600">
                              ₹ {formatCurrency(row.revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          {analytics.directWebsiteConversions && analytics.directWebsiteConversions.totalJobs === 0 && (
            <p className="text-sm text-gray-500">None for this period.</p>
          )}
      </AnalyticsLoadSection>

      {/* Repeat vs new customers - load on demand */}
      <AnalyticsLoadSection
        title="Repeat vs new customers"
        description={`Customer mix for ${getPeriodLabel()}`}
        icon={<Users />}
        loadLabel="Load repeat vs new customers"
        loadingLabel="Loading customer mix…"
        onLoad={loadRepeatVsNew}
        loading={loadingRepeatVsNew}
        loaded={!!analytics.repeatVsNew}
        emptyHint="Load new vs returning customer breakdown for the selected period."
      >
          {analytics.repeatVsNew && analytics.repeatVsNew.activeCustomers === 0 && (
            <p className="text-sm text-gray-500">No customer activity for this period.</p>
          )}

          {analytics.repeatVsNew && analytics.repeatVsNew.activeCustomers > 0 && (() => {
            const rv = analytics.repeatVsNew!;
            const split = rv.newCustomers + rv.repeatCustomers;
            const newPct = split > 0 ? (rv.newCustomers / split) * 100 : 0;
            const repeatPct = split > 0 ? (rv.repeatCustomers / split) * 100 : 0;
            const maxMonthly = Math.max(
              1,
              ...rv.monthly.map((m) => m.newCustomers + m.returningCustomers)
            );
            return (
              <div className="space-y-5">
                {rv.isAllTime && (
                  <p className="text-xs text-gray-500">
                    All-time view: "new" = customers with a single job; "returning" = customers with
                    repeat jobs. Pick a date range for true period-over-period cohorts.
                  </p>
                )}

                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">Active customers</div>
                    <div className="text-2xl font-bold text-black">{rv.activeCustomers}</div>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="text-xs text-blue-700">New customers</div>
                    <div className="text-2xl font-bold text-blue-700">{rv.newCustomers}</div>
                  </div>
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <div className="text-xs text-green-700">Returning customers</div>
                    <div className="text-2xl font-bold text-green-700">{rv.repeatCustomers}</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">Repeat rate</div>
                    <div className="text-2xl font-bold text-black">{rv.repeatRate.toFixed(1)}%</div>
                  </div>
                </div>

                {/* New vs returning split bar */}
                <div className="space-y-1.5">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-3 bg-blue-500" style={{ width: `${newPct}%` }} />
                    <div className="h-3 bg-green-500" style={{ width: `${repeatPct}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
                      New · {newPct.toFixed(0)}% · ₹ {formatCurrency(rv.newRevenue)}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />
                      Returning · {repeatPct.toFixed(0)}% · ₹ {formatCurrency(rv.repeatRevenue)}
                    </span>
                  </div>
                </div>

                {/* Monthly trend */}
                {rv.monthly.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead>Trend</TableHead>
                          <TableHead className="text-right">New</TableHead>
                          <TableHead className="text-right">Returning</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rv.monthly.map((m) => {
                          const total = m.newCustomers + m.returningCustomers;
                          const nW = (m.newCustomers / maxMonthly) * 100;
                          const rW = (m.returningCustomers / maxMonthly) * 100;
                          return (
                            <TableRow key={m.month}>
                              <TableCell className="font-medium whitespace-nowrap">{m.label}</TableCell>
                              <TableCell className="min-w-[140px]">
                                <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                                  <div className="h-3 bg-blue-500" style={{ width: `${nW}%` }} />
                                  <div className="h-3 bg-green-500" style={{ width: `${rW}%` }} />
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-blue-700 font-medium">
                                {m.newCustomers}
                              </TableCell>
                              <TableCell className="text-right text-green-700 font-medium">
                                {m.returningCustomers}
                              </TableCell>
                              <TableCell className="text-right font-medium text-green-600">
                                ₹ {formatCurrency(m.revenue)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })()}
      </AnalyticsLoadSection>

      {/* Softener Section */}
      {analytics.softenerData && (
        <div className="space-y-6">
          <div className="border-t-4 border-black pt-6">
            <h2 className="text-2xl font-bold text-black mb-4 flex items-center gap-2">
              <Settings className="w-6 h-6" />
              Water Softener Analytics
            </h2>
            
            {/* Softener Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card className="border-gray-300 bg-gray-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Total Softener Jobs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-black">{analytics.softenerData.totalJobs}</div>
                </CardContent>
              </Card>
              
              <Card className="border-gray-300 bg-gray-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-gray-700" />
                    Completed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-black">{analytics.softenerData.completedJobs}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {analytics.softenerData.completionRate.toFixed(1)}% completion rate
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-gray-300 bg-gray-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-700" />
                    Total Billing
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-black">₹ {formatCurrency(analytics.softenerData.totalBilling)}</div>
                </CardContent>
              </Card>
              
              <Card className="border-gray-300 bg-gray-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-gray-700" />
                    Denied/Cancelled
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-black">{analytics.softenerData.deniedJobs}</div>
                </CardContent>
              </Card>
            </div>

            {/* Softener Service Type Breakdown */}
            {analytics.softenerData.serviceTypeBreakdown && analytics.softenerData.serviceTypeBreakdown.length > 0 && (
              <Card className="border-gray-300 mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-black">
                    <BarChart3 className="w-5 h-5" />
                    Softener Service Type Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service Type</TableHead>
                          <TableHead className="text-right">Number of Jobs</TableHead>
                          <TableHead className="text-right">Total Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.softenerData.serviceTypeBreakdown.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.serviceType}</TableCell>
                            <TableCell className="text-right">{item.count}</TableCell>
                            <TableCell className="text-right font-semibold text-green-600">
                              ₹ {formatCurrency(item.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Softener Payment Method Breakdown */}
            {analytics.softenerData.paymentMethodBreakdown && analytics.softenerData.paymentMethodBreakdown.length > 0 && (
              <Card className="border-gray-300 mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-black">
                    <DollarSign className="w-5 h-5" />
                    Softener Payment Method Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Payment Method</TableHead>
                          <TableHead className="text-right">Transactions</TableHead>
                          <TableHead className="text-right">Total Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.softenerData.paymentMethodBreakdown.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.method}</TableCell>
                            <TableCell className="text-right">{item.count}</TableCell>
                            <TableCell className="text-right font-semibold text-green-600">
                              ₹ {formatCurrency(item.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Softener Technician Performance */}
            {analytics.softenerData.technicianStats && analytics.softenerData.technicianStats.length > 0 && (
              <Card className="border-gray-300 mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-black">
                    <Award className="w-5 h-5" />
                    Softener Technician Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Technician</TableHead>
                          <TableHead>Total Jobs</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Completion Rate</TableHead>
                          <TableHead className="text-right">Total Billing ({getPeriodLabel()})</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.softenerData.technicianStats.map((tech) => {
                          const completionRate = tech.totalJobs > 0
                            ? (tech.completedJobs / tech.totalJobs) * 100
                            : 0;
                          
                          return (
                            <TableRow key={tech.id}>
                              <TableCell className="font-medium">{tech.name}</TableCell>
                              <TableCell>{tech.totalJobs}</TableCell>
                              <TableCell className="text-green-600 font-semibold">
                                {tech.completedJobs}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-green-600 h-2 rounded-full"
                                      style={{ width: `${completionRate}%` }}
                                    />
                                  </div>
                                  <span className="text-sm text-gray-600 w-12">
                                    {completionRate.toFixed(0)}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-semibold text-green-600">
                                ₹ {formatCurrency(tech.periodEarnings)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Softener Daily Stats */}
            {analytics.softenerData.dailyStats && analytics.softenerData.dailyStats.length > 0 && (
              <Card className="border-gray-300">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Softener Daily Summary ({getPeriodLabel()})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {analytics.softenerData.dailyStats.map((day, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          {new Date(day.date).toLocaleDateString('en-IN', { 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                        <div className="flex items-center gap-4">
                          <span className="text-gray-500">{day.jobs} jobs</span>
                          <span className="font-medium text-green-600">
                            ₹{formatCurrency(day.revenue)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Profit & Expense Summary - Mobile first */}
      {analytics && (
        <Card className="mt-4 md:mt-8 border-2 border-blue-200 bg-blue-50/30 overflow-hidden">
          <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl flex-wrap">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
              <span>Financial Summary ({getPeriodLabel()})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4 pt-0 sm:px-6 sm:pb-6">
            <div className="space-y-4 md:space-y-6">
              {/* Revenue Section - Stack on mobile, 2 cols on md+ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                <div className="bg-green-50 rounded-lg p-3 sm:p-4 border border-green-200 min-w-0">
                  <div className="text-xs sm:text-sm font-medium text-gray-600 mb-0.5 sm:mb-1">Total Revenue</div>
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold text-green-600 break-all">
                    ₹ {formatCurrency(analytics.totalBilling || 0)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 sm:mt-1">
                    From {analytics.completedJobs || 0} completed jobs
                  </div>
                </div>

                <div className="bg-orange-50 rounded-lg p-3 sm:p-4 border border-orange-200 min-w-0">
                  <div className="text-xs sm:text-sm font-medium text-gray-600 mb-0.5 sm:mb-1">Total Lead Costs</div>
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold text-orange-600 break-all">
                    ₹ {formatCurrency(analytics.totalLeadCosts || 0)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 sm:mt-1">
                    Cost of acquiring leads
                  </div>
                </div>
              </div>

              {/* Expenses Breakdown - Compact rows, no overflow */}
              <div className="bg-red-50 rounded-lg p-3 sm:p-4 border border-red-200 min-w-0">
                <div className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Total Expenses</div>
                {(() => {
                  const coreExpensesTotal =
                    (analytics.totalTechnicianExpenses || 0) +
                    Math.max(0, analytics.totalSalaryDeductions ?? 0) +
                    (analytics.totalBusinessExpenses || 0);
                  const revenue = analytics.totalBilling || 0;
                  const revenueMinusCoreExpenses = revenue - coreExpensesTotal;
                  return (
                    <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                      <div className="flex justify-between gap-2 items-center min-w-0">
                        <span className="text-gray-600 truncate">Technician Expenses:</span>
                        <span className="font-semibold text-red-600 shrink-0 tabular-nums">
                          ₹ {formatCurrency(analytics.totalTechnicianExpenses || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 items-center min-w-0">
                        <span className="text-gray-600 truncate">Total Salary (before advance):</span>
                        <span className="font-semibold text-red-600 shrink-0 tabular-nums">
                          ₹ {formatCurrency(Math.max(0, analytics.totalSalaryDeductions ?? 0))}
                          {analytics.totalSalaryIncludingAll != null &&
                            analytics.totalSalaryIncludingAll > 0 &&
                            analytics.totalSalaryIncludingAll !== (analytics.totalSalaryDeductions ?? 0) && (
                            <> (₹ {formatCurrency(analytics.totalSalaryIncludingAll)})</>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 items-center min-w-0">
                        <span className="text-gray-600 truncate">Business Expenses:</span>
                        <span className="font-semibold text-red-600 shrink-0 tabular-nums">
                          ₹ {formatCurrency(analytics.totalBusinessExpenses || 0)}
                        </span>
                      </div>
                      <div className="pt-1.5 sm:pt-2 mt-1.5 sm:mt-2 border-t border-red-300">
                        <div className="flex justify-between items-center gap-2 min-w-0">
                          <span className="text-sm sm:text-base font-semibold text-gray-700">
                            Total (technician + salary + business):
                          </span>
                          <span className="text-lg sm:text-2xl font-bold text-red-600 shrink-0 tabular-nums">
                            ₹ {formatCurrency(coreExpensesTotal)}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between gap-2 items-center min-w-0 pt-0.5">
                        <span className="text-gray-600 truncate">Revenue (same period):</span>
                        <span className="font-semibold text-green-700 shrink-0 tabular-nums">
                          ₹ {formatCurrency(revenue)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 items-center min-w-0">
                        <span className="text-gray-600 truncate">Revenue − expense (core):</span>
                        <span
                          className={`font-semibold shrink-0 tabular-nums ${
                            revenueMinusCoreExpenses >= 0 ? 'text-green-700' : 'text-red-600'
                          }`}
                        >
                          ₹ {formatCurrency(revenueMinusCoreExpenses)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Job / lead / hidden charges view — same numbers, different grouping; includes net profit */}
              <div className="bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-300 min-w-0">
                <div className="text-xs sm:text-sm font-medium text-gray-800 mb-2 sm:mb-3">
                  Job cost, lead and hidden charges
                </div>
                <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between gap-2 items-center min-w-0">
                    <span className="text-gray-600 truncate">Lead cost (on completed jobs):</span>
                    <span className="font-semibold text-orange-700 shrink-0 tabular-nums">
                      ₹ {formatCurrency(analytics.totalLeadCosts || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 items-center min-w-0">
                    <span className="text-gray-600 truncate">Spare parts (used on jobs):</span>
                    <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                      ₹ {formatCurrency(analytics.totalSparePartsCost || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 items-center min-w-0">
                    <span className="text-gray-600 truncate">Job cost (business expense):</span>
                    <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                      ₹ {formatCurrency(analytics.totalJobCostBusinessExpenses || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 items-center min-w-0">
                    <span className="text-gray-600 truncate">Technician expenses:</span>
                    <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                      ₹ {formatCurrency(analytics.totalTechnicianExpenses || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 items-center min-w-0">
                    <span className="text-gray-600 truncate">Total salary (before advance):</span>
                    <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                      ₹ {formatCurrency(Math.max(0, analytics.totalSalaryDeductions ?? 0))}
                      {analytics.totalSalaryIncludingAll != null &&
                        analytics.totalSalaryIncludingAll > 0 &&
                        analytics.totalSalaryIncludingAll !== (analytics.totalSalaryDeductions ?? 0) && (
                        <> (₹ {formatCurrency(analytics.totalSalaryIncludingAll)})</>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 items-center min-w-0">
                    <span className="text-gray-600 truncate">Other Business charges:</span>
                    <span className="font-semibold text-slate-800 shrink-0 tabular-nums">
                      ₹ {formatCurrency((analytics.totalOtherBusinessExpenses || 0) + (analytics.totalOtherBusinessLedgerExpenses || 0))}
                    </span>
                  </div>
                  <div className="pt-1.5 sm:pt-2 mt-1.5 sm:mt-2 border-t border-slate-300">
                    <div className="flex justify-between items-center gap-2 min-w-0">
                      <span className="text-sm sm:text-base font-semibold text-gray-700">Total costs (all above):</span>
                      <span className="text-lg sm:text-2xl font-bold text-slate-900 shrink-0 tabular-nums">
                        ₹{' '}
                        {formatCurrency(
                          (analytics.totalLeadCosts || 0) +
                            (analytics.totalSparePartsCost || 0) +
                            (analytics.totalJobCostBusinessExpenses || 0) +
                            (analytics.totalTechnicianExpenses || 0) +
                            Math.max(0, analytics.totalSalaryDeductions ?? 0) +
                            (analytics.totalOtherBusinessExpenses || 0) +
                            (analytics.totalOtherBusinessLedgerExpenses || 0)
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-300">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-800">Net profit</div>
                        <div className="text-xs text-gray-500">Revenue − total costs above</div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        {(() => {
                          const revenue = analytics.totalBilling || 0;
                          const lead = analytics.totalLeadCosts || 0;
                          const spare = analytics.totalSparePartsCost || 0;
                          const jobCost = analytics.totalJobCostBusinessExpenses || 0;
                          const tech = analytics.totalTechnicianExpenses || 0;
                          const salary = Math.max(0, analytics.totalSalaryDeductions ?? 0);
                          const otherBusinessOtherTable = analytics.totalOtherBusinessExpenses || 0;
                          const otherBusinessLedger = analytics.totalOtherBusinessLedgerExpenses || 0;

                          const totalCostsBefore = lead + spare + jobCost + tech + salary + otherBusinessOtherTable;
                          const totalCostsAfter = totalCostsBefore + otherBusinessLedger;

                          const profitBefore = revenue - totalCostsBefore;
                          const profitAfter = revenue - totalCostsAfter;

                          const marginPctBefore = formatProfitMarginPercent(profitBefore, revenue);
                          const marginPctAfter = formatProfitMarginPercent(profitAfter, revenue);

                          return (
                            <>
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="text-xs text-gray-500">Before other business expense</div>
                                <span
                                  className={`text-xl sm:text-2xl font-bold tabular-nums ${
                                    profitBefore >= 0 ? 'text-green-700' : 'text-red-600'
                                  }`}
                                >
                                  ₹ {formatCurrency(profitBefore)}
                                </span>
                                {marginPctBefore != null && (
                                  <span
                                    className={`text-xs font-semibold tabular-nums ${
                                      profitBefore >= 0 ? 'text-green-700/90' : 'text-red-600/90'
                                    }`}
                                  >
                                    {marginPctBefore}% of revenue
                                  </span>
                                )}
                              </div>

                              {otherBusinessLedger > 0 && (
                                <div className="mt-2 flex flex-col items-end gap-0.5">
                                  <div className="text-xs text-gray-500">After other business expense</div>
                                  <span
                                    className={`text-xl sm:text-2xl font-bold tabular-nums ${
                                      profitAfter >= 0 ? 'text-green-700' : 'text-red-600'
                                    }`}
                                  >
                                    ₹ {formatCurrency(profitAfter)}
                                  </span>
                                  {marginPctAfter != null && (
                                    <span
                                      className={`text-xs font-semibold tabular-nums ${
                                        profitAfter >= 0 ? 'text-green-700/90' : 'text-red-600/90'
                                      }`}
                                    >
                                      {marginPctAfter}% of revenue
                                    </span>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Profit Section - Stack on mobile, row on md+ */}
              <div className="bg-blue-100 rounded-lg p-4 sm:p-5 md:p-6 border-2 border-blue-300 min-w-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-700">Net Cash in Hand</div>
                    <div className="text-xs text-gray-600">
                      Revenue − business expenses − salary − technician expenses
                    </div>
                  </div>
                  <div className="flex flex-col items-end sm:items-end gap-0.5 shrink-0 text-right">
                    {(() => {
                      const marginPct = formatProfitMarginPercent(
                        analytics.netCashInHand || 0,
                        analytics.totalBilling || 0
                      );
                      return (
                        <>
                          <div
                            className={`text-2xl sm:text-3xl md:text-4xl font-bold tabular-nums ${
                              (analytics.netCashInHand || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            ₹ {formatCurrency(analytics.netCashInHand || 0)}
                          </div>
                          {marginPct != null && (
                            <div
                              className={`text-sm sm:text-base font-semibold tabular-nums ${
                                (analytics.netCashInHand || 0) >= 0 ? 'text-green-700' : 'text-red-600'
                              }`}
                            >
                              {marginPct}% of revenue
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="rounded-lg p-4 sm:p-5 border-2 border-violet-200 bg-violet-50/60 min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <Heart className="w-5 h-5 text-violet-600 shrink-0" />
                  <div className="text-sm font-semibold text-gray-800">Ishanga 7%</div>
                </div>
                <div className="flex justify-between gap-2 items-center text-xs sm:text-sm">
                  <span className="text-gray-700">7% × (Revenue − business − salary − technician)</span>
                  <span className="font-semibold text-violet-700 shrink-0 tabular-nums">
                    ₹ {formatCurrency(analytics.ishaDonationAmount || 0)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      </>
      )}
    </div>
  );
};

export default Analytics;

