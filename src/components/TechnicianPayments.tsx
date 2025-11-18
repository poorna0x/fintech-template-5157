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
import { DollarSign, User, Calendar, CheckCircle, Clock, Search, RefreshCw, Plus, Trash2 } from 'lucide-react';
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
  payment_method?: string;
  payment_reference?: string;
  notes?: string;
  technician?: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
    employee_id: string;
  };
  job?: {
    id: string;
    job_number: string;
    service_type: string;
    service_sub_type: string;
    payment_amount?: number;
    actual_cost?: number;
  };
}

interface TechnicianSummary {
  technicianId: string;
  technicianName: string;
  employeeId: string;
  baseSalary: number;
  totalJobs: number;
  totalBillAmount: number;
  totalCommission: number;
  paidCommission: number;
  pendingCommission: number;
  totalEarnings: number; // baseSalary + paidCommission
  pendingEarnings: number; // pendingCommission
}

const TechnicianPayments = () => {
  const [payments, setPayments] = useState<TechnicianPayment[]>([]);
  const [technicianSummaries, setTechnicianSummaries] = useState<TechnicianSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<TechnicianPayment | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');
  
  const [paymentFormData, setPaymentFormData] = useState({
    payment_method: 'BANK_TRANSFER',
    payment_reference: '',
    notes: ''
  });
  const [isCreatingPayments, setIsCreatingPayments] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [addPaymentDialogOpen, setAddPaymentDialogOpen] = useState(false);
  const [newPaymentFormData, setNewPaymentFormData] = useState({
    technician_id: '',
    job_id: '',
    bill_amount: '',
    commission_amount: '',
    payment_status: 'PENDING' as 'PENDING' | 'PAID'
  });

  useEffect(() => {
    loadTechnicians();
    loadJobs();
    loadPayments();
  }, []);

  const loadJobs = async () => {
    try {
      const { data, error } = await db.jobs.getAll();
      if (error) {
        console.error('Error loading jobs:', error);
        return;
      }
      // Filter to only completed jobs
      setJobs((data || []).filter((job: any) => job.status === 'COMPLETED'));
    } catch (error: any) {
      console.error('Error loading jobs:', error);
    }
  };

  const loadTechnicians = async () => {
    try {
      const { data, error } = await db.technicians.getAll();
      if (error) {
        console.error('Error loading technicians:', error);
        return;
      }
      setTechnicians(data || []);
    } catch (error: any) {
      console.error('Error loading technicians:', error);
    }
  };

  const loadPayments = async () => {
    try {
      setLoading(true);
      // Ensure technicians are loaded first
      let techs = technicians;
      if (techs.length === 0) {
        const { data: techData } = await db.technicians.getAll();
        techs = techData || [];
        setTechnicians(techs);
      }
      const { data, error } = await db.technicianPayments.getAll();
      
      if (error) {
        console.error('Error loading payments:', error);
        toast.error('Failed to load payments: ' + (error.message || 'Unknown error'));
        setPayments([]);
        setTechnicianSummaries([]);
        return;
      }
      
      console.log('Loaded payments:', data?.length || 0, 'records');
      setPayments(data || []);
      
      // Calculate technician summaries
      const summaries: Record<string, TechnicianSummary> = {};
      
      // First, initialize all technicians (including those without payments)
      techs.forEach((tech: any) => {
        const techId = tech.id;
        if (!summaries[techId]) {
          summaries[techId] = {
            technicianId: techId,
            technicianName: tech.full_name || 'Unknown',
            employeeId: tech.employee_id || '',
            baseSalary: tech.salary?.baseSalary || 0,
            totalJobs: 0,
            totalBillAmount: 0,
            totalCommission: 0,
            paidCommission: 0,
            pendingCommission: 0,
            totalEarnings: tech.salary?.baseSalary || 0,
            pendingEarnings: 0
          };
        }
      });
      
      // Then, add payment data
      (data || []).forEach((payment: TechnicianPayment) => {
        const techId = payment.technician_id;
        const techName = payment.technician?.full_name || 'Unknown';
        const employeeId = payment.technician?.employee_id || '';
        const tech = techs.find((t: any) => t.id === techId);
        const baseSalary = tech?.salary?.baseSalary || 0;
        
        if (!summaries[techId]) {
          summaries[techId] = {
            technicianId: techId,
            technicianName: techName,
            employeeId,
            baseSalary,
            totalJobs: 0,
            totalBillAmount: 0,
            totalCommission: 0,
            paidCommission: 0,
            pendingCommission: 0,
            totalEarnings: baseSalary,
            pendingEarnings: 0
          };
        }
        
        summaries[techId].totalJobs += 1;
        summaries[techId].totalBillAmount += payment.bill_amount;
        summaries[techId].totalCommission += payment.commission_amount;
        
        if (payment.payment_status === 'PAID') {
          summaries[techId].paidCommission += payment.commission_amount;
        } else if (payment.payment_status === 'PENDING') {
          summaries[techId].pendingCommission += payment.commission_amount;
        }
      });
      
      // Calculate total earnings (base salary + paid commission)
      Object.values(summaries).forEach(summary => {
        summary.totalEarnings = summary.baseSalary + summary.paidCommission;
        summary.pendingEarnings = summary.pendingCommission;
      });
      
      setTechnicianSummaries(Object.values(summaries));
    } catch (error: any) {
      console.error('Error loading payments:', error);
      toast.error('Failed to load payments: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async (payment: TechnicianPayment) => {
    setSelectedPayment(payment);
    setPaymentFormData({
      payment_method: 'BANK_TRANSFER',
      payment_reference: '',
      notes: ''
    });
    setPaymentDialogOpen(true);
  };

  const handleSubmitPayment = async () => {
    if (!selectedPayment) return;
    
    try {
      const { error } = await db.technicianPayments.update(selectedPayment.id, {
        payment_status: 'PAID',
        payment_date: new Date().toISOString(),
        payment_method: paymentFormData.payment_method,
        payment_reference: paymentFormData.payment_reference || null,
        notes: paymentFormData.notes || null
      });
      
      if (error) {
        toast.error('Failed to update payment: ' + error.message);
        return;
      }
      
      toast.success('Payment marked as paid');
      setPaymentDialogOpen(false);
      setSelectedPayment(null);
      await loadPayments();
    } catch (error: any) {
      toast.error('Error updating payment: ' + error.message);
    }
  };

  const handleAddPayment = async () => {
    try {
      if (!newPaymentFormData.technician_id || !newPaymentFormData.bill_amount) {
        toast.error('Please select technician and enter bill amount');
        return;
      }

      const billAmount = parseFloat(newPaymentFormData.bill_amount);
      const commissionAmount = newPaymentFormData.commission_amount 
        ? parseFloat(newPaymentFormData.commission_amount)
        : billAmount * 0.10; // Default to 10%

      const { error } = await supabase
        .from('technician_payments')
        .insert({
          technician_id: newPaymentFormData.technician_id,
          job_id: newPaymentFormData.job_id || null,
          bill_amount: billAmount,
          commission_percentage: 10.00,
          commission_amount: commissionAmount,
          payment_status: newPaymentFormData.payment_status
        });

      if (error) {
        toast.error('Failed to create payment: ' + error.message);
        return;
      }

      toast.success('Payment record created');
      setAddPaymentDialogOpen(false);
      setNewPaymentFormData({
        technician_id: '',
        job_id: '',
        bill_amount: '',
        commission_amount: '',
        payment_status: 'PENDING'
      });
      await loadPayments();
    } catch (error: any) {
      toast.error('Error creating payment: ' + error.message);
    }
  };

  const handleCreatePaymentsForCompletedJobs = async () => {
    try {
      setIsCreatingPayments(true);
      const { data, error } = await db.technicianPayments.createPaymentsForCompletedJobs();
      
      if (error) {
        console.error('Error creating payments:', error);
        toast.error('Failed to create payment records: ' + (error.message || 'Unknown error'));
        return;
      }
      
      const result = data?.[0] || data;
      const created = result?.created_count || 0;
      const skipped = result?.skipped_count || 0;
      const errors = result?.error_count || 0;
      
      if (created > 0) {
        toast.success(`Created ${created} payment record(s). ${skipped} already existed.`);
        await loadPayments();
      } else if (skipped > 0) {
        toast.info(`All payment records already exist (${skipped} skipped)`);
      } else {
        toast.info('No completed jobs found with payment amounts');
      }
      
      if (errors > 0) {
        toast.warning(`${errors} error(s) occurred while creating payment records`);
      }
    } catch (error: any) {
      console.error('Error creating payments:', error);
      toast.error('Failed to create payment records: ' + error.message);
    } finally {
      setIsCreatingPayments(false);
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = !searchTerm || 
      payment.technician?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.technician?.employee_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.job?.job_number?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || payment.payment_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalPending = technicianSummaries.reduce((sum, t) => sum + t.pendingEarnings, 0);
  const totalPaid = technicianSummaries.reduce((sum, t) => sum + t.totalEarnings, 0);
  const totalCommission = technicianSummaries.reduce((sum, t) => sum + t.totalCommission, 0);
  const totalBaseSalary = technicianSummaries.reduce((sum, t) => sum + t.baseSalary, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-3"></div>
          <p className="text-gray-600">Loading payments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Technician Payments</h2>
          <p className="text-gray-600">Manage technician commissions (10% of bill amount per job)</p>
        </div>
        {payments.length === 0 && (
          <Button
            onClick={handleCreatePaymentsForCompletedJobs}
            disabled={isCreatingPayments}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isCreatingPayments ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Payments for Completed Jobs
              </>
            )}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Base Salary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">INR {totalBaseSalary.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Commission (10%)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">INR {totalCommission.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">INR {totalPending.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">INR {totalPaid.toFixed(2)}</div>
            <div className="text-xs text-gray-500 mt-1">Base + Commission</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search by technician name, employee ID, or job number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            setNewPaymentFormData({
              technician_id: '',
              job_id: '',
              bill_amount: '',
              commission_amount: '',
              payment_status: 'PENDING'
            });
            setAddPaymentDialogOpen(true);
          }}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Payment
        </Button>
      </div>

      {/* Technician Summaries */}
      <Card>
        <CardHeader>
          <CardTitle>Technician Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Base Salary</TableHead>
                  <TableHead>Total Jobs</TableHead>
                  <TableHead>Total Commission (10%)</TableHead>
                  <TableHead>Total Earnings</TableHead>
                  <TableHead>Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicianSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-4">
                        <DollarSign className="w-12 h-12 text-gray-400" />
                        <div>
                          <p className="text-gray-600 font-medium">No payment records found</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Payment records are automatically created when jobs are completed with payment amounts.
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            Click the button above to create payment records for existing completed jobs (10% commission).
                          </p>
                        </div>
                        <Button
                          onClick={handleCreatePaymentsForCompletedJobs}
                          disabled={isCreatingPayments}
                          className="bg-blue-600 hover:bg-blue-700 text-white mt-2"
                        >
                          {isCreatingPayments ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Creating Payments...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-2" />
                              Create Payments for Completed Jobs
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  technicianSummaries.map((summary) => (
                    <TableRow key={summary.technicianId}>
                      <TableCell className="font-medium">{summary.technicianName}</TableCell>
                      <TableCell>{summary.employeeId}</TableCell>
                      <TableCell className="font-semibold">INR {summary.baseSalary.toFixed(2)}</TableCell>
                      <TableCell>{summary.totalJobs}</TableCell>
                      <TableCell className="font-semibold">INR {summary.totalCommission.toFixed(2)}</TableCell>
                      <TableCell className="text-green-600 font-semibold">
                        INR {summary.totalEarnings.toFixed(2)}
                        <div className="text-xs text-gray-500 font-normal">
                          (Base: INR {summary.baseSalary.toFixed(2)} + Commission: INR {summary.paidCommission.toFixed(2)})
                        </div>
                      </TableCell>
                      <TableCell className="text-orange-600">INR {summary.pendingEarnings.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead>Job Number</TableHead>
                  <TableHead>Bill Amount</TableHead>
                  <TableHead>Commission (10%)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.length === 0 && payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-4">
                        <DollarSign className="w-12 h-12 text-gray-400" />
                        <div>
                          <p className="text-gray-600 font-medium">No payment records found</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Payment records are automatically created when jobs are completed with payment amounts.
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            Click the button above to create payment records for existing completed jobs (10% commission).
                          </p>
                        </div>
                        <Button
                          onClick={handleCreatePaymentsForCompletedJobs}
                          disabled={isCreatingPayments}
                          className="bg-blue-600 hover:bg-blue-700 text-white mt-2"
                        >
                          {isCreatingPayments ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Creating Payments...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-2" />
                              Create Payments for Completed Jobs
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredPayments.length === 0 && payments.length > 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      No payments match your search criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        {payment.technician?.full_name || 'Unknown'}
                      </TableCell>
                      <TableCell>{payment.job?.job_number || 'N/A'}</TableCell>
                      <TableCell>INR {payment.bill_amount.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">
                        INR {payment.commission_amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            payment.payment_status === 'PAID'
                              ? 'bg-green-100 text-green-800'
                              : payment.payment_status === 'PENDING'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-gray-100 text-gray-800'
                          }
                        >
                          {payment.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {payment.payment_date
                          ? new Date(payment.payment_date).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {payment.payment_status === 'PENDING' && (
                            <Button
                              size="sm"
                              onClick={() => handleMarkAsPaid(payment)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              Mark as Paid
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              if (confirm('Are you sure you want to delete this payment record?')) {
                                try {
                                  const { error } = await supabase
                                    .from('technician_payments')
                                    .delete()
                                    .eq('id', payment.id);
                                  
                                  if (error) {
                                    toast.error('Failed to delete payment: ' + error.message);
                                  } else {
                                    toast.success('Payment deleted');
                                    await loadPayments();
                                  }
                                } catch (error: any) {
                                  toast.error('Error deleting payment: ' + error.message);
                                }
                              }
                            }}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Payment as Paid</DialogTitle>
            <DialogDescription>
              Record payment details for {selectedPayment?.technician?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Job Number:</span>
                  <div className="font-medium">{selectedPayment?.job?.job_number}</div>
                </div>
                <div>
                  <span className="text-gray-600">Commission Amount:</span>
                  <div className="font-medium">INR {selectedPayment?.commission_amount.toFixed(2)}</div>
                </div>
              </div>
            </div>
            
            <div>
              <Label htmlFor="payment_method">Payment Method</Label>
              <Select
                value={paymentFormData.payment_method}
                onValueChange={(value) => setPaymentFormData({ ...paymentFormData, payment_method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="payment_reference">Payment Reference</Label>
              <Input
                id="payment_reference"
                value={paymentFormData.payment_reference}
                onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_reference: e.target.value })}
                placeholder="Transaction ID, UPI reference, etc."
              />
            </div>
            
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={paymentFormData.notes}
                onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
                placeholder="Additional notes (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitPayment} className="bg-green-600 hover:bg-green-700">
              Mark as Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog */}
      <Dialog open={addPaymentDialogOpen} onOpenChange={setAddPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Payment Record</DialogTitle>
            <DialogDescription>
              Manually create a payment record for a technician
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="add-technician">Technician *</Label>
              <Select
                value={newPaymentFormData.technician_id}
                onValueChange={(value) => setNewPaymentFormData({ ...newPaymentFormData, technician_id: value })}
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
              <Label htmlFor="add-job">Job (Optional)</Label>
              <Select
                value={newPaymentFormData.job_id}
                onValueChange={(value) => {
                  const selectedJob = jobs.find(j => j.id === value);
                  setNewPaymentFormData({ 
                    ...newPaymentFormData, 
                    job_id: value,
                    bill_amount: selectedJob ? (selectedJob.payment_amount || selectedJob.actual_cost || '').toString() : newPaymentFormData.bill_amount
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select job (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number || job.jobNumber} - INR {job.payment_amount || job.actual_cost || 0}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="add-bill-amount">Bill Amount (INR) *</Label>
              <Input
                id="add-bill-amount"
                type="number"
                min="0"
                step="0.01"
                value={newPaymentFormData.bill_amount}
                onChange={(e) => {
                  const billAmount = e.target.value;
                  const commissionAmount = billAmount ? (parseFloat(billAmount) * 0.10).toFixed(2) : '';
                  setNewPaymentFormData({ 
                    ...newPaymentFormData, 
                    bill_amount: billAmount,
                    commission_amount: commissionAmount
                  });
                }}
                placeholder="Enter bill amount"
              />
            </div>

            <div>
              <Label htmlFor="add-commission-amount">Commission Amount (INR) *</Label>
              <Input
                id="add-commission-amount"
                type="number"
                min="0"
                step="0.01"
                value={newPaymentFormData.commission_amount}
                onChange={(e) => setNewPaymentFormData({ ...newPaymentFormData, commission_amount: e.target.value })}
                placeholder="Auto-calculated (10%)"
              />
              <p className="text-xs text-gray-500 mt-1">10% of bill amount (can be edited)</p>
            </div>

            <div>
              <Label htmlFor="add-payment-status">Payment Status</Label>
              <Select
                value={newPaymentFormData.payment_status}
                onValueChange={(value: any) => setNewPaymentFormData({ ...newPaymentFormData, payment_status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddPayment}
              disabled={!newPaymentFormData.technician_id || !newPaymentFormData.bill_amount}
              className="bg-green-600 hover:bg-green-700"
            >
              Add Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TechnicianPayments;

