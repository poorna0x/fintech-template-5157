import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowLeft, Edit, Calendar, User, Phone, Mail, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AMCContract {
  id: string;
  customer_id: string;
  job_id?: string | null;
  start_date: string;
  end_date: string;
  years: number;
  includes_prefilter: boolean;
  additional_info?: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'RENEWED';
  created_at: string;
  updated_at: string;
  customers?: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
    customer_id: string;
    brand?: string;
    model?: string;
  };
}

export default function AMCPage() {
  const navigate = useNavigate();
  const [amcContracts, setAmcContracts] = useState<AMCContract[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAMC, setSelectedAMC] = useState<AMCContract | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit form state
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editYears, setEditYears] = useState<number>(1);
  const [editIncludesPrefilter, setEditIncludesPrefilter] = useState(false);
  const [editAdditionalInfo, setEditAdditionalInfo] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'RENEWED'>('ACTIVE');
  // Customer details edit state
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerEmail, setEditCustomerEmail] = useState('');
  const [editCustomerBrand, setEditCustomerBrand] = useState('');
  const [editCustomerModel, setEditCustomerModel] = useState('');

  useEffect(() => {
    loadAMCContracts();
  }, []);

  const loadAMCContracts = async () => {
    try {
      setLoading(true);
      const { data, error } = await db.amcContracts.getAll(1000, 0);
      
      if (error) {
        console.error('Error loading AMC contracts:', error);
        toast.error('Failed to load AMC contracts');
        return;
      }
      
      setAmcContracts(data || []);
    } catch (error) {
      console.error('Error loading AMC contracts:', error);
      toast.error('Failed to load AMC contracts');
    } finally {
      setLoading(false);
    }
  };

  const filteredAMCs = amcContracts.filter(amc => {
    const customer = amc.customers;
    if (!customer) return false;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      customer.full_name.toLowerCase().includes(searchLower) ||
      customer.phone.includes(searchTerm) ||
      customer.email.toLowerCase().includes(searchLower) ||
      customer.customer_id.toLowerCase().includes(searchLower) ||
      amc.status.toLowerCase().includes(searchLower)
    );
  });

  const handleEdit = (amc: AMCContract) => {
    setSelectedAMC(amc);
    setEditStartDate(amc.start_date);
    setEditEndDate(amc.end_date);
    setEditYears(amc.years);
    setEditIncludesPrefilter(amc.includes_prefilter);
    setEditAdditionalInfo(amc.additional_info || '');
    setEditStatus(amc.status);
    // Set customer details
    if (amc.customers) {
      setEditCustomerPhone(amc.customers.phone || '');
      setEditCustomerEmail(amc.customers.email || '');
      setEditCustomerBrand(amc.customers.brand || '');
      setEditCustomerModel(amc.customers.model || '');
    }
    setEditDialogOpen(true);
  };

  const calculateEndDate = (startDate: string, years: number) => {
    if (!startDate) return '';
    const start = new Date(startDate);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + years);
    return end.toISOString().split('T')[0];
  };

  const handleStartDateChange = (date: string) => {
    setEditStartDate(date);
    setEditEndDate(calculateEndDate(date, editYears));
  };

  const handleYearsChange = (years: number) => {
    setEditYears(years);
    if (editStartDate) {
      setEditEndDate(calculateEndDate(editStartDate, years));
    }
  };

  const handleSave = async () => {
    if (!selectedAMC) return;
    
    if (!editStartDate || !editEndDate) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setIsSaving(true);
      
      // Update AMC contract
      const { error: amcError } = await db.amcContracts.update(selectedAMC.id, {
        start_date: editStartDate,
        end_date: editEndDate,
        years: editYears,
        includes_prefilter: editIncludesPrefilter,
        additional_info: editAdditionalInfo || null,
        status: editStatus
      });

      if (amcError) {
        throw amcError;
      }

      // Update customer details if changed
      if (selectedAMC.customers && selectedAMC.customers.id) {
        const customerUpdates: any = {};
        if (editCustomerPhone !== selectedAMC.customers.phone) {
          customerUpdates.phone = editCustomerPhone;
        }
        if (editCustomerEmail !== selectedAMC.customers.email) {
          customerUpdates.email = editCustomerEmail;
        }
        if (editCustomerBrand !== selectedAMC.customers.brand) {
          customerUpdates.brand = editCustomerBrand;
        }
        if (editCustomerModel !== selectedAMC.customers.model) {
          customerUpdates.model = editCustomerModel;
        }
        
        if (Object.keys(customerUpdates).length > 0) {
          const { error: customerError } = await db.customers.update(selectedAMC.customers.id, customerUpdates);
          if (customerError) {
            console.warn('Failed to update customer details:', customerError);
            toast.warning('AMC updated but customer details update failed');
          }
        }
      }

      toast.success('AMC contract updated successfully');
      setEditDialogOpen(false);
      setSelectedAMC(null);
      loadAMCContracts();
    } catch (error: any) {
      console.error('Error updating AMC contract:', error);
      toast.error(`Failed to update AMC contract: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'EXPIRED':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Expired</Badge>;
      case 'CANCELLED':
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      case 'RENEWED':
        return <Badge className="bg-blue-500"><CheckCircle className="w-3 h-3 mr-1" />Renewed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const isExpiringSoon = (endDate: string) => {
    const today = new Date();
    const end = new Date(endDate);
    const daysUntilExpiry = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Button
                variant="ghost"
                onClick={() => navigate('/admin')}
                className="mr-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Admin
              </Button>
              <h1 className="text-xl font-semibold text-gray-900">AMC Contracts</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by customer name, phone, email, customer ID, or status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAMCs.map((amc) => {
              const customer = amc.customers;
              const expiringSoon = isExpiringSoon(amc.end_date);
              
              return (
                <Card key={amc.id} className={`hover:shadow-lg transition-shadow ${expiringSoon && amc.status === 'ACTIVE' ? 'border-yellow-400 border-2' : ''}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-lg">
                          {customer?.full_name || 'Unknown Customer'}
                        </CardTitle>
                        {getStatusBadge(amc.status)}
                        {expiringSoon && amc.status === 'ACTIVE' && (
                          <Badge variant="outline" className="border-yellow-400 text-yellow-700">
                            Expiring Soon
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(amc)}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <User className="w-4 h-4 mr-2" />
                          <span className="font-medium">Customer ID:</span>
                          <span className="ml-2">{customer?.customer_id || 'N/A'}</span>
                        </div>
                        {customer?.phone && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Phone className="w-4 h-4 mr-2" />
                            {customer.phone}
                          </div>
                        )}
                        {customer?.email && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Mail className="w-4 h-4 mr-2" />
                            {customer.email}
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-2" />
                          <span className="font-medium">Start Date:</span>
                          <span className="ml-2">{formatDate(amc.start_date)}</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-2" />
                          <span className="font-medium">End Date:</span>
                          <span className="ml-2">{formatDate(amc.end_date)}</span>
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Duration:</span>
                          <span className="ml-2">{amc.years} year{amc.years !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Includes Prefilter:</span>
                          <span className="ml-2">
                            {amc.includes_prefilter ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                Yes
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-700">
                                No
                              </Badge>
                            )}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Additional Info:</span>
                          <p className="mt-1 text-gray-800 bg-gray-50 p-2 rounded min-h-[2rem]">
                            {amc.additional_info || <span className="text-gray-400 italic">No additional information</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && filteredAMCs.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No AMC contracts found</h3>
            <p className="text-gray-500">
              {searchTerm ? 'Try adjusting your search terms.' : 'No AMC contracts available.'}
            </p>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit AMC Contract</DialogTitle>
            <DialogDescription>
              Update AMC contract and customer details for {selectedAMC?.customers?.full_name || 'customer'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Customer Details Section */}
            <div className="border-b pb-4">
              <h3 className="font-semibold text-lg mb-3">Customer Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customerPhone">Phone *</Label>
                  <Input
                    id="customerPhone"
                    type="tel"
                    value={editCustomerPhone}
                    onChange={(e) => setEditCustomerPhone(e.target.value)}
                    placeholder="Enter phone number"
                  />
                </div>
                <div>
                  <Label htmlFor="customerEmail">Email *</Label>
                  <Input
                    id="customerEmail"
                    type="email"
                    value={editCustomerEmail}
                    onChange={(e) => setEditCustomerEmail(e.target.value)}
                    placeholder="Enter email"
                  />
                </div>
                <div>
                  <Label htmlFor="customerBrand">Brand</Label>
                  <Input
                    id="customerBrand"
                    type="text"
                    value={editCustomerBrand}
                    onChange={(e) => setEditCustomerBrand(e.target.value)}
                    placeholder="Enter brand"
                  />
                </div>
                <div>
                  <Label htmlFor="customerModel">Model</Label>
                  <Input
                    id="customerModel"
                    type="text"
                    value={editCustomerModel}
                    onChange={(e) => setEditCustomerModel(e.target.value)}
                    placeholder="Enter model"
                  />
                </div>
              </div>
            </div>

            {/* AMC Details Section */}
            <div>
              <h3 className="font-semibold text-lg mb-3">AMC Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={editStartDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="years">Duration (Years) *</Label>
                  <Select
                    value={editYears.toString()}
                    onValueChange={(value) => handleYearsChange(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Year</SelectItem>
                      <SelectItem value="2">2 Years</SelectItem>
                      <SelectItem value="3">3 Years</SelectItem>
                      <SelectItem value="4">4 Years</SelectItem>
                      <SelectItem value="5">5 Years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="mt-4">
                <Label htmlFor="endDate">End Date *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                />
              </div>
              
              <div className="mt-4">
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={editStatus}
                  onValueChange={(value) => setEditStatus(value as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    <SelectItem value="RENEWED">Renewed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="mt-4 flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includesPrefilter"
                  checked={editIncludesPrefilter}
                  onChange={(e) => setEditIncludesPrefilter(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="includesPrefilter" className="cursor-pointer">
                  Includes Prefilter
                </Label>
              </div>
              
              <div className="mt-4">
                <Label htmlFor="additionalInfo">Additional Info</Label>
                <Textarea
                  id="additionalInfo"
                  value={editAdditionalInfo}
                  onChange={(e) => setEditAdditionalInfo(e.target.value)}
                  placeholder="Enter any additional notes or information..."
                  rows={4}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setSelectedAMC(null);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
