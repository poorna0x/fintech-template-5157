import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { DollarSign, User, Plus, Trash2, Edit, TrendingDown, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Pencil, Check, X, ChevronLeft, ChevronRight, Eye, TrendingUp as TrendingUpIcon, Download, Printer, Users as UsersIcon, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { generateSalarySlipPDF } from '@/lib/salary-slip-pdf-generator';
import {
  calculateTechnicianBillingSlabCommission,
  getTechnicianBaseSalaryForPeriod,
  getTechnicianDailyBaseSalary,
  getTechnicianMonthlyBaseSalary,
} from '@/lib/technicianSalaryForPeriod';

interface TechnicianPayment {
  id: string;
  technician_id: string;
  job_id: string;
  bill_amount: number;
  commission_percentage: number;
  commission_amount: number;
  payment_status: 'PENDING' | 'PAID' | 'CANCELLED';
  payment_date?: string;
  created_at?: string;
  technician?: {
    id: string;
    full_name: string;
    employee_id: string;
  };
  job?: {
    id: string;
    job_number: string;
  };
}

interface TechnicianExpense {
  id: string;
  technician_id: string;
  amount: number;
  description: string;
  expense_date: string;
  category?: string;
  notes?: string;
}

interface TechnicianAdvance {
  id: string;
  technician_id: string;
  amount: number;
  description?: string;
  advance_date: string;
  payment_method?: string;
  payment_reference?: string;
  notes?: string;
}

interface TechnicianExtraCommission {
  id: string;
  technician_id: string;
  amount: number;
  description: string;
  commission_date: string;
  payment_method?: string;
  payment_reference?: string;
  notes?: string;
}

interface TechnicianHoliday {
  id: string;
  technician_id: string;
  holiday_date: string;
  is_manual: boolean;
  reason?: string;
  notes?: string;
}

type AttendanceStatus = 'present' | 'halfDay' | 'absent';

interface DailyBreakdown {
  date: string;
  billAmount: number;
  isAbsent: boolean;
  status: AttendanceStatus;
}

interface TechnicianMonthlySalaryBreakdown {
  monthKey: string;
  monthLabel: string;
  totalBillAmount: number;
  adjustedBaseSalary: number;
  totalCommission: number;
  totalExtraCommission: number;
  billingSlabCommission: number;
  salaryBeforeAdvance: number;
  totalAdvances: number;
  totalSalary: number;
  totalExpenses: number;
  totalHolidays: number;
  extraHolidays: number;
  unusedLeaves: number;
}

interface TechnicianSalaryBreakdown {
  technicianId: string;
  technicianName: string;
  employeeId: string;
  baseSalary: number; // Monthly base salary
  periodBaseSalary: number; // Base salary for the period (monthly * months)
  adjustedBaseSalary: number; // After holiday deductions and unused leave bonus
  totalCommission: number;
  totalExtraCommission: number;
  billingSlabCommission: number;
  totalExpenses: number;
  totalAdvances: number;
  totalHolidays: number;
  allowedHolidays: number;
  extraHolidays: number;
  unusedLeaves: number; // Number of unused leaves (if less than 4 used)
  unusedLeaveBonus: number; // Bonus amount for unused leaves
  holidayDeduction: number;
  /** Adjusted base + commission + extra (before deducting advances). */
  salaryBeforeAdvance: number;
  totalSalary: number; // Net after advances (can be negative)
  totalBillAmount: number; // Total billing done by this technician in the period
  payments: TechnicianPayment[];
  expenses: TechnicianExpense[];
  advances: TechnicianAdvance[];
  extraCommissions: TechnicianExtraCommission[];
  holidays: TechnicianHoliday[];
  dailyBreakdown: DailyBreakdown[]; // Daily billing breakdown
  monthlyBreakdowns?: TechnicianMonthlySalaryBreakdown[];
}

// Helper function to format currency with commas and without .00 when it's zero
const formatCurrency = (amount: number): string => {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
};

const formatLeaveDays = (days: number): string => {
  if (Number.isInteger(days)) return String(days);
  return days.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });
};

const PRESENT_OVERRIDE_REASON = 'MARKED_AS_PRESENT';
const HALF_DAY_REASON = 'MARKED_AS_HALF_DAY';

const isPresentOverride = (holiday: TechnicianHoliday): boolean => holiday.reason === PRESENT_OVERRIDE_REASON;
const isHalfDayHoliday = (holiday: TechnicianHoliday): boolean => holiday.reason === HALF_DAY_REASON;
const getHolidayAttendanceWeight = (holiday: TechnicianHoliday): number => (isHalfDayHoliday(holiday) ? 0.5 : 1);

/** Nearest ancestor that can scroll horizontally (expense/daily-breakdown tables, etc.). */
const getHorizontalScrollParent = (el: Element): HTMLElement | null => {
  let node: Element | null = el;
  while (node && node instanceof HTMLElement && node !== document.body) {
    const { overflowX } = window.getComputedStyle(node);
    if (
      (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
      node.scrollWidth > node.clientWidth + 2
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

/** Don't treat touches on tables, buttons, or inputs as technician carousel swipes. */
const shouldBlockTechCardSwipe = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof Element)) return false;
  if (target.closest('[data-no-tech-swipe]')) return true;
  if (target.closest('button, a, input, textarea, select, label, [role="button"]')) return true;
  return getHorizontalScrollParent(target) !== null;
};

const TechnicianPayments = () => {
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [salaryBreakdowns, setSalaryBreakdowns] = useState<TechnicianSalaryBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTechnician, setSelectedTechnician] = useState<string | null>(null);
  const [commissionPeriod, setCommissionPeriod] = useState<{ start: Date; end: Date } | null>(null);
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'current' | 'pastMonth' | 'rangeToCurrent'>('current');
  const [selectedPastMonth, setSelectedPastMonth] = useState<string>(() => {
    // Default to previous month
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  });

  const [selectedRangeEndMonth, setSelectedRangeEndMonth] = useState<string>(() => {
    // Default end month = current month (so range "feels" like up-to-this-month initially)
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  // Technician filter for the salary breakdown cards.
  //   `selectedTechFilterIds`  – exact technician IDs to show.
  //     • length === 0 && !techFilterShowNone  → "all technicians" (default).
  //     • length === 0 && techFilterShowNone   → "no technicians" (explicit empty).
  //     • length > 0                            → only those IDs.
  const [selectedTechFilterIds, setSelectedTechFilterIds] = useState<string[]>([]);
  const [techFilterShowNone, setTechFilterShowNone] = useState(false);
  const [techFilterPopoverOpen, setTechFilterPopoverOpen] = useState(false);
  const [showDailyDetails, setShowDailyDetails] = useState<Record<string, boolean>>({});
  const [showExpensesTable, setShowExpensesTable] = useState<Record<string, boolean>>({});
  const [showAdvancesTable, setShowAdvancesTable] = useState<Record<string, boolean>>({});
  const [showExtraCommissionsTable, setShowExtraCommissionsTable] = useState<Record<string, boolean>>({});
  // Mobile-only single-card carousel state. Desktop ignores this and stacks cards.
  const [mobileTechIndex, setMobileTechIndex] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 639px)').matches;
  });
  const techSwipeStartXRef = useRef<number | null>(null);
  const techSwipeStartYRef = useRef<number | null>(null);
  const techSwipeBlockedRef = useRef(false);
  const techSwipeScrollLeftStartRef = useRef<number | null>(null);
  const [dailyBreakdownPage, setDailyBreakdownPage] = useState<Record<string, number>>({}); // technicianId -> page number
  const itemsPerPage = 10; // Show 10 days per page
  
  // Expense dialog
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<TechnicianExpense | null>(null);
  const [expenseFormData, setExpenseFormData] = useState({
    technician_id: '',
    amount: '',
    description: '',
    expense_date: new Date().toISOString().split('T')[0],
    category: 'OTHER',
    notes: ''
  });

  // Advance dialog
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState<TechnicianAdvance | null>(null);
  const [advanceFormData, setAdvanceFormData] = useState({
    technician_id: '',
    amount: '',
    description: '',
    advance_date: new Date().toISOString().split('T')[0],
    payment_method: 'CASH',
    payment_reference: '',
    notes: ''
  });

  // Extra commission dialog
  const [extraCommissionDialogOpen, setExtraCommissionDialogOpen] = useState(false);
  const [editingExtraCommission, setEditingExtraCommission] = useState<TechnicianExtraCommission | null>(null);
  const [extraCommissionFormData, setExtraCommissionFormData] = useState({
    technician_id: '',
    amount: '',
    description: '',
    commission_date: new Date().toISOString().split('T')[0],
    payment_method: 'CASH',
    payment_reference: '',
    notes: ''
  });

  // Holiday dialog
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<TechnicianHoliday | null>(null);
  const [holidayFormData, setHolidayFormData] = useState({
    technician_id: '',
    holiday_date: new Date().toISOString().split('T')[0],
    reason: '',
    notes: ''
  });

  // Daily breakdown edit dialog
  const [dailyBreakdownEditDialogOpen, setDailyBreakdownEditDialogOpen] = useState(false);
  const [editingDailyBreakdown, setEditingDailyBreakdown] = useState<{
    technicianId: string;
    date: string;
    isAbsent: boolean;
    status: AttendanceStatus;
  } | null>(null);
  const [dailyBreakdownFormData, setDailyBreakdownFormData] = useState({
    status: 'present' as AttendanceStatus
  });

  // Salary slip download dialog
  const [salarySlipDialogOpen, setSalarySlipDialogOpen] = useState(false);
  const [selectedBreakdownForSlip, setSelectedBreakdownForSlip] = useState<TechnicianSalaryBreakdown | null>(null);
  const [includeDayWiseBreakdown, setIncludeDayWiseBreakdown] = useState(true);

  // Business expenses
  const [businessExpenses, setBusinessExpenses] = useState<Array<{
    id: string;
    amount: number;
    description: string;
    expense_date: string;
    category?: string;
    notes?: string;
  }>>([]);
  const [businessExpenseDialogOpen, setBusinessExpenseDialogOpen] = useState(false);
  const [editingBusinessExpense, setEditingBusinessExpense] = useState<any>(null);
  const [businessExpenseFormData, setBusinessExpenseFormData] = useState({
    amount: '',
    description: '',
    expense_date: new Date().toISOString().split('T')[0],
    category: 'OTHER',
    notes: ''
  });

  // Job details dialog
  const [jobDetailsDialogOpen, setJobDetailsDialogOpen] = useState(false);
  const [selectedDateForJobs, setSelectedDateForJobs] = useState<{technicianId: string; date: string} | null>(null);
  const [jobsForDate, setJobsForDate] = useState<any[]>([]);
  const [loadingJobsForDate, setLoadingJobsForDate] = useState(false);
  const [editingJobCommission, setEditingJobCommission] = useState<{jobId: string; commissionPercentage: number} | null>(null);
  const [editingJobAmount, setEditingJobAmount] = useState<{jobId: string; amount: number} | null>(null);

  // Lazy load: salary breakdown only when needed (not when only adding business/technician expense)
  const [salaryDataLoaded, setSalaryDataLoaded] = useState(false);
  const [loadingSalaryBreakdowns, setLoadingSalaryBreakdowns] = useState(false);
  const salarySectionRef = useRef<HTMLDivElement>(null);

  const getMonthlyDateRange = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate: Date;
    let endDate: Date;
    
    if (selectedPeriod === 'pastMonth') {
      const [year, month] = selectedPastMonth.split('-').map(Number);
      const selectedMonthIndex = month - 1;
      startDate = new Date(year, selectedMonthIndex, 1, 0, 0, 0, 0);
      endDate = new Date(year, selectedMonthIndex + 1, 0, 23, 59, 59, 999);
    } else if (selectedPeriod === 'rangeToCurrent') {
      const [fromYear, fromMonth] = selectedPastMonth.split('-').map(Number);
      const [toYear, toMonth] = selectedRangeEndMonth.split('-').map(Number);

      const fromMonthIndex = fromYear * 12 + (fromMonth - 1);
      const toMonthIndex = toYear * 12 + (toMonth - 1);

      // Ensure start <= end even if user picks reversed months.
      const startMonthIndex = Math.min(fromMonthIndex, toMonthIndex);
      const endMonthIndex = Math.max(fromMonthIndex, toMonthIndex);

      const startYear = Math.floor(startMonthIndex / 12);
      const startMonth = (startMonthIndex % 12) + 1;
      const endYear = Math.floor(endMonthIndex / 12);
      const endMonth = (endMonthIndex % 12) + 1;

      startDate = new Date(startYear, startMonth - 1, 1, 0, 0, 0, 0);
      endDate = new Date(endYear, endMonth, 0, 23, 59, 59, 999);
    } else {
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      startDate = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
      endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    }
    
    return { startDate, endDate };
  }, [selectedPeriod, selectedPastMonth, selectedRangeEndMonth]);

  const formatDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /** Minimal initial load: only technicians + period. No business expenses or salary data. */
  const loadTechniciansOnly = useCallback(async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getMonthlyDateRange();
      setCommissionPeriod({ start: startDate, end: endDate });
      const techsResult = await db.technicians.getAll(100, { activeRosterOnly: true });
      if (techsResult.error) throw techsResult.error;
      setTechnicians(techsResult.data || []);
    } catch (error: any) {
      console.error('Error loading initial data:', error);
      toast.error('Failed to load: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [getMonthlyDateRange]);

  const [businessExpensesViewed, setBusinessExpensesViewed] = useState(false);
  const [loadingBusinessExpenses, setLoadingBusinessExpenses] = useState(false);

  // Other expenses (same pattern as business expenses - load only when View clicked)
  const [otherExpenses, setOtherExpenses] = useState<Array<{
    id: string;
    amount: number;
    description: string;
    expense_date: string;
    category?: string;
    notes?: string;
  }>>([]);
  const [otherExpenseDialogOpen, setOtherExpenseDialogOpen] = useState(false);
  const [editingOtherExpense, setEditingOtherExpense] = useState<any>(null);
  const [otherExpenseFormData, setOtherExpenseFormData] = useState({
    amount: '',
    description: '',
    expense_date: new Date().toISOString().split('T')[0],
    category: 'OTHER',
    notes: ''
  });
  const [otherExpensesViewed, setOtherExpensesViewed] = useState(false);
  const [loadingOtherExpenses, setLoadingOtherExpenses] = useState(false);

  /** Refetch only business expenses (e.g. after add/edit/delete or when user clicks View). */
  const loadBusinessExpensesOnly = useCallback(async () => {
    const { startDate, endDate } = getMonthlyDateRange();
    const periodStartStr = startDate.toISOString().split('T')[0];
    const periodEndStr = endDate.toISOString().split('T')[0];
    const { data, error } = await db.businessExpenses.getAll(periodStartStr, periodEndStr);
    if (!error) setBusinessExpenses(data || []);
  }, [getMonthlyDateRange]);

  /** Load business expenses and mark section as viewed. Call when user clicks "View" on business expenses. */
  const handleViewBusinessExpenses = useCallback(async () => {
    setBusinessExpensesViewed(true);
    setLoadingBusinessExpenses(true);
    await loadBusinessExpensesOnly();
    setLoadingBusinessExpenses(false);
  }, [loadBusinessExpensesOnly]);

  /** Refetch only other expenses. */
  const loadOtherExpensesOnly = useCallback(async () => {
    const { startDate, endDate } = getMonthlyDateRange();
    const periodStartStr = startDate.toISOString().split('T')[0];
    const periodEndStr = endDate.toISOString().split('T')[0];
    const { data, error } = await db.otherExpenses.getAll(periodStartStr, periodEndStr);
    if (!error) setOtherExpenses(data || []);
  }, [getMonthlyDateRange]);

  /** Load other expenses when user clicks View. */
  const handleViewOtherExpenses = useCallback(async () => {
    setOtherExpensesViewed(true);
    setLoadingOtherExpenses(true);
    await loadOtherExpensesOnly();
    setLoadingOtherExpenses(false);
  }, [loadOtherExpensesOnly]);

  /** Heavy load: salary breakdowns. Only call when user needs to see the table (lazy) or after period change if already loaded. */
  const loadSalaryBreakdownData = useCallback(async (showLoading: boolean = true) => {
    const techs = technicians;
    if (!techs.length) return;
    try {
      if (showLoading) setLoadingSalaryBreakdowns(true);
      const { startDate, endDate } = getMonthlyDateRange();
      setCommissionPeriod({ start: startDate, end: endDate });
      const periodStartStr = formatDateString(startDate);
      const periodEndStr = formatDateString(endDate);

      const [
        paymentsRes,
        expensesRes,
        advancesRes,
        extraCommissionsRes,
        holidaysRes,
        completedJobsRes
      ] = await Promise.all([
        supabase
          .from('technician_payments')
          .select(`
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
          `)
          .gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString()),
        db.technicianExpenses.getAll(undefined, periodStartStr, periodEndStr),
        db.technicianAdvances.getAll(undefined, periodStartStr, periodEndStr),
        db.technicianExtraCommissions.getAll(undefined, periodStartStr, periodEndStr),
        db.technicianHolidays.getAll(undefined, periodStartStr, periodEndStr),
        supabase.from('jobs').select('id, assigned_technician_id, end_time, completed_at, actual_cost, payment_amount')
          .eq('status', 'COMPLETED').not('end_time', 'is', null)
          .gte('end_time', startDate.toISOString()).lte('end_time', endDate.toISOString())
      ]);

      if (paymentsRes.error) throw paymentsRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (advancesRes.error) throw advancesRes.error;
      if (extraCommissionsRes.error) throw extraCommissionsRes.error;
      if (holidaysRes.error) throw holidaysRes.error;
      if (completedJobsRes.error) throw completedJobsRes.error;

      const paymentsData = paymentsRes.data || [];
      const expensesData = expensesRes.data || [];
      const advancesData = advancesRes.data || [];
      const extraCommissionsData = extraCommissionsRes.data || [];
      const holidaysData = holidaysRes.data || [];
      const completedJobsData = completedJobsRes.data || [];
      setCompletedJobs(completedJobsData);

      const todayForHolidays = new Date();
      todayForHolidays.setHours(0, 0, 0, 0);
      const todayStrForHolidays = formatDateString(todayForHolidays);

      // How many full calendar months are included (inclusive).
      // Example: Feb -> Mar => 2 months.
      const inclusiveMonthCount =
        (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1;

      const monthRanges: Array<{ monthKey: string; monthLabel: string; start: Date; end: Date }> = [];
      const monthCursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const finalMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      while (monthCursor <= finalMonth) {
        const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1, 0, 0, 0, 0);
        const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0, 23, 59, 59, 999);
        monthRanges.push({
          monthKey: `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`,
          monthLabel: monthCursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
          start: monthStart,
          end: monthEnd,
        });
        monthCursor.setMonth(monthCursor.getMonth() + 1);
      }

      const calculateMonthlyBreakdown = (
        tech: any,
        monthRange: { monthKey: string; monthLabel: string; start: Date; end: Date }
      ): TechnicianMonthlySalaryBreakdown => {
        const techId = tech.id;
        const monthStartStr = formatDateString(monthRange.start);
        const monthEndStr = formatDateString(monthRange.end);
        const monthlyBaseSalary = getTechnicianMonthlyBaseSalary(tech, 8000, monthRange.start);
        const allowedHolidays = 4;

        const techPaymentsForCommission = paymentsData.filter((p: TechnicianPayment) => {
          if (p.technician_id !== techId) return false;
          const d = (p.created_at || '').split('T')[0];
          return d >= monthStartStr && d <= monthEndStr;
        });
        const techCompletedJobsForCommission = completedJobsData.filter((j: any) => {
          if (j.assigned_technician_id !== techId) return false;
          const completionDate = j.end_time || j.completed_at;
          if (!completionDate) return false;
          const d = formatDateString(new Date(completionDate));
          return d >= monthStartStr && d <= monthEndStr;
        });

        let totalCommission = techPaymentsForCommission.reduce((sum: number, payment: TechnicianPayment) => sum + (payment.commission_amount || 0), 0);
        const jobsWithPayments = new Set(techPaymentsForCommission.map((p: TechnicianPayment) => p.job_id));
        const jobsWithoutPayments = techCompletedJobsForCommission.filter((j: any) => !jobsWithPayments.has(j.id));
        totalCommission += jobsWithoutPayments.reduce((sum: number, job: any) => {
          const billAmount = parseFloat(job.actual_cost || job.payment_amount || 0);
          return sum + (billAmount * 0.10);
        }, 0);

        const totalBillAmount = techCompletedJobsForCommission.reduce((sum: number, job: any) => {
          return sum + parseFloat(job.actual_cost || job.payment_amount || 0);
        }, 0);

        const techExpenses = expensesData.filter((e: TechnicianExpense) => {
          if (e.technician_id !== techId) return false;
          const d = e.expense_date.split('T')[0];
          return d >= monthStartStr && d <= monthEndStr;
        });
        const totalExpenses = techExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        const techAdvances = advancesData.filter((a: TechnicianAdvance) => {
          if (a.technician_id !== techId) return false;
          const d = (a as any).advance_date?.split?.('T')[0] ?? (a as any).advance_date;
          return d >= monthStartStr && d <= monthEndStr;
        });
        const totalAdvances = techAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);

        const techExtraCommissions = extraCommissionsData.filter((ec: TechnicianExtraCommission) => {
          if (ec.technician_id !== techId) return false;
          const d = ec.commission_date.split('T')[0];
          return d >= monthStartStr && d <= monthEndStr;
        });
        const billingSlabCommission = calculateTechnicianBillingSlabCommission(techCompletedJobsForCommission);
        const totalExtraCommission =
          techExtraCommissions.reduce((sum, ec) => sum + (ec.amount || 0), 0) +
          billingSlabCommission;

        const techHolidays = holidaysData.filter((h: TechnicianHoliday) => h.technician_id === techId);
        const datesWithJobs = new Set<string>();
        techCompletedJobsForCommission.forEach((job: any) => {
          const completionDate = job.end_time || job.completed_at;
          if (completionDate) datesWithJobs.add(formatDateString(new Date(completionDate)));
        });

        const allDates: string[] = [];
        const currentDate = new Date(monthRange.start);
        currentDate.setHours(0, 0, 0, 0);
        const cutoffDate = new Date(monthRange.end > todayForHolidays ? todayForHolidays : monthRange.end);
        cutoffDate.setHours(0, 0, 0, 0);
        while (currentDate <= cutoffDate) {
          const dateStr = formatDateString(new Date(currentDate));
          if (dateStr >= monthStartStr && dateStr <= todayStrForHolidays) allDates.push(dateStr);
          currentDate.setDate(currentDate.getDate() + 1);
        }

        const holidayWeights = new Map<string, number>();
        techHolidays.forEach(h => {
          const holidayDate = h.holiday_date.split('T')[0];
          if (holidayDate <= todayStrForHolidays && holidayDate >= monthStartStr && holidayDate <= monthEndStr && !isPresentOverride(h)) {
            holidayWeights.set(holidayDate, Math.max(holidayWeights.get(holidayDate) || 0, getHolidayAttendanceWeight(h)));
          }
        });
        allDates.forEach(date => {
          if (date <= todayStrForHolidays && !datesWithJobs.has(date)) {
            const existingHoliday = techHolidays.find(h => h.holiday_date.split('T')[0] === date);
            if (!existingHoliday) {
              holidayWeights.set(date, 1);
            } else if (!isPresentOverride(existingHoliday)) {
              holidayWeights.set(date, Math.max(holidayWeights.get(date) || 0, getHolidayAttendanceWeight(existingHoliday)));
            }
          }
        });

        const displayHolidays: TechnicianHoliday[] = [];
        techHolidays.forEach(h => {
          const holidayDate = h.holiday_date.split('T')[0];
          if (holidayWeights.has(holidayDate) && !isPresentOverride(h)) displayHolidays.push(h);
        });
        holidayWeights.forEach((_weight, date) => {
          if (!displayHolidays.some(h => h.holiday_date.split('T')[0] === date)) {
            displayHolidays.push({ id: `auto-${date}`, technician_id: techId, holiday_date: date, is_manual: false, reason: 'No completed jobs - auto-detected as absent' });
          }
        });

        const totalHolidays = Array.from(holidayWeights.values()).reduce((sum, weight) => sum + weight, 0);
        const extraHolidays = Math.max(0, totalHolidays - allowedHolidays);
        const sortedHolidayDays = displayHolidays
          .filter(h => holidayWeights.has(h.holiday_date.split('T')[0]))
          .sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime());
        const absentDays: TechnicianHoliday[] = [];
        let remainingExtraHolidayUnits = extraHolidays;
        for (const holiday of sortedHolidayDays) {
          if (remainingExtraHolidayUnits <= 0) break;
          absentDays.push(holiday);
          remainingExtraHolidayUnits -= Math.min(
            holidayWeights.get(holiday.holiday_date.split('T')[0]) || getHolidayAttendanceWeight(holiday),
            remainingExtraHolidayUnits
          );
        }
        remainingExtraHolidayUnits = extraHolidays;
        const holidayDeduction = absentDays.reduce((sum, holiday) => {
          const holidayDate = holiday.holiday_date.split('T')[0];
          const chargeableUnits = Math.min(holidayWeights.get(holidayDate) || getHolidayAttendanceWeight(holiday), remainingExtraHolidayUnits);
          remainingExtraHolidayUnits -= chargeableUnits;
          return sum + (getTechnicianDailyBaseSalary(tech, new Date(holiday.holiday_date)) * chargeableUnits);
        }, 0);
        const unusedLeaves = Math.max(0, allowedHolidays - totalHolidays);
        const unusedLeaveBonus = unusedLeaves * (monthlyBaseSalary / 30);
        const adjustedBaseSalary = monthlyBaseSalary - holidayDeduction + unusedLeaveBonus;
        const salaryBeforeAdvance = adjustedBaseSalary + totalCommission + totalExtraCommission;
        const totalSalary = salaryBeforeAdvance - totalAdvances;

        return {
          monthKey: monthRange.monthKey,
          monthLabel: monthRange.monthLabel,
          totalBillAmount,
          adjustedBaseSalary,
          totalCommission,
          totalExtraCommission,
          billingSlabCommission,
          salaryBeforeAdvance,
          totalAdvances,
          totalSalary,
          totalExpenses,
          totalHolidays,
          extraHolidays,
          unusedLeaves,
        };
      };

      const breakdowns: TechnicianSalaryBreakdown[] = techs.map((tech: any) => {
        const techId = tech.id;
        const monthlyBaseSalary = getTechnicianMonthlyBaseSalary(tech, 8000, startDate);
        const periodBaseSalary = getTechnicianBaseSalaryForPeriod(tech, startDate, endDate);
        const allowedHolidays = 4 * inclusiveMonthCount;

        const techPayments = paymentsData.filter((p: TechnicianPayment) => p.technician_id === techId);
        const techPaymentsForCommission = paymentsData.filter((p: TechnicianPayment) => p.technician_id === techId);
        const techCompletedJobsForCommission = completedJobsData.filter((j: any) => j.assigned_technician_id === techId);

        let totalCommission = techPaymentsForCommission.reduce((sum: number, payment: TechnicianPayment) => sum + (payment.commission_amount || 0), 0);
        const jobsWithPayments = new Set(techPaymentsForCommission.map((p: TechnicianPayment) => p.job_id));
        const jobsWithoutPayments = techCompletedJobsForCommission.filter((j: any) => !jobsWithPayments.has(j.id));
        totalCommission += jobsWithoutPayments.reduce((sum: number, job: any) => {
          const billAmount = parseFloat(job.actual_cost || job.payment_amount || 0);
          return sum + (billAmount * 0.10);
        }, 0);

        const totalBillAmount = techCompletedJobsForCommission.reduce((sum: number, job: any) => {
          return sum + parseFloat(job.actual_cost || job.payment_amount || 0);
        }, 0);

        const techExpenses = expensesData.filter((e: TechnicianExpense) => {
          if (e.technician_id !== techId) return false;
          const d = e.expense_date.split('T')[0];
          return d >= periodStartStr && d <= periodEndStr;
        });
        const totalExpenses = techExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

        const techAdvances = advancesData.filter((a: TechnicianAdvance) => {
          if (a.technician_id !== techId) return false;
          const d = (a as any).advance_date?.split?.('T')[0] ?? (a as any).advance_date;
          return d >= periodStartStr && d <= periodEndStr;
        });
        const totalAdvances = techAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);

        const techExtraCommissions = extraCommissionsData.filter((ec: TechnicianExtraCommission) => {
          if (ec.technician_id !== techId) return false;
          const d = ec.commission_date.split('T')[0];
          return d >= periodStartStr && d <= periodEndStr;
        });
        const billingSlabCommission = calculateTechnicianBillingSlabCommission(techCompletedJobsForCommission);
        const totalExtraCommission =
          techExtraCommissions.reduce((sum, ec) => sum + (ec.amount || 0), 0) +
          billingSlabCommission;

        const techHolidays = holidaysData.filter((h: TechnicianHoliday) => h.technician_id === techId);
        const techCompletedJobs = completedJobsData.filter((j: any) => j.assigned_technician_id === techId);
        const datesWithJobs = new Set<string>();
        const dailyBillingForHolidays = new Map<string, number>();
        techCompletedJobs.forEach((job: any) => {
          const completionDate = job.end_time || job.completed_at;
          if (completionDate) {
            const jobDate = formatDateString(new Date(completionDate));
            datesWithJobs.add(jobDate);
            const billAmount = parseFloat(job.actual_cost || job.payment_amount || 0);
            dailyBillingForHolidays.set(jobDate, (dailyBillingForHolidays.get(jobDate) || 0) + billAmount);
          }
        });

        const allDates: string[] = [];
        const currentDate = new Date(startDate);
        currentDate.setHours(0, 0, 0, 0);
        const cutoffDate = new Date(endDate > todayForHolidays ? todayForHolidays : endDate);
        cutoffDate.setHours(0, 0, 0, 0);
        const startDateStr = formatDateString(startDate);
        const todayStr = formatDateString(todayForHolidays);
        while (currentDate <= cutoffDate) {
          const dateStr = formatDateString(new Date(currentDate));
          if (dateStr >= startDateStr && dateStr <= todayStr) allDates.push(dateStr);
          currentDate.setDate(currentDate.getDate() + 1);
        }

        const autoDetectedHolidays: string[] = [];
        allDates.forEach(date => {
          const hasJobsOnDate = datesWithJobs.has(date);
          if (date <= todayStrForHolidays && !hasJobsOnDate) {
            const existingHoliday = techHolidays.find(h => h.holiday_date.split('T')[0] === date);
            if (!existingHoliday || !isPresentOverride(existingHoliday)) autoDetectedHolidays.push(date);
          }
        });

        const holidayWeights = new Map<string, number>();
        techHolidays.forEach(h => {
          const holidayDate = h.holiday_date.split('T')[0];
          const endDateStr = formatDateString(endDate);
          if (holidayDate <= todayStrForHolidays && holidayDate >= periodStartStr && holidayDate <= endDateStr && !isPresentOverride(h)) {
            holidayWeights.set(holidayDate, Math.max(holidayWeights.get(holidayDate) || 0, getHolidayAttendanceWeight(h)));
          }
        });
        autoDetectedHolidays.forEach(date => {
          if (date >= periodStartStr && date <= todayStrForHolidays) {
            const existingHoliday = techHolidays.find(h => h.holiday_date.split('T')[0] === date);
            if (!existingHoliday) {
              holidayWeights.set(date, 1);
            } else if (!isPresentOverride(existingHoliday)) {
              holidayWeights.set(date, Math.max(holidayWeights.get(date) || 0, getHolidayAttendanceWeight(existingHoliday)));
            }
          }
        });

        const displayHolidays: TechnicianHoliday[] = techHolidays.filter(h => !isPresentOverride(h));
        autoDetectedHolidays.forEach(date => {
          if (!displayHolidays.some(h => h.holiday_date.split('T')[0] === date)) {
            displayHolidays.push({ id: `auto-${date}`, technician_id: techId, holiday_date: date, is_manual: false, reason: 'No completed jobs - auto-detected as absent' });
          }
        });
        displayHolidays.sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime());
        const totalHolidays = Array.from(holidayWeights.values()).reduce((sum, weight) => sum + weight, 0);
        const extraHolidays = Math.max(0, totalHolidays - allowedHolidays);
        const sortedHolidayDays = displayHolidays
          .filter(h => holidayWeights.has(h.holiday_date.split('T')[0]))
          .sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime());
        const absentDays: TechnicianHoliday[] = [];
        let remainingExtraHolidayUnits = extraHolidays;
        for (const holiday of sortedHolidayDays) {
          if (remainingExtraHolidayUnits <= 0) break;
          absentDays.push(holiday);
          remainingExtraHolidayUnits -= Math.min(
            holidayWeights.get(holiday.holiday_date.split('T')[0]) || getHolidayAttendanceWeight(holiday),
            remainingExtraHolidayUnits
          );
        }
        absentDays.sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime());
        remainingExtraHolidayUnits = extraHolidays;
        const holidayDeduction = absentDays.reduce((sum, holiday) => {
          const holidayDate = holiday.holiday_date.split('T')[0];
          const chargeableUnits = Math.min(holidayWeights.get(holidayDate) || getHolidayAttendanceWeight(holiday), remainingExtraHolidayUnits);
          remainingExtraHolidayUnits -= chargeableUnits;
          return sum + (getTechnicianDailyBaseSalary(tech, new Date(holiday.holiday_date)) * chargeableUnits);
        }, 0);
        const unusedLeaves = Math.max(0, allowedHolidays - totalHolidays);
        const averageDailyBaseSalary = periodBaseSalary / (30 * inclusiveMonthCount);
        const unusedLeaveBonus = unusedLeaves * averageDailyBaseSalary;
        const adjustedBaseSalary = periodBaseSalary - holidayDeduction + unusedLeaveBonus;

        const dailyBilling = new Map<string, number>();
        techCompletedJobs.forEach((job: any) => {
          const completionDate = job.end_time || job.completed_at;
          if (completionDate) {
            const jobDate = formatDateString(new Date(completionDate));
            const billAmount = parseFloat(job.actual_cost || job.payment_amount || 0);
            dailyBilling.set(jobDate, (dailyBilling.get(jobDate) || 0) + billAmount);
          }
        });

        const dailyBreakdown: DailyBreakdown[] = allDates
          .filter(date => date <= todayStr)
          .map(date => {
            const billAmount = dailyBilling.get(date) || 0;
            const hasJobsOnDate = datesWithJobs.has(date);
            const presentOverride = techHolidays.find(h => h.holiday_date.split('T')[0] === date && isPresentOverride(h));
            const halfDayHoliday = techHolidays.find(h => h.holiday_date.split('T')[0] === date && isHalfDayHoliday(h));
            const manualAbsentHoliday = techHolidays.find(h => h.holiday_date.split('T')[0] === date && !isPresentOverride(h) && !isHalfDayHoliday(h) && h.is_manual === true);
            let isAbsent: boolean;
            let status: AttendanceStatus;
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

        const salaryBeforeAdvance =
          adjustedBaseSalary + totalCommission + totalExtraCommission;
        const totalSalary = salaryBeforeAdvance - totalAdvances;
        const monthlyBreakdowns = selectedPeriod === 'rangeToCurrent'
          ? monthRanges.map(monthRange => calculateMonthlyBreakdown(tech, monthRange))
          : undefined;

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
          monthlyBreakdowns
        };
      });

      setSalaryBreakdowns(breakdowns);
      setSalaryDataLoaded(true);
    } catch (error: any) {
      console.error('Error loading salary data:', error);
      toast.error('Failed to load salary data: ' + error.message);
    } finally {
      if (showLoading) setLoadingSalaryBreakdowns(false);
    }
  }, [technicians, getMonthlyDateRange, selectedPeriod]);

  useEffect(() => {
    loadTechniciansOnly();
  }, [selectedPeriod, selectedPastMonth, selectedRangeEndMonth, loadTechniciansOnly]);

  const prevBusinessPeriodRef = useRef({ selectedPeriod, selectedPastMonth, selectedRangeEndMonth });
  useEffect(() => {
    if (!businessExpensesViewed) return;
    const same =
      prevBusinessPeriodRef.current.selectedPeriod === selectedPeriod &&
      prevBusinessPeriodRef.current.selectedPastMonth === selectedPastMonth &&
      prevBusinessPeriodRef.current.selectedRangeEndMonth === selectedRangeEndMonth;
    prevBusinessPeriodRef.current = { selectedPeriod, selectedPastMonth, selectedRangeEndMonth };
    if (same) return;
    setLoadingBusinessExpenses(true);
    loadBusinessExpensesOnly().then(() => setLoadingBusinessExpenses(false));
  }, [selectedPeriod, selectedPastMonth, selectedRangeEndMonth, businessExpensesViewed, loadBusinessExpensesOnly]);

  const prevOtherPeriodRef = useRef({ selectedPeriod, selectedPastMonth, selectedRangeEndMonth });
  useEffect(() => {
    if (!otherExpensesViewed) return;
    const same =
      prevOtherPeriodRef.current.selectedPeriod === selectedPeriod &&
      prevOtherPeriodRef.current.selectedPastMonth === selectedPastMonth &&
      prevOtherPeriodRef.current.selectedRangeEndMonth === selectedRangeEndMonth;
    prevOtherPeriodRef.current = { selectedPeriod, selectedPastMonth, selectedRangeEndMonth };
    if (same) return;
    setLoadingOtherExpenses(true);
    loadOtherExpensesOnly().then(() => setLoadingOtherExpenses(false));
  }, [selectedPeriod, selectedPastMonth, selectedRangeEndMonth, otherExpensesViewed, loadOtherExpensesOnly]);

  const prevPeriodRef = useRef({ selectedPeriod, selectedPastMonth, selectedRangeEndMonth });
  useEffect(() => {
    if (!salaryDataLoaded) return;
    const same =
      prevPeriodRef.current.selectedPeriod === selectedPeriod &&
      prevPeriodRef.current.selectedPastMonth === selectedPastMonth &&
      prevPeriodRef.current.selectedRangeEndMonth === selectedRangeEndMonth;
    prevPeriodRef.current = { selectedPeriod, selectedPastMonth, selectedRangeEndMonth };
    if (same) return;
    loadSalaryBreakdownData(false);
  }, [selectedPeriod, selectedPastMonth, selectedRangeEndMonth, salaryDataLoaded, loadSalaryBreakdownData]);

  // Keep `isMobileViewport` in sync with the viewport so the swipe carousel
  // engages on phones and disengages on larger screens.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (event: MediaQueryListEvent) => setIsMobileViewport(event.matches);
    setIsMobileViewport(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // Keep the mobile carousel index in range whenever the filter or data shrinks.
  // NOTE: must live above the `if (loading) return` early-return so the hook
  // order stays stable across renders.
  const filteredTechCount = techFilterShowNone
    ? 0
    : selectedTechFilterIds.length === 0
      ? salaryBreakdowns.length
      : salaryBreakdowns.filter((b) => selectedTechFilterIds.includes(b.technicianId)).length;
  useEffect(() => {
    if (mobileTechIndex > 0 && mobileTechIndex >= filteredTechCount) {
      setMobileTechIndex(Math.max(0, filteredTechCount - 1));
    }
  }, [filteredTechCount, mobileTechIndex]);


  /** Full refresh: technicians + period; salary/business only if user had viewed them. */
  const loadData = useCallback(async (showLoading: boolean = true) => {
    await loadTechniciansOnly();
    if (salaryDataLoaded) await loadSalaryBreakdownData(showLoading);
    if (businessExpensesViewed) {
      setLoadingBusinessExpenses(true);
      await loadBusinessExpensesOnly();
      setLoadingBusinessExpenses(false);
    }
  }, [loadTechniciansOnly, loadSalaryBreakdownData, loadBusinessExpensesOnly, salaryDataLoaded, businessExpensesViewed]);

  const handleAddExpense = (technicianId?: string) => {
    const techId = technicianId || selectedTechnician;
    if (!techId) {
      toast.error('Please select a technician');
      return;
    }
    setSelectedTechnician(techId);
    setExpenseFormData({
      technician_id: techId,
      amount: '',
      description: '',
      expense_date: new Date().toISOString().split('T')[0],
      category: 'OTHER',
      notes: ''
    });
    setEditingExpense(null);
    setExpenseDialogOpen(true);
  };

  const handleEditExpense = (expense: TechnicianExpense) => {
    setEditingExpense(expense);
    setExpenseFormData({
      technician_id: expense.technician_id,
      amount: expense.amount.toString(),
      description: expense.description,
      expense_date: expense.expense_date.split('T')[0],
      category: expense.category || 'OTHER',
      notes: expense.notes || ''
    });
    setExpenseDialogOpen(true);
  };

  const handleSaveExpense = async () => {
    try {
      if (!expenseFormData.technician_id || !expenseFormData.amount || !expenseFormData.description) {
        toast.error('Please fill in all required fields');
        return;
      }

      const expenseData = {
        technician_id: expenseFormData.technician_id,
        amount: parseFloat(expenseFormData.amount),
        description: expenseFormData.description,
        expense_date: expenseFormData.expense_date,
        category: expenseFormData.category,
        notes: expenseFormData.notes || null
      };

      if (editingExpense) {
        const { error } = await db.technicianExpenses.update(editingExpense.id, expenseData);
        if (error) throw error;
        toast.success('Expense updated');
      } else {
        const { error } = await db.technicianExpenses.create(expenseData);
        if (error) throw error;
        toast.success('Expense added');
      }

      setExpenseDialogOpen(false);
      if (salaryDataLoaded) await loadSalaryBreakdownData(false);
    } catch (error: any) {
      toast.error('Failed to save expense: ' + error.message);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    
    try {
      const { error } = await db.technicianExpenses.delete(id);
      if (error) throw error;
      toast.success('Expense deleted');
      if (salaryDataLoaded) await loadSalaryBreakdownData(false);
    } catch (error: any) {
      toast.error('Failed to delete expense: ' + error.message);
    }
  };

  // Business expense handlers
  const handleAddBusinessExpense = () => {
    setEditingBusinessExpense(null);
    setBusinessExpenseFormData({
      amount: '',
      description: '',
      expense_date: new Date().toISOString().split('T')[0],
      category: '',
      notes: ''
    });
    setBusinessExpenseDialogOpen(true);
  };

  const handleEditBusinessExpense = (expense: any) => {
    setEditingBusinessExpense(expense);
    const allowed = new Set(['BUSINESS', 'JOB_COST', 'OTHER_BUSINESS_EXPENSE', 'OTHER']);
    const rawCategory = (expense.category || 'OTHER').toString().toUpperCase();
    setBusinessExpenseFormData({
      amount: expense.amount.toString(),
      description: expense.description,
      expense_date: expense.expense_date.split('T')[0],
      category: allowed.has(rawCategory) ? rawCategory : 'OTHER',
      notes: expense.notes || ''
    });
    setBusinessExpenseDialogOpen(true);
  };

  const handleSaveBusinessExpense = async () => {
    try {
      if (!businessExpenseFormData.amount || !businessExpenseFormData.description) {
        toast.error('Please fill in all required fields');
        return;
      }
      if (!businessExpenseFormData.category) {
        toast.error('Please select a category');
        return;
      }

      const expenseData = {
        amount: parseFloat(businessExpenseFormData.amount),
        description: businessExpenseFormData.description,
        expense_date: businessExpenseFormData.expense_date,
        category: businessExpenseFormData.category,
        notes: businessExpenseFormData.notes || null
      };

      if (editingBusinessExpense) {
        const { error } = await db.businessExpenses.update(editingBusinessExpense.id, expenseData);
        if (error) throw error;
        toast.success('Business expense updated');
      } else {
        const { error } = await db.businessExpenses.create(expenseData);
        if (error) throw error;
        toast.success('Business expense added');
      }

      setBusinessExpenseDialogOpen(false);
      if (businessExpensesViewed) await loadBusinessExpensesOnly();
    } catch (error: any) {
      toast.error('Failed to save business expense: ' + error.message);
    }
  };

  const handleDeleteBusinessExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this business expense?')) return;
    
    try {
      const { error } = await db.businessExpenses.delete(id);
      if (error) throw error;
      toast.success('Business expense deleted');
      if (businessExpensesViewed) await loadBusinessExpensesOnly();
    } catch (error: any) {
      toast.error('Failed to delete business expense: ' + error.message);
    }
  };

  // Other expense handlers
  const handleAddOtherExpense = () => {
    setEditingOtherExpense(null);
    setOtherExpenseFormData({
      amount: '',
      description: '',
      expense_date: new Date().toISOString().split('T')[0],
      category: 'OTHER',
      notes: ''
    });
    setOtherExpenseDialogOpen(true);
  };

  const handleEditOtherExpense = (expense: any) => {
    setEditingOtherExpense(expense);
    const allowed = new Set(['BUSINESS', 'OTHER']);
    const rawCategory = (expense.category || 'OTHER').toString().toUpperCase();
    setOtherExpenseFormData({
      amount: expense.amount.toString(),
      description: expense.description,
      expense_date: expense.expense_date.split('T')[0],
      category: allowed.has(rawCategory) ? rawCategory : 'OTHER',
      notes: expense.notes || ''
    });
    setOtherExpenseDialogOpen(true);
  };

  const handleSaveOtherExpense = async () => {
    try {
      if (!otherExpenseFormData.amount || !otherExpenseFormData.description) {
        toast.error('Please fill in all required fields');
        return;
      }
      const expenseData = {
        amount: parseFloat(otherExpenseFormData.amount),
        description: otherExpenseFormData.description,
        expense_date: otherExpenseFormData.expense_date,
        category: otherExpenseFormData.category,
        notes: otherExpenseFormData.notes || null
      };
      if (editingOtherExpense) {
        const { error } = await db.otherExpenses.update(editingOtherExpense.id, expenseData);
        if (error) throw error;
        toast.success('Other expense updated');
      } else {
        const { error } = await db.otherExpenses.create(expenseData);
        if (error) throw error;
        toast.success('Other expense added');
      }
      setOtherExpenseDialogOpen(false);
      if (otherExpensesViewed) await loadOtherExpensesOnly();
    } catch (error: any) {
      toast.error('Failed to save other expense: ' + error.message);
    }
  };

  const handleDeleteOtherExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this other expense?')) return;
    try {
      const { error } = await db.otherExpenses.delete(id);
      if (error) throw error;
      toast.success('Other expense deleted');
      if (otherExpensesViewed) await loadOtherExpensesOnly();
    } catch (error: any) {
      toast.error('Failed to delete other expense: ' + error.message);
    }
  };

  const handleAddAdvance = (technicianId?: string) => {
    const techId = technicianId || selectedTechnician;
    if (!techId) {
      toast.error('Please select a technician');
      return;
    }
    setSelectedTechnician(techId);
    setAdvanceFormData({
      technician_id: techId,
      amount: '',
      description: '',
      advance_date: new Date().toISOString().split('T')[0],
      payment_method: 'CASH',
      payment_reference: '',
      notes: ''
    });
    setEditingAdvance(null);
    setAdvanceDialogOpen(true);
  };

  const handleEditAdvance = (advance: TechnicianAdvance) => {
    setEditingAdvance(advance);
    setAdvanceFormData({
      technician_id: advance.technician_id,
      amount: advance.amount.toString(),
      description: advance.description || '',
      advance_date: advance.advance_date.split('T')[0],
      payment_method: advance.payment_method || 'CASH',
      payment_reference: advance.payment_reference || '',
      notes: advance.notes || ''
    });
    setAdvanceDialogOpen(true);
  };

  const handleSaveAdvance = async () => {
    try {
      if (!advanceFormData.technician_id || !advanceFormData.amount) {
        toast.error('Please fill in all required fields');
        return;
      }

      const advanceData = {
        technician_id: advanceFormData.technician_id,
        amount: parseFloat(advanceFormData.amount),
        description: advanceFormData.description || null,
        advance_date: advanceFormData.advance_date,
        payment_method: advanceFormData.payment_method,
        payment_reference: advanceFormData.payment_reference || null,
        notes: advanceFormData.notes || null
      };

      if (editingAdvance) {
        const { error } = await db.technicianAdvances.update(editingAdvance.id, advanceData);
        if (error) throw error;
        toast.success('Advance updated');
      } else {
        const { error } = await db.technicianAdvances.create(advanceData);
        if (error) throw error;
        toast.success('Advance added');
      }

      setAdvanceDialogOpen(false);
      if (salaryDataLoaded) await loadSalaryBreakdownData(false);
    } catch (error: any) {
      toast.error('Failed to save advance: ' + error.message);
    }
  };

  const handleDeleteAdvance = async (id: string) => {
    if (!confirm('Are you sure you want to delete this advance?')) return;
    
    try {
      const { error } = await db.technicianAdvances.delete(id);
      if (error) throw error;
      toast.success('Advance deleted');
      if (salaryDataLoaded) await loadSalaryBreakdownData(false);
    } catch (error: any) {
      toast.error('Failed to delete advance: ' + error.message);
    }
  };

  const handleAddExtraCommission = (technicianId?: string) => {
    const techId = technicianId || selectedTechnician;
    if (!techId) {
      toast.error('Please select a technician');
      return;
    }
    setSelectedTechnician(techId);
    setExtraCommissionFormData({
      technician_id: techId,
      amount: '',
      description: '',
      commission_date: new Date().toISOString().split('T')[0],
      payment_method: 'CASH',
      payment_reference: '',
      notes: ''
    });
    setEditingExtraCommission(null);
    setExtraCommissionDialogOpen(true);
  };

  const handleEditExtraCommission = (commission: TechnicianExtraCommission) => {
    setEditingExtraCommission(commission);
    setExtraCommissionFormData({
      technician_id: commission.technician_id,
      amount: commission.amount.toString(),
      description: commission.description,
      commission_date: commission.commission_date.split('T')[0],
      payment_method: commission.payment_method || 'CASH',
      payment_reference: commission.payment_reference || '',
      notes: commission.notes || ''
    });
    setExtraCommissionDialogOpen(true);
  };

  const handleSaveExtraCommission = async () => {
    try {
      if (!extraCommissionFormData.technician_id || !extraCommissionFormData.amount || !extraCommissionFormData.description) {
        toast.error('Please fill in all required fields');
        return;
      }

      const commissionData = {
        technician_id: extraCommissionFormData.technician_id,
        amount: parseFloat(extraCommissionFormData.amount),
        description: extraCommissionFormData.description,
        commission_date: extraCommissionFormData.commission_date,
        payment_method: extraCommissionFormData.payment_method,
        payment_reference: extraCommissionFormData.payment_reference || null,
        notes: extraCommissionFormData.notes || null
      };

      if (editingExtraCommission) {
        const { error } = await db.technicianExtraCommissions.update(editingExtraCommission.id, commissionData);
        if (error) throw error;
        toast.success('Extra commission updated');
      } else {
        console.log('💾 Creating extra commission:', commissionData);
        const { data, error } = await db.technicianExtraCommissions.create(commissionData);
        if (error) {
          console.error('❌ Error creating extra commission:', error);
          throw error;
        }
        if (!data) {
          console.error('❌ No data returned from create operation');
          throw new Error('Failed to create extra commission - no data returned');
        }
        console.log('✅ Extra commission created successfully:', data);
        toast.success('Extra commission added');
      }

      setExtraCommissionDialogOpen(false);
      if (salaryDataLoaded) await loadSalaryBreakdownData(false);
    } catch (error: any) {
      toast.error('Failed to save extra commission: ' + error.message);
    }
  };

  const handleDeleteExtraCommission = async (id: string) => {
    if (!confirm('Are you sure you want to delete this extra commission?')) return;
    
    try {
      const { error } = await db.technicianExtraCommissions.delete(id);
      if (error) throw error;
      toast.success('Extra commission deleted');
      if (salaryDataLoaded) await loadSalaryBreakdownData(false);
    } catch (error: any) {
      toast.error('Failed to delete extra commission: ' + error.message);
    }
  };

  const handleAddHoliday = () => {
    if (!selectedTechnician) {
      toast.error('Please select a technician');
      return;
    }
    setHolidayFormData({
      technician_id: selectedTechnician,
      holiday_date: new Date().toISOString().split('T')[0],
      reason: '',
      notes: ''
    });
    setEditingHoliday(null);
    setHolidayDialogOpen(true);
  };

  const handleEditHoliday = (holiday: TechnicianHoliday) => {
    // Can only edit manual leaves
    if (!holiday.is_manual) {
      toast.error('Auto-detected leaves cannot be edited. They are based on job completion.');
      return;
    }
    setEditingHoliday(holiday);
    setHolidayFormData({
      technician_id: holiday.technician_id,
      holiday_date: holiday.holiday_date.split('T')[0],
      reason: holiday.reason || '',
      notes: holiday.notes || ''
    });
    setHolidayDialogOpen(true);
  };

  const handleSaveHoliday = async () => {
    try {
      if (!holidayFormData.technician_id || !holidayFormData.holiday_date) {
        toast.error('Please fill in all required fields');
        return;
      }

      const holidayData = {
        technician_id: holidayFormData.technician_id,
        holiday_date: holidayFormData.holiday_date,
        is_manual: true,
        reason: holidayFormData.reason || null,
        notes: holidayFormData.notes || null
      };

      if (editingHoliday) {
        const { error } = await db.technicianHolidays.update(editingHoliday.id, holidayData);
        if (error) throw error;
        toast.success('Leave updated');
      } else {
        const { error } = await db.technicianHolidays.create(holidayData);
        if (error) throw error;
        toast.success('Leave added');
      }

      setHolidayDialogOpen(false);
      if (salaryDataLoaded) await loadSalaryBreakdownData(false);
    } catch (error: any) {
      toast.error('Failed to save holiday: ' + error.message);
    }
  };

  const handleDeleteHoliday = async (holiday: TechnicianHoliday) => {
    // Can only delete manual leaves
    if (!holiday.is_manual) {
      toast.error('Auto-detected leaves cannot be deleted. They are based on job completion.');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this leave?')) return;
    
    try {
      const { error } = await db.technicianHolidays.delete(holiday.id);
      if (error) throw error;
      toast.success('Leave deleted');
      if (salaryDataLoaded) await loadSalaryBreakdownData(false);
    } catch (error: any) {
      toast.error('Failed to delete leave: ' + error.message);
    }
  };

  const loadJobsForDate = async (technicianId: string, date: string) => {
    setLoadingJobsForDate(true);
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Load jobs completed on this date
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          id,
          job_number,
          actual_cost,
          payment_amount,
          service_type,
          service_sub_type,
          customer:customers(full_name, phone)
        `)
        .eq('assigned_technician_id', technicianId)
        .eq('status', 'COMPLETED')
        .not('end_time', 'is', null)
        .gte('end_time', startOfDay.toISOString())
        .lte('end_time', endOfDay.toISOString())
        .order('end_time', { ascending: false });

      if (jobsError) throw jobsError;

      // Load commission percentages from technician_payments
      if (jobsData && jobsData.length > 0) {
        const jobIds = jobsData.map(j => j.id);
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('technician_payments')
          .select('job_id, commission_percentage, commission_amount, bill_amount')
          .in('job_id', jobIds);

        if (paymentsError) throw paymentsError;

        // Merge job data with payment data
        const jobsWithCommission = jobsData.map(job => {
          const payment = paymentsData?.find(p => p.job_id === job.id);
          return {
            ...job,
            // Use nullish coalescing (??) instead of || to allow 0% commission
            commission_percentage: payment?.commission_percentage ?? 10,
            commission_amount: payment?.commission_amount ?? 0,
            bill_amount: payment?.bill_amount ?? job.actual_cost ?? job.payment_amount ?? 0
          };
        });

        setJobsForDate(jobsWithCommission);
      } else {
        setJobsForDate([]);
      }
    } catch (error: any) {
      console.error('Error loading jobs for date:', error);
      toast.error('Failed to load jobs: ' + error.message);
      setJobsForDate([]);
    } finally {
      setLoadingJobsForDate(false);
    }
  };

  const handleUpdateJobCommission = async (jobId: string, newCommissionPercentage: number) => {
    try {
      // Validate commission percentage (0-100, max 2 decimal places)
      if (newCommissionPercentage < 0 || newCommissionPercentage > 100) {
        toast.error('Commission percentage must be between 0 and 100');
        return;
      }
      
      // Round to 2 decimal places to match database precision
      const roundedPercentage = Math.round(newCommissionPercentage * 100) / 100;
      
      // Get the job to find bill amount
      const job = jobsForDate.find(j => j.id === jobId);
      if (!job) {
        toast.error('Job not found');
        return;
      }

      const billAmount = job.bill_amount || job.actual_cost || job.payment_amount || 0;
      const newCommissionAmount = billAmount * (roundedPercentage / 100);

      // Update or create technician_payment record
      const { data: existingPayment, error: checkError } = await supabase
        .from('technician_payments')
        .select('id')
        .eq('job_id', jobId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw checkError;
      }

      if (existingPayment) {
        // Update existing payment
        const { error: updateError } = await supabase
          .from('technician_payments')
          .update({
            commission_percentage: roundedPercentage,
            commission_amount: Math.round(newCommissionAmount * 100) / 100, // Round to 2 decimal places
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPayment.id);

        if (updateError) throw updateError;
      } else {
        // Create new payment record
        if (!selectedDateForJobs) {
          toast.error('Technician ID not found');
          return;
        }

        const { error: insertError } = await supabase
          .from('technician_payments')
          .insert({
            technician_id: selectedDateForJobs.technicianId,
            job_id: jobId,
            bill_amount: Math.round(billAmount * 100) / 100, // Round to 2 decimal places
            commission_percentage: roundedPercentage,
            commission_amount: Math.round(newCommissionAmount * 100) / 100, // Round to 2 decimal places
            payment_status: 'PENDING'
          });

        if (insertError) {
          // If RLS error, provide helpful message
          if (insertError.code === '42501' || insertError.message?.includes('row-level security')) {
            toast.error('Permission denied. Please ensure you are logged in as an admin and have run the RLS policy fix SQL.');
            console.error('RLS Error - Make sure you have run fix-technician-payments-rls-final.sql in Supabase');
          }
          throw insertError;
        }
      }

      toast.success(`Commission updated to ${roundedPercentage}%`);
      
      // Reload jobs to reflect changes
      if (selectedDateForJobs) {
        await loadJobsForDate(selectedDateForJobs.technicianId, selectedDateForJobs.date);
      }
      
      // Reload main data to update commission totals
      await loadData(false);
      
      setEditingJobCommission(null);
    } catch (error: any) {
      console.error('Error updating commission:', error);
      
      // Provide specific error messages
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        toast.error('Permission denied. Please ensure you are logged in as an admin and have run the RLS policy fix SQL in Supabase.');
      } else if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
        toast.error('Authentication expired. Please log out and log back in.');
      } else {
        toast.error('Failed to update commission: ' + error.message);
      }
    }
  };

  const handleUpdateJobAmount = async (jobId: string, newAmount: number) => {
    try {
      // Validate amount (must be >= 0)
      if (newAmount < 0) {
        toast.error('Amount must be greater than or equal to 0');
        return;
      }
      
      // Round to 2 decimal places to match database precision
      const roundedAmount = Math.round(newAmount * 100) / 100;
      
      // Get the job to find commission percentage
      const job = jobsForDate.find(j => j.id === jobId);
      if (!job) {
        toast.error('Job not found');
        return;
      }

      // Update job's actual_cost and payment_amount
      const { error: jobUpdateError } = await supabase
        .from('jobs')
        .update({
          actual_cost: roundedAmount,
          payment_amount: roundedAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (jobUpdateError) throw jobUpdateError;

      // Get commission percentage (use existing or default to 10%)
      const commissionPercentage = job.commission_percentage ?? 10;
      const newCommissionAmount = roundedAmount * (commissionPercentage / 100);

      // Update or create technician_payment record
      const { data: existingPayment, error: checkError } = await supabase
        .from('technician_payments')
        .select('id')
        .eq('job_id', jobId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw checkError;
      }

      if (existingPayment) {
        // Update existing payment
        const { error: updateError } = await supabase
          .from('technician_payments')
          .update({
            bill_amount: roundedAmount,
            commission_amount: Math.round(newCommissionAmount * 100) / 100, // Round to 2 decimal places
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPayment.id);

        if (updateError) throw updateError;
      } else {
        // Create new payment record
        if (!selectedDateForJobs) {
          toast.error('Technician ID not found');
          return;
        }

        const { error: insertError } = await supabase
          .from('technician_payments')
          .insert({
            technician_id: selectedDateForJobs.technicianId,
            job_id: jobId,
            bill_amount: roundedAmount,
            commission_percentage: commissionPercentage,
            commission_amount: Math.round(newCommissionAmount * 100) / 100, // Round to 2 decimal places
            payment_status: 'PENDING'
          });

        if (insertError) {
          // If RLS error, provide helpful message
          if (insertError.code === '42501' || insertError.message?.includes('row-level security')) {
            toast.error('Permission denied. Please ensure you are logged in as an admin and have run the RLS policy fix SQL.');
            console.error('RLS Error - Make sure you have run fix-technician-payments-rls-final.sql in Supabase');
          }
          throw insertError;
        }
      }

      toast.success(`Job amount updated to ₹ ${formatCurrency(roundedAmount)}`);
      
      // Reload jobs to reflect changes
      if (selectedDateForJobs) {
        await loadJobsForDate(selectedDateForJobs.technicianId, selectedDateForJobs.date);
      }
      
      // Reload main data to update totals everywhere
      await loadData(false);
      
      setEditingJobAmount(null);
    } catch (error: any) {
      console.error('Error updating job amount:', error);
      
      // Provide specific error messages
      if (error.code === '42501' || error.message?.includes('row-level security')) {
        toast.error('Permission denied. Please ensure you are logged in as an admin and have run the RLS policy fix SQL in Supabase.');
      } else if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
        toast.error('Authentication expired. Please log out and log back in.');
      } else {
        toast.error('Failed to update job amount: ' + error.message);
      }
    }
  };

  const handleSaveDailyBreakdown = async () => {
    if (!editingDailyBreakdown) return;

    try {
      const technicianId = editingDailyBreakdown.technicianId;
      const date = editingDailyBreakdown.date;
      const newStatus = dailyBreakdownFormData.status;
      const oldStatus = editingDailyBreakdown.status;
      let hasChanges = false;

      // Update attendance status
      if (newStatus !== oldStatus) {
        // Check if holiday already exists - holiday_date is DATE field, so query by date string
        const { data: existingHolidays, error: holidayCheckError } = await supabase
          .from('technician_holidays')
          .select('id, is_manual, reason')
          .eq('technician_id', technicianId)
          .eq('holiday_date', date); // Direct date match for DATE field

        if (holidayCheckError) {
          console.error('Error checking holidays:', holidayCheckError);
          throw holidayCheckError;
        }

        console.log('Holiday status change:', {
          date,
          oldStatus,
          newStatus,
          existingHolidays: existingHolidays?.length || 0
        });

        if (existingHolidays && existingHolidays.length > 0) {
          for (const holiday of existingHolidays) {
            const { error: deleteError } = await db.technicianHolidays.delete(holiday.id);
            if (deleteError) {
              console.error('Error deleting existing attendance marker:', deleteError);
              throw deleteError;
            }
          }
        }

        const markerPayload =
          newStatus === 'present'
            ? {
                reason: PRESENT_OVERRIDE_REASON,
                notes: 'Manually marked as present - prevents auto-detection as absent',
              }
            : newStatus === 'halfDay'
            ? {
                reason: HALF_DAY_REASON,
                notes: 'Marked as half day from daily breakdown',
              }
            : {
                reason: 'Manual adjustment',
                notes: 'Updated from daily breakdown',
              };

        const { error: createMarkerError } = await db.technicianHolidays.create({
          technician_id: technicianId,
          holiday_date: date,
          is_manual: true,
          reason: markerPayload.reason,
          notes: markerPayload.notes
        });

        if (createMarkerError) {
          console.error('Error creating attendance marker:', createMarkerError);
          throw createMarkerError;
        }

        toast.success(
          newStatus === 'present'
            ? 'Day marked as present'
            : newStatus === 'halfDay'
            ? 'Day marked as half day'
            : 'Day marked as absent'
        );
        hasChanges = true;
      }

      // Close dialog first (before reload to prevent flicker)
      setDailyBreakdownEditDialogOpen(false);
      setEditingDailyBreakdown(null);

      // Only reload if there were actual changes
      if (hasChanges) {
        // Reload data to refresh the breakdown, but don't show loading spinner
        // Update state without triggering full page reload
        try {
          // Reload all data silently (without showing loading spinner)
          await loadData(false);
        } catch (reloadError) {
          console.error('Error reloading data:', reloadError);
          // If silent reload fails, do a full reload
          await loadData(true);
        }
      } else {
        toast.info('No changes to save');
      }
    } catch (error: any) {
      console.error('Failed to update daily breakdown:', error);
      toast.error('Failed to update daily breakdown: ' + (error.message || 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          {/* 3-dot bounce animation */}
          <div className="flex items-center justify-center space-x-1 mb-4">
            <div className="w-3 h-3 bg-gray-900 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-3 h-3 bg-gray-900 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-3 h-3 bg-gray-900 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <p className="text-gray-600">Loading payments...</p>
        </div>
      </div>
    );
  }

  const displayedSalaryBreakdowns = techFilterShowNone
    ? []
    : selectedTechFilterIds.length === 0
      ? salaryBreakdowns
      : salaryBreakdowns.filter((breakdown) =>
          selectedTechFilterIds.includes(breakdown.technicianId),
        );

  const techFilterLabel = (() => {
    if (techFilterShowNone) return 'No technicians';
    if (selectedTechFilterIds.length === 0) return 'All technicians';
    if (selectedTechFilterIds.length === 1) {
      const t = technicians.find((tech: any) => tech.id === selectedTechFilterIds[0]);
      return t?.full_name || '1 technician';
    }
    return `${selectedTechFilterIds.length} technicians selected`;
  })();

  const toggleTechFilter = (id: string) => {
    // Any single-item toggle implicitly leaves the "show none" state.
    setTechFilterShowNone(false);
    setSelectedTechFilterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllTechFilter = () => {
    setTechFilterShowNone(false);
    setSelectedTechFilterIds([]);
  };

  const selectNoneTechFilter = () => {
    setTechFilterShowNone(true);
    setSelectedTechFilterIds([]);
  };

  const triggerHapticPulse = (pattern: number | number[] = 18) => {
    if (typeof navigator === 'undefined') return;
    const vibrate = (navigator as Navigator & {
      vibrate?: (pattern: number | number[]) => boolean;
    }).vibrate;
    if (typeof vibrate === 'function') {
      try {
        vibrate.call(navigator, pattern);
      } catch {
        // Some browsers throw on cross-origin iframes — silently ignore.
      }
    }
  };

  const advanceTechIndex = (direction: 1 | -1) => {
    const len = displayedSalaryBreakdowns.length;
    if (len < 2) return;
    setMobileTechIndex((prev) => {
      const next = ((prev + direction) % len + len) % len;
      // Wrap-around (last→first or first→last): double-tap to make the loop feel distinct.
      const wrapped =
        (direction === 1 && prev === len - 1 && next === 0) ||
        (direction === -1 && prev === 0 && next === len - 1);
      triggerHapticPulse(wrapped ? [12, 60, 18] : 18);
      return next;
    });
  };

  const resetTechSwipeTracking = () => {
    techSwipeStartXRef.current = null;
    techSwipeStartYRef.current = null;
    techSwipeScrollLeftStartRef.current = null;
    techSwipeBlockedRef.current = false;
  };

  const handleTechCardTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport || displayedSalaryBreakdowns.length < 2) return;
    resetTechSwipeTracking();
    if (shouldBlockTechCardSwipe(e.target)) {
      techSwipeBlockedRef.current = true;
      return;
    }
    techSwipeStartXRef.current = e.touches[0].clientX;
    techSwipeStartYRef.current = e.touches[0].clientY;
  };

  const handleTechCardTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport || techSwipeBlockedRef.current || techSwipeStartXRef.current == null) return;
    const touch = e.touches[0];
    const underFinger = document.elementFromPoint(touch.clientX, touch.clientY);
    const scrollParent = underFinger ? getHorizontalScrollParent(underFinger) : null;
    if (!scrollParent) return;
    if (techSwipeScrollLeftStartRef.current == null) {
      techSwipeScrollLeftStartRef.current = scrollParent.scrollLeft;
    }
    if (Math.abs(scrollParent.scrollLeft - techSwipeScrollLeftStartRef.current) > 8) {
      techSwipeBlockedRef.current = true;
      techSwipeStartXRef.current = null;
      techSwipeStartYRef.current = null;
    }
  };

  const handleTechCardTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport || displayedSalaryBreakdowns.length < 2) {
      resetTechSwipeTracking();
      return;
    }
    if (techSwipeBlockedRef.current) {
      resetTechSwipeTracking();
      return;
    }
    const startX = techSwipeStartXRef.current;
    const startY = techSwipeStartYRef.current;
    resetTechSwipeTracking();
    if (startX == null || startY == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    // Need a clearly horizontal gesture; ignore vertical scrolls and stray taps.
    if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return;
    advanceTechIndex(dx < 0 ? 1 : -1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Technician Payments</h2>
        <p className="text-sm sm:text-base text-gray-600">
          Manage technician salaries, commissions (10% per job), expenses, and advances
        </p>
        
        {/* Period Selector — uniform mobile-friendly grid */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="min-w-0">
            <Label htmlFor="period-select" className="text-xs sm:text-sm">View Period</Label>
            <Select value={selectedPeriod} onValueChange={(value: any) => setSelectedPeriod(value)}>
              <SelectTrigger id="period-select" className="w-full h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Cycle</SelectItem>
                <SelectItem value="pastMonth">Past Month</SelectItem>
                <SelectItem value="rangeToCurrent">Range (From -&gt; To)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedPeriod === 'pastMonth' && (
            <div className="min-w-0">
              <Label htmlFor="month-select" className="text-xs sm:text-sm">Select Month</Label>
              <Input
                id="month-select"
                type="month"
                value={selectedPastMonth}
                onChange={(e) => setSelectedPastMonth(e.target.value)}
                className="w-full h-10"
              />
            </div>
          )}

          {selectedPeriod === 'rangeToCurrent' && (
            <>
              <div className="min-w-0">
                <Label htmlFor="from-month-select" className="text-xs sm:text-sm">From Month</Label>
                <Input
                  id="from-month-select"
                  type="month"
                  value={selectedPastMonth}
                  onChange={(e) => setSelectedPastMonth(e.target.value)}
                  className="w-full h-10"
                />
              </div>
              <div className="min-w-0">
                <Label htmlFor="to-month-select" className="text-xs sm:text-sm">To Month</Label>
                <Input
                  id="to-month-select"
                  type="month"
                  value={selectedRangeEndMonth}
                  onChange={(e) => setSelectedRangeEndMonth(e.target.value)}
                  className="w-full h-10"
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {commissionPeriod && (
            <div className="text-xs sm:text-sm text-gray-500">
              Period: {(() => {
                // Calculate payment date: 10th of next month after the selected period end
                const nextMonth = new Date(commissionPeriod.end);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                nextMonth.setDate(10);
                const paymentDate = nextMonth.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

                if (selectedPeriod === 'rangeToCurrent') {
                  const fromMonth = commissionPeriod.start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
                  const toMonth = commissionPeriod.end.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
                  return `From ${fromMonth} to ${toMonth} (Paid on ${paymentDate})`;
                }

                const startDay = commissionPeriod.start.getDate();
                const endDay = commissionPeriod.end.getDate();
                const month = commissionPeriod.start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
                
                const getDaySuffix = (day: number) => {
                  if (day === 1 || day === 21 || day === 31) return 'st';
                  if (day === 2 || day === 22) return 'nd';
                  if (day === 3 || day === 23) return 'rd';
                  return 'th';
                };
                
                return `${startDay}${getDaySuffix(startDay)} to ${endDay}${getDaySuffix(endDay)} of ${month} (Paid on ${paymentDate})`;
              })()}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-10 sm:h-9 w-full sm:w-auto justify-center"
              onClick={() => {
                setEditingExpense(null);
                setExpenseFormData({ technician_id: '', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0], category: 'OTHER', notes: '' });
                setExpenseDialogOpen(true);
              }}
              disabled={loading || technicians.length === 0}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add technician expense
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 sm:h-9 w-full sm:w-auto justify-center"
              onClick={handleAddBusinessExpense}
              disabled={loading}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add business expense
            </Button>
          </div>
        </div>
      </div>

      {/* Technician Salary Breakdowns - load only when user clicks View */}
      <div ref={salarySectionRef} className="space-y-4 sm:space-y-6">
        {/* Multi-select technician filter (visible only after data loads) */}
        {salaryDataLoaded && !loadingSalaryBreakdowns && technicians.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 sm:p-4 bg-white border rounded-lg">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="font-medium">Filter:</span>
              <span className="text-gray-600">
                Showing {displayedSalaryBreakdowns.length} of {salaryBreakdowns.length} technicians
              </span>
            </div>
            <Popover open={techFilterPopoverOpen} onOpenChange={setTechFilterPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 sm:h-9 w-full sm:w-[260px] justify-between"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <UsersIcon className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="truncate text-left">{techFilterLabel}</span>
                  </span>
                  <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                collisionPadding={12}
                className="w-[min(calc(100vw-1.5rem),20rem)] sm:w-[280px] p-0"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
                  <span className="text-xs font-medium text-gray-500">
                    Select technicians
                  </span>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <button
                      type="button"
                      className="text-blue-600 hover:text-blue-700"
                      onClick={selectAllTechFilter}
                    >
                      Select all
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      type="button"
                      className="text-blue-600 hover:text-blue-700"
                      onClick={selectNoneTechFilter}
                    >
                      Select none
                    </button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {technicians.map((tech: any) => {
                    const checked = techFilterShowNone
                      ? false
                      : selectedTechFilterIds.length === 0 ||
                        selectedTechFilterIds.includes(tech.id);
                    return (
                      <label
                        key={tech.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => {
                            if (techFilterShowNone) {
                              // Coming from "none selected" — start fresh with this one.
                              setTechFilterShowNone(false);
                              setSelectedTechFilterIds([tech.id]);
                              return;
                            }
                            if (selectedTechFilterIds.length === 0) {
                              // Currently "all selected" — switch to only the others.
                              setSelectedTechFilterIds(
                                technicians
                                  .filter((t: any) => t.id !== tech.id)
                                  .map((t: any) => t.id)
                              );
                              return;
                            }
                            toggleTechFilter(tech.id);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-900 truncate">
                            {tech.full_name || 'Unknown'}
                          </div>
                          {tech.employee_id && (
                            <div className="text-xs text-gray-500 truncate">
                              {tech.employee_id}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-2 px-3 py-2 border-t">
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={() => setTechFilterPopoverOpen(false)}
                  >
                    Done
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {loadingSalaryBreakdowns && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Loading salary breakdowns...</span>
          </div>
        )}
        {!loadingSalaryBreakdowns && !salaryDataLoaded && (
          <Card className="relative overflow-hidden">
            <div className="blur-sm select-none pointer-events-none">
              <CardHeader className="bg-gray-50 border-b">
                <CardTitle className="text-lg">Technician 1</CardTitle>
                <p className="text-sm text-gray-600">Employee ID: EMP001</p>
                <div className="flex gap-6 mt-2">
                  <div className="text-2xl font-bold text-blue-600">₹ 45,200</div>
                  <div className="text-2xl font-bold text-green-600">₹ 28,500</div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-5 gap-4 mb-4">
                  {[8000, 4200, 500, 1200, 2000].map((n, i) => (
                    <div key={i} className="bg-gray-100 p-3 rounded-lg h-16" />
                  ))}
                </div>
                <div className="h-24 bg-gray-100 rounded-lg" />
              </CardContent>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[2px]">
              <DollarSign className="w-14 h-14 text-gray-400 mb-3" />
              <p className="text-gray-600 font-medium">Salary breakdown not loaded</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">Add expenses above without loading this data.</p>
              <Button onClick={() => loadSalaryBreakdownData(true)} disabled={!technicians.length || loadingSalaryBreakdowns}>
                <Eye className="w-4 h-4 mr-2" />
                View salary breakdown
              </Button>
            </div>
          </Card>
        )}
        {!loadingSalaryBreakdowns && salaryDataLoaded && displayedSalaryBreakdowns.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <User className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">No technician salary data found</p>
              <p className="text-sm text-gray-500 mt-1">Choose another technician or period.</p>
            </CardContent>
          </Card>
        )}
        {/* Mobile-only pager: swipe or use arrows to move between technicians */}
        {!loadingSalaryBreakdowns &&
          salaryDataLoaded &&
          isMobileViewport &&
          displayedSalaryBreakdowns.length > 1 && (
            <div className="sm:hidden flex items-center justify-between gap-2 p-2 bg-white border rounded-lg">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={() => advanceTechIndex(-1)}
                aria-label="Previous technician"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-0 flex-1 text-center">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {displayedSalaryBreakdowns[mobileTechIndex]?.technicianName}
                </div>
                <div className="text-[11px] text-gray-500">
                  {mobileTechIndex + 1} of {displayedSalaryBreakdowns.length} · swipe to switch
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={() => advanceTechIndex(1)}
                aria-label="Next technician"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        {!loadingSalaryBreakdowns && salaryDataLoaded && displayedSalaryBreakdowns.map((breakdown, breakdownIdx) => (
          <div
            key={breakdown.technicianId}
            className={
              isMobileViewport && breakdownIdx !== mobileTechIndex ? 'hidden' : ''
            }
          >
          <Card className="overflow-hidden">
            <CardHeader
              className="bg-gray-50 border-b p-4 sm:p-6 space-y-3 sm:touch-auto touch-pan-y select-none"
              onTouchStart={handleTechCardTouchStart}
              onTouchMove={handleTechCardTouchMove}
              onTouchEnd={handleTechCardTouchEnd}
              onTouchCancel={resetTechSwipeTracking}
            >
              <div>
                <CardTitle className="text-base sm:text-lg">{breakdown.technicianName}</CardTitle>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Employee ID: {breakdown.employeeId}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
                <div className="rounded-md bg-white border p-3 sm:text-right">
                  <div className="text-lg sm:text-xl font-bold text-blue-600 leading-tight">
                    ₹ {formatCurrency(breakdown.totalBillAmount)}
                  </div>
                  <p className="text-[11px] sm:text-xs text-gray-500 mt-1">Total Billing</p>
                </div>
                <div className="rounded-md bg-white border p-3 sm:text-right">
                  <div className={`text-lg sm:text-xl font-bold leading-tight ${selectedPeriod === 'rangeToCurrent' ? 'text-orange-600' : 'text-cyan-700'}`}>
                    ₹ {formatCurrency(selectedPeriod === 'rangeToCurrent' ? breakdown.totalAdvances : breakdown.salaryBeforeAdvance)}
                  </div>
                  <p className="text-[11px] sm:text-xs font-medium text-gray-700 mt-1">
                    {selectedPeriod === 'rangeToCurrent' ? 'Total Advance' : 'Salary before advance'}
                  </p>
                </div>
                <div className="rounded-md bg-white border p-3 sm:text-right">
                  <div className={`text-lg sm:text-xl font-bold leading-tight ${breakdown.totalSalary < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ₹ {formatCurrency(breakdown.totalSalary)}
                  </div>
                  <p className="text-[11px] sm:text-xs font-medium text-gray-700 mt-1">
                    {selectedPeriod === 'rangeToCurrent' ? 'Final Net Salary' : 'Net Salary'}
                  </p>
                  <p className="text-[11px] sm:text-xs text-gray-500">
                    {selectedPeriod === 'rangeToCurrent' ? 'Month-wise below' : 'After advances'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {selectedPeriod === 'rangeToCurrent' && breakdown.monthlyBreakdowns && breakdown.monthlyBreakdowns.length > 0 && (
                <div className="mb-6 p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">Monthly Salary Breakdown</h3>
                      <p className="text-xs text-gray-500">Each month is shown separately. Final totals are at the end.</p>
                    </div>
                    <div className="text-xs text-gray-500">
                      {breakdown.monthlyBreakdowns.length} month{breakdown.monthlyBreakdowns.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Billing</TableHead>
                          <TableHead className="text-right">Base + Leaves</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                          <TableHead className="text-right">Extra</TableHead>
                          <TableHead className="text-right">Before Advance</TableHead>
                          <TableHead className="text-right">Advance</TableHead>
                          <TableHead className="text-right">Net Salary</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {breakdown.monthlyBreakdowns.map((month) => (
                          <TableRow key={month.monthKey}>
                            <TableCell>
                              <div className="font-medium">{month.monthLabel}</div>
                              <div className="text-xs text-gray-500">
                                Leaves: {formatLeaveDays(month.totalHolidays)} used, {formatLeaveDays(month.extraHolidays)} unpaid
                                {month.unusedLeaves > 0 ? `, ${formatLeaveDays(month.unusedLeaves)} unused` : ''}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">₹ {formatCurrency(month.totalBillAmount)}</TableCell>
                            <TableCell className="text-right">₹ {formatCurrency(month.adjustedBaseSalary)}</TableCell>
                            <TableCell className="text-right text-green-700">₹ {formatCurrency(month.totalCommission)}</TableCell>
                            <TableCell className="text-right text-purple-700">
                              ₹ {formatCurrency(month.totalExtraCommission)}
                              {month.billingSlabCommission > 0 && (
                                <div className="text-xs text-gray-500">Slab: ₹ {formatCurrency(month.billingSlabCommission)}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium text-cyan-800">₹ {formatCurrency(month.salaryBeforeAdvance)}</TableCell>
                            <TableCell className="text-right text-orange-600">₹ {formatCurrency(month.totalAdvances)}</TableCell>
                            <TableCell className={`text-right font-semibold ${month.totalSalary < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                              ₹ {formatCurrency(month.totalSalary)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-white font-semibold">
                          <TableCell>Range Total</TableCell>
                          <TableCell className="text-right">₹ {formatCurrency(breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.totalBillAmount, 0))}</TableCell>
                          <TableCell className="text-right">₹ {formatCurrency(breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.adjustedBaseSalary, 0))}</TableCell>
                          <TableCell className="text-right text-green-700">₹ {formatCurrency(breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.totalCommission, 0))}</TableCell>
                          <TableCell className="text-right text-purple-700">₹ {formatCurrency(breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.totalExtraCommission, 0))}</TableCell>
                          <TableCell className="text-right text-cyan-800">₹ {formatCurrency(breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.salaryBeforeAdvance, 0))}</TableCell>
                          <TableCell className="text-right text-orange-600">₹ {formatCurrency(breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.totalAdvances, 0))}</TableCell>
                          <TableCell className={`text-right ${breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.totalSalary, 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                            ₹ {formatCurrency(breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.totalSalary, 0))}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                      <p className="text-xs text-gray-600">Total advance taken in range</p>
                      <p className="text-lg font-semibold text-orange-700">
                        ₹ {formatCurrency(breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.totalAdvances, 0))}
                      </p>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                      <p className="text-xs text-gray-600">Final net salary for range</p>
                      <p className={`text-lg font-semibold ${breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.totalSalary, 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        ₹ {formatCurrency(breakdown.monthlyBreakdowns.reduce((sum, month) => sum + month.totalSalary, 0))}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Salary Breakdown */}
              {selectedPeriod !== 'rangeToCurrent' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
                <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Base Salary (Monthly)</p>
                  <p className="text-lg sm:text-xl font-semibold text-blue-600">₹ {formatCurrency(breakdown.baseSalary)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Period: ₹ {formatCurrency(breakdown.periodBaseSalary)}
                  </p>
                  {(breakdown.holidayDeduction > 0 || breakdown.unusedLeaveBonus > 0) && (
                    <p className="text-xs text-gray-600 mt-1">
                      Adjusted: ₹ {formatCurrency(breakdown.adjustedBaseSalary)}
                      {breakdown.unusedLeaveBonus > 0 && (
                        <span className="text-green-600 ml-1">(+₹{formatCurrency(breakdown.unusedLeaveBonus)} unused leaves)</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="bg-green-50 p-3 sm:p-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Commission</p>
                  <p className="text-lg sm:text-xl font-semibold text-green-600">₹ {formatCurrency(breakdown.totalCommission)}</p>
                  <p className="text-xs text-gray-500 mt-1">(Variable % per job)</p>
                </div>
                <div className="bg-purple-50 p-3 sm:p-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Extra Commission</p>
                  <p className="text-lg sm:text-xl font-semibold text-purple-600">₹ {formatCurrency(breakdown.totalExtraCommission)}</p>
                  {breakdown.billingSlabCommission > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Includes ₹ {formatCurrency(breakdown.billingSlabCommission)} billing slab bonus
                    </p>
                  )}
                </div>
                <div className="bg-cyan-50 p-3 sm:p-4 rounded-lg border border-cyan-200">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Salary before advance</p>
                  <p className="text-lg sm:text-xl font-semibold text-cyan-800">
                    ₹ {formatCurrency(breakdown.salaryBeforeAdvance)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Adjusted base + commissions</p>
                </div>
                <div className="bg-red-50 p-3 sm:p-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Expenses</p>
                  <p className="text-lg sm:text-xl font-semibold text-red-600">₹ {formatCurrency(breakdown.totalExpenses)}</p>
                </div>
                <div className="bg-orange-50 p-3 sm:p-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Advances</p>
                  <p className="text-lg sm:text-xl font-semibold text-orange-600">₹ {formatCurrency(breakdown.totalAdvances)}</p>
                </div>
                <div className="bg-emerald-50 p-3 sm:p-4 rounded-lg border border-emerald-200">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Net Salary</p>
                  <p className={`text-lg sm:text-xl font-semibold ${breakdown.totalSalary < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    ₹ {formatCurrency(breakdown.totalSalary)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">After advances</p>
                </div>
              </div>
              )}

              {/* Calculation */}
              {selectedPeriod !== 'rangeToCurrent' && (
              <div className="mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-2">Salary Calculation:</p>
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="flex justify-between items-center gap-2">
                    <span className="truncate">Base Salary (Monthly):</span>
                    <span className="font-medium whitespace-nowrap">₹ {formatCurrency(breakdown.baseSalary)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2 text-gray-500">
                    <span className="truncate">Base Salary (Period):</span>
                    <span className="whitespace-nowrap">₹ {formatCurrency(breakdown.periodBaseSalary)}</span>
                  </div>
                  {(breakdown.holidayDeduction > 0 || breakdown.unusedLeaveBonus > 0) && (
                    <>
                      {breakdown.holidayDeduction > 0 && (
                        <div className="flex justify-between items-center gap-2 text-red-600">
                          <span className="truncate">Leave Deduction ({formatLeaveDays(breakdown.extraHolidays)} unpaid leave days):</span>
                          <span className="font-medium whitespace-nowrap">- ₹ {formatCurrency(breakdown.holidayDeduction)}</span>
                        </div>
                      )}
                      {breakdown.unusedLeaveBonus > 0 && (
                        <div className="flex justify-between items-center gap-2 text-green-600">
                          <span className="truncate">Unused Leave Bonus ({breakdown.unusedLeaves} unused leaves):</span>
                          <span className="font-medium whitespace-nowrap">+ ₹ {formatCurrency(breakdown.unusedLeaveBonus)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center gap-2">
                        <span className="truncate">Adjusted Base Salary:</span>
                        <span className="font-medium whitespace-nowrap">₹ {formatCurrency(breakdown.adjustedBaseSalary)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between items-center gap-2 text-green-600">
                    <span className="truncate">+ Commission:</span>
                    <span className="font-medium whitespace-nowrap">+ ₹ {formatCurrency(breakdown.totalCommission)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2 text-purple-600">
                    <span className="truncate">+ Extra Commission:</span>
                    <span className="font-medium whitespace-nowrap">+ ₹ {formatCurrency(breakdown.totalExtraCommission)}</span>
                  </div>
                  {breakdown.billingSlabCommission > 0 && (
                    <div className="flex justify-between items-center gap-2 text-purple-500 text-xs">
                      <span className="truncate">Billing slab bonus included:</span>
                      <span className="font-medium whitespace-nowrap">₹ {formatCurrency(breakdown.billingSlabCommission)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-200 font-semibold text-cyan-900">
                    <span className="truncate">Salary before advance:</span>
                    <span className="whitespace-nowrap">₹ {formatCurrency(breakdown.salaryBeforeAdvance)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2 text-orange-600">
                    <span className="truncate">- Advances:</span>
                    <span className="font-medium whitespace-nowrap">- ₹ {formatCurrency(breakdown.totalAdvances)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-300 font-bold text-base sm:text-lg">
                    <span className="truncate">Net Salary:</span>
                    <span className={breakdown.totalSalary < 0 ? 'text-red-600 whitespace-nowrap' : 'text-green-600 whitespace-nowrap'}>
                      ₹ {formatCurrency(breakdown.totalSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs mt-2 pt-2 border-t border-gray-200">
                    <span>Total Expenses (for analytics only):</span>
                    <span>₹ {formatCurrency(breakdown.totalExpenses)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs pt-1">
                    <span>Leaves: {formatLeaveDays(breakdown.totalHolidays)} used ({formatLeaveDays(breakdown.allowedHolidays)} allowed, {formatLeaveDays(breakdown.extraHolidays)} unpaid)</span>
                    <span></span>
                  </div>
                </div>
              </div>
              )}

              {/* Actions — equal-width grid on every breakpoint */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                <Button
                  size="sm"
                  onClick={() => {
                    if (commissionPeriod) {
                      setSelectedBreakdownForSlip(breakdown);
                      setIncludeDayWiseBreakdown(true);
                      setSalarySlipDialogOpen(true);
                    } else {
                      toast.error('Period information not available');
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white h-10 w-full justify-center text-xs sm:text-sm whitespace-nowrap min-w-0"
                >
                  <Download className="w-4 h-4 mr-2 shrink-0" />
                  <span className="truncate">Salary Slip</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAddExpense(breakdown.technicianId)}
                  className="bg-red-600 hover:bg-red-700 text-white h-10 w-full justify-center text-xs sm:text-sm whitespace-nowrap min-w-0"
                >
                  <TrendingDown className="w-4 h-4 mr-2 shrink-0" />
                  <span className="truncate">Add Expense</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAddExtraCommission(breakdown.technicianId)}
                  className="bg-purple-600 hover:bg-purple-700 text-white h-10 w-full justify-center text-xs sm:text-sm whitespace-nowrap min-w-0"
                >
                  <DollarSign className="w-4 h-4 mr-2 shrink-0" />
                  <span className="truncate">Add Extra Commission</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAddAdvance(breakdown.technicianId)}
                  className="bg-orange-600 hover:bg-orange-700 text-white h-10 w-full justify-center text-xs sm:text-sm whitespace-nowrap min-w-0"
                >
                  <TrendingUp className="w-4 h-4 mr-2 shrink-0" />
                  <span className="truncate">Add Advance</span>
                </Button>
              </div>

              {/* Expenses Table — collapsed by default */}
              {selectedPeriod !== 'rangeToCurrent' && breakdown.expenses.length > 0 && (
                <div className="mb-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setShowExpensesTable((prev) => ({
                        ...prev,
                        [breakdown.technicianId]: !prev[breakdown.technicianId],
                      }))
                    }
                    className="w-full flex items-center justify-between"
                  >
                    <span className="font-semibold">
                      Expenses ({breakdown.expenses.length})
                    </span>
                    {showExpensesTable[breakdown.technicianId] ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                  {showExpensesTable[breakdown.technicianId] && (
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {breakdown.expenses.map((expense) => (
                          <TableRow key={expense.id}>
                            <TableCell>{new Date(expense.expense_date).toLocaleDateString()}</TableCell>
                            <TableCell>{(expense.description && expense.description.trim()) || (expense.notes && expense.notes.trim()) || 'N/A'}</TableCell>
                            <TableCell>{expense.category || 'OTHER'}</TableCell>
                            <TableCell className="text-right font-semibold text-red-600">
                              ₹ {formatCurrency(expense.amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedTechnician(expense.technician_id);
                                    handleEditExpense(expense);
                                  }}
                                  className="hover:bg-blue-50"
                                  title="Edit expense"
                                >
                                  <Edit className="w-4 h-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete expense"
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  )}
                </div>
              )}

              {/* Advances Table — collapsed by default */}
              {selectedPeriod !== 'rangeToCurrent' && breakdown.advances.length > 0 && (
                <div className="mb-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setShowAdvancesTable((prev) => ({
                        ...prev,
                        [breakdown.technicianId]: !prev[breakdown.technicianId],
                      }))
                    }
                    className="w-full flex items-center justify-between"
                  >
                    <span className="font-semibold">
                      Advances ({breakdown.advances.length})
                    </span>
                    {showAdvancesTable[breakdown.technicianId] ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                  {showAdvancesTable[breakdown.technicianId] && (
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Payment Method</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {breakdown.advances.map((advance) => (
                          <TableRow key={advance.id}>
                            <TableCell>{new Date(advance.advance_date).toLocaleDateString()}</TableCell>
                            <TableCell>{advance.description || '-'}</TableCell>
                            <TableCell>{advance.payment_method || 'CASH'}</TableCell>
                            <TableCell className="text-right font-semibold text-orange-600">
                              ₹ {formatCurrency(advance.amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedTechnician(advance.technician_id);
                                    handleEditAdvance(advance);
                                  }}
                                  className="hover:bg-blue-50"
                                  title="Edit advance"
                                >
                                  <Edit className="w-4 h-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteAdvance(advance.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete advance"
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  )}
                </div>
              )}

              {/* Extra Commissions Table — collapsed by default */}
              {selectedPeriod !== 'rangeToCurrent' && breakdown.extraCommissions.length > 0 && (
                <div className="mb-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setShowExtraCommissionsTable((prev) => ({
                        ...prev,
                        [breakdown.technicianId]: !prev[breakdown.technicianId],
                      }))
                    }
                    className="w-full flex items-center justify-between"
                  >
                    <span className="font-semibold">
                      Extra Commissions ({breakdown.extraCommissions.length})
                    </span>
                    {showExtraCommissionsTable[breakdown.technicianId] ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                  {showExtraCommissionsTable[breakdown.technicianId] && (
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Payment Method</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {breakdown.extraCommissions.map((commission) => (
                          <TableRow key={commission.id}>
                            <TableCell>{new Date(commission.commission_date).toLocaleDateString()}</TableCell>
                            <TableCell>{commission.description}</TableCell>
                            <TableCell>{commission.payment_method || 'CASH'}</TableCell>
                            <TableCell className="text-right font-semibold text-purple-600">
                              ₹ {formatCurrency(commission.amount)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedTechnician(commission.technician_id);
                                    handleEditExtraCommission(commission);
                                  }}
                                  className="hover:bg-blue-50"
                                  title="Edit extra commission"
                                >
                                  <Edit className="w-4 h-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteExtraCommission(commission.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete extra commission"
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  )}
                </div>
              )}

              {/* Daily Breakdown */}
              {selectedPeriod !== 'rangeToCurrent' && (
              <div className="mb-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowDailyDetails(prev => ({
                      ...prev,
                      [breakdown.technicianId]: !prev[breakdown.technicianId]
                    }));
                  }}
                  className="w-full flex items-center justify-between"
                >
                  <span className="font-semibold">Daily Breakdown</span>
                  {showDailyDetails[breakdown.technicianId] ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
                
                {showDailyDetails[breakdown.technicianId] && (() => {
                  const currentPage = dailyBreakdownPage[breakdown.technicianId] || 1;
                  const totalDays = breakdown.dailyBreakdown.length;
                  const totalPages = Math.ceil(totalDays / itemsPerPage);
                  const startIndex = (currentPage - 1) * itemsPerPage;
                  const endIndex = startIndex + itemsPerPage;
                  const paginatedDays = breakdown.dailyBreakdown.slice(startIndex, endIndex);

                  return (
                    <div className="mt-3">
                      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white overflow-hidden">
                        {paginatedDays.map((day) => {
                          // Parse date string (YYYY-MM-DD) without timezone drift.
                          const [year, month, dayNum] = day.date.split('-').map(Number);
                          const dateObj = new Date(year, month - 1, dayNum);
                          const weekday = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
                          const monthName = dateObj.toLocaleDateString('en-IN', { month: 'short' });

                          const statusConfig =
                            day.status === 'absent'
                              ? { label: 'Absent', text: 'text-red-600', accent: 'bg-red-500' }
                              : day.status === 'halfDay'
                                ? { label: 'Half day', text: 'text-amber-600', accent: 'bg-amber-500' }
                                : day.billAmount > 0
                                  ? { label: 'Worked', text: 'text-emerald-600', accent: 'bg-emerald-500' }
                                  : { label: 'No jobs', text: 'text-gray-500', accent: 'bg-gray-300' };

                          return (
                            <li
                              key={day.date}
                              className="relative flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-gray-50/60 transition-colors"
                            >
                              <span
                                aria-hidden
                                className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r ${statusConfig.accent}`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-gray-900">
                                  {weekday}, {dayNum} {monthName}
                                </div>
                                <div className={`text-[11px] font-medium ${statusConfig.text}`}>
                                  {statusConfig.label}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-semibold text-gray-900 tabular-nums">
                                  {day.billAmount > 0 ? (
                                    `₹ ${formatCurrency(day.billAmount)}`
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                {day.billAmount > 0 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900"
                                    onClick={async () => {
                                      setSelectedDateForJobs({
                                        technicianId: breakdown.technicianId,
                                        date: day.date,
                                      });
                                      setJobDetailsDialogOpen(true);
                                      await loadJobsForDate(breakdown.technicianId, day.date);
                                    }}
                                    title="View jobs"
                                    aria-label="View jobs"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900"
                                  onClick={() => {
                                    setEditingDailyBreakdown({
                                      technicianId: breakdown.technicianId,
                                      date: day.date,
                                      isAbsent: day.isAbsent,
                                      status: day.status,
                                    });
                                    setDailyBreakdownFormData({ status: day.status });
                                    setDailyBreakdownEditDialogOpen(true);
                                  }}
                                  title="Edit day"
                                  aria-label="Edit day"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      {totalPages > 1 && (
                        <div className="flex items-center justify-between gap-3 mt-3 px-1">
                          <span className="text-[11px] text-gray-500 tabular-nums">
                            {startIndex + 1}–{Math.min(endIndex, totalDays)} of {totalDays}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                setDailyBreakdownPage((prev) => ({
                                  ...prev,
                                  [breakdown.technicianId]: Math.max(1, currentPage - 1),
                                }));
                              }}
                              disabled={currentPage === 1}
                              aria-label="Previous page"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-xs font-medium text-gray-700 tabular-nums px-2 min-w-[60px] text-center">
                              {currentPage} / {totalPages}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                setDailyBreakdownPage((prev) => ({
                                  ...prev,
                                  [breakdown.technicianId]: Math.min(totalPages, currentPage + 1),
                                }));
                              }}
                              disabled={currentPage === totalPages}
                              aria-label="Next page"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              )}
            </CardContent>
          </Card>
          </div>
        ))}
      </div>

      {/* Add/Edit Leave Dialog */}
      <Dialog open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingHoliday ? 'Edit Leave' : 'Add Leave'}</DialogTitle>
            <DialogDescription>
              Add a manual leave for technician
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="holiday-technician">Technician</Label>
              <Select
                value={holidayFormData.technician_id}
                onValueChange={(value) => setHolidayFormData({ ...holidayFormData, technician_id: value })}
                disabled={!!editingHoliday}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.full_name} ({tech.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="holiday-date">Leave Date *</Label>
              <DatePicker
                value={holidayFormData.holiday_date || undefined}
                onChange={(v) => v && setHolidayFormData({ ...holidayFormData, holiday_date: v })}
                placeholder="Pick date"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="holiday-reason">Reason</Label>
              <Input
                id="holiday-reason"
                value={holidayFormData.reason}
                onChange={(e) => setHolidayFormData({ ...holidayFormData, reason: e.target.value })}
                placeholder="e.g., Sick leave, Personal leave"
              />
            </div>
            <div>
              <Label htmlFor="holiday-notes">Notes</Label>
              <Textarea
                id="holiday-notes"
                value={holidayFormData.notes}
                onChange={(e) => setHolidayFormData({ ...holidayFormData, notes: e.target.value })}
                placeholder="Additional notes (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHolidayDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveHoliday}>
              {editingHoliday ? 'Update' : 'Add'} Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Daily Breakdown Dialog */}
      <Dialog open={dailyBreakdownEditDialogOpen} onOpenChange={setDailyBreakdownEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Daily Breakdown</DialogTitle>
            <DialogDescription>
              {editingDailyBreakdown && (() => {
                // Parse date string (YYYY-MM-DD) correctly to avoid timezone issues
                const [year, month, dayNum] = editingDailyBreakdown.date.split('-').map(Number);
                const dateObj = new Date(year, month - 1, dayNum);
                const getDaySuffix = (day: number) => {
                  if (day === 1 || day === 21 || day === 31) return 'st';
                  if (day === 2 || day === 22) return 'nd';
                  if (day === 3 || day === 23) return 'rd';
                  return 'th';
                };
                const monthName = dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
                return <>Mark attendance status for {dayNum}{getDaySuffix(dayNum)} of {monthName}</>;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="daily-is-absent">Attendance Status</Label>
              <Select
                value={dailyBreakdownFormData.status}
                onValueChange={(value) => setDailyBreakdownFormData({ ...dailyBreakdownFormData, status: value as AttendanceStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present / Worked</SelectItem>
                  <SelectItem value="halfDay">Half Day</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {dailyBreakdownFormData.status === 'absent'
                  ? 'Absent will count as one leave day'
                  : dailyBreakdownFormData.status === 'halfDay'
                  ? 'Half day will count as 0.5 leave day, so half day salary is given'
                  : 'Present will remove leave records for this day'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDailyBreakdownEditDialogOpen(false);
              setEditingDailyBreakdown(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveDailyBreakdown}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Extra Commission Dialog */}
      <Dialog open={extraCommissionDialogOpen} onOpenChange={setExtraCommissionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExtraCommission ? 'Edit Extra Commission' : 'Add Extra Commission'}</DialogTitle>
            <DialogDescription>
              Add bonus or extra commission for technician
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="extra-commission-technician">Technician</Label>
              <Select
                value={extraCommissionFormData.technician_id}
                onValueChange={(value) => setExtraCommissionFormData({ ...extraCommissionFormData, technician_id: value })}
                disabled={!!editingExtraCommission}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.full_name} ({tech.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="extra-commission-amount">Amount *</Label>
              <Input
                id="extra-commission-amount"
                type="number"
                step="0.01"
                min="0"
                value={extraCommissionFormData.amount}
                onChange={(e) => setExtraCommissionFormData({ ...extraCommissionFormData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="extra-commission-description">Description *</Label>
              <Input
                id="extra-commission-description"
                value={extraCommissionFormData.description}
                onChange={(e) => setExtraCommissionFormData({ ...extraCommissionFormData, description: e.target.value })}
                placeholder="e.g., Performance bonus, Special project"
              />
            </div>
            <div>
              <Label htmlFor="extra-commission-date">Commission Date</Label>
              <DatePicker
                value={extraCommissionFormData.commission_date || undefined}
                onChange={(v) => v && setExtraCommissionFormData({ ...extraCommissionFormData, commission_date: v })}
                placeholder="Pick date"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="extra-commission-payment-method">Payment Method</Label>
              <Select
                value={extraCommissionFormData.payment_method}
                onValueChange={(value) => setExtraCommissionFormData({ ...extraCommissionFormData, payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="extra-commission-reference">Payment Reference</Label>
              <Input
                id="extra-commission-reference"
                value={extraCommissionFormData.payment_reference}
                onChange={(e) => setExtraCommissionFormData({ ...extraCommissionFormData, payment_reference: e.target.value })}
                placeholder="Transaction reference (optional)"
              />
            </div>
            <div>
              <Label htmlFor="extra-commission-notes">Notes</Label>
              <Textarea
                id="extra-commission-notes"
                value={extraCommissionFormData.notes}
                onChange={(e) => setExtraCommissionFormData({ ...extraCommissionFormData, notes: e.target.value })}
                placeholder="Additional notes (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtraCommissionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveExtraCommission}>
              {editingExtraCommission ? 'Update' : 'Add'} Extra Commission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
            <DialogDescription>
              Record company expense for technician
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="expense-technician">Technician</Label>
              <Select
                value={expenseFormData.technician_id}
                onValueChange={(value) => setExpenseFormData({ ...expenseFormData, technician_id: value })}
                disabled={!!editingExpense}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.full_name} ({tech.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="expense-amount">Amount (₹) *</Label>
              <Input
                id="expense-amount"
                type="number"
                min="0"
                step="0.01"
                value={expenseFormData.amount}
                onChange={(e) => setExpenseFormData({ ...expenseFormData, amount: e.target.value })}
                placeholder="Enter amount"
              />
            </div>
            <div>
              <Label htmlFor="expense-description">Description *</Label>
              <Input
                id="expense-description"
                value={expenseFormData.description}
                onChange={(e) => setExpenseFormData({ ...expenseFormData, description: e.target.value })}
                placeholder="e.g., Fuel, Tools, Parts"
              />
            </div>
            <div>
              <Label htmlFor="expense-date">Date</Label>
              <DatePicker
                value={expenseFormData.expense_date || undefined}
                onChange={(v) => v && setExpenseFormData({ ...expenseFormData, expense_date: v })}
                placeholder="Pick date"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="expense-category">Category</Label>
              <Select
                value={expenseFormData.category}
                onValueChange={(value) => setExpenseFormData({ ...expenseFormData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FUEL">Fuel</SelectItem>
                  <SelectItem value="TOOLS">Tools</SelectItem>
                  <SelectItem value="PARTS">Parts</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="expense-notes">Notes</Label>
              <Textarea
                id="expense-notes"
                value={expenseFormData.notes}
                onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })}
                placeholder="Additional notes (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveExpense}
              disabled={!expenseFormData.technician_id || !expenseFormData.amount || !expenseFormData.description}
              className="bg-red-600 hover:bg-red-700"
            >
              {editingExpense ? 'Update' : 'Add'} Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Details Dialog */}
      <Dialog open={jobDetailsDialogOpen} onOpenChange={setJobDetailsDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Job Details - {selectedDateForJobs && new Date(selectedDateForJobs.date).toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </DialogTitle>
            <DialogDescription>
              View and edit commission percentage for each job completed on this date
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {loadingJobsForDate ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Loading jobs...</span>
              </div>
            ) : jobsForDate.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No jobs found for this date
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Bill Amount</TableHead>
                      <TableHead className="text-right">Commission %</TableHead>
                      <TableHead className="text-right">Commission Amount</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobsForDate.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono text-sm">{job.job_number}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{job.customer?.full_name || 'N/A'}</div>
                            {job.customer?.phone && (
                              <div className="text-xs text-gray-500">{job.customer.phone}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{job.service_type} - {job.service_sub_type}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {editingJobAmount?.jobId === job.id ? (
                            <div className="flex items-center gap-2 justify-end">
                              <span className="text-sm">₹</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editingJobAmount.amount}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  // Ensure value is >= 0
                                  const clampedValue = Math.max(0, value);
                                  // Round to 2 decimal places
                                  const roundedValue = Math.round(clampedValue * 100) / 100;
                                  setEditingJobAmount({
                                    jobId: job.id,
                                    amount: roundedValue
                                  });
                                }}
                                className="w-24 h-8 text-sm font-semibold"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdateJobAmount(job.id, editingJobAmount.amount)}
                                className="h-8 px-2"
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingJobAmount(null)}
                                className="h-8 px-2"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 justify-end">
                              <span className="font-semibold">₹ {formatCurrency(job.bill_amount)}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  // Cancel commission editing if active
                                  if (editingJobCommission?.jobId === job.id) {
                                    setEditingJobCommission(null);
                                  }
                                  setEditingJobAmount({
                                    jobId: job.id,
                                    amount: job.bill_amount
                                  });
                                }}
                                disabled={editingJobCommission?.jobId === job.id}
                                className="h-6 w-6 p-0"
                                title="Edit amount"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingJobCommission?.jobId === job.id ? (
                            <div className="flex items-center gap-2 justify-end">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={editingJobCommission.commissionPercentage}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  // Clamp value between 0 and 100
                                  const clampedValue = Math.max(0, Math.min(100, value));
                                  // Round to 2 decimal places
                                  const roundedValue = Math.round(clampedValue * 100) / 100;
                                  setEditingJobCommission({
                                    jobId: job.id,
                                    commissionPercentage: roundedValue
                                  });
                                }}
                                className="w-20 h-8 text-sm"
                                autoFocus
                              />
                              <span className="text-sm">%</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdateJobCommission(job.id, editingJobCommission.commissionPercentage)}
                                className="h-8 px-2"
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingJobCommission(null)}
                                className="h-8 px-2"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 justify-end">
                              <span className={`font-medium ${job.commission_percentage > 50 ? 'text-red-600' : ''}`}>
                                {job.commission_percentage.toFixed(2)}%
                                {job.commission_percentage > 50 && (
                                  <span className="ml-1 text-xs text-red-500" title="High commission percentage - please verify">
                                    ⚠️
                                  </span>
                                )}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  // Cancel amount editing if active
                                  if (editingJobAmount?.jobId === job.id) {
                                    setEditingJobAmount(null);
                                  }
                                  setEditingJobCommission({
                                    jobId: job.id,
                                    commissionPercentage: job.commission_percentage
                                  });
                                }}
                                disabled={editingJobAmount?.jobId === job.id}
                                className="h-6 w-6 p-0"
                                title="Edit commission"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          ₹ {formatCurrency(job.commission_amount)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (editingJobCommission?.jobId === job.id) {
                                setEditingJobCommission(null);
                              } else if (editingJobAmount?.jobId === job.id) {
                                setEditingJobAmount(null);
                              } else {
                                // Start editing commission by default
                                setEditingJobCommission({
                                  jobId: job.id,
                                  commissionPercentage: job.commission_percentage
                                });
                              }
                            }}
                            className="h-8"
                          >
                            {editingJobCommission?.jobId === job.id || editingJobAmount?.jobId === job.id ? (
                              <>
                                <X className="w-3 h-3 mr-1" />
                                Cancel
                              </>
                            ) : (
                              <>
                                <Pencil className="w-3 h-3 mr-1" />
                                Edit
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setJobDetailsDialogOpen(false);
              setSelectedDateForJobs(null);
              setJobsForDate([]);
              setEditingJobCommission(null);
              setEditingJobAmount(null);
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Advance Dialog */}
      <Dialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAdvance ? 'Edit Advance' : 'Add Advance'}</DialogTitle>
            <DialogDescription>
              Record advance payment to technician
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="advance-technician">Technician</Label>
              <Select
                value={advanceFormData.technician_id}
                onValueChange={(value) => setAdvanceFormData({ ...advanceFormData, technician_id: value })}
                disabled={!!editingAdvance}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.full_name} ({tech.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="advance-amount">Amount (₹) *</Label>
              <Input
                id="advance-amount"
                type="number"
                min="0"
                step="0.01"
                value={advanceFormData.amount}
                onChange={(e) => setAdvanceFormData({ ...advanceFormData, amount: e.target.value })}
                placeholder="Enter amount"
              />
            </div>
            <div>
              <Label htmlFor="advance-description">Description</Label>
              <Input
                id="advance-description"
                value={advanceFormData.description}
                onChange={(e) => setAdvanceFormData({ ...advanceFormData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
            <div>
              <Label htmlFor="advance-date">Date</Label>
              <DatePicker
                value={advanceFormData.advance_date || undefined}
                onChange={(v) => v && setAdvanceFormData({ ...advanceFormData, advance_date: v })}
                placeholder="Pick date"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="advance-payment-method">Payment Method</Label>
              <Select
                value={advanceFormData.payment_method}
                onValueChange={(value) => setAdvanceFormData({ ...advanceFormData, payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="advance-reference">Payment Reference</Label>
              <Input
                id="advance-reference"
                value={advanceFormData.payment_reference}
                onChange={(e) => setAdvanceFormData({ ...advanceFormData, payment_reference: e.target.value })}
                placeholder="Transaction ID, UPI reference, etc."
              />
            </div>
            <div>
              <Label htmlFor="advance-notes">Notes</Label>
              <Textarea
                id="advance-notes"
                value={advanceFormData.notes}
                onChange={(e) => setAdvanceFormData({ ...advanceFormData, notes: e.target.value })}
                placeholder="Additional notes (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAdvance}
              disabled={!advanceFormData.technician_id || !advanceFormData.amount}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {editingAdvance ? 'Update' : 'Add'} Advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salary Slip Download Dialog */}
      <Dialog open={salarySlipDialogOpen} onOpenChange={setSalarySlipDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salary Slip</DialogTitle>
            <DialogDescription>
              Generate (print preview) or download the salary slip as a PDF
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Salary Slip Type</Label>
              <Select
                value={includeDayWiseBreakdown ? 'with' : 'without'}
                onValueChange={(value) => setIncludeDayWiseBreakdown(value === 'with')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="with">With Day-wise Breakdown</SelectItem>
                  <SelectItem value="without">Without Day-wise Breakdown</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {includeDayWiseBreakdown 
                  ? 'Includes detailed day-wise job breakdown with commissions, advances, and extra commissions'
                  : 'Summary only without day-wise details'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSalarySlipDialogOpen(false);
                setSelectedBreakdownForSlip(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedBreakdownForSlip && commissionPeriod) {
                  generateSalarySlipPDF(selectedBreakdownForSlip, commissionPeriod, 'print', includeDayWiseBreakdown);
                  setSalarySlipDialogOpen(false);
                  setSelectedBreakdownForSlip(null);
                } else {
                  toast.error('Period information not available');
                }
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Printer className="w-4 h-4 mr-2" />
              Generate
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedBreakdownForSlip && commissionPeriod) {
                  generateSalarySlipPDF(selectedBreakdownForSlip, commissionPeriod, 'pdf', includeDayWiseBreakdown);
                  setSalarySlipDialogOpen(false);
                  setSelectedBreakdownForSlip(null);
                } else {
                  toast.error('Period information not available');
                }
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* General business_expenses first, then other_expenses below. Lists load on demand. */}
      <div className="mt-8 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Business expenses</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            General business expenses first; other business expenses below. Each table loads only when you click View (not loaded by default). You can still add expenses from the card header without loading the full list.
          </p>
        </div>

      {/* General Business Expenses — stored in public.business_expenses */}
      <Card className="min-w-0 border-gray-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="w-5 h-5 shrink-0" />
                Business Expenses
              </CardTitle>
              <CardDescription>
                Saved to the <code className="text-xs bg-gray-100 px-1 rounded">business_expenses</code> table.
              </CardDescription>
            </div>
            <Button onClick={handleAddBusinessExpense} size="sm" disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!businessExpensesViewed ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingDown className="w-12 h-12 text-gray-400 mb-2" />
              <p className="text-gray-600 font-medium">Business expenses not loaded</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">You can add expenses above without loading the list.</p>
              <Button onClick={handleViewBusinessExpenses} disabled={loadingBusinessExpenses}>
                <Eye className="w-4 h-4 mr-2" />
                {loadingBusinessExpenses ? 'Loading...' : 'View business expenses'}
              </Button>
            </div>
          ) : loadingBusinessExpenses ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Loading business expenses...</span>
            </div>
          ) : businessExpenses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <TrendingDown className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No business expenses recorded yet.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {businessExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          {new Date(expense.expense_date).toLocaleDateString('en-IN')}
                        </TableCell>
                        <TableCell className="font-medium">{expense.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{expense.category || 'OTHER'}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          ₹ {formatCurrency(expense.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditBusinessExpense(expense)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteBusinessExpense(expense.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-700">Total Business Expenses:</span>
                  <span className="text-xl font-bold text-red-600">
                    ₹ {formatCurrency(businessExpenses.reduce((sum, e) => sum + e.amount, 0))}
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Other Business Expenses — stored in public.other_expenses */}
      <Card className="min-w-0 border-gray-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="w-5 h-5 shrink-0" />
                Other Business Expenses
              </CardTitle>
              <CardDescription>
                Saved to the <code className="text-xs bg-gray-100 px-1 rounded">other_expenses</code> table. Shown separately in Analytics.
              </CardDescription>
            </div>
            <Button onClick={handleAddOtherExpense} size="sm" disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!otherExpensesViewed ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingDown className="w-12 h-12 text-gray-400 mb-2" />
              <p className="text-gray-600 font-medium">Other business expenses not loaded</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">You can add expenses above without loading the list.</p>
              <Button onClick={handleViewOtherExpenses} disabled={loadingOtherExpenses}>
                <Eye className="w-4 h-4 mr-2" />
                {loadingOtherExpenses ? 'Loading...' : 'View other business expenses'}
              </Button>
            </div>
          ) : loadingOtherExpenses ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Loading other business expenses...</span>
            </div>
          ) : otherExpenses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <TrendingDown className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No other business expenses recorded yet.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otherExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          {new Date(expense.expense_date).toLocaleDateString('en-IN')}
                        </TableCell>
                        <TableCell className="font-medium">{expense.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{expense.category || 'OTHER'}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          ₹ {formatCurrency(expense.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditOtherExpense(expense)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteOtherExpense(expense.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-700">Total Other Business Expenses:</span>
                  <span className="text-xl font-bold text-red-600">
                    ₹ {formatCurrency(otherExpenses.reduce((sum, e) => sum + e.amount, 0))}
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Business Expense Dialog */}
      <Dialog open={businessExpenseDialogOpen} onOpenChange={setBusinessExpenseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingBusinessExpense ? 'Edit Business Expense' : 'Add Business Expense'}
            </DialogTitle>
            <DialogDescription>
              Record a general business expense
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={businessExpenseFormData.amount}
                onChange={(e) => setBusinessExpenseFormData({ ...businessExpenseFormData, amount: e.target.value })}
                placeholder="Enter amount"
              />
            </div>
            <div>
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={businessExpenseFormData.description}
                onChange={(e) => setBusinessExpenseFormData({ ...businessExpenseFormData, description: e.target.value })}
                placeholder="Enter description"
              />
            </div>
            <div>
              <Label htmlFor="expense_date">Date *</Label>
              <DatePicker
                value={businessExpenseFormData.expense_date || undefined}
                onChange={(v) => v && setBusinessExpenseFormData({ ...businessExpenseFormData, expense_date: v })}
                placeholder="Pick date"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={businessExpenseFormData.category}
                onValueChange={(value) => setBusinessExpenseFormData({ ...businessExpenseFormData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                  <SelectItem value="JOB_COST">Job Cost</SelectItem>
                  <SelectItem value="OTHER_BUSINESS_EXPENSE">Other Business Expense</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={businessExpenseFormData.notes}
                onChange={(e) => setBusinessExpenseFormData({ ...businessExpenseFormData, notes: e.target.value })}
                placeholder="Additional notes (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBusinessExpenseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveBusinessExpense}
              disabled={!businessExpenseFormData.amount || !businessExpenseFormData.description}
              className="bg-red-600 hover:bg-red-700"
            >
              {editingBusinessExpense ? 'Update' : 'Add'} Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Other Expense Dialog */}
      <Dialog open={otherExpenseDialogOpen} onOpenChange={setOtherExpenseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingOtherExpense ? 'Edit Other Business Expense' : 'Add Other Business Expense'}
            </DialogTitle>
            <DialogDescription>
              Record a miscellaneous business expense (included in Analytics as other business expenses)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="other-amount">Amount *</Label>
              <Input
                id="other-amount"
                type="number"
                step="0.01"
                value={otherExpenseFormData.amount}
                onChange={(e) => setOtherExpenseFormData({ ...otherExpenseFormData, amount: e.target.value })}
                placeholder="Enter amount"
              />
            </div>
            <div>
              <Label htmlFor="other-description">Description *</Label>
              <Input
                id="other-description"
                value={otherExpenseFormData.description}
                onChange={(e) => setOtherExpenseFormData({ ...otherExpenseFormData, description: e.target.value })}
                placeholder="Enter description"
              />
            </div>
            <div>
              <Label htmlFor="other-expense_date">Date *</Label>
              <DatePicker
                value={otherExpenseFormData.expense_date || undefined}
                onChange={(v) => v && setOtherExpenseFormData({ ...otherExpenseFormData, expense_date: v })}
                placeholder="Pick date"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="other-category">Category</Label>
              <Select
                value={otherExpenseFormData.category}
                onValueChange={(value) => setOtherExpenseFormData({ ...otherExpenseFormData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="other-notes">Notes</Label>
              <Textarea
                id="other-notes"
                value={otherExpenseFormData.notes}
                onChange={(e) => setOtherExpenseFormData({ ...otherExpenseFormData, notes: e.target.value })}
                placeholder="Additional notes (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOtherExpenseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveOtherExpense}
              disabled={!otherExpenseFormData.amount || !otherExpenseFormData.description}
              className="bg-red-600 hover:bg-red-700"
            >
              {editingOtherExpense ? 'Update' : 'Add'} Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Technician Analytics Section */}
    </div>
  );
};

export default TechnicianPayments;

