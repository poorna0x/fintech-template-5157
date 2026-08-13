/**
 * Single-calendar-month salary breakdown for Netlify cron.
 * Mirrors TechnicianPayments formulas for one month (not multi-month range UI).
 */
'use strict';

const BILLING_SLAB_COMMISSION_EFFECTIVE_MONTH = '2026-04';
const LEGACY_SALARY_EFFECTIVE_MONTH = '1900-01';
const LEGACY_BASE_SALARY = 8000;
const PRESENT_OVERRIDE_REASON = 'MARKED_AS_PRESENT';
const HALF_DAY_REASON = 'MARKED_AS_HALF_DAY';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Format a Date instant as YYYY-MM-DD in Asia/Kolkata. */
function formatDateString(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}-${pad2(ist.getUTCDate())}`;
}

function getMonthKey(date) {
  return formatDateString(date).slice(0, 7);
}

/** UTC Date for an IST wall-clock datetime. month is 1-12. */
function istWallTimeToUtcDate(year, month, day, h = 0, min = 0, s = 0, ms = 0) {
  return new Date(Date.UTC(year, month - 1, day, h, min, s, ms) - IST_OFFSET_MS);
}

function getIstMonthBounds(year, month /* 1-12 */) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: istWallTimeToUtcDate(year, month, 1, 0, 0, 0, 0),
    endDate: istWallTimeToUtcDate(year, month, lastDay, 23, 59, 59, 999),
    periodStartStr: `${year}-${pad2(month)}-01`,
    periodEndStr: `${year}-${pad2(month)}-${pad2(lastDay)}`,
    lastDay,
  };
}

function eachIstDateInRange(periodStartStr, periodEndStr, cutoffStr) {
  const out = [];
  const end = cutoffStr < periodEndStr ? cutoffStr : periodEndStr;
  let [y, m, d] = periodStartStr.split('-').map(Number);
  const endParts = end.split('-').map(Number);
  while (
    y < endParts[0] ||
    (y === endParts[0] && m < endParts[1]) ||
    (y === endParts[0] && m === endParts[1] && d <= endParts[2])
  ) {
    const dateStr = `${y}-${pad2(m)}-${pad2(d)}`;
    out.push(dateStr);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }
  return out;
}

function readBaseSalaryFromSalaryObject(salary, legacyDefault = 8000) {
  if (!salary || typeof salary !== 'object') return legacyDefault;
  const raw = salary.baseSalary;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return legacyDefault;
  return n;
}

function normalizeMonthKey(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}

function normalizeTechnicianSalaryHistory(salary, fallbackBaseSalary) {
  if (!salary || typeof salary !== 'object') return [];
  const rawHistory = salary.history;
  if (!Array.isArray(rawHistory)) return [];

  const byMonth = new Map();
  rawHistory.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const effectiveFrom = normalizeMonthKey(entry.effectiveFrom);
    const rawAmount = entry.amount;
    const amount =
      typeof rawAmount === 'number'
        ? rawAmount
        : typeof rawAmount === 'string'
          ? parseFloat(rawAmount)
          : NaN;
    if (!effectiveFrom || !Number.isFinite(amount) || amount < 0) return;
    byMonth.set(effectiveFrom, amount);
  });

  return Array.from(byMonth.entries())
    .map(([effectiveFrom, amount]) => ({ effectiveFrom, amount }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

function getTechnicianMonthlyBaseSalary(tech, legacyDefault = 8000, salaryDate) {
  const salary = tech?.salary;
  const fallbackBaseSalary = readBaseSalaryFromSalaryObject(salary, legacyDefault);
  if (!salaryDate) return fallbackBaseSalary;

  const monthKey = getMonthKey(salaryDate);
  const history = normalizeTechnicianSalaryHistory(salary, fallbackBaseSalary);
  if (history.length === 0) {
    return monthKey < getMonthKey(new Date()) ? legacyDefault : fallbackBaseSalary;
  }
  const matchingEntries = history.filter((entry) => entry.effectiveFrom <= monthKey);
  const matchingEntry = matchingEntries[matchingEntries.length - 1];
  return matchingEntry?.amount ?? fallbackBaseSalary;
}

function getTechnicianDailyBaseSalary(tech, date) {
  return getTechnicianMonthlyBaseSalary(tech, 8000, date) / 30;
}

function calculateBillingSlabCommission(monthlyBilling) {
  if (monthlyBilling > 175000 && monthlyBilling < 200000) return 2000;
  if (monthlyBilling < 200000) return 0;
  const base = (Math.floor((monthlyBilling - 200000) / 100000) + 1) * 5000;
  const offsetWithinLakh = monthlyBilling % 100000;
  const extra = offsetWithinLakh >= 75000 ? 2000 : 0;
  return base + extra;
}

function calculateTechnicianBillingSlabCommission(jobs) {
  const billingByMonth = new Map();
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

function isPresentOverride(holiday) {
  return holiday?.reason === PRESENT_OVERRIDE_REASON;
}
function isHalfDayHoliday(holiday) {
  return holiday?.reason === HALF_DAY_REASON;
}
function getHolidayAttendanceWeight(holiday) {
  return isHalfDayHoliday(holiday) ? 0.5 : 1;
}

/**
 * @param {object} opts
 * @param {object} opts.tech - technician row (incl. salary jsonb)
 * @param {Date} opts.startDate - month start local-ish Date
 * @param {Date} opts.endDate - month end
 * @param {object[]} opts.payments
 * @param {object[]} opts.expenses
 * @param {object[]} opts.advances
 * @param {object[]} opts.extraCommissions
 * @param {object[]} opts.holidays
 * @param {object[]} opts.completedJobs
 * @param {Date} [opts.today] - attendance cutoff (defaults to now)
 */
function buildSingleMonthSalaryBreakdown(opts) {
  const {
    tech,
    startDate,
    endDate,
    payments = [],
    expenses = [],
    advances = [],
    extraCommissions = [],
    holidays = [],
    completedJobs = [],
  } = opts;

  const todayForHolidays = opts.today ? new Date(opts.today) : new Date();
  todayForHolidays.setHours(0, 0, 0, 0);
  const todayStrForHolidays = formatDateString(todayForHolidays);

  const techId = tech.id;
  const periodStartStr = formatDateString(startDate);
  const periodEndStr = formatDateString(endDate);
  const inclusiveMonthCount = 1;
  const allowedHolidays = 4 * inclusiveMonthCount;

  const monthlyBaseSalary = getTechnicianMonthlyBaseSalary(tech, 8000, startDate);
  const periodBaseSalary = monthlyBaseSalary;

  const techPayments = payments.filter((p) => p.technician_id === techId);
  const techCompletedJobsForCommission = completedJobs.filter(
    (j) => j.assigned_technician_id === techId
  );

  let totalCommission = techPayments.reduce(
    (sum, payment) => sum + (payment.commission_amount || 0),
    0
  );
  const jobsWithPayments = new Set(techPayments.map((p) => p.job_id));
  const jobsWithoutPayments = techCompletedJobsForCommission.filter(
    (j) => !jobsWithPayments.has(j.id)
  );
  totalCommission += jobsWithoutPayments.reduce((sum, job) => {
    const billAmount = parseFloat(job.actual_cost || job.payment_amount || 0);
    return sum + billAmount * 0.1;
  }, 0);

  const totalBillAmount = techCompletedJobsForCommission.reduce((sum, job) => {
    return sum + parseFloat(job.actual_cost || job.payment_amount || 0);
  }, 0);

  const techExpenses = expenses.filter((e) => {
    if (e.technician_id !== techId) return false;
    const d = String(e.expense_date || '').split('T')[0];
    return d >= periodStartStr && d <= periodEndStr;
  });
  const totalExpenses = techExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const techAdvances = advances.filter((a) => {
    if (a.technician_id !== techId) return false;
    const d = String(a.advance_date || a.created_at || '').split('T')[0];
    return d >= periodStartStr && d <= periodEndStr;
  });
  const totalAdvances = techAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);

  const techExtraCommissions = extraCommissions.filter((ec) => {
    if (ec.technician_id !== techId) return false;
    const d = String(ec.commission_date || '').split('T')[0];
    return d >= periodStartStr && d <= periodEndStr;
  });
  const billingSlabCommission = calculateTechnicianBillingSlabCommission(
    techCompletedJobsForCommission
  );
  const totalExtraCommission =
    techExtraCommissions.reduce((sum, ec) => sum + (ec.amount || 0), 0) + billingSlabCommission;

  const techHolidays = holidays.filter((h) => h.technician_id === techId);
  const techCompletedJobs = techCompletedJobsForCommission;
  const datesWithJobs = new Set();
  techCompletedJobs.forEach((job) => {
    const completionDate = job.end_time || job.completed_at;
    if (completionDate) {
      datesWithJobs.add(formatDateString(new Date(completionDate)));
    }
  });

  const allDates = eachIstDateInRange(periodStartStr, periodEndStr, todayStrForHolidays);

  const autoDetectedHolidays = [];
  allDates.forEach((date) => {
    const hasJobsOnDate = datesWithJobs.has(date);
    if (date <= todayStrForHolidays && !hasJobsOnDate) {
      const existingHoliday = techHolidays.find(
        (h) => String(h.holiday_date).split('T')[0] === date
      );
      if (!existingHoliday || !isPresentOverride(existingHoliday)) {
        autoDetectedHolidays.push(date);
      }
    }
  });

  const holidayWeights = new Map();
  techHolidays.forEach((h) => {
    const holidayDate = String(h.holiday_date).split('T')[0];
    const endDateStr = formatDateString(endDate);
    if (
      holidayDate <= todayStrForHolidays &&
      holidayDate >= periodStartStr &&
      holidayDate <= endDateStr &&
      !isPresentOverride(h)
    ) {
      holidayWeights.set(
        holidayDate,
        Math.max(holidayWeights.get(holidayDate) || 0, getHolidayAttendanceWeight(h))
      );
    }
  });
  autoDetectedHolidays.forEach((date) => {
    if (date >= periodStartStr && date <= todayStrForHolidays) {
      const existingHoliday = techHolidays.find(
        (h) => String(h.holiday_date).split('T')[0] === date
      );
      if (!existingHoliday) {
        holidayWeights.set(date, 1);
      } else if (!isPresentOverride(existingHoliday)) {
        holidayWeights.set(
          date,
          Math.max(holidayWeights.get(date) || 0, getHolidayAttendanceWeight(existingHoliday))
        );
      }
    }
  });

  const displayHolidays = techHolidays.filter((h) => !isPresentOverride(h));
  autoDetectedHolidays.forEach((date) => {
    if (!displayHolidays.some((h) => String(h.holiday_date).split('T')[0] === date)) {
      displayHolidays.push({
        id: `auto-${date}`,
        technician_id: techId,
        holiday_date: date,
        is_manual: false,
        reason: 'No completed jobs - auto-detected as absent',
      });
    }
  });
  displayHolidays.sort(
    (a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime()
  );

  const totalHolidays = Array.from(holidayWeights.values()).reduce((sum, weight) => sum + weight, 0);
  const extraHolidays = Math.max(0, totalHolidays - allowedHolidays);
  const sortedHolidayDays = displayHolidays
    .filter((h) => holidayWeights.has(String(h.holiday_date).split('T')[0]))
    .sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime());

  const absentDays = [];
  let remainingExtraHolidayUnits = extraHolidays;
  for (const holiday of sortedHolidayDays) {
    if (remainingExtraHolidayUnits <= 0) break;
    absentDays.push(holiday);
    remainingExtraHolidayUnits -= Math.min(
      holidayWeights.get(String(holiday.holiday_date).split('T')[0]) ||
        getHolidayAttendanceWeight(holiday),
      remainingExtraHolidayUnits
    );
  }
  absentDays.sort(
    (a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime()
  );

  remainingExtraHolidayUnits = extraHolidays;
  const holidayDeduction = absentDays.reduce((sum, holiday) => {
    const holidayDate = String(holiday.holiday_date).split('T')[0];
    const chargeableUnits = Math.min(
      holidayWeights.get(holidayDate) || getHolidayAttendanceWeight(holiday),
      remainingExtraHolidayUnits
    );
    remainingExtraHolidayUnits -= chargeableUnits;
    return (
      sum + getTechnicianDailyBaseSalary(tech, new Date(holiday.holiday_date)) * chargeableUnits
    );
  }, 0);

  const unusedLeaves = Math.max(0, allowedHolidays - totalHolidays);
  const averageDailyBaseSalary = periodBaseSalary / (30 * inclusiveMonthCount);
  const unusedLeaveBonus = unusedLeaves * averageDailyBaseSalary;
  const adjustedBaseSalary = periodBaseSalary - holidayDeduction + unusedLeaveBonus;

  const dailyBilling = new Map();
  techCompletedJobs.forEach((job) => {
    const completionDate = job.end_time || job.completed_at;
    if (completionDate) {
      const jobDate = formatDateString(new Date(completionDate));
      const billAmount = parseFloat(job.actual_cost || job.payment_amount || 0);
      dailyBilling.set(jobDate, (dailyBilling.get(jobDate) || 0) + billAmount);
    }
  });

  const todayStr = todayStrForHolidays;

  const dailyBreakdown = allDates
    .filter((date) => date <= todayStr)
    .map((date) => {
      const billAmount = dailyBilling.get(date) || 0;
      const hasJobsOnDate = datesWithJobs.has(date);
      const presentOverride = techHolidays.find(
        (h) => String(h.holiday_date).split('T')[0] === date && isPresentOverride(h)
      );
      const halfDayHoliday = techHolidays.find(
        (h) => String(h.holiday_date).split('T')[0] === date && isHalfDayHoliday(h)
      );
      const manualAbsentHoliday = techHolidays.find(
        (h) =>
          String(h.holiday_date).split('T')[0] === date &&
          !isPresentOverride(h) &&
          !isHalfDayHoliday(h) &&
          h.is_manual === true
      );
      let isAbsent;
      let status;
      if (presentOverride) {
        isAbsent = false;
        status = 'present';
      } else if (halfDayHoliday) {
        isAbsent = false;
        status = 'halfDay';
      } else if (manualAbsentHoliday) {
        isAbsent = true;
        status = 'absent';
      } else {
        isAbsent = !hasJobsOnDate && holidayWeights.has(date);
        status = isAbsent ? 'absent' : 'present';
      }
      return { date, billAmount, isAbsent, status };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const salaryBeforeAdvance = adjustedBaseSalary + totalCommission + totalExtraCommission;
  const totalSalary = salaryBeforeAdvance - totalAdvances;

  return {
    technicianId: techId,
    technicianName: tech.full_name || 'Unknown',
    employeeId: tech.employee_id || '',
    baseSalary: monthlyBaseSalary,
    periodBaseSalary,
    adjustedBaseSalary,
    totalCommission,
    totalExtraCommission,
    billingSlabCommission,
    totalExpenses,
    totalAdvances,
    totalHolidays,
    allowedHolidays,
    extraHolidays,
    unusedLeaves,
    unusedLeaveBonus,
    holidayDeduction,
    salaryBeforeAdvance,
    totalSalary,
    totalBillAmount,
    payments: techPayments,
    expenses: techExpenses,
    advances: techAdvances,
    extraCommissions: techExtraCommissions,
    holidays: absentDays,
    dailyBreakdown,
  };
}

/**
 * Load source rows for a calendar month and build breakdowns for given techs.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ year: number, month: number, technicians: object[], today?: Date }} opts
 *   month is 1-12
 */
async function loadMonthSalaryBreakdowns(db, opts) {
  const year = opts.year;
  const month = opts.month; // 1-12
  const { startDate, endDate, periodStartStr, periodEndStr } = getIstMonthBounds(year, month);
  const technicians = opts.technicians || [];
  const today = opts.today || endDate;

  const [
    paymentsRes,
    expensesRes,
    advancesRes,
    extraCommissionsRes,
    holidaysRes,
    completedJobsRes,
  ] = await Promise.all([
    db
      .from('technician_payments')
      .select(
        `
        id,
        technician_id,
        job_id,
        bill_amount,
        commission_percentage,
        commission_amount,
        payment_status,
        payment_date,
        created_at,
        job:jobs(id, job_number)
      `
      )
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString()),
    db
      .from('technician_expenses')
      .select('id, technician_id, amount, expense_date, description, created_at')
      .gte('expense_date', periodStartStr)
      .lte('expense_date', periodEndStr),
    db
      .from('technician_advances')
      .select('id, technician_id, amount, description, advance_date, created_at')
      .gte('advance_date', periodStartStr)
      .lte('advance_date', periodEndStr),
    db
      .from('technician_extra_commissions')
      .select('id, technician_id, amount, description, commission_date, created_at')
      .gte('commission_date', periodStartStr)
      .lte('commission_date', periodEndStr),
    db
      .from('technician_holidays')
      .select('id, technician_id, holiday_date, is_manual, reason, notes')
      .gte('holiday_date', periodStartStr)
      .lte('holiday_date', periodEndStr),
    db
      .from('jobs')
      .select(
        'id, assigned_technician_id, end_time, completed_at, actual_cost, payment_amount'
      )
      .eq('status', 'COMPLETED')
      .not('end_time', 'is', null)
      .gte('end_time', startDate.toISOString())
      .lte('end_time', endDate.toISOString()),
  ]);

  const payments = paymentsRes.data || [];
  const expenses = expensesRes.data || [];
  const advances = advancesRes.data || [];
  const extraCommissions = extraCommissionsRes.data || [];
  const holidays = holidaysRes.data || [];
  const completedJobs = completedJobsRes.data || [];

  const period = { start: startDate, end: endDate };
  const breakdowns = technicians.map((tech) =>
    buildSingleMonthSalaryBreakdown({
      tech,
      startDate,
      endDate,
      payments,
      expenses,
      advances,
      extraCommissions,
      holidays,
      completedJobs,
      today,
    })
  );

  return {
    period,
    periodStartStr,
    periodEndStr,
    monthKey: `${year}-${pad2(month)}`,
    breakdowns,
    errors: {
      payments: paymentsRes.error?.message || null,
      expenses: expensesRes.error?.message || null,
      advances: advancesRes.error?.message || null,
      extraCommissions: extraCommissionsRes.error?.message || null,
      holidays: holidaysRes.error?.message || null,
      completedJobs: completedJobsRes.error?.message || null,
    },
  };
}

module.exports = {
  formatDateString,
  getMonthKey,
  getIstMonthBounds,
  getTechnicianMonthlyBaseSalary,
  getTechnicianDailyBaseSalary,
  calculateBillingSlabCommission,
  calculateTechnicianBillingSlabCommission,
  buildSingleMonthSalaryBreakdown,
  loadMonthSalaryBreakdowns,
  LEGACY_BASE_SALARY,
  LEGACY_SALARY_EFFECTIVE_MONTH,
};
