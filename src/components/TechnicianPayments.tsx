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
import { DollarSign, User, Plus, Trash2, Edit, TrendingDown, TrendingUp, RefreshCw } from 'lucide-react';
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

interface TechnicianSalaryBreakdown {
  technicianId: string;
  technicianName: string;
  employeeId: string;
  baseSalary: number;
  totalCommission: number;
  totalExtraCommission: number;
  totalExpenses: number;
  totalAdvances: number;
  totalSalary: number; // baseSalary + commission + extraCommission - advances
  payments: TechnicianPayment[];
  expenses: TechnicianExpense[];
  advances: TechnicianAdvance[];
  extraCommissions: TechnicianExtraCommission[];
}

const TechnicianPayments = () => {
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [salaryBreakdowns, setSalaryBreakdowns] = useState<TechnicianSalaryBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTechnician, setSelectedTechnician] = useState<string | null>(null);
  const [commissionPeriod, setCommissionPeriod] = useState<{ start: Date; end: Date } | null>(null);
  
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

  useEffect(() => {
    loadData();
  }, []);

  const getMonthlyDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // End date: Next month's 10th
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 10, 23, 59, 59, 999);
    
    // Start date: Today (will be adjusted to first record date if earlier)
    const startDate = new Date(today);
    
    return { startDate, endDate };
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load technicians
      const { data: techsData, error: techsError } = await db.technicians.getAll();
      if (techsError) throw techsError;
      setTechnicians(techsData || []);

      // Get monthly date range (today to next month's 10th)
      const { startDate, endDate } = getMonthlyDateRange();

      // Load all payments to find the first record date
      const { data: allPaymentsData, error: allPaymentsError } = await supabase
        .from('technician_payments')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);
      
      if (allPaymentsError) throw allPaymentsError;

      // Use first record date if it's earlier than today
      let actualStartDate = startDate;
      if (allPaymentsData && allPaymentsData.length > 0) {
        const firstRecordDate = new Date(allPaymentsData[0].created_at);
        firstRecordDate.setHours(0, 0, 0, 0);
        if (firstRecordDate < startDate) {
          actualStartDate = firstRecordDate;
        }
      }
      
      // Store commission period for display
      setCommissionPeriod({ start: actualStartDate, end: endDate });

      // Load payments for current period (from start date to next month's 10th)
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

      // Calculate breakdown for each technician
      const breakdowns: TechnicianSalaryBreakdown[] = (techsData || []).map((tech: any) => {
        const techId = tech.id;
        const baseSalary = tech.salary?.baseSalary || 0;
        
        // Get payments for this technician (only from current month cycle)
        const techPayments = (paymentsData || []).filter((p: TechnicianPayment) => p.technician_id === techId);
        const totalCommission = techPayments.reduce((sum, p) => sum + (p.commission_amount || 0), 0);
        
        // Get expenses for this technician
        const techExpenses = (expensesData || []).filter((e: TechnicianExpense) => e.technician_id === techId);
        const totalExpenses = techExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        
        // Get advances for this technician
        const techAdvances = (advancesData || []).filter((a: TechnicianAdvance) => a.technician_id === techId);
        const totalAdvances = techAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);
        
        // Get extra commissions for this technician
        const techExtraCommissions = (extraCommissionsData || []).filter((ec: TechnicianExtraCommission) => ec.technician_id === techId);
        const totalExtraCommission = techExtraCommissions.reduce((sum, ec) => sum + (ec.amount || 0), 0);
        
        // Calculate total salary: base + commission + extraCommission - advances (expenses don't reduce salary, they're for analytics only)
        const totalSalary = baseSalary + totalCommission + totalExtraCommission - totalAdvances;
        
        return {
          technicianId: techId,
          technicianName: tech.full_name || 'Unknown',
          employeeId: tech.employee_id || '',
          baseSalary,
          totalCommission,
          totalExtraCommission,
          totalExpenses,
          totalAdvances,
          totalSalary,
          payments: techPayments,
          expenses: techExpenses,
          advances: techAdvances,
          extraCommissions: techExtraCommissions
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
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Technician Payments</h2>
        <p className="text-gray-600">
          Manage technician salaries, commissions (10% per job), expenses, and advances
          {commissionPeriod && (
            <span className="text-sm text-gray-500 block mt-1">
              Commission period: {commissionPeriod.start.toLocaleDateString()} to {commissionPeriod.end.toLocaleDateString()}
            </span>
          )}
        </p>
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
                  <p className="text-sm text-gray-600 mb-1">Basic Salary</p>
                  <p className="text-xl font-semibold text-blue-600">INR {breakdown.baseSalary.toFixed(2)}</p>
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
                    <span>Basic Salary:</span>
                    <span className="font-medium">INR {breakdown.baseSalary.toFixed(2)}</span>
                  </div>
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
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mb-6">
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
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Expenses</h3>
                {breakdown.expenses.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded">No expenses recorded</p>
                ) : (
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
                )}
              </div>

              {/* Advances Table */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Advances</h3>
                {breakdown.advances.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded">No advances recorded</p>
                ) : (
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
                )}
              </div>

              {/* Extra Commissions Table */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Extra Commissions</h3>
                {breakdown.extraCommissions.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded">No extra commissions recorded</p>
                ) : (
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
                )}
              </div>

            </CardContent>
          </Card>
        ))}
      </div>

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
