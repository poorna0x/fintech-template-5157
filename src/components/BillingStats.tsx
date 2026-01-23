import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { db, supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { DollarSign, QrCode, TrendingUp, User, Calendar, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface QRCodeBilling {
  qrCodeName: string;
  totalAmount: number;
  jobCount: number;
  jobs: Array<{
    jobNumber: string;
    amount: number;
    customer: {
      id: string;
      customer_id: string;
      full_name: string;
    };
  }>;
}

interface TechnicianBilling {
  technicianId: string;
  technicianName: string;
  employeeId: string;
  totalBilling: number;
  cashAmount: number;
  qrAmount: number;
  otherAmount: number;
  jobCount: number;
}

interface LeadTypeBilling {
  leadType: string;
  totalAmount: number;
  jobCount: number;
}

type DateFilter = 'today' | 'thismonth' | 'last30days' | 'year' | 'all' | 'range';

// Helper function to get today's date in local timezone (YYYY-MM-DD format)
const getTodayLocalDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to format currency with commas and without .00 when it's zero
const formatCurrency = (amount: number): string => {
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted;
};

const BillingStats = () => {
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [selectedDate, setSelectedDate] = useState(() => getTodayLocalDate());
  const [startDate, setStartDate] = useState(() => getTodayLocalDate());
  const [endDate, setEndDate] = useState(() => getTodayLocalDate());
  const [qrCodeBilling, setQrCodeBilling] = useState<QRCodeBilling[]>([]);
  const [technicianBilling, setTechnicianBilling] = useState<TechnicianBilling[]>([]);
  const [leadTypeBilling, setLeadTypeBilling] = useState<LeadTypeBilling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBillingStats();
  }, [dateFilter, selectedDate, startDate, endDate]);

  const getDateRange = (): { startDate: Date; endDate: Date } => {
    let end = new Date();
    end.setHours(23, 59, 59, 999);
    
    let start = new Date();
    
    switch (dateFilter) {
      case 'today':
        start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        end.setTime(start.getTime());
        end.setHours(23, 59, 59, 999);
        break;
      case 'thismonth':
        start = new Date(end.getFullYear(), end.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last30days':
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        break;
      case 'year':
        start = new Date(end.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'range':
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        break;
      case 'all':
        start = new Date(2020, 0, 1); // Start from a very early date
        start.setHours(0, 0, 0, 0);
        break;
    }
    
    return { startDate: start, endDate: end };
  };

  const loadBillingStats = async () => {
    try {
      setLoading(true);
      
      const { startDate, endDate } = getDateRange();
      
      // Use getBillingByDateRange if it exists, otherwise fetch all and filter
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id,
          job_number,
          requirements,
          payment_amount,
          actual_cost,
          payment_method,
          status,
          assigned_technician_id,
          technician:technicians(
            id,
            full_name,
            employee_id
          ),
          customer:customers(
            id,
            customer_id,
            full_name
          ),
          completed_at
        `)
        .eq('status', 'COMPLETED')
        .gte('completed_at', startDate.toISOString())
        .lte('completed_at', endDate.toISOString())
        .not('payment_amount', 'is', null);
      
      if (error) {
        console.error('Error loading billing:', error);
        toast.error('Failed to load billing stats');
        return;
      }

      const jobs = data || [];
      
      // Group by technician
      const techTotals: Record<string, TechnicianBilling> = {};
      const qrTotals: Record<string, QRCodeBilling> = {};
      const leadTotals: Record<string, LeadTypeBilling> = {};
      
      jobs.forEach((job: any) => {
        const techId = job.assigned_technician_id;
        const amount = job.payment_amount || job.actual_cost || 0;
        const paymentMethod = job.payment_method || 'OTHER';
        
        // Technician billing
        if (techId) {
          if (!techTotals[techId]) {
            techTotals[techId] = {
              technicianId: techId,
              technicianName: job.technician?.full_name || 'Unknown',
              employeeId: job.technician?.employee_id || '',
              totalBilling: 0,
              cashAmount: 0,
              qrAmount: 0,
              otherAmount: 0,
              jobCount: 0
            };
          }
          
          techTotals[techId].totalBilling += amount;
          techTotals[techId].jobCount += 1;
          
          if (paymentMethod === 'CASH') {
            techTotals[techId].cashAmount += amount;
          } else if (paymentMethod === 'UPI' || paymentMethod === 'CARD') {
            techTotals[techId].qrAmount += amount;
          } else {
            techTotals[techId].otherAmount += amount;
          }
        }
        
        // QR Code billing
        try {
          const requirements = typeof job.requirements === 'string' 
            ? JSON.parse(job.requirements) 
            : job.requirements || [];
          
          const qrPhotos = requirements.find((r: any) => r?.qr_photos);
          const qrCodeName = qrPhotos?.qr_photos?.selected_qr_code_name;
          
          // Only add to QR totals if QR code name exists
          if (qrCodeName) {
            if (!qrTotals[qrCodeName]) {
              qrTotals[qrCodeName] = {
                qrCodeName,
                totalAmount: 0,
                jobCount: 0,
                jobs: []
              };
            }
            
            qrTotals[qrCodeName].totalAmount += amount;
            qrTotals[qrCodeName].jobCount += 1;
            qrTotals[qrCodeName].jobs.push({
              jobNumber: job.job_number,
              amount,
              customer: job.customer
            });
          }
          
          // Lead Type billing
          // Lead source can be in different formats:
          // 1. Direct property: requirements.lead_source
          // 2. In array: requirements[0].lead_source
          let leadSource = null;
          
          if (Array.isArray(requirements)) {
            const leadSourceObj = requirements.find((r: any) => r?.lead_source);
            leadSource = leadSourceObj?.lead_source || 'Direct call';
          } else if (requirements && typeof requirements === 'object') {
            leadSource = requirements.lead_source || 'Direct call';
          } else {
            leadSource = 'Direct call';
          }
          
          if (!leadTotals[leadSource]) {
            leadTotals[leadSource] = {
              leadType: leadSource,
              totalAmount: 0,
              jobCount: 0
            };
          }
          
          leadTotals[leadSource].totalAmount += amount;
          leadTotals[leadSource].jobCount += 1;
        } catch (e) {
          // Skip jobs with invalid requirements
        }
      });
      
      setTechnicianBilling(Object.values(techTotals));
      setQrCodeBilling(Object.values(qrTotals));
      setLeadTypeBilling(Object.values(leadTotals));
    } catch (error: any) {
      console.error('Error loading billing stats:', error);
      toast.error('Failed to load billing stats: ' + error.message);
    } finally {
      setLoading(false);
    }
  };


  const totalBilling = technicianBilling.reduce((sum, item) => sum + item.totalBilling, 0);
  const totalCash = technicianBilling.reduce((sum, item) => sum + item.cashAmount, 0);
  const totalQR = qrCodeBilling.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalJobs = technicianBilling.reduce((sum, item) => sum + item.jobCount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3"></div>
          <p className="text-gray-600">Loading billing stats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Billing Statistics</h2>
          <p className="text-gray-600">View billing breakdown by technician and QR code</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select value={dateFilter} onValueChange={(value: DateFilter) => setDateFilter(value)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="thismonth">This Month</SelectItem>
                <SelectItem value="last30days">Last 30 Days</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
                <SelectItem value="range">Date Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dateFilter === 'today' && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto"
              />
            </div>
          )}
          {dateFilter === 'range' && (
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="w-4 h-4 text-gray-500" />
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-auto"
                  max={endDate}
                />
                <span className="text-gray-500">to</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-auto"
                  min={startDate}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Total Billing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">₹ {formatCurrency(totalBilling)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              Total Cash
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹ {formatCurrency(totalCash)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Total QR Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">₹ {formatCurrency(totalQR)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Total Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{totalJobs}</div>
          </CardContent>
        </Card>
      </div>


      {/* Technician Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Billing by Technician
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead className="text-right">Total Billing</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">QR/UPI/Card</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicianBilling.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                      No billing data found for {
                        dateFilter === 'today' 
                          ? new Date(selectedDate).toLocaleDateString()
                          : dateFilter === 'thismonth'
                          ? 'this month'
                          : dateFilter === 'last30days'
                          ? 'the last 30 days'
                          : dateFilter === 'year'
                          ? `year ${new Date().getFullYear()}`
                          : dateFilter === 'range'
                          ? `${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`
                          : 'all time'
                      }
                    </TableCell>
                  </TableRow>
                ) : (
                  technicianBilling
                    .sort((a, b) => b.totalBilling - a.totalBilling)
                    .map((item) => (
                      <TableRow key={item.technicianId}>
                        <TableCell className="font-medium">{item.technicianName}</TableCell>
                        <TableCell className="text-right font-semibold">
                          ₹ {formatCurrency(item.totalBilling)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          ₹ {formatCurrency(item.cashAmount)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          ₹ {formatCurrency(item.qrAmount)}
                        </TableCell>
                        <TableCell className="text-right">{item.jobCount}</TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            Billing by QR Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>QR Code Name</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qrCodeBilling.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-gray-500 py-8">
                      No QR code billing data found for {
                        dateFilter === 'today' 
                          ? new Date(selectedDate).toLocaleDateString()
                          : dateFilter === 'thismonth'
                          ? 'this month'
                          : dateFilter === 'last30days'
                          ? 'the last 30 days'
                          : dateFilter === 'year'
                          ? `year ${new Date().getFullYear()}`
                          : dateFilter === 'range'
                          ? `${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`
                          : 'all time'
                      }
                    </TableCell>
                  </TableRow>
                ) : (
                  qrCodeBilling
                    .sort((a, b) => b.totalAmount - a.totalAmount)
                    .map((item, index) => (
                      <TableRow key={item.qrCodeName || index}>
                        <TableCell className="font-medium">
                          {item.qrCodeName}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ₹ {formatCurrency(item.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Lead Type Billing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Billing by Lead Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead Type</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadTypeBilling.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-500 py-8">
                      No lead type billing data found for {
                        dateFilter === 'today' 
                          ? new Date(selectedDate).toLocaleDateString()
                          : dateFilter === 'thismonth'
                          ? 'this month'
                          : dateFilter === 'last30days'
                          ? 'the last 30 days'
                          : dateFilter === 'year'
                          ? `year ${new Date().getFullYear()}`
                          : dateFilter === 'range'
                          ? `${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`
                          : 'all time'
                      }
                    </TableCell>
                  </TableRow>
                ) : (
                  leadTypeBilling
                    .sort((a, b) => b.totalAmount - a.totalAmount)
                    .map((item, index) => (
                      <TableRow key={item.leadType || index}>
                        <TableCell className="font-medium">
                          {item.leadType}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ₹ {formatCurrency(item.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right">{item.jobCount}</TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingStats;

