import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db, supabase } from '@/lib/supabase';
import { getTotalSalaryForCalendarMonth } from '@/lib/technicianSalaryForPeriod';
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
  Settings
} from 'lucide-react';

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
  totalSparePartsCost?: number; // Cost of parts used on jobs (from job_parts_used × inventory price)
  totalSalaryDeductions?: number; // From technician payments (base salary deductions)
  totalSalaryIncludingAll?: number; // Same but including excluded technician(s), for display in brackets
  totalExpenses?: number; // Sum of all expenses
  totalProfit?: number; // Revenue - Lead Costs - Expenses
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
}

type PeriodOption = '7d' | '30d' | 'thisWeek' | 'thisMonth' | 'previousMonth' | 'customMonth' | '3m' | '6m' | '1y' | 'all' | 'custom';

// Helper function to format currency with commas and without .00 when it's zero
const formatCurrency = (amount: number): string => {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
};

const Analytics = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodOption>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [customMonthValue, setCustomMonthValue] = useState<string>(''); // YYYY-MM for Custom month

  useEffect(() => {
    loadAnalytics();
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
      case 'thisWeek':
        // Start of this week (Monday)
        const dayOfWeek = startDate.getDay();
        const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
        startDate.setDate(diff);
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      case 'thisMonth':
        // Start of current month (1st)
        startDate.setDate(1);
        // End of current month (last day)
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
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
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        endDate.setHours(23, 59, 59, 999); // End of today
        break;
      default:
        endDate.setHours(23, 59, 59, 999); // End of today
    }
    startDate.setHours(0, 0, 0, 0);
    
    return { startDate, endDate };
  };

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

  /** Pro-rated base salary for a period: only count salary up to today (current month "up to this date"). */
  const getProRatedBaseSalary = (monthlyBaseSalary: number, periodStart: Date, periodEnd: Date): number => {
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
      total += (monthlyBaseSalary * daysInRange) / monthDays;
      cur.setMonth(cur.getMonth() + 1);
      cur.setDate(1);
    }
    return Math.round(total * 100) / 100;
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      
      const { data: baseData, error } = await db.stats.getAnalytics();
      
      if (error) {
        console.error('Error loading analytics:', error);
        toast.error('Failed to load analytics');
        return;
      }

      // Load expenses for the period
      let totalTechnicianExpenses = 0;
      let totalTechnicianAdvances = 0;
      let totalBusinessExpenses = 0;
      let totalSparePartsCost = 0;
      let totalSalaryDeductions = 0;
      let totalSalaryIncludingAll = 0;

      if (startDate && endDate) {
        // Load technician expenses
        const { data: techExpenses, error: techExpensesError } = await db.technicianExpenses.getAll();
        if (!techExpensesError && techExpenses) {
          const filteredExpenses = techExpenses.filter((exp: any) => {
            const expDate = new Date(exp.expense_date);
            return expDate >= startDate && expDate <= endDate;
          });
          totalTechnicianExpenses = filteredExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);
        }

        // Load technician advances
        const { data: techAdvances, error: techAdvancesError } = await db.technicianAdvances.getAll();
        if (!techAdvancesError && techAdvances) {
          const filteredAdvances = techAdvances.filter((adv: any) => {
            const advDate = new Date(adv.advance_date);
            return advDate >= startDate && advDate <= endDate;
          });
          totalTechnicianAdvances = filteredAdvances.reduce((sum: number, adv: any) => sum + Number(adv.amount || 0), 0);
        }

        // Load business expenses
        const { data: businessExpenses, error: businessExpensesError } = await db.businessExpenses.getAll(
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0]
        );
        if (!businessExpensesError && businessExpenses) {
          totalBusinessExpenses = businessExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);
        }

        // Total Salary: for This month / Previous month / Custom month use same figure as Payments section
        const usePaymentsSalary = (period === 'thisMonth' || period === 'previousMonth' || period === 'customMonth') && startDate && endDate;
        if (usePaymentsSalary) {
          try {
            const year = startDate.getFullYear();
            const month = startDate.getMonth() + 1; // 1-12
            const result = await getTotalSalaryForCalendarMonth(year, month);
            totalSalaryDeductions = result.totalSalary;
            totalSalaryIncludingAll = result.totalSalaryIncludingAll;
          } catch (e) {
            console.error('Error loading salary from Payments logic:', e);
          }
        } else {
          // Other periods: calculate from technician payments (pro-rated base, no holiday logic)
          try {
            const { data: allTechnicians } = await db.technicians.getAll(100);
            if (allTechnicians && startDate && endDate) {
              const { data: paymentsData } = await supabase
                .from('technician_payments')
                .select('*')
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());
              const { data: advancesData } = await db.technicianAdvances.getAll();
              const { data: extraCommissionsData } = await db.technicianExtraCommissions.getAll();
              let totalSalaryPaid = 0;
              const EXCLUDED_EMPLOYEE_ID = 'TECH851703400';
              allTechnicians.forEach((tech: any) => {
                const techId = tech.id;
                const employeeId = tech.employee_id ?? tech.employeeId ?? '';
                const monthlyBaseSalary = (tech.salary && typeof tech.salary === 'object' && (tech.salary as any).baseSalary)
                  ? (tech.salary as any).baseSalary
                  : 8000;
                const techPayments = (paymentsData || []).filter((p: any) => p.technician_id === techId);
                const techAdvances = (advancesData || []).filter((a: any) => {
                  if (a.technician_id !== techId) return false;
                  const advDate = new Date(a.advance_date);
                  return advDate >= startDate && advDate <= endDate;
                });
                const techExtraCommissions = (extraCommissionsData || []).filter((ec: any) => {
                  if (ec.technician_id !== techId) return false;
                  const ecDate = new Date(ec.commission_date);
                  return ecDate >= startDate && ecDate <= endDate;
                });
                const baseSalary = getProRatedBaseSalary(monthlyBaseSalary, startDate, endDate);
                const commissions = techPayments.reduce((sum: number, p: any) => sum + (p.commission_amount || 0), 0);
                const extraCommissions = techExtraCommissions.reduce((sum: number, ec: any) => sum + (ec.amount || 0), 0);
                const advances = techAdvances.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
                const amount = Math.max(0, baseSalary + commissions + extraCommissions - advances);
                totalSalaryIncludingAll += amount;
                if (employeeId === EXCLUDED_EMPLOYEE_ID) return;
                totalSalaryPaid += amount;
              });
              totalSalaryDeductions = totalSalaryPaid;
            }
          } catch (e) {
            console.error('Error calculating salary deductions:', e);
          }
        }
      }
      
      // OPTIMIZATION: Fetch only columns needed for analytics (no photos/address) – exact same aggregates, lower egress
      const { data: jobsData, error: jobsError } = await db.jobs.getForAnalytics(5000);
      if (jobsError || !jobsData) {
        console.error('Error loading jobs for detailed analytics:', jobsError);
        setAnalytics(baseData);
        return;
      }
      
      let allJobs = Array.isArray(jobsData) ? jobsData : [];
      
      // Filter jobs by date range based on their status
      // - Completed jobs: filter by completion date (when they were finished)
      // - Other jobs: filter by creation date (when they were created)
      let jobs: any[] = [];
      let completedJobs: any[] = [];
      
      if (startDate && endDate) {
        // First, get all completed jobs filtered by completion date
        completedJobs = allJobs.filter((j: any) => {
          if (!j || j.status !== 'COMPLETED') return false;
          const completedDate = j.end_time || j.completed_at || j.completedAt;
          return isDateInRange(completedDate, startDate, endDate);
        });
        
        // Then, get all other jobs filtered by creation date
        const otherJobs = allJobs.filter((j: any) => {
          if (!j || j.status === 'COMPLETED') return false;
          const jobDate = j.created_at || j.createdAt;
          return isDateInRange(jobDate, startDate, endDate);
        });
        
        // Combine completed jobs (by completion date) and other jobs (by creation date)
        jobs = [...completedJobs, ...otherJobs];
      } else {
        // No date filter - get all jobs
        completedJobs = allJobs.filter((j: any) => j && j.status === 'COMPLETED');
        jobs = allJobs;
      }

      // Spare parts cost: parts used on completed jobs in period (quantity × price_at_time_of_use)
      // Uses stored historical price for accuracy, falls back to current inventory price if not stored
      const completedJobIds = completedJobs.map((j: any) => j.id).filter(Boolean);
      if (completedJobIds.length > 0) {
        const { data: partsUsedData } = await db.jobPartsUsed.getWithPriceByJobIds(completedJobIds);
        totalSparePartsCost = (partsUsedData || []).reduce((sum: number, row: any) => {
          const qty = Number(row.quantity_used) || 0;
          // Use stored price_at_time_of_use if available, otherwise fallback to current inventory price
          const price = row.price_at_time_of_use !== null && row.price_at_time_of_use !== undefined
            ? Number(row.price_at_time_of_use)
            : (Number(row.inventory?.price) ?? 0);
          return sum + qty * price;
        }, 0);
      }

      // Lead Source Breakdown with Service Type details and lead costs
      const leadSourceMap: Record<string, { 
        count: number; 
        amount: number; 
        leadCost: number; // Total lead cost for this source
        displayName: string;
        serviceTypes: Record<string, { count: number; amount: number }>;
      }> = {};
      const leadSourceNameCounts: Record<string, Record<string, number>> = {}; // Track name variations
      
      // Canonical name mapping for known lead sources (normalized key -> canonical display name)
      // Keys are normalized (lowercase, no spaces, no special chars) for matching
      const canonicalNames: Record<string, string> = {
        'website': 'Website',
        'directcall': 'Direct call',
        'rocareindia': 'RO care india',
        'hometriangle': 'Home Triangle',
        'hometriangle-srujan': 'Home Triangle-Srujan',
        'hometrianglesrujan': 'Home Triangle-Srujan',
        'localramu': 'Local Ramu',
        'admincreated': 'Admin Created',
        'unknown': 'Direct call',
        'other': 'Other'
      };
      
      // Helper function to normalize lead source for comparison
      const normalizeLeadSource = (source: string): string => {
        if (!source) return 'unknown';
        // Trim, lowercase, remove all spaces and special characters for comparison
        return source.trim()
          .toLowerCase()
          .replace(/\s+/g, '') // Remove all spaces
          .replace(/[^\w]/g, '') // Remove special characters
          .trim();
      };
      
      // Helper function to get canonical name
      const getCanonicalName = (normalizedKey: string, originalSource: string): string => {
        // Try exact match in canonical names
        if (canonicalNames[normalizedKey]) {
          return canonicalNames[normalizedKey];
        }
        // Return original with proper capitalization (first letter uppercase for each word)
        const words = originalSource.trim().split(/\s+/);
        return words.map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
      };
      
      completedJobs.forEach((job: any) => {
        if (!job) return;
        try {
          const requirements = typeof job.requirements === 'string' 
            ? JSON.parse(job.requirements) 
            : (job.requirements || []);
          
          let leadSource = 'Direct call';
          
          // Try to extract lead source from requirements
          if (Array.isArray(requirements)) {
            const leadSourceObj = requirements.find((r: any) => r && r.lead_source);
            if (leadSourceObj && leadSourceObj.lead_source) {
              leadSource = leadSourceObj.lead_source;
            }
          } else if (requirements && typeof requirements === 'object') {
            leadSource = requirements.lead_source || 'Direct call';
          }
          
          // If still no lead source, try to infer from other job data
          if (!leadSource || leadSource.trim() === '') {
            // Check if job was created through admin (has assigned_by) vs website
            // Jobs created through admin typically have assigned_by set
            // Website jobs typically don't have assigned_by initially
            if (job.assigned_by || job.assignedBy) {
              leadSource = 'Admin Created';
            } else {
              // Default to Direct call for unknown sources
              leadSource = 'Direct call';
            }
          }
          
          // Normalize for comparison (trim, lowercase, normalize spaces)
          const trimmedSource = leadSource.trim() || 'Direct call';
          
          // Skip empty or invalid lead sources - they'll be grouped as Direct call
          if (!trimmedSource || trimmedSource.length === 0) {
            leadSource = 'Direct call';
          }
          
          const normalizedKey = normalizeLeadSource(trimmedSource);
          
          // Track name variations to find the most common one
          if (!leadSourceNameCounts[normalizedKey]) {
            leadSourceNameCounts[normalizedKey] = {};
          }
          if (!leadSourceNameCounts[normalizedKey][trimmedSource]) {
            leadSourceNameCounts[normalizedKey][trimmedSource] = 0;
          }
          leadSourceNameCounts[normalizedKey][trimmedSource] += 1;
          
          const amount = Number(job.payment_amount || job.actual_cost || 0);
          // Use service_sub_type instead of service_type (e.g., Installation, Service, Reinstallation, etc.)
          const serviceType = job.service_sub_type || job.serviceSubType || 'Unknown';
          
          // Get lead_cost from job
          const leadCost = Number((job as any).lead_cost || 0);
          
          if (!leadSourceMap[normalizedKey]) {
            // Use canonical name if available, otherwise use trimmed source
            const canonicalName = getCanonicalName(normalizedKey, trimmedSource);
            leadSourceMap[normalizedKey] = { 
              count: 0, 
              amount: 0,
              leadCost: 0,
              displayName: canonicalName,
              serviceTypes: {}
            };
          }
          leadSourceMap[normalizedKey].count += 1;
          leadSourceMap[normalizedKey].amount += amount;
          leadSourceMap[normalizedKey].leadCost += leadCost;
          
          // Track service sub-type within this lead source (Installation, Service, Reinstallation, etc.)
          if (!leadSourceMap[normalizedKey].serviceTypes[serviceType]) {
            leadSourceMap[normalizedKey].serviceTypes[serviceType] = { count: 0, amount: 0 };
          }
          leadSourceMap[normalizedKey].serviceTypes[serviceType].count += 1;
          leadSourceMap[normalizedKey].serviceTypes[serviceType].amount += amount;
        } catch (e) {
          // Skip invalid requirements
        }
      });
      
      // Update display names to use canonical names or most common variation
      Object.keys(leadSourceMap).forEach(normalizedKey => {
        const nameVariations = leadSourceNameCounts[normalizedKey];
        if (nameVariations && Object.keys(nameVariations).length > 0) {
          // Find the most common variation
          const mostCommonName = Object.entries(nameVariations)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || leadSourceMap[normalizedKey].displayName;
          
          // Use canonical name if available, otherwise use most common variation
          const canonicalName = getCanonicalName(normalizedKey, mostCommonName);
          leadSourceMap[normalizedKey].displayName = canonicalName;
        } else {
          // Use canonical name if available
          const canonicalName = getCanonicalName(normalizedKey, leadSourceMap[normalizedKey].displayName);
          leadSourceMap[normalizedKey].displayName = canonicalName;
        }
      });
      
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
      }> = {};
      
      // Get all technicians
      // OPTIMIZATION: Limit technicians fetch
      const { data: techniciansData } = await db.technicians.getAll(100);
      const technicians = techniciansData || [];
      
      // ========== RETURN COMPLAINTS CALCULATION ==========
      // Only count jobs CREATED in the selected period (not completed in period)
      // A return complaint is a NEW job created in the period for a customer who had previous completed jobs
      let returnComplaintsTotal = 0;
      const returnComplaintsByTechnician: Record<string, number> = {};
      const returnComplaintsDetails: Array<{
        jobNumber: string;
        customerId: string;
        customerName: string;
        jobCreatedDate: string;
        previousJobsCount: number;
        lastCompletedJobDate: string;
        technicianName: string;
      }> = [];
      
      // Get all completed jobs from entire history (for finding previous completed jobs)
      const allCompletedJobs = allJobs.filter((j: any) => j && j.status === 'COMPLETED');
      
      // Only check jobs CREATED in the selected period (not completed ones)
      // For completed jobs in period, we only want those created in period, not those completed in period
      const jobsCreatedInPeriod = allJobs.filter((j: any) => {
        if (!j) return false;
        if (!startDate || !endDate) return true; // If no date filter, include all
        
        const jobCreatedDate = j.created_at;
        if (!jobCreatedDate) return false;
        return isDateInRange(jobCreatedDate, startDate, endDate);
      });
      
      console.log('[Return Complaints Debug]', {
        totalJobs: allJobs.length,
        completedJobs: allCompletedJobs.length,
        jobsCreatedInPeriod: jobsCreatedInPeriod.length,
        period: startDate && endDate ? `${startDate} to ${endDate}` : 'All time'
      });
      
      console.log('[Return Complaints Logic Explanation]', {
        step1: 'Get all jobs CREATED in the selected period',
        step2: 'For each job, check if customer had ANY previous completed job (any time in the past)',
        step3: 'If yes, count it as return complaint and allocate to last technician who completed a job for that customer',
        note: 'This means ANY customer with a previous completed job will have their new jobs counted as return complaints'
      });
      
      // Check if service sub type indicates return complaint
      // Common values: "Return Complaint", "Return", "Complaint", "Service Return", etc.
      const isReturnComplaint = (serviceSubType: string): boolean => {
        if (!serviceSubType) return false;
        const lower = serviceSubType.toLowerCase().trim();
        return lower.includes('return') && (lower.includes('complaint') || lower.includes('service'));
      };
      
      // Check each job CREATED in the selected period
      jobsCreatedInPeriod.forEach((currentJob: any) => {
        if (!currentJob) return;
        
        // Only count if Service Sub Type indicates return complaint
        const serviceSubType = currentJob.service_sub_type || currentJob.serviceSubType || '';
        if (!isReturnComplaint(serviceSubType)) return;
        
        // Get customer ID - jobs have customer_id directly
        const customerId = currentJob.customer_id;
        if (!customerId) return;
        
        // Find previous completed jobs for this customer (completed BEFORE current job was created)
        const currentJobCreatedDate = new Date(currentJob.created_at || 0);
        if (isNaN(currentJobCreatedDate.getTime())) return;
        
        const previousCompletedJobs = allCompletedJobs.filter((prevJob: any) => {
          if (!prevJob || prevJob.id === currentJob.id) return false;
          if (prevJob.customer_id !== customerId) return false;
          
          const prevCompletedDate = prevJob.end_time || prevJob.completed_at;
          if (!prevCompletedDate) return false;
          
          const prevDate = new Date(prevCompletedDate);
          if (isNaN(prevDate.getTime())) return false;
          
          // Previous job must be completed BEFORE current job was created
          return prevDate < currentJobCreatedDate;
        });
        
        // Find the most recent completed job (last technician who did service for this customer)
        if (previousCompletedJobs.length > 0) {
          const lastCompletedJob = previousCompletedJobs.sort((a: any, b: any) => {
            const aDate = new Date(a.end_time || a.completed_at || 0);
            const bDate = new Date(b.end_time || b.completed_at || 0);
            return bDate.getTime() - aDate.getTime(); // Most recent first
          })[0];
          
          const originalTechnicianId = lastCompletedJob.assigned_technician_id;
          if (originalTechnicianId) {
            // EXCLUDE: Don't count if the same technician completed the return complaint job
            // We only count return complaints caused by a technician that were handled by someone else
            const returnComplaintTechnicianId = currentJob.assigned_technician_id;
            if (returnComplaintTechnicianId === originalTechnicianId) {
              console.log(`[Return Complaint Excluded] Job: ${currentJob.job_number || currentJob.jobNumber || 'N/A'}`, {
                reason: 'Same technician completed both original job and return complaint',
                technicianId: originalTechnicianId,
                note: 'Not counted as return complaint caused by this technician'
              });
              return; // Skip counting this return complaint
            }
            
            const tech = technicians.find((t: any) => t.id === originalTechnicianId);
            const technicianName = tech ? (tech.full_name || 'Unknown') : 'Unknown';
            const customerName = currentJob.customer 
              ? (currentJob.customer.full_name || 'Unknown') 
              : 'Unknown';
            
            returnComplaintsTotal++;
            returnComplaintsByTechnician[originalTechnicianId] = (returnComplaintsByTechnician[originalTechnicianId] || 0) + 1;
            
            // Store details for logging
            returnComplaintsDetails.push({
              jobNumber: currentJob.job_number || currentJob.jobNumber || 'N/A',
              customerId,
              customerName,
              jobCreatedDate: currentJob.created_at || '',
              serviceSubType,
              lastCompletedJobDate: lastCompletedJob.end_time || lastCompletedJob.completed_at || '',
              technicianName
            });
            
            console.log(`[Return Complaint Found] Job: ${currentJob.job_number || currentJob.jobNumber || 'N/A'}`, {
              serviceSubType,
              customerName,
              customerId,
              lastCompletedJobDate: lastCompletedJob.end_time || lastCompletedJob.completed_at,
              lastCompletedJobNumber: lastCompletedJob.job_number || lastCompletedJob.jobNumber,
              allocatedToTechnician: technicianName,
              currentJobCreated: currentJob.created_at
            });
            
            // Add to technician stats
            if (!technicianStatsMap[originalTechnicianId]) {
              technicianStatsMap[originalTechnicianId] = {
                id: originalTechnicianId,
                name: technicianName,
                totalJobs: 0,
                completedJobs: 0,
                periodEarnings: 0,
                returnComplaints: 0
              };
            }
            technicianStatsMap[originalTechnicianId].returnComplaints = (technicianStatsMap[originalTechnicianId].returnComplaints || 0) + 1;
          }
        } else {
          console.log(`[Return Complaint - No Previous Service] Job: ${currentJob.job_number || currentJob.jobNumber || 'N/A'}`, {
            serviceSubType,
            customerId,
            note: 'Customer has no previous completed service, so not counted'
          });
        }
      });
      
      // Console log all return complaints details
      console.log('[Return Complaints] Total:', returnComplaintsTotal);
      console.log('[Return Complaints] By Technician:', returnComplaintsByTechnician);
      console.log('[Return Complaints] Details:', returnComplaintsDetails);
      // ========== END RETURN COMPLAINTS CALCULATION ==========
      
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
            name: (tech as any).full_name || (tech as any).fullName || 'Unknown',
            totalJobs: 0,
            completedJobs: 0,
            periodEarnings: 0,
            returnComplaints: 0
          };
        }
        
        technicianStatsMap[techId].totalJobs += 1;
        
        if (job.status === 'COMPLETED') {
          technicianStatsMap[techId].completedJobs += 1;
          
          // Calculate earnings for completed jobs in this period
          // Use payment_amount from completed jobs as earnings metric
          const jobAmount = Number(job.payment_amount || job.actual_cost || 0);
          technicianStatsMap[techId].periodEarnings += jobAmount;
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
        const isSoftener = serviceType === 'SOFTENER' || serviceType === 'softener';
        if (isSoftener) {
          console.log('🔵 [Analytics] Found softener job:', { 
            id: j.id, 
            serviceType, 
            status: j.status,
            jobNumber: j.job_number || j.jobNumber 
          });
        }
        return isSoftener;
      });
      
      console.log('🔵 [Analytics] Total softener jobs found:', softenerJobs.length, 'out of', jobs.length, 'total jobs');
      
      const softenerCompletedJobs = softenerJobs.filter((j: any) => j && j.status === 'COMPLETED');
      if (startDate && endDate) {
        const filteredSoftenerCompleted = softenerCompletedJobs.filter((j: any) => {
          const completedDate = j.completed_at || j.end_time || j.completedAt;
          return isDateInRange(completedDate, startDate, endDate);
        });
        // Use filtered for billing calculations
        var softenerCompletedForBilling = filteredSoftenerCompleted;
      } else {
        var softenerCompletedForBilling = softenerCompletedJobs;
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
            name: (tech as any).full_name || (tech as any).fullName || 'Unknown',
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
      
      // Calculate total billing for the selected period (from completed jobs with payment)
      // Only count jobs that have payment_amount > 0 (actual payments received)
      // Prefer payment_amount over actual_cost as it represents actual money received
      const periodBilling = completedJobs.reduce((sum: number, job: any) => {
        if (!job) return sum;
        const paymentAmount = Number(job.payment_amount || 0);
        // Only count if payment_amount exists and is greater than 0
        // This ensures we only count actual payments, not estimated costs
        if (paymentAmount > 0) {
          return sum + paymentAmount;
        }
        // If no payment_amount, check actual_cost as fallback (but this should be rare)
        const actualCost = Number(job.actual_cost || 0);
        if (actualCost > 0) {
          return sum + actualCost;
        }
        return sum;
      }, 0);
      
      const periodAverageBill = completedJobs.length > 0
        ? periodBilling / completedJobs.length
        : 0;
      
      // Enhance analytics data
      setAnalytics({
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
        returnComplaints: returnComplaintsTotal > 0 ? {
          total: returnComplaintsTotal,
          byTechnician: Object.entries(returnComplaintsByTechnician).map(([techId, count]) => {
            const tech = technicians.find((t: any) => t.id === techId);
            return {
              technicianId: techId,
              technicianName: tech ? (tech.full_name || 'Unknown') : 'Unknown',
              count: count,
              jobs: [] // Simplified - no job details needed
            };
          }).sort((a, b) => b.count - a.count)
        } : undefined,
        technicianStats: Object.values(technicianStatsMap)
          .sort((a, b) => b.completedJobs - a.completedJobs),
        leadSourceBreakdown: Object.entries(leadSourceMap)
          .map(([_, stats]) => ({ 
            leadType: stats.displayName, 
            count: stats.count, 
            amount: stats.amount,
            leadCost: stats.leadCost,
            serviceTypes: Object.entries(stats.serviceTypes)
              .map(([serviceType, serviceStats]) => ({ serviceType, ...serviceStats }))
              .sort((a, b) => b.amount - a.amount)
          }))
          .sort((a, b) => b.amount - a.amount),
        // Calculate total lead costs
        totalLeadCosts: Object.values(leadSourceMap).reduce((sum, stats) => sum + stats.leadCost, 0),
        // Expense totals
        totalTechnicianExpenses,
        totalTechnicianAdvances, // Keep for reference but don't show separately
        totalBusinessExpenses,
        totalSparePartsCost, // Parts used on jobs (job_parts_used × inventory price)
        totalSalaryDeductions, // This is now "Total Salary" (includes base salary + commissions + extra commissions - advances)
        totalSalaryIncludingAll, // Full total including excluded technician(s), for display in brackets
        // Total expenses (technician expenses + total salary + business expenses + spare parts cost)
        totalExpenses: totalTechnicianExpenses + totalSalaryDeductions + totalBusinessExpenses + totalSparePartsCost,
        // Total profit (Revenue - Lead Costs - Expenses)
        totalProfit: periodBilling - Object.values(leadSourceMap).reduce((sum, stats) => sum + stats.leadCost, 0) - (totalTechnicianExpenses + totalSalaryDeductions + totalBusinessExpenses + totalSparePartsCost),
        serviceTypeBreakdown: Object.entries(serviceTypeMap)
          .map(([serviceType, stats]) => ({ serviceType, ...stats }))
          .sort((a, b) => b.amount - a.amount),
        paymentMethodBreakdown: Object.entries(paymentMethodMap)
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
            .map(([method, stats]) => ({ method, ...stats }))
            .sort((a, b) => b.amount - a.amount),
          technicianStats: Object.values(softenerTechnicianStatsMap)
            .sort((a, b) => b.completedJobs - a.completedJobs),
          dailyStats: softenerDailyStats
        }
      });
    } catch (error: any) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load analytics: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
        <p>No analytics data available</p>
      </div>
    );
  }

  const getPeriodLabel = (): string => {
    switch (period) {
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case 'thisWeek': return 'This Week';
      case 'thisMonth': return 'This Month';
      case 'previousMonth': return 'Previous Month';
      case 'customMonth': return customMonthValue
        ? new Date(customMonthValue + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        : 'Custom month';
      case '3m': return 'Last 3 Months';
      case '6m': return 'Last 6 Months';
      case '1y': return 'Last Year';
      case 'all': return 'All Time';
      case 'custom': return 'Custom Range';
      default: return 'Last 30 Days';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Analytics Dashboard</h2>
          <p className="text-gray-600">Comprehensive performance metrics and insights</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <Label htmlFor="period-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Period:
            </Label>
            <Select value={period} onValueChange={(value) => setPeriod(value as PeriodOption)}>
              <SelectTrigger id="period-select" className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="thisWeek">This Week</SelectItem>
                <SelectItem value="thisMonth">This Month</SelectItem>
                <SelectItem value="previousMonth">Previous Month</SelectItem>
                <SelectItem value="customMonth">Custom month</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="3m">Last 3 Months</SelectItem>
                <SelectItem value="6m">Last 6 Months</SelectItem>
                <SelectItem value="1y">Last Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-[150px]"
                placeholder="Start date"
              />
              <span className="text-gray-500">to</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-[150px]"
                placeholder="End date"
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}
          {period === 'customMonth' && (
            <Input
              type="month"
              value={customMonthValue}
              onChange={(e) => setCustomMonthValue(e.target.value)}
              className="w-[160px]"
              max={new Date().toISOString().slice(0, 7)}
            />
          )}
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
                  <TableHead>Return Complaints</TableHead>
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
                            {returnComplaintsCount > 0 ? (
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
            <div className="space-y-6">
              {analytics.leadSourceBreakdown.map((leadSource, index) => (
                <div key={index} className="border-b border-gray-200 last:border-b-0 pb-6 last:pb-0">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{leadSource.leadType}</h3>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Total: {leadSource.count} jobs</div>
                        <div className="text-lg font-bold text-green-600">
                          ₹ {formatCurrency(leadSource.amount)}
                        </div>
                        <div className="text-sm font-semibold text-orange-600 mt-1">
                          Lead Cost: ₹ {formatCurrency(leadSource.leadCost || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {leadSource.serviceTypes && leadSource.serviceTypes.length > 0 && (
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-700 mb-2">Service Type Breakdown:</div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Service Type</TableHead>
                              <TableHead className="text-right">Jobs</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {leadSource.serviceTypes.map((serviceType, serviceIndex) => (
                              <TableRow key={serviceIndex}>
                                <TableCell className="font-medium">{serviceType.serviceType}</TableCell>
                                <TableCell className="text-right">{serviceType.count}</TableCell>
                                <TableCell className="text-right font-semibold text-green-600">
                                  ₹ {formatCurrency(serviceType.amount)}
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
                <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between gap-2 items-center min-w-0">
                    <span className="text-gray-600 truncate">Technician Expenses:</span>
                    <span className="font-semibold text-red-600 shrink-0 tabular-nums">
                      ₹ {formatCurrency(analytics.totalTechnicianExpenses || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 items-center min-w-0">
                    <span className="text-gray-600 truncate">Total Salary (all salary including):</span>
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
                  <div className="flex justify-between gap-2 items-center min-w-0">
                    <span className="text-gray-600 truncate">Spare Parts (used on jobs):</span>
                    <span className="font-semibold text-red-600 shrink-0 tabular-nums">
                      ₹ {formatCurrency(analytics.totalSparePartsCost || 0)}
                    </span>
                  </div>
                  <div className="pt-1.5 sm:pt-2 mt-1.5 sm:mt-2 border-t border-red-300">
                    <div className="flex justify-between items-center gap-2 min-w-0">
                      <span className="text-sm sm:text-base font-semibold text-gray-700">Total Expenses:</span>
                      <span className="text-lg sm:text-2xl font-bold text-red-600 shrink-0 tabular-nums">
                        ₹ {formatCurrency(analytics.totalExpenses || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Profit Section - Stack on mobile, row on md+ */}
              <div className="bg-blue-100 rounded-lg p-4 sm:p-5 md:p-6 border-2 border-blue-300 min-w-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-700">Net Profit</div>
                    <div className="text-xs text-gray-600">
                      Revenue − Lead Costs − Expenses
                    </div>
                  </div>
                  <div className={`text-2xl sm:text-3xl md:text-4xl font-bold shrink-0 tabular-nums ${
                    (analytics.totalProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ₹ {formatCurrency(analytics.totalProfit || 0)}
                  </div>
                </div>
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-blue-300">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs">
                    <div className="flex justify-between sm:block py-1 sm:py-0 border-b border-blue-200 sm:border-b-0 last:border-b-0">
                      <span className="text-gray-600">Revenue</span>
                      <span className="font-semibold text-green-600 sm:block tabular-nums">
                        ₹ {formatCurrency(analytics.totalBilling || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between sm:block py-1 sm:py-0 border-b border-blue-200 sm:border-b-0 last:border-b-0">
                      <span className="text-gray-600">− Lead Costs</span>
                      <span className="font-semibold text-orange-600 sm:block tabular-nums">
                        ₹ {formatCurrency(analytics.totalLeadCosts || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between sm:block py-1 sm:py-0">
                      <span className="text-gray-600">− Expenses (incl. spare parts)</span>
                      <span className="font-semibold text-red-600 sm:block tabular-nums">
                        ₹ {formatCurrency(analytics.totalExpenses || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Analytics;

