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
  const [customerJobs, setCustomerJobs] = useState<{[customerId: string]: Job[]}>({});
  const [loadingCustomerJobs, setLoadingCustomerJobs] = useState<{[customerId: string]: boolean}>({});
  const [selectedJobPhotos, setSelectedJobPhotos] = useState<{jobId: string, photos: string[], type: 'before' | 'after'} | null>(null);
  const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [deleteJobDialogOpen, setDeleteJobDialogOpen] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<{jobId: string, photoIndex: number, photoUrl: string} | null>(null);
  const [deletePhotoDialogOpen, setDeletePhotoDialogOpen] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{url: string, index: number, total: number} | null>(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

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
        fullName: editFormData.full_name,
        phone: editFormData.phone,
        alternatePhone: editFormData.alternate_phone,
        email: editFormData.email,
        serviceType: editFormData.service_types.join(', ') as 'RO' | 'SOFTENER' | 'AC' | 'APPLIANCE',
        brand: Object.values(editFormData.equipment).map(eq => eq.brand).join(', '),
        model: Object.values(editFormData.equipment).map(eq => eq.model).join(', '),
        preferredLanguage: (editFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
        status: editFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
        notes: editFormData.notes
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setCustomers(customers.map(c => 
        c.id === editingCustomer.id 
          ? { 
              ...c, 
              fullName: editFormData.full_name,
              alternatePhone: editFormData.alternate_phone,
              serviceType: editFormData.service_types.join(', ') as 'RO' | 'SOFTENER' | 'AC' | 'APPLIANCE',
              behavior: editFormData.behavior,
              preferredLanguage: (editFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
              status: editFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
              notes: editFormData.notes
            }
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
        // Don't set customer_id - let the database generate it using the function
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
        service_type: (() => {
          const selectedTypes = addFormData.service_types;
          console.log('Selected service types:', selectedTypes);
          
          // Valid service types that are supported by the database
          const validTypes = ['RO', 'SOFTENER', 'AC', 'APPLIANCE'];
          
          // Filter out any invalid service types
          const validSelectedTypes = selectedTypes.filter(type => validTypes.includes(type));
          console.log('Valid selected types:', validSelectedTypes);
          
          // Based on testing, only basic service types are allowed in the database
          if (validSelectedTypes.length === 0) return 'RO';
          if (validSelectedTypes.length === 1) return validSelectedTypes[0];
          
          // For multiple selections, use the first valid one
          return validSelectedTypes[0];
        })() as 'RO' | 'SOFTENER' | 'AC' | 'APPLIANCE',
        brand: Object.values(addFormData.equipment).map(eq => eq.brand).join(', '), // Join all brands
        model: Object.values(addFormData.equipment).map(eq => eq.model).join(', '), // Join all models
        preferred_language: (addFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
        status: addFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
        notes: addFormData.notes,
        customer_since: new Date().toISOString(),
        preferred_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING'
      };

      console.log('Final service_type:', customerData.service_type);
      console.log('Service type length:', customerData.service_type.length);
      console.log('Service type char codes:', Array.from(customerData.service_type).map(c => c.charCodeAt(0)));
      console.log('Customer data being sent:', customerData);

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

  // Load jobs for a specific customer
  const loadCustomerJobs = async (customerId: string) => {
    if (customerJobs[customerId] || loadingCustomerJobs[customerId]) return; // Already loaded or loading
    
    setLoadingCustomerJobs(prev => ({
      ...prev,
      [customerId]: true
    }));

    try {
      const { data, error } = await db.jobs.getByCustomerId(customerId);
      
      if (error) {
        console.error('Error loading customer jobs:', error);
        return;
      }

      setCustomerJobs(prev => ({
        ...prev,
        [customerId]: data?.slice(0, 3) || [] // Only keep 3 most recent jobs
      }));
    } catch (error) {
      console.error('Error loading customer jobs:', error);
    } finally {
      setLoadingCustomerJobs(prev => ({
        ...prev,
        [customerId]: false
      }));
    }
  };

  // Handle job status update
  const handleJobStatusUpdate = async (jobId: string, newStatus: string) => {
    try {
      const { error } = await db.jobs.update(jobId, { status: newStatus as 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED' });
      
      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setCustomerJobs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(customerId => {
          updated[customerId] = updated[customerId].map(job => 
            job.id === jobId ? { ...job, status: newStatus as any } : job
          );
        });
        return updated;
      });

      // Also update the main jobs state
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: newStatus as any } : job
      ));

      toast.success(`Job status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating job status:', error);
      toast.error('Failed to update job status');
    }
  };

  // Handle job deletion
  const handleDeleteJob = async () => {
    if (!jobToDelete) return;
    
    try {
      const { error } = await (db.jobs as any).delete(jobToDelete.id);
      
      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setJobs(prev => prev.filter(job => job.id !== jobToDelete.id));
      setCustomerJobs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(customerId => {
          updated[customerId] = updated[customerId].filter(job => job.id !== jobToDelete.id);
        });
        return updated;
      });

      toast.success(`Job ${(jobToDelete as any).job_number} deleted successfully`);
      setDeleteJobDialogOpen(false);
      setJobToDelete(null);
    } catch (error) {
      console.error('Error deleting job:', error);
      toast.error('Failed to delete job');
    }
  };

  // Handle customer status update
  const handleCustomerStatusUpdate = async (customerId: string, newStatus: 'ACTIVE' | 'INACTIVE' | 'BLOCKED') => {
    try {
      const { error } = await db.customers.update(customerId, { status: newStatus });
      
      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setCustomers(prev => prev.map(customer => 
        customer.id === customerId ? { ...customer, status: newStatus } : customer
      ));

      toast.success(`Customer status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating customer status:', error);
      toast.error('Failed to update customer status');
    }
  };

  // Open photo gallery
  const openPhotoGallery = (jobId: string, photos: string[], type: 'before' | 'after' | 'photos') => {
    try {
      // Ensure photos is an array and filter out invalid entries
      const validPhotos = Array.isArray(photos) 
        ? photos.filter(photo => photo && typeof photo === 'string' && photo.trim() !== '')
        : [];
      
      if (validPhotos.length === 0) {
        toast.info('No photos available for this job');
        return;
      }
      
      setSelectedJobPhotos({ jobId, photos: validPhotos, type: type as 'before' | 'after' });
      setPhotoGalleryOpen(true);
    } catch (error) {
      console.error('Error opening photo gallery:', error);
      toast.error('Failed to open photo gallery');
    }
  };

  // Handle photo deletion
  const handleDeletePhoto = (jobId: string, photoIndex: number, photoUrl: string) => {
    setPhotoToDelete({ jobId, photoIndex, photoUrl });
    setDeletePhotoDialogOpen(true);
  };

  // Open photo in full-screen viewer
  const openPhotoViewer = (photoUrl: string, photoIndex: number, totalPhotos: number) => {
    setSelectedPhoto({ url: photoUrl, index: photoIndex, total: totalPhotos });
    setPhotoViewerOpen(true);
  };

  // Navigate to previous photo
  const goToPreviousPhoto = () => {
    if (!selectedPhoto || !selectedJobPhotos) return;
    const newIndex = selectedPhoto.index > 0 ? selectedPhoto.index - 1 : selectedJobPhotos.photos.length - 1;
    setSelectedPhoto({ 
      url: selectedJobPhotos.photos[newIndex], 
      index: newIndex, 
      total: selectedJobPhotos.photos.length 
    });
  };

  // Navigate to next photo
  const goToNextPhoto = () => {
    if (!selectedPhoto || !selectedJobPhotos) return;
    const newIndex = selectedPhoto.index < selectedJobPhotos.photos.length - 1 ? selectedPhoto.index + 1 : 0;
    setSelectedPhoto({ 
      url: selectedJobPhotos.photos[newIndex], 
      index: newIndex, 
      total: selectedJobPhotos.photos.length 
    });
  };

  // Download photo
  const downloadPhoto = async (photoUrl: string, photoIndex: number) => {
    try {
      // For Cloudinary URLs, try to get the raw image URL
      let downloadUrl = photoUrl;
      
      // If it's a Cloudinary URL, try to get the raw version
      if (photoUrl.includes('cloudinary.com')) {
        // Remove any transformations and get the raw image
        downloadUrl = photoUrl.replace(/\/upload\/[^\/]*\//, '/upload/');
      }
      
      // Method 1: Try direct download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `photo-${photoIndex + 1}.jpg`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Download started');
    } catch (error) {
      console.error('Error downloading photo:', error);
      
      // Method 2: Fallback - open in new tab for manual save
      try {
        const newWindow = window.open(photoUrl, '_blank', 'noopener,noreferrer');
        if (newWindow) {
          toast.info('Photo opened in new tab. Right-click and "Save image as" to download.');
        } else {
          throw new Error('Popup blocked');
        }
      } catch (fallbackError) {
        console.error('Fallback download failed:', fallbackError);
        toast.error('Unable to download. Please right-click the photo and select "Save image as"');
      }
    }
  };

  // Copy photo link to clipboard
  const copyPhotoLink = async (photoUrl: string) => {
    try {
      await navigator.clipboard.writeText(photoUrl);
      toast.success('Photo link copied to clipboard');
    } catch (error) {
      console.error('Error copying link:', error);
      toast.error('Failed to copy link');
    }
  };

  // Confirm photo deletion
  const confirmDeletePhoto = async () => {
    if (!photoToDelete) return;
    
    setIsDeletingPhoto(true);
    try {
      // Find the job and determine if it's a before or after photo
      const job = jobs.find(j => j.id === photoToDelete.jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Get current photos
      const beforePhotos = Array.isArray((job as any).before_photos) ? (job as any).before_photos : [];
      const afterPhotos = Array.isArray((job as any).after_photos) ? (job as any).after_photos : [];
      
      // Determine which array contains the photo to delete
      let updatedBeforePhotos = [...beforePhotos];
      let updatedAfterPhotos = [...afterPhotos];
      let isBeforePhoto = false;
      
      // Check if photo exists in before_photos
      const beforePhotoIndex = beforePhotos.findIndex(photo => {
        const url = typeof photo === 'string' ? photo : photo?.secure_url;
        return url === photoToDelete.photoUrl;
      });
      
      if (beforePhotoIndex !== -1) {
        updatedBeforePhotos.splice(beforePhotoIndex, 1);
        isBeforePhoto = true;
      } else {
        // Check if photo exists in after_photos
        const afterPhotoIndex = afterPhotos.findIndex(photo => {
          const url = typeof photo === 'string' ? photo : photo?.secure_url;
          return url === photoToDelete.photoUrl;
        });
        
        if (afterPhotoIndex !== -1) {
          updatedAfterPhotos.splice(afterPhotoIndex, 1);
        } else {
          throw new Error('Photo not found in job');
        }
      }

      // Update the job in the database
      const { error } = await db.jobs.update(photoToDelete.jobId, {
        before_photos: updatedBeforePhotos,
        after_photos: updatedAfterPhotos
      });

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setJobs(prev => prev.map(j => 
        j.id === photoToDelete.jobId 
          ? { ...j, before_photos: updatedBeforePhotos, after_photos: updatedAfterPhotos }
          : j
      ));

      // Update customer jobs state
      setCustomerJobs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(customerId => {
          updated[customerId] = updated[customerId].map(job => 
            job.id === photoToDelete.jobId 
              ? { ...job, before_photos: updatedBeforePhotos, after_photos: updatedAfterPhotos }
              : job
          );
        });
        return updated;
      });

      // Update selected photos if this job is currently being viewed
      if (selectedJobPhotos && selectedJobPhotos.jobId === photoToDelete.jobId) {
        const updatedPhotos = selectedJobPhotos.photos.filter((_, index) => index !== photoToDelete.photoIndex);
        setSelectedJobPhotos({ ...selectedJobPhotos, photos: updatedPhotos });
        
        // Close gallery if no photos left
        if (updatedPhotos.length === 0) {
          setPhotoGalleryOpen(false);
        }
      }

      toast.success('Photo deleted successfully');
      setDeletePhotoDialogOpen(false);
      setPhotoToDelete(null);
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast.error('Failed to delete photo');
    } finally {
      setIsDeletingPhoto(false);
    }
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


  // Group all customers with their jobs (no filtering by status)
  const customersWithJobs = customers.map(customer => {
    const customerJobs = jobs
      .filter(job => {
        // Check both possible field names for customer ID
        const jobCustomerId = (job as any).customer_id || job.customerId;
        return jobCustomerId === customer.id;
      })
      .sort((a, b) => {
        const aDate = new Date((a as any).scheduled_date || a.scheduledDate).getTime();
        const bDate = new Date((b as any).scheduled_date || b.scheduledDate).getTime();
        return bDate - aDate; // Most recent first
      });
    
    return {
      customer,
      allJobs: customerJobs,
      upcomingJobs: customerJobs.filter(job => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status)),
      completedJobs: customerJobs.filter(job => job.status === 'COMPLETED'),
      cancelledJobs: customerJobs.filter(job => job.status === 'CANCELLED')
    };
  });


  const displayedCustomers = !searchTerm.trim()
    ? customersWithJobs
        .sort((a, b) => {
          const aDate = new Date(a.customer.createdAt).getTime();
          const bDate = new Date(b.customer.createdAt).getTime();
          return bDate - aDate;
        })
    : customersWithJobs.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      return (
        (item.customer as any).customer_id?.toLowerCase().includes(searchLower) ||
        (item.customer as any).full_name?.toLowerCase().includes(searchLower) ||
        item.customer.phone?.includes(searchTerm) ||
        item.customer.email?.toLowerCase().includes(searchLower)
      );
    });


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

        {/* All Customers */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">All Customers</h2>
          {!searchTerm.trim() && (
            <p className="text-xs text-gray-500 mb-3">
              Showing {displayedCustomers.length} customers
            </p>
          )}
          
          {/* Customer Cards with Jobs */}
          <div className="space-y-8">
            {displayedCustomers.map(({ customer, allJobs, upcomingJobs, completedJobs, cancelledJobs }) => (
              <Card key={customer.id} className="bg-white border-2 border-gray-300 shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden mb-6">
                {/* Customer Header */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 sm:p-6 border-b-2 border-gray-300">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2">
                        <div className="font-mono font-bold text-blue-600 text-base sm:text-lg truncate">
                        {(customer as any).customer_id || 'N/A'}
                        </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                          <MoreVertical className="h-4 w-4" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditCustomer(customer)}>
                          <Edit className="mr-2 h-4 w-4" />
                              Edit Customer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                          </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-sm">
                          <div>
                          <div className="font-medium text-gray-900 truncate">{(customer as any).full_name}</div>
                          <div className="text-gray-600 truncate">{customer.phone}</div>
                            {(customer as any).alternate_phone && (
                            <div className="text-gray-500 truncate">{(customer as any).alternate_phone}</div>
                            )}
                          </div>
                          <div>
                          <div className="text-gray-600 truncate">{customer.email}</div>
                          <div className="text-gray-500 truncate">{customer.serviceType}</div>
                          </div>
                        <div>
                          <div className="text-gray-600 truncate">{customer.brand}</div>
                          <div className="text-gray-500 truncate">{customer.model}</div>
                        </div>
                        <div>
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
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">View on Map</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Jobs Section */}
                <div className="p-4 sm:p-6 bg-gray-50">
                  <div className="mb-4">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900">All Jobs ({allJobs.length})</h3>
                  </div>


                  {allJobs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Wrench className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>No jobs for this customer</p>
                    </div>
                  ) : (
                    <div className="space-y-3 sm:space-y-4">
                      {allJobs.map((job) => (
                        <Card key={job.id} className={`border-2 ${
                          job.status === 'PENDING' ? 'border-yellow-300 bg-yellow-50' :
                          job.status === 'ASSIGNED' ? 'border-blue-300 bg-blue-50' :
                          job.status === 'IN_PROGRESS' ? 'border-orange-300 bg-orange-50' :
                          job.status === 'COMPLETED' ? 'border-green-300 bg-green-50' :
                          job.status === 'CANCELLED' ? 'border-red-300 bg-red-50' :
                          'border-gray-300 bg-gray-50'
                        } shadow-md hover:shadow-lg transition-shadow duration-200`}>
                          <div className="p-3 sm:p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                                  <span className="font-mono font-bold text-gray-900 text-base sm:text-lg truncate">
                                    {(job as any).job_number}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {getStatusBadge(job.status)}
                                    <span className="text-xs sm:text-sm text-gray-600 truncate">
                                      {(job as any).service_type || job.serviceType} - {(job as any).service_sub_type || job.serviceSubType}
                                    </span>
                                  </div>
                                  {(() => {
                                    const beforePhotos = Array.isArray((job as any).before_photos) ? (job as any).before_photos : [];
                                    const afterPhotos = Array.isArray((job as any).after_photos) ? (job as any).after_photos : [];
                                    
                                    // Extract URLs from Cloudinary objects or use as-is if already strings
                                    const extractPhotoUrls = (photos: any[]) => {
                                      return photos.map(photo => {
                                        if (typeof photo === 'string') {
                                          return photo;
                                        } else if (photo && typeof photo === 'object' && photo.secure_url) {
                                          return photo.secure_url;
                                        }
                                        return null;
                                      }).filter(url => url !== null);
                                    };
                                    
                                    const allPhotos = [...extractPhotoUrls(beforePhotos), ...extractPhotoUrls(afterPhotos)];
                                    
                                    return allPhotos.length > 0 && (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                        📸 Photos ({allPhotos.length})
                                      </span>
                                    );
                                  })()}
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-sm">
                                  <div>
                                    <div className="font-medium text-gray-700">Scheduled</div>
                                    <div className="text-gray-600">
                                      {new Date((job as any).scheduled_date || job.scheduledDate).toLocaleDateString()} - {(job as any).scheduled_time_slot || job.scheduledTimeSlot}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="font-medium text-gray-700">Equipment</div>
                                    <div className="text-gray-600">{job.brand} - {job.model}</div>
                                  </div>
                                  <div>
                                    <div className="font-medium text-gray-700">Description</div>
                                    <div className="text-gray-600 truncate">{job.description}</div>
                                  </div>
                                </div>

                                {/* Photos Section */}
                                {(() => {
                                  // Check for photos using the correct database field names
                                  const beforePhotos = Array.isArray((job as any).before_photos) ? (job as any).before_photos : [];
                                  const afterPhotos = Array.isArray((job as any).after_photos) ? (job as any).after_photos : [];
                                  
                                  // Extract URLs from Cloudinary objects or use as-is if already strings
                                  const extractPhotoUrls = (photos: any[]) => {
                                    return photos.map(photo => {
                                      if (typeof photo === 'string') {
                                        return photo;
                                      } else if (photo && typeof photo === 'object' && photo.secure_url) {
                                        return photo.secure_url;
                                      }
                                      return null;
                                    }).filter(url => url !== null);
                                  };
                                  
                                  // Combine all photos for display
                                  const allPhotos = [...extractPhotoUrls(beforePhotos), ...extractPhotoUrls(afterPhotos)];
                                  
                                  if (allPhotos.length > 0) {
                                    return (
                                      <div className="mt-3 pt-3 border-t border-gray-200">
                                        <button
                                          onClick={() => openPhotoGallery(job.id, allPhotos, 'photos')}
                                          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                                        >
                                          <Calendar className="w-4 h-4" />
                                          Photos ({allPhotos.length})
                                        </button>
                                      </div>
                                    );
                                  }
                                  
                                  return null;
                                })()}
                              </div>

                              {/* Job Actions */}
                              <div className="flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                    {job.status === 'PENDING' && (
                                      <DropdownMenuItem onClick={() => handleJobStatusUpdate(job.id, 'ASSIGNED')}>
                                        <Wrench className="mr-2 h-4 w-4" />
                                        Assign Job
                                      </DropdownMenuItem>
                                    )}
                                    {job.status === 'ASSIGNED' && (
                                      <DropdownMenuItem onClick={() => handleJobStatusUpdate(job.id, 'IN_PROGRESS')}>
                                        <Clock className="mr-2 h-4 w-4" />
                                        Start Job
                                      </DropdownMenuItem>
                                    )}
                                    {job.status === 'IN_PROGRESS' && (
                                      <DropdownMenuItem onClick={() => handleJobStatusUpdate(job.id, 'COMPLETED')}>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Complete Job
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem 
                                      onClick={() => {
                                        toast.info('Job details feature coming soon');
                                      }}
                                    >
                                <Edit className="mr-2 h-4 w-4" />
                                      View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                      onClick={() => {
                                        setJobToDelete(job);
                                        setDeleteJobDialogOpen(true);
                                      }}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                      Delete Job
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
          </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
                  )}
          </div>
            </Card>
            ))}
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
                  {formErrors?.full_name && (
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
                    {formErrors?.phone && (
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
                  {formErrors?.email && (
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
                  {formErrors?.address && (
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
                  {formErrors?.service_types && (
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
                              {formErrors?.[`equipment.${serviceType}.brand`] && (
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
                              {formErrors?.[`equipment.${serviceType}.model`] && (
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
                      <p className="text-gray-900">{addFormData.full_name || 'Not provided'}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Phone:</span>
                      <p className="text-gray-900">{addFormData.phone || 'Not provided'}</p>
                    </div>
                    {addFormData.alternate_phone && (
                      <div>
                        <span className="font-medium text-gray-600">Alternate Phone:</span>
                        <p className="text-gray-900">{addFormData.alternate_phone}</p>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-600">Email:</span>
                      <p className="text-gray-900">{addFormData.email || 'Not provided'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-600">Address:</span>
                      <p className="text-gray-900">{addFormData.address || 'Not provided'}</p>
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
                    value={editFormData?.full_name || ''}
                    onChange={(e) => handleEditFormChange('full_name', e.target.value)}
                    placeholder="Enter full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_phone">Primary Phone</Label>
                  <Input
                    id="edit_phone"
                    value={editFormData?.phone || ''}
                    onChange={(e) => handleEditFormChange('phone', e.target.value)}
                    placeholder="Enter primary phone number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_alternate_phone">Alternate Phone</Label>
                  <Input
                    id="edit_alternate_phone"
                    value={editFormData?.alternate_phone || ''}
                    onChange={(e) => handleEditFormChange('alternate_phone', e.target.value)}
                    placeholder="Enter alternate phone number (optional)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editFormData?.email || ''}
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
                    { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                  ].map((service) => (
                    <div
                      key={service.value}
                      onClick={() => handleEditServiceTypeToggle(service.value)}
                      className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        editFormData?.service_types?.includes(service.value)
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
              {editFormData?.service_types?.length > 0 && (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Equipment Details</Label>
                  {editFormData?.service_types?.map((serviceType) => {
                    const serviceInfo = [
                      { value: 'RO', label: 'RO (Reverse Osmosis)', icon: '💧' },
                      { value: 'SOFTENER', label: 'Water Softener', icon: '🧂' },
                      { value: 'AC', label: 'AC Services', icon: '❄️' },
                      { value: 'APPLIANCE', label: 'Home Appliances', icon: '🏠' }
                    ].find(s => s.value === serviceType);
                    
                    const equipment = editFormData?.equipment?.[serviceType] || { brand: '', model: '' };
                    
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
                  <Select value={editFormData?.behavior || ''} onValueChange={(value) => handleEditFormChange('behavior', value)}>
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
                  <Select value={editFormData?.native_language || ''} onValueChange={(value) => handleEditFormChange('native_language', value)}>
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
                  value={editFormData?.notes || ''}
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

      {/* Delete Customer Confirmation Dialog */}
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

      {/* Delete Job Confirmation Dialog */}
      <AlertDialog open={deleteJobDialogOpen} onOpenChange={setDeleteJobDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete job <strong>{(jobToDelete as any)?.job_number}</strong>?
              <br />
              <br />
              This action cannot be undone and will permanently remove the job and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteJob}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Photo Confirmation Dialog */}
      <AlertDialog open={deletePhotoDialogOpen} onOpenChange={setDeletePhotoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo?
              <br />
              <br />
              This action cannot be undone and will permanently remove the photo from the job.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPhoto}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeletePhoto}
              disabled={isDeletingPhoto}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingPhoto ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Deleting...
                </div>
              ) : (
                'Delete Photo'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photo Gallery Dialog */}
      <Dialog open={photoGalleryOpen} onOpenChange={setPhotoGalleryOpen}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Job Photos
            </DialogTitle>
            <DialogDescription>
              Click on any photo to view it in full size or use the delete button to remove photos
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {selectedJobPhotos?.photos && Array.isArray(selectedJobPhotos.photos) && selectedJobPhotos.photos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {selectedJobPhotos.photos.map((photo, index) => {
                  // Check if photo is a valid URL
                  const isValidUrl = photo && typeof photo === 'string' && (photo.startsWith('http') || photo.startsWith('data:') || photo.startsWith('/'));
                  
                  return (
                    <div key={index} className="relative group">
                      {isValidUrl ? (
                        <img
                          src={photo}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-48 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (photo && photo.trim()) {
                              openPhotoViewer(photo, index, selectedJobPhotos.photos.length);
                            } else {
                              toast.error('Invalid photo URL');
                            }
                          }}
                          onError={(e) => {
                            console.error('Image failed to load:', photo);
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-48 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                          <div className="text-center text-gray-500">
                            <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">Invalid photo URL</p>
                            <p className="text-xs text-gray-400">{photo || 'No URL provided'}</p>
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (photo && photo.trim()) {
                                openPhotoViewer(photo, index, selectedJobPhotos.photos.length);
                              } else {
                                toast.error('Invalid photo URL');
                              }
                            }}
                          >
                            View Full Size
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePhoto((selectedJobPhotos as any)?.jobId, index, photo);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No photos available</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-Screen Photo Viewer Modal */}
      <Dialog open={photoViewerOpen} onOpenChange={setPhotoViewerOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black">
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 z-10 bg-black/50 text-white hover:bg-black/70"
              onClick={() => setPhotoViewerOpen(false)}
            >
              <span className="text-xl">×</span>
            </Button>

            {/* Previous button */}
            {selectedPhoto && selectedPhoto.total > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70"
                onClick={goToPreviousPhoto}
              >
                <span className="text-xl">‹</span>
              </Button>
            )}

            {/* Next button */}
            {selectedPhoto && selectedPhoto.total > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70"
                onClick={goToNextPhoto}
              >
                <span className="text-xl">›</span>
              </Button>
            )}

            {/* Photo counter */}
            {selectedPhoto && selectedPhoto.total > 1 && (
              <div className="absolute top-4 left-4 z-10 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                {selectedPhoto.index + 1} / {selectedPhoto.total}
              </div>
            )}

            {/* Action buttons */}
            {selectedPhoto && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadPhoto(selectedPhoto.url, selectedPhoto.index)}
                  className="bg-white/90 text-black hover:bg-white"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyPhotoLink(selectedPhoto.url)}
                  className="bg-white/90 text-black hover:bg-white border-gray-300"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setPhotoViewerOpen(false);
                    handleDeletePhoto((selectedJobPhotos as any)?.jobId, selectedPhoto.index, selectedPhoto.url);
                  }}
                  className="bg-red-600/90 text-white hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            )}

            {/* Main photo */}
            {selectedPhoto && (
              <img
                src={selectedPhoto.url}
                alt={`Photo ${selectedPhoto.index + 1}`}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  console.error('Image failed to load:', selectedPhoto.url);
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;