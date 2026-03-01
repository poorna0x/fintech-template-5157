/**
 * Shared salary calculation that matches the Technician Payments section.
 * Use this in Analytics when period is "This month" or "Previous month" so the
 * Total Salary figure matches what Payments shows.
 */
import { db, supabase } from '@/lib/supabase';

const EXCLUDED_EMPLOYEE_ID = 'TECH851703400'; // Excluded from Total Salary / profit (same as Analytics)

function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface TotalSalaryForMonthResult {
  totalSalary: number;
  totalSalaryIncludingAll: number;
}

/**
 * Computes total salary for a calendar month using the same logic as TechnicianPayments.
 * Returns the same figure that Payments section shows for that month.
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
    { data: advancesData },
    { data: extraCommissionsData },
    { data: holidaysData },
  ] = await Promise.all([
    db.technicians.getAll(100),
    supabase
      .from('technician_payments')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString()),
    db.technicianAdvances.getAll(),
    db.technicianExtraCommissions.getAll(),
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
  const advances = advancesData || [];
  const extraCommissions = extraCommissionsData || [];
  const holidays = holidaysData || [];
  const completedJobs = completedJobsData || [];

  let totalSalary = 0;
  let totalSalaryIncludingAll = 0;

  const allowedHolidays = 4;
  const dailyDivisor = 30;

  for (const tech of allTechnicians) {
    const techId = tech.id;
    const employeeId = tech.employee_id ?? (tech as any).employeeId ?? '';
    const monthlyBaseSalary =
      (tech.salary && typeof tech.salary === 'object' && (tech.salary as any).baseSalary)
        ? (tech.salary as any).baseSalary
        : 8000;
    const periodBaseSalary = monthlyBaseSalary;
    const dailyBaseSalary = monthlyBaseSalary / dailyDivisor;

    const techPayments = payments.filter((p: any) => p.technician_id === techId);
    const techAdvances = advances.filter((a: any) => {
      if (a.technician_id !== techId) return false;
      const advanceDate = (a as any).advance_date?.split?.('T')[0] ?? (a as any).advance_date;
      return advanceDate >= periodStartStr && advanceDate <= periodEndStr;
    });
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

    const totalExtraCommission = techExtraCommissions.reduce((sum: number, ec: any) => sum + (ec.amount || 0), 0);
    const totalAdvances = techAdvances.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);

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

    const techTotalSalary = adjustedBaseSalary + totalCommission + totalExtraCommission - totalAdvances;
    const amount = Math.max(0, techTotalSalary);
    totalSalaryIncludingAll += amount;

    if (employeeId === EXCLUDED_EMPLOYEE_ID) continue;
    totalSalary += amount;
  }

  return { totalSalary, totalSalaryIncludingAll };
}
