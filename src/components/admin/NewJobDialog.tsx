import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload } from 'lucide-react';
import { Customer } from '@/types';
import { toast } from 'sonner';
import { cloudinaryService, compressImage } from '@/lib/cloudinary';
import { generateJobNumber } from '@/lib/adminUtils';
import { db } from '@/lib/supabase';
import { createJobAssignedNotification, sendNotification } from '@/lib/notifications';

interface NewJobFormData {
  service_type: 'RO' | 'SOFTENER';
  service_sub_type: string;
  service_sub_type_custom: string;
  brand: string;
  model: string;
  scheduled_date: string;
  scheduled_time_slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';
  scheduled_time_custom: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigned_technician_id: string;
  cost_agreed: string;
  lead_source: string;
  lead_source_custom: string;
  photos: string[];
}

interface NewJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  technicians: any[];
  onJobCreated: (job: any) => void;
  onCustomerUpdated?: (customer: Customer) => void;
  onBrandsModelsReload?: () => Promise<void>;
  parseDbServiceType?: (serviceType: string) => string[];
}

const NewJobDialog: React.FC<NewJobDialogProps> = ({
  open,
  onOpenChange,
  customer,
  technicians,
  onJobCreated,
  onCustomerUpdated,
  onBrandsModelsReload,
  parseDbServiceType
}) => {
  const [isDragOverNewJob, setIsDragOverNewJob] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [newJobFormData, setNewJobFormData] = useState<NewJobFormData>({
    service_type: 'RO',
    service_sub_type: 'Installation',
    service_sub_type_custom: '',
    brand: '',
    model: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    scheduled_time_slot: 'MORNING',
    scheduled_time_custom: '',
    description: '',
    priority: 'MEDIUM',
    assigned_technician_id: '',
    cost_agreed: '',
    lead_source: '',
    lead_source_custom: '',
    photos: []
  });

  // Initialize service type, brand, model from customer when dialog opens (supports Softener-only)
  useEffect(() => {
    if (!open || !customer) return;
    const svcType = (customer as any).service_type || customer.serviceType;
    const types = parseDbServiceType
      ? parseDbServiceType((customer as any).service_type || customer.serviceType || '')
      : (svcType === 'SOFTENER' ? ['SOFTENER'] : ['RO']);
    const defaultServiceType = types.includes('SOFTENER') && !types.includes('RO')
      ? 'SOFTENER'
      : (types[0] === 'SOFTENER' ? 'SOFTENER' : 'RO');
    const brands = (customer.brand || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const models = (customer.model || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const idx = types.indexOf(defaultServiceType);
    const brand = idx >= 0 && brands[idx] ? brands[idx] : (brands[0] || '');
    const model = idx >= 0 && models[idx] ? models[idx] : (models[0] || '');
    setNewJobFormData(prev => ({
      ...prev,
      service_type: defaultServiceType as 'RO' | 'SOFTENER',
      brand: brand || prev.brand || 'Not specified',
      model: model || prev.model || 'Not specified'
    }));
  }, [open, customer, parseDbServiceType]);

  const handleClose = () => {
    onOpenChange(false);
    // Reset form
    setNewJobFormData({
      service_type: 'RO',
      service_sub_type: 'Installation',
      service_sub_type_custom: '',
      brand: '',
      model: '',
      scheduled_date: new Date().toISOString().split('T')[0],
      scheduled_time_slot: 'MORNING',
      scheduled_time_custom: '',
      description: '',
      priority: 'MEDIUM',
      assigned_technician_id: '',
      cost_agreed: '',
      lead_source: '',
      lead_source_custom: '',
      photos: []
    });
  };

  const handleFormChange = (field: keyof NewJobFormData, value: string | number) => {
    setNewJobFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePhotoUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;
    
    try {
      const validFiles: File[] = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image file`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 10MB)`);
          continue;
        }
        validFiles.push(file);
      }
      
      if (validFiles.length === 0) {
        toast.error('No valid image files to upload');
        return;
      }
      
      const thumbnailPromises = validFiles.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve(e.target?.result as string);
          };
          reader.onerror = () => {
            resolve('');
          };
          reader.readAsDataURL(file);
        });
      });
      
      const thumbnails = await Promise.all(thumbnailPromises);
      const validThumbnails = thumbnails.filter(t => t !== '');
      
      setNewJobFormData(prev => ({
        ...prev,
        photos: [...prev.photos, ...validThumbnails]
      }));
      
      const uploadPromises = validFiles.map(async (file, index) => {
        try {
          const compressedFile = await compressImage(file, 800, 0.4);
          const uploadResult = await cloudinaryService.uploadImage(compressedFile, 'ro-service', false);
          
          if (!uploadResult || !uploadResult.secure_url) {
            throw new Error('Upload failed - no URL returned');
          }
          
          setNewJobFormData(prev => ({
            ...prev,
            photos: prev.photos.map((photo, i) => {
              const thumbnailIndex = prev.photos.length - validThumbnails.length + index;
              return i === thumbnailIndex ? uploadResult.secure_url : photo;
            })
          }));
          
          return uploadResult.secure_url;
        } catch (error) {
          console.error(`❌ Failed to upload ${file.name}:`, error);
          toast.error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return validThumbnails[index] || '';
        }
      });
      
      await Promise.all(uploadPromises);
      toast.success(`${validFiles.length} photo(s) uploaded successfully!`);
    } catch (error) {
      console.error('Error processing photos:', error);
      toast.error(`Failed to process photos: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setNewJobFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const handleCreateJob = async () => {
    if (!customer) return;

    if (!newJobFormData.scheduled_date) {
      toast.error('Please select a scheduled date');
      return;
    }
    
    if (!newJobFormData.lead_source || newJobFormData.lead_source.trim() === '') {
      toast.error('Please select a lead source');
      return;
    }
    
    if (newJobFormData.lead_source === 'Other' && (!newJobFormData.lead_source_custom || newJobFormData.lead_source_custom.trim() === '')) {
      toast.error('Please enter a custom lead source');
      return;
    }

    setIsCreatingJob(true);
    try {
      const jobNumber = generateJobNumber(newJobFormData.service_type);

      let scheduledTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' = 'MORNING';
      let customTimeInRequirements = null;
      let isFlexible = false;
      
      if (newJobFormData.scheduled_time_slot === 'CUSTOM' && newJobFormData.scheduled_time_custom) {
        customTimeInRequirements = newJobFormData.scheduled_time_custom;
        const [hours] = newJobFormData.scheduled_time_custom.split(':').map(Number);
        const hour24 = hours;
        
        if (hour24 < 13) {
          scheduledTimeSlot = 'MORNING';
        } else if (hour24 < 18) {
          scheduledTimeSlot = 'AFTERNOON';
        } else {
          scheduledTimeSlot = 'EVENING';
        }
      } else if (newJobFormData.scheduled_time_slot === 'FLEXIBLE') {
        isFlexible = true;
        scheduledTimeSlot = 'MORNING';
      } else {
        scheduledTimeSlot = newJobFormData.scheduled_time_slot as 'MORNING' | 'AFTERNOON' | 'EVENING';
      }

      const jobData = {
        job_number: jobNumber,
        customer_id: customer.id,
        service_type: newJobFormData.service_type,
        service_sub_type: newJobFormData.service_sub_type === 'Other' ? newJobFormData.service_sub_type_custom : newJobFormData.service_sub_type,
        brand: newJobFormData.brand === 'Not specified' ? '' : newJobFormData.brand,
        model: newJobFormData.model === 'Not specified' ? '' : newJobFormData.model,
        scheduled_date: newJobFormData.scheduled_date,
        scheduled_time_slot: scheduledTimeSlot,
        service_address: customer.address,
        service_location: customer.location,
        status: newJobFormData.assigned_technician_id ? 'ASSIGNED' : 'PENDING',
        priority: newJobFormData.priority,
        description: newJobFormData.description.trim() || '',
        requirements: [{ 
          lead_source: newJobFormData.lead_source === 'Other' ? (newJobFormData.lead_source_custom || 'Other') : newJobFormData.lead_source,
          cost_range: newJobFormData.cost_agreed || '',
          custom_time: customTimeInRequirements,
          flexible_time: isFlexible
        }],
        estimated_cost: newJobFormData.cost_agreed ? (parseFloat(newJobFormData.cost_agreed.toString().split('-')[0].trim()) || 0) : 0,
        payment_status: 'PENDING',
        assigned_technician_id: newJobFormData.assigned_technician_id || null,
        assigned_date: newJobFormData.assigned_technician_id ? new Date().toISOString() : null,
        before_photos: newJobFormData.photos.filter(photo => photo && photo.trim() !== '' && photo.startsWith('http'))
      };

      const { data: newJob, error } = await db.jobs.create(jobData);
      
      if (error) {
        throw new Error(error.message);
      }

      onJobCreated(newJob);

      // Update customer record if brand/model changed
      const brandChanged = newJobFormData.brand !== 'Not specified' && 
                          newJobFormData.brand !== customer.brand;
      const modelChanged = newJobFormData.model !== 'Not specified' && 
                          newJobFormData.model !== customer.model;
      
      if ((brandChanged || modelChanged) && onCustomerUpdated && parseDbServiceType) {
        const serviceTypes = parseDbServiceType(customer.service_type || '');
        const currentBrands = customer.brand ? customer.brand.split(',').map(b => b.trim()) : [];
        const currentModels = customer.model ? customer.model.split(',').map(m => m.trim()) : [];
        
        const serviceTypeIndex = serviceTypes.indexOf(newJobFormData.service_type);
        
        const updatedBrands = [...currentBrands];
        const updatedModels = [...currentModels];
        
        while (updatedBrands.length < serviceTypes.length) updatedBrands.push('');
        while (updatedModels.length < serviceTypes.length) updatedModels.push('');
        
        if (brandChanged && newJobFormData.brand !== 'Not specified') {
          updatedBrands[serviceTypeIndex] = newJobFormData.brand;
        }
        if (modelChanged && newJobFormData.model !== 'Not specified') {
          updatedModels[serviceTypeIndex] = newJobFormData.model;
        }
        
        await db.customers.update(customer.id, {
          brand: updatedBrands.join(', '),
          model: updatedModels.join(', ')
        });
        
        onCustomerUpdated({
          ...customer,
          brand: updatedBrands.join(', '),
          model: updatedModels.join(', ')
        });
        
        if (onBrandsModelsReload) {
          await onBrandsModelsReload();
        }
      }

      // Send notification if technician is assigned
      if (newJobFormData.assigned_technician_id) {
        const assignedTechnician = technicians.find(t => t.id === newJobFormData.assigned_technician_id);
        if (assignedTechnician) {
          const notification = createJobAssignedNotification(
            newJob.job_number,
            customer.fullName,
            assignedTechnician.fullName,
            newJob.id,
            assignedTechnician.id
          );
          await sendNotification(notification);
        }
      }

      toast.success(`Job ${newJob.job_number} created successfully!`);
      handleClose();
    } catch (error) {
      toast.error('Failed to create job');
    } finally {
      setIsCreatingJob(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:w-[80vw] lg:w-[60vw] xl:w-[50vw] max-w-2xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Create New Job</DialogTitle>
          <DialogDescription>
            Create a new service job for {(customer as any)?.customer_id} - {(customer as any)?.full_name}
          </DialogDescription>
        </DialogHeader>
        
        {customer && (
          <div className="py-4 px-2 sm:px-4 space-y-6 flex-1 overflow-y-auto">
            {/* Service Information */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Service Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job_service_type">Service Type</Label>
                  <select
                    id="job_service_type"
                    value={newJobFormData.service_type || 'RO'}
                    onChange={(e) => handleFormChange('service_type', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: 'right 0.5rem center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '1.5em 1.5em',
                      paddingRight: '2.5rem'
                    }}
                  >
                    <option value="RO">RO Water Purifier</option>
                    <option value="SOFTENER">Water Softener</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job_service_sub_type">Service Sub Type</Label>
                  <select
                    id="job_service_sub_type"
                    value={newJobFormData.service_sub_type || 'Installation'}
                    onChange={(e) => handleFormChange('service_sub_type', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white"
                  >
                    <option value="Installation">Installation</option>
                    <option value="Reinstallation">Reinstallation</option>
                    <option value="Un-Installation">Un-Installation</option>
                    <option value="Service">Service</option>
                    <option value="Repair">Repair</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Replacement">Replacement</option>
                    <option value="Inspection">Inspection</option>
                    <option value="Return Complaint">Return Complaint</option>
                    <option value="AMC Service">AMC Service</option>
                    <option value="Other">Other</option>
                  </select>
                  {newJobFormData.service_sub_type === 'Other' && (
                    <Input
                      id="job_service_sub_type_custom"
                      value={newJobFormData.service_sub_type_custom}
                      onChange={(e) => handleFormChange('service_sub_type_custom', e.target.value)}
                      placeholder="Enter custom service sub type"
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Scheduling */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Scheduling</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job_scheduled_date">Scheduled Date</Label>
                  <Input
                    id="job_scheduled_date"
                    type="date"
                    value={newJobFormData.scheduled_date}
                    onChange={(e) => handleFormChange('scheduled_date', e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job_scheduled_time_slot">Time Slot</Label>
                  <select
                    id="job_scheduled_time_slot"
                    value={newJobFormData.scheduled_time_slot || 'MORNING'}
                    onChange={(e) => handleFormChange('scheduled_time_slot', e.target.value as any)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white"
                  >
                    <option value="MORNING">Morning (9 AM - 1 PM)</option>
                    <option value="AFTERNOON">Afternoon (1 PM - 6 PM)</option>
                    <option value="EVENING">Evening (6 PM - 9 PM)</option>
                    <option value="FLEXIBLE">Flexible</option>
                    <option value="CUSTOM">Custom Time</option>
                  </select>
                  {newJobFormData.scheduled_time_slot === 'CUSTOM' && (
                    <Input
                      id="job_scheduled_time_custom"
                      type="time"
                      value={newJobFormData.scheduled_time_custom}
                      onChange={(e) => handleFormChange('scheduled_time_custom', e.target.value)}
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Photo Upload */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Photos</h3>
              <div className="space-y-4">
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer ${
                    isDragOverNewJob 
                      ? 'border-blue-500 bg-blue-50 scale-105' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOverNewJob(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOverNewJob(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOverNewJob(false);
                    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
                    if (files.length > 0) {
                      handlePhotoUpload(files);
                    } else {
                      toast.error('Please drop image files only');
                    }
                  }}
                  onClick={() => document.getElementById('photo-upload')?.click()}
                >
                  <div className="flex flex-col items-center space-y-2">
                    {isDragOverNewJob ? (
                      <Upload className="w-8 h-8 text-blue-500" />
                    ) : (
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    )}
                    <p className="text-sm text-gray-600">
                      {isDragOverNewJob ? (
                        <span className="font-medium text-blue-600">Drop photos here</span>
                      ) : (
                        <>
                          <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 10MB each</p>
                  </div>
                </div>
                
                <input
                  id="photo-upload"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files);
                      handlePhotoUpload(files);
                    }
                  }}
                  className="hidden"
                />
                
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('camera-upload')?.click()}
                    className="flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Take Photo
                  </Button>
                </div>
                
                <input
                  id="camera-upload"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files);
                      handlePhotoUpload(files);
                    }
                  }}
                  className="hidden"
                />
                
                {newJobFormData.photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {newJobFormData.photos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={photo}
                          alt={`Upload ${index + 1}`}
                          className="w-full h-24 object-cover rounded-lg border"
                        />
                        {photo.startsWith('data:') && (
                          <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Job Details */}
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Job Details</h3>
              <div className="space-y-2">
                <Label htmlFor="job_description">Description (Optional)</Label>
                <Textarea
                  id="job_description"
                  value={newJobFormData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Describe the service requirements (optional)..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="job_cost_agreed">Cost Already Agreed (₹)</Label>
                <Input
                  id="job_cost_agreed"
                  type="text"
                  value={newJobFormData.cost_agreed}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^[\d\s-]+$/.test(value)) {
                      handleFormChange('cost_agreed', value);
                    }
                  }}
                  placeholder="e.g., 400 or 400-500"
                />
                <p className="text-xs text-gray-500">Enter a single amount or a range (e.g., 400-500)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="job_lead_source">Lead Source *</Label>
                <select
                  id="job_lead_source"
                  value={newJobFormData.lead_source}
                  onChange={(e) => handleFormChange('lead_source', e.target.value)}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white"
                >
                  <option value="">Select lead source</option>
                  <option value="Website">Website</option>
                  <option value="Direct call">Direct call</option>
                  <option value="Google-Leads">Google-Leads</option>
                  <option value="RO care india">RO care india</option>
                  <option value="Home Triangle">Home Triangle</option>
                  <option value="Local Ramu">Local Ramu</option>
                  <option value="Other">Other</option>
                </select>
                {newJobFormData.lead_source === 'Other' && (
                  <Input
                    id="job_lead_source_custom"
                    value={newJobFormData.lead_source_custom || ''}
                    onChange={(e) => handleFormChange('lead_source_custom', e.target.value)}
                    placeholder="Enter lead source"
                    className="mt-2"
                  />
                )}
              </div>
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateJob}
            disabled={isCreatingJob}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isCreatingJob ? 'Creating...' : 'Create Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewJobDialog;

