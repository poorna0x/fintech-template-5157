import { getTodayLocalDate } from '@/lib/adminDashboardDateHelpers';
import { parseJobRequirements, ZERO_COMMISSION_EMPLOYEE_ID } from '@/lib/adminUtils';
import type { Technician } from '@/types';

export function isZeroCommissionCompletedJob(
  job: any,
  technicians: Technician[],
  techniciansForReports: Technician[]
): boolean {
  const completedBy = String(job?.completed_by || job?.completedBy || '').trim();
  if (completedBy === ZERO_COMMISSION_EMPLOYEE_ID) return true;

  const technicianPool = techniciansForReports.length > 0 ? techniciansForReports : technicians;
  return technicianPool.some((tech: any) => {
    const technicianId = String(tech.id || '').trim();
    const employeeId = String(tech.employee_id || tech.employeeId || '').trim();
    return (
      employeeId === ZERO_COMMISSION_EMPLOYEE_ID &&
      (completedBy === technicianId || completedBy === employeeId)
    );
  });
}

export function getCompletedJobBillAmount(job: any): number {
  const paymentAmount = Number(job?.payment_amount ?? job?.paymentAmount ?? 0) || 0;
  const actualCost = Number(job?.actual_cost ?? job?.actualCost ?? 0) || 0;
  let billAmount = paymentAmount > 0 ? paymentAmount : actualCost;

  if (billAmount <= 0 && (job?.payment_method || job?.paymentMethod) === 'PARTIAL') {
    const requirements = parseJobRequirements(job?.requirements || []);
    const partialReq = requirements.find(
      (r: any) => r?.partial_cash_amount != null || r?.partial_online_amount != null
    );
    if (partialReq) {
      const cash = Number(partialReq.partial_cash_amount) || 0;
      const online = Number(partialReq.partial_online_amount) || 0;
      if (cash + online > 0) billAmount = cash + online;
    }
  }

  return billAmount;
}

export function calculateCompletedJobProfit(
  job: any,
  technicians: Technician[],
  techniciansForReports: Technician[]
) {
  const revenue = getCompletedJobBillAmount(job);
  const sparePartsCost = Number(job?.parts_cost_total ?? job?.partsCostTotal ?? 0) || 0;
  const leadCost = Number(job?.lead_cost ?? job?.leadCost ?? 0) || 0;
  const commission = isZeroCommissionCompletedJob(job, technicians, techniciansForReports) ? 0 : revenue * 0.1;
  return {
    revenue,
    sparePartsCost,
    leadCost,
    commission,
    profit: revenue - sparePartsCost - leadCost - commission,
  };
}

export function shouldShowCompletedProfitSummary(params: {
  statusFilter: string;
  completedDatePreset: string;
  completedDateFilter: string;
  completedLeadTypeFilter: string;
  completedServiceSubTypeFilter: string;
  completedByFilter: string;
  searchTerm: string;
}): boolean {
  return (
    params.statusFilter === 'COMPLETED' &&
    params.completedDatePreset === 'day' &&
    params.completedDateFilter === getTodayLocalDate() &&
    params.completedLeadTypeFilter === 'all' &&
    params.completedServiceSubTypeFilter === 'all' &&
    params.completedByFilter === 'all' &&
    !params.searchTerm.trim()
  );
}

export function buildCompletedProfitSummary(
  displayedCustomers: { completedJobs: any[] }[],
  technicians: Technician[],
  techniciansForReports: Technician[]
) {
  return displayedCustomers
    .flatMap(({ completedJobs }) => completedJobs)
    .reduce(
      (totals, job) => {
        const financials = calculateCompletedJobProfit(job, technicians, techniciansForReports);
        totals.jobCount += 1;
        totals.revenue += financials.revenue;
        totals.sparePartsCost += financials.sparePartsCost;
        totals.leadCost += financials.leadCost;
        totals.commission += financials.commission;
        totals.profit += financials.profit;
        return totals;
      },
      {
        jobCount: 0,
        revenue: 0,
        sparePartsCost: 0,
        leadCost: 0,
        commission: 0,
        profit: 0,
      }
    );
}
