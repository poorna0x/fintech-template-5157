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

type DateFilter = 'today' | 'last30days' | 'year' | 'all';

const BillingStats = () => {
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [qrCodeBilling, setQrCodeBilling] = useState<QRCodeBilling[]>([]);
  const [technicianBilling, setTechnicianBilling] = useState<TechnicianBilling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBillingStats();
  }, [dateFilter, selectedDate]);

  const getDateRange = (): { startDate: Date; endDate: Date } => {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    let startDate = new Date();
    
    switch (dateFilter) {
      case 'today':
        startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setTime(startDate.getTime());
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last30days':
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate = new Date(endDate.getFullYear(), 0, 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'all':
        startDate = new Date(2020, 0, 1); // Start from a very early date
        startDate.setHours(0, 0, 0, 0);
        break;
    }
    
    return { startDate, endDate };
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
          
          // Skip if no QR code name (these are cash payments)
          if (!qrCodeName) {
            return;
          }
          
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
        } catch (e) {
          // Skip jobs with invalid requirements
        }
      });
      
      setTechnicianBilling(Object.values(techTotals));
      setQrCodeBilling(Object.values(qrTotals));
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
                <SelectItem value="last30days">Last 30 Days</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
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
            <div className="text-2xl font-bold text-gray-900">INR {totalBilling.toFixed(2)}</div>
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
            <div className="text-2xl font-bold text-green-600">INR {totalCash.toFixed(2)}</div>
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
            <div className="text-2xl font-bold text-blue-600">INR {totalQR.toFixed(2)}</div>
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
                  <TableHead>Employee ID</TableHead>
                  <TableHead className="text-right">Total Billing</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">QR/UPI/Card</TableHead>
                  <TableHead className="text-right">Other</TableHead>
                  <TableHead className="text-right">Jobs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicianBilling.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      No billing data found for {
                        dateFilter === 'today' 
                          ? new Date(selectedDate).toLocaleDateString()
                          : dateFilter === 'last30days'
                          ? 'the last 30 days'
                          : dateFilter === 'year'
                          ? `year ${new Date().getFullYear()}`
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
                        <TableCell>{item.employeeId}</TableCell>
                        <TableCell className="text-right font-semibold">
                          INR {item.totalBilling.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          INR {item.cashAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          INR {item.qrAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-gray-600">
                          INR {item.otherAmount.toFixed(2)}
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
                  <TableHead className="text-right">Jobs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qrCodeBilling.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-500 py-8">
                      No QR code billing data found for {
                        dateFilter === 'today' 
                          ? new Date(selectedDate).toLocaleDateString()
                          : dateFilter === 'last30days'
                          ? 'the last 30 days'
                          : dateFilter === 'year'
                          ? `year ${new Date().getFullYear()}`
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
                          INR {item.totalAmount.toFixed(2)}
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

