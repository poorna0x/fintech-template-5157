import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Search, 
  Eye, 
  Calendar,
  User,
  FileText,
  Filter,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Edit,
  Trash2,
  RefreshCw,
  LogIn
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import AdminHeader from './AdminHeader';
import { useAuth } from '@/contexts/AuthContext';

interface AMCRecord {
  id: string;
  jobId: string;
  jobNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: any;
  serviceType: string;
  brand: string;
  model: string;
  dateGiven: string;
  endDate: string;
  years: number;
  includesPrefilter: boolean;
  additionalNotes?: string;
  amount?: number | string;
  servicePeriodMonths?: number | null;
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
}

interface AMCViewPageProps {
  onBack: () => void;
  onAMCDeleted?: () => void;
}

const AMCViewPage: React.FC<AMCViewPageProps> = ({ onBack, onAMCDeleted }) => {
  const { user } = useAuth();
  const [amcRecords, setAmcRecords] = useState<AMCRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED'>('ALL');
  const [selectedAMC, setSelectedAMC] = useState<AMCRecord | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [amcToDelete, setAmcToDelete] = useState<AMCRecord | null>(null);
  const [editFormData, setEditFormData] = useState({
    dateGiven: '',
    endDate: '',
    years: 1,
    includesPrefilter: false,
    additionalNotes: '',
    servicePeriodKind: '4' as '4' | '6' | 'custom' | 'no_auto',
    servicePeriodCustomMonths: 4,
  });

  useEffect(() => {
    loadAMCRecords();
  }, []);

  const loadAMCRecords = async () => {
    try {
      setLoading(true);
      const { data: amcContracts, error } = await db.amcContracts.getAll(1000, 0);

      if (error) {
        throw error;
      }

      // Transform AMC contracts to AMCRecord format
      const amcList: AMCRecord[] = [];
      
      if (amcContracts) {
        for (const amc of amcContracts) {
          const customer = (amc as any).customers;
          
          // Parse additional_info if it's a JSON string
          let metadata: any = {};
          let additionalNotes = '';
          let amcAmount: number | string | undefined = undefined;
          if (amc.additional_info) {
            try {
              if (typeof amc.additional_info === 'string') {
                metadata = JSON.parse(amc.additional_info);
                // Extract description and notes from metadata
                additionalNotes = metadata.description || metadata.notes || '';
                // Extract amount from metadata - check all possible field names (same as AdminDashboard)
                const agreedAmount = metadata.agreed_amount || metadata.agreed || null;
                const amcCost = metadata.amc_cost || null;
                const totalAmount = metadata.total_amount || null;
                const amount = metadata.amount || metadata.agreement_amount || metadata.amcAmount || null;
                // Prioritize: agreed_amount > amc_cost/total_amount > amount/agreement_amount/amcAmount > direct field
                amcAmount = agreedAmount || amcCost || totalAmount || amount || (amc as any).amount || undefined;
              } else {
                metadata = amc.additional_info;
                additionalNotes = metadata.description || metadata.notes || '';
                // Extract amount from metadata - check all possible field names
                const agreedAmount = metadata.agreed_amount || metadata.agreed || null;
                const amcCost = metadata.amc_cost || null;
                const totalAmount = metadata.total_amount || null;
                const amount = metadata.amount || metadata.agreement_amount || metadata.amcAmount || null;
                // Prioritize: agreed_amount > amc_cost/total_amount > amount/agreement_amount/amcAmount > direct field
                amcAmount = agreedAmount || amcCost || totalAmount || amount || (amc as any).amount || undefined;
            }
          } catch (e) {
              // If parsing fails, treat as plain text
              additionalNotes = amc.additional_info;
            }
          } else {
            // If no additional_info, check for direct amount field
            amcAmount = (amc as any).amount || undefined;
          }

          // Get job number from metadata (agreement_number) or use AMC ID
          const jobNumber = metadata.agreement_number || `AMC-${amc.id.slice(0, 8)}`;

            amcList.push({
            id: amc.id,
            jobId: amc.job_id || '',
            jobNumber: jobNumber,
            customerId: amc.customer_id,
            customerName: customer?.full_name || metadata.customer_name || 'Unknown',
            customerPhone: customer?.phone || metadata.customer_phone || '',
            customerEmail: customer?.email || metadata.customer_email || '',
            customerAddress: customer?.address || metadata.customer_address || {},
            serviceType: customer?.service_type || 'RO',
            brand: customer?.brand || metadata.brand || '',
            model: customer?.model || metadata.ro_model || '',
            dateGiven: amc.start_date,
            endDate: amc.end_date,
            years: amc.years,
            includesPrefilter: amc.includes_prefilter,
            additionalNotes: additionalNotes,
            amount: amcAmount,
            servicePeriodMonths: (amc as any).service_period_months ?? undefined,
            createdAt: amc.created_at,
            completedAt: null,
            completedBy: null,
            });
        }
      }

      // Sort by date given (newest first)
      amcList.sort((a, b) => {
        const dateA = new Date(a.dateGiven).getTime();
        const dateB = new Date(b.dateGiven).getTime();
        return dateB - dateA;
      });

      setAmcRecords(amcList);
    } catch (error: any) {
      console.error('Error loading AMC records:', error);
      toast.error('Failed to load AMC records: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const filteredAMCs = useMemo(() => {
    let filtered = amcRecords;

    // Filter by search term
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(amc =>
        amc.customerName.toLowerCase().includes(searchLower) ||
        amc.customerPhone.includes(searchTerm) ||
        amc.jobNumber.toLowerCase().includes(searchLower) ||
        amc.brand.toLowerCase().includes(searchLower) ||
        amc.model.toLowerCase().includes(searchLower)
      );
    }

    // Filter by status
    if (statusFilter !== 'ALL') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      filtered = filtered.filter(amc => {
        const endDate = new Date(amc.endDate);
        endDate.setHours(0, 0, 0, 0);
        
        if (statusFilter === 'ACTIVE') {
          return endDate >= today;
        } else if (statusFilter === 'EXPIRED') {
          return endDate < today;
        }
        return true;
      });
    }

    return filtered;
  }, [amcRecords, searchTerm, statusFilter]);

  const getAMCStatus = (endDate: string): 'ACTIVE' | 'EXPIRED' => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    return end >= today ? 'ACTIVE' : 'EXPIRED';
  };

  const handleViewAMC = (amc: AMCRecord) => {
    setSelectedAMC(amc);
    setViewDialogOpen(true);
  };

  const handleEditAMC = (amc: AMCRecord) => {
    setSelectedAMC(amc);
    const sp = amc.servicePeriodMonths;
    const kind = sp == null || sp === undefined ? '4' : sp === 0 ? 'no_auto' : sp === 4 ? '4' : sp === 6 ? '6' : 'custom';
    const customMonths = (sp != null && sp > 0 && sp !== 4 && sp !== 6) ? sp : 4;
    setEditFormData({
      dateGiven: amc.dateGiven,
      endDate: amc.endDate,
      years: amc.years,
      includesPrefilter: amc.includesPrefilter,
      additionalNotes: amc.additionalNotes || '',
      servicePeriodKind: kind,
      servicePeriodCustomMonths: customMonths,
    });
    setEditDialogOpen(true);
  };

  const handleDeleteAMC = (amc: AMCRecord) => {
    setAmcToDelete(amc);
    setDeleteDialogOpen(true);
  };

  const calculateEndDate = (startDate: string, years: number) => {
    const start = new Date(startDate);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + years);
    end.setDate(end.getDate() - 1); // Subtract 1 day
    return end.toISOString().split('T')[0];
  };

  const handleSaveEdit = async () => {
    if (!selectedAMC) return;

    try {
      // Calculate end date if years changed
      const endDate = editFormData.endDate || calculateEndDate(editFormData.dateGiven, editFormData.years);

      // Get the current AMC contract to preserve metadata
      const { data: currentAMC, error: getError } = await db.amcContracts.getById(selectedAMC.id);
      if (getError || !currentAMC) {
        throw new Error('AMC contract not found');
      }

      // Parse existing additional_info to preserve metadata
      let metadata: any = {};
      if (currentAMC.additional_info) {
        try {
          if (typeof currentAMC.additional_info === 'string') {
            metadata = JSON.parse(currentAMC.additional_info);
          } else {
            metadata = currentAMC.additional_info;
        }
      } catch (e) {
          // If parsing fails, create new metadata
          metadata = {};
        }
      }

      // Update description/notes in metadata
      metadata.description = editFormData.additionalNotes || null;
      metadata.notes = editFormData.additionalNotes || null;

      const servicePeriodMonths =
        editFormData.servicePeriodKind === 'no_auto' ? 0
          : editFormData.servicePeriodKind === '4' ? 4
          : editFormData.servicePeriodKind === '6' ? 6
          : Math.max(1, editFormData.servicePeriodCustomMonths);

      // Update AMC contract
      const { error: updateError } = await db.amcContracts.update(selectedAMC.id, {
        start_date: editFormData.dateGiven,
        end_date: endDate,
        years: editFormData.years,
        includes_prefilter: editFormData.includesPrefilter,
        additional_info: JSON.stringify(metadata),
        service_period_months: editFormData.servicePeriodKind === 'no_auto' ? 0 : servicePeriodMonths,
      });

      if (updateError) {
        throw updateError;
      }

      toast.success('AMC updated successfully');
      setEditDialogOpen(false);
      setSelectedAMC(null);
      loadAMCRecords(); // Reload records
    } catch (error: any) {
      console.error('Error updating AMC:', error);
      toast.error('Failed to update AMC: ' + (error.message || 'Unknown error'));
    }
  };

  const handleConfirmDelete = async () => {
    if (!amcToDelete) return;

    try {
      // Delete AMC contract from database
      const { error: deleteError } = await db.amcContracts.delete(amcToDelete.id);

      if (deleteError) {
        throw deleteError;
      }

      toast.success('AMC deleted successfully');
      setDeleteDialogOpen(false);
      setAmcToDelete(null);
      loadAMCRecords(); // Reload records
      onAMCDeleted?.(); // Refresh parent (e.g. dashboard green dot)
    } catch (error: any) {
      console.error('Error deleting AMC:', error);
      toast.error('Failed to delete AMC: ' + (error?.message || 'Unknown error'));
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-600">Loading AMC records...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Only show "sign in" when the app has no user (e.g. edge case). If you're signed in as admin, we always show the normal AMC view.
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-600 hover:text-gray-900 -ml-2 mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <Card className="max-w-lg mx-auto mt-8">
            <CardContent className="p-8 text-center">
              <LogIn className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Sign in to view AMC contracts</h3>
              <p className="text-gray-600 text-sm mb-4">
                Sign in with your admin account to view AMC contracts.
              </p>
              <Button onClick={() => window.location.reload()} variant="default">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload and sign in
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <div className="container mx-auto px-4 py-4 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 -ml-2 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">AMC Records</h1>
              <p className="text-sm text-gray-600 mt-1">
                View and manage all Annual Maintenance Contracts
              </p>
            </div>
            <div className="text-sm text-gray-600">
              Total: {filteredAMCs.length} AMC{filteredAMCs.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search by customer name, phone, job number, brand, model..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-full sm:w-48">
                <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All AMCs</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AMC Table */}
        {filteredAMCs.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No AMC records found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || statusFilter !== 'ALL'
                  ? 'Try adjusting your search or filters'
                  : 'No AMC agreements have been created yet'}
              </p>
              {!searchTerm && statusFilter === 'ALL' && (
                <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
                  If you see AMC contracts on another device (e.g. your phone), sign in with the <strong>same admin account</strong> on this device. Each browser or incognito window has its own sign-in.
                </p>
              )}
              <Button variant="outline" onClick={() => loadAMCRecords()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Job Number</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAMCs.map((amc) => {
                      const status = getAMCStatus(amc.endDate);
                      return (
                        <TableRow key={amc.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-gray-900">{amc.customerName}</div>
                              <div className="text-sm text-gray-500">{amc.customerPhone}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">{amc.jobNumber}</span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="text-sm font-medium">{amc.brand} {amc.model}</div>
                              <div className="text-xs text-gray-500">{amc.serviceType}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {amc.dateGiven ? new Date(amc.dateGiven).toLocaleDateString('en-IN') : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {amc.endDate ? new Date(amc.endDate).toLocaleDateString('en-IN') : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {amc.years} {amc.years === 1 ? 'year' : 'years'}
                            {amc.includesPrefilter && (
                              <Badge variant="outline" className="ml-2 text-xs">Prefilter</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                status === 'ACTIVE'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }
                            >
                              {status === 'ACTIVE' ? (
                                <><CheckCircle className="w-3 h-3 mr-1" /> Active</>
                              ) : (
                                <><XCircle className="w-3 h-3 mr-1" /> Expired</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewAMC(amc)}
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditAMC(amc)}
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteAMC(amc)}
                                title="Delete"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
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

        {/* View AMC Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>AMC Details</DialogTitle>
              <DialogDescription>
                View complete AMC agreement information
              </DialogDescription>
            </DialogHeader>
            {selectedAMC && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500">Customer Name</Label>
                    <p className="font-medium">{selectedAMC.customerName}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Phone</Label>
                    <p className="font-medium">{selectedAMC.customerPhone}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Email</Label>
                    <p className="font-medium">{selectedAMC.customerEmail || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Job Number</Label>
                    <p className="font-medium font-mono">{selectedAMC.jobNumber}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Service Type</Label>
                    <p className="font-medium">{selectedAMC.serviceType}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Brand & Model</Label>
                    <p className="font-medium">{selectedAMC.brand} {selectedAMC.model}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Start Date</Label>
                    <p className="font-medium">
                      {selectedAMC.dateGiven ? new Date(selectedAMC.dateGiven).toLocaleDateString('en-IN') : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">End Date</Label>
                    <p className="font-medium">
                      {selectedAMC.endDate ? new Date(selectedAMC.endDate).toLocaleDateString('en-IN') : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Duration</Label>
                    <p className="font-medium">
                      {selectedAMC.years} {selectedAMC.years === 1 ? 'year' : 'years'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Includes Prefilter</Label>
                    <p className="font-medium">{selectedAMC.includesPrefilter ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Status</Label>
                    <Badge
                      className={
                        getAMCStatus(selectedAMC.endDate) === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }
                    >
                      {getAMCStatus(selectedAMC.endDate) === 'ACTIVE' ? 'Active' : 'Expired'}
                    </Badge>
                  </div>
                  {selectedAMC.amount && (
                    <div>
                      <Label className="text-xs text-gray-500">AMC Amount</Label>
                      <p className="font-medium text-lg text-blue-600 font-semibold">
                        ₹{typeof selectedAMC.amount === 'number' 
                          ? selectedAMC.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : parseFloat(selectedAMC.amount.toString()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                </div>
                {typeof selectedAMC.customerAddress === 'object' && (
                  <div>
                    <Label className="text-xs text-gray-500">Address</Label>
                    <p className="font-medium">
                      {selectedAMC.customerAddress.street || ''}, {selectedAMC.customerAddress.area || ''}, {' '}
                      {selectedAMC.customerAddress.city || ''} - {selectedAMC.customerAddress.pincode || ''}
                    </p>
                  </div>
                )}
                {selectedAMC.additionalNotes && (
                  <div>
                    <Label className="text-xs text-gray-500 font-semibold">AMC Summary</Label>
                    <p className="font-medium whitespace-pre-wrap mt-1 p-3 bg-gray-50 rounded-md border border-gray-200">
                      {selectedAMC.additionalNotes}
                    </p>
                  </div>
                )}
                <div className="flex justify-end pt-4">
                  <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit AMC Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit AMC</DialogTitle>
              <DialogDescription>
                Update AMC agreement details
              </DialogDescription>
            </DialogHeader>
            {selectedAMC && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-date-given">Start Date *</Label>
                    <DatePicker
                        value={editFormData.dateGiven || undefined}
                        onChange={(newDate) => {
                          setEditFormData({
                            ...editFormData,
                            dateGiven: newDate,
                            endDate: newDate ? calculateEndDate(newDate, editFormData.years) : editFormData.endDate,
                          });
                        }}
                        placeholder="Pick date"
                        className="mt-1"
                      />
                  </div>
                  <div>
                    <Label htmlFor="edit-years">Duration (Years) *</Label>
                    <Input
                      id="edit-years"
                      type="number"
                      min="1"
                      value={editFormData.years}
                      onChange={(e) => {
                        const years = parseInt(e.target.value) || 1;
                        setEditFormData({
                          ...editFormData,
                          years,
                          endDate: editFormData.dateGiven ? calculateEndDate(editFormData.dateGiven, years) : editFormData.endDate,
                        });
                      }}
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="edit-end-date">End Date</Label>
                    <DatePicker
                        value={editFormData.endDate || undefined}
                        onChange={(v) => setEditFormData({ ...editFormData, endDate: v })}
                        placeholder="Pick date"
                        className="mt-1"
                      />
                    <p className="text-xs text-gray-500 mt-1">
                      Automatically calculated from start date and duration. You can override it manually.
                    </p>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="edit-includes-prefilter"
                        checked={editFormData.includesPrefilter}
                        onCheckedChange={(checked) =>
                          setEditFormData({ ...editFormData, includesPrefilter: checked === true })
                        }
                      />
                      <Label htmlFor="edit-includes-prefilter" className="cursor-pointer">
                        Includes Prefilter
                      </Label>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="edit-additional-notes">Description / Summary</Label>
                    <Textarea
                      id="edit-additional-notes"
                      value={editFormData.additionalNotes}
                      onChange={(e) => setEditFormData({ ...editFormData, additionalNotes: e.target.value })}
                      placeholder="Enter a description or summary of this AMC contract for future reference..."
                      rows={4}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Add a description or summary to help identify and understand this AMC contract in the future.
                    </p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-medium">AMC service period (auto job creation)</Label>
                    <Select
                      value={editFormData.servicePeriodKind}
                      onValueChange={(v: '4' | '6' | 'custom' | 'no_auto') =>
                        setEditFormData({ ...editFormData, servicePeriodKind: v })
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4">Every 4 months</SelectItem>
                        <SelectItem value="6">Every 6 months</SelectItem>
                        <SelectItem value="custom">Custom (months)</SelectItem>
                        <SelectItem value="no_auto">No auto</SelectItem>
                      </SelectContent>
                    </Select>
                    {editFormData.servicePeriodKind === 'custom' && (
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={editFormData.servicePeriodCustomMonths}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            servicePeriodCustomMonths: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                        className="mt-1"
                        placeholder="Months"
                      />
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={handleSaveEdit} className="flex-1">
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete AMC Record</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the AMC record for{' '}
                <strong>{amcToDelete?.customerName}</strong> (Job: {amcToDelete?.jobNumber})?
                <br />
                <br />
                This action cannot be undone. The AMC information will be removed from the job record.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default AMCViewPage;

