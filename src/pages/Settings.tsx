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
  DollarSign,
  Bell,
  Lock,
  GitMerge,
  Repeat,
  ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { db, supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import { ensureAdminSupabaseSession } from '@/lib/auth';
import { deleteTechnicianCompletely } from '@/lib/deleteTechnician';
import { buildTechnicianSalaryPayload, getCurrentMonthKey } from '@/lib/technicianSalaryForPeriod';
import { Technician } from '@/types';
import ImageUpload from '@/components/ImageUpload';
import { CommonQrCode, invalidateQrCodesCache, normalizeTechnicianAssignedCommonQrIds } from '@/lib/qrCodeManager';
// NOTE: `jszip` and `qr-code-styling` are heavy and only used by specific
// button actions (data export ZIP, styled QR image). They are dynamically
// imported at their call sites so they stay out of the main Settings chunk.
import CallingPage from '@/pages/CallingPage';
import { registerAdminPWA } from '@/lib/pwa';
import { SettingsRemindersDialog } from '@/components/reminders/SettingsRemindersDialog';
import { AddReminderDialog } from '@/components/reminders/AddReminderDialog';
import { RecurringServiceTracker } from '@/components/reminders/RecurringServiceTracker';
import { SettingsPendingPaymentsDialogV2 } from '@/components/reminders/PendingPaymentsDialogV2';
import AdvancedCustomerSearchDialog from '@/components/admin/AdvancedCustomerSearchDialog';
import MergeCustomersDialog from '@/components/admin/MergeCustomersDialog';
import WarrantyManagementDialog from '@/components/admin/WarrantyManagementDialog';
import DirectSaleDialog from '@/components/admin/DirectSaleDialog';
import { WebsiteAnalyticsGate } from '@/components/admin/WebsiteAnalyticsGate';

/** PostgREST error when a table was never created or was dropped (e.g. booking_abandonments). */
const isMissingTableError = (error: { message?: string; code?: string } | null): boolean => {
  if (!error) return false;
  const msg = error.message ?? '';
  return (
    error.code === 'PGRST205' ||
    /could not find the table/i.test(msg) ||
    /schema cache/i.test(msg)
  );
};

/** Tables included in Settings → Data Export (keep in sync with handleDownloadAllData). */
const DATABASE_EXPORT_TABLES: {
  name: string;
  orderBy: string;
  label: string;
  /** If true, skip silently when the table is not in Supabase (optional migration). */
  optional?: boolean;
}[] = [
  { name: 'admin_todos', orderBy: 'created_at', label: 'Admin Todos' },
  { name: 'admin_users', orderBy: 'id', label: 'Admin Users' },
  { name: 'amc_contracts', orderBy: 'created_at', label: 'AMC Contracts' },
  { name: 'business_expenses', orderBy: 'expense_date', label: 'Business Expenses' },
  { name: 'call_history', orderBy: 'contacted_at', label: 'Call History' },
  { name: 'common_qr_codes', orderBy: 'created_at', label: 'Common QR Codes' },
  { name: 'customers', orderBy: 'created_at', label: 'Customers' },
  { name: 'follow_ups', orderBy: 'created_at', label: 'Follow-ups' },
  { name: 'inventory', orderBy: 'created_at', label: 'Inventory' },
  { name: 'inventory_bundle_items', orderBy: 'id', label: 'Inventory Bundle Items' },
  { name: 'inventory_bundles', orderBy: 'updated_at', label: 'Inventory Bundles' },
  { name: 'job_assignment_requests', orderBy: 'created_at', label: 'Job Assignment Requests' },
  { name: 'job_parts_used', orderBy: 'created_at', label: 'Job Parts Used' },
  { name: 'jobs', orderBy: 'created_at', label: 'Jobs' },
  { name: 'notifications', orderBy: 'created_at', label: 'Notifications' },
  { name: 'other_expenses', orderBy: 'expense_date', label: 'Other Expenses' },
  { name: 'parts_inventory', orderBy: 'id', label: 'Parts Inventory' },
  { name: 'product_qr_codes', orderBy: 'created_at', label: 'Product QR Codes' },
  { name: 'reminders', orderBy: 'reminder_at', label: 'Reminders' },
  { name: 'service_areas', orderBy: 'id', label: 'Service Areas' },
  { name: 'tax_invoices', orderBy: 'created_at', label: 'Tax Invoices' },
  { name: 'technician_advances', orderBy: 'created_at', label: 'Technician Advances' },
  { name: 'technician_common_qr', orderBy: 'created_at', label: 'Technician Common QR' },
  { name: 'technician_expenses', orderBy: 'created_at', label: 'Technician Expenses' },
  { name: 'technician_extra_commissions', orderBy: 'created_at', label: 'Technician Extra Commissions' },
  { name: 'technician_holidays', orderBy: 'created_at', label: 'Technician Holidays' },
  { name: 'technician_inventory', orderBy: 'created_at', label: 'Technician Inventory' },
  {
    name: 'technician_job_sync',
    orderBy: 'created_at',
    label: 'Technician Job Sync',
    optional: true,
  },
  { name: 'technician_payments', orderBy: 'created_at', label: 'Technician Payments' },
  { name: 'technicians', orderBy: 'created_at', label: 'Technicians' },
  { name: 'warranties', orderBy: 'created_at', label: 'Warranties', optional: true },
  { name: 'warranty_items', orderBy: 'created_at', label: 'Warranty Items', optional: true },
  { name: 'website_booking_intent', orderBy: 'updated_at', label: 'Website Booking Intent' },
  { name: 'website_analytics_events', orderBy: 'created_at', label: 'Website Analytics Events' },
];

const Settings = () => {
  const { user, isAdmin, logout, authInitializing } = useAuth();
  const { isManager } = useAdminRole();
  const managerRestrictedTitle = 'Restricted for Manager role';
  const navigate = useNavigate();

  useEffect(() => {
    registerAdminPWA();
  }, []);

  // Admin Settings lives at /settings; after logout there is no user but this route still mounted — send to /admin so AdminLogin shows.
  useEffect(() => {
    if (authInitializing) return;
    if (!user) {
      navigate('/admin', { replace: true });
    }
  }, [user, authInitializing, navigate]);

  // Technician management states
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [addTechnicianDialogOpen, setAddTechnicianDialogOpen] = useState(false);
  const [editTechnicianDialogOpen, setEditTechnicianDialogOpen] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [technicianToDelete, setTechnicianToDelete] = useState<Technician | null>(null);
  const [deleteTechnicianStep, setDeleteTechnicianStep] = useState<0 | 1 | 2>(0);
  const [isDeletingTechnician, setIsDeletingTechnician] = useState(false);
  
  // Common QR Code management states (payment QR codes)
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [addQrCodeDialogOpen, setAddQrCodeDialogOpen] = useState(false);
  const [editQrCodeDialogOpen, setEditQrCodeDialogOpen] = useState(false);
  const [selectedQrCode, setSelectedQrCode] = useState<CommonQrCode | null>(null);
  const [qrCodeFormData, setQrCodeFormData] = useState({
    name: '',
    qrCodeUrl: ''
  });
  const [qrImageGeneratorData, setQrImageGeneratorData] = useState({
    content: '',
    fileName: 'hydrogen-ro-qr'
  });
  const [isGeneratingQrImage, setIsGeneratingQrImage] = useState(false);

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
    salaryEffectiveFromMonth: getCurrentMonthKey(),
    accountStatus: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
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

  const [mergeCustomersOpen, setMergeCustomersOpen] = useState(false);
  const [warrantyDialogOpen, setWarrantyDialogOpen] = useState(false);
  const [directSaleOpen, setDirectSaleOpen] = useState(false);

  // Todo management states
  const [todos, setTodos] = useState<Array<{ id: string; text: string; created_at: string }>>([]);
  const [addTodoDialogOpen, setAddTodoDialogOpen] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [todoToDelete, setTodoToDelete] = useState<string | null>(null);

  // Amount tracker states (e.g. "Cash flow" running totals)
  const [amountTrackers, setAmountTrackers] = useState<
    Array<{ id: string; name: string; amount: number; created_at: string; updated_at: string }>
  >([]);
  const [addTrackerDialogOpen, setAddTrackerDialogOpen] = useState(false);
  const [newTrackerName, setNewTrackerName] = useState('');
  const [newTrackerAmount, setNewTrackerAmount] = useState('');
  const [trackerToDelete, setTrackerToDelete] = useState<string | null>(null);
  const [adjustInputs, setAdjustInputs] = useState<Record<string, string>>({});
  const [adjustingTrackerId, setAdjustingTrackerId] = useState<string | null>(null);

  // Calling view state
  const [showCallingPage, setShowCallingPage] = useState(false);

  const [remindersDialogOpen, setRemindersDialogOpen] = useState(false);
  const [recurringServiceOpen, setRecurringServiceOpen] = useState(false);
  const [advancedSearchDialogOpen, setAdvancedSearchDialogOpen] = useState(false);
  const [addGeneralReminderOpen, setAddGeneralReminderOpen] = useState(false);
  const [addCustomerReminderOpen, setAddCustomerReminderOpen] = useState(false);

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
    loadAmountTrackers();
  }, []);

  // Deep-link from the admin "Recent" quick-access menu: scroll to a section, e.g.
  // /settings?section=amount-trackers or ?section=technician-management.
  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get('section');
    if (!section) return;
    // Wait for the section cards to render before scrolling.
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`section-${section}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2', 'rounded-lg');
        window.setTimeout(() => {
          el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2', 'rounded-lg');
        }, 2500);
      }
      // Clean the URL so a refresh doesn't re-scroll.
      window.history.replaceState({}, '', '/settings');
    }, 350);
    return () => window.clearTimeout(timer);
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
    commonQrCodeIds: normalizeTechnicianAssignedCommonQrIds({
      common_qr_code_ids: tech.common_qr_code_ids,
      common_qr_code_id: (tech as any).common_qr_code_id,
    }),
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

  const resetDeleteTechnicianFlow = () => {
    setTechnicianToDelete(null);
    setDeleteTechnicianStep(0);
    setIsDeletingTechnician(false);
  };

  const handleStartDeleteTechnician = (technician: Technician) => {
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    setTechnicianToDelete(technician);
    setDeleteTechnicianStep(1);
    setEditTechnicianDialogOpen(false);
    setAddTechnicianDialogOpen(false);
    setSelectedTechnician(null);
  };

  const handleExecuteDeleteTechnician = async () => {
    if (!technicianToDelete) return;
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }

    setIsDeletingTechnician(true);
    try {
      const { authSyncSkipped } = await deleteTechnicianCompletely(technicianToDelete.id);

      toast.success(`Technician "${technicianToDelete.fullName}" and all related data were deleted`);
      if (authSyncSkipped) {
        toast.warning(
          'Technician removed from the app. Restart dev server (npm run dev) or deploy to also remove their login account.'
        );
      }
      resetDeleteTechnicianFlow();
      await loadTechnicians();
      invalidateQrCodesCache();
    } catch (error) {
      console.error('Delete technician error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete technician');
    } finally {
      setIsDeletingTechnician(false);
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
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    setTechnicianFormData({
      fullName: '',
      phone: '',
      email: '',
      employeeId: generateEmployeeId(),
      password: '',
      qrCode: '',
      photo: '',
      baseSalary: 0,
      salaryEffectiveFromMonth: getCurrentMonthKey(),
      visibleQrCodes: [],
      commonQrCodeIds: [],
      accountStatus: 'ACTIVE'
    });
    setNewlyCreatedTechnicianId(null);
    setAddTechnicianDialogOpen(true);
  };

  const handleEditTechnician = (technician: Technician) => {
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
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
      salaryEffectiveFromMonth: getCurrentMonthKey(),
      visibleQrCodes: technician.visibleQrCodes || [],
      commonQrCodeIds: (technician as any).commonQrCodeIds || [],
      accountStatus: (technician.account_status as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') || 'ACTIVE'
    });
    setNewlyCreatedTechnicianId(null);
    setEditTechnicianDialogOpen(true);
  };

  const handleSaveTechnician = async () => {
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    try {
      // Password (if provided) is forwarded as plaintext to sync-technician-auth-user,
      // which writes it to Supabase Auth via admin.updateUserById. The DB no longer
      // stores a password hash (column dropped 2026-05-24).

      const previousBaseSalary =
        selectedTechnician?.salary?.baseSalary !== undefined
          ? Number(selectedTechnician.salary.baseSalary)
          : 0;
      const nextBaseSalary = technicianFormData.baseSalary || 0;
      const hasSalaryHistory =
        Array.isArray((selectedTechnician?.salary as any)?.history) &&
        (selectedTechnician?.salary as any).history.length > 0;
      const salaryChanged =
        !editTechnicianDialogOpen ||
        !selectedTechnician ||
        previousBaseSalary !== nextBaseSalary ||
        !hasSalaryHistory;
      const salaryPayload = salaryChanged
        ? buildTechnicianSalaryPayload(
            editTechnicianDialogOpen ? selectedTechnician?.salary : null,
            nextBaseSalary,
            technicianFormData.salaryEffectiveFromMonth
          )
        : {
            ...(selectedTechnician?.salary || {}),
            baseSalary: nextBaseSalary,
            commissionPerJob: selectedTechnician?.salary?.commissionPerJob ?? 0,
            commissionPercentage: selectedTechnician?.salary?.commissionPercentage ?? 10,
          };

      const technicianData: any = {
        full_name: technicianFormData.fullName,
        phone: technicianFormData.phone,
        email: technicianFormData.email,
        employee_id: technicianFormData.employeeId,
        qr_code: technicianFormData.qrCode || null,
        photo: technicianFormData.photo || null,
        visible_qr_codes: technicianFormData.visibleQrCodes || [],
        common_qr_code_ids: technicianFormData.commonQrCodeIds || [],
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
        salary: salaryPayload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      technicianData.account_status =
        editTechnicianDialogOpen && selectedTechnician
          ? technicianFormData.accountStatus || 'ACTIVE'
          : 'ACTIVE';

      const password = technicianFormData.password?.trim() || '';
      let savedTechnicianId: string | null = null;

      if (editTechnicianDialogOpen && selectedTechnician) {
        const { error } = await db.technicians.update(selectedTechnician.id, technicianData);
        if (error) throw error;
        savedTechnicianId = selectedTechnician.id;
        toast.success('Technician updated successfully');
      } else {
        // Create new technician — password (for Supabase Auth) is required.
        if (!password) {
          toast.error('Password is required when creating a new technician');
          return;
        }


        // Check for duplicate employee_id or phone before creating
        // OPTIMIZATION: Limit check to recent technicians (duplicates are usually recent)
        const { data: existingTechnicians } = await db.technicians.getAll(500, { activeRosterOnly: false });
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
          savedTechnicianId = newTechnician.id;
          setNewlyCreatedTechnicianId(newTechnician.id);
        }
        
        toast.success('Technician created successfully');
      }

      if (password && savedTechnicianId) {
        const techId = savedTechnicianId;
        const sessionReady = await ensureAdminSupabaseSession();
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!sessionReady || !accessToken) {
          toast.warning(
            'Technician saved, but admin session is missing. Log in to admin and re-save the password to set it in Supabase Auth.',
            { duration: 10000 }
          );
        } else {
          try {
            const syncRes = await fetch('/.netlify/functions/sync-technician-auth-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                technicianId: techId,
                email: technicianFormData.email,
                password,
                accessToken,
                fullName: technicianFormData.fullName,
              }),
            });
            if (syncRes.ok) {
              toast.success('Technician login set in Supabase Auth');
            } else {
              const errBody = (await syncRes.json().catch(() => ({}))) as {
                error?: string;
                hint?: string;
              };
              console.warn('Technician auth sync failed:', errBody);
              toast.error(
                errBody.error ||
                  'Failed to set technician password. They will not be able to log in until this is retried.',
                { duration: 10000 }
              );
            }
          } catch (syncErr) {
            console.warn('Technician auth sync error:', syncErr);
            toast.error(
              'Network error while setting technician password. Retry from Settings → Edit Technician.',
              { duration: 10000 }
            );
          }
        }
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

  const handleGenerateStyledQrImage = async () => {
    const content = qrImageGeneratorData.content.trim();
    if (!content) {
      toast.error('Enter the link or text for the QR code');
      return;
    }

    setIsGeneratingQrImage(true);
    try {
      const { default: QRCodeStyling } = await import('qr-code-styling');
      const qrSize = 760;

      const qrCode = new QRCodeStyling({
        width: qrSize,
        height: qrSize,
        type: 'canvas',
        data: content,
        margin: 18,
        qrOptions: {
          errorCorrectionLevel: 'H'
        },
        dotsOptions: {
          color: '#000000',
          type: 'dots'
        },
        cornersSquareOptions: {
          color: '#000000',
          type: 'square'
        },
        cornersDotOptions: {
          color: '#000000',
          type: 'square'
        },
        backgroundOptions: {
          color: '#ffffff'
        }
      });

      const rawData = await qrCode.getRawData('png');
      const blob = rawData instanceof Blob ? rawData : new Blob([rawData as BlobPart], { type: 'image/png' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeFileName = (qrImageGeneratorData.fileName.trim() || 'hydrogen-ro-qr')
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      link.href = objectUrl;
      link.download = `${safeFileName || 'hydrogen-ro-qr'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      toast.success('QR image downloaded');
    } catch (error) {
      console.error('Error generating styled QR image:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate QR image');
    } finally {
      setIsGeneratingQrImage(false);
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

  const parseTrackerAmount = (value: unknown): number => {
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const formatTrackerAmount = (amount: number): string => {
    return amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const loadAmountTrackers = async () => {
    try {
      const { data, error } = await db.amountTrackers.getAll();
      if (error) throw error;

      setAmountTrackers(
        (data || []).map((row: any) => ({
          id: row.id as string,
          name: (row.name as string) || 'Untitled',
          amount: parseTrackerAmount(row.amount),
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
        }))
      );
    } catch (error) {
      console.error('Error loading amount trackers:', error);
      toast.error('Failed to load trackers');
    }
  };

  const handleAddTracker = () => {
    setNewTrackerName('');
    setNewTrackerAmount('');
    setAddTrackerDialogOpen(true);
  };

  const handleSaveTracker = async () => {
    try {
      const name = newTrackerName.trim();
      if (!name) {
        toast.error('Please enter a name');
        return;
      }

      const amount = newTrackerAmount.trim() === '' ? 0 : parseFloat(newTrackerAmount);
      if (!Number.isFinite(amount)) {
        toast.error('Please enter a valid starting amount');
        return;
      }

      const { error } = await db.amountTrackers.create({ name, amount });
      if (error) throw error;

      toast.success('Tracker created');
      await loadAmountTrackers();
      setAddTrackerDialogOpen(false);
      setNewTrackerName('');
      setNewTrackerAmount('');
    } catch (error: any) {
      console.error('Error saving tracker:', error);
      const errorMsg = error?.message || error?.details || 'Unknown error';
      toast.error('Failed to create tracker: ' + errorMsg);
    }
  };

  const handleAdjustTracker = async (trackerId: string, direction: 'add' | 'subtract') => {
    if (adjustingTrackerId) return;

    const raw = (adjustInputs[trackerId] || '').trim();
    if (!raw) {
      toast.error('Enter an amount first');
      return;
    }

    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a valid positive amount');
      return;
    }

    const delta = direction === 'add' ? value : -value;
    setAdjustingTrackerId(trackerId);

    try {
      const { data, error } = await db.amountTrackers.adjust(trackerId, delta);
      if (error) throw error;

      const row = data as { id?: string; name?: string; amount?: unknown; updated_at?: string } | null;
      if (row?.id) {
        setAmountTrackers((prev) =>
          prev.map((t) =>
            t.id === row.id
              ? {
                  ...t,
                  amount: parseTrackerAmount(row.amount),
                  updated_at: (row.updated_at as string) || t.updated_at,
                }
              : t
          )
        );
      } else {
        await loadAmountTrackers();
      }

      setAdjustInputs((prev) => ({ ...prev, [trackerId]: '' }));
      toast.success(direction === 'add' ? 'Amount added' : 'Amount subtracted');
    } catch (error) {
      console.error('Error adjusting tracker:', error);
      toast.error('Failed to update amount');
    } finally {
      setAdjustingTrackerId(null);
    }
  };

  const handleDeleteTracker = async (trackerId: string) => {
    try {
      const { error } = await db.amountTrackers.delete(trackerId);
      if (error) throw error;

      toast.success('Tracker deleted');
      await loadAmountTrackers();
      setTrackerToDelete(null);
    } catch (error) {
      console.error('Error deleting tracker:', error);
      toast.error('Failed to delete tracker');
      setTrackerToDelete(null);
    }
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
    // technicians: direct `select('*')` fails after column lockdown (salary, push_subscription).
    // Use the same admin RPC as the rest of the app.
    if (tableName === 'technicians') {
      const { data, error } = await db.technicians.getAll(undefined, { activeRosterOnly: false });
      if (error) return { data: [], error };
      const rows = [...(data ?? [])].sort((a, b) => {
        const aVal = a?.[orderBy];
        const bVal = b?.[orderBy];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return -1;
        if (bVal == null) return 1;
        return String(aVal).localeCompare(String(bVal));
      });
      return { data: rows, error: null };
    }

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
    if (isManager) {
      toast.error(managerRestrictedTitle);
      return;
    }
    setIsDownloading(true);

    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const tables: { name: string; data: any[] }[] = [];
      const failedTables: string[] = [];
      const skippedMissingTables: string[] = [];

      for (const { name, orderBy } of DATABASE_EXPORT_TABLES) {
        const { data, error } = await fetchAllFromTable(name, orderBy);
        if (error) {
          if (isMissingTableError(error)) {
            skippedMissingTables.push(name);
            continue;
          }
          failedTables.push(name);
          toast.error(`Failed to fetch ${name}: ${error.message}`);
          continue;
        }
        // `technicians.password` column was dropped 2026-05-24; nothing to strip from the row anymore.
        const rows = data;
        tables.push({ name, data: rows });
      }

      // Create ZIP file with all CSV files
      const { default: JSZip } = await import('jszip');
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

      if (failedTables.length > 0) {
        toast.warning(
          `Downloaded ${tables.length} table(s); failed: ${failedTables.join(', ')}`
        );
      } else if (skippedMissingTables.length > 0) {
        toast.success(
          `Downloaded ${tables.length} table(s) in ${zipFilename}. Skipped (not in database): ${skippedMissingTables.join(', ')}`
        );
      } else {
        toast.success(
          `Successfully downloaded ${tables.length} table(s) in ZIP file: ${zipFilename}`
        );
      }
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
      <div className="admin-page">
        <div className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
              <div className="flex items-center">
                <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-foreground">Calling</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">Manage customer calls</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCallingPage(false)}
                className="text-muted-foreground hover:text-foreground -ml-2"
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

  const activeTechniciansList = technicians.filter((t) => t.account_status !== 'INACTIVE');
  const inactiveTechniciansList = technicians.filter((t) => t.account_status === 'INACTIVE');

  const renderTechnicianCard = (technician: Technician) => (
    <Card key={technician.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">{technician.fullName}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{technician.employeeId}</p>
          </div>
          <Badge
            variant={technician.account_status === 'ACTIVE' ? 'default' : 'secondary'}
            className="text-xs shrink-0"
          >
            {technician.account_status}
          </Badge>
        </div>

        <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground mb-4">
          <div className="flex items-start gap-2">
            <span className="font-medium shrink-0">Email:</span>
            <span className="truncate">{technician.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium shrink-0">Phone:</span>
            <span className="truncate">{technician.phone}</span>
          </div>
        </div>

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

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleEditTechnician(technician)}
          disabled={isManager}
          title={isManager ? managerRestrictedTitle : undefined}
          className="w-full text-xs sm:text-sm"
        >
          {isManager ? (
            <Lock className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
          ) : (
            <Edit className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
          )}
          {isManager ? 'Restricted' : 'Edit'}
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="admin-page">
      {/* Header - sticky so Back stays visible when scrolling */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 sm:py-0 sm:h-16">
            <div className="flex items-center">
              <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 mr-2 sm:mr-3 shrink-0" />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-foreground">Settings</h1>
              </div>
            </div>
            
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin')}
                className="text-muted-foreground hover:text-foreground -ml-2"
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
                            <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">
                              {technician.fullName}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate">{technician.employeeId}</p>
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
                                <div className="text-xs font-medium text-foreground/90 dark:text-gray-300">
                                  View Location
                                </div>
                              </div>
                            </button>
                            {lastUpdated && (
                              <div className="text-xs text-muted-foreground dark:text-muted-foreground/70">
                                Last updated: {lastUpdated}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground/70 p-2">
                            <MapPin className="w-5 h-5 shrink-0" />
                            <span className="text-xs">No location data available</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                {technicians.length === 0 && (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
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
                  className=" w-full sm:w-auto"
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
                    className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-border hover:bg-muted/40 dark:border-gray-700 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Checkbox
                      id={`todo-${todo.id}`}
                      checked={false}
                      onCheckedChange={() => handleTodoCheckboxClick(todo.id)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`todo-${todo.id}`}
                      className="flex-1 text-sm sm:text-base text-foreground dark:text-gray-100 cursor-pointer"
                    >
                      {todo.text}
                    </label>
                    <span className="text-xs text-muted-foreground dark:text-muted-foreground/70 shrink-0">
                      {new Date(todo.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {todos.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No tasks yet. Click "Add Task" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Amount Trackers */}
          <Card id="section-amount-trackers">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <DollarSign className="w-5 h-5" />
                    Amount Trackers
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Named running totals — e.g. Cash flow starts at ₹1,000, add ₹100 → ₹1,100.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleAddTracker}
                  className=" w-full sm:w-auto"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Tracker
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                {amountTrackers.map((tracker) => (
                  <div
                    key={tracker.id}
                    className="p-4 rounded-lg border border-border dark:border-gray-700 hover:border-border dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base sm:text-lg text-foreground dark:text-gray-100 truncate">
                          {tracker.name}
                        </h3>
                        <p className="text-xs text-muted-foreground dark:text-muted-foreground/70 mt-0.5">
                          Updated {new Date(tracker.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          ₹{formatTrackerAmount(tracker.amount)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="Amount"
                        value={adjustInputs[tracker.id] || ''}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '');
                          setAdjustInputs((prev) => ({ ...prev, [tracker.id]: v }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && adjustInputs[tracker.id]?.trim()) {
                            handleAdjustTracker(tracker.id, 'add');
                          }
                        }}
                        className="flex-1"
                        disabled={adjustingTrackerId === tracker.id}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleAdjustTracker(tracker.id, 'add')}
                          disabled={adjustingTrackerId === tracker.id}
                        >
                          {adjustingTrackerId === tracker.id ? '…' : '+ Add'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 sm:flex-none border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                          onClick={() => handleAdjustTracker(tracker.id, 'subtract')}
                          disabled={adjustingTrackerId === tracker.id}
                        >
                          {adjustingTrackerId === tracker.id ? '…' : '− Subtract'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 shrink-0"
                          onClick={() => setTrackerToDelete(tracker.id)}
                          disabled={adjustingTrackerId === tracker.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {amountTrackers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No trackers yet. Click &quot;New Tracker&quot; to create one (e.g. Cash flow).
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Advanced customer search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Users className="w-5 h-5" />
                Advanced customer search
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Combine brand, location, service type, AMC, last service date, and more to find customers — like "Livpure in Kasavanahalli or Haralur".
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => setAdvancedSearchDialogOpen(true)}
              >
                <Users className="w-4 h-4 mr-2 shrink-0" />
                Open advanced search
              </Button>
            </CardContent>
          </Card>
          <AdvancedCustomerSearchDialog
            open={advancedSearchDialogOpen}
            onOpenChange={setAdvancedSearchDialogOpen}
          />

          {/* Reminders: add general / customer, then load list dialog */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <ListTodo className="w-5 h-5" />
                Reminders
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Add a general reminder, one tied to a customer, or load the list to search, filter, and edit.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-2">
                <Button
                  type="button"
                  className="w-full min-h-10 justify-center sm:min-w-0 sm:flex-1 sm:max-w-none"
                  onClick={() => setAddGeneralReminderOpen(true)}
                >
                  <Bell className="w-4 h-4 mr-2 shrink-0" />
                  Add general reminder
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full min-h-10 justify-center sm:min-w-0 sm:flex-1 sm:max-w-none"
                  onClick={() => setAddCustomerReminderOpen(true)}
                >
                  <User className="w-4 h-4 mr-2 shrink-0" />
                  Add customer reminder
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full min-h-10 justify-center sm:min-w-0 sm:flex-1 sm:max-w-none"
                  onClick={() => setRemindersDialogOpen(true)}
                >
                  <ListTodo className="w-4 h-4 mr-2 shrink-0" />
                  Load reminders
                </Button>
              </div>
            </CardContent>
          </Card>
          <AddReminderDialog
            open={addGeneralReminderOpen}
            onOpenChange={setAddGeneralReminderOpen}
            entity={{ type: 'general', id: null }}
            dialogTitle="Add general reminder"
          />
          <AddReminderDialog
            open={addCustomerReminderOpen}
            onOpenChange={setAddCustomerReminderOpen}
            entity={{ type: 'general', id: null }}
            requireCustomerPick
            dialogTitle="Add customer reminder"
          />
          <SettingsRemindersDialog
            open={remindersDialogOpen}
            onOpenChange={setRemindersDialogOpen}
          />

          {/* Recurring service tracking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Repeat className="w-5 h-5" />
                Reminder Tracking
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                All active reminders in one worklist, due ones first (one-time or recurring). Call the
                customer, log the outcome (no response / waiting / will return / confirmed), snooze,
                view reports, or create a job. Mark done to clear it.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Button
                type="button"
                className="w-full min-h-10 justify-center sm:w-auto"
                onClick={() => setRecurringServiceOpen(true)}
              >
                <Repeat className="w-4 h-4 mr-2 shrink-0" />
                Open reminder tracker
              </Button>
            </CardContent>
          </Card>
          <RecurringServiceTracker
            open={recurringServiceOpen}
            onOpenChange={setRecurringServiceOpen}
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
                  className=" w-full"
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

          {/* Website analytics */}
          <WebsiteAnalyticsGate />

          {/* Letterhead Documents / Service Reports */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <FileText className="w-5 h-5" />
                Letterhead Documents
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Build service reports, AMC reports and custom letterhead
                documents on Hydrogen RO or Eleven RO letterhead.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    navigate(
                      '/admin?view=letterhead-documents&type=service_report'
                    )
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Service Report
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    navigate('/admin?view=letterhead-documents&type=amc_report')
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  AMC Report
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    navigate(
                      '/admin?view=letterhead-documents&type=custom_document'
                    )
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Custom Document
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    navigate('/admin?view=letterhead-documents&type=letterhead')
                  }
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Create Letterhead
                </Button>
              </div>
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

          {/* Merge duplicate customers */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <GitMerge className="w-5 h-5" />
                    Merge Customers
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Combine two customer records when the same person booked with a different number
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setMergeCustomersOpen(true)}
                  disabled={isManager}
                  title={isManager ? managerRestrictedTitle : undefined}
                  variant="outline"
                  className="w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  size="sm"
                >
                  {isManager ? (
                    <Lock className="w-4 h-4 mr-2" />
                  ) : (
                    <GitMerge className="w-4 h-4 mr-2" />
                  )}
                  {isManager ? 'Restricted' : 'Merge duplicate customers'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <p className="text-sm text-muted-foreground">
                Moves all jobs, AMC, invoices, and call history to the keeper record. The duplicate
                phone is saved as alternate phone. Requires{' '}
                <code className="text-xs">merge-customers-admin-rpc.sql</code> in Supabase.
              </p>
            </CardContent>
          </Card>

          {/* Warranty Management */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <ShieldCheck className="w-5 h-5" />
                    Warranty Management
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Add product & part warranties for a customer. They can self-check status at /warranty by phone.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setWarrantyDialogOpen(true)}
                  variant="outline"
                  className="w-full sm:w-auto"
                  size="sm"
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Manage warranties
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <p className="text-sm text-muted-foreground">
                Pull parts from any job or add coverage by category (electricals, consumables, outside filter,
                membrane, body). Default duration is 3 months per item.
              </p>
            </CardContent>
          </Card>

          {/* Direct / Office Sales */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <DollarSign className="w-5 h-5" />
                    Direct / Office Sales
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Record a counter sale with no customer or technician (e.g. selling a part over the counter)
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setDirectSaleOpen(true)}
                  disabled={isManager}
                  title={isManager ? managerRestrictedTitle : undefined}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  size="sm"
                >
                  {isManager ? (
                    <Lock className="w-4 h-4 mr-2" />
                  ) : (
                    <DollarSign className="w-4 h-4 mr-2" />
                  )}
                  {isManager ? 'Restricted' : 'Record direct sale'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <p className="text-sm text-muted-foreground">
                Saved as a completed, paid sale that counts toward revenue for the chosen date.
                Optionally pick an inventory item to deduct stock and track cost for profit.
              </p>
            </CardContent>
          </Card>

          {/* Styled QR Image Generator */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <QrCode className="w-5 h-5" />
                QR Image Generator
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Create downloadable QR code images with rounded dots and square corner markers.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="qr-generator-content">QR link or text</Label>
                  <Input
                    id="qr-generator-content"
                    value={qrImageGeneratorData.content}
                    onChange={(e) => setQrImageGeneratorData((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder="https://example.com or UPI/payment text"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="qr-generator-filename">File name</Label>
                  <Input
                    id="qr-generator-filename"
                    value={qrImageGeneratorData.fileName}
                    onChange={(e) => setQrImageGeneratorData((prev) => ({ ...prev, fileName: e.target.value }))}
                    placeholder="hydrogen-ro-qr"
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={handleGenerateStyledQrImage}
                  disabled={isGeneratingQrImage}
                  className=" w-full sm:w-auto"
                >
                  {isGeneratingQrImage ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Download QR Image
                </Button>
              </div>
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
                  className=" w-full sm:w-auto"
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
                          <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">{qrCode.name}</h3>
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
                  <div className="col-span-full text-center py-8 text-muted-foreground">
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
                  className=" w-full sm:w-auto"
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
                          <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">{qrCode.name}</h3>
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
                  <div className="col-span-full text-center py-8 text-muted-foreground">
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
                          <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">{qrCode.name}</h3>
                          {qrCode.productName && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">Product: {qrCode.productName}</p>
                          )}
                        </div>
                      </div>
                      
                      {qrCode.qrCodeUrl && (
                        <div className="mb-4 flex justify-center">
                          <img 
                            src={qrCode.qrCodeUrl} 
                            alt={qrCode.name} 
                            className="w-32 h-32 object-contain border border-border rounded"
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
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    No product QR codes added yet. Click "Add Product QR Code" to create one.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Technician Management */}
            <Card id="section-technician-management">
              <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                      <Users className="w-5 h-5" />
                      Technician Management
                    </CardTitle>
                  <CardDescription className="text-sm mt-1">
                      Use Edit → account status to deactivate. Inactive staff stay in the database but are hidden from assignments, maps, Technician Payments, and salary totals.
                    </CardDescription>
                  </div>
                <Button 
                  onClick={handleAddTechnician}
                  disabled={isManager}
                  title={isManager ? managerRestrictedTitle : undefined}
                  className=" w-full sm:w-auto disabled:opacity-50"
                  size="sm"
                >
                    {isManager ? (
                      <Lock className="w-4 h-4 mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {isManager ? 'Restricted' : 'Add Technician'}
                  </Button>
                </div>
              </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Active team</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeTechniciansList.map((technician) => renderTechnicianCard(technician))}
                </div>
                {activeTechniciansList.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">No active technicians yet. Add one above.</p>
                )}
              </div>
              {inactiveTechniciansList.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">Inactive</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Hidden from assignments and maps. Historical jobs and payments are unchanged.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {inactiveTechniciansList.map((technician) => renderTechnicianCard(technician))}
                  </div>
                </div>
              )}
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
              <div className="flex items-center justify-between p-6 bg-muted/40 dark:bg-gray-800 rounded-lg border border-border dark:border-gray-700">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground dark:text-white text-base sm:text-lg mb-2">
                    Enable Location Tracking
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground/70">
                    When enabled, technicians' location will be automatically updated when they open the app or refresh the page. 
                    This helps calculate distances to customer locations.
                  </p>
                </div>
                <Switch
                  checked={locationTrackingEnabled}
                  onCheckedChange={handleLocationTrackingToggle}
                  className="ml-6 border-2 border-border dark:border-gray-600 data-[state=unchecked]:bg-card dark:data-[state=unchecked]:bg-gray-700"
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
                  disabled={isDownloading || isManager}
                  title={isManager ? managerRestrictedTitle : undefined}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  size="sm"
                >
                  {isManager ? (
                    <Lock className="w-4 h-4 mr-2" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {isManager
                    ? 'Restricted'
                    : isDownloading
                      ? 'Downloading...'
                      : 'Download All Data'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-900 dark:text-blue-200 mb-2">
                  <strong>What will be downloaded:</strong>
                </p>
                  <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside columns-1 sm:columns-2">
                    {DATABASE_EXPORT_TABLES.map((t) => (
                      <li key={t.name}>{t.label}</li>
                    ))}
                  </ul>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-3">
                  Up to {DATABASE_EXPORT_TABLES.length} tables as CSV in one ZIP. Optional tables (
                  {DATABASE_EXPORT_TABLES.filter((t) => t.optional).map((t) => t.label).join(', ')}
                  ) are skipped if not created in Supabase. Technician passwords are stored in Supabase Auth (not exported).
                </p>
              </div>
            </CardContent>
          </Card>
                </div>
      </div>

      <MergeCustomersDialog
        open={mergeCustomersOpen}
        onOpenChange={setMergeCustomersOpen}
        disabled={isManager}
        disabledTitle={managerRestrictedTitle}
      />

      <WarrantyManagementDialog open={warrantyDialogOpen} onOpenChange={setWarrantyDialogOpen} />

      <DirectSaleDialog open={directSaleOpen} onOpenChange={setDirectSaleOpen} />

      {/* Add/Edit Technician Dialog */}
      <Dialog open={addTechnicianDialogOpen || editTechnicianDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAddTechnicianDialogOpen(false);
          setEditTechnicianDialogOpen(false);
          setSelectedTechnician(null);
        }
      }}>
        <DialogContent
          className="w-full sm:w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-none sm:rounded-lg"
          onOpenAutoFocus={(e) => {
            if (editTechnicianDialogOpen) e.preventDefault();
          }}
        >
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
              <h3 className="text-base sm:text-lg font-semibold text-foreground">Basic Information</h3>
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
                    className="bg-muted/40"
                    readOnly={!editTechnicianDialogOpen}
                  />
                  {!editTechnicianDialogOpen && (
                    <p className="text-xs text-muted-foreground mt-1">Employee ID is auto-generated</p>
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
                  <p className="text-xs text-muted-foreground mt-1">Monthly basic salary for this technician</p>
                </div>
                <div>
                  <Label htmlFor="salaryEffectiveFromMonth">Salary Effective From</Label>
                  <Input
                    id="salaryEffectiveFromMonth"
                    type="month"
                    value={technicianFormData.salaryEffectiveFromMonth}
                    onChange={(e) =>
                      setTechnicianFormData(prev => ({
                        ...prev,
                        salaryEffectiveFromMonth: e.target.value || getCurrentMonthKey()
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    If basic salary changes, old months keep the old amount.
                  </p>
                </div>
              </div>
              {editTechnicianDialogOpen && (
                <div className="rounded-lg border border-border bg-muted/40/80 p-3 sm:p-4 space-y-2">
                  <Label htmlFor="accountStatus">Account status</Label>
                  <Select
                    value={technicianFormData.accountStatus}
                    onValueChange={(v) =>
                      setTechnicianFormData((prev) => ({
                        ...prev,
                        accountStatus: v as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
                      }))
                    }
                  >
                    <SelectTrigger id="accountStatus" className="bg-card">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active — roster, payments & salary lists, can log in</SelectItem>
                      <SelectItem value="INACTIVE">Inactive — hidden from roster, maps, and salary/payment screens</SelectItem>
                      <SelectItem value="SUSPENDED">Suspended — cannot log in; adjust in roster filters as needed</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Inactive keeps all job and payment history; change back to Active to show them in Technician Payments again.
                  </p>
                </div>
              )}
            </div>
            
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">Technician Photo</h3>
              <div>
                <Label className="text-sm sm:text-base">Upload Technician Photo (Optional)</Label>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">Upload photo for ID card display</p>
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
                      className="w-32 h-32 object-cover border border-border rounded-full"
                    />
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">Payment QR Code</h3>
              <div>
                <Label className="text-sm sm:text-base">Upload Payment QR Code (Optional)</Label>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">Upload QR code for payment scanning</p>
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
                      className="w-32 h-32 object-contain border border-border rounded"
                    />
                  </div>
                )}
              </div>
            </div>
            
            {/* QR Code Visibility Settings */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">QR Code Visibility</h3>
              <div>
                <Label className="text-sm sm:text-base">Select which QR codes this technician can see</Label>
                <p className="text-xs sm:text-sm text-muted-foreground mb-3">Control which payment QR codes are available to this technician</p>
                
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
                      <Label className="text-xs sm:text-sm font-medium text-foreground/90">Common QR Codes:</Label>
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
                      <Label className="text-xs sm:text-sm font-medium text-foreground/90">Technician QR Codes:</Label>
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
                    <p className="text-xs sm:text-sm text-muted-foreground italic">No QR codes available. Add common QR codes or upload QR codes for technicians.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Common QR (non-payment) - multiple allowed, shown below payment QR */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">Common QR</h3>
              <div>
                <Label className="text-sm sm:text-base">Common QRs to show to this technician</Label>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">Select one or more. They are shown below the payment QR on the technician app. Add options in the &quot;Common QR&quot; card above.</p>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {technicianCommonQrCodes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No Common QRs added yet. Add some in the Common QR card above.</p>
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
                    <div className="bg-card dark:bg-gray-800 p-3 rounded border border-green-200 dark:border-green-700">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Label className="text-xs font-medium text-foreground/90 dark:text-gray-300">ID Card Link:</Label>
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
                      <p className="text-xs font-mono text-muted-foreground dark:text-muted-foreground/70 break-all">
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

          {editTechnicianDialogOpen && selectedTechnician && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/20 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">Delete technician</h3>
                <p className="text-xs text-red-800/90 dark:text-red-300/90 mt-1">
                  Permanently remove {selectedTechnician.fullName} ({selectedTechnician.employeeId}).
                  Jobs and customers are kept; assignments are cleared.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleStartDeleteTechnician(selectedTechnician)}
                disabled={isManager}
                title={isManager ? managerRestrictedTitle : undefined}
                className="w-full sm:w-auto text-red-600 border-red-300 hover:bg-red-100 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-950 disabled:opacity-50"
              >
                {isManager ? (
                  <Lock className="w-4 h-4 mr-2" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                {isManager ? 'Restricted' : 'Delete technician…'}
              </Button>
            </div>
          )}

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
              disabled={
                isManager ||
                !technicianFormData.fullName ||
                !technicianFormData.phone ||
                !technicianFormData.email ||
                !technicianFormData.employeeId ||
                (!editTechnicianDialogOpen && !technicianFormData.password) ||
                technicianFormData.baseSalary < 0
              }
              title={isManager ? managerRestrictedTitle : undefined}
              className=" w-full sm:w-auto"
            >
              {isManager
                ? 'Restricted'
                : editTechnicianDialogOpen
                  ? 'Update Technician'
                  : 'Create Technician'}
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
                <p className="text-sm text-muted-foreground mb-2">Upload QR code image for payment scanning</p>
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
                      className="w-32 h-32 object-contain border border-border rounded"
                    />
                    <p className="text-xs text-muted-foreground mt-1">URL: {qrCodeFormData.qrCodeUrl.substring(0, 50)}...</p>
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
              className=" w-full sm:w-auto"
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
                <p className="text-sm text-muted-foreground mb-2">Upload the QR image (non-payment)</p>
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
                    <img src={technicianCommonQrFormData.qrCodeUrl} alt="Common QR" className="w-32 h-32 object-contain border border-border rounded" />
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
              className=" w-full sm:w-auto"
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
                <p className="text-xs text-muted-foreground mt-1">This will be displayed on the verification page</p>
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
                <p className="text-xs text-muted-foreground mt-1">Leave empty if you don't want to show product name</p>
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
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6">
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
              className=" w-full sm:w-auto"
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
              className=" w-full sm:w-auto order-1 sm:order-2 h-10 sm:h-9 text-sm sm:text-sm font-medium"
            >
              Complete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Amount Tracker Dialog */}
      <Dialog
        open={addTrackerDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddTrackerDialogOpen(false);
            setNewTrackerName('');
            setNewTrackerAmount('');
          }
        }}
      >
        <DialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-md max-h-[85vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>New Amount Tracker</DialogTitle>
            <DialogDescription>
              Give it a name (e.g. Cash flow) and a starting amount.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="trackerName">Name</Label>
              <Input
                id="trackerName"
                value={newTrackerName}
                onChange={(e) => setNewTrackerName(e.target.value)}
                placeholder="e.g. Cash flow"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTrackerName.trim()) {
                    handleSaveTracker();
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="trackerAmount">Starting amount (₹)</Label>
              <Input
                id="trackerAmount"
                type="text"
                inputMode="decimal"
                value={newTrackerAmount}
                onChange={(e) => setNewTrackerAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 1000"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setAddTrackerDialogOpen(false);
                setNewTrackerName('');
                setNewTrackerAmount('');
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTracker}
              disabled={!newTrackerName.trim()}
              className=" w-full sm:w-auto"
            >
              Create Tracker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Amount Tracker Confirmation */}
      <AlertDialog
        open={trackerToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTrackerToDelete(null);
        }}
      >
        <AlertDialogContent className="!w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:!w-full sm:!max-w-lg p-5 sm:p-6">
          <AlertDialogHeader className="text-left sm:text-center">
            <AlertDialogTitle className="text-base sm:text-lg font-semibold">
              Delete Tracker
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm sm:text-base text-muted-foreground mt-2">
              Delete this tracker permanently? The current total will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2 mt-4 sm:mt-0">
            <AlertDialogCancel
              onClick={() => setTrackerToDelete(null)}
              className="w-full sm:w-auto order-2 sm:order-1 h-10 sm:h-9 text-sm font-medium"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (trackerToDelete) handleDeleteTracker(trackerToDelete);
              }}
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto order-1 sm:order-2 h-10 sm:h-9 text-sm font-medium"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete technician — 2-step confirmation */}
      <AlertDialog
        open={deleteTechnicianStep === 1}
        onOpenChange={(open) => {
          if (!open) resetDeleteTechnicianFlow();
        }}
      >
        <AlertDialogContent className="mx-4 sm:mx-0 max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete technician? (Step 1 of 2)</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  You are about to permanently delete{' '}
                  <strong className="text-foreground">{technicianToDelete?.fullName}</strong> (
                  {technicianToDelete?.employeeId}). This cannot be undone.
                </p>
                <p>The following will be removed:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Profile, login, ID card link, salary and inventory records</li>
                  <li>Assignment requests, parts used, and messages to this technician</li>
                </ul>
                <p>
                  <strong className="text-foreground">Jobs and customers are not deleted.</strong> Job
                  assignments will be cleared.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                setDeleteTechnicianStep(2);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTechnicianStep === 2}
        onOpenChange={(open) => {
          if (!open) resetDeleteTechnicianFlow();
        }}
      >
        <AlertDialogContent className="mx-4 sm:mx-0 max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm deletion (Step 2 of 2)</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete{' '}
              <strong>{technicianToDelete?.fullName}</strong> and all related data? This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0" disabled={isDeletingTechnician}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeletingTechnician}
              onClick={(e) => {
                e.preventDefault();
                void handleExecuteDeleteTechnician();
              }}
            >
              {isDeletingTechnician ? 'Deleting…' : 'Delete permanently'}
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
                <h3 className="font-semibold text-foreground mb-1">Logout</h3>
                <p className="text-sm text-muted-foreground">Sign out of your account</p>
              </div>
              <Button
                variant="outline"
                size="lg"
                onClick={async () => {
                  await logout();
                  navigate('/admin', { replace: true });
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