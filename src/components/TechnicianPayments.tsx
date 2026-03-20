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
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { DollarSign, User, Plus, Trash2, Edit, TrendingDown, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Pencil, Check, X, ChevronLeft, ChevronRight, Eye, TrendingUp as TrendingUpIcon, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { generateSalarySlipPDF } from '@/lib/salary-slip-pdf-generator';

interface TechnicianPayment {
  id: string;
  technician_id: string;
  job_id: string;
  bill_amount: number;
  commission_percentage: number;
  commission_amount: number;
  payment_status: 'PENDING' | 'PAID' | 'CANCELLED';
  payment_date?: string;
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

interface DailyBreakdown {
  date: string;
  billAmount: number;
  isAbsent: boolean;
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
  totalExpenses: number;
  totalAdvances: number;
  totalHolidays: number;
  allowedHolidays: number;
  extraHolidays: number;
  unusedLeaves: number; // Number of unused leaves (if less than 4 used)
  unusedLeaveBonus: number; // Bonus amount for unused leaves
  holidayDeduction: number;
  totalSalary: number; // adjustedBaseSalary + commission + extraCommission - advances
  totalBillAmount: number; // Total billing done by this technician in the period
  payments: TechnicianPayment[];
  expenses: TechnicianExpense[];
  advances: TechnicianAdvance[];
  extraCommissions: TechnicianExtraCommission[];
  holidays: TechnicianHoliday[];
  dailyBreakdown: DailyBreakdown[]; // Daily billing breakdown
}

// Helper function to format currency with commas and without .00 when it's zero
const formatCurrency = (amount: number): string => {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
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
  const [showDailyDetails, setShowDailyDetails] = useState<Record<string, boolean>>({});
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
  } | null>(null);
  const [dailyBreakdownFormData, setDailyBreakdownFormData] = useState({
    isAbsent: false
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
      const [year, month] = selectedPastMonth.split('-').map(Number);
      const selectedMonthIndex = month - 1;
      startDate = new Date(year, selectedMonthIndex, 1, 0, 0, 0, 0);

      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    } else {
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      startDate = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
      endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    }
    
    return { startDate, endDate };
  }, [selectedPeriod, selectedPastMonth]);

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
      const techsResult = await db.technicians.getList(100);
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
        supabase.from('technician_payments').select(`*, technician:technicians(id, full_name, employee_id), job:jobs(id, job_number)`)
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

      const breakdowns: TechnicianSalaryBreakdown[] = techs.map((tech: any) => {
        const techId = tech.id;
        const monthlyBaseSalary = (tech.salary && typeof tech.salary === 'object' && (tech.salary as any).baseSalary) ? (tech.salary as any).baseSalary : 8000;
        const periodBaseSalary = monthlyBaseSalary * inclusiveMonthCount;
        const dailyBaseSalary = monthlyBaseSalary / 30;
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
        const totalExtraCommission = techExtraCommissions.reduce((sum, ec) => sum + (ec.amount || 0), 0);

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
            if (!existingHoliday || existingHoliday.reason !== 'MARKED_AS_PRESENT') autoDetectedHolidays.push(date);
          }
        });

        const allHolidayDates = new Set<string>();
        techHolidays.forEach(h => {
          const holidayDate = h.holiday_date.split('T')[0];
          const endDateStr = formatDateString(endDate);
          if (holidayDate <= todayStrForHolidays && holidayDate >= periodStartStr && holidayDate <= endDateStr && h.reason !== 'MARKED_AS_PRESENT') {
            allHolidayDates.add(holidayDate);
          }
        });
        autoDetectedHolidays.forEach(date => {
          if (date >= periodStartStr && date <= todayStrForHolidays) allHolidayDates.add(date);
        });

        const totalHolidays = allHolidayDates.size;
        const extraHolidays = Math.max(0, totalHolidays - allowedHolidays);
        const holidayDeduction = extraHolidays * dailyBaseSalary;
        const unusedLeaves = Math.max(0, allowedHolidays - totalHolidays);
        const unusedLeaveBonus = unusedLeaves * dailyBaseSalary;
        const adjustedBaseSalary = periodBaseSalary - holidayDeduction + unusedLeaveBonus;

        const displayHolidays: TechnicianHoliday[] = techHolidays.filter(h => h.reason !== 'MARKED_AS_PRESENT');
        autoDetectedHolidays.forEach(date => {
          displayHolidays.push({ id: `auto-${date}`, technician_id: techId, holiday_date: date, is_manual: false, reason: 'No completed jobs - auto-detected as absent' });
        });
        displayHolidays.sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime());
        const absentDays: TechnicianHoliday[] = extraHolidays > 0
          ? displayHolidays.filter(h => allHolidayDates.has(h.holiday_date.split('T')[0])).sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime()).slice(0, extraHolidays)
          : [];
        absentDays.sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime());

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
            const presentOverride = techHolidays.find(h => h.holiday_date.split('T')[0] === date && h.reason === 'MARKED_AS_PRESENT');
            const manualAbsentHoliday = techHolidays.find(h => h.holiday_date.split('T')[0] === date && h.reason !== 'MARKED_AS_PRESENT' && h.is_manual === true);
            let isAbsent: boolean;
            if (presentOverride) isAbsent = false;
            else if (manualAbsentHoliday) isAbsent = true;
            else isAbsent = !hasJobsOnDate && allHolidayDates.has(date);
            return { date, billAmount, isAbsent };
          })
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const totalSalary = adjustedBaseSalary + totalCommission + totalExtraCommission - totalAdvances;

        return {
          technicianId: techId,
          technicianName: tech.full_name || 'Unknown',
          employeeId: tech.employee_id || '',
          baseSalary: monthlyBaseSalary,
          periodBaseSalary,
          adjustedBaseSalary,
          totalCommission,
          totalExtraCommission,
          totalExpenses,
          totalAdvances,
          totalHolidays,
          allowedHolidays,
          extraHolidays,
          unusedLeaves,
          unusedLeaveBonus,
          holidayDeduction,
          totalSalary,
          totalBillAmount,
          payments: techPayments,
          expenses: techExpenses,
          advances: techAdvances,
          extraCommissions: techExtraCommissions,
          holidays: absentDays,
          dailyBreakdown
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
  }, [technicians, getMonthlyDateRange]);

  useEffect(() => {
    loadTechniciansOnly();
  }, [selectedPeriod, selectedPastMonth, loadTechniciansOnly]);

  const prevBusinessPeriodRef = useRef({ selectedPeriod, selectedPastMonth });
  useEffect(() => {
    if (!businessExpensesViewed) return;
    const same = prevBusinessPeriodRef.current.selectedPeriod === selectedPeriod && prevBusinessPeriodRef.current.selectedPastMonth === selectedPastMonth;
    prevBusinessPeriodRef.current = { selectedPeriod, selectedPastMonth };
    if (same) return;
    setLoadingBusinessExpenses(true);
    loadBusinessExpensesOnly().then(() => setLoadingBusinessExpenses(false));
  }, [selectedPeriod, selectedPastMonth, businessExpensesViewed, loadBusinessExpensesOnly]);

  const prevOtherPeriodRef = useRef({ selectedPeriod, selectedPastMonth });
  useEffect(() => {
    if (!otherExpensesViewed) return;
    const same = prevOtherPeriodRef.current.selectedPeriod === selectedPeriod && prevOtherPeriodRef.current.selectedPastMonth === selectedPastMonth;
    prevOtherPeriodRef.current = { selectedPeriod, selectedPastMonth };
    if (same) return;
    setLoadingOtherExpenses(true);
    loadOtherExpensesOnly().then(() => setLoadingOtherExpenses(false));
  }, [selectedPeriod, selectedPastMonth, otherExpensesViewed, loadOtherExpensesOnly]);

  const prevPeriodRef = useRef({ selectedPeriod, selectedPastMonth });
  useEffect(() => {
    if (!salaryDataLoaded) return;
    const same = prevPeriodRef.current.selectedPeriod === selectedPeriod && prevPeriodRef.current.selectedPastMonth === selectedPastMonth;
    prevPeriodRef.current = { selectedPeriod, selectedPastMonth };
    if (same) return;
    loadSalaryBreakdownData(false);
  }, [selectedPeriod, selectedPastMonth, salaryDataLoaded, loadSalaryBreakdownData]);


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
      category: 'OTHER',
      notes: ''
    });
    setBusinessExpenseDialogOpen(true);
  };

  const handleEditBusinessExpense = (expense: any) => {
    setEditingBusinessExpense(expense);
    setBusinessExpenseFormData({
      amount: expense.amount.toString(),
      description: expense.description,
      expense_date: expense.expense_date.split('T')[0],
      category: expense.category || 'OTHER',
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
    setOtherExpenseFormData({
      amount: expense.amount.toString(),
      description: expense.description,
      expense_date: expense.expense_date.split('T')[0],
      category: expense.category || 'OTHER',
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
      const newIsAbsent = dailyBreakdownFormData.isAbsent;
      const oldIsAbsent = editingDailyBreakdown.isAbsent;
      let hasChanges = false;

      // Update present/absent status
      if (newIsAbsent !== oldIsAbsent) {
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
          oldIsAbsent,
          newIsAbsent,
          existingHolidays: existingHolidays?.length || 0
        });

        if (newIsAbsent) {
          // Mark as absent - first remove any present override markers, then add absent holiday
          let deletedPresentOverrides = 0;
          let hasAbsentHoliday = false;
          
          if (existingHolidays && existingHolidays.length > 0) {
            // Check if there's a present override marker - delete it first
            const presentOverride = existingHolidays.find(h => h.reason === 'MARKED_AS_PRESENT');
            if (presentOverride) {
              const { error: deleteError } = await db.technicianHolidays.delete(presentOverride.id);
              if (deleteError) {
                console.error('Error deleting present override:', deleteError);
                throw deleteError;
              }
              deletedPresentOverrides++;
            }
            
            // Check if there's already an absent holiday (manual or auto-detected)
            hasAbsentHoliday = existingHolidays.some(h => h.reason !== 'MARKED_AS_PRESENT');
          }
          
          // Create absent holiday if it doesn't exist
          if (!hasAbsentHoliday) {
            const { error: addHolidayError } = await db.technicianHolidays.create({
              technician_id: technicianId,
              holiday_date: date,
              is_manual: true,
              reason: 'Manual adjustment',
              notes: 'Updated from daily breakdown'
            });
            if (addHolidayError) {
              console.error('Error adding holiday:', addHolidayError);
              throw addHolidayError;
            }
            if (deletedPresentOverrides > 0) {
              toast.success('Day marked as absent (removed present override)');
            } else {
              toast.success('Day marked as absent');
            }
            hasChanges = true;
          } else {
            // Absent holiday already exists
            if (deletedPresentOverrides > 0) {
              toast.success('Day marked as absent (removed present override)');
              hasChanges = true;
            } else {
              toast.info('Day is already marked as absent');
              hasChanges = true; // Still reload to refresh
            }
          }
        } else {
          // Mark as present - remove ALL holidays (both manual and auto-detected)
          // Then create a "present override" marker to prevent auto-detection
          let deletedCount = 0;
          if (existingHolidays && existingHolidays.length > 0) {
            for (const holiday of existingHolidays) {
              // Skip if it's already a present override marker
              if (holiday.reason === 'MARKED_AS_PRESENT') {
                continue;
              }
              // Delete all holidays (both manual and auto-detected) to mark as present
              const { error: deleteError } = await db.technicianHolidays.delete(holiday.id);
              if (deleteError) {
                console.error('Error deleting holiday:', deleteError);
                // Continue with other holidays even if one fails
                console.warn(`Failed to delete holiday ${holiday.id}, continuing...`);
              } else {
                deletedCount++;
              }
            }
          }
          
          // Check if present override marker already exists
          const hasPresentOverride = existingHolidays?.some(h => h.reason === 'MARKED_AS_PRESENT');
          
          // Create or ensure present override marker exists
          if (!hasPresentOverride) {
            const { error: overrideError } = await db.technicianHolidays.create({
              technician_id: technicianId,
              holiday_date: date,
              is_manual: true,
              reason: 'MARKED_AS_PRESENT',
              notes: 'Manually marked as present - prevents auto-detection as absent'
            });
            
            if (overrideError) {
              console.error('Error creating present override:', overrideError);
              toast.error('Failed to create present override marker');
            } else {
              if (deletedCount > 0) {
                toast.success(`Day marked as present (removed ${deletedCount} leave record(s))`);
              } else {
                toast.success('Day marked as present');
              }
              hasChanges = true;
            }
          } else {
            // Present override already exists, just confirm
            if (deletedCount > 0) {
              toast.success(`Day marked as present (removed ${deletedCount} leave record(s))`);
            } else {
              toast.info('Day is already marked as present');
            }
            hasChanges = true;
          }
        }
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Technician Payments</h2>
        <p className="text-sm sm:text-base text-gray-600">
          Manage technician salaries, commissions (10% per job), expenses, and advances
        </p>
        
        {/* Period Selector */}
        <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 items-stretch sm:items-end">
          <div className="flex-1 min-w-0 sm:min-w-[200px]">
            <Label htmlFor="period-select">View Period</Label>
            <Select value={selectedPeriod} onValueChange={(value: any) => setSelectedPeriod(value)}>
              <SelectTrigger id="period-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Cycle</SelectItem>
                <SelectItem value="pastMonth">Past Month</SelectItem>
                <SelectItem value="rangeToCurrent">From Selected Month to This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {(selectedPeriod === 'pastMonth' || selectedPeriod === 'rangeToCurrent') && (
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label htmlFor="month-select">
                {selectedPeriod === 'rangeToCurrent' ? 'From Month' : 'Select Month'}
              </Label>
              <Input
                id="month-select"
                type="month"
                value={selectedPastMonth}
                onChange={(e) => setSelectedPastMonth(e.target.value)}
                className="w-full"
              />
            </div>
          )}
          
          {commissionPeriod && (
            <div className="text-xs sm:text-sm text-gray-500 flex items-center px-2 py-1 sm:px-0 sm:py-0">
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
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
            <Button variant="outline" size="sm" onClick={handleAddBusinessExpense} disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Add business expense
            </Button>
          </div>
        </div>
      </div>

      {/* Technician Salary Breakdowns - load only when user clicks View */}
      <div ref={salarySectionRef} className="space-y-6">
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
        {!loadingSalaryBreakdowns && salaryDataLoaded && salaryBreakdowns.map((breakdown) => (
          <Card key={breakdown.technicianId} className="overflow-hidden">
            <CardHeader className="bg-gray-50 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-lg">{breakdown.technicianName}</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Employee ID: {breakdown.employeeId}</p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                  <div className="flex-1 sm:flex-initial sm:text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      ₹ {formatCurrency(breakdown.totalBillAmount)}
                    </div>
                    <p className="text-xs text-gray-500">Total Billing</p>
                  </div>
                  <div className="flex-1 sm:flex-initial sm:text-right">
                  <div className="text-2xl font-bold text-green-600">
                      ₹ {formatCurrency(breakdown.totalSalary)}
                  </div>
                  <p className="text-xs text-gray-500">Total Salary</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {/* Salary Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
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
                </div>
                <div className="bg-red-50 p-3 sm:p-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Expenses</p>
                  <p className="text-lg sm:text-xl font-semibold text-red-600">₹ {formatCurrency(breakdown.totalExpenses)}</p>
                </div>
                <div className="bg-orange-50 p-3 sm:p-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Advances</p>
                  <p className="text-lg sm:text-xl font-semibold text-orange-600">₹ {formatCurrency(breakdown.totalAdvances)}</p>
                </div>
              </div>

              {/* Calculation */}
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
                          <span className="truncate">Leave Deduction ({breakdown.extraHolidays} absent days):</span>
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
                  <div className="flex justify-between items-center gap-2 text-orange-600">
                    <span className="truncate">- Advances:</span>
                    <span className="font-medium whitespace-nowrap">- ₹ {formatCurrency(breakdown.totalAdvances)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-300 font-bold text-base sm:text-lg">
                    <span className="truncate">Total Salary:</span>
                    <span className="text-green-600 whitespace-nowrap">₹ {formatCurrency(breakdown.totalSalary)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs mt-2 pt-2 border-t border-gray-200">
                    <span>Total Expenses (for analytics only):</span>
                    <span>₹ {formatCurrency(breakdown.totalExpenses)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs pt-1">
                    <span>Leaves: {breakdown.totalHolidays} total ({breakdown.allowedHolidays} allowed, {breakdown.extraHolidays} absent)</span>
                    <span></span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mb-6 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => {
                    if (commissionPeriod) {
                      setSelectedBreakdownForSlip(breakdown);
                      setIncludeDayWiseBreakdown(true); // Default to with breakdown
                      setSalarySlipDialogOpen(true);
                    } else {
                      toast.error('Period information not available');
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Salary Slip
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAddExpense(breakdown.technicianId)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  Add Expense
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAddExtraCommission(breakdown.technicianId)}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Add Extra Commission
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAddAdvance(breakdown.technicianId)}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Add Advance
                </Button>
              </div>

              {/* Expenses Table */}
              {breakdown.expenses.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Expenses</h3>
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
                </div>
              )}

              {/* Advances Table */}
              {breakdown.advances.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Advances</h3>
                  <div className="overflow-x-auto">
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
                </div>
              )}

              {/* Extra Commissions Table */}
              {breakdown.extraCommissions.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Extra Commissions</h3>
                  <div className="overflow-x-auto">
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
                </div>
              )}

              {/* Daily Breakdown - Only show for Current Cycle */}
              {selectedPeriod === 'current' && (
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
                    <div className="mt-4">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Bill Amount</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                              <TableHead className="text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedDays.map((day) => (
                              <TableRow key={day.date}>
                                <TableCell>
                                  {(() => {
                                    // Parse date string (YYYY-MM-DD) correctly to avoid timezone issues
                                    const [year, month, dayNum] = day.date.split('-').map(Number);
                                    const dateObj = new Date(year, month - 1, dayNum);
                                    const getDaySuffix = (day: number) => {
                                      if (day === 1 || day === 21 || day === 31) return 'st';
                                      if (day === 2 || day === 22) return 'nd';
                                      if (day === 3 || day === 23) return 'rd';
                                      return 'th';
                                    };
                                    const weekday = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
                                    const monthName = dateObj.toLocaleDateString('en-IN', { month: 'short' });
                                    const yearNum = dateObj.getFullYear();
                                    return `${weekday}, ${dayNum}${getDaySuffix(dayNum)} ${monthName}, ${yearNum}`;
                                  })()}
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                  {day.billAmount > 0 ? `₹ ${formatCurrency(day.billAmount)}` : '-'}
                                </TableCell>
                                <TableCell className="text-center">
                                  {day.isAbsent ? (
                                    <Badge variant="destructive">Absent</Badge>
                                  ) : day.billAmount > 0 ? (
                                    <Badge variant="default" className="bg-green-600">Worked</Badge>
                                  ) : (
                                    <Badge variant="secondary">No Jobs</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {day.billAmount > 0 && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          setSelectedDateForJobs({
                                            technicianId: breakdown.technicianId,
                                            date: day.date
                                          });
                                          setJobDetailsDialogOpen(true);
                                          await loadJobsForDate(breakdown.technicianId, day.date);
                                        }}
                                        className="h-8 px-2 text-xs"
                                        title="View jobs"
                                      >
                                        <Eye className="w-3 h-3 mr-1" />
                                        Jobs
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingDailyBreakdown({
                                          technicianId: breakdown.technicianId,
                                          date: day.date,
                                          isAbsent: day.isAbsent
                                        });
                                        setDailyBreakdownFormData({
                                          isAbsent: day.isAbsent
                                        });
                                        setDailyBreakdownEditDialogOpen(true);
                                      }}
                                      className="h-8 w-8 p-0"
                                      title="Edit day"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 px-2">
                          <div className="text-sm text-gray-600">
                            Showing {startIndex + 1} to {Math.min(endIndex, totalDays)} of {totalDays} days
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDailyBreakdownPage(prev => ({
                                  ...prev,
                                  [breakdown.technicianId]: Math.max(1, currentPage - 1)
                                }));
                              }}
                              disabled={currentPage === 1}
                              className="h-8"
                            >
                              <ChevronLeft className="w-4 h-4 mr-1" />
                              Previous
                            </Button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                  pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i;
                                } else {
                                  pageNum = currentPage - 2 + i;
                                }
                                return (
                                  <Button
                                    key={pageNum}
                                    size="sm"
                                    variant={currentPage === pageNum ? "default" : "outline"}
                                    onClick={() => {
                                      setDailyBreakdownPage(prev => ({
                                        ...prev,
                                        [breakdown.technicianId]: pageNum
                                      }));
                                    }}
                                    className="h-8 w-8 p-0"
                                  >
                                    {pageNum}
                                  </Button>
                                );
                              })}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDailyBreakdownPage(prev => ({
                                  ...prev,
                                  [breakdown.technicianId]: Math.min(totalPages, currentPage + 1)
                                }));
                              }}
                              disabled={currentPage === totalPages}
                              className="h-8"
                            >
                              Next
                              <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                </div>
              )}

              {/* Summary - Show final salary paid on 10th */}
              {(selectedPeriod === 'pastMonth' || selectedPeriod === 'rangeToCurrent') && (
                <div className="mb-6 p-4 bg-green-50 rounded-lg border-2 border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Final Salary Paid on 10th</p>
                      <p className="text-xs text-gray-500 mt-1">
                        After all deductions (leaves, advances, expenses)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-700">
                        ₹ {formatCurrency(breakdown.totalSalary)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Paid on {(() => {
                          const endDate = commissionPeriod?.end || new Date();
                          const paymentDate = new Date(endDate);
                          paymentDate.setMonth(paymentDate.getMonth() + 1);
                          paymentDate.setDate(10);
                          return paymentDate.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          });
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              )}


            </CardContent>
          </Card>
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
                value={dailyBreakdownFormData.isAbsent ? 'absent' : 'present'}
                onValueChange={(value) => setDailyBreakdownFormData({ ...dailyBreakdownFormData, isAbsent: value === 'absent' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present / Worked</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {dailyBreakdownFormData.isAbsent 
                  ? 'Marking as absent will add a leave record' 
                  : 'Marking as present will remove leave records for this day'}
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
            <DialogTitle>Download Salary Slip</DialogTitle>
            <DialogDescription>
              Choose the type of salary slip you want to download
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
                  generateSalarySlipPDF(selectedBreakdownForSlip, commissionPeriod, 'pdf', includeDayWiseBreakdown);
                  setSalarySlipDialogOpen(false);
                  setSelectedBreakdownForSlip(null);
                } else {
                  toast.error('Period information not available');
                }
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Business Expenses Section - load only when user clicks View */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                Business Expenses
              </CardTitle>
              <CardDescription>
                Track general business expenses (not tied to specific technicians)
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFFICE">Office</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="UTILITIES">Utilities</SelectItem>
                  <SelectItem value="RENT">Rent</SelectItem>
                  <SelectItem value="SPARE_PARTS">Spare Parts</SelectItem>
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

      {/* Other Expenses Section - same style as Business Expenses, load only when user clicks View */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                Other Expenses
              </CardTitle>
              <CardDescription>
                Track other / miscellaneous expenses (separate from business expenses)
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
              <p className="text-gray-600 font-medium">Other expenses not loaded</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">You can add expenses above without loading the list.</p>
              <Button onClick={handleViewOtherExpenses} disabled={loadingOtherExpenses}>
                <Eye className="w-4 h-4 mr-2" />
                {loadingOtherExpenses ? 'Loading...' : 'View other expenses'}
              </Button>
            </div>
          ) : loadingOtherExpenses ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">Loading other expenses...</span>
            </div>
          ) : otherExpenses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <TrendingDown className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No other expenses recorded yet.</p>
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
                  <span className="font-semibold text-gray-700">Total Other Expenses:</span>
                  <span className="text-xl font-bold text-red-600">
                    ₹ {formatCurrency(otherExpenses.reduce((sum, e) => sum + e.amount, 0))}
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Other Expense Dialog */}
      <Dialog open={otherExpenseDialogOpen} onOpenChange={setOtherExpenseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingOtherExpense ? 'Edit Other Expense' : 'Add Other Expense'}
            </DialogTitle>
            <DialogDescription>
              Record an other / miscellaneous expense
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
                  <SelectItem value="PERSONAL">Personal</SelectItem>
                  <SelectItem value="TRAVEL">Travel</SelectItem>
                  <SelectItem value="SUPPLIES">Supplies</SelectItem>
                  <SelectItem value="MISC">Miscellaneous</SelectItem>
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

