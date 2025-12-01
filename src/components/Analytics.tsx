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
  Clock,
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
    totalEarnings: number;
    pendingEarnings: number;
  }>;
  completionRate: number;
  denialRate: number;
  leadSourceBreakdown?: Array<{ leadType: string; count: number; amount: number }>;
  serviceTypeBreakdown?: Array<{ serviceType: string; count: number; amount: number }>;
  paymentMethodBreakdown?: Array<{ method: string; count: number; amount: number }>;
  averageCompletionTime?: number; // in hours
  dailyStats?: Array<{ date: string; jobs: number; revenue: number }>;
}

type PeriodOption = '7d' | '30d' | '3m' | '6m' | '1y' | 'all' | 'custom';

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
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999); // End of today
    
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
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '3m':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case '6m':
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
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
      
      // Lead Source Breakdown
      const leadSourceMap: Record<string, { count: number; amount: number; displayName: string }> = {};
      const leadSourceNameCounts: Record<string, Record<string, number>> = {}; // Track name variations
      
      // Canonical name mapping for known lead sources (normalized key -> canonical display name)
      // Keys are normalized (lowercase, no spaces, no special chars) for matching
      const canonicalNames: Record<string, string> = {
        'website': 'Website',
        'directcall': 'Direct call',
        'rocareindia': 'RO care india',
        'hometriangle': 'Home Triangle',
        'localramu': 'Local Ramu',
        'unknown': 'Unknown',
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
          if (Array.isArray(requirements)) {
            const leadSourceObj = requirements.find((r: any) => r && r.lead_source);
            leadSource = (leadSourceObj && leadSourceObj.lead_source) ? leadSourceObj.lead_source : 'Unknown';
          } else if (requirements && typeof requirements === 'object') {
            leadSource = requirements.lead_source || 'Unknown';
          }
          
          // Normalize for comparison (trim, lowercase, normalize spaces)
          const trimmedSource = leadSource.trim() || 'Unknown';
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
          if (!leadSourceMap[normalizedKey]) {
            // Use canonical name if available, otherwise use trimmed source
            const canonicalName = getCanonicalName(normalizedKey, trimmedSource);
            leadSourceMap[normalizedKey] = { count: 0, amount: 0, displayName: canonicalName };
          }
          leadSourceMap[normalizedKey].count += 1;
          leadSourceMap[normalizedKey].amount += amount;
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
      
      // Service Type Breakdown
      const serviceTypeMap: Record<string, { count: number; amount: number }> = {};
      completedJobs.forEach((job: any) => {
        if (!job) return;
        const serviceType = job.service_type || 'Unknown';
        const amount = Number(job.payment_amount || job.actual_cost || 0);
        if (!serviceTypeMap[serviceType]) {
          serviceTypeMap[serviceType] = { count: 0, amount: 0 };
        }
        serviceTypeMap[serviceType].count += 1;
        serviceTypeMap[serviceType].amount += amount;
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
      
      // Average Completion Time
      const jobsWithTime = completedJobs.filter((job: any) => 
        job && job.start_time && job.end_time
      );
      let averageCompletionTime: number | undefined = undefined;
      if (jobsWithTime.length > 0) {
        const totalHours = jobsWithTime.reduce((sum: number, job: any) => {
          if (!job || !job.start_time || !job.end_time) return sum;
          try {
            const start = new Date(job.start_time).getTime();
            const end = new Date(job.end_time).getTime();
            if (isNaN(start) || isNaN(end)) return sum;
            return sum + ((end - start) / (1000 * 60 * 60)); // Convert to hours
          } catch (e) {
            return sum;
          }
        }, 0);
        averageCompletionTime = totalHours / jobsWithTime.length;
      }
      
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
      
      // Enhance analytics data
      setAnalytics({
        ...baseData,
        leadSourceBreakdown: Object.entries(leadSourceMap)
          .map(([_, stats]) => ({ leadType: stats.displayName, count: stats.count, amount: stats.amount }))
          .sort((a, b) => b.amount - a.amount),
        serviceTypeBreakdown: Object.entries(serviceTypeMap)
          .map(([serviceType, stats]) => ({ serviceType, ...stats }))
          .sort((a, b) => b.amount - a.amount),
        paymentMethodBreakdown: Object.entries(paymentMethodMap)
          .map(([method, stats]) => ({ method, ...stats }))
          .sort((a, b) => b.amount - a.amount),
        averageCompletionTime,
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
            <div className="text-xs text-gray-500 mt-1">
              Avg: INR {analytics.averageBill.toFixed(2)}
            </div>
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
                  <TableHead className="text-right">Total Earnings</TableHead>
                  <TableHead className="text-right">Pending Earnings</TableHead>
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
                            INR {tech.totalEarnings.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-orange-600">
                            INR {tech.pendingEarnings.toFixed(2)}
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

      {/* Detailed Breakdowns */}
      {analytics.leadSourceBreakdown && analytics.leadSourceBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Lead Source Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead Source</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                    <TableHead className="text-right">Average Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.leadSourceBreakdown.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.leadType}</TableCell>
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
                    <TableHead className="text-right">Jobs</TableHead>
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

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analytics.averageCompletionTime !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Average Job Completion Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {analytics.averageCompletionTime.toFixed(1)} hours
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Based on completed jobs with time tracking
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
    </div>
  );
};

export default Analytics;

