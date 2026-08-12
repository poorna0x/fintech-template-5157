import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomAppointmentTimeSelect } from '@/components/admin/CustomAppointmentTimeSelect';
import { MapPin, Upload } from 'lucide-react';
import { Customer } from '@/types';
import { toast } from 'sonner';
import { TOAST_VALIDATION } from '@/lib/toastOptions';
import { cloudinaryService, compressImage, validateImageFile } from '@/lib/cloudinary';
import { generateJobNumber, formatCustomTimeLabel, getDefaultLeadCost, isHomeTriangleLeadSource } from '@/lib/adminUtils';
import { LeadSourceSelect } from '@/components/admin/LeadSourceSelect';
import { ServiceSubTypeSelect } from '@/components/admin/ServiceSubTypeSelect';
import { db } from '@/lib/supabase';
import { appendJobToTechnicianVisitOrder } from '@/lib/adminVisitOrder';
import { jobAssignPushText, notifyTechnicianJobPush } from '@/lib/adminTechPushNotify';
import { createJobAssignedNotification, sendNotification } from '@/lib/notifications';
import type { JobAssignedToTechnicianPayload } from './AddCustomerDialog';
import {
  CustomerLocationVariant,
  getCustomerLocationSlice,
  getPrimaryLocationLabel,
  getSecondaryLocationLabel,
  getSiteEquipment,
  hasDualSiteCustomer,
  getJobLocationLabelForWhatsApp,
} from '@/lib/customer-locations';
import { isNativeApp } from '@/lib/isNativeApp';
import { captureNativeCameraPhoto } from '@/lib/cameraUtils';

interface NewJobFormData {
  service_type: 'RO' | 'SOFTENER';
  service_sub_type: string;
  service_sub_type_custom: string;
  brand: string;
  model: string;
  service_site: CustomerLocationVariant;
  scheduled_date: string;
  scheduled_time_slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FLEXIBLE' | 'CUSTOM';
  scheduled_time_custom: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigned_technician_id: string;
  cost_agreed: string;
  lead_source: string;
  lead_source_custom: string;
  lead_cost: string;
  photos: string[];
  require_otp: boolean;
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
  /** When the new job is created with a technician assigned, open WhatsApp notify flow in parent. */
  onJobAssignedToTechnician?: (payload: JobAssignedToTechnicianPayload) => void;
  /**
   * Technician portal mode: hides lead cost (server computes the default) and
   * creates the job through the technician RPC instead of the admin insert.
   * Admin-only post-create steps (visit order, tech push, customer patch) are
   * skipped.
   */
  technicianMode?: boolean;
}

const NewJobDialog: React.FC<NewJobDialogProps> = ({
  open,
  onOpenChange,
  customer,
  technicians,
  onJobCreated,
  onCustomerUpdated,
  onBrandsModelsReload,
  parseDbServiceType,
  onJobAssignedToTechnician,
  technicianMode = false,
}) => {
  const [isDragOverNewJob, setIsDragOverNewJob] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const pendingPhotoBatchesRef = useRef<{ startIndex: number; promise: Promise<string[]> }[]>([]);

  const [newJobFormData, setNewJobFormData] = useState<NewJobFormData>({
    service_type: 'RO',
    service_sub_type: 'Service',
    service_sub_type_custom: '',
    brand: '',
    model: '',
    service_site: 'primary',
    scheduled_date: new Date().toISOString().split('T')[0],
    scheduled_time_slot: 'MORNING',
    scheduled_time_custom: '',
    description: '',
    priority: 'MEDIUM',
    assigned_technician_id: '',
    cost_agreed: '',
    lead_source: '',
    lead_source_custom: '',
    lead_cost: '0',
    photos: [],
    require_otp: false
  });

  // Initialize service type, brand, model from customer when dialog opens (supports Softener-only)
  useEffect(() => {
    if (!open || !customer) return;
    const site: CustomerLocationVariant = 'primary';
    const siteEq = getSiteEquipment(customer, site);
    const svcType = siteEq.serviceType || (customer as any).service_type || customer.serviceType;
    const types = parseDbServiceType
      ? parseDbServiceType((customer as any).service_type || customer.serviceType || '')
      : (svcType === 'SOFTENER' ? ['SOFTENER'] : ['RO']);
    const defaultServiceType = siteEq.serviceType || (
      types.includes('SOFTENER') && !types.includes('RO')
        ? 'SOFTENER'
        : (types[0] === 'SOFTENER' ? 'SOFTENER' : 'RO')
    );
    const brands = (customer.brand || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const models = (customer.model || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const idx = types.indexOf(defaultServiceType);
    const brand = siteEq.brand || (idx >= 0 && brands[idx] ? brands[idx] : (brands[0] || ''));
    const model = siteEq.model || (idx >= 0 && models[idx] ? models[idx] : (models[0] || ''));
    setNewJobFormData(prev => ({
      ...prev,
      service_site: site,
      service_type: defaultServiceType as 'RO' | 'SOFTENER',
      brand: brand || prev.brand || 'Not specified',
      model: model || prev.model || 'Not specified'
    }));
  }, [open, customer, parseDbServiceType]);

  const applyServiceSiteToForm = (site: CustomerLocationVariant) => {
    if (!customer) return;
    const siteEq = getSiteEquipment(customer, site);
    const types = parseDbServiceType
      ? parseDbServiceType((customer as any).service_type || customer.serviceType || '')
      : [siteEq.serviceType];
    const idx = types.indexOf(siteEq.serviceType);
    const brands = (customer.brand || '').split(',').map((s: string) => s.trim());
    const models = (customer.model || '').split(',').map((s: string) => s.trim());
    const brand =
      site === 'secondary'
        ? siteEq.brand
        : (idx >= 0 ? brands[idx] : brands[0]) || siteEq.brand;
    const model =
      site === 'secondary'
        ? siteEq.model
        : (idx >= 0 ? models[idx] : models[0]) || siteEq.model;
    setNewJobFormData((prev) => ({
      ...prev,
      service_site: site,
      service_type: siteEq.serviceType,
      brand: brand?.trim() || 'Not specified',
      model: model?.trim() || 'Not specified',
    }));
  };

  const handleClose = () => {
    setNewJobFormData({
      service_type: 'RO',
      service_sub_type: 'Service',
      service_sub_type_custom: '',
      brand: '',
      model: '',
      service_site: 'primary',
      scheduled_date: new Date().toISOString().split('T')[0],
      scheduled_time_slot: 'MORNING',
      scheduled_time_custom: '',
      description: '',
      priority: 'MEDIUM',
      assigned_technician_id: '',
      cost_agreed: '',
      lead_source: '',
      lead_source_custom: '',
      lead_cost: '0',
      photos: [],
      require_otp: false
    });
    onOpenChange(false);
  };

  const handleFormChange = (field: keyof NewJobFormData, value: string | number) => {
    // If service_type changes, update brand/model defaults to match that service
    if (field === 'service_type' && customer) {
      const nextServiceType = String(value) as 'RO' | 'SOFTENER';
      const svcType = (customer as any).service_type || customer.serviceType;
      const types = parseDbServiceType
        ? parseDbServiceType((customer as any).service_type || customer.serviceType || '')
        : (svcType === 'SOFTENER' ? ['SOFTENER'] : ['RO']);

      const brands = (customer.brand || '').split(',').map((s: string) => s.trim());
      const models = (customer.model || '').split(',').map((s: string) => s.trim());
      const idx = types.indexOf(nextServiceType);

      const nextBrandRaw = (idx >= 0 ? (brands[idx] || '') : '');
      const nextModelRaw = (idx >= 0 ? (models[idx] || '') : '');

      setNewJobFormData(prev => ({
        ...prev,
        service_type: nextServiceType,
        // If we don't have a matching slot value, keep existing selection (don't overwrite user edits)
        brand: nextBrandRaw ? nextBrandRaw : prev.brand,
        model: nextModelRaw ? nextModelRaw : prev.model
      }));
      return;
    }

    setNewJobFormData(prev => {
      const next = { ...prev, [field]: value };
      const shouldRecalcLeadCost =
        field === 'service_sub_type' ||
        field === 'service_sub_type_custom' ||
        field === 'lead_source';
      if (shouldRecalcLeadCost && next.lead_source && next.lead_source !== 'Other') {
        next.lead_cost = getDefaultLeadCost(
          next.lead_source,
          next.service_sub_type,
          next.service_sub_type_custom,
        );
      }
      return next;
    });
  };

  const handlePhotoUpload = (files: File[]) => {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error ?? `${file.name} is not valid`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      toast.error('No valid image files to upload');
      return;
    }

    let startIndex: number;
    setNewJobFormData(prev => {
      startIndex = prev.photos.length;
      return { ...prev, photos: [...prev.photos, ...Array(validFiles.length).fill('')] };
    });

    const thumbnailPromises = validFiles.map(file =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      })
    );

    Promise.all(thumbnailPromises).then(thumbnails => {
      setNewJobFormData(prev => {
        const next = [...prev.photos];
        thumbnails.forEach((t, i) => { if (t) next[startIndex + i] = t; });
        return { ...prev, photos: next };
      });
    });

    const uploadPromises = validFiles.map(async (file, index) => {
      try {
        const compressedFile = await compressImage(file, 800, 0.4);
        const uploadResult = await cloudinaryService.uploadImage(compressedFile, 'ro-service', false);
        if (!uploadResult?.secure_url) throw new Error('Upload failed - no URL returned');
        setNewJobFormData(prev => {
          const replaceIndex = startIndex + index;
          return {
            ...prev,
            photos: prev.photos.map((photo, i) => (i === replaceIndex ? uploadResult.secure_url : photo))
          };
        });
        return uploadResult.secure_url;
      } catch (error) {
        console.error(`❌ Failed to upload ${file.name}:`, error);
        toast.error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return '';
      }
    });

    const batchPromise = Promise.all(uploadPromises).then(urls => urls.filter(Boolean));
    const batch = { startIndex, promise: batchPromise };
    pendingPhotoBatchesRef.current = [...pendingPhotoBatchesRef.current, batch];
    setIsUploadingPhotos(true);

    batchPromise.finally(() => {
      pendingPhotoBatchesRef.current = pendingPhotoBatchesRef.current.filter(b => b !== batch);
      setIsUploadingPhotos(pendingPhotoBatchesRef.current.length > 0);
    });
    batchPromise.then(() => {
      if (validFiles.length > 0) toast.success(`${validFiles.length} photo(s) uploaded successfully!`);
    }).catch(() => {});
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
      toast.error('Please select a scheduled date', TOAST_VALIDATION);
      return;
    }

    if (
      newJobFormData.scheduled_time_slot === 'CUSTOM' &&
      (!newJobFormData.scheduled_time_custom || !newJobFormData.scheduled_time_custom.trim())
    ) {
      toast.error('Please choose a visit time (list or exact time)', TOAST_VALIDATION);
      return;
    }
    
    if (!newJobFormData.lead_source || newJobFormData.lead_source.trim() === '') {
      toast.error('Please select a lead source', TOAST_VALIDATION);
      return;
    }
    
    if (newJobFormData.lead_source === 'Other' && (!newJobFormData.lead_source_custom || newJobFormData.lead_source_custom.trim() === '')) {
      toast.error('Please enter a custom lead source', TOAST_VALIDATION);
      return;
    }

    if (!technicianMode) {
      if (!newJobFormData.lead_cost || newJobFormData.lead_cost.trim() === '') {
        toast.error('Please enter lead cost', TOAST_VALIDATION);
        return;
      }
      const leadCostCheck = parseFloat(newJobFormData.lead_cost);
      if (isNaN(leadCostCheck) || leadCostCheck < 0) {
        toast.error('Lead cost must be a valid number', TOAST_VALIDATION);
        return;
      }
    }

    const leadCostNum = parseFloat(newJobFormData.lead_cost) || 0;

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

      // Generate 4-digit OTP if require_otp is true
      let otpCode: string | null = null;
      if (newJobFormData.require_otp) {
        otpCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
      }

      const requirements: any[] = [{ 
        lead_source: newJobFormData.lead_source === 'Other' ? (newJobFormData.lead_source_custom || 'Other') : newJobFormData.lead_source,
        cost_range: newJobFormData.cost_agreed || '',
        custom_time: customTimeInRequirements,
        flexible_time: isFlexible
      }];

      // Add OTP requirement if enabled
      if (newJobFormData.require_otp && otpCode) {
        requirements.push({
          require_otp: true,
          otp_code: otpCode,
          otp_verified: false
        });
      }

      // Wait for any in-flight photo uploads so we include all photos in the job
      let photosToUse = newJobFormData.photos.filter(photo => photo && photo.trim() !== '' && photo.startsWith('http'));
      const pendingBatches = pendingPhotoBatchesRef.current;
      if (pendingBatches.length > 0) {
        pendingPhotoBatchesRef.current = [];
        const results = await Promise.all(pendingBatches.map(async (b) => ({ startIndex: b.startIndex, urls: await b.promise })));
        const merged = [...newJobFormData.photos];
        for (const { startIndex, urls } of results) {
          for (let i = 0; i < urls.length; i++) {
            if (urls[i] && startIndex + i < merged.length) merged[startIndex + i] = urls[i];
          }
        }
        photosToUse = merged.filter(photo => photo && photo.trim() !== '' && photo.startsWith('http'));
      }

      const site = newJobFormData.service_site || 'primary';
      const locationSlice = getCustomerLocationSlice(customer, site);
      const serviceAddress = {
        ...locationSlice.address,
        visible_address: locationSlice.visibleAddress || locationSlice.address?.visible_address,
      };

      const jobData = {
        job_number: jobNumber,
        customer_id: customer.id,
        service_type: newJobFormData.service_type,
        service_sub_type: newJobFormData.service_sub_type === 'Other' ? newJobFormData.service_sub_type_custom : newJobFormData.service_sub_type,
        brand: newJobFormData.brand === 'Not specified' ? '' : newJobFormData.brand,
        model: newJobFormData.model === 'Not specified' ? '' : newJobFormData.model,
        scheduled_date: newJobFormData.scheduled_date,
        scheduled_time_slot: scheduledTimeSlot,
        service_address: serviceAddress,
        service_location: locationSlice.location,
        service_site: site,
        status: newJobFormData.assigned_technician_id ? 'ASSIGNED' : 'PENDING',
        priority: newJobFormData.priority,
        description: newJobFormData.description.trim() || '',
        requirements: requirements,
        estimated_cost: newJobFormData.cost_agreed ? (parseFloat(newJobFormData.cost_agreed.toString().split('-')[0].trim()) || 0) : 0,
        lead_cost: leadCostNum,
        payment_status: 'PENDING',
        assigned_technician_id: newJobFormData.assigned_technician_id || null,
        assigned_date: newJobFormData.assigned_technician_id ? new Date().toISOString() : null,
        before_photos: photosToUse
      };

      const { data: newJob, error } = technicianMode
        ? await db.jobs.createAsTechnician(jobData as unknown as Record<string, unknown>)
        : await db.jobs.create(jobData);

      if (error) {
        throw new Error(error.message);
      }

      if (technicianMode) {
        // Admin-only post-create steps (visit order, tech push, customer
        // brand/model patch, WhatsApp notify) are blocked by RLS for
        // technicians — the job itself is what matters here.
        onJobCreated(newJob);
        if ((newJob as { id?: string } | null)?.id) {
          void import('@/lib/notifyAdminsJobEvent').then(({ notifyAdminsJobEvent }) =>
            notifyAdminsJobEvent(String((newJob as { id: string }).id), 'job_created')
          );
        }
        toast.success(`Job ${(newJob as any)?.job_number || ''} created successfully!`);
        handleClose();
        return;
      }

      if (newJob?.id && newJobFormData.assigned_technician_id) {
        const visitOrder = await appendJobToTechnicianVisitOrder({
          jobId: newJob.id,
          technicianId: newJobFormData.assigned_technician_id,
          scheduledDate: newJobFormData.scheduled_date,
        });
        if (visitOrder != null) {
          (newJob as any).visit_order = visitOrder;
          (newJob as any).visitOrder = visitOrder;
        }
        notifyTechnicianJobPush({
          technicianId: newJobFormData.assigned_technician_id,
          jobId: newJob.id,
          ...jobAssignPushText({ job: newJob as any, customer: customer as any }),
        });
        const assignedTech = technicians.find((t) => t.id === newJobFormData.assigned_technician_id);
        if (assignedTech) {
          void import('@/lib/jobTechnicianWhatsApp').then(({ notifyTechnicianJobWhatsApp }) =>
            notifyTechnicianJobWhatsApp({
              job: newJob as any,
              technician: {
                id: assignedTech.id,
                fullName: assignedTech.fullName || (assignedTech as any).full_name || 'Technician',
                phone: assignedTech.phone,
                whatsappPhone: (assignedTech as any).whatsappPhone,
                whatsapp_phone: (assignedTech as any).whatsapp_phone,
              },
              mode: 'assign',
              ctx: null,
            })
          );
        }
      }

      onJobCreated(newJob);

      // Update customer record if brand/model changed (correct site only)
      const newBrand = newJobFormData.brand === 'Not specified' ? '' : newJobFormData.brand;
      const newModel = newJobFormData.model === 'Not specified' ? '' : newJobFormData.model;
      const isSecondary = site === 'secondary';

      if (isSecondary) {
        const brandChanged = newBrand && newBrand !== ((customer as any).alternate_brand || '');
        const modelChanged = newModel && newModel !== ((customer as any).alternate_model || '');
        if ((brandChanged || modelChanged) && onCustomerUpdated) {
          const patch: Record<string, string> = {};
          if (brandChanged) patch.alternate_brand = newBrand;
          if (modelChanged) patch.alternate_model = newModel;
          await db.customers.update(customer.id, patch);
          onCustomerUpdated({
            ...customer,
            alternate_brand: brandChanged ? newBrand : (customer as any).alternate_brand,
            alternate_model: modelChanged ? newModel : (customer as any).alternate_model,
          } as Customer);
          if (onBrandsModelsReload) await onBrandsModelsReload();
        }
      } else {
        const brandChanged = newBrand && newBrand !== customer.brand;
        const modelChanged = newModel && newModel !== customer.model;

        if ((brandChanged || modelChanged) && onCustomerUpdated && parseDbServiceType) {
          const serviceTypes = parseDbServiceType(customer.service_type || '');
          const currentBrands = customer.brand ? customer.brand.split(',').map(b => b.trim()) : [];
          const currentModels = customer.model ? customer.model.split(',').map(m => m.trim()) : [];

          const serviceTypeIndex = serviceTypes.indexOf(newJobFormData.service_type);

          const updatedBrands = [...currentBrands];
          const updatedModels = [...currentModels];

          while (updatedBrands.length < serviceTypes.length) updatedBrands.push('');
          while (updatedModels.length < serviceTypes.length) updatedModels.push('');

          if (brandChanged) updatedBrands[serviceTypeIndex] = newBrand;
          if (modelChanged) updatedModels[serviceTypeIndex] = newModel;

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

      // Capture values needed for the WhatsApp notify dialog BEFORE handleClose() resets the form.
      const assignedTechIdToNotify = newJobFormData.assigned_technician_id;
      const subTypeToNotify =
        newJobFormData.service_sub_type === 'Other'
          ? newJobFormData.service_sub_type_custom
          : newJobFormData.service_sub_type;
      const leadSourceToNotify =
        newJobFormData.lead_source === 'Other'
          ? newJobFormData.lead_source_custom || 'Other'
          : newJobFormData.lead_source;
      const customTimeToNotify =
        newJobFormData.scheduled_time_slot === 'CUSTOM' && newJobFormData.scheduled_time_custom
          ? formatCustomTimeLabel(newJobFormData.scheduled_time_custom) || undefined
          : undefined;
      const notifySite = site;
      const notifyServiceAddress = serviceAddress;
      const notifyLocationLabel = getJobLocationLabelForWhatsApp(
        { service_site: notifySite, service_address: notifyServiceAddress },
        customer
      );

      handleClose();

      if (assignedTechIdToNotify && onJobAssignedToTechnician && customer) {
        const customerName =
          (customer as { fullName?: string }).fullName ||
          (customer as { full_name?: string }).full_name ||
          'Customer';
        onJobAssignedToTechnician({
          technicianId: assignedTechIdToNotify,
          serviceSubType: subTypeToNotify || 'Service',
          customerName,
          visibleAddress: notifyLocationLabel,
          address: notifyServiceAddress as { area?: string; city?: string },
          leadSource: leadSourceToNotify,
          customTime: customTimeToNotify,
          description: newJobFormData.description.trim() || undefined,
          agreedCost: newJobFormData.cost_agreed.trim() || undefined,
        });
      }
    } catch (error) {
      toast.error('Failed to create job');
    } finally {
      setIsCreatingJob(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleClose(); }}>
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
            <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/40">
              <h3 className="text-lg font-semibold text-foreground">Service Information</h3>
              {customer && hasDualSiteCustomer(customer) && (
                <div className="space-y-2.5 pb-3 mb-1 border-b border-border/80">
                  <Label className="text-sm font-medium text-foreground">Service at</Label>
                  <div
                    className="grid grid-cols-2 gap-2 sm:gap-3"
                    role="radiogroup"
                    aria-label="Service location"
                  >
                    {(['primary', 'secondary'] as const).map((site) => {
                      const label =
                        site === 'primary'
                          ? getPrimaryLocationLabel(customer)
                          : getSecondaryLocationLabel(customer);
                      const eq = getSiteEquipment(customer, site);
                      const device = [eq.brand, eq.model].filter(Boolean).join(' ');
                      const isSelected = newJobFormData.service_site === site;
                      return (
                        <button
                          key={site}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => applyServiceSiteToForm(site)}
                          className={`relative flex min-h-[4.25rem] sm:min-h-[4.5rem] flex-col justify-center rounded-xl border-2 px-3 py-2.5 sm:px-4 text-left transition-all active:scale-[0.98] ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/90 shadow-sm ring-2 ring-blue-500/20'
                              : 'border-border bg-background hover:border-blue-300/80 hover:bg-muted/30'
                          }`}
                        >
                          <span className="flex items-start gap-1.5 min-w-0">
                            <MapPin
                              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                                isSelected ? 'text-blue-600' : 'text-muted-foreground'
                              }`}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block truncate text-sm font-semibold leading-tight ${
                                  isSelected ? 'text-blue-900' : 'text-foreground'
                                }`}
                              >
                                {label}
                              </span>
                              {device ? (
                                <span className="mt-0.5 block truncate text-xs leading-snug text-muted-foreground">
                                  {device}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          {isSelected && (
                            <span
                              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500"
                              aria-hidden
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job_service_type">Service Type</Label>
                  <select
                    id="job_service_type"
                    value={newJobFormData.service_type || 'RO'}
                    onChange={(e) => handleFormChange('service_type', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-card"
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

                <ServiceSubTypeSelect
                  id="job_service_sub_type"
                  value={newJobFormData.service_sub_type || 'Service'}
                  customValue={newJobFormData.service_sub_type_custom}
                  onChange={(v) => handleFormChange('service_sub_type', v)}
                  onCustomChange={(v) => handleFormChange('service_sub_type_custom', v)}
                />
              </div>
            </div>

            {/* Scheduling */}
            <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/40">
              <h3 className="text-lg font-semibold text-foreground">Scheduling</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job_scheduled_date">Scheduled Date</Label>
                  <DatePicker
                    value={newJobFormData.scheduled_date || undefined}
                    onChange={(v) => v && handleFormChange('scheduled_date', v)}
                    placeholder="Pick date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job_scheduled_time_slot">Time Slot</Label>
                  <Select
                    value={newJobFormData.scheduled_time_slot || 'MORNING'}
                    onValueChange={(v) => handleFormChange('scheduled_time_slot', v as NewJobFormData['scheduled_time_slot'])}
                  >
                    <SelectTrigger id="job_scheduled_time_slot" className="bg-background">
                      <SelectValue placeholder="Select time slot" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MORNING">Morning (9 AM - 1 PM)</SelectItem>
                      <SelectItem value="AFTERNOON">Afternoon (1 PM - 6 PM)</SelectItem>
                      <SelectItem value="EVENING">Evening (6 PM - 9 PM)</SelectItem>
                      <SelectItem value="FLEXIBLE">Flexible</SelectItem>
                      <SelectItem value="CUSTOM">Custom time</SelectItem>
                    </SelectContent>
                  </Select>
                  {newJobFormData.scheduled_time_slot === 'CUSTOM' && (
                    <CustomAppointmentTimeSelect
                      id="job_scheduled_time_custom"
                      value={newJobFormData.scheduled_time_custom}
                      onChange={(hhmm) => handleFormChange('scheduled_time_custom', hhmm)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Photo Upload */}
            <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/40">
              <h3 className="text-lg font-semibold text-foreground">Photos</h3>
              <div className="space-y-4">
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer ${
                    isDragOverNewJob 
                      ? 'border-blue-500 bg-blue-50 scale-105' 
                      : 'border-border hover:border-primary/30'
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
                    const files = Array.from(e.dataTransfer.files).filter(file => validateImageFile(file).valid);
                    if (files.length > 0) {
                      handlePhotoUpload(files);
                    } else {
                      toast.error('Please drop image files only (JPEG, PNG, WebP, HEIC)');
                    }
                  }}
                  onClick={() => document.getElementById('photo-upload')?.click()}
                >
                  <div className="flex flex-col items-center space-y-2">
                    {isDragOverNewJob ? (
                      <Upload className="w-8 h-8 text-blue-500" />
                    ) : (
                      <svg className="w-8 h-8 text-muted-foreground/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {isDragOverNewJob ? (
                        <span className="font-medium text-blue-600">Drop photos here</span>
                      ) : (
                        <>
                          <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, WEBP up to 10MB each</p>
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
                    onClick={async () => {
                      if (isNativeApp()) {
                        const result = await captureNativeCameraPhoto();
                        if (result.status === 'ok') {
                          handlePhotoUpload([result.file]);
                          return;
                        }
                        if (result.status === 'cancelled') return;
                      }
                      document.getElementById('camera-upload')?.click();
                    }}
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
                
                {isUploadingPhotos && (
                  <p className="text-sm text-muted-foreground">Photos still uploading — you can click Create Job and they will be included when ready.</p>
                )}
                {newJobFormData.photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {newJobFormData.photos.map((photo, index) => (
                      <div key={index} className="relative group">
                        {photo ? (
                          <img
                            src={photo}
                            alt={`Upload ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border"
                          />
                        ) : (
                          <div className="w-full h-24 rounded-lg border border-dashed bg-muted flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        {(photo && (photo.startsWith('data:') || !photo.startsWith('http'))) && (
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
            <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/40">
              <h3 className="text-lg font-semibold text-foreground">Job Details</h3>
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
                <p className="text-xs text-muted-foreground">Enter a single amount or a range (e.g., 400-500)</p>
              </div>

              <LeadSourceSelect
                id="job_lead_source"
                value={newJobFormData.lead_source}
                customValue={newJobFormData.lead_source_custom || ''}
                required
                onChange={(selectedLeadSource) => {
                  handleFormChange('lead_source', selectedLeadSource);
                  if (selectedLeadSource) {
                    const defaultCost = getDefaultLeadCost(
                      selectedLeadSource,
                      newJobFormData.service_sub_type,
                      newJobFormData.service_sub_type_custom,
                    );
                    handleFormChange('lead_cost', defaultCost);
                  }
                  handleFormChange('require_otp', isHomeTriangleLeadSource(selectedLeadSource));
                }}
                onCustomChange={(v) => handleFormChange('lead_source_custom', v)}
              />

              {/* Lead Cost - Required when lead source is selected (hidden for technicians; server applies the default) */}
              {!technicianMode && newJobFormData.lead_source && (
                <div className="space-y-2">
                  <Label htmlFor="job_lead_cost">Lead Cost (₹) *</Label>
                  <Input
                    id="job_lead_cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newJobFormData.lead_cost}
                    onChange={(e) => handleFormChange('lead_cost', e.target.value)}
                    placeholder="Enter lead cost"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: ₹{getDefaultLeadCost(
                      newJobFormData.lead_source,
                      newJobFormData.service_sub_type,
                      newJobFormData.service_sub_type_custom,
                    )} (can be changed)
                  </p>
                </div>
              )}

              {/* Assign to Technician (Optional) — admin only; technician-created jobs stay PENDING for admin to assign */}
              {!technicianMode && (
              <div className="space-y-2 pt-2 border-t border-border">
                <Label htmlFor="job_technician">Assign to Technician (Optional)</Label>
                <Select
                  value={newJobFormData.assigned_technician_id || 'none'}
                  onValueChange={(value) =>
                    handleFormChange('assigned_technician_id', value === 'none' ? '' : value)
                  }
                >
                  <SelectTrigger id="job_technician" className="bg-background">
                    <SelectValue placeholder="Select technician (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Assign later)</SelectItem>
                    {technicians
                      .filter((tech) => tech && tech.id && (tech.fullName || tech.full_name))
                      .map((tech) => {
                        const techName = tech.fullName || tech.full_name || 'Unknown';
                        const techCode = tech.employeeId || tech.employee_id;
                        return (
                          <SelectItem key={tech.id} value={tech.id}>
                            {techName}
                            {techCode ? ` (${techCode})` : ''}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
                {newJobFormData.assigned_technician_id && (
                  <p className="text-xs text-muted-foreground">
                    Job will be assigned immediately and a WhatsApp notification can be sent.
                  </p>
                )}
              </div>
              )}

              {/* OTP Verification Toggle */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="job_require_otp"
                    checked={newJobFormData.require_otp}
                    onChange={(e) => handleFormChange('require_otp', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-border rounded"
                  />
                  <Label htmlFor="job_require_otp" className="cursor-pointer">
                    Require OTP Verification
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  If enabled, technician will need to enter a 4-digit OTP to complete this job
                </p>
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
            className=""
          >
            {isCreatingJob ? 'Creating...' : 'Create Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewJobDialog;

