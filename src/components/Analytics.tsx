import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/supabase';
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
  Filter
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
  }>;
  completionRate: number;
  denialRate: number;
  leadSourceBreakdown?: Array<{ 
    leadType: string; 
    count: number; 
    amount: number;
    serviceTypes: Array<{ serviceType: string; count: number; amount: number }>;
  }>;
  serviceTypeBreakdown?: Array<{ serviceType: string; count: number; amount: number }>;
  paymentMethodBreakdown?: Array<{ method: string; count: number; amount: number }>;
  dailyStats?: Array<{ date: string; jobs: number; revenue: number }>;
}

type PeriodOption = '7d' | '30d' | 'thisWeek' | 'thisMonth' | '3m' | '6m' | '1y' | 'all' | 'custom';

const Analytics = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodOption>('30d');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  useEffect(() => {
    loadAnalytics();
  }, [period, customStartDate, customEndDate]);

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
      
      // Fetch additional detailed data
      const { data: jobsData, error: jobsError } = await db.jobs.getAll();
      if (jobsError || !jobsData) {
        console.error('Error loading jobs for detailed analytics:', jobsError);
        setAnalytics(baseData);
        return;
      }
      
      let jobs = Array.isArray(jobsData) ? jobsData : [];
      
      // Filter jobs by date range
      if (startDate && endDate) {
        jobs = jobs.filter((j: any) => {
          if (!j) return false;
          const jobDate = j.created_at || j.createdAt;
          return isDateInRange(jobDate, startDate, endDate);
        });
      }
      
      // Filter completed jobs and apply date range to completion date
      let completedJobs = jobs.filter((j: any) => j && j.status === 'COMPLETED');
      if (startDate && endDate) {
        completedJobs = completedJobs.filter((j: any) => {
          const completedDate = j.completed_at || j.end_time || j.completedAt;
          return isDateInRange(completedDate, startDate, endDate);
        });
      }
      
      // Lead Source Breakdown with Service Type details
      const leadSourceMap: Record<string, { 
        count: number; 
        amount: number; 
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
        'localramu': 'Local Ramu',
        'admincreated': 'Admin Created',
        'unknown': 'Unknown (Needs Review)',
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
          
          let leadSource = 'Unknown';
          
          // Try to extract lead source from requirements
          if (Array.isArray(requirements)) {
            const leadSourceObj = requirements.find((r: any) => r && r.lead_source);
            if (leadSourceObj && leadSourceObj.lead_source) {
              leadSource = leadSourceObj.lead_source;
            }
          } else if (requirements && typeof requirements === 'object') {
            leadSource = requirements.lead_source || 'Unknown';
          }
          
          // If still Unknown, try to infer from other job data
          if (leadSource === 'Unknown' || !leadSource || leadSource.trim() === '') {
            // Check if job was created through admin (has assigned_by) vs website
            // Jobs created through admin typically have assigned_by set
            // Website jobs typically don't have assigned_by initially
            if (job.assigned_by || job.assignedBy) {
              leadSource = 'Admin Created';
            } else {
              // Could be website booking - but we'll keep as Unknown for now
              // You can add more inference logic here based on your needs
              leadSource = 'Unknown';
            }
          }
          
          // Normalize for comparison (trim, lowercase, normalize spaces)
          const trimmedSource = leadSource.trim() || 'Unknown';
          
          // Skip empty or invalid lead sources - they'll be grouped as Unknown
          if (!trimmedSource || trimmedSource === 'Unknown' || trimmedSource.length === 0) {
            leadSource = 'Unknown';
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
          
          if (!leadSourceMap[normalizedKey]) {
            // Use canonical name if available, otherwise use trimmed source
            const canonicalName = getCanonicalName(normalizedKey, trimmedSource);
            leadSourceMap[normalizedKey] = { 
              count: 0, 
              amount: 0, 
              displayName: canonicalName,
              serviceTypes: {}
            };
          }
          leadSourceMap[normalizedKey].count += 1;
          leadSourceMap[normalizedKey].amount += amount;
          
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
      }> = {};
      
      // Get all technicians
      const { data: techniciansData } = await db.technicians.getAll();
      const technicians = techniciansData || [];
      
      // Calculate stats for each technician based on jobs in the selected period
      jobs.forEach((job: any) => {
        if (!job) return;
        const techId = job.assigned_technician_id || job.assignedTechnicianId;
        if (!techId) return;
        
        const tech = technicians.find((t: any) => t.id === techId);
        if (!tech) return;
        
        if (!technicianStatsMap[techId]) {
          technicianStatsMap[techId] = {
            id: techId,
            name: tech.full_name || tech.fullName || 'Unknown',
            totalJobs: 0,
            completedJobs: 0,
            periodEarnings: 0
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
        totalJobs: jobs.length, // Use period-specific job count
        completedJobs: completedJobs.length, // Use period-specific completed jobs
        deniedJobs: jobs.filter((j: any) => j && (j.status === 'DENIED' || j.status === 'CANCELLED')).length,
        pendingJobs: jobs.filter((j: any) => j && j.status === 'PENDING').length,
        assignedJobs: jobs.filter((j: any) => j && j.status === 'ASSIGNED').length,
        inProgressJobs: jobs.filter((j: any) => j && j.status === 'IN_PROGRESS').length,
        completionRate: jobs.length > 0 ? (completedJobs.length / jobs.length) * 100 : 0,
        denialRate: jobs.length > 0 ? (jobs.filter((j: any) => j && (j.status === 'DENIED' || j.status === 'CANCELLED')).length / jobs.length) * 100 : 0,
        technicianStats: Object.values(technicianStatsMap)
          .sort((a, b) => b.completedJobs - a.completedJobs),
        leadSourceBreakdown: Object.entries(leadSourceMap)
          .map(([_, stats]) => ({ 
            leadType: stats.displayName, 
            count: stats.count, 
            amount: stats.amount,
            serviceTypes: Object.entries(stats.serviceTypes)
              .map(([serviceType, serviceStats]) => ({ serviceType, ...serviceStats }))
              .sort((a, b) => b.amount - a.amount)
          }))
          .sort((a, b) => b.amount - a.amount),
        serviceTypeBreakdown: Object.entries(serviceTypeMap)
          .map(([serviceType, stats]) => ({ serviceType, ...stats }))
          .sort((a, b) => b.amount - a.amount),
        paymentMethodBreakdown: Object.entries(paymentMethodMap)
          .map(([method, stats]) => ({ method, ...stats }))
          .sort((a, b) => b.amount - a.amount),
        dailyStats
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
        </div>
      </div>
      
      {period === 'custom' && (!customStartDate || !customEndDate) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          Please select both start and end dates to view custom range analytics.
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Total Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{analytics.totalJobs}</div>
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
            <div className="text-2xl font-bold text-gray-900">INR {analytics.totalBilling.toFixed(2)}</div>
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
                  <TableHead>Completion Rate</TableHead>
                  <TableHead className="text-right">Total Earnings ({getPeriodLabel()})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.technicianStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-8">
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
                            INR {tech.periodEarnings.toFixed(2)}
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
            
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Average Bill Amount</span>
                <span className="font-bold text-lg">INR {analytics.averageBill.toFixed(2)}</span>
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
                          INR {leadSource.amount.toFixed(2)}
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
                              <TableHead className="text-right">Average</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {leadSource.serviceTypes.map((serviceType, serviceIndex) => (
                              <TableRow key={serviceIndex}>
                                <TableCell className="font-medium">{serviceType.serviceType}</TableCell>
                                <TableCell className="text-right">{serviceType.count}</TableCell>
                                <TableCell className="text-right font-semibold text-green-600">
                                  INR {serviceType.amount.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right text-gray-600">
                                  INR {serviceType.count > 0 ? (serviceType.amount / serviceType.count).toFixed(2) : '0.00'}
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
                    <TableHead className="text-right">Average Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.serviceTypeBreakdown.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.serviceType}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        INR {item.amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-gray-600">
                        INR {item.count > 0 ? (item.amount / item.count).toFixed(2) : '0.00'}
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
                    <TableHead className="text-right">Average Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.paymentMethodBreakdown.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.method}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        INR {item.amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-gray-600">
                        INR {item.count > 0 ? (item.amount / item.count).toFixed(2) : '0.00'}
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
                      ₹{day.revenue.toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Analytics;

