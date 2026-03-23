import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  MapPin,
  Download,
  Receipt,
  FileText,
  LogOut,
  ListTodo,
  PhoneCall,
  RefreshCw,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { db, supabase } from '@/lib/supabase';
import { Technician } from '@/types';
import ImageUpload from '@/components/ImageUpload';
import { CommonQrCode, invalidateQrCodesCache } from '@/lib/qrCodeManager';
import JSZip from 'jszip';
import CallingPage from '@/pages/CallingPage';
import { SettingsRemindersDialog } from '@/components/reminders/SettingsRemindersDialog';
import { SettingsPendingPaymentsDialogV2 } from '@/components/reminders/PendingPaymentsDialogV2';

const Settings = () => {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  

  // Technician management states
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [addTechnicianDialogOpen, setAddTechnicianDialogOpen] = useState(false);
  const [editTechnicianDialogOpen, setEditTechnicianDialogOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  
  // Common QR Code management states (payment QR codes)
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [addQrCodeDialogOpen, setAddQrCodeDialogOpen] = useState(false);
  const [editQrCodeDialogOpen, setEditQrCodeDialogOpen] = useState(false);
  const [selectedQrCode, setSelectedQrCode] = useState<CommonQrCode | null>(null);
  const [qrCodeFormData, setQrCodeFormData] = useState({
    name: '',
    qrCodeUrl: ''
  });

  // Common QR (non-payment) management states - shown below payment QR on technician app
  const [technicianCommonQrCodes, setTechnicianCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [addTechnicianCommonQrDialogOpen, setAddTechnicianCommonQrDialogOpen] = useState(false);
  const [editTechnicianCommonQrDialogOpen, setEditTechnicianCommonQrDialogOpen] = useState(false);
  const [selectedTechnicianCommonQr, setSelectedTechnicianCommonQr] = useState<CommonQrCode | null>(null);
  const [technicianCommonQrFormData, setTechnicianCommonQrFormData] = useState({ name: '', qrCodeUrl: '' });

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
    visibleQrCodes: [] as string[], // Array of QR code IDs visible to this technician
    commonQrCodeIds: [] as string[] // Common QRs to show to this technician (below payment QR), multiple allowed
  });
  const [newlyCreatedTechnicianId, setNewlyCreatedTechnicianId] = useState<string | null>(null);

  // Location tracking setting
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('technician_location_tracking_enabled');
    return stored !== null ? stored === 'true' : true; // Default to enabled
  });

  // Download data state
  const [isDownloading, setIsDownloading] = useState(false);

  // Todo management states
  const [todos, setTodos] = useState<Array<{ id: string; text: string; created_at: string }>>([]);
  const [addTodoDialogOpen, setAddTodoDialogOpen] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [todoToDelete, setTodoToDelete] = useState<string | null>(null);

  // Calling view state
  const [showCallingPage, setShowCallingPage] = useState(false);

  // Reminders dialog (view/search, no add)
  const [remindersDialogOpen, setRemindersDialogOpen] = useState(false);

  // Pending payments dialog (lazy load, add/edit/complete)
  const [pendingPaymentsDialogOpen, setPendingPaymentsDialogOpen] = useState(false);
  const [pendingPaymentsInitialAction, setPendingPaymentsInitialAction] = useState<'list' | 'add'>('list');

  // Load data on component mount
  useEffect(() => {
    loadTechnicians();
    loadCommonQrCodes();
    loadTechnicianCommonQrCodes();
    loadProductQrCodes();
    loadTodos();
  }, []);

  // Handle location tracking toggle
  const handleLocationTrackingToggle = (enabled: boolean) => {
    setLocationTrackingEnabled(enabled);
    localStorage.setItem('technician_location_tracking_enabled', enabled.toString());
    // Dispatch custom event so other tabs/pages can react immediately
    window.dispatchEvent(new CustomEvent('locationTrackingChanged', {
      detail: { enabled }
    }));
    toast.success(enabled ? '✅ Location tracking enabled - technicians\' locations will be automatically updated' : '🚫 Location tracking disabled - all location updates are now blocked');
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
    commonQrCodeIds: Array.isArray(tech.common_qr_code_ids) ? tech.common_qr_code_ids : (tech.common_qr_code_id ? [tech.common_qr_code_id] : []),
    createdAt: tech.created_at,
    updatedAt: tech.updated_at
  });

  // Generate ID card link for technician
  const generateIdCardLink = (technicianId: string): string => {
    return `${window.location.origin}/technician-id/${technicianId}`;
  };

  const loadTechnicians = async () => {
    try {
      // OPTIMIZATION: Limit technicians fetch
      const { data, error } = await db.technicians.getAll(100);
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
      visibleQrCodes: [],
      commonQrCodeIds: []
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
      visibleQrCodes: technician.visibleQrCodes || [],
      commonQrCodeIds: (technician as any).commonQrCodeIds || []
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
        common_qr_code_ids: technicianFormData.commonQrCodeIds || [],
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
        // OPTIMIZATION: Limit check to recent technicians (duplicates are usually recent)
        const { data: existingTechnicians } = await db.technicians.getAll(500);
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

  // Common QR (non-payment) management functions
  const loadTechnicianCommonQrCodes = async () => {
    try {
      const { data, error } = await db.technicianCommonQr.getAll();
      if (error) throw error;
      if (data) {
        const transformed = data.map((qr: any) => ({
          id: qr.id,
          name: qr.name,
          qrCodeUrl: qr.qr_code_url,
          createdAt: qr.created_at,
          updatedAt: qr.updated_at
        }));
        setTechnicianCommonQrCodes(transformed);
      } else {
        setTechnicianCommonQrCodes([]);
      }
    } catch (error) {
      console.error('Error loading technician common QR codes:', error);
      setTechnicianCommonQrCodes([]);
    }
  };

  const handleAddTechnicianCommonQr = () => {
    setTechnicianCommonQrFormData({ name: '', qrCodeUrl: '' });
    setAddTechnicianCommonQrDialogOpen(true);
  };

  const handleEditTechnicianCommonQr = (qrCode: CommonQrCode) => {
    setSelectedTechnicianCommonQr(qrCode);
    setTechnicianCommonQrFormData({ name: qrCode.name, qrCodeUrl: qrCode.qrCodeUrl });
    setEditTechnicianCommonQrDialogOpen(true);
  };

  const handleSaveTechnicianCommonQr = async () => {
    try {
      if (!technicianCommonQrFormData.name?.trim()) {
        toast.error('Please provide a name');
        return;
      }
      if (!technicianCommonQrFormData.qrCodeUrl?.trim() || !technicianCommonQrFormData.qrCodeUrl.startsWith('http')) {
        toast.error('Please upload a valid QR code image');
        return;
      }
      if (editTechnicianCommonQrDialogOpen && selectedTechnicianCommonQr) {
        const { error } = await db.technicianCommonQr.update(selectedTechnicianCommonQr.id, {
          name: technicianCommonQrFormData.name.trim(),
          qr_code_url: technicianCommonQrFormData.qrCodeUrl.trim()
        });
        if (error) throw error;
        toast.success('Common QR updated successfully');
      } else {
        const { error } = await db.technicianCommonQr.create({
          name: technicianCommonQrFormData.name.trim(),
          qr_code_url: technicianCommonQrFormData.qrCodeUrl.trim()
        });
        if (error) throw error;
        toast.success('Common QR created successfully');
      }
      await loadTechnicianCommonQrCodes();
      setAddTechnicianCommonQrDialogOpen(false);
      setEditTechnicianCommonQrDialogOpen(false);
      setSelectedTechnicianCommonQr(null);
      setTechnicianCommonQrFormData({ name: '', qrCodeUrl: '' });
    } catch (error) {
      console.error('Error saving technician common QR:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save Common QR');
    }
  };

  const handleDeleteTechnicianCommonQr = async (qrCodeId: string) => {
    try {
      const { error } = await db.technicianCommonQr.delete(qrCodeId);
      if (error) throw error;
      await loadTechnicianCommonQrCodes();
      toast.success('Common QR deleted successfully');
    } catch (error) {
      console.error('Error deleting technician common QR:', error);
      toast.error('Failed to delete Common QR');
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

  // Todo management functions
  const loadTodos = async () => {
    try {
      const { data, error } = await db.adminTodos.getAll();
      if (error) throw error;
      
      if (data) {
        setTodos(data);
      } else {
        setTodos([]);
      }
    } catch (error) {
      console.error('Error loading todos:', error);
      toast.error('Failed to load todos');
    }
  };

  const handleAddTodo = () => {
    setNewTodoText('');
    setAddTodoDialogOpen(true);
  };

  const handleSaveTodo = async () => {
    try {
      if (!newTodoText || !newTodoText.trim()) {
        toast.error('Please enter a task');
        return;
      }

      const { data, error } = await db.adminTodos.create({ text: newTodoText.trim() });
      if (error) throw error;
      
      toast.success('Task added successfully');
      await loadTodos();
      setAddTodoDialogOpen(false);
      setNewTodoText('');
    } catch (error: any) {
      console.error('Error saving todo:', error);
      console.error('Error details:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        fullError: JSON.stringify(error, null, 2)
      });
      
      if (error?.code === '42501') {
        toast.error('Permission denied. Please run the RLS fix SQL script in Supabase.');
      } else {
        const errorMsg = error?.message || error?.details || 'Unknown error';
        toast.error('Failed to add task: ' + errorMsg);
      }
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    try {
      const { error } = await db.adminTodos.delete(todoId);
      if (error) throw error;
      
      toast.success('Task completed');
      await loadTodos();
      setTodoToDelete(null);
    } catch (error) {
      console.error('Error deleting todo:', error);
      toast.error('Failed to complete task');
      setTodoToDelete(null);
    }
  };

  const handleTodoCheckboxClick = (todoId: string) => {
    setTodoToDelete(todoId);
  };

  // Helper function to convert data to CSV
  const convertToCSV = (data: any[], tableName: string): string => {
    if (!data || data.length === 0) {
      return `Table: ${tableName}\nNo data available\n`;
    }

    // Get all unique keys from all objects
    const allKeys = new Set<string>();
    data.forEach(item => {
      Object.keys(item).forEach(key => allKeys.add(key));
    });

    const headers = Array.from(allKeys);
    
    // Create CSV header
    const csvHeader = headers.map(header => {
      // Escape commas and quotes in header
      const escaped = String(header).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(',');

    // Create CSV rows
    const csvRows = data.map(item => {
      return headers.map(header => {
        const value = item[header];
        if (value === null || value === undefined) {
          return '""';
        }
        // Convert objects/arrays to JSON string
        if (typeof value === 'object') {
          const jsonStr = JSON.stringify(value).replace(/"/g, '""');
          return `"${jsonStr}"`;
        }
        // Escape commas and quotes in value
        const escaped = String(value).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    });

    return [csvHeader, ...csvRows].join('\n');
  };

  // Helper function to download a file
  const downloadFile = (content: string, filename: string, mimeType: string = 'text/csv') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Paginate through a table (Supabase default max is 1000 per request) so we get ALL rows.
  const fetchAllFromTable = async (tableName: string, orderBy = 'id'): Promise<{ data: any[]; error: any }> => {
    const PAGE = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order(orderBy, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return { data: [], error };
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return { data: all, error: null };
  };

  // Function to download all table data (paginated so we get every row)
  const handleDownloadAllData = async () => {
    setIsDownloading(true);

    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const tables: { name: string; data: any[] }[] = [];

      const { data: customers, error: customersError } = await fetchAllFromTable('customers', 'created_at');
      if (customersError) {
        toast.error(`Failed to fetch customers: ${customersError.message}`);
      } else {
        tables.push({ name: 'customers', data: customers });
      }

      const { data: jobs, error: jobsError } = await fetchAllFromTable('jobs', 'created_at');
      if (jobsError) {
        toast.error(`Failed to fetch jobs: ${jobsError.message}`);
      } else {
        tables.push({ name: 'jobs', data: jobs });
      }

      const { data: technicians, error: techniciansError } = await fetchAllFromTable('technicians', 'created_at');
      if (techniciansError) {
        toast.error(`Failed to fetch technicians: ${techniciansError.message}`);
      } else {
        tables.push({ name: 'technicians', data: technicians });
      }

      const { data: taxInvoices, error: taxInvoicesError } = await fetchAllFromTable('tax_invoices', 'created_at');
      if (taxInvoicesError) {
        toast.error(`Failed to fetch tax invoices: ${taxInvoicesError.message}`);
      } else {
        tables.push({ name: 'tax_invoices', data: taxInvoices });
      }

      const { data: technicianPayments, error: technicianPaymentsError } = await fetchAllFromTable('technician_payments', 'created_at');
      if (technicianPaymentsError) {
        toast.error(`Failed to fetch technician payments: ${technicianPaymentsError.message}`);
      } else {
        tables.push({ name: 'technician_payments', data: technicianPayments });
      }

      const { data: amcContracts, error: amcContractsError } = await fetchAllFromTable('amc_contracts', 'created_at');
      if (amcContractsError) {
        toast.error(`Failed to fetch AMC contracts: ${amcContractsError.message}`);
      } else {
        tables.push({ name: 'amc_contracts', data: amcContracts });
      }

      const { data: commonQrCodes, error: commonQrCodesError } = await fetchAllFromTable('common_qr_codes', 'created_at');
      if (commonQrCodesError) {
        toast.error(`Failed to fetch common QR codes: ${commonQrCodesError.message}`);
      } else {
        tables.push({ name: 'common_qr_codes', data: commonQrCodes });
      }

      const { data: productQrCodes, error: productQrCodesError } = await fetchAllFromTable('product_qr_codes', 'created_at');
      if (productQrCodesError) {
        toast.error(`Failed to fetch product QR codes: ${productQrCodesError.message}`);
      } else {
        tables.push({ name: 'product_qr_codes', data: productQrCodes });
      }

      const { data: jobAssignmentRequests, error: jobAssignmentRequestsError } = await fetchAllFromTable('job_assignment_requests', 'created_at');
      if (jobAssignmentRequestsError) {
        toast.error(`Failed to fetch job assignment requests: ${jobAssignmentRequestsError.message}`);
      } else {
        tables.push({ name: 'job_assignment_requests', data: jobAssignmentRequests });
      }

      const { data: technicianExpenses, error: technicianExpensesError } = await fetchAllFromTable('technician_expenses', 'created_at');
      if (technicianExpensesError) {
        toast.error(`Failed to fetch technician expenses: ${technicianExpensesError.message}`);
      } else {
        tables.push({ name: 'technician_expenses', data: technicianExpenses });
      }

      const { data: technicianAdvances, error: technicianAdvancesError } = await fetchAllFromTable('technician_advances', 'created_at');
      if (technicianAdvancesError) {
        toast.error(`Failed to fetch technician advances: ${technicianAdvancesError.message}`);
      } else {
        tables.push({ name: 'technician_advances', data: technicianAdvances });
      }

      const { data: technicianExtraCommissions, error: technicianExtraCommissionsError } = await fetchAllFromTable('technician_extra_commissions', 'created_at');
      if (technicianExtraCommissionsError) {
        toast.error(`Failed to fetch technician extra commissions: ${technicianExtraCommissionsError.message}`);
      } else {
        tables.push({ name: 'technician_extra_commissions', data: technicianExtraCommissions });
      }

      const { data: technicianHolidays, error: technicianHolidaysError } = await fetchAllFromTable('technician_holidays', 'created_at');
      if (technicianHolidaysError) {
        toast.error(`Failed to fetch technician holidays: ${technicianHolidaysError.message}`);
      } else {
        tables.push({ name: 'technician_holidays', data: technicianHolidays });
      }

      const { data: callHistory, error: callHistoryError } = await fetchAllFromTable('call_history', 'contacted_at');
      if (callHistoryError) {
        toast.error(`Failed to fetch call history: ${callHistoryError.message}`);
      } else {
        tables.push({ name: 'call_history', data: callHistory });
      }

      const { data: adminUsers, error: adminUsersError } = await fetchAllFromTable('admin_users', 'id');
      if (adminUsersError) {
        toast.error(`Failed to fetch admin users: ${adminUsersError.message}`);
      } else {
        tables.push({ name: 'admin_users', data: adminUsers });
      }

      const { data: followUps, error: followUpsError } = await fetchAllFromTable('follow_ups', 'created_at');
      if (followUpsError) {
        toast.error(`Failed to fetch follow-ups: ${followUpsError.message}`);
      } else {
        tables.push({ name: 'follow_ups', data: followUps });
      }

      const { data: notifications, error: notificationsError } = await fetchAllFromTable('notifications', 'created_at');
      if (notificationsError) {
        toast.error(`Failed to fetch notifications: ${notificationsError.message}`);
      } else {
        tables.push({ name: 'notifications', data: notifications });
      }

      const { data: partsInventory, error: partsInventoryError } = await fetchAllFromTable('parts_inventory', 'id');
      if (partsInventoryError) {
        toast.error(`Failed to fetch parts inventory: ${partsInventoryError.message}`);
      } else {
        tables.push({ name: 'parts_inventory', data: partsInventory });
      }

      const { data: serviceAreas, error: serviceAreasError } = await fetchAllFromTable('service_areas', 'id');
      if (serviceAreasError) {
        toast.error(`Failed to fetch service areas: ${serviceAreasError.message}`);
      } else {
        tables.push({ name: 'service_areas', data: serviceAreas });
      }

      const { data: businessExpenses, error: businessExpensesError } = await fetchAllFromTable('business_expenses', 'expense_date');
      if (businessExpensesError) {
        toast.error(`Failed to fetch business expenses: ${businessExpensesError.message}`);
      } else {
        tables.push({ name: 'business_expenses', data: businessExpenses });
      }

      const { data: inventory, error: inventoryError } = await fetchAllFromTable('inventory', 'created_at');
      if (inventoryError) {
        toast.error(`Failed to fetch inventory: ${inventoryError.message}`);
      } else {
        tables.push({ name: 'inventory', data: inventory });
      }

      const { data: technicianInventory, error: technicianInventoryError } = await fetchAllFromTable('technician_inventory', 'created_at');
      if (technicianInventoryError) {
        toast.error(`Failed to fetch technician inventory: ${technicianInventoryError.message}`);
      } else {
        tables.push({ name: 'technician_inventory', data: technicianInventory });
      }

      const { data: jobPartsUsed, error: jobPartsUsedError } = await fetchAllFromTable('job_parts_used', 'created_at');
      if (jobPartsUsedError) {
        toast.error(`Failed to fetch job parts used: ${jobPartsUsedError.message}`);
      } else {
        tables.push({ name: 'job_parts_used', data: jobPartsUsed });
      }

      const { data: adminTodos, error: adminTodosError } = await fetchAllFromTable('admin_todos', 'created_at');
      if (adminTodosError) {
        toast.error(`Failed to fetch admin todos: ${adminTodosError.message}`);
      } else {
        tables.push({ name: 'admin_todos', data: adminTodos });
      }

      const { data: reminders, error: remindersError } = await fetchAllFromTable('reminders', 'reminder_at');
      if (remindersError) {
        toast.error(`Failed to fetch reminders: ${remindersError.message}`);
      } else {
        tables.push({ name: 'reminders', data: reminders });
      }

      const { data: technicianCommonQr, error: technicianCommonQrError } = await fetchAllFromTable('technician_common_qr', 'created_at');
      if (technicianCommonQrError) {
        toast.error(`Failed to fetch technician common QR: ${technicianCommonQrError.message}`);
      } else {
        tables.push({ name: 'technician_common_qr', data: technicianCommonQr });
      }

      const { data: inventoryBundles, error: inventoryBundlesError } = await fetchAllFromTable('inventory_bundles', 'updated_at');
      if (inventoryBundlesError) {
        toast.error(`Failed to fetch inventory bundles: ${inventoryBundlesError.message}`);
      } else {
        tables.push({ name: 'inventory_bundles', data: inventoryBundles });
      }

      const { data: inventoryBundleItems, error: inventoryBundleItemsError } = await fetchAllFromTable('inventory_bundle_items', 'id');
      if (inventoryBundleItemsError) {
        toast.error(`Failed to fetch inventory bundle items: ${inventoryBundleItemsError.message}`);
      } else {
        tables.push({ name: 'inventory_bundle_items', data: inventoryBundleItems });
      }

      const { data: otherExpenses, error: otherExpensesError } = await fetchAllFromTable('other_expenses', 'expense_date');
      if (otherExpensesError) {
        toast.error(`Failed to fetch other expenses: ${otherExpensesError.message}`);
      } else {
        tables.push({ name: 'other_expenses', data: otherExpenses });
      }

      // Create ZIP file with all CSV files
      const zip = new JSZip();
      
      // Add each table as a CSV file to the ZIP
      for (const table of tables) {
        const csvContent = convertToCSV(table.data, table.name);
        const filename = `${table.name}_${timestamp}.csv`;
        zip.file(filename, csvContent);
      }

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Download the ZIP file
      const zipFilename = `database_export_${timestamp}.zip`;
      const zipUrl = URL.createObjectURL(zipBlob);
      const zipLink = document.createElement('a');
      zipLink.href = zipUrl;
      zipLink.download = zipFilename;
      document.body.appendChild(zipLink);
      zipLink.click();
      document.body.removeChild(zipLink);
      URL.revokeObjectURL(zipUrl);

      toast.success(`Successfully downloaded ${tables.length} table(s) in ZIP file: ${zipFilename}`);
    } catch (error) {
      console.error('Error downloading data:', error);
      toast.error('Failed to download data. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };



  // Note: Currently allows unauthenticated access, but RLS policies need to be updated
  // Run supabase-qr-codes-rls-fix.sql to allow unauthenticated access


  // Show calling page if requested
  if (showCallingPage) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
              <div className="flex items-center">
                <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900">Calling</h1>
                  <p className="text-xs sm:text-sm text-gray-600">Manage customer calls</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCallingPage(false)}
                className="text-gray-600 hover:text-gray-900 -ml-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Settings
              </Button>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <CallingPage hideHeader={true} onBack={() => setShowCallingPage(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - sticky so Back stays visible when scrolling */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
            <div className="flex items-center">
              <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">Settings</h1>
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
          {/* Technician Locations */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <MapPin className="w-5 h-5" />
                    Technician Locations
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    View last known location and update time for all technicians
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadTechnicians()}
                  title="Refresh technician locations"
                  className="shrink-0"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {technicians.map((technician) => {
                  const hasLocation = technician.currentLocation && 
                                     technician.currentLocation.latitude && 
                                     technician.currentLocation.longitude;
                  const lastUpdated = technician.currentLocation?.lastUpdated 
                    ? new Date(technician.currentLocation.lastUpdated).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })
                    : null;

                  return (
                    <Card key={technician.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3 gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                              {technician.fullName}
                            </h3>
                            <p className="text-xs text-gray-600 truncate">{technician.employeeId}</p>
                          </div>
                        </div>

                        {hasLocation ? (
                          <div className="space-y-2">
                            <button
                              onClick={() => {
                                const url = `https://www.google.com/maps?q=${technician.currentLocation?.latitude},${technician.currentLocation?.longitude}`;
                                window.open(url, '_blank');
                              }}
                              className="flex items-center gap-2 w-full p-2 rounded-lg border border-blue-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
                              title="Click to open location in Google Maps"
                            >
                              <MapPin className="w-5 h-5 text-blue-600 group-hover:text-blue-700 shrink-0" />
                              <div className="flex-1 min-w-0 text-left">
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                  View Location
                                </div>
                              </div>
                            </button>
                            {lastUpdated && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Last updated: {lastUpdated}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-gray-400 p-2">
                            <MapPin className="w-5 h-5 shrink-0" />
                            <span className="text-xs">No location data available</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {technicians.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    No technicians found.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Todo Tasks */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <ListTodo className="w-5 h-5" />
                    Todo Tasks
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Manage your todo tasks. Check off tasks to complete and delete them.
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleAddTodo} 
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Task
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-3">
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Checkbox
                      id={`todo-${todo.id}`}
                      checked={false}
                      onCheckedChange={() => handleTodoCheckboxClick(todo.id)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`todo-${todo.id}`}
                      className="flex-1 text-sm sm:text-base text-gray-900 dark:text-gray-100 cursor-pointer"
                    >
                      {todo.text}
                    </label>
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                      {new Date(todo.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {todos.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No tasks yet. Click "Add Task" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Reminders - dialog: recent completed, show all, search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <ListTodo className="w-5 h-5" />
                Reminders
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                View and search reminders by customer. Recent completed and show all options.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setRemindersDialogOpen(true)}
              >
                <ListTodo className="w-4 h-4 mr-2" />
                Open Reminders
              </Button>
            </CardContent>
          </Card>
          <SettingsRemindersDialog
            open={remindersDialogOpen}
            onOpenChange={setRemindersDialogOpen}
          />

          {/* Pending payments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <DollarSign className="w-5 h-5" />
                Pending payments
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Manage customer pending amounts and due dates. Mark as completed after payment.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setPendingPaymentsInitialAction('list');
                    setPendingPaymentsDialogOpen(true);
                  }}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Open Pending Payments
                </Button>
                <Button
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700 w-full"
                  onClick={() => {
                    setPendingPaymentsInitialAction('add');
                    setPendingPaymentsDialogOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Pending Payment
                </Button>
              </div>
            </CardContent>
          </Card>
          <SettingsPendingPaymentsDialogV2
            open={pendingPaymentsDialogOpen}
            onOpenChange={setPendingPaymentsDialogOpen}
            initialAction={pendingPaymentsInitialAction}
          />

          {/* GST Invoices */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Receipt className="w-5 h-5" />
                GST Invoices
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                View and manage GST invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => navigate('/admin?view=gst-invoices')}
              >
                <Receipt className="w-4 h-4 mr-2" />
                Open GST Invoices
              </Button>
            </CardContent>
          </Card>

          {/* AMC View */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <FileText className="w-5 h-5" />
                View AMCs
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                View and manage Annual Maintenance Contracts
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => navigate('/admin?view=amc-view')}
              >
                <FileText className="w-4 h-4 mr-2" />
                Open AMC View
              </Button>
            </CardContent>
          </Card>

          {/* Calling */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <PhoneCall className="w-5 h-5" />
                Calling
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Manage customer calls and communication
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setShowCallingPage(true)}
              >
                <PhoneCall className="w-4 h-4 mr-2" />
                Open Calling Page
              </Button>
            </CardContent>
          </Card>

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

          {/* Common QR (non-payment) - shown below payment QR on technician app */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <QrCode className="w-5 h-5" />
                    Common QR
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    QR codes shown to technicians below the payment QR. Assign per technician in Technician Management.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleAddTechnicianCommonQr}
                  className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Common QR
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {technicianCommonQrCodes.map((qrCode) => (
                  <Card key={qrCode.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{qrCode.name}</h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTechnicianCommonQr(qrCode)}
                          className="flex-1 text-xs sm:text-sm"
                        >
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 px-2 sm:px-3">
                              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="mx-4 sm:mx-0">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Common QR</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{qrCode.name}"? Technicians assigned this QR will see none until you assign another.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                              <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteTechnicianCommonQr(qrCode.id)}
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
                {technicianCommonQrCodes.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    No Common QR added yet. Click "Add Common QR" to create one.
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

          {/* Location Tracking Setting */}
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

          {/* Data Export Section - At Bottom */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Download className="w-5 h-5" />
                    Data Export
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Download all table data as CSV files for backup or analysis
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleDownloadAllData}
                  disabled={isDownloading}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isDownloading ? 'Downloading...' : 'Download All Data'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-900 dark:text-blue-200 mb-2">
                  <strong>What will be downloaded:</strong>
                </p>
                  <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
                  <li>Admin Todos</li>
                  <li>Admin Users</li>
                  <li>AMC Contracts</li>
                  <li>Business Expenses</li>
                  <li>Call History</li>
                  <li>Common QR Codes</li>
                  <li>Customers</li>
                  <li>Follow-ups</li>
                  <li>Inventory</li>
                  <li>Inventory Bundle Items</li>
                  <li>Inventory Bundles</li>
                  <li>Job Assignment Requests</li>
                  <li>Job Parts Used</li>
                  <li>Jobs</li>
                  <li>Notifications</li>
                  <li>Other Expenses</li>
                  <li>Parts Inventory</li>
                  <li>Product QR Codes</li>
                  <li>Reminders</li>
                  <li>Service Areas</li>
                  <li>Tax Invoices</li>
                  <li>Technician Common QR</li>
                  <li>Technician Advances</li>
                  <li>Technician Expenses</li>
                  <li>Technician Extra Commissions</li>
                  <li>Technician Holidays</li>
                  <li>Technician Inventory</li>
                  <li>Technician Payments</li>
                  <li>Technicians</li>
                </ul>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-3">
                  All tables will be downloaded as CSV files in a ZIP archive. Files will be named with the table name and current date.
                </p>
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
        <DialogContent className="w-full sm:w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-none sm:rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {editTechnicianDialogOpen ? 'Edit Technician' : 'Add New Technician'}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {editTechnicianDialogOpen 
                ? 'Update technician information and credentials'
                : 'Create a new technician account with login credentials'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Basic Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
            
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Technician Photo</h3>
              <div>
                <Label className="text-sm sm:text-base">Upload Technician Photo (Optional)</Label>
                <p className="text-xs sm:text-sm text-gray-500 mb-2">Upload photo for ID card display</p>
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
            
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Payment QR Code</h3>
              <div>
                <Label className="text-sm sm:text-base">Upload Payment QR Code (Optional)</Label>
                <p className="text-xs sm:text-sm text-gray-500 mb-2">Upload QR code for payment scanning</p>
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
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">QR Code Visibility</h3>
              <div>
                <Label className="text-sm sm:text-base">Select which QR codes this technician can see</Label>
                <p className="text-xs sm:text-sm text-gray-500 mb-3">Control which payment QR codes are available to this technician</p>
                
                <div className="space-y-2 sm:space-y-3">
                  {/* Show All Option */}
                  <div className="flex items-center space-x-2 p-2 sm:p-3 border rounded-lg">
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
                    <Label htmlFor="qr-all" className="font-medium cursor-pointer flex-1 text-sm sm:text-base">
                      Show All QR Codes
                    </Label>
                  </div>
                  
                  {/* Common QR Codes */}
                  {commonQrCodes.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs sm:text-sm font-medium text-gray-700">Common QR Codes:</Label>
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
                            <Label htmlFor={qrId} className="cursor-pointer flex-1 text-xs sm:text-sm">
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
                      <Label className="text-xs sm:text-sm font-medium text-gray-700">Technician QR Codes:</Label>
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
                              <Label htmlFor={qrId} className="cursor-pointer flex-1 text-xs sm:text-sm">
                                {tech.fullName}'s QR Code
                              </Label>
                            </div>
                          );
                        })}
                    </div>
                  )}
                  
                  {commonQrCodes.length === 0 && technicians.filter(t => (t as any).qrCode && (t as any).qrCode.trim() !== '').length === 0 && (
                    <p className="text-xs sm:text-sm text-gray-500 italic">No QR codes available. Add common QR codes or upload QR codes for technicians.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Common QR (non-payment) - multiple allowed, shown below payment QR */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Common QR</h3>
              <div>
                <Label className="text-sm sm:text-base">Common QRs to show to this technician</Label>
                <p className="text-xs sm:text-sm text-gray-500 mb-2">Select one or more. They are shown below the payment QR on the technician app. Add options in the &quot;Common QR&quot; card above.</p>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {technicianCommonQrCodes.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No Common QRs added yet. Add some in the Common QR card above.</p>
                  ) : (
                    technicianCommonQrCodes.map((qr) => {
                      const isChecked = technicianFormData.commonQrCodeIds.includes(qr.id);
                      return (
                        <div key={qr.id} className="flex items-center space-x-2 p-2 border rounded-lg">
                          <Checkbox
                            id={`common-qr-${qr.id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setTechnicianFormData(prev => ({
                                ...prev,
                                commonQrCodeIds: checked
                                  ? [...prev.commonQrCodeIds, qr.id]
                                  : prev.commonQrCodeIds.filter(id => id !== qr.id)
                              }));
                            }}
                          />
                          <Label htmlFor={`common-qr-${qr.id}`} className="cursor-pointer flex-1 text-sm">
                            {qr.name}
                          </Label>
                        </div>
                      );
                    })
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

      {/* Add/Edit Common QR (non-payment) Dialog */}
      <Dialog open={addTechnicianCommonQrDialogOpen || editTechnicianCommonQrDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddTechnicianCommonQrDialogOpen(false);
          setEditTechnicianCommonQrDialogOpen(false);
          setSelectedTechnicianCommonQr(null);
          setTechnicianCommonQrFormData({ name: '', qrCodeUrl: '' });
        }
      }}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTechnicianCommonQrDialogOpen ? 'Edit Common QR' : 'Add Common QR'}</DialogTitle>
            <DialogDescription>
              {editTechnicianCommonQrDialogOpen ? 'Update this Common QR' : 'Create a QR shown to technicians below the payment QR. Assign it in Technician Management.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="technicianCommonQrName">Name *</Label>
                <Input
                  id="technicianCommonQrName"
                  value={technicianCommonQrFormData.name}
                  onChange={(e) => setTechnicianCommonQrFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Support QR, Feedback QR"
                />
              </div>
              <div>
                <Label>Upload QR Code Image *</Label>
                <p className="text-sm text-gray-500 mb-2">Upload the QR image (non-payment)</p>
                <ImageUpload
                  onImagesChange={(images) => setTechnicianCommonQrFormData(prev => ({ ...prev, qrCodeUrl: images[0] || '' }))}
                  maxImages={1}
                  folder="technician-common-qr"
                  title=""
                  description=""
                  maxWidth={800}
                  quality={0.8}
                  aggressiveCompression={false}
                  useSecondaryAccount={false}
                />
                {technicianCommonQrFormData.qrCodeUrl && (
                  <div className="mt-2">
                    <img src={technicianCommonQrFormData.qrCodeUrl} alt="Common QR" className="w-32 h-32 object-contain border border-gray-200 rounded" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddTechnicianCommonQrDialogOpen(false);
                setEditTechnicianCommonQrDialogOpen(false);
                setSelectedTechnicianCommonQr(null);
                setTechnicianCommonQrFormData({ name: '', qrCodeUrl: '' });
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTechnicianCommonQr}
              disabled={!technicianCommonQrFormData.name?.trim() || !technicianCommonQrFormData.qrCodeUrl?.trim()}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              {editTechnicianCommonQrDialogOpen ? 'Update Common QR' : 'Create Common QR'}
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

      {/* Add Todo Dialog */}
      <Dialog open={addTodoDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddTodoDialogOpen(false);
          setNewTodoText('');
        }
      }}>
        <DialogContent className="sm:max-w-md mx-4">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
            <DialogDescription>
              Enter a new task to add to your todo list
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="todoText">Task</Label>
              <Input
                id="todoText"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                placeholder="Enter task description"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTodoText.trim()) {
                    handleSaveTodo();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddTodoDialogOpen(false);
                setNewTodoText('');
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTodo}
              disabled={!newTodoText || !newTodoText.trim()}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Todo Confirmation Dialog */}
      <AlertDialog open={todoToDelete !== null} onOpenChange={(open) => {
        if (!open) {
          setTodoToDelete(null);
        }
      }}>
        <AlertDialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-lg p-5 sm:p-6">
          <AlertDialogHeader className="text-left sm:text-center">
            <AlertDialogTitle className="text-base sm:text-lg font-semibold">
              Complete Task
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base text-muted-foreground mt-2">
              Are you sure you want to complete this task? It will be deleted permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 mt-4 sm:mt-0">
            <AlertDialogCancel 
              onClick={() => setTodoToDelete(null)}
              className="w-full sm:w-auto order-2 sm:order-1 h-10 sm:h-9 text-sm sm:text-sm font-medium"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (todoToDelete) {
                  handleDeleteTodo(todoToDelete);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto order-1 sm:order-2 h-10 sm:h-9 text-sm sm:text-sm font-medium"
            >
              Complete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logout Section at Bottom */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Card className="border-red-200">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Logout</h3>
                <p className="text-sm text-gray-600">Sign out of your account</p>
              </div>
              <Button
                variant="outline"
                size="lg"
                onClick={async () => {
                  await logout();
                }}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300 w-full sm:w-auto"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;