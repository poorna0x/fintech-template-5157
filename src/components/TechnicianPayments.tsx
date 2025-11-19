import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { DollarSign, User, Plus, Trash2, Edit, TrendingDown, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Pencil, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
  adjustedBaseSalary: number; // After holiday deductions
  totalCommission: number;
  totalExtraCommission: number;
  totalExpenses: number;
  totalAdvances: number;
  totalHolidays: number;
  allowedHolidays: number;
  extraHolidays: number;
  holidayDeduction: number;
  totalSalary: number; // adjustedBaseSalary + commission + extraCommission - advances
  payments: TechnicianPayment[];
  expenses: TechnicianExpense[];
  advances: TechnicianAdvance[];
  extraCommissions: TechnicianExtraCommission[];
  holidays: TechnicianHoliday[];
  dailyBreakdown: DailyBreakdown[]; // Daily billing breakdown
}

const TechnicianPayments = () => {
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [salaryBreakdowns, setSalaryBreakdowns] = useState<TechnicianSalaryBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTechnician, setSelectedTechnician] = useState<string | null>(null);
  const [commissionPeriod, setCommissionPeriod] = useState<{ start: Date; end: Date } | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'current' | 'pastMonth'>('current');
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
    billAmount: number;
    isAbsent: boolean;
  } | null>(null);
  const [dailyBreakdownFormData, setDailyBreakdownFormData] = useState({
    billAmount: '',
    isAbsent: false
  });

  useEffect(() => {
    loadData();
  }, [selectedPeriod, selectedPastMonth]);

  const getMonthlyDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate: Date;
    let endDate: Date;
    
    if (selectedPeriod === 'pastMonth') {
      // Past month: 10th of selected month to 10th of next month (salary day)
      const [year, month] = selectedPastMonth.split('-').map(Number);
      const selectedMonthIndex = month - 1; // JavaScript months are 0-indexed
      
      // Start: 10th of selected month
      startDate = new Date(year, selectedMonthIndex, 10, 0, 0, 0, 0);
      
      // End: 10th of next month (salary day when payment was made)
      endDate = new Date(year, selectedMonthIndex + 1, 10, 23, 59, 59, 999);
    } else {
      // Current period: 10th of this month to 10th of next month
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      
      // Start: 10th of current month
      startDate = new Date(currentYear, currentMonth, 10, 0, 0, 0, 0);
      
      // End: 10th of next month
      endDate = new Date(currentYear, currentMonth + 1, 10, 23, 59, 59, 999);
    }
    
    return { startDate, endDate };
  };

  const loadData = async (showLoading: boolean = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      
      // Load technicians
      const { data: techsData, error: techsError } = await db.technicians.getAll();
      if (techsError) throw techsError;
      setTechnicians(techsData || []);

      // Get monthly date range based on selected period
      const { startDate, endDate } = getMonthlyDateRange();

      // For current period only, adjust start date to first record if earlier
      let actualStartDate = startDate;
      if (selectedPeriod === 'current') {
        const { data: allPaymentsData, error: allPaymentsError } = await supabase
          .from('technician_payments')
          .select('created_at')
          .order('created_at', { ascending: true })
          .limit(1);
        
        if (allPaymentsError) throw allPaymentsError;

        if (allPaymentsData && allPaymentsData.length > 0) {
          const firstRecordDate = new Date(allPaymentsData[0].created_at);
          firstRecordDate.setHours(0, 0, 0, 0);
          if (firstRecordDate < startDate) {
            actualStartDate = firstRecordDate;
          }
        }
      }
      
      // Store commission period for display
      setCommissionPeriod({ start: actualStartDate, end: endDate });

      // Load payments for selected period
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('technician_payments')
        .select(`
          *,
          technician:technicians(
            id,
            full_name,
            employee_id
          ),
          job:jobs(
            id,
            job_number
          )
        `)
        .gte('created_at', actualStartDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (paymentsError) throw paymentsError;

      // Load expenses, advances, and extra commissions for all technicians
      const { data: expensesData, error: expensesError } = await db.technicianExpenses.getAll();
      if (expensesError) throw expensesError;

      const { data: advancesData, error: advancesError } = await db.technicianAdvances.getAll();
      if (advancesError) throw advancesError;

      const { data: extraCommissionsData, error: extraCommissionsError } = await db.technicianExtraCommissions.getAll();
      if (extraCommissionsError) throw extraCommissionsError;

      // Load holidays for all technicians in the period
      const { data: holidaysData, error: holidaysError } = await db.technicianHolidays.getAll(
        undefined,
        actualStartDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      if (holidaysError) throw holidaysError;

      // Load completed jobs to detect holidays (days with no jobs) and calculate daily billing
      const { data: completedJobsData, error: completedJobsError } = await supabase
        .from('jobs')
        .select('id, assigned_technician_id, end_time, completed_at, actual_cost, payment_amount')
        .eq('status', 'COMPLETED')
        .not('end_time', 'is', null)
        .gte('end_time', actualStartDate.toISOString())
        .lte('end_time', endDate.toISOString());
      
      if (completedJobsError) throw completedJobsError;

      // Calculate number of months in the selected period
      // Current period is always 1 month (10th to 10th)
      const monthsInPeriod = selectedPeriod === 'year' ? 12 : 
                            selectedPeriod === 'quarter' ? 3 : 
                            selectedPeriod === 'lastMonth' || selectedPeriod === 'custom' || selectedPeriod === 'current' ? 1 : 
                            (endDate.getTime() - actualStartDate.getTime()) / (1000 * 60 * 60 * 24 * 30); // Approximate for other periods

      // Log all technicians' basic salaries from their profiles
      console.log('📊 All Technicians Basic Salaries from Profile:');
      (techsData || []).forEach((tech: any) => {
        const salaryData = tech.salary;
        const baseSalary = (salaryData && typeof salaryData === 'object' && (salaryData as any).baseSalary) 
          ? (salaryData as any).baseSalary 
          : 'NOT SET (using default 8000)';
        console.log(`  👤 ${tech.full_name} (${tech.employee_id}): Base Salary = INR ${baseSalary}`, {
          salaryField: salaryData,
          baseSalaryValue: (salaryData as any)?.baseSalary,
          salaryType: typeof salaryData
        });
      });
      console.log('---');

      // Calculate breakdown for each technician
      const breakdowns: TechnicianSalaryBreakdown[] = (techsData || []).map((tech: any) => {
        const techId = tech.id;
        // Get base salary from technician profile - salary is stored as JSONB
        // Access salary.baseSalary directly from technician profile
        const monthlyBaseSalary = (tech.salary && typeof tech.salary === 'object' && (tech.salary as any).baseSalary) 
          ? (tech.salary as any).baseSalary 
          : 8000; // Default 8000 if not found
        
        const periodBaseSalary = monthlyBaseSalary * Math.ceil(monthsInPeriod); // Total base salary for the period
        console.log(`💰 ${tech.full_name}: Monthly=${monthlyBaseSalary}, Months=${Math.ceil(monthsInPeriod)}, Period=${periodBaseSalary}`);
        const dailyBaseSalary = monthlyBaseSalary / 30; // 266.67 per day
        const expectedWorkingDays = 26;
        const allowedHolidays = 4;

        // Get payments for this technician (only from current month cycle)
        const techPayments = (paymentsData || []).filter((p: TechnicianPayment) => p.technician_id === techId);
        
        // Calculate commission: 10% of total bill amount from completed jobs
        // Commission should be calculated from completed jobs' bill amounts, not from technician_payments table
        const techCompletedJobsForCommission = (completedJobsData || []).filter((j: any) => j.assigned_technician_id === techId);
        const totalBillAmount = techCompletedJobsForCommission.reduce((sum: number, job: any) => {
          const billAmount = parseFloat(job.actual_cost || job.payment_amount || 0);
          return sum + billAmount;
        }, 0);
        const commissionPercentage = 10; // 10% commission
        const totalCommission = totalBillAmount * (commissionPercentage / 100);
        
        console.log(`💰 ${tech.full_name}: Total Bill = ${totalBillAmount}, Commission (10%) = ${totalCommission}`);
        
        // Get expenses for this technician
        const techExpenses = (expensesData || []).filter((e: TechnicianExpense) => e.technician_id === techId);
        const totalExpenses = techExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        
        // Get advances for this technician
        const techAdvances = (advancesData || []).filter((a: TechnicianAdvance) => a.technician_id === techId);
        const totalAdvances = techAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);
        
        // Get extra commissions for this technician
        const techExtraCommissions = (extraCommissionsData || []).filter((ec: TechnicianExtraCommission) => ec.technician_id === techId);
        const totalExtraCommission = techExtraCommissions.reduce((sum, ec) => sum + (ec.amount || 0), 0);

        // Get holidays for this technician
        const techHolidays = (holidaysData || []).filter((h: TechnicianHoliday) => h.technician_id === techId);
        
        // Detect holidays: days with no completed jobs
        const techCompletedJobs = (completedJobsData || []).filter((j: any) => j.assigned_technician_id === techId);
        const workingDays = new Set<string>();
        techCompletedJobs.forEach((job: any) => {
          // Use end_time if available, otherwise completed_at
          const completionDate = job.end_time || job.completed_at;
          if (completionDate) {
            const jobDate = new Date(completionDate).toISOString().split('T')[0];
            workingDays.add(jobDate);
          }
        });

        // Generate all dates in the period
        const allDates: string[] = [];
        const currentDate = new Date(actualStartDate);
        while (currentDate <= endDate) {
          allDates.push(currentDate.toISOString().split('T')[0]);
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Get today's date for filtering (only count holidays up to today, not future dates)
        const todayForHolidays = new Date();
        todayForHolidays.setHours(0, 0, 0, 0);
        const todayStrForHolidays = todayForHolidays.toISOString().split('T')[0];

        // Find holidays: dates with no jobs completed (ONLY up to today, not future dates)
        // BUT exclude dates that have been manually marked as present (have a "present" override)
        const autoDetectedHolidays: string[] = [];
        allDates.forEach(date => {
          // Only count holidays for dates up to today (not future dates)
          if (date <= todayStrForHolidays && !workingDays.has(date)) {
            // Check if holiday already exists in database
            const existingHoliday = techHolidays.find(h => h.holiday_date.split('T')[0] === date);
            // Only auto-detect as absent if:
            // 1. No manual holiday exists
            // 2. No jobs were completed on that day
            // Note: If user manually marks as present (removes holiday), we won't auto-detect it
            if (!existingHoliday) {
              autoDetectedHolidays.push(date);
            }
          }
        });

        // Combine manual and auto-detected holidays
        // IMPORTANT: Only count holidays up to today, filter out future dates
        const allHolidayDates = new Set<string>();
        techHolidays.forEach(h => {
          const holidayDate = h.holiday_date.split('T')[0];
          // Only include holidays up to today
          if (holidayDate <= todayStrForHolidays) {
            allHolidayDates.add(holidayDate);
          }
        });
        autoDetectedHolidays.forEach(date => allHolidayDates.add(date));
        
        // Group holidays by month and calculate deductions per month
        const holidaysByMonth = new Map<string, string[]>(); // month key -> array of holiday dates
        Array.from(allHolidayDates).forEach(date => {
          const dateObj = new Date(date);
          const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          if (!holidaysByMonth.has(monthKey)) {
            holidaysByMonth.set(monthKey, []);
          }
          holidaysByMonth.get(monthKey)!.push(date);
        });

        // Calculate total deduction across all months
        // IMPORTANT: First 4 holidays per month are FREE (no deduction)
        // Only holidays beyond 4 per month reduce base salary
        let totalHolidayDeduction = 0;
        let totalExtraHolidays = 0;
        holidaysByMonth.forEach((holidays, monthKey) => {
          const monthHolidays = holidays.length;
          // Calculate extra holidays beyond the allowed 4 per month
          // If monthHolidays <= 4, extraMonthHolidays = 0 (no deduction)
          // If monthHolidays > 4, only the extra ones are deducted
          const extraMonthHolidays = Math.max(0, monthHolidays - allowedHolidays);
          totalExtraHolidays += extraMonthHolidays;
          // Only deduct for extra holidays beyond 4 per month
          totalHolidayDeduction += extraMonthHolidays * dailyBaseSalary;
        });

        const totalHolidays = allHolidayDates.size;
        const extraHolidays = totalExtraHolidays;
        const holidayDeduction = totalHolidayDeduction;
        const adjustedBaseSalary = periodBaseSalary - holidayDeduction;

        // Create holiday records for display (include auto-detected ones)
        const displayHolidays: TechnicianHoliday[] = [...techHolidays];
        autoDetectedHolidays.forEach(date => {
          displayHolidays.push({
            id: `auto-${date}`,
            technician_id: techId,
            holiday_date: date,
            is_manual: false,
            reason: 'No jobs completed'
          });
        });
        displayHolidays.sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime());

        // Get only absent days (extra holidays beyond 4 per month) for display
        const absentDays: TechnicianHoliday[] = [];
        holidaysByMonth.forEach((holidays, monthKey) => {
          const monthHolidays = holidays.length;
          const extraMonthHolidays = Math.max(0, monthHolidays - allowedHolidays);
          if (extraMonthHolidays > 0) {
            // Sort holidays in this month by date descending and take the extra ones
            const sortedMonthHolidays = holidays
              .map(date => displayHolidays.find(h => h.holiday_date.split('T')[0] === date))
              .filter((h): h is TechnicianHoliday => h !== undefined)
              .sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime())
              .slice(0, extraMonthHolidays);
            absentDays.push(...sortedMonthHolidays);
          }
        });
        absentDays.sort((a, b) => new Date(b.holiday_date).getTime() - new Date(a.holiday_date).getTime());
        
        // Calculate daily breakdown: billing per day
        const dailyBilling = new Map<string, number>(); // date -> total bill amount
        techCompletedJobs.forEach((job: any) => {
          const completionDate = job.end_time || job.completed_at;
          if (completionDate) {
            const jobDate = new Date(completionDate).toISOString().split('T')[0];
            const billAmount = parseFloat(job.actual_cost || job.payment_amount || 0);
            dailyBilling.set(jobDate, (dailyBilling.get(jobDate) || 0) + billAmount);
          }
        });

        // Create daily breakdown array - only show dates up to today (not future dates)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];
        
        const dailyBreakdown: DailyBreakdown[] = allDates
          .filter(date => date <= todayStr) // Only show dates up to today (exclude future dates)
          .map(date => {
            const billAmount = dailyBilling.get(date) || 0;
            // Mark as absent if:
            // 1. It's in the holiday dates (manual or auto-detected)
            // 2. AND there are no jobs completed on that day (billAmount === 0)
            // 3. AND the date is today or in the past (not future)
            // If there are jobs (billAmount > 0), don't mark as absent even if it's in holiday dates
            const hasJobs = billAmount > 0;
            const isAbsent = !hasJobs && allHolidayDates.has(date) && date <= todayStr;
            return {
              date,
              billAmount,
              isAbsent
            };
          })
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        // Calculate total salary: adjustedBaseSalary + commission + extraCommission - advances
        const totalSalary = adjustedBaseSalary + totalCommission + totalExtraCommission - totalAdvances;
        
        return {
          technicianId: techId,
          technicianName: tech.full_name || 'Unknown',
          employeeId: tech.employee_id || '',
          baseSalary: monthlyBaseSalary, // Monthly base salary
          periodBaseSalary: periodBaseSalary, // Period base salary
          adjustedBaseSalary,
          totalCommission,
          totalExtraCommission,
          totalExpenses,
          totalAdvances,
          totalHolidays,
          allowedHolidays,
          extraHolidays,
          holidayDeduction,
          totalSalary,
          payments: techPayments,
          expenses: techExpenses,
          advances: techAdvances,
          extraCommissions: techExtraCommissions,
          holidays: absentDays, // Show only absent days (extra holidays beyond 4 per month)
          dailyBreakdown
        };
      });

      setSalaryBreakdowns(breakdowns);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = () => {
    if (!selectedTechnician) {
      toast.error('Please select a technician');
      return;
    }
    setExpenseFormData({
      technician_id: selectedTechnician,
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
      await loadData();
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
      await loadData();
    } catch (error: any) {
      toast.error('Failed to delete expense: ' + error.message);
    }
  };

  const handleAddAdvance = () => {
    if (!selectedTechnician) {
      toast.error('Please select a technician');
      return;
    }
    setAdvanceFormData({
      technician_id: selectedTechnician,
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
      await loadData();
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
      await loadData();
    } catch (error: any) {
      toast.error('Failed to delete advance: ' + error.message);
    }
  };

  const handleAddExtraCommission = () => {
    if (!selectedTechnician) {
      toast.error('Please select a technician');
      return;
    }
    setExtraCommissionFormData({
      technician_id: selectedTechnician,
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
        const { error } = await db.technicianExtraCommissions.create(commissionData);
        if (error) throw error;
        toast.success('Extra commission added');
      }

      setExtraCommissionDialogOpen(false);
      await loadData();
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
      await loadData();
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
      await loadData();
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
      await loadData();
    } catch (error: any) {
      toast.error('Failed to delete leave: ' + error.message);
    }
  };

  const handleSaveDailyBreakdown = async () => {
    if (!editingDailyBreakdown) return;

    try {
      const technicianId = editingDailyBreakdown.technicianId;
      const date = editingDailyBreakdown.date;
      const newBillAmount = parseFloat(dailyBreakdownFormData.billAmount) || 0;
      const newIsAbsent = dailyBreakdownFormData.isAbsent;
      const oldIsAbsent = editingDailyBreakdown.isAbsent;
      let hasChanges = false;

      // Update bill amount if changed
      if (newBillAmount !== editingDailyBreakdown.billAmount) {
        // Find jobs completed on this date for this technician
        // Use date range query for end_time (TIMESTAMP field)
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: jobsOnDate, error: jobsError } = await supabase
          .from('jobs')
          .select('id, actual_cost, payment_amount')
          .eq('assigned_technician_id', technicianId)
          .eq('status', 'COMPLETED')
          .not('end_time', 'is', null)
          .gte('end_time', startOfDay.toISOString())
          .lte('end_time', endOfDay.toISOString());

        if (jobsError) {
          console.error('Error fetching jobs:', jobsError);
          throw jobsError;
        }

        if (jobsOnDate && jobsOnDate.length > 0) {
          // If multiple jobs exist, update the total bill amount across all jobs
          // The newBillAmount should be the TOTAL for all jobs on that date
          // So we'll update each job proportionally OR update the first job with the total
          // Actually, better approach: Update the first job with the total amount, set others to 0
          // OR: Distribute evenly, OR: Update first job only
          // For simplicity, let's update the first job with the total amount
          
          if (jobsOnDate.length === 1) {
            // Single job - update it with the exact amount
            const { error: updateError } = await supabase
              .from('jobs')
              .update({
                actual_cost: newBillAmount,
                payment_amount: newBillAmount
              })
              .eq('id', jobsOnDate[0].id);

            if (updateError) {
              console.error('Error updating job:', updateError);
              throw updateError;
            }
            toast.success(`Updated bill amount to ₹${newBillAmount.toFixed(2)} for ${new Date(date).toLocaleDateString()}`);
          } else {
            // Multiple jobs - update first job with total, set others to 0
            // Or distribute evenly? Let's update first job with total
            const { error: updateFirstError } = await supabase
              .from('jobs')
              .update({
                actual_cost: newBillAmount,
                payment_amount: newBillAmount
              })
              .eq('id', jobsOnDate[0].id);

            if (updateFirstError) {
              console.error('Error updating first job:', updateFirstError);
              throw updateFirstError;
            }

            // Set other jobs to 0
            for (let i = 1; i < jobsOnDate.length; i++) {
              const { error: updateError } = await supabase
                .from('jobs')
                .update({
                  actual_cost: 0,
                  payment_amount: 0
                })
                .eq('id', jobsOnDate[i].id);

              if (updateError) {
                console.error('Error updating job:', updateError);
                // Don't throw, just log - continue with other jobs
                console.warn(`Failed to update job ${jobsOnDate[i].id}`);
              }
            }
            toast.success(`Updated total bill amount to ₹${newBillAmount.toFixed(2)} for ${new Date(date).toLocaleDateString()} (${jobsOnDate.length} job(s))`);
          }
          hasChanges = true;
        } else if (newBillAmount > 0) {
          toast.warning('No completed jobs found for this date. Bill amount cannot be updated without a job.');
        } else {
          // If setting to 0 and no jobs, that's fine
          hasChanges = true;
        }
      }

      // Update present/absent status
      if (newIsAbsent !== oldIsAbsent) {
        // Check if holiday already exists - holiday_date is DATE field, so query by date string
        const { data: existingHolidays, error: holidayCheckError } = await supabase
          .from('technician_holidays')
          .select('id, is_manual')
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
          // Mark as absent - add holiday if not exists
          if (!existingHolidays || existingHolidays.length === 0) {
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
            toast.success('Day marked as absent');
            hasChanges = true;
          } else {
            // Holiday already exists, just confirm
            toast.info('Day is already marked as absent');
            hasChanges = true; // Still reload to refresh
          }
        } else {
          // Mark as present - remove ALL holidays (both manual and auto-detected)
          // We'll delete all holidays for this date to mark as present
          if (existingHolidays && existingHolidays.length > 0) {
            let deletedCount = 0;
            for (const holiday of existingHolidays) {
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
            if (deletedCount > 0) {
              toast.success(`Day marked as present (removed ${deletedCount} leave record(s))`);
              hasChanges = true;
            } else {
              toast.error('Failed to remove leave records');
            }
          } else {
            // No holidays exist in database, but day might be auto-detected as absent
            // To mark as present, we need to create a "present override" by creating a job
            // OR we can create a special marker. For now, let's check if there are jobs.
            // If no jobs exist and it's marked absent, we'll create a placeholder job with 0 amount
            // Actually, a better approach: create a manual "present" record with a special reason
            
            // Check if there are any jobs on this date
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            const { data: jobsOnDate } = await supabase
              .from('jobs')
              .select('id')
              .eq('assigned_technician_id', technicianId)
              .eq('status', 'COMPLETED')
              .not('end_time', 'is', null)
              .gte('end_time', startOfDay.toISOString())
              .lte('end_time', endOfDay.toISOString());

            // If no jobs exist and day is showing as absent (auto-detected), 
            // we need to prevent auto-detection by creating a "present override"
            // We'll create a manual holiday record with a special reason that indicates "present override"
            // But wait - that would add it back as absent. Instead, we need a different approach.
            
            // Actually, the issue is that auto-detection happens based on no jobs.
            // To truly mark as present when no jobs exist, we'd need to either:
            // 1. Create a job (even with 0 amount) - but that's complex
            // 2. Track "present overrides" separately - but that requires schema changes
            
            // For now, the best we can do is: if there are no jobs and no holidays,
            // the day will be auto-detected as absent. To mark as present, user needs to add a job.
            // But we can at least remove any manual holidays that exist.
            
            if (!jobsOnDate || jobsOnDate.length === 0) {
              // Day is auto-detected as absent because no jobs exist
              // To mark as present, we need to create a placeholder job with 0 amount
              // This prevents auto-detection as absent
              
              // Get technician info to create a placeholder job
              const tech = technicians.find(t => t.id === technicianId);
              if (!tech) {
                toast.error('Technician not found');
                return;
              }

              // Create a placeholder job with 0 amount to mark day as present
              // We'll use a dummy customer or the first available customer
              const { data: firstCustomer } = await supabase
                .from('customers')
                .select('id')
                .limit(1)
                .single();

              if (!firstCustomer) {
                toast.error('Cannot create placeholder job: No customers found in system');
                return;
              }

              // Create placeholder job
              const placeholderJob = {
                job_number: `PLACEHOLDER-${date}-${technicianId.substring(0, 8)}`,
                customer_id: firstCustomer.id,
                service_type: 'RO' as const,
                service_sub_type: 'Present Override',
                brand: 'N/A',
                model: 'N/A',
                scheduled_date: date,
                scheduled_time_slot: 'MORNING' as const,
                estimated_duration: 0,
                service_address: {},
                service_location: {},
                status: 'COMPLETED' as const,
                priority: 'LOW' as const,
                description: 'Placeholder job to mark day as present',
                requirements: [],
                estimated_cost: 0,
                actual_cost: 0,
                payment_amount: 0,
                assigned_technician_id: technicianId,
                start_time: `${date}T09:00:00`,
                end_time: `${date}T09:00:00`,
                payment_status: 'PAID' as const
              };

              const { error: jobError } = await supabase
                .from('jobs')
                .insert(placeholderJob);

              if (jobError) {
                console.error('Error creating placeholder job:', jobError);
                toast.error('Failed to mark day as present: ' + jobError.message);
              } else {
                toast.success('Day marked as present (created placeholder job)');
                hasChanges = true;
              }
            } else {
              // Jobs exist, so day should show as present after removing holidays
              toast.success('Day marked as present');
              hasChanges = true;
            }
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
          // Reload without showing loading spinner
          const { startDate, endDate } = getMonthlyDateRange();
          let actualStartDate = startDate;
          if (selectedPeriod === 'current') {
            const { data: allPaymentsData } = await supabase
              .from('technician_payments')
              .select('created_at')
              .order('created_at', { ascending: true })
              .limit(1);
            
            if (allPaymentsData && allPaymentsData.length > 0) {
              const firstRecordDate = new Date(allPaymentsData[0].created_at);
              firstRecordDate.setHours(0, 0, 0, 0);
              if (firstRecordDate < startDate) {
                actualStartDate = firstRecordDate;
              }
            }
          }

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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Technician Payments</h2>
        <p className="text-gray-600">
          Manage technician salaries, commissions (10% per job), expenses, and advances
        </p>
        
        {/* Period Selector */}
        <div className="mt-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="period-select">View Period</Label>
            <Select value={selectedPeriod} onValueChange={(value: any) => setSelectedPeriod(value)}>
              <SelectTrigger id="period-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Cycle</SelectItem>
                <SelectItem value="pastMonth">Past Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {selectedPeriod === 'pastMonth' && (
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="month-select">Select Month</Label>
              <Input
                id="month-select"
                type="month"
                value={selectedPastMonth}
                onChange={(e) => setSelectedPastMonth(e.target.value)}
              />
            </div>
          )}
          
          {commissionPeriod && (
            <div className="text-sm text-gray-500 flex items-center">
              Period: {commissionPeriod.start.toLocaleDateString()} to {commissionPeriod.end.toLocaleDateString()} (Salary Day: 10th)
            </div>
          )}
        </div>
      </div>

      {/* Technician Salary Breakdowns */}
      <div className="space-y-6">
        {salaryBreakdowns.map((breakdown) => (
          <Card key={breakdown.technicianId} className="overflow-hidden">
            <CardHeader className="bg-gray-50 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{breakdown.technicianName}</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Employee ID: {breakdown.employeeId}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600">
                    INR {breakdown.totalSalary.toFixed(2)}
                  </div>
                  <p className="text-xs text-gray-500">Total Salary</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {/* Salary Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Base Salary (Monthly)</p>
                  <p className="text-xl font-semibold text-blue-600">INR {breakdown.baseSalary.toFixed(2)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Period: INR {breakdown.periodBaseSalary.toFixed(2)}
                  </p>
                  {breakdown.holidayDeduction > 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      Adjusted: INR {breakdown.adjustedBaseSalary.toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Commission (10%)</p>
                  <p className="text-xl font-semibold text-green-600">INR {breakdown.totalCommission.toFixed(2)}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Extra Commission</p>
                  <p className="text-xl font-semibold text-purple-600">INR {breakdown.totalExtraCommission.toFixed(2)}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Expenses</p>
                  <p className="text-xl font-semibold text-red-600">INR {breakdown.totalExpenses.toFixed(2)}</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Advances</p>
                  <p className="text-xl font-semibold text-orange-600">INR {breakdown.totalAdvances.toFixed(2)}</p>
                </div>
              </div>

              {/* Calculation */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-2">Salary Calculation:</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Base Salary (Monthly):</span>
                    <span className="font-medium">INR {breakdown.baseSalary.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>Base Salary (Period):</span>
                    <span>INR {breakdown.periodBaseSalary.toFixed(2)}</span>
                  </div>
                  {breakdown.holidayDeduction > 0 && (
                    <>
                      <div className="flex justify-between text-red-600">
                        <span>Leave Deduction ({breakdown.extraHolidays} absent days):</span>
                        <span className="font-medium">- INR {breakdown.holidayDeduction.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Adjusted Base Salary:</span>
                        <span className="font-medium">INR {breakdown.adjustedBaseSalary.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-green-600">
                    <span>+ Commission (10%):</span>
                    <span className="font-medium">+ INR {breakdown.totalCommission.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-purple-600">
                    <span>+ Extra Commission:</span>
                    <span className="font-medium">+ INR {breakdown.totalExtraCommission.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-orange-600">
                    <span>- Advances:</span>
                    <span className="font-medium">- INR {breakdown.totalAdvances.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300 font-bold text-lg">
                    <span>Total Salary:</span>
                    <span className="text-green-600">INR {breakdown.totalSalary.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs mt-2 pt-2 border-t border-gray-200">
                    <span>Total Expenses (for analytics only):</span>
                    <span>INR {breakdown.totalExpenses.toFixed(2)}</span>
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
                    setSelectedTechnician(breakdown.technicianId);
                    handleAddExpense();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  Add Expense
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedTechnician(breakdown.technicianId);
                    handleAddExtraCommission();
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Add Extra Commission
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedTechnician(breakdown.technicianId);
                    handleAddAdvance();
                  }}
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
                            <TableCell>{expense.description}</TableCell>
                            <TableCell>{expense.category || 'OTHER'}</TableCell>
                            <TableCell className="text-right font-semibold text-red-600">
                              INR {expense.amount.toFixed(2)}
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
                              INR {advance.amount.toFixed(2)}
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
                              INR {commission.amount.toFixed(2)}
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
                                  {new Date(day.date).toLocaleDateString('en-IN', {
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                  {day.billAmount > 0 ? `₹${day.billAmount.toFixed(2)}` : '-'}
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
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingDailyBreakdown({
                                        technicianId: breakdown.technicianId,
                                        date: day.date,
                                        billAmount: day.billAmount,
                                        isAbsent: day.isAbsent
                                      });
                                      setDailyBreakdownFormData({
                                        billAmount: day.billAmount > 0 ? day.billAmount.toString() : '',
                                        isAbsent: day.isAbsent
                                      });
                                      setDailyBreakdownEditDialogOpen(true);
                                    }}
                                    className="h-8 w-8 p-0"
                                    title="Edit day"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
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

              {/* Past Month Summary - Show final salary paid on 10th */}
              {selectedPeriod === 'pastMonth' && (
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
                        ₹{breakdown.totalSalary.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(commissionPeriod?.end || new Date()).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
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
              <Input
                id="holiday-date"
                type="date"
                value={holidayFormData.holiday_date}
                onChange={(e) => setHolidayFormData({ ...holidayFormData, holiday_date: e.target.value })}
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
              {editingDailyBreakdown && (
                <>Edit bill amount and status for {new Date(editingDailyBreakdown.date).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="daily-bill-amount">Bill Amount (INR)</Label>
              <Input
                id="daily-bill-amount"
                type="number"
                min="0"
                step="0.01"
                value={dailyBreakdownFormData.billAmount}
                onChange={(e) => setDailyBreakdownFormData({ ...dailyBreakdownFormData, billAmount: e.target.value })}
                placeholder="Enter bill amount"
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty or 0 if no jobs</p>
            </div>
            <div>
              <Label htmlFor="daily-is-absent">Status</Label>
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
              <Input
                id="extra-commission-date"
                type="date"
                value={extraCommissionFormData.commission_date}
                onChange={(e) => setExtraCommissionFormData({ ...extraCommissionFormData, commission_date: e.target.value })}
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
              <Label htmlFor="expense-amount">Amount (INR) *</Label>
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
              <Input
                id="expense-date"
                type="date"
                value={expenseFormData.expense_date}
                onChange={(e) => setExpenseFormData({ ...expenseFormData, expense_date: e.target.value })}
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
              <Label htmlFor="advance-amount">Amount (INR) *</Label>
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
              <Input
                id="advance-date"
                type="date"
                value={advanceFormData.advance_date}
                onChange={(e) => setAdvanceFormData({ ...advanceFormData, advance_date: e.target.value })}
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
    </div>
  );
};

export default TechnicianPayments;

