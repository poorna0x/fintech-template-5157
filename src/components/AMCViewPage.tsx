import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Search, 
  Download, 
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
  Trash2
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/supabase';
import { toast } from 'sonner';
import { generateAMCPDF } from '@/lib/amc-pdf-generator';
import { Bill } from '@/types';
import AdminHeader from './AdminHeader';

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
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
}

interface AMCViewPageProps {
  onBack: () => void;
}

const AMCViewPage: React.FC<AMCViewPageProps> = ({ onBack }) => {
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
  });

  useEffect(() => {
    loadAMCRecords();
  }, []);

  const loadAMCRecords = async () => {
    try {
      setLoading(true);
      const { data: jobs, error } = await db.jobs.getAll();

      if (error) {
        throw error;
      }

      // Extract AMC records from jobs
      const amcList: AMCRecord[] = [];
      
      if (jobs) {
        for (const job of jobs) {
          // Parse requirements to find AMC info
          let requirements: any[] = [];
          try {
            const reqData = (job as any).requirements || job.requirements;
            if (typeof reqData === 'string') {
              requirements = JSON.parse(reqData);
            } else if (Array.isArray(reqData)) {
              requirements = reqData;
            } else if (reqData && typeof reqData === 'object') {
              requirements = [reqData];
            }
          } catch (e) {
            requirements = [];
          }

          const amcInfo = requirements.find((r: any) => r?.amc_info)?.amc_info;
          
          if (amcInfo) {
            const customer = job.customer;
            amcList.push({
              id: `${job.id}-amc`,
              jobId: job.id || '',
              jobNumber: (job as any).job_number || job.jobNumber || 'N/A',
              customerId: job.customerId || (job as any).customer_id || '',
              customerName: customer?.fullName || customer?.full_name || 'Unknown',
              customerPhone: customer?.phone || '',
              customerEmail: customer?.email || '',
              customerAddress: customer?.address || {},
              serviceType: job.serviceType || (job as any).service_type || '',
              brand: job.brand || '',
              model: job.model || '',
              dateGiven: amcInfo.date_given || '',
              endDate: amcInfo.end_date || '',
              years: amcInfo.years || 1,
              includesPrefilter: amcInfo.includes_prefilter || false,
              additionalNotes: amcInfo.additional_notes || amcInfo.notes || '',
              createdAt: job.createdAt || (job as any).created_at || '',
              completedAt: job.completedAt || (job as any).completed_at || null,
              completedBy: (job as any).completed_by || job.completedBy || null,
            });
          }
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
      toast.error('Failed to load AMC records');
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
    setEditFormData({
      dateGiven: amc.dateGiven,
      endDate: amc.endDate,
      years: amc.years,
      includesPrefilter: amc.includesPrefilter,
      additionalNotes: amc.additionalNotes || '',
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

      // Get the job
      const { data: job, error: jobError } = await db.jobs.getById(selectedAMC.jobId);
      if (jobError || !job) {
        throw new Error('Job not found');
      }

      // Parse requirements
      let requirements: any[] = [];
      try {
        const reqData = (job as any).requirements || job.requirements;
        if (typeof reqData === 'string') {
          requirements = JSON.parse(reqData);
        } else if (Array.isArray(reqData)) {
          requirements = reqData;
        } else if (reqData && typeof reqData === 'object') {
          requirements = [reqData];
        }
      } catch (e) {
        requirements = [];
      }

      // Remove existing amc_info
      requirements = requirements.filter((req: any) => !req.amc_info);

      // Add updated AMC info
      requirements.push({
        amc_info: {
          date_given: editFormData.dateGiven,
          end_date: endDate,
          years: editFormData.years,
          includes_prefilter: editFormData.includesPrefilter,
          additional_notes: editFormData.additionalNotes || null,
          notes: editFormData.additionalNotes || null,
        },
      });

      // Update job
      const { error: updateError } = await db.jobs.update(selectedAMC.jobId, {
        requirements: requirements,
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
      // Get the job
      const { data: job, error: jobError } = await db.jobs.getById(amcToDelete.jobId);
      if (jobError || !job) {
        throw new Error('Job not found');
      }

      // Parse requirements
      let requirements: any[] = [];
      try {
        const reqData = (job as any).requirements || job.requirements;
        if (typeof reqData === 'string') {
          requirements = JSON.parse(reqData);
        } else if (Array.isArray(reqData)) {
          requirements = reqData;
        } else if (reqData && typeof reqData === 'object') {
          requirements = [reqData];
        }
      } catch (e) {
        requirements = [];
      }

      // Remove amc_info
      requirements = requirements.filter((req: any) => !req.amc_info);

      // Update job
      const { error: updateError } = await db.jobs.update(amcToDelete.jobId, {
        requirements: requirements,
      });

      if (updateError) {
        throw updateError;
      }

      toast.success('AMC deleted successfully');
      setDeleteDialogOpen(false);
      setAmcToDelete(null);
      loadAMCRecords(); // Reload records
    } catch (error: any) {
      console.error('Error deleting AMC:', error);
      toast.error('Failed to delete AMC: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDownloadAMC = async (amc: AMCRecord) => {
    try {
      // Create a Bill object from AMC record for PDF generation
      const bill: Bill = {
        id: amc.jobId,
        billNumber: `AMC-${amc.jobNumber}`,
        billDate: amc.dateGiven,
        company: {
          name: "Authorised Service Franchise",
          address: "Ground Floor, 13, 4th Main Road, Next To Jain Temple,Seshadripuram, Kumara Park West",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560020",
          phone: "9886944288 & 8884944288",
          email: "mail@hydrogenro.com",
          gstNumber: "29LIJPS5140P1Z6",
          panNumber: "LIJPS5140P",
          website: "hydrogenro.com"
        },
        customer: {
          id: amc.customerId,
          name: amc.customerName,
          address: typeof amc.customerAddress === 'string' ? amc.customerAddress : 
            `${amc.customerAddress?.street || ''}, ${amc.customerAddress?.area || ''}`,
          city: amc.customerAddress?.city || '',
          state: amc.customerAddress?.state || '',
          pincode: amc.customerAddress?.pincode || '',
          phone: amc.customerPhone,
          email: amc.customerEmail,
        },
        items: [],
        subtotal: 0,
        totalTax: 0,
        totalAmount: 0,
        paymentStatus: 'PAID',
        validity: `${amc.years} ${amc.years === 1 ? 'year' : 'years'}`,
        createdAt: amc.createdAt,
        updatedAt: amc.createdAt,
        serviceType: amc.serviceType as 'RO' | 'SOFTENER',
        jobId: amc.jobId,
      };

      generateAMCPDF(bill);
      toast.success('AMC PDF generated successfully');
    } catch (error) {
      console.error('Error generating AMC PDF:', error);
      toast.error('Failed to generate AMC PDF');
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
              <p className="text-gray-600">
                {searchTerm || statusFilter !== 'ALL'
                  ? 'Try adjusting your search or filters'
                  : 'No AMC agreements have been created yet'}
              </p>
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
                                onClick={() => handleDownloadAMC(amc)}
                                title="Download PDF"
                              >
                                <Download className="w-4 h-4" />
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
                    <Label className="text-xs text-gray-500">Additional Notes / Info</Label>
                    <p className="font-medium whitespace-pre-wrap mt-1 p-3 bg-gray-50 rounded-md">
                      {selectedAMC.additionalNotes}
                    </p>
                  </div>
                )}
                <div className="flex gap-2 pt-4">
                  <Button onClick={() => handleDownloadAMC(selectedAMC)} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Download AMC PDF
                  </Button>
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
                    <Input
                      id="edit-date-given"
                      type="date"
                      value={editFormData.dateGiven}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setEditFormData({
                          ...editFormData,
                          dateGiven: newDate,
                          endDate: newDate ? calculateEndDate(newDate, editFormData.years) : editFormData.endDate,
                        });
                      }}
                      required
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
                    <Input
                      id="edit-end-date"
                      type="date"
                      value={editFormData.endDate}
                      onChange={(e) => setEditFormData({ ...editFormData, endDate: e.target.value })}
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
                    <Label htmlFor="edit-additional-notes">Additional Notes / Info</Label>
                    <Textarea
                      id="edit-additional-notes"
                      value={editFormData.additionalNotes}
                      onChange={(e) => setEditFormData({ ...editFormData, additionalNotes: e.target.value })}
                      placeholder="Enter any additional notes, terms, or special instructions..."
                      rows={4}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Add any additional information, terms, or special instructions for this AMC.
                    </p>
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

