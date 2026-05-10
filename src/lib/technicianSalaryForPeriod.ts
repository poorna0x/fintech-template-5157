/**
 * Shared salary calculation that matches the Technician Payments section.
 * Analytics uses salary before advance (adjusted base + commission + extra).
 */
import { db, supabase } from '@/lib/supabase';

const EXCLUDED_EMPLOYEE_ID = 'TECH851703400'; // Excluded from Total Salary / profit (same as Analytics)
const BILLING_SLAB_COMMISSION_EFFECTIVE_MONTH = '2026-04';
const LEGACY_SALARY_EFFECTIVE_MONTH = '1900-01';
const LEGACY_BASE_SALARY = 8000;

export interface TechnicianSalaryHistoryEntry {
  amount: number;
  effectiveFrom: string; // YYYY-MM
}

function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readBaseSalaryFromSalaryObject(salary: unknown, legacyDefault = 8000): number {
  if (!salary || typeof salary !== 'object') return legacyDefault;
  const raw = (salary as Record<string, unknown>).baseSalary;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return legacyDefault;
  return n;
}

function normalizeMonthKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

export function getCurrentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function normalizeTechnicianSalaryHistory(
  salary: unknown,
  fallbackBaseSalary: number
): TechnicianSalaryHistoryEntry[] {
  if (!salary || typeof salary !== 'object') return [];
  const rawHistory = (salary as Record<string, unknown>).history;
  if (!Array.isArray(rawHistory)) return [];

  const byMonth = new Map<string, number>();
  rawHistory.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const effectiveFrom = normalizeMonthKey(record.effectiveFrom);
    const rawAmount = record.amount;
    const amount =
      typeof rawAmount === 'number'
        ? rawAmount
        : typeof rawAmount === 'string'
          ? parseFloat(rawAmount)
          : NaN;
    if (!effectiveFrom || !Number.isFinite(amount) || amount < 0) return;
    byMonth.set(effectiveFrom, amount);
  });

  const history = Array.from(byMonth.entries())
    .map(([effectiveFrom, amount]) => ({ effectiveFrom, amount }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  return history;
}

export function buildTechnicianSalaryPayload(
  currentSalary: unknown,
  nextBaseSalary: number,
  effectiveFromMonth: string
) {
  const safeBaseSalary = Number.isFinite(nextBaseSalary) && nextBaseSalary >= 0 ? nextBaseSalary : 0;
  const previousBaseSalary = readBaseSalaryFromSalaryObject(currentSalary, safeBaseSalary);
  const effectiveFrom = normalizeMonthKey(effectiveFromMonth) || getCurrentMonthKey();
  const history = normalizeTechnicianSalaryHistory(currentSalary, previousBaseSalary);
  if (
    history.length === 0 &&
    currentSalary &&
    typeof currentSalary === 'object' &&
    effectiveFrom > LEGACY_SALARY_EFFECTIVE_MONTH
  ) {
    history.push({ amount: LEGACY_BASE_SALARY, effectiveFrom: LEGACY_SALARY_EFFECTIVE_MONTH });
  }
  const existingIndex = history.findIndex((entry) => entry.effectiveFrom === effectiveFrom);

  if (existingIndex >= 0) {
    history[existingIndex] = { amount: safeBaseSalary, effectiveFrom };
  } else {
    history.push({ amount: safeBaseSalary, effectiveFrom });
  }

  history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  return {
    ...(currentSalary && typeof currentSalary === 'object' ? currentSalary : {}),
    baseSalary: safeBaseSalary,
    commissionPerJob: (currentSalary as any)?.commissionPerJob ?? 0,
    commissionPercentage: (currentSalary as any)?.commissionPercentage ?? 10,
    history,
  };
}

/** Reads salary history for a month, falling back to `salary.baseSalary` when history is missing. */
export function getTechnicianMonthlyBaseSalary(
  tech: any,
  legacyDefault = 8000,
  salaryDate?: Date
): number {
  const salary = tech?.salary;
  const fallbackBaseSalary = readBaseSalaryFromSalaryObject(salary, legacyDefault);
  if (!salaryDate) return fallbackBaseSalary;

  const monthKey = getCurrentMonthKey(salaryDate);
  const history = normalizeTechnicianSalaryHistory(salary, fallbackBaseSalary);
  if (history.length === 0) {
    return monthKey < getCurrentMonthKey() ? legacyDefault : fallbackBaseSalary;
  }
  const matchingEntries = history.filter((entry) => entry.effectiveFrom <= monthKey);
  const matchingEntry = matchingEntries[matchingEntries.length - 1];
  return matchingEntry?.amount ?? fallbackBaseSalary;
}

function getMonthKey(date: Date): string {
  return getCurrentMonthKey(date);
}

export function getTechnicianBaseSalaryForPeriod(tech: any, startDate: Date, endDate: Date): number {
  let total = 0;
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const finalMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cursor <= finalMonth) {
    total += getTechnicianMonthlyBaseSalary(tech, 8000, cursor);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return total;
}

export function getTechnicianDailyBaseSalary(tech: any, date: Date): number {
  return getTechnicianMonthlyBaseSalary(tech, 8000, date) / 30;
}

export function calculateBillingSlabCommission(monthlyBilling: number): number {
  if (monthlyBilling > 170000 && monthlyBilling < 200000) return 2000;
  if (monthlyBilling >= 200000) {
    return (Math.floor((monthlyBilling - 200000) / 100000) + 1) * 5000;
  }
  return 0;
}

export function calculateTechnicianBillingSlabCommission(
  jobs: Array<{
    end_time?: string | null;
    completed_at?: string | null;
    actual_cost?: number | string | null;
    payment_amount?: number | string | null;
  }>
): number {
  const billingByMonth = new Map<string, number>();

  jobs.forEach((job) => {
    const completionDate = job.end_time || job.completed_at;
    if (!completionDate) return;

    const monthKey = getMonthKey(new Date(completionDate));
    if (monthKey < BILLING_SLAB_COMMISSION_EFFECTIVE_MONTH) return;

    const parsedBillAmount = parseFloat(String(job.actual_cost || job.payment_amount || 0));
    const billAmount = Number.isFinite(parsedBillAmount) ? parsedBillAmount : 0;
    billingByMonth.set(monthKey, (billingByMonth.get(monthKey) || 0) + billAmount);
  });

  return Array.from(billingByMonth.values()).reduce(
    (sum, monthlyBilling) => sum + calculateBillingSlabCommission(monthlyBilling),
    0
  );
}

export interface TotalSalaryForMonthResult {
  /** Adjusted base + commission + extra (before deducting advances). Same as Payments “salary before advance”. */
  totalSalaryBeforeAdvance: number;
  totalSalaryBeforeAdvanceIncludingAll: number;
}

/**
 * Computes totals for a calendar month using the same logic as TechnicianPayments (salary before advance).
 */
export async function getTotalSalaryForCalendarMonth(
  year: number,
  month: number // 1-12
): Promise<TotalSalaryForMonthResult> {
  const monthIndex = month - 1;
  const startDate = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const periodStartStr = formatDateString(startDate);
  const periodEndStr = formatDateString(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateString(today);

  const [
    { data: technicians },
    { data: paymentsData },
    { data: extraCommissionsData },
    { data: holidaysData },
  ] = await Promise.all([
    db.technicians.getAll(100),
    supabase
      .from('technician_payments')
      .select('technician_id, job_id, commission_amount')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString()),
    db.technicianExtraCommissions.getAll(undefined, periodStartStr, periodEndStr),
    db.technicianHolidays.getAll(undefined, periodStartStr, periodEndStr),
  ]);

  const { data: completedJobsData } = await supabase
    .from('jobs')
    .select('id, assigned_technician_id, end_time, completed_at, actual_cost, payment_amount')
    .eq('status', 'COMPLETED')
    .not('end_time', 'is', null)
    .gte('end_time', startDate.toISOString())
    .lte('end_time', endDate.toISOString());

  const allTechnicians = technicians || [];
  const payments = paymentsData || [];
  const extraCommissions = extraCommissionsData || [];
  const holidays = holidaysData || [];
  const completedJobs = completedJobsData || [];

  let totalSalaryBeforeAdvance = 0;
  let totalSalaryBeforeAdvanceIncludingAll = 0;

  const allowedHolidays = 4;
  const dailyDivisor = 30;

  for (const tech of allTechnicians) {
    const techId = tech.id;
    const employeeId = tech.employee_id ?? (tech as any).employeeId ?? '';
    const monthlyBaseSalary = getTechnicianMonthlyBaseSalary(tech, 8000, startDate);
    const periodBaseSalary = monthlyBaseSalary;
    const dailyBaseSalary = monthlyBaseSalary / dailyDivisor;

    const techPayments = payments.filter((p: any) => p.technician_id === techId);
    const techExtraCommissions = extraCommissions.filter((ec: any) => {
      if (ec.technician_id !== techId) return false;
      const d = (ec.commission_date || '').split('T')[0];
      return d >= periodStartStr && d <= periodEndStr;
    });

    let totalCommission = techPayments.reduce((sum: number, p: any) => sum + (p.commission_amount || 0), 0);
    const techCompletedJobs = completedJobs.filter((j: any) => j.assigned_technician_id === techId);
    const jobsWithPayments = new Set(techPayments.map((p: any) => p.job_id));
    const jobsWithoutPayments = techCompletedJobs.filter((j: any) => !jobsWithPayments.has(j.id));
    const defaultCommission = jobsWithoutPayments.reduce((sum: number, j: any) => {
      const billAmount = parseFloat(j.actual_cost || j.payment_amount || 0);
      return sum + billAmount * 0.1;
    }, 0);
    totalCommission += defaultCommission;

    const billingSlabCommission = calculateTechnicianBillingSlabCommission(techCompletedJobs);
    const totalExtraCommission =
      techExtraCommissions.reduce((sum: number, ec: any) => sum + (ec.amount || 0), 0) +
      billingSlabCommission;

    const techHolidays = holidays.filter((h: any) => h.technician_id === techId);
    const datesWithJobs = new Set<string>();
    techCompletedJobs.forEach((job: any) => {
      const completionDate = job.end_time || job.completed_at;
      if (completionDate) {
        const jobDate = formatDateString(new Date(completionDate));
        datesWithJobs.add(jobDate);
      }
    });

    const allDates: string[] = [];
    const currentDate = new Date(startDate);
    const cutoffDate = new Date(endDate > today ? today : endDate);
    while (currentDate <= cutoffDate) {
      const dateStr = formatDateString(currentDate);
      if (dateStr >= periodStartStr && dateStr <= todayStr) allDates.push(dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const allHolidayDates = new Set<string>();
    techHolidays.forEach((h: any) => {
      const holidayDate = (h.holiday_date || '').split('T')[0];
      if (holidayDate <= todayStr && holidayDate >= periodStartStr && holidayDate <= periodEndStr && h.reason !== 'MARKED_AS_PRESENT') {
        allHolidayDates.add(holidayDate);
      }
    });
    allDates.forEach((date) => {
      if (date <= todayStr && !datesWithJobs.has(date)) {
        const existingHoliday = techHolidays.find((h: any) => (h.holiday_date || '').split('T')[0] === date);
        if (!existingHoliday || existingHoliday.reason !== 'MARKED_AS_PRESENT') {
          if (date >= periodStartStr && date <= todayStr) allHolidayDates.add(date);
        }
      }
    });

    const totalHolidays = allHolidayDates.size;
    const extraHolidays = Math.max(0, totalHolidays - allowedHolidays);
    const holidayDeduction = extraHolidays * dailyBaseSalary;
    const unusedLeaves = Math.max(0, allowedHolidays - totalHolidays);
    const unusedLeaveBonus = unusedLeaves * dailyBaseSalary;
    const adjustedBaseSalary = periodBaseSalary - holidayDeduction + unusedLeaveBonus;

    const salaryBeforeAdvance =
      adjustedBaseSalary + totalCommission + totalExtraCommission;
    totalSalaryBeforeAdvanceIncludingAll += salaryBeforeAdvance;

    if (employeeId === EXCLUDED_EMPLOYEE_ID) continue;
    totalSalaryBeforeAdvance += salaryBeforeAdvance;
  }

  return { totalSalaryBeforeAdvance, totalSalaryBeforeAdvanceIncludingAll };
}
