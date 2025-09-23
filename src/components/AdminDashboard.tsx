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
  MoreVertical,
  Plus
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
  const [searchQuery, setSearchQuery] = useState(''); // For the input field
  const [isSearching, setIsSearching] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone: '',
    alternate_phone: '',
    email: '',
    service_types: [] as string[],
    equipment: {} as {[serviceType: string]: {brand: string, model: string}},
    behavior: '',
    native_language: '',
    status: '',
    notes: ''
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    full_name: '',
    phone: '',
    alternate_phone: '',
    email: '',
    service_types: [] as string[], // Changed to array for multiple selection
    equipment: {} as {[serviceType: string]: {brand: string, model: string}}, // Equipment per service type
    behavior: '', // Customer behavior field
    native_language: '', // Customer native language field
    status: 'ACTIVE',
    notes: '',
    address: '', // Simplified to single address field
    google_location: '' // For Google Maps integration
  });
  const [currentStep, setCurrentStep] = useState(1);
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});
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
    
    // Parse service types from the stored string
    const serviceTypes = (customer as any).service_type ? 
      (customer as any).service_type.split(',').map((s: string) => s.trim()) : [];
    
    // Parse equipment from brands and models
    const equipment: {[serviceType: string]: {brand: string, model: string}} = {};
    if (serviceTypes.length > 0 && customer.brand && customer.model) {
      const brands = customer.brand.split(',').map((s: string) => s.trim());
      const models = customer.model.split(',').map((s: string) => s.trim());
      
      serviceTypes.forEach((serviceType: string, index: number) => {
        equipment[serviceType] = {
          brand: brands[index] || '',
          model: models[index] || ''
        };
      });
    }
    
    setEditFormData({
      full_name: (customer as any).full_name || '',
      phone: customer.phone || '',
      alternate_phone: (customer as any).alternate_phone || '',
      email: customer.email || '',
      service_types: serviceTypes,
      equipment: equipment,
      behavior: (customer as any).behavior || '',
      native_language: (customer as any).preferred_language || '',
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
        alternate_phone: editFormData.alternate_phone,
        email: editFormData.email,
        service_type: editFormData.service_types.join(', '),
        brand: Object.values(editFormData.equipment).map(eq => eq.brand).join(', '),
        model: Object.values(editFormData.equipment).map(eq => eq.model).join(', '),
        behavior: editFormData.behavior,
        preferred_language: editFormData.native_language || 'ENGLISH',
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

  const handleEditFormChange = (field: string, value: string | string[]) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEditServiceTypeToggle = (serviceType: string) => {
    setEditFormData(prev => {
      const newServiceTypes = prev.service_types.includes(serviceType)
        ? prev.service_types.filter(type => type !== serviceType)
        : [...prev.service_types, serviceType];
      
      // Initialize equipment for new service types
      const newEquipment = { ...prev.equipment };
      if (!prev.service_types.includes(serviceType)) {
        newEquipment[serviceType] = { brand: '', model: '' };
      } else {
        // Remove equipment data when service type is deselected
        delete newEquipment[serviceType];
      }
      
      return {
        ...prev,
        service_types: newServiceTypes,
        equipment: newEquipment
      };
    });
  };

  const handleEditEquipmentChange = (serviceType: string, field: 'brand' | 'model', value: string) => {
    setEditFormData(prev => ({
      ...prev,
      equipment: {
        ...prev.equipment,
        [serviceType]: {
          ...prev.equipment[serviceType],
          [field]: value
        }
      }
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
      alternate_phone: '',
      email: '',
      service_types: [],
      equipment: {},
      behavior: '',
      native_language: '',
      status: 'ACTIVE',
      notes: '',
      address: '',
      google_location: ''
    });
    setCurrentStep(1);
    setFormErrors({});
    setAddDialogOpen(true);
  };

  const handleCreateCustomer = async () => {
    if (!validateStep(4)) return; // Validate final step
    
    setIsCreating(true);
    try {
      // Create customer data with default location (you can enhance this later)
      const customerData = {
        full_name: addFormData.full_name,
        phone: addFormData.phone,
        alternate_phone: addFormData.alternate_phone,
        email: addFormData.email,
        address: {
          street: addFormData.address,
          area: '',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: ''
        },
        location: {
          latitude: 12.9716, // Default Bangalore coordinates
          longitude: 77.5946,
          formattedAddress: addFormData.address
        },
        service_type: addFormData.service_types.join(', '), // Join multiple service types
        brand: Object.values(addFormData.equipment).map(eq => eq.brand).join(', '), // Join all brands
        model: Object.values(addFormData.equipment).map(eq => eq.model).join(', '), // Join all models
        behavior: addFormData.behavior,
        preferred_language: addFormData.native_language || 'ENGLISH',
        status: addFormData.status,
        notes: addFormData.notes,
        customer_since: new Date().toISOString(),
        preferred_time_slot: 'MORNING'
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

  const handleAddFormChange = (field: string, value: string | string[]) => {
      setAddFormData(prev => ({
        ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateStep = (step: number): boolean => {
    const errors: {[key: string]: string} = {};
    
    switch (step) {
      case 1: // Personal Information
        if (!addFormData.full_name.trim()) errors.full_name = 'Full name is required';
        if (!addFormData.phone.trim()) errors.phone = 'Phone number is required';
        if (!addFormData.email.trim()) errors.email = 'Email is required';
        if (addFormData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addFormData.email)) {
          errors.email = 'Please enter a valid email address';
        }
        break;
      case 2: // Address Information
        if (!addFormData.address.trim()) errors.address = 'Address is required';
        break;
      case 3: // Service Information
        if (addFormData.service_types.length === 0) errors.service_types = 'Please select at least one service type';
        
        // Validate equipment for each selected service type
        addFormData.service_types.forEach(serviceType => {
          const equipment = addFormData.equipment[serviceType];
          if (!equipment?.brand?.trim()) {
            errors[`equipment.${serviceType}.brand`] = `Brand is required for ${serviceType}`;
          }
          if (!equipment?.model?.trim()) {
            errors[`equipment.${serviceType}.model`] = `Model is required for ${serviceType}`;
          }
        });
        break;
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleServiceTypeToggle = (serviceType: string) => {
    setAddFormData(prev => {
      const newServiceTypes = prev.service_types.includes(serviceType)
        ? prev.service_types.filter(type => type !== serviceType)
        : [...prev.service_types, serviceType];
      
      // Initialize equipment for new service types
      const newEquipment = { ...prev.equipment };
      if (!prev.service_types.includes(serviceType)) {
        newEquipment[serviceType] = { brand: '', model: '' };
    } else {
        // Remove equipment data when service type is deselected
        delete newEquipment[serviceType];
      }
      
      return {
        ...prev,
        service_types: newServiceTypes,
        equipment: newEquipment
      };
    });
    
    // Clear error when user selects a service type
    if (formErrors.service_types) {
      setFormErrors(prev => ({
        ...prev,
        service_types: ''
      }));
    }
  };

  const handleEquipmentChange = (serviceType: string, field: 'brand' | 'model', value: string) => {
      setAddFormData(prev => ({
        ...prev,
      equipment: {
        ...prev.equipment,
        [serviceType]: {
          ...prev.equipment[serviceType],
        [field]: value
        }
      }
    }));
    
    // Clear error when user starts typing
    const errorKey = `equipment.${serviceType}.${field}`;
    if (formErrors[errorKey]) {
      setFormErrors(prev => ({
        ...prev,
        [errorKey]: ''
      }));
    }
  };

  const handleGoogleMapsNavigation = () => {
    if (addFormData.address.trim()) {
      const encodedAddress = encodeURIComponent(addFormData.address);
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
      window.open(googleMapsUrl, '_blank');
    } else {
      toast.error('Please enter an address first');
    }
  };

  const handleSearch = () => {
    setIsSearching(true);
    setSearchTerm(searchQuery);
    // Small delay to show loading state
    setTimeout(() => {
      setIsSearching(false);
    }, 300);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchTerm('');
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
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
  const filteredCustomers = customers.filter(customer => {
    if (!searchTerm.trim()) return true; // Show all customers if search is empty
    
    const searchLower = searchTerm.toLowerCase();
    return (
      (customer as any).customer_id?.toLowerCase().includes(searchLower) ||
      (customer as any).full_name?.toLowerCase().includes(searchLower) ||
      customer.phone?.includes(searchTerm) ||
      (customer as any).alternate_phone?.includes(searchTerm) ||
      customer.email?.toLowerCase().includes(searchLower) ||
      (customer as any).preferred_language?.toLowerCase().includes(searchLower) ||
      customer.serviceType?.toLowerCase().includes(searchLower) ||
      customer.brand?.toLowerCase().includes(searchLower) ||
      customer.model?.toLowerCase().includes(searchLower) ||
      (customer as any).behavior?.toLowerCase().includes(searchLower) ||
      (customer.address as any)?.street?.toLowerCase().includes(searchLower) ||
      (customer.address as any)?.area?.toLowerCase().includes(searchLower) ||
      (customer.address as any)?.pincode?.includes(searchTerm)
    );
  });

  // Determine which customers to display by default (recently added)
  const RECENT_LIMIT = 25;
  const displayedCustomers = !searchTerm.trim()
    ? [...customers]
        .sort((a, b) => {
          const aDate = new Date(((a as any).created_at || (a as any).createdAt || 0) as any).getTime();
          const bDate = new Date(((b as any).created_at || (b as any).createdAt || 0) as any).getTime();
          return bDate - aDate;
        })
        .slice(0, RECENT_LIMIT)
    : filteredCustomers;

  const filteredJobs = jobs.filter(job => {
    if (!searchTerm.trim()) return true; // Show all jobs if search is empty
    
    const searchLower = searchTerm.toLowerCase();
    return (
      (job as any).job_number?.toLowerCase().includes(searchLower) ||
      (job.customer as any)?.full_name?.toLowerCase().includes(searchLower) ||
      job.customer?.phone?.includes(searchTerm)
    );
  });

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
          <div className="flex gap-2 w-full max-w-2xl">
            <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by customer ID, name, phone, email, language, behavior, service type, brand, model, area, pincode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleSearchKeyPress}
              className="pl-10 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm sm:text-base"
            />
          </div>
            <Button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4"
            >
              {isSearching ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span className="hidden sm:inline">Searching...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline">Search</span>
                </div>
              )}
            </Button>
            {searchTerm && (
              <Button
                onClick={handleClearSearch}
                variant="outline"
                className="border-gray-300 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">×</span>
                  <span className="hidden sm:inline">Clear</span>
                </div>
              </Button>
            )}
          </div>
          {searchTerm && (
            <div className="mt-2 text-sm text-gray-600">
              Showing results for: <span className="font-medium">"{searchTerm}"</span>
              <span className="ml-2 text-gray-500">
                ({filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''} found)
              </span>
            </div>
          )}
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
          <h2 className="text-xl font-bold text-gray-900 mb-1">Customers</h2>
          {!searchTerm.trim() && (
            <p className="text-xs text-gray-500 mb-3">Showing latest {displayedCustomers.length} recently added customers</p>
          )}
          
          {/* Mobile: Card Layout, Desktop: Table Layout */}
          <div className="block lg:hidden">
            {/* Mobile Cards */}
            <div className="space-y-3">
              {displayedCustomers.map((customer) => (
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
                    {(customer as any).alternate_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{(customer as any).alternate_phone}</span>
                      </div>
                    )}
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
                    {displayedCustomers.map((customer) => (
                      <TableRow key={customer.id} className="border-gray-200 hover:bg-gray-50">
                        <TableCell className="font-mono font-bold text-blue-600">
                          {(customer as any).customer_id || 'N/A'}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">{(customer as any).full_name}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm text-gray-900">{customer.phone}</p>
                            {(customer as any).alternate_phone && (
                              <p className="text-sm text-gray-500">{(customer as any).alternate_phone}</p>
                            )}
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

      {/* Add Customer Dialog - Step by Step */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                  {currentStep}
                </div>
                <span>Add New Customer</span>
              </div>
              <div className="flex gap-1 ml-auto">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`w-2 h-2 rounded-full ${
                      step <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </DialogTitle>
            <DialogDescription>
              {currentStep === 1 && "Enter customer's personal information"}
              {currentStep === 2 && "Enter customer's address details"}
              {currentStep === 3 && "Select services and equipment details"}
              {currentStep === 4 && "Review and confirm customer information"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {/* Step 1: Personal Information */}
            {currentStep === 1 && (
              <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add_full_name">Full Name *</Label>
              <Input
                id="add_full_name"
                value={addFormData.full_name}
                onChange={(e) => handleAddFormChange('full_name', e.target.value)}
                placeholder="Enter full name"
                    className={formErrors.full_name ? 'border-red-500' : ''}
              />
                  {formErrors.full_name && (
                    <p className="text-sm text-red-500">{formErrors.full_name}</p>
                  )}
            </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
                    <Label htmlFor="add_phone">Primary Phone *</Label>
              <Input
                id="add_phone"
                value={addFormData.phone}
                onChange={(e) => handleAddFormChange('phone', e.target.value)}
                      placeholder="Enter primary phone"
                      className={formErrors.phone ? 'border-red-500' : ''}
              />
                    {formErrors.phone && (
                      <p className="text-sm text-red-500">{formErrors.phone}</p>
                    )}
            </div>

            <div className="space-y-2">
                    <Label htmlFor="add_alternate_phone">Alternate Phone</Label>
              <Input
                      id="add_alternate_phone"
                      value={addFormData.alternate_phone}
                      onChange={(e) => handleAddFormChange('alternate_phone', e.target.value)}
                      placeholder="Enter alternate phone (optional)"
              />
            </div>
            </div>

            <div className="space-y-2">
                  <Label htmlFor="add_email">Email Address *</Label>
              <Input
                id="add_email"
                type="email"
                value={addFormData.email}
                onChange={(e) => handleAddFormChange('email', e.target.value)}
                placeholder="Enter email address"
                    className={formErrors.email ? 'border-red-500' : ''}
              />
                  {formErrors.email && (
                    <p className="text-sm text-red-500">{formErrors.email}</p>
                  )}
            </div>
            </div>
            )}

            {/* Step 2: Address Information */}
            {currentStep === 2 && (
              <div className="space-y-4">
            <div className="space-y-2">
                  <Label htmlFor="add_address">Complete Address *</Label>
                  <Textarea
                    id="add_address"
                    value={addFormData.address}
                    onChange={(e) => handleAddFormChange('address', e.target.value)}
                    placeholder="Enter complete address (street, area, city, state, pincode)"
                    rows={3}
                    className={formErrors.address ? 'border-red-500' : ''}
                  />
                  {formErrors.address && (
                    <p className="text-sm text-red-500">{formErrors.address}</p>
                  )}
            </div>

            <div className="space-y-2">
                  <Label htmlFor="add_google_location">Google Maps Location (Optional)</Label>
                  <div className="flex gap-2">
              <Input
                      id="add_google_location"
                      value={addFormData.google_location}
                      onChange={(e) => handleAddFormChange('google_location', e.target.value)}
                      placeholder="Enter Google Maps link or coordinates"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGoogleMapsNavigation}
                      disabled={!addFormData.address.trim()}
                      className="flex items-center gap-2 whitespace-nowrap"
                    >
                      <MapPin className="w-4 h-4" />
                      Open in Maps
                    </Button>
            </div>
                  <p className="text-xs text-gray-500">
                    Enter the address above, then click "Open in Maps" to navigate to the location
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Service Information */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label>Service Types *</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                      { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                      { value: 'AC', label: 'AC Services', icon: '❄️' },
                      { value: 'RO_AC', label: 'RO + AC Services', icon: '💧❄️' },
                      { value: 'SOFTENER_AC', label: 'Softener + AC', icon: '🧂❄️' },
                      { value: 'RO_SOFTENER', label: 'RO + Softener', icon: '💧🧂' },
                      { value: 'ALL_SERVICES', label: 'All Services', icon: '🔧' },
                      { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                    ].map((service) => (
                      <div
                        key={service.value}
                        onClick={() => handleServiceTypeToggle(service.value)}
                        className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                          addFormData.service_types.includes(service.value)
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{service.icon}</span>
                          <span className="text-sm font-medium">{service.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {formErrors.service_types && (
                    <p className="text-sm text-red-500">{formErrors.service_types}</p>
                  )}
                </div>

                {/* Dynamic Equipment Fields for Each Selected Service Type */}
                {addFormData.service_types.length > 0 && (
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Equipment Details *</Label>
                    {addFormData.service_types.map((serviceType) => {
                      const serviceInfo = [
                        { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                        { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                        { value: 'AC', label: 'AC Services', icon: '❄️' },
                        { value: 'RO_AC', label: 'RO + AC Services', icon: '💧❄️' },
                        { value: 'SOFTENER_AC', label: 'Softener + AC', icon: '🧂❄️' },
                        { value: 'RO_SOFTENER', label: 'RO + Softener', icon: '💧🧂' },
                        { value: 'ALL_SERVICES', label: 'All Services', icon: '🔧' },
                        { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                      ].find(s => s.value === serviceType);
                      
                      const equipment = addFormData.equipment[serviceType] || { brand: '', model: '' };
                      
                      return (
                        <div key={serviceType} className="bg-gray-50 p-4 rounded-lg space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{serviceInfo?.icon}</span>
                            <span className="font-medium text-gray-900">{serviceInfo?.label}</span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
                              <Label htmlFor={`brand_${serviceType}`}>Brand *</Label>
              <Input
                                id={`brand_${serviceType}`}
                                value={equipment.brand}
                                onChange={(e) => handleEquipmentChange(serviceType, 'brand', e.target.value)}
                                placeholder={`Enter ${serviceType} brand`}
                                className={formErrors[`equipment.${serviceType}.brand`] ? 'border-red-500' : ''}
                              />
                              {formErrors[`equipment.${serviceType}.brand`] && (
                                <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.brand`]}</p>
                              )}
            </div>

            <div className="space-y-2">
                              <Label htmlFor={`model_${serviceType}`}>Model *</Label>
              <Input
                                id={`model_${serviceType}`}
                                value={equipment.model}
                                onChange={(e) => handleEquipmentChange(serviceType, 'model', e.target.value)}
                                placeholder={`Enter ${serviceType} model`}
                                className={formErrors[`equipment.${serviceType}.model`] ? 'border-red-500' : ''}
                              />
                              {formErrors[`equipment.${serviceType}.model`] && (
                                <p className="text-sm text-red-500">{formErrors[`equipment.${serviceType}.model`]}</p>
                              )}
            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Review & Notes */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <h3 className="font-semibold text-gray-900">Customer Information Summary</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Name:</span>
                      <p className="text-gray-900">{addFormData.full_name}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Phone:</span>
                      <p className="text-gray-900">{addFormData.phone}</p>
                    </div>
                    {addFormData.alternate_phone && (
                      <div>
                        <span className="font-medium text-gray-600">Alternate Phone:</span>
                        <p className="text-gray-900">{addFormData.alternate_phone}</p>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-600">Email:</span>
                      <p className="text-gray-900">{addFormData.email}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-600">Address:</span>
                      <p className="text-gray-900">{addFormData.address}</p>
                      {addFormData.google_location && (
                        <div className="mt-1">
                          <span className="font-medium text-gray-600">Google Maps:</span>
                          <p className="text-blue-600 text-sm break-all">{addFormData.google_location}</p>
                        </div>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-600">Services & Equipment:</span>
                      <div className="mt-1 space-y-2">
                        {addFormData.service_types.map((serviceType) => {
                          const serviceInfo = [
                            { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                            { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                            { value: 'AC', label: 'AC Services', icon: '❄️' },
                            { value: 'RO_AC', label: 'RO + AC Services', icon: '💧❄️' },
                            { value: 'SOFTENER_AC', label: 'Softener + AC', icon: '🧂❄️' },
                            { value: 'RO_SOFTENER', label: 'RO + Softener', icon: '💧🧂' },
                            { value: 'ALL_SERVICES', label: 'All Services', icon: '🔧' },
                            { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                          ].find(s => s.value === serviceType);
                          
                          const equipment = addFormData.equipment[serviceType];
                          
                          return (
                            <div key={serviceType} className="flex items-center gap-2 text-sm">
                              <span>{serviceInfo?.icon}</span>
                              <span className="font-medium">{serviceInfo?.label}:</span>
                              <span className="text-gray-700">
                                {equipment?.brand} - {equipment?.model}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Native Language:</span>
                      <p className="text-gray-900">
                        {addFormData.native_language ? 
                          addFormData.native_language.charAt(0) + addFormData.native_language.slice(1).toLowerCase() :
                          'Not specified'}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Behavior:</span>
                      <p className="text-gray-900">
                        {addFormData.behavior ? 
                          addFormData.behavior.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) 
                          : 'Not specified'
                        }
                      </p>
                    </div>
                  </div>
            </div>

                <div className="space-y-2">
                  <Label htmlFor="add_behavior">Customer Behavior</Label>
                  <Select value={addFormData.behavior} onValueChange={(value) => handleAddFormChange('behavior', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer behavior pattern" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FRIENDLY">Friendly & Cooperative</SelectItem>
                      <SelectItem value="DEMANDING">Demanding & Particular</SelectItem>
                      <SelectItem value="QUIET">Quiet & Reserved</SelectItem>
                      <SelectItem value="CHATTY">Chatty & Social</SelectItem>
                      <SelectItem value="BUSY">Always Busy</SelectItem>
                      <SelectItem value="PUNCTUAL">Very Punctual</SelectItem>
                      <SelectItem value="FLEXIBLE">Flexible & Easy-going</SelectItem>
                      <SelectItem value="COMPLAINING">Tends to Complain</SelectItem>
                      <SelectItem value="SATISFIED">Always Satisfied</SelectItem>
                      <SelectItem value="NEGOTIATING">Price Negotiating</SelectItem>
                      <SelectItem value="TECH_SAVVY">Tech Savvy</SelectItem>
                      <SelectItem value="TRADITIONAL">Traditional Approach</SelectItem>
                      <SelectItem value="URGENT">Always Urgent</SelectItem>
                      <SelectItem value="PATIENT">Very Patient</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add_native_language">Native Language</Label>
                  <Select value={addFormData.native_language} onValueChange={(value) => handleAddFormChange('native_language', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select native language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENGLISH">English</SelectItem>
                      <SelectItem value="HINDI">Hindi</SelectItem>
                      <SelectItem value="KANNADA">Kannada</SelectItem>
                      <SelectItem value="TAMIL">Tamil</SelectItem>
                      <SelectItem value="TELUGU">Telugu</SelectItem>
                      <SelectItem value="MARATHI">Marathi</SelectItem>
                      <SelectItem value="GUJARATI">Gujarati</SelectItem>
                      <SelectItem value="BENGALI">Bengali</SelectItem>
                      <SelectItem value="PUNJABI">Punjabi</SelectItem>
                      <SelectItem value="URDU">Urdu</SelectItem>
                      <SelectItem value="MALAYALAM">Malayalam</SelectItem>
                      <SelectItem value="ODIA">Odia</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add_notes">Additional Notes</Label>
                  <Textarea
                    id="add_notes"
                    value={addFormData.notes}
                    onChange={(e) => handleAddFormChange('notes', e.target.value)}
                    placeholder="Enter any additional notes or special requirements"
                    rows={3}
                  />
                </div>

            </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <div className="flex gap-2">
              {currentStep > 1 && (
                <Button variant="outline" onClick={prevStep}>
                  Previous
                </Button>
              )}
            <Button 
              variant="outline" 
              onClick={() => setAddDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            </div>
            
            <div>
              {currentStep < 4 ? (
                <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700">
                  Next Step
                </Button>
              ) : (
            <Button 
              onClick={handleCreateCustomer}
                  disabled={isCreating}
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
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information for {(editingCustomer as any)?.customer_id} - {(editingCustomer as any)?.full_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_full_name">Full Name</Label>
                  <Input
                    id="edit_full_name"
                    value={editFormData.full_name}
                    onChange={(e) => handleEditFormChange('full_name', e.target.value)}
                    placeholder="Enter full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_phone">Primary Phone</Label>
                  <Input
                    id="edit_phone"
                    value={editFormData.phone}
                    onChange={(e) => handleEditFormChange('phone', e.target.value)}
                    placeholder="Enter primary phone number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_alternate_phone">Alternate Phone</Label>
                  <Input
                    id="edit_alternate_phone"
                    value={editFormData.alternate_phone}
                    onChange={(e) => handleEditFormChange('alternate_phone', e.target.value)}
                    placeholder="Enter alternate phone number (optional)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => handleEditFormChange('email', e.target.value)}
                    placeholder="Enter email address"
                  />
                </div>
              </div>
            </div>

            {/* Service Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Service Information</h3>
              
              <div className="space-y-3">
                <Label>Service Types</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                    { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                    { value: 'AC', label: 'AC Services', icon: '❄️' },
                    { value: 'RO_AC', label: 'RO + AC Services', icon: '💧❄️' },
                    { value: 'SOFTENER_AC', label: 'Softener + AC', icon: '🧂❄️' },
                    { value: 'RO_SOFTENER', label: 'RO + Softener', icon: '💧🧂' },
                    { value: 'ALL_SERVICES', label: 'All Services', icon: '🔧' },
                    { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                  ].map((service) => (
                    <div
                      key={service.value}
                      onClick={() => handleEditServiceTypeToggle(service.value)}
                      className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        editFormData.service_types.includes(service.value)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{service.icon}</span>
                        <span className="text-sm font-medium">{service.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Equipment Fields for Each Selected Service Type */}
              {editFormData.service_types.length > 0 && (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Equipment Details</Label>
                  {editFormData.service_types.map((serviceType) => {
                    const serviceInfo = [
                      { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                      { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                      { value: 'AC', label: 'AC Services', icon: '❄️' },
                      { value: 'RO_AC', label: 'RO + AC Services', icon: '💧❄️' },
                      { value: 'SOFTENER_AC', label: 'Softener + AC', icon: '🧂❄️' },
                      { value: 'RO_SOFTENER', label: 'RO + Softener', icon: '💧🧂' },
                      { value: 'ALL_SERVICES', label: 'All Services', icon: '🔧' },
                      { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                    ].find(s => s.value === serviceType);
                    
                    const equipment = editFormData.equipment[serviceType] || { brand: '', model: '' };
                    
                    return (
                      <div key={serviceType} className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{serviceInfo?.icon}</span>
                          <span className="font-medium text-gray-900">{serviceInfo?.label}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor={`edit_brand_${serviceType}`}>Brand</Label>
                            <Input
                              id={`edit_brand_${serviceType}`}
                              value={equipment.brand}
                              onChange={(e) => handleEditEquipmentChange(serviceType, 'brand', e.target.value)}
                              placeholder={`Enter ${serviceType} brand`}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`edit_model_${serviceType}`}>Model</Label>
                            <Input
                              id={`edit_model_${serviceType}`}
                              value={equipment.model}
                              onChange={(e) => handleEditEquipmentChange(serviceType, 'model', e.target.value)}
                              placeholder={`Enter ${serviceType} model`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Additional Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Additional Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_behavior">Customer Behavior</Label>
                  <Select value={editFormData.behavior} onValueChange={(value) => handleEditFormChange('behavior', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer behavior pattern" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FRIENDLY">Friendly & Cooperative</SelectItem>
                      <SelectItem value="DEMANDING">Demanding & Particular</SelectItem>
                      <SelectItem value="QUIET">Quiet & Reserved</SelectItem>
                      <SelectItem value="CHATTY">Chatty & Social</SelectItem>
                      <SelectItem value="BUSY">Always Busy</SelectItem>
                      <SelectItem value="PUNCTUAL">Very Punctual</SelectItem>
                      <SelectItem value="FLEXIBLE">Flexible & Easy-going</SelectItem>
                      <SelectItem value="COMPLAINING">Tends to Complain</SelectItem>
                      <SelectItem value="SATISFIED">Always Satisfied</SelectItem>
                      <SelectItem value="NEGOTIATING">Price Negotiating</SelectItem>
                      <SelectItem value="TECH_SAVVY">Tech Savvy</SelectItem>
                      <SelectItem value="TRADITIONAL">Traditional Approach</SelectItem>
                      <SelectItem value="URGENT">Always Urgent</SelectItem>
                      <SelectItem value="PATIENT">Very Patient</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_native_language">Native Language</Label>
                  <Select value={editFormData.native_language} onValueChange={(value) => handleEditFormChange('native_language', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select native language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENGLISH">English</SelectItem>
                      <SelectItem value="HINDI">Hindi</SelectItem>
                      <SelectItem value="KANNADA">Kannada</SelectItem>
                      <SelectItem value="TAMIL">Tamil</SelectItem>
                      <SelectItem value="TELUGU">Telugu</SelectItem>
                      <SelectItem value="MARATHI">Marathi</SelectItem>
                      <SelectItem value="GUJARATI">Gujarati</SelectItem>
                      <SelectItem value="BENGALI">Bengali</SelectItem>
                      <SelectItem value="PUNJABI">Punjabi</SelectItem>
                      <SelectItem value="URDU">Urdu</SelectItem>
                      <SelectItem value="MALAYALAM">Malayalam</SelectItem>
                      <SelectItem value="ODIA">Odia</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_notes">Notes</Label>
                <Textarea
                  id="edit_notes"
                  value={editFormData.notes}
                  onChange={(e) => handleEditFormChange('notes', e.target.value)}
                  placeholder="Enter any additional notes"
                  rows={3}
                />
              </div>
            </div>

            {/* Customer Services Manager */}
            <div className="pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Customer Services</h3>
                <Button
                  onClick={() => {
                    // Navigate to booking page with pre-filled customer data
                    const customerData = {
                      customerId: editingCustomer?.id,
                      customerName: (editingCustomer as any)?.full_name,
                      phone: editingCustomer?.phone,
                      email: editingCustomer?.email,
                      address: (editingCustomer as any)?.address || '',
                      serviceType: editFormData.service_types.join(', ') || 'RO'
                    };
                    // Store customer data in sessionStorage for pre-filling
                    sessionStorage.setItem('prefillCustomerData', JSON.stringify(customerData));
                    // Navigate to booking page
                    window.location.href = '/booking';
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Service
                </Button>
              </div>
              <CustomerServicesManager
                customerId={editingCustomer?.id || ''}
                customerName={(editingCustomer as any)?.full_name || ''}
                services={customerServices[editingCustomer?.id || ''] || []}
                onServicesUpdate={(services) => handleServicesUpdate(editingCustomer?.id || '', services)}
              />
            </div>
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