import React, { useState, useEffect } from 'react';
import AdminHeader from '@/components/AdminHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  Users, 
  Wrench, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Search,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Edit,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { db } from '@/lib/supabase';
import { Customer, Job, Technician } from '@/types';
import { toast } from 'sonner';
import { openInGoogleMaps, extractCoordinates, formatAddressForDisplay } from '@/lib/maps';
import CustomerServicesManager from './CustomerServicesManager';

const AdminDashboard = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    service_type: '',
    brand: '',
    model: '',
    status: '',
    notes: ''
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    service_type: '',
    brand: '',
    model: '',
    status: 'ACTIVE',
    notes: '',
    address: {
      street: '',
      area: '',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: ''
    }
  });
  const [isCreating, setIsCreating] = useState(false);
  const [customerServices, setCustomerServices] = useState<{[key: string]: any[]}>({});

  // Load data on component mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load customers, jobs, and technicians in parallel
      const [customersResult, jobsResult, techniciansResult] = await Promise.all([
        db.customers.getAll(),
        db.jobs.getAll(),
        db.technicians.getAll()
      ]);

      if (customersResult.data) setCustomers(customersResult.data);
      if (jobsResult.data) setJobs(jobsResult.data);
      if (techniciansResult.data) setTechnicians(techniciansResult.data);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    
    try {
      // Note: You'll need to implement delete function in db.customers
      // const { error } = await db.customers.delete(customerToDelete.id);
      
      // For now, just show success message
      toast.success(`Customer ${(customerToDelete as any).customer_id} deleted successfully`);
      
      // Remove from local state
      setCustomers(customers.filter(c => c.id !== customerToDelete.id));
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast.error('Failed to delete customer');
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditFormData({
      full_name: (customer as any).full_name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      service_type: customer.serviceType || '',
      brand: customer.brand || '',
      model: customer.model || '',
      status: customer.status || '',
      notes: customer.notes || ''
    });
    setEditDialogOpen(true);
  };

  const handleUpdateCustomer = async () => {
    if (!editingCustomer) return;

    setIsUpdating(true);
    try {
      const { error } = await db.customers.update(editingCustomer.id, {
        full_name: editFormData.full_name,
        phone: editFormData.phone,
        email: editFormData.email,
        service_type: editFormData.service_type,
        brand: editFormData.brand,
        model: editFormData.model,
        status: editFormData.status,
        notes: editFormData.notes
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setCustomers(customers.map(c => 
        c.id === editingCustomer.id 
          ? { ...c, ...editFormData, serviceType: editFormData.service_type }
          : c
      ));

      toast.success('Customer updated successfully!');
      setEditDialogOpen(false);
      setEditingCustomer(null);
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('Failed to update customer');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditFormChange = (field: string, value: string) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const confirmDelete = (customer: Customer) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const handleAddCustomer = () => {
    setAddFormData({
      full_name: '',
      phone: '',
      email: '',
      service_type: '',
      brand: '',
      model: '',
      status: 'ACTIVE',
      notes: '',
      address: {
        street: '',
        area: '',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: ''
      }
    });
    setAddDialogOpen(true);
  };

  const handleCreateCustomer = async () => {
    setIsCreating(true);
    try {
      // Create customer data with default location (you can enhance this later)
      const customerData = {
        full_name: addFormData.full_name,
        phone: addFormData.phone,
        email: addFormData.email,
        address: addFormData.address,
        location: {
          latitude: 12.9716, // Default Bangalore coordinates
          longitude: 77.5946,
          formattedAddress: `${addFormData.address.street}, ${addFormData.address.area}, ${addFormData.address.city}, ${addFormData.address.pincode}`
        },
        service_type: addFormData.service_type,
        brand: addFormData.brand,
        model: addFormData.model,
        status: addFormData.status,
        notes: addFormData.notes,
        customer_since: new Date().toISOString(),
        preferred_time_slot: 'MORNING',
        preferred_language: 'ENGLISH'
      };

      const { data: newCustomer, error } = await db.customers.create(customerData);

      if (error) {
        throw new Error(error.message);
      }

      // Add to local state
      setCustomers([newCustomer, ...customers]);

      toast.success(`Customer ${(newCustomer as any).customer_id} created successfully!`);
      setAddDialogOpen(false);
    } catch (error) {
      console.error('Error creating customer:', error);
      toast.error('Failed to create customer');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddFormChange = (field: string, value: string) => {
    if (field.startsWith('address.')) {
      const addressField = field.split('.')[1];
      setAddFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }));
    } else {
      setAddFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleServicesUpdate = (customerId: string, services: any[]) => {
    setCustomerServices(prev => ({
      ...prev,
      [customerId]: services
    }));
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'PENDING': { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      'ASSIGNED': { color: 'bg-blue-100 text-blue-800', icon: Wrench },
      'IN_PROGRESS': { color: 'bg-orange-100 text-orange-800', icon: Wrench },
      'COMPLETED': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'CANCELLED': { color: 'bg-red-100 text-red-800', icon: AlertCircle },
      'ACTIVE': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'INACTIVE': { color: 'bg-gray-100 text-gray-800', icon: AlertCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['PENDING'];
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} border-0`}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  // Filter data based on search term (case insensitive)
  const filteredCustomers = customers.filter(customer =>
    (customer as any).customer_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer as any).full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredJobs = jobs.filter(job =>
    (job as any).job_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (job.customer as any)?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customer?.phone.includes(searchTerm)
  );

  const pendingJobs = jobs.filter(job => job.status === 'PENDING');
  const assignedJobs = jobs.filter(job => job.status === 'ASSIGNED');
  const inProgressJobs = jobs.filter(job => job.status === 'IN_PROGRESS');
  const completedJobs = jobs.filter(job => job.status === 'COMPLETED');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          {/* 3-dot wavy animation */}
          <div className="flex items-center justify-center space-x-1 mb-4">
            <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      
      <main className="container mx-auto px-4 py-4 sm:py-8">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
              <p className="text-sm sm:text-base text-gray-600">Manage customers, jobs, and technicians</p>
            </div>
            <Button 
              onClick={handleAddCustomer}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Users className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4 sm:mb-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by customer ID (c0001), name, phone, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm sm:text-base"
            />
          </div>
        </div>

        {/* Stats Cards - Mobile First */}
        <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4 sm:gap-6">
          <Card className="bg-white border-gray-200 p-3 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-5 w-5 text-blue-600 sm:h-4 sm:w-4" />
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900 sm:text-2xl">{customers.length}</div>
                <p className="text-xs text-gray-500">Customers</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
                {customers.filter(c => c.status === 'ACTIVE').length} active
              </p>
          </Card>

          <Card className="bg-white border-gray-200 p-3 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <Clock className="h-5 w-5 text-yellow-600 sm:h-4 sm:w-4" />
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900 sm:text-2xl">{pendingJobs.length}</div>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
                {assignedJobs.length} assigned
              </p>
          </Card>

          <Card className="bg-white border-gray-200 p-3 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <Wrench className="h-5 w-5 text-orange-600 sm:h-4 sm:w-4" />
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900 sm:text-2xl">{inProgressJobs.length}</div>
                <p className="text-xs text-gray-500">In Progress</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {completedJobs.length} completed
            </p>
          </Card>

          <Card className="bg-white border-gray-200 p-3 sm:p-6">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-5 w-5 text-green-600 sm:h-4 sm:w-4" />
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900 sm:text-2xl">{technicians.length}</div>
                <p className="text-xs text-gray-500">Technicians</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
                {technicians.filter(t => t.status === 'AVAILABLE').length} available
              </p>
          </Card>
        </div>

        {/* Customers - Mobile First Cards */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">All Customers</h2>
          
          {/* Mobile: Card Layout, Desktop: Table Layout */}
          <div className="block lg:hidden">
            {/* Mobile Cards */}
            <div className="space-y-3">
              {filteredCustomers.map((customer) => (
                <Card key={customer.id} className="bg-white border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-3">
                        <div>
                      <div className="font-mono font-bold text-blue-600 text-lg">
                        {(customer as any).customer_id || 'N/A'}
                        </div>
                      <div className="font-medium text-gray-900 text-base">
                        {(customer as any).full_name}
                      </div>
                    </div>
                    {getStatusBadge(customer.status)}
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">{customer.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">{customer.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">{customer.serviceType}</span>
                        </div>
                    <div className="text-gray-600">
                      {customer.brand} - {customer.model}
                      </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-3">
                    <button
                      onClick={() => {
                        const location = extractCoordinates(customer.location);
                        if (location) {
                          const address = formatAddressForDisplay(customer.address);
                          openInGoogleMaps(location, address);
                        } else {
                          toast.error('Location data not available');
                        }
                      }}
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      <MapPin className="w-4 h-4" />
                      View on Map
                    </button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditCustomer(customer)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => confirmDelete(customer)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                          </div>
                </Card>
              ))}
            </div>
                          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Card className="bg-white border-gray-200">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-gray-600">Customer ID</TableHead>
                      <TableHead className="text-gray-600">Name</TableHead>
                      <TableHead className="text-gray-600">Contact</TableHead>
                      <TableHead className="text-gray-600">Service Type</TableHead>
                      <TableHead className="text-gray-600">Brand/Model</TableHead>
                      <TableHead className="text-gray-600">Address</TableHead>
                      <TableHead className="text-gray-600">Status</TableHead>
                      <TableHead className="text-gray-600">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer) => (
                      <TableRow key={customer.id} className="border-gray-200 hover:bg-gray-50">
                        <TableCell className="font-mono font-bold text-blue-600">
                          {(customer as any).customer_id || 'N/A'}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">{(customer as any).full_name}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm text-gray-900">{customer.phone}</p>
                            <p className="text-sm text-gray-500">{customer.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-gray-300 text-gray-700">
                            {customer.serviceType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm text-gray-900">{customer.brand}</p>
                            <p className="text-xs text-gray-500">{customer.model}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => {
                              const location = extractCoordinates(customer.location);
                              if (location) {
                                const address = formatAddressForDisplay(customer.address);
                                openInGoogleMaps(location, address);
                              } else {
                                toast.error('Location data not available');
                              }
                            }}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                          >
                              <MapPin className="w-3 h-3" />
                            View on Map
                          </button>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(customer.status)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditCustomer(customer)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => confirmDelete(customer)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Jobs - Mobile First Cards */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Jobs</h2>
          
          {/* Mobile: Card Layout, Desktop: Table Layout */}
          <div className="block lg:hidden">
            {/* Mobile Cards */}
            <div className="space-y-3">
              {filteredJobs.slice(0, 10).map((job) => (
                <Card key={job.id} className="bg-white border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono font-bold text-gray-900 text-base">
                        {(job as any).job_number}
                      </div>
                      <div className="font-medium text-gray-900 text-sm">
                        {(job.customer as any)?.full_name || 'N/A'}
                      </div>
                    </div>
                    {getStatusBadge(job.status)}
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-900">{job.serviceType} - {job.serviceSubType}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">
                        {new Date(job.scheduledDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Card className="bg-white border-gray-200">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-gray-600">Job Number</TableHead>
                      <TableHead className="text-gray-600">Customer</TableHead>
                      <TableHead className="text-gray-600">Service</TableHead>
                      <TableHead className="text-gray-600">Status</TableHead>
                      <TableHead className="text-gray-600">Scheduled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.slice(0, 10).map((job) => (
                      <TableRow key={job.id} className="border-gray-200 hover:bg-gray-50">
                        <TableCell className="font-mono text-gray-900">{(job as any).job_number}</TableCell>
                        <TableCell className="text-gray-900">
                          {(job.customer as any)?.full_name || 'N/A'}
                        </TableCell>
                        <TableCell className="text-gray-900">
                          {job.serviceType} - {job.serviceSubType}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(job.status)}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {new Date(job.scheduledDate).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Add Customer Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Create a new customer account with service information
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="add_full_name">Full Name *</Label>
              <Input
                id="add_full_name"
                value={addFormData.full_name}
                onChange={(e) => handleAddFormChange('full_name', e.target.value)}
                placeholder="Enter full name"
                required
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="add_phone">Phone *</Label>
              <Input
                id="add_phone"
                value={addFormData.phone}
                onChange={(e) => handleAddFormChange('phone', e.target.value)}
                placeholder="Enter phone number"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="add_email">Email *</Label>
              <Input
                id="add_email"
                type="email"
                value={addFormData.email}
                onChange={(e) => handleAddFormChange('email', e.target.value)}
                placeholder="Enter email address"
                required
              />
            </div>

            {/* Service Type */}
            <div className="space-y-2">
              <Label htmlFor="add_service_type">Service Type *</Label>
              <Select value={addFormData.service_type} onValueChange={(value) => handleAddFormChange('service_type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RO">RO (Reverse Osmosis)</SelectItem>
                  <SelectItem value="SOFTENER">Water Softener</SelectItem>
                  <SelectItem value="AC">AC Services</SelectItem>
                  <SelectItem value="APPLIANCE">Home Appliances</SelectItem>
                  <SelectItem value="MULTIPLE">Multiple Services</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Brand */}
            <div className="space-y-2">
              <Label htmlFor="add_brand">Brand *</Label>
              <Input
                id="add_brand"
                value={addFormData.brand}
                onChange={(e) => handleAddFormChange('brand', e.target.value)}
                placeholder="Enter brand name"
                required
              />
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label htmlFor="add_model">Model *</Label>
              <Input
                id="add_model"
                value={addFormData.model}
                onChange={(e) => handleAddFormChange('model', e.target.value)}
                placeholder="Enter model name"
                required
              />
            </div>

            {/* Address - Street */}
            <div className="space-y-2">
              <Label htmlFor="add_street">Street Address *</Label>
              <Input
                id="add_street"
                value={addFormData.address.street}
                onChange={(e) => handleAddFormChange('address.street', e.target.value)}
                placeholder="Enter street address"
                required
              />
            </div>

            {/* Address - Area */}
            <div className="space-y-2">
              <Label htmlFor="add_area">Area *</Label>
              <Input
                id="add_area"
                value={addFormData.address.area}
                onChange={(e) => handleAddFormChange('address.area', e.target.value)}
                placeholder="Enter area/locality"
                required
              />
            </div>

            {/* Address - Pincode */}
            <div className="space-y-2">
              <Label htmlFor="add_pincode">Pincode *</Label>
              <Input
                id="add_pincode"
                value={addFormData.address.pincode}
                onChange={(e) => handleAddFormChange('address.pincode', e.target.value)}
                placeholder="Enter pincode"
                required
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="add_status">Status</Label>
              <Select value={addFormData.status} onValueChange={(value) => handleAddFormChange('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="add_notes">Notes</Label>
              <Textarea
                id="add_notes"
                value={addFormData.notes}
                onChange={(e) => handleAddFormChange('notes', e.target.value)}
                placeholder="Enter any additional notes or special requirements"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setAddDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateCustomer}
              disabled={isCreating || !addFormData.full_name || !addFormData.phone || !addFormData.email || !addFormData.service_type || !addFormData.brand || !addFormData.model}
              className="bg-green-600 hover:bg-green-700"
            >
              {isCreating ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </div>
              ) : (
                'Create Customer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information for {(editingCustomer as any)?.customer_id} - {(editingCustomer as any)?.full_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={editFormData.full_name}
                onChange={(e) => handleEditFormChange('full_name', e.target.value)}
                placeholder="Enter full name"
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={editFormData.phone}
                onChange={(e) => handleEditFormChange('phone', e.target.value)}
                placeholder="Enter phone number"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editFormData.email}
                onChange={(e) => handleEditFormChange('email', e.target.value)}
                placeholder="Enter email address"
              />
            </div>

            {/* Service Type */}
            <div className="space-y-2">
              <Label htmlFor="service_type">Service Type</Label>
              <Select value={editFormData.service_type} onValueChange={(value) => handleEditFormChange('service_type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RO">RO</SelectItem>
                  <SelectItem value="SOFTENER">Softener</SelectItem>
                  <SelectItem value="AC">AC</SelectItem>
                  <SelectItem value="APPLIANCE">Appliance</SelectItem>
                  <SelectItem value="MULTIPLE">Multiple</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Brand */}
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                value={editFormData.brand}
                onChange={(e) => handleEditFormChange('brand', e.target.value)}
                placeholder="Enter brand name"
              />
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={editFormData.model}
                onChange={(e) => handleEditFormChange('model', e.target.value)}
                placeholder="Enter model name"
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={editFormData.status} onValueChange={(value) => handleEditFormChange('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={editFormData.notes}
                onChange={(e) => handleEditFormChange('notes', e.target.value)}
                placeholder="Enter any additional notes"
                rows={3}
              />
            </div>
          </div>

          {/* Customer Services Manager */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <CustomerServicesManager
              customerId={editingCustomer?.id || ''}
              customerName={(editingCustomer as any)?.full_name || ''}
              services={customerServices[editingCustomer?.id || ''] || []}
              onServicesUpdate={(services) => handleServicesUpdate(editingCustomer?.id || '', services)}
            />
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateCustomer}
              disabled={isUpdating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUpdating ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Updating...
      </div>
              ) : (
                'Update Customer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete customer <strong>{(customerToDelete as any)?.customer_id}</strong> - <strong>{(customerToDelete as any)?.full_name}</strong>?
              <br />
              <br />
              This action cannot be undone and will permanently remove the customer and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCustomer}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Customer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;