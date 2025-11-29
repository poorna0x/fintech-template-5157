import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { 
  Settings as SettingsIcon, 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  User,
  Phone,
  QrCode,
  Package,
  MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import { db, supabase } from '@/lib/supabase';
import { Technician } from '@/types';
import ImageUpload from '@/components/ImageUpload';
import { CommonQrCode, invalidateQrCodesCache } from '@/lib/qrCodeManager';

const Settings = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  

  // Technician management states
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [addTechnicianDialogOpen, setAddTechnicianDialogOpen] = useState(false);
  const [editTechnicianDialogOpen, setEditTechnicianDialogOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  
  // Common QR Code management states
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [addQrCodeDialogOpen, setAddQrCodeDialogOpen] = useState(false);
  const [editQrCodeDialogOpen, setEditQrCodeDialogOpen] = useState(false);
  const [selectedQrCode, setSelectedQrCode] = useState<CommonQrCode | null>(null);
  const [qrCodeFormData, setQrCodeFormData] = useState({
    name: '',
    qrCodeUrl: ''
  });

  // Product QR Code management states
  const [productQrCodes, setProductQrCodes] = useState<any[]>([]);
  const [addProductQrCodeDialogOpen, setAddProductQrCodeDialogOpen] = useState(false);
  const [editProductQrCodeDialogOpen, setEditProductQrCodeDialogOpen] = useState(false);
  const [selectedProductQrCode, setSelectedProductQrCode] = useState<any | null>(null);
  const [productQrCodeFormData, setProductQrCodeFormData] = useState({
    name: '',
    qrCodeUrl: '',
    productImageUrl: '',
    productName: '',
    productDescription: '',
    productMrp: ''
  });
  const [technicianFormData, setTechnicianFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    employeeId: '',
    password: '',
    qrCode: '', // QR code image URL
    photo: '', // Technician photo URL
    baseSalary: 0,
    visibleQrCodes: [] as string[] // Array of QR code IDs visible to this technician
  });
  const [newlyCreatedTechnicianId, setNewlyCreatedTechnicianId] = useState<string | null>(null);

  // Location tracking setting
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('technician_location_tracking_enabled');
    return stored !== null ? stored === 'true' : true; // Default to enabled
  });

  // Load data on component mount
  useEffect(() => {
    loadTechnicians();
    loadCommonQrCodes();
    loadProductQrCodes();
  }, []);

  // Handle location tracking toggle
  const handleLocationTrackingToggle = (enabled: boolean) => {
    setLocationTrackingEnabled(enabled);
    localStorage.setItem('technician_location_tracking_enabled', enabled.toString());
    toast.success(enabled ? 'Location tracking enabled for all technicians' : 'Location tracking disabled for all technicians');
  };

  // Transform technician data from database format to frontend format
  const transformTechnicianData = (tech: any) => ({
    id: tech.id,
    fullName: tech.full_name,
    phone: tech.phone,
    email: tech.email,
    employeeId: tech.employee_id,
    account_status: tech.account_status || 'ACTIVE',
    skills: tech.skills,
    serviceAreas: tech.service_areas,
    status: tech.status,
    currentLocation: tech.current_location,
    workSchedule: tech.work_schedule,
    performance: tech.performance,
    vehicle: tech.vehicle,
    salary: tech.salary,
    qrCode: tech.qr_code || tech.qrCode || '',
    photo: tech.photo || '',
    visibleQrCodes: tech.visible_qr_codes || [],
    createdAt: tech.created_at,
    updatedAt: tech.updated_at
  });

  // Generate ID card link for technician
  const generateIdCardLink = (technicianId: string): string => {
    return `${window.location.origin}/technician-id/${technicianId}`;
  };

  const loadTechnicians = async () => {
    try {
      const { data, error } = await db.technicians.getAll();
      if (error) throw error;
      
      if (data) {
        const transformedTechnicians = data.map(transformTechnicianData);
        setTechnicians(transformedTechnicians);
      }
    } catch (error) {
      console.error('Error loading technicians:', error);
      toast.error('Failed to load technicians');
    }
  };

  // Generate employee ID
  const generateEmployeeId = (): string => {
    const prefix = 'TECH';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  };

  // Technician management functions
  const handleAddTechnician = () => {
    setTechnicianFormData({
      fullName: '',
      phone: '',
      email: '',
      employeeId: generateEmployeeId(),
      password: '',
      qrCode: '',
      photo: '',
      baseSalary: 0,
      visibleQrCodes: []
    });
    setNewlyCreatedTechnicianId(null);
    setAddTechnicianDialogOpen(true);
  };

  const handleEditTechnician = (technician: Technician) => {
    setSelectedTechnician(technician);
    setTechnicianFormData({
      fullName: technician.fullName,
      phone: technician.phone,
      email: technician.email,
      employeeId: technician.employeeId,
      password: '', // Don't show existing password for security
      qrCode: (technician as any).qrCode || '',
      photo: (technician as any).photo || '',
      baseSalary: technician.salary?.baseSalary || 0,
      visibleQrCodes: technician.visibleQrCodes || []
    });
    setNewlyCreatedTechnicianId(null);
    setEditTechnicianDialogOpen(true);
  };

  // Helper function to hash password using serverless function
  const hashPassword = async (password: string): Promise<string> => {
    const apiUrl = import.meta.env.DEV
      ? 'http://localhost:8888/.netlify/functions/hash-technician-password'
      : '/.netlify/functions/hash-technician-password';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Password hashing API error:', response.status, errorText);
        throw new Error('Failed to hash password. Please try again.');
      }

      const result = await response.json();
      return result.hashedPassword;
    } catch (error) {
      console.error('Password hashing error:', error);
      throw new Error('Password hashing service unavailable. Please ensure the development server is running.');
    }
  };

  const handleSaveTechnician = async () => {
    try {
      // Hash password if provided (for new technicians or password updates)
      let hashedPassword: string | undefined = undefined;
      if (technicianFormData.password && technicianFormData.password.trim() !== '') {
        hashedPassword = await hashPassword(technicianFormData.password);
      }

      const technicianData: any = {
        full_name: technicianFormData.fullName,
        phone: technicianFormData.phone,
        email: technicianFormData.email,
        employee_id: technicianFormData.employeeId,
        qr_code: technicianFormData.qrCode || null,
        photo: technicianFormData.photo || null,
        visible_qr_codes: technicianFormData.visibleQrCodes || [],
        account_status: 'ACTIVE',
        skills: {
          serviceTypes: ['RO', 'SOFTENER', 'AC', 'APPLIANCE'],
          certifications: [],
          experience: 0,
          rating: 0
        },
        service_areas: {
          pincodes: [],
          cities: ['Bangalore'],
          maxDistance: 10
        },
        work_schedule: {
          workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
          startTime: '09:00',
          endTime: '18:00',
          breakTime: {
            start: '13:00',
            end: '14:00'
          }
        },
        status: 'OFFLINE',
        performance: {
          totalJobs: 0,
          completedJobs: 0,
          averageRating: 0,
          onTimePercentage: 0,
          customerSatisfaction: 0
        },
        salary: {
          baseSalary: technicianFormData.baseSalary || 0,
          commissionPerJob: 0,
          commissionPercentage: 10 // 10% commission per job
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Add hashed password if provided
      if (hashedPassword) {
        technicianData.password = hashedPassword;
      }

      if (editTechnicianDialogOpen && selectedTechnician) {
        // Update existing technician - only update password if provided
        const updateData = { ...technicianData };
        if (!hashedPassword) {
          delete updateData.password; // Don't update password if not provided
        }
        const { error } = await db.technicians.update(selectedTechnician.id, updateData);
        if (error) throw error;
        toast.success('Technician updated successfully');
      } else {
        // Create new technician - password is required
        if (!hashedPassword) {
          toast.error('Password is required when creating a new technician');
          return;
        }
        
        // Check for duplicate employee_id or phone before creating
        const { data: existingTechnicians } = await db.technicians.getAll();
        if (existingTechnicians) {
          const duplicateEmployeeId = existingTechnicians.find(
            (t: any) => t.employee_id === technicianData.employee_id
          );
          const duplicatePhone = existingTechnicians.find(
            (t: any) => t.phone === technicianData.phone
          );
          const duplicateEmail = existingTechnicians.find(
            (t: any) => t.email.toLowerCase() === technicianData.email.toLowerCase()
          );
          
          if (duplicateEmployeeId) {
            toast.error(`Employee ID "${technicianData.employee_id}" already exists. Please use a different ID.`);
            return;
          }
          if (duplicatePhone) {
            toast.error(`Phone number "${technicianData.phone}" already exists. Please use a different phone number.`);
            return;
          }
          if (duplicateEmail) {
            toast.error(`Email "${technicianData.email}" already exists. Please use a different email address.`);
            return;
          }
        }
        
        const { data: newTechnician, error } = await db.technicians.create(technicianData);
        if (error) {
          // Handle 409 conflict errors with better messages
          if (error.code === '23505') { // PostgreSQL unique violation
            if (error.message.includes('employee_id')) {
              toast.error(`Employee ID "${technicianData.employee_id}" already exists. Please use a different ID.`);
            } else if (error.message.includes('phone')) {
              toast.error(`Phone number "${technicianData.phone}" already exists. Please use a different phone number.`);
            } else if (error.message.includes('email')) {
              toast.error(`Email "${technicianData.email}" already exists. Please use a different email address.`);
            } else {
              toast.error('A technician with this information already exists. Please check employee ID, phone, or email.');
            }
            return;
          }
          throw error;
        }
        
        // Store the newly created technician ID to show link
        if (newTechnician && newTechnician.id) {
          setNewlyCreatedTechnicianId(newTechnician.id);
        }
        
        toast.success('Technician created successfully');
      }

      // Refresh technicians list
      await loadTechnicians();

      // Don't close dialog if we just created a technician (to show ID card link)
      if (editTechnicianDialogOpen || !newlyCreatedTechnicianId) {
      setAddTechnicianDialogOpen(false);
      setEditTechnicianDialogOpen(false);
      setSelectedTechnician(null);
        setNewlyCreatedTechnicianId(null);
      }
    } catch (error) {
      console.error('Error saving technician:', error);
      toast.error('Failed to save technician');
    }
  };

  const handleDeleteTechnician = async (technicianId: string) => {
    try {
      const { error } = await db.technicians.delete(technicianId);
      if (error) throw error;
      
      await loadTechnicians();
      toast.success('Technician deleted successfully');
    } catch (error) {
      console.error('Error deleting technician:', error);
      toast.error('Failed to delete technician');
    }
  };

  // Common QR Code management functions
  const loadCommonQrCodes = async () => {
    try {
      console.log('Loading common QR codes...');
      const { data, error } = await db.commonQrCodes.getAll();
      if (error) {
        console.error('Error fetching QR codes:', error);
        throw error;
      }
      
      console.log('QR codes fetched:', data);
      
      if (data) {
        const transformed = data.map((qr: any) => ({
          id: qr.id,
          name: qr.name,
          qrCodeUrl: qr.qr_code_url,
          createdAt: qr.created_at,
          updatedAt: qr.updated_at
        }));
        console.log('Transformed QR codes:', transformed);
        setCommonQrCodes(transformed);
      } else {
        console.log('No QR codes found in database');
        setCommonQrCodes([]);
      }
    } catch (error) {
      console.error('Error loading common QR codes:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load QR codes: ${errorMessage}`);
    }
  };

  const handleAddQrCode = () => {
    setQrCodeFormData({ name: '', qrCodeUrl: '' });
    setAddQrCodeDialogOpen(true);
  };

  const handleEditQrCode = (qrCode: CommonQrCode) => {
    setSelectedQrCode(qrCode);
    setQrCodeFormData({
      name: qrCode.name,
      qrCodeUrl: qrCode.qrCodeUrl
    });
    setEditQrCodeDialogOpen(true);
  };

  const handleSaveQrCode = async () => {
    try {
      // Validate form data
      if (!qrCodeFormData.name || !qrCodeFormData.name.trim()) {
        toast.error('Please provide a QR code name');
        return;
      }

      if (!qrCodeFormData.qrCodeUrl || !qrCodeFormData.qrCodeUrl.trim()) {
        toast.error('Please upload a QR code image');
        return;
      }

      // Validate URL format
      if (!qrCodeFormData.qrCodeUrl.startsWith('http')) {
        toast.error('Invalid QR code URL. Please upload the image again.');
        return;
      }

      console.log('Saving QR code:', { 
        name: qrCodeFormData.name, 
        qrCodeUrl: qrCodeFormData.qrCodeUrl,
        urlLength: qrCodeFormData.qrCodeUrl.length 
      });

      // Check authentication
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('Current session:', sessionData?.session ? 'Authenticated' : 'Not authenticated');

      if (editQrCodeDialogOpen && selectedQrCode) {
        console.log('Updating QR code with ID:', selectedQrCode.id);
        const { data, error } = await db.commonQrCodes.update(selectedQrCode.id, {
          name: qrCodeFormData.name.trim(),
          qr_code_url: qrCodeFormData.qrCodeUrl.trim()
        });
        if (error) {
          console.error('Error updating QR code:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          toast.error(`Failed to update QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }
        console.log('QR code updated successfully:', data);
        toast.success('QR code updated successfully');
        // Invalidate cache so AdminDashboard will reload
        invalidateQrCodesCache();
      } else {
        console.log('Creating new QR code...');
        const { data, error } = await db.commonQrCodes.create({
          name: qrCodeFormData.name.trim(),
          qr_code_url: qrCodeFormData.qrCodeUrl.trim()
        });
        if (error) {
          console.error('Error creating QR code:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          toast.error(`Failed to create QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }
        console.log('QR code created successfully:', data);
        toast.success('QR code created successfully');
        // Invalidate cache so AdminDashboard will reload
        invalidateQrCodesCache();
      }

      // Reload QR codes after successful save
      console.log('Reloading QR codes...');
      await loadCommonQrCodes();
      
      // Close dialogs and reset form
      setAddQrCodeDialogOpen(false);
      setEditQrCodeDialogOpen(false);
      setSelectedQrCode(null);
      setQrCodeFormData({ name: '', qrCodeUrl: '' });
    } catch (error) {
      console.error('Error saving QR code:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Full error:', error);
      toast.error(`Failed to save QR code: ${errorMessage}`);
    }
  };

  const handleDeleteQrCode = async (qrCodeId: string) => {
    try {
      const { error } = await db.commonQrCodes.delete(qrCodeId);
      if (error) throw error;
      
      await loadCommonQrCodes();
      toast.success('QR code deleted successfully');
      // Invalidate cache so AdminDashboard will reload
      invalidateQrCodesCache();
    } catch (error) {
      console.error('Error deleting QR code:', error);
      toast.error('Failed to delete QR code');
    }
  };

  // Product QR Code management functions
  const loadProductQrCodes = async () => {
    try {
      console.log('Loading product QR codes...');
      const { data, error } = await db.productQrCodes.getAll();
      if (error) {
        console.error('Error fetching product QR codes:', error);
        throw error;
      }
      
      console.log('Product QR codes fetched:', data);
      
      if (data) {
        const transformed = data.map((qr: any) => ({
          id: qr.id,
          name: qr.name,
          qrCodeUrl: qr.qr_code_url,
          productImageUrl: qr.product_image_url || '',
          productName: qr.product_name || '',
          productDescription: qr.product_description || '',
          productMrp: qr.product_mrp || '',
          createdAt: qr.created_at,
          updatedAt: qr.updated_at
        }));
        console.log('Transformed product QR codes:', transformed);
        setProductQrCodes(transformed);
      } else {
        console.log('No product QR codes found in database');
        setProductQrCodes([]);
      }
    } catch (error) {
      console.error('Error loading product QR codes:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load product QR codes: ${errorMessage}`);
    }
  };

  const handleAddProductQrCode = () => {
    setProductQrCodeFormData({ name: '', qrCodeUrl: '', productImageUrl: '', productName: '', productDescription: '', productMrp: '' });
    setAddProductQrCodeDialogOpen(true);
  };

  const handleEditProductQrCode = (qrCode: any) => {
    setSelectedProductQrCode(qrCode);
    setProductQrCodeFormData({
      name: qrCode.name,
      qrCodeUrl: qrCode.qrCodeUrl,
      productImageUrl: qrCode.productImageUrl || '',
      productName: qrCode.productName || '',
      productDescription: qrCode.productDescription || '',
      productMrp: qrCode.productMrp || ''
    });
    setEditProductQrCodeDialogOpen(true);
  };

  const handleSaveProductQrCode = async () => {
    try {
      // Validate form data
      if (!productQrCodeFormData.name || !productQrCodeFormData.name.trim()) {
        toast.error('Please provide a QR code name');
        return;
      }

      let qrCodeUrlToSave = productQrCodeFormData.qrCodeUrl;

      // If no QR code uploaded, generate one automatically from the verification link
      if (!qrCodeUrlToSave || !qrCodeUrlToSave.trim()) {
        // We need to create the entry first to get the ID, then generate QR code
        // For now, we'll generate a temporary link and update it after creation
        toast.info('Generating QR code automatically...');
      }

      console.log('Saving product QR code:', { 
        name: productQrCodeFormData.name, 
        qrCodeUrl: qrCodeUrlToSave,
        productName: productQrCodeFormData.productName,
        productDescription: productQrCodeFormData.productDescription
      });

      let createdQrCodeId: string | null = null;

      if (editProductQrCodeDialogOpen && selectedProductQrCode) {
        // Update existing - generate QR code if not provided
        if (!qrCodeUrlToSave || !qrCodeUrlToSave.trim() || !qrCodeUrlToSave.startsWith('http')) {
          const verificationLink = generateProductVerificationLink(selectedProductQrCode.id);
          qrCodeUrlToSave = generateQrCodeImageUrl(verificationLink);
        }

        console.log('Updating product QR code with ID:', selectedProductQrCode.id);
        const { data, error } = await db.productQrCodes.update(selectedProductQrCode.id, {
          name: productQrCodeFormData.name.trim(),
          qr_code_url: qrCodeUrlToSave.trim(),
          product_image_url: productQrCodeFormData.productImageUrl.trim() || null,
          product_name: productQrCodeFormData.productName.trim() || null,
          product_description: productQrCodeFormData.productDescription.trim() || null,
          product_mrp: productQrCodeFormData.productMrp.trim() || null
        });
        if (error) {
          console.error('Error updating product QR code:', error);
          toast.error(`Failed to update product QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }
        console.log('Product QR code updated successfully:', data);
        toast.success('Product QR code updated successfully');
      } else {
        // Create new - first create entry, then generate QR code
        console.log('Creating new product QR code...');
        const { data, error } = await db.productQrCodes.create({
          name: productQrCodeFormData.name.trim(),
          qr_code_url: qrCodeUrlToSave.trim() || '', // Temporary, will update
          product_image_url: productQrCodeFormData.productImageUrl.trim() || undefined,
          product_name: productQrCodeFormData.productName.trim() || undefined,
          product_description: productQrCodeFormData.productDescription.trim() || undefined,
          product_mrp: productQrCodeFormData.productMrp.trim() || undefined
        });
        if (error) {
          console.error('Error creating product QR code:', error);
          toast.error(`Failed to create product QR code: ${error.message || JSON.stringify(error)}`);
          return;
        }

        if (data && data.id) {
          createdQrCodeId = data.id;
          // Generate QR code from verification link
          const verificationLink = generateProductVerificationLink(data.id);
          const generatedQrCodeUrl = generateQrCodeImageUrl(verificationLink);
          
          // Update with generated QR code
          const { error: updateError } = await db.productQrCodes.update(data.id, {
            qr_code_url: generatedQrCodeUrl
          });
          
          if (updateError) {
            console.error('Error updating QR code URL:', updateError);
            // Don't fail - QR code was created, just URL generation failed
          }
        }

        console.log('Product QR code created successfully:', data);
        toast.success('Product QR code created successfully');
      }

      // Reload product QR codes after successful save
      console.log('Reloading product QR codes...');
      await loadProductQrCodes();
      
      // Close dialogs and reset form
      setAddProductQrCodeDialogOpen(false);
      setEditProductQrCodeDialogOpen(false);
      setSelectedProductQrCode(null);
      setProductQrCodeFormData({ name: '', qrCodeUrl: '', productImageUrl: '', productName: '', productDescription: '', productMrp: '' });
    } catch (error) {
      console.error('Error saving product QR code:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Full error:', error);
      toast.error(`Failed to save product QR code: ${errorMessage}`);
    }
  };

  const handleDeleteProductQrCode = async (qrCodeId: string) => {
    try {
      const { error } = await db.productQrCodes.delete(qrCodeId);
      if (error) throw error;
      
      await loadProductQrCodes();
      toast.success('Product QR code deleted successfully');
    } catch (error) {
      console.error('Error deleting product QR code:', error);
      toast.error('Failed to delete product QR code');
    }
  };

  // Generate product verification link for QR code
  const generateProductVerificationLink = (qrCodeId: string): string => {
    return `${window.location.origin}/product-verify/${qrCodeId}`;
  };

  // Generate QR code image URL from verification link
  const generateQrCodeImageUrl = (link: string): string => {
    // Using QR Server API (free, no API key needed)
    const encodedLink = encodeURIComponent(link);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedLink}`;
  };



  // Note: Currently allows unauthenticated access, but RLS policies need to be updated
  // Run supabase-qr-codes-rls-fix.sql to allow unauthenticated access

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
            <div className="flex items-center">
              <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">Settings</h1>
                <p className="text-xs sm:text-sm text-gray-600">Manage technician accounts</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin')}
                className="text-gray-600 hover:text-gray-900 -ml-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="space-y-4 sm:space-y-6">
          {/* Common QR Codes Management */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <QrCode className="w-5 h-5" />
                    Common Payment QR Codes
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Manage QR codes available to all technicians for payment scanning
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleAddQrCode} 
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add QR Code
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {commonQrCodes.map((qrCode) => (
                  <Card key={qrCode.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{qrCode.name}</h3>
                        </div>
                      </div>
                      
                      {qrCode.qrCodeUrl && (
                        <div className="mb-4 flex justify-center">
                          <img 
                            src={qrCode.qrCodeUrl} 
                            alt={qrCode.name} 
                            className="w-32 h-32 object-contain border border-gray-200 rounded"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditQrCode(qrCode)}
                          className="flex-1 text-xs sm:text-sm"
                        >
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 px-2 sm:px-3"
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="mx-4 sm:mx-0">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete QR Code</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{qrCode.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteQrCode(qrCode.id)}
                                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {commonQrCodes.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    No QR codes added yet. Click "Add QR Code" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Product QR Codes Management */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Package className="w-5 h-5" />
                    Product Verification QR Codes
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Manage QR codes for product verification. When scanned, these QR codes will show "Genuine Product"
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleAddProductQrCode} 
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product QR Code
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {productQrCodes.map((qrCode) => (
                  <Card key={qrCode.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{qrCode.name}</h3>
                          {qrCode.productName && (
                            <p className="text-xs text-gray-600 mt-1 truncate">Product: {qrCode.productName}</p>
                          )}
                        </div>
                      </div>
                      
                      {qrCode.qrCodeUrl && (
                        <div className="mb-4 flex justify-center">
                          <img 
                            src={qrCode.qrCodeUrl} 
                            alt={qrCode.name} 
                            className="w-32 h-32 object-contain border border-gray-200 rounded"
                          />
                        </div>
                      )}

                      {/* Verification Link */}
                      <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-green-900 dark:text-green-200 mb-1">Verification Link:</p>
                            <p className="text-xs text-green-700 dark:text-green-300 truncate font-mono">
                              {generateProductVerificationLink(qrCode.id)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(generateProductVerificationLink(qrCode.id));
                              toast.success('Verification link copied!');
                            }}
                            className="shrink-0 h-8 w-8 p-0"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditProductQrCode(qrCode)}
                          className="flex-1 text-xs sm:text-sm"
                        >
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 px-2 sm:px-3"
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="mx-4 sm:mx-0">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Product QR Code</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{qrCode.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteProductQrCode(qrCode.id)}
                                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {productQrCodes.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    No product QR codes added yet. Click "Add Product QR Code" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Technician Management */}
            <Card>
              <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                      <Users className="w-5 h-5" />
                      Technician Management
                    </CardTitle>
                  <CardDescription className="text-sm mt-1">
                      Manage technician accounts and permissions
                    </CardDescription>
                  </div>
                <Button 
                  onClick={handleAddTechnician} 
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  size="sm"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Technician
                  </Button>
                </div>
              </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {technicians.map((technician) => (
                    <Card key={technician.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{technician.fullName}</h3>
                          <p className="text-xs sm:text-sm text-gray-600 truncate">{technician.employeeId}</p>
                          </div>
                          <Badge 
                            variant={technician.account_status === 'ACTIVE' ? 'default' : 'secondary'}
                          className="text-xs shrink-0"
                          >
                            {technician.account_status}
                          </Badge>
                        </div>
                        
                      <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-gray-600 mb-4">
                        <div className="flex items-start gap-2">
                          <span className="font-medium shrink-0">Email:</span>
                          <span className="truncate">{technician.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                          <span className="font-medium shrink-0">Phone:</span>
                          <span className="truncate">{technician.phone}</span>
                          </div>
                          {/* Last Location */}
                          {technician.currentLocation && technician.currentLocation.latitude && technician.currentLocation.longitude ? (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <button
                                  onClick={() => {
                                    const url = `https://www.google.com/maps?q=${technician.currentLocation?.latitude},${technician.currentLocation?.longitude}`;
                                    window.open(url, '_blank');
                                  }}
                                  className="text-blue-600 hover:text-blue-700 hover:underline truncate block text-left"
                                  title="Click to open in Google Maps"
                                >
                                  {technician.currentLocation.latitude.toFixed(6)}, {technician.currentLocation.longitude.toFixed(6)}
                                </button>
                                {technician.currentLocation.lastUpdated && (
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    Last updated: {new Date(technician.currentLocation.lastUpdated).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-gray-400">
                              <MapPin className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
                              <span className="text-xs">No location data</span>
                            </div>
                          )}
                        </div>

                        {/* ID Card Link */}
                        <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-blue-900 dark:text-blue-200 mb-1">ID Card Link:</p>
                              <p className="text-xs text-blue-700 dark:text-blue-300 truncate font-mono">
                                {generateIdCardLink(technician.id)}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(generateIdCardLink(technician.id));
                                toast.success('ID Card link copied!');
                              }}
                              className="shrink-0 h-8 w-8 p-0"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditTechnician(technician)}
                          className="flex-1 text-xs sm:text-sm"
                          >
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-600 hover:text-red-700 px-2 sm:px-3"
                            >
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                              </Button>
                            </AlertDialogTrigger>
                          <AlertDialogContent className="mx-4 sm:mx-0">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Technician</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {technician.fullName}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteTechnician(technician.id)}
                                className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

          {/* Location Tracking Setting - At Bottom */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <MapPin className="w-5 h-5" />
                Location Tracking Settings
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Control whether technicians' current location is automatically tracked and updated
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between p-6 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-base sm:text-lg mb-2">
                    Enable Location Tracking
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                    When enabled, technicians' location will be automatically updated when they open the app or refresh the page. 
                    This helps calculate distances to customer locations.
                  </p>
                </div>
                <Switch
                  checked={locationTrackingEnabled}
                  onCheckedChange={handleLocationTrackingToggle}
                  className="ml-6 border-2 border-gray-300 dark:border-gray-600 data-[state=unchecked]:bg-white dark:data-[state=unchecked]:bg-gray-700"
                />
              </div>
            </CardContent>
          </Card>
                </div>
      </div>

      {/* Add/Edit Technician Dialog */}
      <Dialog open={addTechnicianDialogOpen || editTechnicianDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddTechnicianDialogOpen(false);
          setEditTechnicianDialogOpen(false);
          setSelectedTechnician(null);
        }
      }}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTechnicianDialogOpen ? 'Edit Technician' : 'Add New Technician'}
            </DialogTitle>
            <DialogDescription>
              {editTechnicianDialogOpen 
                ? 'Update technician information and credentials'
                : 'Create a new technician account with login credentials'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={technicianFormData.fullName}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <Label htmlFor="employeeId">Employee ID *</Label>
                  <Input
                    id="employeeId"
                    value={technicianFormData.employeeId}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                    placeholder="Auto-generated"
                    className="bg-gray-50"
                    readOnly={!editTechnicianDialogOpen}
                  />
                  {!editTechnicianDialogOpen && (
                    <p className="text-xs text-gray-500 mt-1">Employee ID is auto-generated</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    value={technicianFormData.phone}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter phone number"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={technicianFormData.email}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <Label htmlFor="password">
                    Password {editTechnicianDialogOpen ? '(leave blank to keep current)' : '*'}
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={technicianFormData.password}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={editTechnicianDialogOpen ? "Enter new password (optional)" : "Enter password"}
                  />
                </div>
                <div>
                  <Label htmlFor="baseSalary">Basic Salary (INR) *</Label>
                  <Input
                    id="baseSalary"
                    type="number"
                    min="0"
                    step="100"
                    value={technicianFormData.baseSalary || ''}
                    onChange={(e) => setTechnicianFormData(prev => ({ ...prev, baseSalary: parseFloat(e.target.value) || 0 }))}
                    placeholder="Enter basic salary"
                  />
                  <p className="text-xs text-gray-500 mt-1">Monthly basic salary for this technician</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Technician Photo</h3>
              <div>
                <Label>Upload Technician Photo (Optional)</Label>
                <p className="text-sm text-gray-500 mb-2">Upload photo for ID card display</p>
                <ImageUpload
                  onImagesChange={(images) => setTechnicianFormData(prev => ({ ...prev, photo: images[0] || '' }))}
                  maxImages={1}
                  folder="technician-photos"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {technicianFormData.photo && (
                  <div className="mt-2">
                    <img 
                      src={technicianFormData.photo} 
                      alt="Technician Photo" 
                      className="w-32 h-32 object-cover border border-gray-200 rounded-full"
                    />
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Payment QR Code</h3>
              <div>
                <Label>Upload Payment QR Code (Optional)</Label>
                <p className="text-sm text-gray-500 mb-2">Upload QR code for payment scanning</p>
                <ImageUpload
                  onImagesChange={(images) => setTechnicianFormData(prev => ({ ...prev, qrCode: images[0] || '' }))}
                  maxImages={1}
                  folder="technician-qr-codes"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {technicianFormData.qrCode && (
                  <div className="mt-2">
                    <img 
                      src={technicianFormData.qrCode} 
                      alt="QR Code" 
                      className="w-32 h-32 object-contain border border-gray-200 rounded"
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* QR Code Visibility Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">QR Code Visibility</h3>
              <div>
                <Label>Select which QR codes this technician can see</Label>
                <p className="text-sm text-gray-500 mb-3">Control which payment QR codes are available to this technician</p>
                
                <div className="space-y-3">
                  {/* Show All Option */}
                  <div className="flex items-center space-x-2 p-3 border rounded-lg">
                    <Checkbox
                      id="qr-all"
                      checked={technicianFormData.visibleQrCodes.includes('all')}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTechnicianFormData(prev => ({ ...prev, visibleQrCodes: ['all'] }));
                        } else {
                          setTechnicianFormData(prev => ({ ...prev, visibleQrCodes: [] }));
                        }
                      }}
                    />
                    <Label htmlFor="qr-all" className="font-medium cursor-pointer flex-1">
                      Show All QR Codes
                    </Label>
                  </div>
                  
                  {/* Common QR Codes */}
                  {commonQrCodes.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Common QR Codes:</Label>
                      {commonQrCodes.map((qr) => {
                        const qrId = `common_${qr.id}`;
                        const isChecked = technicianFormData.visibleQrCodes.includes(qrId);
                        const isAllSelected = technicianFormData.visibleQrCodes.includes('all');
                        
                        return (
                          <div key={qr.id} className="flex items-center space-x-2 p-2 border rounded-lg">
                            <Checkbox
                              id={qrId}
                              checked={isChecked || isAllSelected}
                              disabled={isAllSelected}
                              onCheckedChange={(checked) => {
                                if (isAllSelected) return;
                                
                                if (checked) {
                                  setTechnicianFormData(prev => ({
                                    ...prev,
                                    visibleQrCodes: [...prev.visibleQrCodes.filter(id => id !== 'all'), qrId]
                                  }));
                                } else {
                                  setTechnicianFormData(prev => ({
                                    ...prev,
                                    visibleQrCodes: prev.visibleQrCodes.filter(id => id !== qrId)
                                  }));
                                }
                              }}
                            />
                            <Label htmlFor={qrId} className="cursor-pointer flex-1 text-sm">
                              {qr.name}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Technician QR Codes */}
                  {technicians.filter(t => (t as any).qrCode && (t as any).qrCode.trim() !== '').length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Technician QR Codes:</Label>
                      {technicians
                        .filter(t => (t as any).qrCode && (t as any).qrCode.trim() !== '')
                        .map((tech) => {
                          const qrId = `technician_${tech.id}`;
                          const isChecked = technicianFormData.visibleQrCodes.includes(qrId);
                          const isAllSelected = technicianFormData.visibleQrCodes.includes('all');
                          
                          return (
                            <div key={tech.id} className="flex items-center space-x-2 p-2 border rounded-lg">
                              <Checkbox
                                id={qrId}
                                checked={isChecked || isAllSelected}
                                disabled={isAllSelected}
                                onCheckedChange={(checked) => {
                                  if (isAllSelected) return;
                                  
                                  if (checked) {
                                    setTechnicianFormData(prev => ({
                                      ...prev,
                                      visibleQrCodes: [...prev.visibleQrCodes.filter(id => id !== 'all'), qrId]
                                    }));
                                  } else {
                                    setTechnicianFormData(prev => ({
                                      ...prev,
                                      visibleQrCodes: prev.visibleQrCodes.filter(id => id !== qrId)
                                    }));
                                  }
                                }}
                              />
                              <Label htmlFor={qrId} className="cursor-pointer flex-1 text-sm">
                                {tech.fullName}'s QR Code
                              </Label>
                            </div>
                          );
                        })}
                    </div>
                  )}
                  
                  {commonQrCodes.length === 0 && technicians.filter(t => (t as any).qrCode && (t as any).qrCode.trim() !== '').length === 0 && (
                    <p className="text-sm text-gray-500 italic">No QR codes available. Add common QR codes or upload QR codes for technicians.</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Show ID Card Link after creation */}
            {newlyCreatedTechnicianId && (
              <div className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-green-900 dark:text-green-200 mb-2">
                      Technician Created Successfully!
                    </h3>
                    <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                      Copy the ID Card link below and use any QR code generator to create a QR code for this technician.
                    </p>
                    <div className="bg-white dark:bg-gray-800 p-3 rounded border border-green-200 dark:border-green-700">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">ID Card Link:</Label>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(generateIdCardLink(newlyCreatedTechnicianId));
                              toast.success('Link copied to clipboard!');
                            }}
                            className="h-7 px-2 text-xs"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              window.open(generateIdCardLink(newlyCreatedTechnicianId), '_blank');
                            }}
                            className="h-7 px-2 text-xs"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Open
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
                        {generateIdCardLink(newlyCreatedTechnicianId)}
                      </p>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                      💡 Tip: Visit <a href="https://www.qr-code-generator.com" target="_blank" rel="noopener noreferrer" className="underline">qr-code-generator.com</a> or any QR generator, paste this link, and download the QR code image.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddTechnicianDialogOpen(false);
                setEditTechnicianDialogOpen(false);
                setSelectedTechnician(null);
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTechnician}
              disabled={!technicianFormData.fullName || !technicianFormData.phone || !technicianFormData.email || !technicianFormData.employeeId || (!editTechnicianDialogOpen && !technicianFormData.password) || technicianFormData.baseSalary < 0}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              {editTechnicianDialogOpen ? 'Update Technician' : 'Create Technician'}
            </Button>
            {newlyCreatedTechnicianId && (
              <Button
                variant="outline"
                onClick={() => {
                  setAddTechnicianDialogOpen(false);
                  setEditTechnicianDialogOpen(false);
                  setSelectedTechnician(null);
                  setNewlyCreatedTechnicianId(null);
                }}
                className="w-full sm:w-auto"
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Common QR Code Dialog */}
      <Dialog open={addQrCodeDialogOpen || editQrCodeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddQrCodeDialogOpen(false);
          setEditQrCodeDialogOpen(false);
          setSelectedQrCode(null);
          setQrCodeFormData({ name: '', qrCodeUrl: '' });
        }
      }}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editQrCodeDialogOpen ? 'Edit QR Code' : 'Add New QR Code'}
            </DialogTitle>
            <DialogDescription>
              {editQrCodeDialogOpen 
                ? 'Update QR code information'
                : 'Create a new common QR code for payment scanning'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Debug info - remove in production */}
            {import.meta.env.DEV && (
              <div className="p-2 bg-gray-100 rounded text-xs">
                <p><strong>Debug Info:</strong></p>
                <p>Name: {qrCodeFormData.name || '(empty)'}</p>
                <p>URL: {qrCodeFormData.qrCodeUrl ? `${qrCodeFormData.qrCodeUrl.substring(0, 50)}...` : '(empty)'}</p>
                <p>Button disabled: {(!qrCodeFormData.name || !qrCodeFormData.qrCodeUrl) ? 'YES' : 'NO'}</p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <Label htmlFor="qrCodeName">QR Code Name *</Label>
                <Input
                  id="qrCodeName"
                  value={qrCodeFormData.name}
                  onChange={(e) => {
                    console.log('Name changed:', e.target.value);
                    setQrCodeFormData(prev => ({ ...prev, name: e.target.value }));
                  }}
                  placeholder="e.g., Company UPI QR, Main Account QR"
                />
              </div>
              
              <div>
                <Label>Upload QR Code Image *</Label>
                <p className="text-sm text-gray-500 mb-2">Upload QR code image for payment scanning</p>
                <ImageUpload
                  onImagesChange={(images) => {
                    console.log('ImageUpload callback called with images:', images);
                    const url = images[0] || '';
                    console.log('Setting QR code URL:', url);
                    setQrCodeFormData(prev => {
                      const updated = { ...prev, qrCodeUrl: url };
                      console.log('Updated qrCodeFormData:', updated);
                      return updated;
                    });
                  }}
                  maxImages={1}
                  folder="common-qr-codes"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {qrCodeFormData.qrCodeUrl && (
                  <div className="mt-2">
                    <img 
                      src={qrCodeFormData.qrCodeUrl} 
                      alt="QR Code" 
                      className="w-32 h-32 object-contain border border-gray-200 rounded"
                    />
                    <p className="text-xs text-gray-500 mt-1">URL: {qrCodeFormData.qrCodeUrl.substring(0, 50)}...</p>
                  </div>
                )}
                {!qrCodeFormData.qrCodeUrl && (
                  <p className="text-xs text-red-500 mt-1">No QR code uploaded yet</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddQrCodeDialogOpen(false);
                setEditQrCodeDialogOpen(false);
                setSelectedQrCode(null);
                setQrCodeFormData({ name: '', qrCodeUrl: '' });
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                console.log('Create/Update QR Code button clicked');
                console.log('Current form data:', qrCodeFormData);
                console.log('Form validation:', {
                  hasName: !!qrCodeFormData.name,
                  hasUrl: !!qrCodeFormData.qrCodeUrl,
                  nameValue: qrCodeFormData.name,
                  urlValue: qrCodeFormData.qrCodeUrl
                });
                handleSaveQrCode();
              }}
              disabled={!qrCodeFormData.name || !qrCodeFormData.qrCodeUrl}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              {editQrCodeDialogOpen ? 'Update QR Code' : 'Create QR Code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Product QR Code Dialog */}
      <Dialog open={addProductQrCodeDialogOpen || editProductQrCodeDialogOpen}           onOpenChange={(open) => {
        if (!open) {
          setAddProductQrCodeDialogOpen(false);
          setEditProductQrCodeDialogOpen(false);
          setSelectedProductQrCode(null);
          setProductQrCodeFormData({ name: '', qrCodeUrl: '', productImageUrl: '', productName: '', productDescription: '', productMrp: '' });
        }
      }}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editProductQrCodeDialogOpen ? 'Edit Product QR Code' : 'Add New Product QR Code'}
            </DialogTitle>
            <DialogDescription>
              {editProductQrCodeDialogOpen 
                ? 'Update product QR code information'
                : 'Create a new QR code for product verification. When scanned, it will show "Genuine Product"'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="productQrCodeName">Product Identifier/Name *</Label>
                <Input
                  id="productQrCodeName"
                  value={productQrCodeFormData.name}
                  onChange={(e) => {
                    setProductQrCodeFormData(prev => ({ ...prev, name: e.target.value }));
                  }}
                  placeholder="e.g., Product Model XYZ, Batch 2024"
                />
                <p className="text-xs text-gray-500 mt-1">This will be displayed on the verification page</p>
              </div>

              <div>
                <Label htmlFor="productName">Product Name (Optional)</Label>
                <Input
                  id="productName"
                  value={productQrCodeFormData.productName}
                  onChange={(e) => {
                    setProductQrCodeFormData(prev => ({ ...prev, productName: e.target.value }));
                  }}
                  placeholder="e.g., RO Filter Cartridge"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty if you don't want to show product name</p>
              </div>

              <div>
                <Label htmlFor="productDescription">Product Description (Optional)</Label>
                <textarea
                  id="productDescription"
                  value={productQrCodeFormData.productDescription}
                  onChange={(e) => {
                    setProductQrCodeFormData(prev => ({ ...prev, productDescription: e.target.value }));
                  }}
                  placeholder="Additional product information..."
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty if you don't want to show description</p>
              </div>

              <div>
                <Label htmlFor="productMrp">MRP - Maximum Retail Price (Optional)</Label>
                <Input
                  id="productMrp"
                  value={productQrCodeFormData.productMrp}
                  onChange={(e) => {
                    setProductQrCodeFormData(prev => ({ ...prev, productMrp: e.target.value }));
                  }}
                  placeholder="e.g., ₹1,299 or ₹1,299.00"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty if you don't want to show MRP</p>
              </div>
              
              <div>
                <Label>Product Photo (Optional)</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Upload a product photo. If not uploaded, product photo won't be displayed on the verification page.
                </p>
                <ImageUpload
                  onImagesChange={(images) => {
                    const url = images[0] || '';
                    setProductQrCodeFormData(prev => ({ ...prev, productImageUrl: url }));
                  }}
                  maxImages={1}
                  folder="product-images"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {productQrCodeFormData.productImageUrl && (
                  <div className="mt-2">
                    <img 
                      src={productQrCodeFormData.productImageUrl} 
                      alt="Product" 
                      className="w-32 h-32 object-cover border border-border rounded"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Product photo uploaded</p>
                  </div>
                )}
                {!productQrCodeFormData.productImageUrl && (
                  <div className="mt-2 p-3 bg-muted/50 rounded border border-border">
                    <p className="text-xs text-muted-foreground">
                      No product photo uploaded. Product photo won't be displayed on verification page.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-3 bg-primary/10 rounded border border-primary/20">
                <p className="text-xs text-primary font-medium mb-1">
                  ℹ️ QR Code Information
                </p>
                <p className="text-xs text-muted-foreground">
                  QR code will be generated automatically from the verification link when you save. No need to upload QR code image.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddProductQrCodeDialogOpen(false);
                setEditProductQrCodeDialogOpen(false);
                setSelectedProductQrCode(null);
                setProductQrCodeFormData({ name: '', qrCodeUrl: '', productImageUrl: '', productName: '', productDescription: '', productMrp: '' });
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProductQrCode}
              disabled={!productQrCodeFormData.name}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
            >
              {editProductQrCodeDialogOpen ? 'Update Product QR Code' : 'Create Product QR Code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;