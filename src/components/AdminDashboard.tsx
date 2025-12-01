import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminHeader from '@/components/AdminHeader';
import AdminLogin from '@/components/AdminLogin';
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
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
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
  Plus,
  User,
  ExternalLink,
  Camera,
  History,
  Settings,
  Receipt,
  FileText,
  Star,
  Download,
  Eye,
  PhoneCall,
  Send,
  Upload,
  Image,
  Square,
  CalendarPlus,
  XCircle,
  CheckCircle2,
  Filter,
  Tag,
  MessageSquare,
  DollarSign,
  BarChart3,
  ArrowLeft,
  ArrowRight,
  X,
  LogOut
} from 'lucide-react';
import { db, supabase } from '@/lib/supabase';
import { registerAdminPWA, disablePWA } from '@/lib/pwa';
import { Customer, Job, Technician } from '@/types';
import { cloudinaryService, compressImage } from '@/lib/cloudinary';
import { toast } from 'sonner';
import { getCachedQrCodes, cacheQrCodes, shouldUseCache, CommonQrCode } from '@/lib/qrCodeManager';
import { openInGoogleMaps, extractCoordinates, formatAddressForDisplay } from '@/lib/maps';
import FollowUpModal from '@/components/FollowUpModal';
import { sendNotification, createJobAssignedNotification, createJobCompletedNotification, createJobCancelledNotification, createJobAssignmentRequestNotification } from '@/lib/notifications';
import BillModal from './BillModal';
import AMCModal from './AMCModal';
import QuotationModal from './QuotationModal';
import TaxInvoiceModal from './TaxInvoiceModal';
import GSTInvoicesPage from './GSTInvoicesPage';
import AMCViewPage from './AMCViewPage';
import ImageUpload from '@/components/ImageUpload';
import TechnicianPayments from './TechnicianPayments';
import BillingStats from './BillingStats';
import Analytics from './Analytics';
import CallingPage from '@/pages/CallingPage';
import { generateJobNumber, formatPreferredTimeSlot, mapServiceTypesToDbValue, extractLocationFromAddressString, bangaloreAreas, levenshteinDistance, calculateSimilarity, extractPhotoUrls, parseJobRequirements, getFormattedTimeSlot } from '@/lib/adminUtils';
import { StatusBadge } from './admin/StatusBadge';
import { CustomerCardHeader } from './admin/CustomerCardHeader';
import { WhatsAppIcon } from './WhatsAppIcon';
import { ContactSection } from './admin/ContactSection';
import { CompletedJobSection } from './admin/CompletedJobSection';
import { DeniedJobSection } from './admin/DeniedJobSection';
import { FollowUpJobSection } from './admin/FollowUpJobSection';
import { CompleteJobDialog } from './admin/CompleteJobDialog';
import { StatsCards } from './admin/StatsCards';
import EditCustomerDialog from './admin/EditCustomerDialog';
import AddCustomerDialog from './admin/AddCustomerDialog';
import CustomerReportDialog from './admin/CustomerReportDialog';
import SendMessageDialog from './admin/SendMessageDialog';
import RecentAccountsDialog from './admin/RecentAccountsDialog';
import ServiceHistoryDialog from './admin/ServiceHistoryDialog';
import PhotoGalleryDialog from './admin/PhotoGalleryDialog';
import PhotoViewerDialog from './admin/PhotoViewerDialog';
import CustomerPhotoGalleryDialog from './admin/CustomerPhotoGalleryDialog';
import AssignJobDialog from './admin/AssignJobDialog';
import NewJobDialog from './admin/NewJobDialog';
import EditJobDialog from './admin/EditJobDialog';
import PhoneNumbersDialog from './admin/PhoneNumbersDialog';
import DescriptionDialog from './admin/DescriptionDialog';
import JobAddressDialog from './admin/JobAddressDialog';
import AddressDialog from './admin/AddressDialog';
import DenyJobDialog from './admin/DenyJobDialog';
import ReassignJobDialog from './admin/ReassignJobDialog';
import EditCompletedJobDialog from './admin/EditCompletedJobDialog';

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

// Utility functions moved to @/lib/adminUtils

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading, logout } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerAMCStatus, setCustomerAMCStatus] = useState<Record<string, boolean>>({}); // Map customer ID to hasActiveAMC
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // For the input field
  const [isSearching, setIsSearching] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [phonePopupOpen, setPhonePopupOpen] = useState(false);
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState<Customer | null>(null);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [selectedCustomerForBill, setSelectedCustomerForBill] = useState<Customer | null>(null);
  const [quotationModalOpen, setQuotationModalOpen] = useState(false);
  const [selectedCustomerForQuotation, setSelectedCustomerForQuotation] = useState<Customer | null>(null);
  const [amcModalOpen, setAmcModalOpen] = useState(false);
  const [selectedCustomerForAMC, setSelectedCustomerForAMC] = useState<Customer | null>(null);
  const [taxInvoiceModalOpen, setTaxInvoiceModalOpen] = useState(false);
  const [selectedCustomerForTaxInvoice, setSelectedCustomerForTaxInvoice] = useState<Customer | null>(null);
  const [showGSTInvoicesPage, setShowGSTInvoicesPage] = useState(false);
  const [showAMCViewPage, setShowAMCViewPage] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'payments' | 'billing' | 'analytics' | 'calling'>('dashboard');
  const [moreOptionsDialogOpen, setMoreOptionsDialogOpen] = useState<Record<string, boolean>>({});
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
    notes: '',
    google_location: '',
    visible_address: '',
    custom_time: '',
    has_prefilter: null as boolean | null,
    address: {
      street: '',
      area: '',
      city: '',
      state: '',
      pincode: ''
    },
    location: {
      latitude: 0,
      longitude: 0,
      formattedAddress: ''
    },
    service_cost: 0,
    cost_agreed: false
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [visibleAddressSuggestions, setVisibleAddressSuggestions] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState<{[customerId: string]: boolean}>({});
  
  // Location and distance tracking
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [customerDistances, setCustomerDistances] = useState<Record<string, { distance: string; duration: string; isCalculating: boolean }>>({});
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // Auto-save refs
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedFormDataRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false);
  const locationManuallyEditedRef = useRef(false); // Track if user manually edited location field
  const previousAddressRef = useRef<string>(''); // Track previous address to detect changes
  
  // Ref to store calculateDistanceAndTime function to avoid circular dependency
  const calculateDistanceAndTimeRef = useRef<((origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, customerId: string) => Promise<void>) | null>(null);
  
  // Handle view change
  const handleViewChange = (view: 'dashboard' | 'payments' | 'billing' | 'analytics' | 'calling') => {
    setCurrentView(view);
  };

  // bangaloreAreas imported from @/lib/adminUtils

  // Extract location keywords from complete address and match with location array (for edit form)
  const extractLocationFromAddress = useMemo(() => {
    const completeAddress = editFormData?.address?.street || '';
    return extractLocationFromAddressString(completeAddress);
  }, [editFormData?.address?.street]);

  const filteredAddressSuggestions = useMemo(() => {
    if (!editFormData?.visible_address || editFormData.visible_address.trim().length === 0) {
      return [];
    }
    const searchTerm = editFormData.visible_address.toLowerCase();
    // Remove duplicates and filter
    const uniqueAreas = [...new Set(bangaloreAreas)];
    return uniqueAreas.filter(area => 
      area.toLowerCase().includes(searchTerm)
    ).slice(0, 12); // Limit to 12 suggestions
  }, [editFormData?.visible_address]);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newJobDialogOpen, setNewJobDialogOpen] = useState(false);
  const [selectedCustomerForJob, setSelectedCustomerForJob] = useState<Customer | null>(null);
  const [isDragOverNewJob, setIsDragOverNewJob] = useState(false);
  const [newJobFormData, setNewJobFormData] = useState({
    service_type: 'RO' as 'RO' | 'SOFTENER',
    service_sub_type: 'Installation',
    service_sub_type_custom: '',
    brand: '',
    model: '',
    scheduled_date: '',
    scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
    scheduled_time_custom: '',
    description: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
    assigned_technician_id: '',
    cost_agreed: '',
    lead_source: 'Website',
    lead_source_custom: '',
    photos: [] as string[]
  });
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isJobDialogReady, setIsJobDialogReady] = useState(false);
  const [photoGalleryOpen, setPhotoGalleryOpen] = useState(false);
  const [customerPhotoGalleryOpen, setCustomerPhotoGalleryOpen] = useState(false);
  const [selectedCustomerForPhotos, setSelectedCustomerForPhotos] = useState<Customer | null>(null);
  const [customerPhotos, setCustomerPhotos] = useState<{[customerId: string]: string[]}>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [isDragOverPhotos, setIsDragOverPhotos] = useState(false);
  const [uploadingThumbnails, setUploadingThumbnails] = useState<{[key: string]: {url: string, uploading: boolean}}>({});
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<Customer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<{[customerId: string]: Job[]}>({});
  const [selectedPhoto, setSelectedPhoto] = useState<{url: string, index: number, total: number} | null>(null);
  const [selectedBillPhotos, setSelectedBillPhotos] = useState<string[] | null>(null); // Track bill photos array for navigation
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  
  // Brand and model suggestions state
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const [dbBrands, setDbBrands] = useState<string[]>([]);
  const [dbModels, setDbModels] = useState<string[]>([]);
  const [descriptionDialogOpen, setDescriptionDialogOpen] = useState(false);
  const [selectedJobDescription, setSelectedJobDescription] = useState<{jobId: string, description: string} | null>(null);
  const [jobAddressDialogOpen, setJobAddressDialogOpen] = useState<{[jobId: string]: boolean}>({});
  const [lastCheckedJobId, setLastCheckedJobId] = useState<string | null>(null);
  const [isPollingEnabled, setIsPollingEnabled] = useState(true);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  
  // Brand and model data - Comprehensive list of popular RO and Softener brands in India
  const brandData = {
    'K': ['Kent'],
    'A': ['Aquaguard', 'AO Smith', 'Aqua Fresh'],
    'P': ['Pureit', 'Protek'],
    'L': ['Livpure', 'LG'],
    'B': ['Blue Star'],
    'T': ['Tata Swach'],
    'E': ['Eureka Forbes'],
    'S': ['Samsung', 'Supreme'],
    'W': ['Whirlpool'],
    'H': ['Havells', 'Hindware']
  };

  const modelData = {
    'RO': {
      'Kent': [
        'Ace Plus 8 L RO+UV+UF+TDS',
        'Ace Copper 8 L RO+UV+UF+TDS',
        'Ace 8 L',
        'Pearl ZW 8 L RO+UV+UF+TDS',
        'Pride Plus 8 L',
        'Prime Plus 9 L RO+UV+UF+TDS',
        'Sterling Plus 6 L',
        'Grand 8 L RO',
        'Grand Plus 9 L RO+UV+UF+TDS',
        'Grand Star 9 L',
        'Excell Plus 7 L RO+UV+UF+TDS',
        'Elegant Copper 8 L',
        'Marvel',
        'Sapphire'
      ],
      'Aquaguard': [
        'Delight NXT RO+UV+UF Aquasaver',
        'Delight RO+UV+UF 2X',
        'Aura 2X RO+UV + Copper',
        'Glory RO+UV+UF + Active Copper',
        'Designo NXT Under-counter RO+UV Copper',
        'Blaze Insta WS RO+UV Hot & Ambient',
        'SlimGlass RO+UV'
      ],
      'Pureit': [
        'Marvella 10 L RO+UV',
        'Eco Water Saver RO+UV+MF+Mineral',
        'RO+UV+MF+Copper+Minerial',
        'Classic RO variants'
      ],
      'Livpure': [
        'Pep Pro 7 L RO+UF',
        'Glitz 7 L RO+UF',
        'Glo Star RO+In-Tank UV+UF+Mineraliser',
        'Allura Premia'
      ],
      'Blue Star': [
        'Aristo 7 L RO+UV+UF with Pre-Filter',
        'Mid-range models with taste boosters'
      ],
      'Havells': [
        'Max Alkaline RO+UV',
        'Fab Alkaline RO+UV'
      ],
      'AO Smith': [
        'Z9 Pro Instant Hot & Ambient Purifier',
        'Models with SCMT'
      ],
      'Tata Swach': [
        'Cristella Plus RO Water Purifier',
        'Other RO combo models'
      ],
      'LG': [
        'Puricare WW180EP RO model',
        'Models with mineral booster'
      ],
      'Protek': [
        'Elite Plus 12 L RO+UV+UF'
      ],
      'Aqua Fresh': [
        'Swift 15 L RO+UV+TDS'
      ],
      'Samsung': [
        'PURE RO + UV + UF',
        'PURE RO + UV + Mineral',
        'PURE RO + UV + Alkaline'
      ],
      'Supreme': [
        'Supreme RO + UV',
        'Supreme RO + UV + UF',
        'Supreme RO + UV + Mineral'
      ],
      'Whirlpool': [
        'Whirlpool RO + UV',
        'Whirlpool RO + UV + UF',
        'Whirlpool RO + UV + Mineral'
      ],
      'Hindware': [
        'Hindware RO + UV',
        'Hindware RO + UV + UF'
      ],
      'Eureka Forbes': [
        'Aquaguard RO + UV',
        'Aquaguard RO + UV + UF'
      ]
    },
    'SOFTENER': {
      'Kent': [
        'Grand Softener 25L',
        'Grand Softener 50L'
      ],
      'Aquaguard': [
        'Supreme Softener 25L',
        'Supreme Softener 50L'
      ],
      'Pureit': [
        'Pureit Softener 25L',
        'Pureit Softener 50L'
      ],
      'Livpure': [
        'Livpure Softener 25L',
        'Livpure Softener 50L'
      ],
      'Blue Star': [
        'Blue Star Softener 25L',
        'Blue Star Softener 50L'
      ]
    }
  };

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      // Clean up all object URLs when component unmounts
      Object.values(customerPhotos).forEach(photos => {
        photos.forEach(photo => {
          if (photo.startsWith('blob:')) {
            URL.revokeObjectURL(photo);
          }
        });
      });
    };
  }, [customerPhotos]);

  // Image compression utility


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
    google_location: '', // For Google Maps integration
    service_cost: 0,
    cost_agreed: false
  });
  const [currentStep, setCurrentStep] = useState(1);
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});
  const [isCreating, setIsCreating] = useState(false);
  const [shouldCreateJob, setShouldCreateJob] = useState(false);
  const [recentAccountsDialogOpen, setRecentAccountsDialogOpen] = useState(false);
  const [step5JobData, setStep5JobData] = useState({
    service_type: 'RO' as 'RO' | 'SOFTENER',
    service_sub_type: 'Installation',
    service_sub_type_custom: '',
    scheduled_date: '',
    scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
    scheduled_time_custom: '',
    description: '',
    lead_source: 'Direct call',
    lead_source_custom: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  });
  const [existingCustomer, setExistingCustomer] = useState<Customer | null>(null);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [shouldUpdateExisting, setShouldUpdateExisting] = useState(false);
  const [customerJobs, setCustomerJobs] = useState<{[customerId: string]: Job[]}>({});
  
  // Follow-up functionality state
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [selectedJobForFollowUp, setSelectedJobForFollowUp] = useState<Job | null>(null);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [selectedJobForDeny, setSelectedJobForDeny] = useState<Job | null>(null);
  const [denyReason, setDenyReason] = useState('');
  
  // Move to ongoing dialog state
  const [moveToOngoingDialogOpen, setMoveToOngoingDialogOpen] = useState(false);
  const [selectedJobForMoveToOngoing, setSelectedJobForMoveToOngoing] = useState<Job | null>(null);
  const [moveToOngoingDate, setMoveToOngoingDate] = useState<string>('');
  const [moveToOngoingTimeSlot, setMoveToOngoingTimeSlot] = useState<'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM'>('MORNING');
  const [moveToOngoingCustomTime, setMoveToOngoingCustomTime] = useState<string>('');
  const [showDenySuggestions, setShowDenySuggestions] = useState(false);
  const denyReasonInputRef = useRef<HTMLTextAreaElement>(null);
  
  // Suggested denial reasons
  const suggestedDenialReasons = [
    'Customer not available',
    'Customer cancelled',
    'Customer not responding',
    'Wrong address provided',
    'Location not accessible',
    'Equipment not available',
    'Technical issue',
    'Customer not interested',
    'Price too high',
    'Already serviced by another company',
    'Customer moved',
    'Equipment damaged beyond repair',
    'No response from customer',
    'Customer rescheduled multiple times',
    'Safety concerns',
    'Incomplete information'
  ];
  
  const filteredDenialSuggestions = useMemo(() => {
    if (!denyReason.trim()) return [];
    const lowerReason = denyReason.toLowerCase();
    return suggestedDenialReasons.filter(s => 
      s.toLowerCase().includes(lowerReason)
    );
  }, [denyReason]);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedJobForComplete, setSelectedJobForComplete] = useState<Job | null>(null);
  // Complete job state moved to CompleteJobDialog component
  const [commonQrCodes, setCommonQrCodes] = useState<CommonQrCode[]>([]);
  const [customerReportDialogOpen, setCustomerReportDialogOpen] = useState(false);
  const [selectedCustomerForReport, setSelectedCustomerForReport] = useState<Customer | null>(null);
  const [customerReportJobs, setCustomerReportJobs] = useState<any[]>([]);
  const [loadingCustomerReportJobs, setLoadingCustomerReportJobs] = useState(false);
  const [editCompletedJobDialogOpen, setEditCompletedJobDialogOpen] = useState(false);
  const [selectedCompletedJob, setSelectedCompletedJob] = useState<any | null>(null);
  const [completedJobEditData, setCompletedJobEditData] = useState<any>({});
  const [sendMessageDialogOpen, setSendMessageDialogOpen] = useState(false);
  const [selectedJobForMessage, setSelectedJobForMessage] = useState<any | null>(null);
  const [messageSentFilter, setMessageSentFilter] = useState<'all' | 'sent' | 'not_sent'>('not_sent');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONGOING' | 'PENDING' | 'ASSIGNED' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED'>('ONGOING');
  const [loadingCustomerJobs, setLoadingCustomerJobs] = useState<{[customerId: string]: boolean}>({});
  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  // Date filter for denied jobs (default to today)
  const [deniedDateFilter, setDeniedDateFilter] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
  });
  // Date filter for completed jobs (default to today)
  const [completedDateFilter, setCompletedDateFilter] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
  });
  // Job counts for stats cards (loaded separately)
  const [jobCounts, setJobCounts] = useState<{ongoing: number; followup: number; denied: number; completed: number}>({
    ongoing: 0,
    followup: 0,
    denied: 0,
    completed: 0
  });
  const [selectedJobPhotos, setSelectedJobPhotos] = useState<{jobId: string, photos: string[], type: 'before' | 'after'} | null>(null);
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null);
  const [deleteJobDialogOpen, setDeleteJobDialogOpen] = useState(false);
  const [jobToReassign, setJobToReassign] = useState<Job | null>(null);
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [selectedTechnicianForReassign, setSelectedTechnicianForReassign] = useState<string>('');
  const [jobToEdit, setJobToEdit] = useState<Job | null>(null);
  const [editJobDialogOpen, setEditJobDialogOpen] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<{jobId: string, photoIndex: number, photoUrl: string} | null>(null);
  const [deletePhotoDialogOpen, setDeletePhotoDialogOpen] = useState(false);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const [customerPhotoToDelete, setCustomerPhotoToDelete] = useState<{photoUrl: string, photoIndex: number} | null>(null);
  const [deleteCustomerPhotoDialogOpen, setDeleteCustomerPhotoDialogOpen] = useState(false);
  const [isDeletingCustomerPhoto, setIsDeletingCustomerPhoto] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  
  // Job assignment states
  const [assignJobDialogOpen, setAssignJobDialogOpen] = useState(false);
  const [jobToAssign, setJobToAssign] = useState<Job | null>(null);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');

  useEffect(() => {
    registerAdminPWA();
    
    // Cleanup: disable PWA when component unmounts
    return () => {
      disablePWA();
    };
  }, []);

  // Add noindex meta tag to prevent search engine indexing
  useEffect(() => {
    // Remove any existing robots meta tag
    const existingRobots = document.querySelector('meta[name="robots"]');
    if (existingRobots) {
      existingRobots.remove();
    }
    
    // Add noindex meta tag
    const metaRobots = document.createElement('meta');
    metaRobots.name = 'robots';
    metaRobots.content = 'noindex, nofollow';
    document.head.appendChild(metaRobots);
    
    // Also add X-Robots-Tag header via meta tag
    const metaXRobots = document.createElement('meta');
    metaXRobots.httpEquiv = 'X-Robots-Tag';
    metaXRobots.content = 'noindex, nofollow';
    document.head.appendChild(metaXRobots);
    
    return () => {
      // Cleanup on unmount
      const robotsTag = document.querySelector('meta[name="robots"]');
      if (robotsTag && robotsTag.getAttribute('content') === 'noindex, nofollow') {
        robotsTag.remove();
      }
      const xRobotsTag = document.querySelector('meta[http-equiv="X-Robots-Tag"]');
      if (xRobotsTag) {
        xRobotsTag.remove();
      }
    };
  }, []);

  // Generate employee ID
  const generateEmployeeId = (): string => {
    const prefix = 'TECH';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  };

  // Transform technician data from database format to frontend format
  const transformTechnicianData = (tech: any) => ({
    id: tech.id,
    fullName: tech.full_name,
    phone: tech.phone,
    email: tech.email,
    employeeId: tech.employee_id,
    status: tech.status || 'AVAILABLE',
    skills: tech.skills,
    serviceAreas: tech.service_areas,
    currentLocation: tech.current_location,
    workSchedule: tech.work_schedule,
    performance: tech.performance,
    vehicle: tech.vehicle,
    salary: tech.salary,
    qrCode: tech.qr_code || tech.qrCode || '',
    createdAt: tech.created_at,
    updatedAt: tech.updated_at
  });

  // Reload technicians to get latest location data
  const reloadTechnicians = useCallback(async () => {
    try {
      const { data, error } = await db.technicians.getAll();
      if (error) {
        console.error('Error reloading technicians:', error);
        return;
      }
      if (data) {
        const transformedTechnicians = data.map(transformTechnicianData);
        console.log('🔄 Reloaded technicians with latest locations:', {
          rawData: data.map((t: any) => ({
            id: t.id,
            name: t.full_name,
            current_location: t.current_location,
            currentLocationType: typeof t.current_location,
            currentLocationValue: t.current_location
          })),
          transformed: transformedTechnicians.map(t => ({
            name: t.fullName,
            id: t.id,
            hasLocation: !!t.currentLocation,
            location: t.currentLocation,
            locationType: typeof t.currentLocation,
            status: t.status
          }))
        });
        setTechnicians(transformedTechnicians);
      }
    } catch (error) {
      console.error('Error reloading technicians:', error);
    }
  }, []);

  // Transform customer data from database format to frontend format
  const transformCustomerData = (customer: any): Customer => ({
    id: customer.id,
    customerId: customer.customer_id,
    fullName: customer.full_name,
    phone: customer.phone,
    alternatePhone: customer.alternate_phone,
    email: customer.email,
    address: {
      street: customer.address?.street || '',
      area: customer.address?.area || '',
      city: customer.address?.city || '',
      state: customer.address?.state || '',
      pincode: customer.address?.pincode || '',
      landmark: customer.address?.landmark,
      visible_address: customer.visible_address || customer.address?.visible_address || ''
    },
    location: {
      latitude: customer.location?.latitude || 0,
      longitude: customer.location?.longitude || 0,
      formattedAddress: customer.location?.formatted_address || customer.location?.formattedAddress || '',
      googlePlaceId: customer.location?.google_place_id,
      googleLocation: customer.location?.googleLocation || null
    } as any,
    serviceType: customer.service_type,
    brand: customer.brand,
    model: customer.model,
    installationDate: customer.installation_date,
    warrantyExpiry: customer.warranty_expiry,
    status: customer.status,
    customerSince: customer.customer_since,
    lastServiceDate: customer.last_service_date,
    notes: customer.notes,
    preferredTimeSlot: customer.preferred_time_slot,
    customTime: (customer as any).custom_time || null,
    preferredLanguage: customer.preferred_language,
    serviceCost: customer.service_cost,
    costAgreed: customer.cost_agreed,
    has_prefilter: customer.has_prefilter ?? null,
    createdAt: customer.created_at,
    updatedAt: customer.updated_at
  });

  // Reset selected technician when dialog closes
  useEffect(() => {
    if (!assignJobDialogOpen) {
      setSelectedTechnicianId('');
    }
  }, [assignJobDialogOpen]);

  // Load technicians only when assign job dialog opens (not on every visibility change)
  // Technicians will be loaded when handleAssignJob is called (which opens the dialog)
  // and when user clicks refresh button in the dialog

  // Load QR codes with localStorage caching
  const loadQrCodes = useCallback(async () => {
      try {
      console.log('Loading QR codes in AdminDashboard...');
      
      // Check cache first - use it if available and not expired
          const cachedCommon = getCachedQrCodes();
      if (cachedCommon && cachedCommon.length > 0) {
        console.log('Using cached QR codes:', cachedCommon.length, 'items');
            setCommonQrCodes(cachedCommon);
        // Don't fetch from DB if we have valid cache
        return;
        }

      // Only fetch from database if cache is missing or expired
      console.log('Cache miss or expired, fetching from database...');
        const commonResult = await db.commonQrCodes.getAll();

      if (commonResult.error) {
        console.error('Error fetching QR codes:', commonResult.error);
        // If we have cached data, keep using it even if fetch fails
        if (cachedCommon && cachedCommon.length > 0) {
          setCommonQrCodes(cachedCommon);
        } else {
          setCommonQrCodes([]);
        }
        return;
      }

        if (commonResult.data) {
          const transformed = commonResult.data.map((qr: any) => ({
            id: qr.id,
            name: qr.name,
            qrCodeUrl: qr.qr_code_url,
            createdAt: qr.created_at,
            updatedAt: qr.updated_at
          }));
        console.log('QR codes loaded from DB:', transformed.length, 'items');
          setCommonQrCodes(transformed);
        // Always update cache with fresh data
            cacheQrCodes(transformed);
      } else {
        console.log('No QR codes found');
        setCommonQrCodes([]);
        }
      } catch (error) {
        console.error('Error loading QR codes:', error);
      // Fallback to cache if available
      const cachedCommon = getCachedQrCodes();
      if (cachedCommon && cachedCommon.length > 0) {
        setCommonQrCodes(cachedCommon);
      } else {
        setCommonQrCodes([]);
      }
    }
  }, []);

  // OPTIMIZATION: Defer QR code loading until needed (only load when completing a job)
  // QR codes are only needed when completing a job, so we don't need to load them on mount
  // useEffect(() => {
  //   loadQrCodes();
  // }, [loadQrCodes]);

  // Reload QR codes when page becomes visible only if cache is expired (e.g., when returning from Settings)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if cache is expired before reloading
        const cachedCommon = getCachedQrCodes();
        if (!cachedCommon || cachedCommon.length === 0) {
          console.log('Page became visible, cache expired, reloading QR codes...');
          loadQrCodes();
        } else {
          console.log('Page became visible, using cached QR codes');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadQrCodes]);

  // OPTIMIZATION: Load unique brands and models from database in parallel
  const loadBrandsAndModels = useCallback(async () => {
    try {
      // OPTIMIZATION: Fetch all 4 queries in parallel instead of sequentially
      const [customerBrandsResult, jobBrandsResult, customerModelsResult, jobModelsResult] = await Promise.all([
        supabase
        .from('customers')
        .select('brand')
        .not('brand', 'is', null)
        .neq('brand', '')
          .neq('brand', 'Not specified'),
        supabase
        .from('jobs')
        .select('brand')
        .not('brand', 'is', null)
        .neq('brand', '')
          .neq('brand', 'Not specified'),
        supabase
        .from('customers')
        .select('model')
        .not('model', 'is', null)
        .neq('model', '')
          .neq('model', 'Not specified'),
        supabase
        .from('jobs')
        .select('model')
        .not('model', 'is', null)
        .neq('model', '')
          .neq('model', 'Not specified')
      ]);
      
      // Only process if all queries succeeded
      if (!customerBrandsResult.error && !jobBrandsResult.error && 
          !customerModelsResult.error && !jobModelsResult.error) {
        // Extract all brands (handle comma-separated values)
        const allBrands = new Set<string>();
        [...(customerBrandsResult.data || []), ...(jobBrandsResult.data || [])].forEach((item: any) => {
          if (item.brand) {
            item.brand.split(',').forEach((b: string) => {
              const trimmed = b.trim();
              if (trimmed && trimmed !== 'Not specified') {
                allBrands.add(trimmed);
              }
            });
          }
        });
        
        // Extract all models (handle comma-separated values)
        const allModels = new Set<string>();
        [...(customerModelsResult.data || []), ...(jobModelsResult.data || [])].forEach((item: any) => {
          if (item.model) {
            item.model.split(',').forEach((m: string) => {
              const trimmed = m.trim();
              if (trimmed && trimmed !== 'Not specified') {
                allModels.add(trimmed);
              }
            });
          }
        });
        
        setDbBrands(Array.from(allBrands));
        setDbModels(Array.from(allModels));
      }
    } catch (error) {
      console.error('Error loading brands and models:', error);
    }
  }, []);

  // Load job counts for stats cards (lightweight query)
  const loadJobCounts = useCallback(async () => {
    try {
      const { data, error } = await db.jobs.getCounts();
      if (error) {
      } else if (data) {
        setJobCounts(data);
      }
    } catch (error) {
    }
  }, []);

  // Load jobs based on current filter (optimized)
  const loadFilteredJobs = useCallback(async (filter: typeof statusFilter, page: number = 1) => {
    try {
      setLoading(true);
      
      if (filter === 'ALL') {
        // For ALL, we need customers with their jobs - load ongoing jobs only for display
        const { data, error } = await db.jobs.getOngoing();
        if (error) {
          setJobs([]);
        } else {
          setJobs(data || []);
        }
      } else if (filter === 'ONGOING') {
        // Load all ongoing jobs (usually not too many)
        const { data, error } = await db.jobs.getOngoing();
        if (error) {
          setJobs([]);
        } else {
          setJobs(data || []);
          setTotalCount(data?.length || 0);
          setTotalPages(1);
        }
      } else if (filter === 'COMPLETED' || filter === 'CANCELLED') {
        // Use pagination for completed and denied jobs
        const statuses = filter === 'COMPLETED' ? ['COMPLETED'] : ['DENIED', 'CANCELLED'];
        // Pass date filter for completed or denied jobs
        const dateFilter = filter === 'COMPLETED' ? completedDateFilter : (filter === 'CANCELLED' ? deniedDateFilter : undefined);
        const { data, error, count, totalPages: pages } = await db.jobs.getByStatusPaginated(statuses, page, pageSize, dateFilter);
        if (error) {
          setJobs([]);
        } else {
          setJobs(data || []);
          setTotalCount(count || 0);
          setTotalPages(pages || 0);
        }
      } else if (filter === 'RESCHEDULED') {
        // Load follow-up jobs (usually not too many)
        const { data, error, count, totalPages: pages } = await db.jobs.getByStatusPaginated(['FOLLOW_UP', 'RESCHEDULED'], page, pageSize);
        if (error) {
          setJobs([]);
        } else {
          setJobs(data || []);
          setTotalCount(count || 0);
          setTotalPages(pages || 0);
        }
      }
    } catch (error) {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [pageSize, deniedDateFilter, completedDateFilter]);

  // Fetch all jobs for customer when report dialog opens
  useEffect(() => {
    const fetchCustomerReportJobs = async () => {
      if (!customerReportDialogOpen || !selectedCustomerForReport) {
        setCustomerReportJobs([]);
        return;
      }

      setLoadingCustomerReportJobs(true);
      try {
        const { data, error } = await db.jobs.getByCustomerId(selectedCustomerForReport.id);
        if (error) {
          console.error('Error fetching customer jobs for report:', error);
          setCustomerReportJobs([]);
        } else {
          setCustomerReportJobs(data || []);
        }
      } catch (error) {
        console.error('Error fetching customer jobs for report:', error);
        setCustomerReportJobs([]);
      } finally {
        setLoadingCustomerReportJobs(false);
      }
    };

    fetchCustomerReportJobs();
  }, [customerReportDialogOpen, selectedCustomerForReport]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // OPTIMIZATION: Run AMC job creation in background without blocking initial load
      // Check auth once and proceed - no wait loop
      supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
          // Run AMC job creation in background without blocking
        db.amcContracts.createAMCServiceJobs().then((result) => {
          if (result.error) {
            console.error('Error creating AMC service jobs:', result.error);
          } else if (result.created > 0) {
            console.log(`✅ Created ${result.created} AMC service jobs automatically`);
            toast.success(`Created ${result.created} AMC service job${result.created > 1 ? 's' : ''} automatically`);
            // Reload jobs after creating AMC service jobs
            loadFilteredJobs(statusFilter, currentPage);
          }
        }).catch((error) => {
          console.error('Error in AMC service job creation:', error);
        });
        }
      }).catch(() => {
        // Silently fail - auth check failed, skip AMC job creation
      });
      
      // OPTIMIZATION: Parallelize all independent data loading operations
      const [customersResult, techniciansResult, amcContractsResult, jobCountsResult] = await Promise.all([
        db.customers.getAll(),
        db.technicians.getAll(),
        // Load AMC contracts in parallel
        supabase
        .from('amc_contracts')
        .select('customer_id, status')
          .eq('status', 'ACTIVE'),
        // Load job counts in parallel
        db.jobs.getCounts()
      ]);
      
      // Process AMC contracts
      const amcStatusMap: Record<string, boolean> = {};
      if (amcContractsResult.data) {
        amcContractsResult.data.forEach((amc: any) => {
          amcStatusMap[amc.customer_id] = true;
        });
      }
      setCustomerAMCStatus(amcStatusMap);

      // Process job counts
      if (jobCountsResult.data) {
        setJobCounts(jobCountsResult.data);
      }

      // Log errors for debugging
      if (customersResult.error) {
        toast.error(`Failed to load customers: ${customersResult.error.message}`);
      }
      if (techniciansResult.error) {
        console.error('Failed to load technicians:', techniciansResult.error);
      }

      if (customersResult.data) {
        const transformedCustomers = customersResult.data.map(transformCustomerData);
        setCustomers(transformedCustomers);
      } else {
        setCustomers([]);
      }
      
      if (techniciansResult.data) {
        const transformedTechnicians = techniciansResult.data.map(transformTechnicianData);
        console.log('📊 Loaded technicians with locations:', {
          rawData: techniciansResult.data.map((t: any) => ({
            id: t.id,
            name: t.full_name,
            current_location: t.current_location,
            currentLocationType: typeof t.current_location
          })),
          transformed: transformedTechnicians.map(t => ({
            name: t.fullName,
            id: t.id,
            hasLocation: !!t.currentLocation,
            location: t.currentLocation,
            locationType: typeof t.currentLocation,
            status: t.status
          }))
        });
        setTechnicians(transformedTechnicians);
      } else {
        setTechnicians([]);
      }

      // OPTIMIZATION: Load brands/models and jobs in parallel (non-blocking)
      // Brands/models can load in background while jobs load
      Promise.all([
        loadBrandsAndModels(),
        loadFilteredJobs(statusFilter, currentPage)
      ]).catch((error) => {
        console.error('Error loading secondary data:', error);
      });

    } catch (error) {
      toast.error(`Failed to load dashboard data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Load data on component mount
  useEffect(() => {
    const initialize = async () => {
      await loadDashboardData();
      setIsInitialLoad(false);
    };
    initialize();
  }, []);

  // Set initial last checked job ID after jobs are loaded
  useEffect(() => {
    if (isInitialLoad || lastCheckedJobId || jobs.length === 0) return;
    
    const pendingJobs = jobs.filter(j => j.status === 'PENDING');
    if (pendingJobs.length > 0) {
      const mostRecent = pendingJobs.sort((a, b) => {
        const aTime = new Date((a as any).created_at || (a as any).createdAt || 0).getTime();
        const bTime = new Date((b as any).created_at || (b as any).createdAt || 0).getTime();
        return bTime - aTime;
      })[0];
      if (mostRecent.id) {
        setLastCheckedJobId(mostRecent.id);
      }
    }
  }, [isInitialLoad, jobs, lastCheckedJobId]);

  // Reload jobs when filter changes (but not on initial load)
  useEffect(() => {
    if (isInitialLoad) return;
    setCurrentPage(1); // Reset to first page when filter changes
    loadFilteredJobs(statusFilter, 1);
    // Refresh counts when filter changes
    loadJobCounts();
  }, [statusFilter, loadFilteredJobs, loadJobCounts, isInitialLoad]);

  // Reload jobs when denied date filter changes
  useEffect(() => {
    if (isInitialLoad) return;
    if (statusFilter === 'CANCELLED') {
      setCurrentPage(1); // Reset to first page when date filter changes
      loadFilteredJobs(statusFilter, 1);
    }
  }, [deniedDateFilter, statusFilter, loadFilteredJobs, isInitialLoad]);

  // Reload jobs when completed date filter changes
  useEffect(() => {
    if (isInitialLoad) return;
    if (statusFilter === 'COMPLETED') {
      setCurrentPage(1); // Reset to first page when date filter changes
      loadFilteredJobs(statusFilter, 1);
    }
  }, [completedDateFilter, statusFilter, loadFilteredJobs, isInitialLoad]);

  // Reload jobs when page changes (for paginated views)
  useEffect(() => {
    if (statusFilter === 'COMPLETED' || statusFilter === 'CANCELLED' || statusFilter === 'RESCHEDULED') {
      loadFilteredJobs(statusFilter, currentPage);
    }
  }, [currentPage, statusFilter, loadFilteredJobs]);

  // Initialize audio context on user interaction
  useEffect(() => {
    const initAudioContext = () => {
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (error) {
        }
      }
    };

    // Initialize on first user interaction
    const handleUserInteraction = () => {
      initAudioContext();
      // Remove listeners after first interaction
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };

    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);

  // Function to play notification sound - plays 5 times
  const playNotificationSound = useCallback(async () => {
    try {
      // Create or get audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;

      // Resume audio context if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Play the beep 5 times with small gaps between
      const beepDuration = 0.3; // Each beep is 0.3 seconds
      const gapDuration = 0.2; // 0.2 second gap between beeps
      const totalDuration = (beepDuration + gapDuration) * 5 - gapDuration; // Total ~2.3 seconds

      for (let i = 0; i < 5; i++) {
        const startTime = audioContext.currentTime + i * (beepDuration + gapDuration);
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800; // Original frequency
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + beepDuration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + beepDuration);
      }
    } catch (error) {
    }
  }, []);



  // Poll for new jobs and play notification sound
  useEffect(() => {
    if (isInitialLoad || !isPollingEnabled) return;

    const checkForNewJobs = async () => {
      try {
        // Check for new pending jobs (most recent first)
        const { data: newJobs, error } = await db.jobs.getByStatusPaginated(['PENDING'], 1, 5);
        
        if (error || !newJobs || newJobs.length === 0) {
          // If no pending jobs, clear the last checked ID to avoid false positives
          if (newJobs && newJobs.length === 0) {
            setLastCheckedJobId(null);
          }
          return;
        }

        // Get the most recent job
        const mostRecentJob = newJobs[0] as any;
        const mostRecentJobId = mostRecentJob?.id;
        const mostRecentJobCreatedAt = mostRecentJob?.created_at || mostRecentJob?.createdAt;

        if (!mostRecentJobId) return;

        // Only show notification if:
        // 1. We have a last checked ID AND it's different (job changed)
        // 2. AND the new job was created AFTER we last checked (truly new job)
        // OR we don't have a last checked ID yet (first time checking)
        if (lastCheckedJobId) {
          // We've checked before - only notify if it's a truly NEW job
          if (lastCheckedJobId !== mostRecentJobId) {
            // Job ID changed - check if it's actually a new job or just reordering
            // If the most recent job was created recently (within last 30 seconds), it's likely new
            if (mostRecentJobCreatedAt) {
              const jobCreatedAt = new Date(mostRecentJobCreatedAt);
              const now = new Date();
              const timeDiff = (now.getTime() - jobCreatedAt.getTime()) / 1000; // seconds
              
              // Only notify if job was created in the last 30 seconds (truly new)
              if (timeDiff <= 30) {
          // New job detected - play sound
          playNotificationSound();
          
          // New lead received silently - no notification
              }
            }
          }
        } else {
          // First time checking - just set the ID, don't notify
          // (to avoid notifying on page load)
        }

        // Update the last checked job ID
        setLastCheckedJobId(mostRecentJobId);
      } catch (error) {
      }
    };

    // Poll every 10 seconds
    const interval = setInterval(checkForNewJobs, 10000);

    // Initial check after a short delay
    const timeout = setTimeout(checkForNewJobs, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isInitialLoad, isPollingEnabled, lastCheckedJobId, jobs, playNotificationSound]);

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    
    try {
      const { error } = await db.customers.delete(customerToDelete.id);
      
      if (error) {
        throw new Error(error.message);
      }
      
      toast.success(`Customer ${customerToDelete.customer_id || customerToDelete.customerId} deleted successfully`);
      
      // Remove from local state
      setCustomers(customers.filter(c => c.id !== customerToDelete.id));
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
      loadDashboardData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error deleting customer:', error);
      toast.error(`Failed to delete customer: ${errorMessage}`);
    }
  };

  // Parse database service_type value back to array of service types
  const parseDbServiceType = (serviceType: string): string[] => {
    if (!serviceType) return ['RO']; // Default
    
    switch (serviceType) {
      case 'ALL_SERVICES':
        return ['RO', 'SOFTENER', 'AC'];
      case 'RO_SOFTENER':
        return ['RO', 'SOFTENER'];
      case 'RO_AC':
        return ['RO', 'AC'];
      case 'SOFTENER_AC':
        return ['SOFTENER', 'AC'];
      case 'RO':
      case 'SOFTENER':
      case 'AC':
      case 'APPLIANCE':
        return [serviceType];
      default:
        // Try to parse comma-separated values (for backward compatibility)
        if (serviceType.includes(',')) {
          return serviceType.split(',').map((s: string) => s.trim());
        }
        return [serviceType];
    }
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    
    // Parse service types from the database value
    const serviceTypes = parseDbServiceType(customer.service_type || '');
    
    // Parse equipment from brands and models
    const equipment: {[serviceType: string]: {brand: string, model: string}} = {};
    
    // Always initialize equipment for all service types, even if brand/model is empty
    if (serviceTypes.length > 0) {
      // Parse brands and models (handle empty strings)
      const brands = (customer.brand || '').split(',').map((s: string) => s.trim());
      const models = (customer.model || '').split(',').map((s: string) => s.trim());
      
      console.log('🔧 Initializing equipment from customer:', {
        serviceTypes,
        brand: customer.brand,
        model: customer.model,
        brandsArray: brands,
        modelsArray: models
      });
      
      serviceTypes.forEach((serviceType: string, index: number) => {
        const brandValue = brands[index] || '';
        const modelValue = models[index] || '';
        equipment[serviceType] = {
          brand: brandValue === 'Not specified' || brandValue.toLowerCase() === 'not specified' ? '' : brandValue,
          model: modelValue === 'Not specified' || modelValue.toLowerCase() === 'not specified' ? '' : modelValue
        };
        console.log(`  ${serviceType}: brand="${equipment[serviceType].brand}", model="${equipment[serviceType].model}"`);
      });
    } else {
      // If no service types, still initialize empty equipment
      console.log('⚠️ No service types found, initializing empty equipment');
    }
    
    setEditFormData({
      full_name: customer.full_name || customer.fullName || '',
      phone: customer.phone || '',
      alternate_phone: customer.alternate_phone || customer.alternatePhone || '',
      email: customer.email || '',
      service_types: serviceTypes,
      equipment: equipment,
      behavior: customer.behavior || '',
      native_language: customer.preferredLanguage || '',
      status: customer.status || '',
      notes: customer.notes || '',
      has_prefilter: (() => {
        const prefilterValue = (customer as any).has_prefilter ?? null;
        console.log('🔍 Loading prefilter for edit:', {
          customerId: customer.id,
          customerName: customer.full_name || customer.fullName,
          has_prefilter: prefilterValue,
          type: typeof prefilterValue
        });
        return prefilterValue;
      })(),
      google_location: (() => {
        // First check for googleLocation field (actual Google Maps URL - including short URLs)
        if ((customer.location as any)?.googleLocation) {
          const googleLoc = (customer.location as any).googleLocation;
          // Accept any Google Maps URL (including short URLs like maps.app.goo.gl)
          if (googleLoc && typeof googleLoc === 'string' && 
              (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
              !googleLoc.includes('localhost') && 
              !googleLoc.includes('127.0.0.1')) {
            return googleLoc;
          }
        }
        // If we have coordinates, always generate Google Maps link from coordinates
        if (customer.location?.latitude && customer.location?.longitude && 
            customer.location.latitude !== 0 && customer.location.longitude !== 0) {
          return `https://www.google.com/maps/place/${customer.location.latitude},${customer.location.longitude}`;
        }
        // Only use formattedAddress if it's actually a proper Google Maps URL (not localhost)
        if (customer.location?.formattedAddress && 
            typeof customer.location.formattedAddress === 'string' &&
            (customer.location.formattedAddress.includes('google.com/maps') || customer.location.formattedAddress.includes('maps.app.goo.gl')) &&
            !customer.location.formattedAddress.includes('localhost') &&
            !customer.location.formattedAddress.includes('127.0.0.1')) {
          return customer.location.formattedAddress;
        }
        return '';
      })(),
      visible_address: (() => {
        // Get existing location from database
        const existingLocation = (customer as any).visible_address || (customer.address as any)?.visible_address || '';
        
        // Just return existing location - don't auto-extract
        return existingLocation;
      })(),
      custom_time: customer.customTime || (customer as any).custom_time || '',
      address: {
        // If street already contains a full address (has commas or is long), use it as-is
        // Otherwise, join all address components
        street: (() => {
          const existingStreet = customer.address?.street || '';
          // If street already looks like a full address (contains commas or is substantial), use it
          if (existingStreet.includes(',') || existingStreet.length > 30) {
            return existingStreet;
          }
          // Otherwise, join all components
          const joined = [
            customer.address?.street,
            customer.address?.area,
            customer.address?.city,
            customer.address?.state,
            customer.address?.pincode
          ].filter(Boolean).join(', ');
          return joined || existingStreet || '';
        })(),
        area: customer.address?.area || '',
        city: customer.address?.city || '',
        state: customer.address?.state || '',
        pincode: customer.address?.pincode || ''
      },
      location: {
        latitude: customer.location?.latitude || 0,
        longitude: customer.location?.longitude || 0,
        formattedAddress: customer.location?.formattedAddress || ''
      },
      service_cost: customer.serviceCost || 0,
      cost_agreed: customer.costAgreed || false
    });
    // Initialize last saved form data for auto-save tracking
    lastSavedFormDataRef.current = JSON.stringify({
      full_name: customer.full_name || customer.fullName || '',
      phone: customer.phone || '',
      alternate_phone: customer.alternate_phone || customer.alternatePhone || '',
      email: customer.email || '',
      service_types: serviceTypes,
      equipment: equipment,
      behavior: customer.behavior || '',
      native_language: customer.preferredLanguage || '',
      status: customer.status || '',
      notes: customer.notes || '',
      google_location: (() => {
        if ((customer.location as any)?.googleLocation) {
          const googleLoc = (customer.location as any).googleLocation;
          if (googleLoc && typeof googleLoc === 'string' && 
              (googleLoc.includes('google.com/maps') || googleLoc.includes('maps.app.goo.gl') || googleLoc.includes('goo.gl/maps')) &&
              !googleLoc.includes('localhost') && 
              !googleLoc.includes('127.0.0.1')) {
            return googleLoc;
          }
        }
        if (customer.location?.latitude && customer.location?.longitude && 
            customer.location.latitude !== 0 && customer.location.longitude !== 0) {
          return `https://www.google.com/maps/place/${customer.location.latitude},${customer.location.longitude}`;
        }
        if (customer.location?.formattedAddress && 
            typeof customer.location.formattedAddress === 'string' &&
            (customer.location.formattedAddress.includes('google.com/maps') || customer.location.formattedAddress.includes('maps.app.goo.gl')) &&
            !customer.location.formattedAddress.includes('localhost') &&
            !customer.location.formattedAddress.includes('127.0.0.1')) {
          return customer.location.formattedAddress;
        }
        return '';
      })(),
      visible_address: (() => {
        // Get existing location from database - don't auto-extract, just use what's saved
        const existingLocation = (customer as any).visible_address || (customer.address as any)?.visible_address || '';
        return existingLocation;
      })(),
      custom_time: customer.customTime || (customer as any).custom_time || ''
    });
    hasUnsavedChangesRef.current = false;
    // Don't reset locationManuallyEditedRef - preserve manual edits
    // Clear any existing auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setEditDialogOpen(true);
  };

  const handleUpdateCustomer = async () => {
    if (!editingCustomer) return;

    setIsUpdating(true);
    try {
      // Update address and location with Google location if provided
      // Store complete address in street field, keep other fields for compatibility
      const updatedAddress = {
        street: editFormData.address.street, // Complete address
        area: editFormData.address.area,
        city: editFormData.address.city,
        state: editFormData.address.state,
        pincode: editFormData.address.pincode
      };

      // Save location - include googleLocation if provided
      const updatedLocation: any = {
        latitude: editFormData.location.latitude || 0,
        longitude: editFormData.location.longitude || 0,
        formattedAddress: editFormData.address.street || editFormData.location.formattedAddress || '',
      };
      
      // Always include googleLocation if it exists in editFormData or previous location
      if (editFormData.google_location && editFormData.google_location.trim()) {
        updatedLocation.googleLocation = editFormData.google_location;
      } else if ((editFormData.location as any)?.googleLocation) {
        // Preserve existing googleLocation if not being updated
        updatedLocation.googleLocation = (editFormData.location as any).googleLocation;
      }

      // Prepare brand and model values - ensure we have equipment data
      console.log('🔍 Equipment data before processing:', {
        equipment: editFormData.equipment,
        equipmentKeys: Object.keys(editFormData.equipment || {}),
        equipmentValues: Object.values(editFormData.equipment || {}),
        serviceTypes: editFormData.service_types
      });

      // Build brand and model arrays based on service types order
      const brands: string[] = [];
      const models: string[] = [];
      
      editFormData.service_types.forEach((serviceType: string) => {
        const equipment = editFormData.equipment[serviceType];
        if (equipment) {
          const brand = equipment.brand?.trim() || '';
          const model = equipment.model?.trim() || '';
          brands.push(brand);
          models.push(model);
          console.log(`  ${serviceType}: brand="${brand}", model="${model}"`);
        } else {
          brands.push('');
          models.push('');
          console.log(`  ${serviceType}: no equipment data`);
        }
      });

      const brandValue = brands.join(', ');
      const modelValue = models.join(', ');
      
      console.log('📦 Final brand/model values:', {
        customerId: editingCustomer.id,
        brandValue,
        modelValue,
        brandLength: brandValue.length,
        modelLength: modelValue.length,
        brandsArray: brands,
        modelsArray: models
      });

      const updateData = {
        full_name: editFormData.full_name,
        phone: editFormData.phone,
        alternate_phone: editFormData.alternate_phone,
        email: editFormData.email,
        service_type: mapServiceTypesToDbValue(editFormData.service_types),
        brand: brandValue,
        model: modelValue,
        preferred_language: (editFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
        preferred_time_slot: (editingCustomer as any).preferred_time_slot || editingCustomer.preferredTimeSlot || 'MORNING',
        status: editFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
        notes: editFormData.notes,
        visible_address: editFormData.visible_address ? editFormData.visible_address.trim() : '',
        custom_time: editFormData.custom_time || null,
        has_prefilter: editFormData.has_prefilter,
        address: updatedAddress,
        location: updatedLocation
      };

      console.log('Update payload:', updateData);
      console.log('🔍 Prefilter being saved:', {
        fromFormData: editFormData.has_prefilter,
        inUpdatePayload: updateData.has_prefilter,
        type: typeof editFormData.has_prefilter
      });
      console.log('📍 visible_address being saved:', {
        fromFormData: editFormData.visible_address,
        inUpdatePayload: updateData.visible_address,
        manuallyEdited: locationManuallyEditedRef.current
      });

      const { data: updatedCustomerFromDb, error } = await db.customers.update(editingCustomer.id, updateData);

      if (error) {
        console.error('Database update error:', error);
        throw new Error(error.message);
      }
      
      console.log('✅ Updated customer from DB:', updatedCustomerFromDb);
      console.log('🔍 Prefilter in DB response:', {
        has_prefilter: updatedCustomerFromDb?.has_prefilter,
        type: typeof updatedCustomerFromDb?.has_prefilter
      });
      console.log('📍 visible_address after save:', updatedCustomerFromDb?.visible_address);
      console.log('📋 Brand/Model in DB response:', {
        brand: updatedCustomerFromDb?.brand,
        model: updatedCustomerFromDb?.model,
        brandType: typeof updatedCustomerFromDb?.brand,
        modelType: typeof updatedCustomerFromDb?.model
      });

      // Update local state using the data returned from DB update (ensures location.googleLocation is included)
      if (updatedCustomerFromDb) {
        const transformedCustomer = transformCustomerData(updatedCustomerFromDb);
        console.log('🔄 Transformed customer:', {
          brand: transformedCustomer.brand,
          model: transformedCustomer.model
        });
        setCustomers(prevCustomers => 
          prevCustomers.map(c => c.id === editingCustomer.id ? transformedCustomer : c)
        );
      } else {
        // Fallback: update local state manually if DB doesn't return updated data
        setCustomers(prevCustomers => {
          return prevCustomers.map(c => {
            if (c.id === editingCustomer.id) {
              // Create a completely new location object with googleLocation
              const newLocation = {
                latitude: updatedLocation.latitude,
                longitude: updatedLocation.longitude,
                formattedAddress: updatedLocation.formattedAddress,
                googlePlaceId: c.location?.googlePlaceId,
                googleLocation: updatedLocation.googleLocation || null
              };
              
              // Create a new customer object with updated location
              return { 
                ...c, 
                full_name: editFormData.full_name,
                alternatePhone: editFormData.alternate_phone,
                service_type: mapServiceTypesToDbValue(editFormData.service_types),
                brand: Object.values(editFormData.equipment).map(eq => eq.brand).join(', '),
                model: Object.values(editFormData.equipment).map(eq => eq.model).join(', '),
                behavior: editFormData.behavior,
                preferredLanguage: (editFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
                status: editFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
                notes: editFormData.notes,
                address: updatedAddress,
                location: newLocation as any
              };
            }
            return c;
          });
        });
      }

      // Reload brands/models from DB after update
      await loadBrandsAndModels();
      
      // Update last saved form data and clear auto-save timer
      lastSavedFormDataRef.current = JSON.stringify(editFormData);
      hasUnsavedChangesRef.current = false;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      
      toast.success('Customer updated successfully!');
      setEditDialogOpen(false);
      setEditingCustomer(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error updating customer:', error);
      toast.error(`Failed to update customer: ${errorMessage}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditFormChange = (field: string, value: string | string[] | boolean | null) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Manual function to extract location from address (only called when user clicks "Fetch Location")
  const handleFetchLocationFromAddress = () => {
    const address = editFormData?.address?.street || '';
    const currentAddress = address.trim();
    const currentLocation = editFormData?.visible_address || '';
    
    if (!currentAddress || currentAddress.length === 0) {
      toast.error('Please enter a complete address first');
      return;
    }
    
    // Only extract if location is empty - don't overwrite manual changes
    if (currentLocation && currentLocation.trim().length > 0) {
      toast.info('Location already set. Clear it first if you want to fetch a new one.');
      return;
    }
    
    const extracted = extractLocationFromAddressString(currentAddress);
    if (extracted) {
      handleEditFormChange('visible_address', extracted);
      locationManuallyEditedRef.current = false; // Reset flag since we're extracting
      toast.success(`Location extracted: ${extracted}`);
      console.log('✅ Extracted location from address:', extracted, 'from:', currentAddress);
    } else {
      toast.warning('Could not extract location from address. Please enter manually.');
      console.log('⚠️ Could not extract location from address:', currentAddress);
    }
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

  const handleEditEquipmentChange = (serviceType: string, field: 'brand' | 'model', value: string, showSuggestions: boolean = true) => {
    console.log(`🔄 Equipment change: ${serviceType}.${field} = "${value}"`);
    setEditFormData(prev => {
      const updatedEquipment = {
        ...prev.equipment,
        [serviceType]: {
          ...(prev.equipment[serviceType] || { brand: '', model: '' }),
          [field]: value
        }
      };
      console.log(`  Updated equipment for ${serviceType}:`, updatedEquipment[serviceType]);
      return {
        ...prev,
        equipment: updatedEquipment
      };
    });
    
    // Show suggestions if field is brand or model and showSuggestions is true
    if (showSuggestions) {
      if (field === 'brand') {
        handleEditBrandInput(serviceType, value);
      } else if (field === 'model') {
        handleEditModelInput(serviceType, value);
      }
    }
  };

  // Handle brand input with suggestions for edit customer form
  const handleEditBrandInput = (serviceType: string, value: string) => {
    if (value.trim() === '') {
      setShowBrandSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    
    // Combine local brands and DB brands
    const allLocalBrands: string[] = [];
    Object.values(brandData).forEach(brands => {
      allLocalBrands.push(...brands);
    });
    
    const allBrands = [...new Set([...allLocalBrands, ...dbBrands])];
    
    // Filter brands that match the search term
    const filtered = allBrands.filter(brand => 
      brand.toLowerCase().includes(searchTerm) && 
      brand.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setBrandSuggestions(filtered);
    setShowBrandSuggestions(filtered.length > 0);
  };

  // Handle model input with suggestions for edit customer form
  const handleEditModelInput = (serviceType: string, value: string) => {
    if (value.trim() === '') {
      setShowModelSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    const brand = editFormData.equipment[serviceType]?.brand || '';
    
    // Get models from local data
    const localModels: string[] = [];
    if (serviceType && brand && modelData[serviceType as keyof typeof modelData]) {
      const brandKey = Object.keys(modelData[serviceType as keyof typeof modelData]).find(key => 
        key.toLowerCase() === brand.toLowerCase()
      );
      if (brandKey && modelData[serviceType as keyof typeof modelData][brandKey as keyof typeof modelData[typeof serviceType]]) {
        localModels.push(...(modelData[serviceType as keyof typeof modelData][brandKey as keyof typeof modelData[typeof serviceType]] || []));
      }
    }
    
    // Combine local models and DB models
    const allModels = [...new Set([...localModels, ...dbModels])];
    
    // Filter models that match the search term
    const filtered = allModels.filter(model => 
      model.toLowerCase().includes(searchTerm) && 
      model.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setModelSuggestions(filtered);
    setShowModelSuggestions(filtered.length > 0);
  };

  // Select brand from suggestions for edit customer form
  const selectEditBrand = (serviceType: string, brand: string) => {
    // If "Not specified" is selected, clear the field
    if (brand === 'Not specified' || brand.toLowerCase() === 'not specified') {
      handleEditEquipmentChange(serviceType, 'brand', '', false);
    } else {
      handleEditEquipmentChange(serviceType, 'brand', brand, false);
    }
    setShowBrandSuggestions(false);
  };

  // Select model from suggestions for edit customer form
  const selectEditModel = (serviceType: string, model: string) => {
    // If "Not specified" is selected, clear the field
    if (model === 'Not specified' || model.toLowerCase() === 'not specified') {
      handleEditEquipmentChange(serviceType, 'model', '', false);
    } else {
      handleEditEquipmentChange(serviceType, 'model', model, false);
    }
    setShowModelSuggestions(false);
  };

  // Function to geocode address and update coordinates
  const geocodeAddress = async (address: string) => {
    if (!address.trim()) return;
    
    try {
      // Use the existing geocoding function
      const response = await fetch(`/.netlify/functions/geocode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: address })
      });
      
      if (!response.ok) {
        throw new Error('Geocoding failed');
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0]; // Get the first result
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          // Update location with new coordinates
          setEditFormData(prev => ({
            ...prev,
            location: {
              latitude: lat,
              longitude: lng,
              formattedAddress: result.display_name || address
            }
          }));
          
          toast.success('Address geocoded successfully!');
        } else {
          throw new Error('Invalid coordinates received');
        }
      } else {
        throw new Error('No location found for this address');
      }
    } catch (error) {
      toast.error('Failed to geocode address. Please check the address or enter coordinates manually.');
    }
  };

  // Function to handle address field changes
  const handleAddressFieldChange = (field: string, value: string) => {
    setEditFormData(prev => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value
      }
    }));
    
    // If Complete Address (street) changed, try to extract location immediately
    // Note: Location extraction is now handled in the useEffect that watches address.street
    // This ensures it only extracts when address actually changes, not on every keystroke
  };

  // Function to extract coordinates from Google Maps link
  // Prioritizes more precise coordinates (!3d!4d format) over less precise ones (@ format)
  const extractCoordinatesFromGoogleMapsLink = (url: string): { latitude: number; longitude: number } | null => {
    try {
      // Handle different Google Maps URL formats
      let lat: number | null = null;
      let lng: number | null = null;
      
      // Format 1 (HIGHEST PRIORITY): !3d!4d format - Most precise coordinates
      // Example: /data=!3d12.8998394!4d77.6507961
      // This format contains the exact location coordinates
      const preciseMatch = url.match(/!3d([0-9.-]+)!4d([0-9.-]+)/);
      if (preciseMatch) {
        lat = parseFloat(preciseMatch[1]);
        lng = parseFloat(preciseMatch[2]);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      
      // Format 2: https://www.google.com/maps/place/12.9716,77.5946
      const placeMatch = url.match(/\/place\/([0-9.-]+),([0-9.-]+)/);
      if (placeMatch) {
        lat = parseFloat(placeMatch[1]);
        lng = parseFloat(placeMatch[2]);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      
      // Format 3: https://www.google.com/maps/search/12.914741,+77.551615
      // This is a search URL with coordinates directly in the path
      const searchPathMatch = url.match(/\/search\/([0-9.-]+),\+?([0-9.-]+)/);
      if (searchPathMatch) {
        lat = parseFloat(searchPathMatch[1]);
        lng = parseFloat(searchPathMatch[2]);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      
      // Format 4: https://www.google.com/maps/@12.9716,77.5946,15z
      // Note: This is less precise than !3d!4d format, so we check it after
      const atMatch = url.match(/@([0-9.-]+),([0-9.-]+)/);
      if (atMatch) {
        lat = parseFloat(atMatch[1]);
        lng = parseFloat(atMatch[2]);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      
      // Format 5: https://maps.google.com/maps?q=12.9716,77.5946
      const queryMatch = url.match(/[?&]q=([0-9.-]+),([0-9.-]+)/);
      if (queryMatch) {
        lat = parseFloat(queryMatch[1]);
        lng = parseFloat(queryMatch[2]);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      
      // Format 6: https://www.google.com/maps/search/?api=1&query=12.9716,77.5946
      const searchMatch = url.match(/[?&]query=([0-9.-]+),([0-9.-]+)/);
      if (searchMatch) {
        lat = parseFloat(searchMatch[1]);
        lng = parseFloat(searchMatch[2]);
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  };

  // Helper function to ensure Google Maps is loaded
  const ensureGoogleMapsLoaded = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
        resolve();
        return;
      }

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        reject(new Error('Google Maps API key not configured'));
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        // Wait for it to load
        const checkInterval = setInterval(() => {
          if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
            resolve();
          } else {
            reject(new Error('Google Maps failed to load'));
          }
        }, 10000);
        return;
      }

      // Load the script
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        console.log('Google Maps script loaded, waiting for DistanceMatrixService...');
        // Wait a bit for DistanceMatrixService to be available
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max
        const checkInterval = setInterval(() => {
          attempts++;
          if ((window as any).google && (window as any).google.maps && (window as any).google.maps.DistanceMatrixService) {
            console.log('DistanceMatrixService is now available');
            clearInterval(checkInterval);
            resolve();
          } else if (attempts >= maxAttempts) {
            console.error('DistanceMatrixService not available after waiting');
            clearInterval(checkInterval);
            reject(new Error('DistanceMatrixService not available after loading'));
          }
        }, 100);
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load Google Maps'));
      };
      
      document.head.appendChild(script);
    });
  }, []);

  // Calculate distance and time using Google Maps Distance Matrix API
  const calculateDistanceAndTime = useCallback(async (
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    customerId: string
  ) => {
    console.log('Starting distance calculation:', { origin, destination, customerId });
    
    // Validate coordinates
    if (!origin || !destination) {
      console.error('Invalid origin or destination');
      setCustomerDistances(prev => ({
        ...prev,
        [customerId]: { ...prev[customerId], isCalculating: false }
      }));
      toast.error('Invalid location coordinates');
      return;
    }

    // Validate coordinate ranges
    if (
      !origin.lat || !origin.lng || 
      !destination.lat || !destination.lng ||
      origin.lat === 0 && origin.lng === 0 ||
      destination.lat === 0 && destination.lng === 0 ||
      origin.lat < -90 || origin.lat > 90 ||
      origin.lng < -180 || origin.lng > 180 ||
      destination.lat < -90 || destination.lat > 90 ||
      destination.lng < -180 || destination.lng > 180
    ) {
      console.error('Invalid coordinate values:', { origin, destination });
      setCustomerDistances(prev => ({
        ...prev,
        [customerId]: { ...prev[customerId], isCalculating: false }
      }));
      toast.error('Invalid location coordinates. Please check the customer location.');
      return;
    }
    
    // Set calculating state
    setCustomerDistances(prev => ({
      ...prev,
      [customerId]: { ...prev[customerId], isCalculating: true }
    }));

    try {
      // Ensure Google Maps is loaded
      console.log('Ensuring Google Maps is loaded...');
      await ensureGoogleMapsLoaded();
      console.log('Google Maps loaded');

      // Now safely use DistanceMatrixService
      if (!(window as any).google?.maps?.DistanceMatrixService) {
        throw new Error('DistanceMatrixService not available');
      }

      console.log('Creating DistanceMatrixService...');
      const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();
      
      console.log('Calling getDistanceMatrix...', { 
        origin: { lat: origin.lat, lng: origin.lng }, 
        destination: { lat: destination.lat, lng: destination.lng }
      });
      
      // Set a timeout to prevent getting stuck
      const timeoutId = setTimeout(() => {
        console.error('Distance calculation timeout');
        setCustomerDistances(prev => ({
          ...prev,
          [customerId]: { ...prev[customerId], isCalculating: false }
        }));
        toast.error('Distance calculation timed out. Please try again.');
      }, 15000); // 15 second timeout
      
      // Try DRIVING first (motor bike/scooty), fallback to BICYCLING only if needed
      const tryCalculateDistance = (travelMode: any, modeName: string, isRetry: boolean = false) => {
        const originCoords = { lat: Number(origin.lat), lng: Number(origin.lng) };
        const destCoords = { lat: Number(destination.lat), lng: Number(destination.lng) };
        
        console.log(`Trying ${modeName} mode:`, { origin: originCoords, destination: destCoords });
        
        distanceMatrix.getDistanceMatrix(
          {
            origins: [originCoords],
            destinations: [destCoords],
            travelMode: travelMode,
            unitSystem: (window as any).google.maps.UnitSystem.METRIC,
          },
          (response, status) => {
            console.log(`Distance Matrix callback (${modeName}):`, { status, response });
            
            if (status === (window as any).google.maps.DistanceMatrixStatus.OK && response) {
              const result = response.rows[0].elements[0];
              console.log('Distance Matrix result:', result);
              
              if (result.status === window.google.maps.DistanceMatrixElementStatus.OK) {
                clearTimeout(timeoutId);
                // Convert distance to km if needed
                let distanceText = result.distance.text;
                if (result.distance.value < 1000) {
                  distanceText = `${(result.distance.value / 1000).toFixed(2)} km`;
                }

                // If duration is not available, show only distance
                const durationText = result.duration?.text || null;

                console.log('Setting distance:', { distance: distanceText, duration: durationText, mode: modeName });
                setCustomerDistances(prev => ({
                  ...prev,
                  [customerId]: {
                    distance: distanceText,
                    duration: durationText || '',
                    isCalculating: false,
                    mode: modeName
                  }
                }));
              } else if (result.status === window.google.maps.DistanceMatrixElementStatus.ZERO_RESULTS) {
                console.error(`Distance Matrix ZERO_RESULTS with ${modeName} mode:`, { origin: originCoords, destination: destCoords });
                
                // Try fallback: DRIVING -> BICYCLING (motor bike -> bicycle)
                if (travelMode === window.google.maps.TravelMode.DRIVING && !isRetry) {
                  console.log('DRIVING returned ZERO_RESULTS, trying BICYCLING mode as fallback...');
                  tryCalculateDistance(window.google.maps.TravelMode.BICYCLING, 'BICYCLING', true);
                } else {
                  clearTimeout(timeoutId);
                  setCustomerDistances(prev => ({
                    ...prev,
                    [customerId]: { ...prev[customerId], isCalculating: false }
                  }));
                  toast.error('No route found. Please check if the location coordinates are valid.');
                }
              } else {
                clearTimeout(timeoutId);
                console.error('Distance Matrix element status error:', result.status);
                setCustomerDistances(prev => ({
                  ...prev,
                  [customerId]: { ...prev[customerId], isCalculating: false }
                }));
                toast.error(`Could not calculate distance: ${result.status}`);
              }
            } else {
              clearTimeout(timeoutId);
              console.error('Distance Matrix status error:', status);
              setCustomerDistances(prev => ({
                ...prev,
                [customerId]: { ...prev[customerId], isCalculating: false }
              }));
              toast.error(`Distance calculation failed: ${status}`);
            }
          }
        );
      };
      
      // Start with DRIVING mode (motor bike/scooty), fallback to BICYCLING if needed
      tryCalculateDistance(window.google.maps.TravelMode.DRIVING, 'DRIVING', false);
    } catch (error) {
      console.error('Error calculating distance:', error);
      setCustomerDistances(prev => ({
        ...prev,
        [customerId]: { ...prev[customerId], isCalculating: false }
      }));
      toast.error(`Failed to calculate distance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [ensureGoogleMapsLoaded]);

  // Store the function in ref whenever it changes
  useEffect(() => {
    calculateDistanceAndTimeRef.current = calculateDistanceAndTime;
  }, [calculateDistanceAndTime]);

  // Don't calculate distance automatically when address dialog opens
  // User will click button to calculate manually


  // Reverse geocode coordinates to get address using Google Maps Geocoder API
  const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
      // First try Google Maps Geocoder API if available
      if (window.google && window.google.maps && window.google.maps.Geocoder) {
        return new Promise((resolve) => {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode(
            { location: { lat, lng } },
            (results, status) => {
              if (status === window.google.maps.GeocoderStatus.OK && results && results[0]) {
                resolve(results[0].formatted_address);
              } else {
                // Fallback to OpenStreetMap if Google fails
                resolve(reverseGeocodeOpenStreetMap(lat, lng));
              }
            }
          );
        });
      } else {
        // Fallback to OpenStreetMap if Google Maps not loaded
        return reverseGeocodeOpenStreetMap(lat, lng);
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      // Fallback to OpenStreetMap on error
      return reverseGeocodeOpenStreetMap(lat, lng);
    }
  };

  // Fallback: Reverse geocode using OpenStreetMap Nominatim (free)
  const reverseGeocodeOpenStreetMap = async (lat: number, lng: number): Promise<string | null> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'RO-Service-Management-App' // Required by Nominatim
          }
        }
      );
      
      if (!response.ok) return null;
      
      const data = await response.json();
      if (data && data.display_name) {
        return data.display_name;
      }
      return null;
    } catch (error) {
      console.error('OpenStreetMap reverse geocoding error:', error);
      return null;
    }
  };

  // Function to fetch address from Google Maps location link
  const fetchAddressFromGoogleLocation = async () => {
    const googleLocation = editFormData?.google_location || '';
    
    if (!googleLocation.trim()) {
      toast.error('Please enter a Google Maps link first');
      return;
    }

    // Check if it's a valid Google Maps link
    if (!googleLocation.includes('google.com/maps') && !googleLocation.includes('maps.app.goo.gl') && !googleLocation.includes('goo.gl/maps')) {
      toast.error('Please enter a valid Google Maps link');
      return;
    }

    // Extract coordinates from the link
    const coords = extractCoordinatesFromGoogleMapsLink(googleLocation);
    if (!coords) {
      toast.error('Could not extract coordinates from this link. Short links may not work.');
      return;
    }

    try {
      // Show loading toast
      const loadingToast = toast.loading('Fetching address from Google Maps...');

      // Ensure Google Maps is loaded before reverse geocoding
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (apiKey && (!window.google || !window.google.maps || !window.google.maps.Geocoder)) {
        // Load Google Maps if not already loaded
        await loadGoogleMapsScript();
      }

      // Extract address from coordinates using reverse geocoding
      const address = await reverseGeocode(coords.latitude, coords.longitude);
      
      // Extract location keyword from address
      const extractedLocation = address ? extractLocationFromAddressString(address) : null;
      
      // When fetching a new address, replace the entire address object to avoid duplication
      // Don't merge with previous address components
      setEditFormData(prev => ({
        ...prev,
        location: {
          ...prev.location,
          latitude: coords.latitude,
          longitude: coords.longitude,
          formattedAddress: address || prev.location.formattedAddress || ''
        },
        address: {
          street: address || prev.address.street || '',
          area: '', // Clear individual components when fetching full address
          city: '',
          state: '',
          pincode: ''
        },
        visible_address: (!locationManuallyEditedRef.current && extractedLocation) 
          ? extractedLocation.substring(0, 20) 
          : prev.visible_address
      }));
      
      toast.dismiss(loadingToast);
      
      if (address) {
        toast.success(`Address fetched: ${address.substring(0, 50)}${address.length > 50 ? '...' : ''}`);
        if (extractedLocation && !locationManuallyEditedRef.current) {
          toast.info(`Location identified: ${extractedLocation}`);
        }
      } else {
        toast.success(`Coordinates extracted: ${coords.latitude}, ${coords.longitude}`);
        toast.warning('Could not fetch address. Coordinates saved.');
      }
    } catch (error) {
      console.error('Error fetching address:', error);
      toast.error('Failed to fetch address. Please try again.');
    }
  };

  const handleGoogleMapsLinkChange = async (value: string) => {
    setEditFormData(prev => ({
      ...prev,
      google_location: value
    }));

    // Try to extract coordinates from the link (if it's a full URL)
    if (value.trim()) {
      const coords = extractCoordinatesFromGoogleMapsLink(value);
      if (coords) {
        // Ensure Google Maps is loaded before reverse geocoding
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (apiKey && (!window.google || !window.google.maps || !window.google.maps.Geocoder)) {
          // Load Google Maps if not already loaded
          await loadGoogleMapsScript();
        }

        // Extract address from coordinates using reverse geocoding
        const address = await reverseGeocode(coords.latitude, coords.longitude);
        
        // Extract location keyword from address
        const extractedLocation = address ? extractLocationFromAddressString(address) : null;
        
        // When fetching a new address, replace the entire address object to avoid duplication
        // Don't merge with previous address components
        setEditFormData(prev => ({
          ...prev,
          location: {
            ...prev.location,
            latitude: coords.latitude,
            longitude: coords.longitude,
            formattedAddress: address || prev.location.formattedAddress || ''
          },
          address: {
            street: address || prev.address.street || '',
            area: '', // Clear individual components when fetching full address
            city: '',
            state: '',
            pincode: ''
          },
          visible_address: (!locationManuallyEditedRef.current && extractedLocation) 
            ? extractedLocation.substring(0, 20) 
            : prev.visible_address,
          google_location: value
        }));
        
        if (address) {
          toast.success(`Address extracted: ${address.substring(0, 50)}${address.length > 50 ? '...' : ''}`);
          if (extractedLocation && !locationManuallyEditedRef.current) {
            toast.info(`Location identified: ${extractedLocation}`);
          }
        } else {
        toast.success(`Coordinates extracted: ${coords.latitude}, ${coords.longitude}`);
        }
      } else if (value.includes('google.com/maps') || value.includes('maps.app.goo.gl') || value.includes('goo.gl/maps')) {
        // If it's a Google Maps link (including short URLs) but we couldn't extract coordinates, still save it
        toast.info('Google Maps link saved. Note: Short links cannot extract address automatically.');
      }
    } else {
      // Clear coordinates if link is cleared
      setEditFormData(prev => ({
        ...prev,
        location: {
          ...prev.location,
          latitude: 0,
          longitude: 0,
          formattedAddress: ''
        }
      }));
    }
  };

  // Load Google Maps script if not already loaded
  const loadGoogleMapsScript = (): Promise<void> => {
    return new Promise((resolve) => {
      // Check if already loaded
      if (window.google && window.google.maps && window.google.maps.Geocoder) {
        resolve();
        return;
      }

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        // No API key, skip loading (will use OpenStreetMap fallback)
        resolve();
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        // Wait for it to load
        const checkInterval = setInterval(() => {
          if ((window as any).google && (window as any).google.maps && (window as any).google.maps.Geocoder) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          if ((window as any).google && (window as any).google.maps && (window as any).google.maps.Geocoder) {
            resolve();
          } else {
            // Resolve anyway, will use fallback
            resolve();
          }
        }, 10000);
        return;
      }

      // Load the script
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        // Wait for Geocoder to be available
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max
        const checkInterval = setInterval(() => {
          attempts++;
          if ((window as any).google && (window as any).google.maps && (window as any).google.maps.Geocoder) {
            clearInterval(checkInterval);
            resolve();
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            // Resolve anyway, will use fallback
            resolve();
          }
        }, 100);
      };
      
      script.onerror = () => {
        // Resolve anyway, will use fallback
        resolve();
      };
      
      document.head.appendChild(script);
    });
  };

  // Get current location
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setCurrentLocation(location);
        setIsGettingLocation(false);
        toast.success('Location captured!');
        
        // Don't calculate distances automatically - user will click button in dialog
      },
      (error) => {
        setIsGettingLocation(false);
        let errorMsg = 'Failed to get your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Permission denied. Please allow location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out.';
            break;
        }
        toast.error(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

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
      google_location: '',
      service_cost: 0,
      cost_agreed: false
    });
    setCurrentStep(1);
    setFormErrors({});
    setAddDialogOpen(true);
  };

  // Function to check if customer already exists
  const checkExistingCustomer = (phone: string, email?: string): Customer | null => {
    const existingByPhone = customers.find(customer => 
      customer.phone === phone || 
      customer.alternate_phone === phone
    );
    
    if (existingByPhone) return existingByPhone;
    
    if (email && email.trim()) {
      const existingByEmail = customers.find(customer => 
        customer.email?.toLowerCase() === email.toLowerCase()
      );
      if (existingByEmail) return existingByEmail;
    }
    
    return null;
  };

  const handleCreateCustomer = async () => {
    if (currentStep === 4) {
      // Move to step 5 (create job option)
      setCurrentStep(5);
      return;
    }
    
    if (currentStep === 5) {
      // Validate job data if creating job
      if (shouldCreateJob) {
        if (!step5JobData.scheduled_date) {
          toast.error('Please select a scheduled date');
          return;
        }
        
        if (!step5JobData.lead_source || step5JobData.lead_source.trim() === '') {
          toast.error('Please select a lead source');
          return;
        }
        
        if (step5JobData.lead_source === 'Other' && (!step5JobData.lead_source_custom || step5JobData.lead_source_custom.trim() === '')) {
          toast.error('Please enter a custom lead source');
          return;
        }

        if (step5JobData.service_sub_type === 'Custom' && (!step5JobData.service_sub_type_custom || step5JobData.service_sub_type_custom.trim() === '')) {
          toast.error('Please enter a custom service sub type');
          return;
        }

        if (step5JobData.scheduled_time_slot === 'CUSTOM' && (!step5JobData.scheduled_time_custom || step5JobData.scheduled_time_custom.trim() === '')) {
          toast.error('Please enter a custom time');
          return;
        }
      }
      
      // Create customer and optionally create job
      await createCustomer();
    }
  };

  const createCustomer = async () => {
    setIsCreating(true);
    try {
      // Auto-extract location from address
      const extractedLocation = extractLocationFromAddressString(addFormData.address);
      
      // Create customer data with default location (you can enhance this later)
      const customerData = {
        // Don't set customer_id - let the database generate it using the function
        customer_id: '', // Will be generated by database
        full_name: addFormData.full_name,
        phone: addFormData.phone ? formatPhoneNumber(addFormData.phone) : '',
        alternate_phone: addFormData.alternate_phone ? formatPhoneNumber(addFormData.alternate_phone) : '',
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
        visible_address: extractedLocation ? extractedLocation.substring(0, 20) : '', // Auto-extracted location
        service_type: (() => {
          const selectedTypes = addFormData.service_types;
          // Valid service types that are supported by the database
          const validTypes = ['RO', 'SOFTENER'];
          
          // Filter out any invalid service types
          const validSelectedTypes = selectedTypes.filter(type => validTypes.includes(type));
          // Based on testing, only basic service types are allowed in the database
          if (validSelectedTypes.length === 0) return 'RO';
          if (validSelectedTypes.length === 1) return validSelectedTypes[0];
          
          // For multiple selections, use the first valid one
          return validSelectedTypes[0];
        })() as 'RO' | 'SOFTENER',
        brand: Object.values(addFormData.equipment).map(eq => eq.brand).join(', '), // Join all brands
        model: Object.values(addFormData.equipment).map(eq => eq.model).join(', '), // Join all models
        preferred_language: (addFormData.native_language || 'ENGLISH') as 'ENGLISH' | 'HINDI' | 'KANNADA' | 'TAMIL' | 'TELUGU',
        status: addFormData.status as 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
        notes: addFormData.notes,
        customer_since: new Date().toISOString(),
        preferred_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING'
      };

      let result;
      if (shouldUpdateExisting && existingCustomer) {
        // Update existing customer
        const { data: updatedCustomer, error } = await db.customers.update(existingCustomer.id, customerData);
        if (error) {
          throw new Error(error.message);
        }
        result = updatedCustomer;
        toast.success(`Customer ${updatedCustomer.customer_id || updatedCustomer.customerId} updated successfully!`);
      } else {
        // Create new customer
        const { data: newCustomer, error } = await db.customers.create(customerData);
        if (error) {
          throw new Error(error.message);
        }
        result = newCustomer;
        toast.success(`Customer ${newCustomer.customer_id || newCustomer.customerId} created successfully!`);
      }

      // Refresh customers list
      await loadDashboardData();

      // If should create job, create it now
      if (shouldCreateJob && result) {
        try {
          // Convert CUSTOM time slot to valid database value
          let scheduledTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' = 'MORNING';
          let customTimeInRequirements = null;
          
          if (step5JobData.scheduled_time_slot === 'CUSTOM' && step5JobData.scheduled_time_custom) {
            customTimeInRequirements = step5JobData.scheduled_time_custom;
            const [hours] = step5JobData.scheduled_time_custom.split(':').map(Number);
            if (hours < 13) {
              scheduledTimeSlot = 'MORNING';
            } else if (hours < 18) {
              scheduledTimeSlot = 'AFTERNOON';
            } else {
              scheduledTimeSlot = 'EVENING';
            }
          } else {
            scheduledTimeSlot = step5JobData.scheduled_time_slot as 'MORNING' | 'AFTERNOON' | 'EVENING';
          }
          
          const jobNumber = generateJobNumber(step5JobData.service_type);
          
          const jobData = {
            job_number: jobNumber,
            customer_id: result.id,
            service_type: step5JobData.service_type,
            service_sub_type: step5JobData.service_sub_type === 'Custom' ? step5JobData.service_sub_type_custom : step5JobData.service_sub_type,
            brand: result.brand || '',
            model: result.model || '',
            scheduled_date: step5JobData.scheduled_date,
            scheduled_time_slot: scheduledTimeSlot,
            service_address: result.address,
            service_location: result.location,
            status: 'PENDING' as const,
            priority: step5JobData.priority,
            description: step5JobData.description.trim() || '',
            requirements: [{ 
              lead_source: step5JobData.lead_source === 'Other' ? (step5JobData.lead_source_custom || 'Other') : step5JobData.lead_source,
              custom_time: customTimeInRequirements
            }],
            estimated_cost: 0,
            payment_status: 'PENDING' as const,
          };

          const { data: newJob, error: jobError } = await db.jobs.create(jobData as any);
          
          if (jobError) {
            console.error('Failed to create job:', jobError);
            toast.error('Customer created but failed to create job');
          } else if (newJob) {
            toast.success(`Job ${(newJob as any).job_number || (newJob as any).jobNumber} created successfully!`);
            await loadDashboardData();
          }
        } catch (error) {
          console.error('Error creating job:', error);
          toast.error('Customer created but failed to create job');
        }
      }

      // Reset form
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
        google_location: '',
        service_cost: 0,
        cost_agreed: false
      });
      setCurrentStep(1);
      setFormErrors({});
      setShouldUpdateExisting(false);
      setExistingCustomer(null);
      setShouldCreateJob(false);
      setStep5JobData({
        service_type: 'RO' as 'RO' | 'SOFTENER',
        service_sub_type: 'Installation',
        service_sub_type_custom: '',
        scheduled_date: '',
        scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM',
        scheduled_time_custom: '',
        description: '',
        lead_source: 'Direct call',
        lead_source_custom: '',
        priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
      });

      setAddDialogOpen(false);
    } catch (error) {
      toast.error('Failed to create customer');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelOverride = () => {
    setOverrideDialogOpen(false);
    setExistingCustomer(null);
  };

  // Job creation functions
  const handleNewJob = (customer: Customer) => {
    setSelectedCustomerForJob(customer);
    
    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateString = tomorrow.toISOString().split('T')[0];
    
    // Get current time
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    // Extract brand and model from customer (may be comma-separated for multiple service types)
    // For new job, we'll use the first brand/model or the one matching the service type
    let customerBrand = customer.brand || '';
    let customerModel = customer.model || '';
    
    // If comma-separated, try to match with service type or use first
    if (customerBrand.includes(',')) {
      const brands = customerBrand.split(',').map(b => b.trim());
      const models = customerModel.split(',').map(m => m.trim());
      const serviceTypes = parseDbServiceType(customer.service_type || '');
      
      // Use first brand/model, or try to match with service type
      customerBrand = brands[0] || '';
      customerModel = models[0] || '';
      
      // If service type is RO or SOFTENER, try to find matching brand/model
      const selectedServiceType = (customer.serviceType === 'SOFTENER' ? 'SOFTENER' : 'RO');
      const serviceTypeIndex = serviceTypes.indexOf(selectedServiceType);
      if (serviceTypeIndex >= 0 && brands[serviceTypeIndex]) {
        customerBrand = brands[serviceTypeIndex];
        customerModel = models[serviceTypeIndex] || '';
      }
    }
    
    // Initialize form data with proper defaults
    const initialFormData = {
      service_type: (customer.serviceType === 'SOFTENER' ? 'SOFTENER' : 'RO') as 'RO' | 'SOFTENER',
      service_sub_type: 'Installation',
      service_sub_type_custom: '',
      brand: customerBrand || 'Not specified',
      model: customerModel || 'Not specified',
      scheduled_date: tomorrowDateString, // Set to tomorrow by default
      scheduled_time_slot: 'MORNING' as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM', // Set to morning by default
      scheduled_time_custom: currentTime, // Set to current time by default
      description: '',
      priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
      assigned_technician_id: '',
      cost_agreed: '',
      lead_source: 'Website',
      lead_source_custom: '',
      photos: [] as string[]
    };
    setNewJobFormData(initialFormData);
    setIsJobDialogReady(true);
    setNewJobDialogOpen(true);
  };

  const handleCreateJob = async () => {
    if (!selectedCustomerForJob) return;

    // Validate required fields
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
      // Generate job number
      const jobNumber = generateJobNumber(newJobFormData.service_type);

      // Convert CUSTOM or FLEXIBLE time slot to valid database value
      let scheduledTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' = 'MORNING';
      let customTimeInRequirements = null;
      let isFlexible = false;
      
      if (newJobFormData.scheduled_time_slot === 'CUSTOM' && newJobFormData.scheduled_time_custom) {
        // Store custom time in requirements
        customTimeInRequirements = newJobFormData.scheduled_time_custom;
        // Parse the custom time (format: HH:MM)
        const [hours, minutes] = newJobFormData.scheduled_time_custom.split(':').map(Number);
        const hour24 = hours;
        
        // Convert to time slot based on hour
        if (hour24 < 13) {
          scheduledTimeSlot = 'MORNING';
        } else if (hour24 < 18) {
          scheduledTimeSlot = 'AFTERNOON';
        } else {
          scheduledTimeSlot = 'EVENING';
        }
      } else if ((newJobFormData.scheduled_time_slot as any) === 'FLEXIBLE') {
        isFlexible = true;
        scheduledTimeSlot = 'MORNING'; // Default to MORNING for flexible
      } else {
        scheduledTimeSlot = newJobFormData.scheduled_time_slot as 'MORNING' | 'AFTERNOON' | 'EVENING';
      }

      const jobData = {
        job_number: jobNumber,
        customer_id: selectedCustomerForJob.id,
        service_type: newJobFormData.service_type,
        service_sub_type: newJobFormData.service_sub_type === 'Other' ? newJobFormData.service_sub_type_custom : newJobFormData.service_sub_type,
        brand: newJobFormData.brand === 'Not specified' ? '' : newJobFormData.brand,
        model: newJobFormData.model === 'Not specified' ? '' : newJobFormData.model,
        scheduled_date: newJobFormData.scheduled_date,
        scheduled_time_slot: scheduledTimeSlot,
        service_address: selectedCustomerForJob.address,
        service_location: selectedCustomerForJob.location,
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
        before_photos: newJobFormData.photos.filter(photo => photo && photo.trim() !== '' && photo.startsWith('http')) // Only include uploaded Cloudinary URLs, not thumbnails
      };

      const { data: newJob, error } = await db.jobs.create(jobData as any);
      
      if (error) {
        throw new Error(error.message);
      }

      if (!newJob) {
        throw new Error('Failed to create job');
      }

      // Add to local state
      setJobs([newJob, ...jobs]);

      // Update customer record if brand/model changed
      const brandChanged = newJobFormData.brand !== 'Not specified' && 
                          newJobFormData.brand !== selectedCustomerForJob.brand;
      const modelChanged = newJobFormData.model !== 'Not specified' && 
                          newJobFormData.model !== selectedCustomerForJob.model;
      
      if (brandChanged || modelChanged) {
        // Update customer brand/model
        const serviceTypes = parseDbServiceType(selectedCustomerForJob.service_type || '');
        const currentBrands = selectedCustomerForJob.brand ? selectedCustomerForJob.brand.split(',').map(b => b.trim()) : [];
        const currentModels = selectedCustomerForJob.model ? selectedCustomerForJob.model.split(',').map(m => m.trim()) : [];
        
        // Find the index for the current service type
        const serviceTypeIndex = serviceTypes.indexOf(newJobFormData.service_type);
        
        // Update brands and models arrays
        const updatedBrands = [...currentBrands];
        const updatedModels = [...currentModels];
        
        // Ensure arrays are long enough
        while (updatedBrands.length < serviceTypes.length) updatedBrands.push('');
        while (updatedModels.length < serviceTypes.length) updatedModels.push('');
        
        if (brandChanged && newJobFormData.brand !== 'Not specified') {
          updatedBrands[serviceTypeIndex] = newJobFormData.brand;
        }
        if (modelChanged && newJobFormData.model !== 'Not specified') {
          updatedModels[serviceTypeIndex] = newJobFormData.model;
        }
        
        // Update customer in database
        await db.customers.update(selectedCustomerForJob.id, {
          brand: updatedBrands.join(', '),
          model: updatedModels.join(', ')
        });
        
        // Update local customer state
        setCustomers(customers.map(c => 
          c.id === selectedCustomerForJob.id 
            ? { ...c, brand: updatedBrands.join(', '), model: updatedModels.join(', ') }
            : c
        ));
        
        // Reload brands/models from DB
        await loadBrandsAndModels();
      }

      // Send notification if technician is assigned
      if (newJobFormData.assigned_technician_id) {
        const assignedTechnician = technicians.find(t => t.id === newJobFormData.assigned_technician_id);
        if (assignedTechnician && newJob) {
          const notification = createJobAssignedNotification(
            (newJob as any).job_number || (newJob as any).jobNumber || 'Job',
            selectedCustomerForJob.fullName,
            assignedTechnician.fullName,
            newJob.id,
            assignedTechnician.id
          );
          await sendNotification(notification);
        }
      }

      if (newJob) {
        toast.success(`Job ${(newJob as any).job_number || (newJob as any).jobNumber} created successfully!`);
      }
      
      // Reload customer photos to show the newly uploaded photos
      const customerId = selectedCustomerForJob.customer_id || selectedCustomerForJob.customerId;
      if (customerId && newJobFormData.photos.length > 0) {
        // Reload photos after a short delay to ensure job is saved
        setTimeout(() => {
          loadCustomerPhotos(customerId);
        }, 1000);
      }
      
      handleCloseNewJobDialog();
    } catch (error) {
      toast.error('Failed to create job');
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleNewJobFormChange = (field: string, value: string | number) => {
    setNewJobFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle brand input with suggestions
  const handleBrandInput = (value: string) => {
    handleNewJobFormChange('brand', value);
    
    if (value.trim() === '') {
      setShowBrandSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    
    // Combine local brands and DB brands
    const allLocalBrands: string[] = [];
    Object.values(brandData).forEach(brands => {
      allLocalBrands.push(...brands);
    });
    
    const allBrands = [...new Set([...allLocalBrands, ...dbBrands])];
    
    // Filter brands that match the search term
    const filtered = allBrands.filter(brand => 
      brand.toLowerCase().includes(searchTerm) && 
      brand.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setBrandSuggestions(filtered);
    setShowBrandSuggestions(filtered.length > 0);
  };

  // Handle model input with suggestions
  const handleModelInput = (value: string) => {
    handleNewJobFormChange('model', value);
    
    if (value.trim() === '') {
      setShowModelSuggestions(false);
      return;
    }
    
    const searchTerm = value.toLowerCase();
    const serviceType = newJobFormData.service_type;
    const brand = newJobFormData.brand;
    
    // Get models from local data
    const localModels: string[] = [];
    if (serviceType && brand && modelData[serviceType as keyof typeof modelData]) {
      const serviceData = modelData[serviceType as keyof typeof modelData] as Record<string, string[]>;
      const brandKey = Object.keys(serviceData).find(key => 
        key.toLowerCase() === brand.toLowerCase()
      );
      if (brandKey && serviceData[brandKey]) {
        localModels.push(...(serviceData[brandKey] || []));
      }
    }
    
    // Combine local models and DB models
    const allModels = [...new Set([...localModels, ...dbModels])];
    
    // Filter models that match the search term
    const filtered = allModels.filter(model => 
      model.toLowerCase().includes(searchTerm) && 
      model.toLowerCase() !== searchTerm.toLowerCase()
    ).slice(0, 10);
    
    setModelSuggestions(filtered);
    setShowModelSuggestions(filtered.length > 0);
  };

  // Select brand from suggestions
  const selectBrand = (brand: string) => {
    handleNewJobFormChange('brand', brand);
    setShowBrandSuggestions(false);
  };

  // Select model from suggestions
  const selectModel = (model: string) => {
    handleNewJobFormChange('model', model);
    setShowModelSuggestions(false);
  };

  const handleCloseNewJobDialog = () => {
    setNewJobDialogOpen(false);
    setIsJobDialogReady(false);
    setSelectedCustomerForJob(null);
  };

  // Photo upload functions for new job
  const handleNewJobPhotoUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;
    
    try {
      // Validate files
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
      
      // Show thumbnails immediately
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
      
      // Add thumbnails immediately to show in UI
      setNewJobFormData(prev => ({
        ...prev,
        photos: [...prev.photos, ...validThumbnails]
      }));
      
      // Upload to Cloudinary in background with aggressive compression for low size
      const uploadPromises = validFiles.map(async (file, index) => {
        try {
          // Aggressive compression for low file size (max 800px width, 0.4 quality)
          const compressedFile = await compressImage(file, 800, 0.4);
          
          // Upload to Cloudinary using the proper service with size optimization - explicitly use primary (main) account
          const uploadResult = await cloudinaryService.uploadImage(compressedFile, 'ro-service', false);
          
          if (!uploadResult || !uploadResult.secure_url) {
            throw new Error('Upload failed - no URL returned');
          }
          
          // Replace thumbnail with actual uploaded URL
          setNewJobFormData(prev => ({
            ...prev,
            photos: prev.photos.map((photo, i) => {
              // Find the corresponding thumbnail index
              const thumbnailIndex = prev.photos.length - validThumbnails.length + index;
              return i === thumbnailIndex ? uploadResult.secure_url : photo;
            })
          }));
          
          console.log(`✅ Photo uploaded to main Cloudinary: ${uploadResult.secure_url}`);
          return uploadResult.secure_url;
        } catch (error) {
          console.error(`❌ Failed to upload ${file.name}:`, error);
          toast.error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Keep thumbnail if upload fails
          return validThumbnails[index] || '';
        }
      });
      
      // Wait for all uploads to complete
      const uploadedUrls = await Promise.all(uploadPromises);
      const successfulUploads = uploadedUrls.filter(url => url && url !== '');
      
      if (successfulUploads.length > 0) {
        toast.success(`${successfulUploads.length} photo(s) uploaded successfully!`);
      }
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

  // Photo management functions
  const handleViewPhotos = (customer: Customer) => {
    setSelectedCustomerForPhotos(customer);
    setCustomerPhotoGalleryOpen(true);
    // Always reload customer photos to get the latest data
    const customerId = customer.customer_id || customer.customerId;
    loadCustomerPhotos(customerId);
  };

  const handleClosePhotoGallery = () => {
    setCustomerPhotoGalleryOpen(false);
    setSelectedCustomerForPhotos(null);
  };

  const loadCustomerPhotos = async (customerId: string) => {
    setIsLoadingPhotos(true);
    try {
      if (!customerId) {
        throw new Error('Customer ID is required but not provided');
      }
      
      // First, find the customer by customer_id to get their UUID
      const { data: customer, error: customerError } = await db.customers.getByCustomerId(customerId);
      
      if (customerError || !customer) {
        throw new Error(`Customer not found: ${customerError?.message || 'Unknown error'}`);
      }
      
      // Now fetch jobs using the customer's UUID
      const { data: jobs, error } = await db.jobs.getByCustomerId(customer.id);
      
      if (error) {
        throw error;
      }
      
      // Extract all photos from ALL jobs (using before_photos, after_photos, and images fields)
      const photoSet = new Set<string>(); // Use Set to avoid duplicates
      
      // Extract URLs from Cloudinary objects or use as-is if already strings
      // Handles both primary and secondary Cloudinary accounts (both use res.cloudinary.com)
      const extractPhotoUrls = (photos: any[]): string[] => {
        if (!Array.isArray(photos)) return [];
        return photos.map(photo => {
          if (typeof photo === 'string' && photo.trim() !== '') {
            // Handle string URLs (from both Cloudinary accounts)
            const trimmed = photo.trim();
            // Accept any valid URL (http/https) - works for both Cloudinary accounts
            // Both primary and secondary accounts use res.cloudinary.com domain
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              return trimmed;
            }
            return null;
          } else if (photo && typeof photo === 'object') {
            // Handle Cloudinary response objects from both accounts
            if (photo.secure_url && typeof photo.secure_url === 'string') {
              return photo.secure_url.trim();
            } else if (photo.url && typeof photo.url === 'string') {
              return photo.url.trim();
            }
          }
          return null;
        }).filter((url): url is string => {
          // Filter out null/empty and ensure it's a valid URL
          // Accept all Cloudinary URLs (both accounts use res.cloudinary.com)
          // Also accept any other valid image URLs
          return url !== null && url !== '' && (url.startsWith('http://') || url.startsWith('https://'));
        });
      };
      
      if (jobs && jobs.length > 0) {
        console.log(`Loading photos from ${jobs.length} job(s) for customer ${customerId}`);
        
        jobs.forEach((job, index) => {
          // Add photos from before_photos field
          const jobBeforePhotos = Array.isArray(job.before_photos || job.beforePhotos) 
            ? (job.before_photos || job.beforePhotos) 
            : [];
          const extractedBeforePhotos = extractPhotoUrls(jobBeforePhotos);
          extractedBeforePhotos.forEach(url => photoSet.add(url));
          
          // Add photos from after_photos field
          const jobAfterPhotos = Array.isArray(job.after_photos || job.afterPhotos) 
            ? (job.after_photos || job.afterPhotos) 
            : [];
          const extractedAfterPhotos = extractPhotoUrls(jobAfterPhotos);
          extractedAfterPhotos.forEach(url => photoSet.add(url));
          
          // Also check if there are photos in the images field (for backward compatibility)
          const jobImages = Array.isArray(job.images) ? job.images : [];
          const extractedImages = extractPhotoUrls(jobImages);
          extractedImages.forEach(url => photoSet.add(url));
          
          // Get photos from job requirements (bill photos, payment photos)
          if (job.requirements) {
            try {
              const requirements = typeof job.requirements === 'string' 
                ? JSON.parse(job.requirements) 
                : job.requirements;
              
              if (Array.isArray(requirements)) {
                requirements.forEach((req: any) => {
                  if (req.bill_photos && Array.isArray(req.bill_photos)) {
                    req.bill_photos.forEach((photo: any) => {
                      const photoUrls = extractPhotoUrls([photo]);
                      photoUrls.forEach(url => photoSet.add(url));
                    });
                  }
                  if (req.payment_photos && Array.isArray(req.payment_photos)) {
                    req.payment_photos.forEach((photo: any) => {
                      const photoUrls = extractPhotoUrls([photo]);
                      photoUrls.forEach(url => photoSet.add(url));
                    });
                  }
                  // Also check qr_photos for payment screenshots (from secondary account)
                  if (req.qr_photos && typeof req.qr_photos === 'object') {
                    if (req.qr_photos.payment_screenshot) {
                      const screenshotUrls = extractPhotoUrls([req.qr_photos.payment_screenshot]);
                      screenshotUrls.forEach(url => photoSet.add(url));
                    }
                    if (req.qr_photos.selected_qr_code_url) {
                      // QR code image URL (if stored)
                      const qrUrls = extractPhotoUrls([req.qr_photos.selected_qr_code_url]);
                      qrUrls.forEach(url => photoSet.add(url));
                    }
                  }
                });
              } else if (typeof requirements === 'object' && requirements !== null) {
                if (requirements.bill_photos && Array.isArray(requirements.bill_photos)) {
                  requirements.bill_photos.forEach((photo: any) => {
                    const photoUrls = extractPhotoUrls([photo]);
                    photoUrls.forEach(url => photoSet.add(url));
                  });
                }
                if (requirements.payment_photos && Array.isArray(requirements.payment_photos)) {
                  requirements.payment_photos.forEach((photo: any) => {
                    const photoUrls = extractPhotoUrls([photo]);
                    photoUrls.forEach(url => photoSet.add(url));
                  });
                }
                // Also check qr_photos for payment screenshots (from secondary account)
                if (requirements.qr_photos && typeof requirements.qr_photos === 'object') {
                  if (requirements.qr_photos.payment_screenshot) {
                    const screenshotUrls = extractPhotoUrls([requirements.qr_photos.payment_screenshot]);
                    screenshotUrls.forEach(url => photoSet.add(url));
                  }
                  if (requirements.qr_photos.selected_qr_code_url) {
                    // QR code image URL (if stored)
                    const qrUrls = extractPhotoUrls([requirements.qr_photos.selected_qr_code_url]);
                    qrUrls.forEach(url => photoSet.add(url));
                  }
                }
              }
            } catch (e) {
              // Ignore parse errors
              console.error('Error parsing requirements:', e);
            }
          }
          
          // Log for debugging
          if (extractedBeforePhotos.length > 0 || extractedAfterPhotos.length > 0 || extractedImages.length > 0) {
            console.log(`Job ${job.job_number || job.jobNumber || index + 1}: ${extractedBeforePhotos.length} before, ${extractedAfterPhotos.length} after, ${extractedImages.length} images`);
          }
        });
      }
      
      // Convert Set to Array
      const uniquePhotos = Array.from(photoSet);
      console.log(`📸 Total unique photos found for customer: ${uniquePhotos.length}`);
      
      // Log photo sources for debugging
      // Both primary and secondary Cloudinary accounts use res.cloudinary.com domain
      const cloudinaryPhotos = uniquePhotos.filter(url => url.includes('res.cloudinary.com'));
      const otherPhotos = uniquePhotos.filter(url => !url.includes('res.cloudinary.com') && (url.startsWith('http://') || url.startsWith('https://')));
      console.log(`📸 Cloudinary photos (both accounts): ${cloudinaryPhotos.length}`);
      console.log(`📸 Other source photos: ${otherPhotos.length}`);
      
      // Log sample URLs to verify both accounts are included
      if (cloudinaryPhotos.length > 0) {
        const sampleUrls = cloudinaryPhotos.slice(0, 3);
        console.log(`📸 Sample Cloudinary URLs:`, sampleUrls);
      }

      setCustomerPhotos(prev => {
        const newState = {
          ...prev,
          [customerId]: uniquePhotos
        };
        return newState;
      });
    } catch (error) {
      toast.error('Failed to load photos');
    } finally {
      setIsLoadingPhotos(false);
    }
  };

  const handlePhotoUpload = async (files: FileList) => {
    if (!selectedCustomerForPhotos) return;

    setIsUploadingPhoto(true);
    setIsCompressingImage(true);
    const customerId = selectedCustomerForPhotos.customer_id || selectedCustomerForPhotos.customerId;
    
    // Create thumbnails immediately for preview
    const thumbnailMap: {[key: string]: {url: string, uploading: boolean}} = {};
    const fileArray = Array.from(files);
    
    fileArray.forEach((file, index) => {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        return;
      }
      
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        return;
      }
      
      // Create thumbnail URL
      const thumbnailUrl = URL.createObjectURL(file);
      const thumbnailId = `uploading-${Date.now()}-${index}`;
      thumbnailMap[thumbnailId] = { url: thumbnailUrl, uploading: true };
    });
    
    // Set thumbnails immediately
    setUploadingThumbnails(prev => ({ ...prev, ...thumbnailMap }));
    
    try {
      const uploadedPhotos: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast.error(`File ${file.name} is not an image`);
          continue;
        }
        
        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`File ${file.name} is too large (max 10MB)`);
          continue;
        }
        
        const thumbnailId = Object.keys(thumbnailMap)[i];
        
        try {
          // Compress image for better performance
          const compressedFile = await compressImage(file, 800, 0.8);
          // Upload to Cloudinary - explicitly use primary (main) account
          const uploadResult = await cloudinaryService.uploadImage(compressedFile, 'ro-service', false);
          if (uploadResult && uploadResult.secure_url) {
            uploadedPhotos.push(uploadResult.secure_url);
            console.log(`✅ Photo uploaded to main Cloudinary: ${uploadResult.secure_url}`);
            
            // Remove thumbnail and add to photos immediately
            if (thumbnailId) {
              setUploadingThumbnails(prev => {
                const newThumbnails = { ...prev };
                delete newThumbnails[thumbnailId];
                return newThumbnails;
              });
              
              // Add to customer photos immediately - ensure it shows right away
              setCustomerPhotos(prev => {
                const currentPhotos = prev[customerId] || [];
                // Check if photo already exists to avoid duplicates
                if (!currentPhotos.includes(uploadResult.secure_url)) {
                  return {
                    ...prev,
                    [customerId]: [...currentPhotos, uploadResult.secure_url]
                  };
                }
                return prev;
              });
              console.log(`Photo added to state for customer ${customerId}:`, uploadResult.secure_url);
            }
          } else {
            throw new Error('Upload succeeded but no URL returned');
          }
        } catch (error) {
          console.error(`❌ Failed to upload ${file.name}:`, error);
          toast.error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          // Remove failed thumbnail
          if (thumbnailId) {
            setUploadingThumbnails(prev => {
              const newThumbnails = { ...prev };
              delete newThumbnails[thumbnailId];
              return newThumbnails;
            });
          }
        }
      }

      if (uploadedPhotos.length > 0) {
        // Photos are already added to state during upload loop above
        // Now save to database - find the customer's latest job and add photos to it
        try {
          // Get customer's UUID
          const { data: customer, error: customerError } = await db.customers.getByCustomerId(customerId);
          if (customerError || !customer) {
            throw new Error('Customer not found');
          }

          // Get customer's latest job
          const { data: customerJobs, error: jobsError } = await db.jobs.getByCustomerId(customer.id);
          if (jobsError) {
            throw new Error('Failed to fetch customer jobs');
          }

          if (customerJobs && customerJobs.length > 0) {
            // Update the latest job with new photos
            const latestJob = customerJobs[0]; // Jobs are ordered by created_at desc
            const currentPhotos = Array.isArray(latestJob.before_photos || latestJob.beforePhotos) ? (latestJob.before_photos || latestJob.beforePhotos) : [];
            const updatedPhotos = [...currentPhotos, ...uploadedPhotos];

            const { error: updateError } = await db.jobs.update(latestJob.id, {
              before_photos: updatedPhotos
            });

            if (updateError) {
              toast.warning('Photos uploaded but failed to save to database');
            } else {
              toast.success(`${uploadedPhotos.length} photo(s) uploaded and saved successfully!`);
              // Reload photos to ensure we have the latest from database, but keep existing photos
              const currentPhotos = customerPhotos[customerId] || [];
              await loadCustomerPhotos(customerId);
              // Ensure uploaded photos are still visible after reload
              setTimeout(() => {
                setCustomerPhotos(prev => {
                  const existing = prev[customerId] || [];
                  const allPhotos = [...new Set([...uploadedPhotos, ...existing])];
                  return {
                    ...prev,
                    [customerId]: allPhotos
                  };
                });
              }, 500);
            }
          } else {
            // No jobs found, create a new job for this customer
            const jobData = {
              job_number: `RO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
              customer_id: customer.id,
              service_type: 'RO' as const,
              service_sub_type: 'Photo Upload',
              brand: 'N/A',
              model: 'N/A',
              scheduled_date: new Date().toISOString().split('T')[0],
              scheduled_time_slot: 'MORNING' as const,
              estimated_duration: 0,
              service_address: customer.address,
              service_location: customer.location,
              status: 'PENDING' as const,
              priority: 'LOW' as const,
              description: 'Customer photo upload',
              requirements: [],
              estimated_cost: 0,
              payment_status: 'PENDING' as const,
              beforePhotos: uploadedPhotos,
            };

            const { error: createError } = await db.jobs.create(jobData as any);
            if (createError) {
              toast.warning('Photos uploaded but failed to save to database');
            } else {
              toast.success(`${uploadedPhotos.length} photo(s) uploaded and saved successfully!`);
              // Reload photos to ensure we have the latest from database, but keep existing photos
              const currentPhotos = customerPhotos[customerId] || [];
              await loadCustomerPhotos(customerId);
              // Ensure uploaded photos are still visible after reload
              setTimeout(() => {
                setCustomerPhotos(prev => {
                  const existing = prev[customerId] || [];
                  const allPhotos = [...new Set([...uploadedPhotos, ...existing])];
                  return {
                    ...prev,
                    [customerId]: allPhotos
                  };
                });
              }, 500);
            }
          }
        } catch (error) {
          toast.warning('Photos uploaded but failed to save to database');
        }
      } else {
        toast.error('No valid photos were uploaded');
      }
    } catch (error) {
      toast.error('Failed to upload photos');
    } finally {
      setIsUploadingPhoto(false);
      setIsCompressingImage(false);
      // Clean up any remaining thumbnails
      setUploadingThumbnails({});
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverPhotos(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverPhotos(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverPhotos(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handlePhotoUpload(files);
    }
  };

  const handleCameraCapture = async () => {
    if (!selectedCustomerForPhotos) return;
    
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Camera access is not available in this browser');
        return;
      }

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Use back camera on mobile
      });

      // Create video element to show camera preview
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';

      // Create a dialog/modal for camera preview
      const cameraDialog = document.createElement('div');
      cameraDialog.style.position = 'fixed';
      cameraDialog.style.top = '0';
      cameraDialog.style.left = '0';
      cameraDialog.style.width = '100%';
      cameraDialog.style.height = '100%';
      cameraDialog.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
      cameraDialog.style.zIndex = '9999';
      cameraDialog.style.display = 'flex';
      cameraDialog.style.flexDirection = 'column';
      cameraDialog.style.alignItems = 'center';
      cameraDialog.style.justifyContent = 'center';
      cameraDialog.style.gap = '20px';

      const videoContainer = document.createElement('div');
      videoContainer.style.width = '90%';
      videoContainer.style.maxWidth = '600px';
      videoContainer.style.aspectRatio = '4/3';
      videoContainer.style.backgroundColor = 'black';
      videoContainer.style.borderRadius = '8px';
      videoContainer.style.overflow = 'hidden';
      videoContainer.style.position = 'relative';
      videoContainer.appendChild(video);

      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = '10px';

      const captureButton = document.createElement('button');
      captureButton.textContent = 'Capture Photo';
      captureButton.style.padding = '12px 24px';
      captureButton.style.backgroundColor = '#3b82f6';
      captureButton.style.color = 'white';
      captureButton.style.border = 'none';
      captureButton.style.borderRadius = '8px';
      captureButton.style.cursor = 'pointer';
      captureButton.style.fontSize = '16px';
      captureButton.style.fontWeight = '600';

      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.style.padding = '12px 24px';
      cancelButton.style.backgroundColor = '#6b7280';
      cancelButton.style.color = 'white';
      cancelButton.style.border = 'none';
      cancelButton.style.borderRadius = '8px';
      cancelButton.style.cursor = 'pointer';
      cancelButton.style.fontSize = '16px';

      const closeCamera = () => {
        stream.getTracks().forEach(track => track.stop());
        document.body.removeChild(cameraDialog);
      };

      captureButton.onclick = () => {
        // Create canvas to capture the photo
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              // Convert blob to File
              const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
              // Create a DataTransfer object to get a proper FileList
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              handlePhotoUpload(dataTransfer.files);
            }
            closeCamera();
          }, 'image/jpeg', 0.9);
        }
      };

      cancelButton.onclick = closeCamera;

      buttonContainer.appendChild(captureButton);
      buttonContainer.appendChild(cancelButton);
      cameraDialog.appendChild(videoContainer);
      cameraDialog.appendChild(buttonContainer);
      document.body.appendChild(cameraDialog);

    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Failed to access camera. Please check permissions.');
    }
  };

  // History management functions
  const handleViewHistory = async (customer: Customer) => {
    setSelectedCustomerForHistory(customer);
    setHistoryDialogOpen(true);
    // Always reload customer history to get the latest data
    const customerId = customer.customer_id || customer.customerId;
    await loadCustomerHistory(customerId);
  };

  const loadCustomerHistory = async (customerId: string) => {
    try {
      // Get customer by customer_id to get UUID
      const { data: customer, error: customerError } = await db.customers.getByCustomerId(customerId);
      
      if (customerError || !customer) {
        toast.error('Customer not found');
        return;
      }

      // Fetch all jobs for this customer from database
      const { data: customerJobs, error: jobsError } = await db.jobs.getByCustomerId(customer.id);
      
      if (jobsError) {
        toast.error('Failed to load service history');
        return;
      }

      // Enrich jobs with technician information
      const enrichedJobs = customerJobs?.map(job => {
        const technicianId = job.assigned_technician_id || job.assignedTechnicianId;
        const technician = technicianId ? technicians.find(t => t.id === technicianId) : null;
        
        return {
          ...job,
          jobNumber: job.job_number || job.jobNumber,
          serviceType: job.service_type || job.serviceType,
          serviceSubType: job.service_sub_type || job.serviceSubType,
          scheduledDate: job.scheduled_date || job.scheduledDate,
          scheduledTimeSlot: job.scheduled_time_slot || job.scheduledTimeSlot,
          assignedTechnician: technician ? {
            id: technician.id,
            fullName: technician.fullName,
            phone: technician.phone
          } : null,
          completedAt: job.completedAt || job.completed_at,
          createdAt: job.createdAt || job.created_at,
          updatedAt: job.updatedAt || job.updated_at
        };
      }) || [];

      // Sort by date (newest first)
      enrichedJobs.sort((a, b) => {
        const dateA = new Date(a.completedAt || a.scheduledDate || a.createdAt || 0).getTime();
        const dateB = new Date(b.completedAt || b.scheduledDate || b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      setCustomerHistory(prev => ({
        ...prev,
        [customerId]: enrichedJobs
      }));
    } catch (error) {
      console.error('Error loading customer history:', error);
      toast.error('Failed to load service history');
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

  const handlePhoneChange = (value: string) => {
    // Clean the input to only allow digits
    const cleaned = value.replace(/\D/g, '');
    
    // Remove country codes (91, 0) if present
    let processed = cleaned;
    if (processed.startsWith('91') && processed.length > 10) {
      processed = processed.substring(2);
    }
    if (processed.startsWith('0') && processed.length > 10) {
      processed = processed.substring(1);
    }
    
    // Limit to 10 digits maximum
    const limited = processed.substring(0, 10);
    
    setAddFormData(prev => ({
      ...prev,
      phone: limited
    }));

    // Clear error when user starts typing
    if (formErrors.phone) {
      setFormErrors(prev => ({
        ...prev,
        phone: ''
      }));
    }
  };

  const handleAlternatePhoneChange = (value: string) => {
    // Clean the input to only allow digits
    const cleaned = value.replace(/\D/g, '');
    
    // Remove country codes (91, 0) if present
    let processed = cleaned;
    if (processed.startsWith('91') && processed.length > 10) {
      processed = processed.substring(2);
    }
    if (processed.startsWith('0') && processed.length > 10) {
      processed = processed.substring(1);
    }
    
    // Limit to 10 digits maximum
    const limited = processed.substring(0, 10);
    
    setAddFormData(prev => ({
      ...prev,
      alternate_phone: limited
    }));

    // Clear error when user starts typing
    if (formErrors.alternate_phone) {
      setFormErrors(prev => ({
        ...prev,
        alternate_phone: ''
      }));
    }
  };

  // Phone number validation and formatting functions
  const cleanPhoneNumber = (phone: string): string => {
    // Remove all non-digit characters
    return phone.replace(/\D/g, '');
  };

  const formatPhoneNumber = (phone: string): string => {
    const cleaned = cleanPhoneNumber(phone);
    
    // If it starts with 91 and has 12 digits, remove the 91 prefix
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return cleaned.substring(2);
    }
    
    // If it starts with 0 and has 11 digits, remove the 0 prefix
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      return cleaned.substring(1);
    }
    
    return cleaned;
  };

  const validatePhoneNumber = (phone: string): { isValid: boolean; error?: string; formatted?: string } => {
    const cleaned = cleanPhoneNumber(phone);
    
    if (!cleaned) {
      return { isValid: true }; // Phone is optional
    }
    
    // Must be exactly 10 digits
    if (cleaned.length !== 10) {
      return { 
        isValid: false, 
        error: 'Phone number must be exactly 10 digits (e.g., 6361631253)' 
      };
    }
    
    // Check if it starts with valid digits (6, 7, 8, 9 for Indian mobile numbers)
    if (!/^[6-9]/.test(cleaned)) {
      return { 
        isValid: false, 
        error: 'Phone number must start with 6, 7, 8, or 9' 
      };
    }
    
    return { isValid: true, formatted: cleaned };
  };

  const validateStep = (step: number): boolean => {
    const errors: {[key: string]: string} = {};
    
    switch (step) {
      case 1: // Personal Information
        // All fields are now optional, but validate format if provided
        
        // Phone number validation
        if (addFormData.phone && addFormData.phone.trim()) {
          const phoneValidation = validatePhoneNumber(addFormData.phone);
          if (!phoneValidation.isValid) {
            errors.phone = phoneValidation.error || 'Invalid phone number';
          }
        }
        
        // Alternate phone number validation
        if (addFormData.alternate_phone && addFormData.alternate_phone.trim()) {
          const alternatePhoneValidation = validatePhoneNumber(addFormData.alternate_phone);
          if (!alternatePhoneValidation.isValid) {
            errors.alternate_phone = alternatePhoneValidation.error || 'Invalid alternate phone number';
          }
        }
        
        // Email validation - optional but validate format if provided
        if (addFormData.email && addFormData.email.trim()) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(addFormData.email)) {
            errors.email = 'Please enter a valid email address';
          }
        }
        break;
      case 2: // Address Information
        // Address is now optional
        break;
      case 3: // Service Information
        // Service types are now optional
        // Equipment details are now optional
        break;
      case 4: // Review & Notes
        // No required fields for review step
        break;
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      // Check for existing customer only when moving from step 1
      if (currentStep === 1) {
        const existing = checkExistingCustomer(addFormData.phone, addFormData.email);
        if (existing) {
          setExistingCustomer(existing);
          setOverrideDialogOpen(true);
          return;
        }
      }
      setCurrentStep(prev => Math.min(prev + 1, 5));
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
      window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
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

  const handlePhoneClick = (customer: Customer) => {
    setSelectedCustomerPhone(customer);
    setPhonePopupOpen(true);
  };

  const handleGenerateBill = (customer: Customer) => {
    setSelectedCustomerForBill(customer);
    setBillModalOpen(true);
  };

  const handleBillModalClose = () => {
    setBillModalOpen(false);
    setSelectedCustomerForBill(null);
  };

  const handleGenerateQuotation = (customer: Customer) => {
    setSelectedCustomerForQuotation(customer);
    setQuotationModalOpen(true);
  };

  const handleQuotationModalClose = () => {
    setQuotationModalOpen(false);
    setSelectedCustomerForQuotation(null);
  };

  const handleGenerateAMC = (customer: Customer) => {
    setSelectedCustomerForAMC(customer);
    setAmcModalOpen(true);
  };

  const handleAMCModalClose = () => {
    setAmcModalOpen(false);
    setSelectedCustomerForAMC(null);
  };

  // Reload AMC status from database
  const reloadAMCStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('amc_contracts')
        .select('customer_id, status')
        .eq('status', 'ACTIVE');

      if (error) {
        console.error('Error reloading AMC status:', error);
        return;
      }

      const amcStatusMap: Record<string, boolean> = {};
      if (data) {
        data.forEach((amc: any) => {
          amcStatusMap[amc.customer_id] = true;
        });
      }
      setCustomerAMCStatus(amcStatusMap);
    } catch (error) {
      console.error('Error reloading AMC status:', error);
    }
  };

  const handleGenerateTaxInvoice = (customer: Customer) => {
    setSelectedCustomerForTaxInvoice(customer);
    setTaxInvoiceModalOpen(true);
  };

  const handleTaxInvoiceModalClose = () => {
    setTaxInvoiceModalOpen(false);
    setSelectedCustomerForTaxInvoice(null);
  };

  const handleShowGSTInvoices = () => {
    setShowGSTInvoicesPage(true);
  };

  const handleHideGSTInvoices = () => {
    setShowGSTInvoicesPage(false);
  };

  const handleShowAMCView = () => {
    setShowAMCViewPage(true);
  };

  const handleHideAMCView = () => {
    setShowAMCViewPage(false);
  };



  // Job assignment functions
  const handleAssignJob = async (job: Job) => {
    setJobToAssign(job);
    setSelectedTechnicianId('');
    setAssignJobDialogOpen(true);

    // Reload technicians to get latest data
    await reloadTechnicians();
  };

  const handleSaveJobAssignment = async () => {
    if (!jobToAssign || !selectedTechnicianId) return;

    try {
      const { error } = await db.jobs.update(jobToAssign.id, {
        assigned_technician_id: selectedTechnicianId,
        status: 'ASSIGNED',
        assigned_date: new Date().toISOString()
      } as any);

      if (error) throw error;

      // Send notification to technician
      const assignedTechnician = technicians.find(t => t.id === selectedTechnicianId);
      if (assignedTechnician) {
        const notification = createJobAssignedNotification(
          (jobToAssign as any).job_number || jobToAssign.jobNumber || 'Job',
          (jobToAssign.customer as any)?.full_name || (jobToAssign.customer as any)?.fullName || 'Customer',
          assignedTechnician.fullName,
          jobToAssign.id,
          assignedTechnician.id
        );
        await sendNotification(notification);
      }

      toast.success('Job assigned successfully');
      setAssignJobDialogOpen(false);
      setJobToAssign(null);
      setSelectedTechnicianId('');

      // Refresh jobs data
      await loadFilteredJobs(statusFilter, currentPage);
    } catch (error) {
      toast.error('Failed to assign job');
    }
  };

  // Bulk assignment removed - not needed


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
        return;
      }

      setCustomerJobs(prev => ({
        ...prev,
        [customerId]: data?.slice(0, 3) || [] // Only keep 3 most recent jobs
      }));
    } catch (error) {
    } finally {
      setLoadingCustomerJobs(prev => ({
        ...prev,
        [customerId]: false
      }));
    }
  };

  // Handle job status update
  const handleReassignJob = async (job: Job) => {
    setJobToReassign(job);
    // Check for assigned technician ID in multiple possible fields
    const technicianId = 
      (job as any).assigned_technician_id || 
      job.assignedTechnicianId ||
      (job as any).assignedTechnician?.id ||
      '';
    setSelectedTechnicianForReassign(technicianId);
    // Load technicians when dialog opens
    await reloadTechnicians();
    setReassignDialogOpen(true);
  };

  const handleReassignSubmit = async () => {
    if (!jobToReassign || !selectedTechnicianForReassign) return;

    try {
      const { error } = await db.jobs.update(jobToReassign.id, {
        assigned_technician_id: selectedTechnicianForReassign
      });

      if (error) {
        toast.error('Failed to reassign job');
        return;
      }

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === jobToReassign.id 
          ? { ...job, assigned_technician_id: selectedTechnicianForReassign }
          : job
      ));

      toast.success('Job reassigned successfully');
      setReassignDialogOpen(false);
      setJobToReassign(null);
      setSelectedTechnicianForReassign('');
      setReassignAssignmentType('direct');
      setReassignTechnicianDistances([]);
    } catch (error) {
      toast.error('Failed to reassign job');
    }
  };

  const handleEditJob = (job: Job) => {
    setJobToEdit(job);
    setEditJobDialogOpen(true);
  };

  // handleEditJobSubmit moved to EditJobDialog component

  const handleJobStatusUpdate = async (jobId: string, newStatus: string) => {
    try {
      const { error } = await db.jobs.update(jobId, { status: newStatus as 'PENDING' | 'ASSIGNED' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED' });
      
      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setCustomerJobs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(customerId => {
          updated[customerId] = updated[customerId].map(job => 
            job.id === jobId ? { ...job, status: newStatus } : job
          );
        });
        return updated;
      });

      // Also update the main jobs state
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: newStatus } : job
      ));

      toast.success(`Job status updated to ${newStatus}`);

      // Send notifications for specific status changes
      const job = jobs.find(j => j.id === jobId);
      if (job) {
        const customer = job.customer;
        const technician = technicians.find(t => t.id === (job.assigned_technician_id || job.assignedTechnicianId));
        
        if (newStatus === 'COMPLETED' && technician) {
          const notification = createJobCompletedNotification(
            job.job_number || job.jobNumber,
            customer?.full_name || customer?.fullName || 'Customer',
            technician.fullName,
            jobId
          );
          await sendNotification(notification);
        } else if (newStatus === 'CANCELLED') {
          const notification = createJobCancelledNotification(
            job.job_number || job.jobNumber,
            customer?.full_name || customer?.fullName || 'Customer',
            jobId
          );
          await sendNotification(notification);
        }
      }
    } catch (error) {
      toast.error('Failed to update job status');
    }
  };

  // Handle scheduling follow-up
  const handleScheduleFollowUp = (job: Job) => {
    setSelectedJobForFollowUp(job);
    setFollowUpModalOpen(true);
  };

  // Handle follow-up submission
  const handleFollowUpSubmit = async (jobId: string, followUpData: {
    followUpDate: string;
    followUpReason: string;
    parentFollowUpId?: string;
    rescheduleFollowUpId?: string;
  }) => {
    try {
      // If rescheduling, delete the old follow-up first
      if (followUpData.rescheduleFollowUpId) {
        const { error: deleteError } = await supabase
          .from('follow_ups')
          .delete()
          .eq('id', followUpData.rescheduleFollowUpId);

        if (deleteError) {
          console.error('Delete follow-up error details:', deleteError);
          // Provide more helpful error message for 401 errors
          if (deleteError.code === 'PGRST301' || deleteError.message?.includes('401') || deleteError.message?.includes('unauthorized')) {
            throw new Error('Authentication failed. Please check your login status and try again.');
          }
          throw new Error(deleteError.message || 'Failed to delete follow-up record');
        }
      }

      // Create follow-up record in follow_ups table
      const { data: followUpRecord, error: followUpError } = await supabase
        .from('follow_ups')
        .insert({
          job_id: jobId,
          parent_follow_up_id: followUpData.parentFollowUpId || null,
          follow_up_date: followUpData.followUpDate,
          reason: followUpData.followUpReason,
          notes: null,
          scheduled_by: user?.id || 'admin',
          completed: false
        } as any)
        .select()
        .single();

      if (followUpError) {
        console.error('Follow-up error details:', followUpError);
        // Provide more helpful error message for 401 errors
        if (followUpError.code === 'PGRST301' || followUpError.message?.includes('401') || followUpError.message?.includes('unauthorized')) {
          throw new Error('Authentication failed. Please check your login status and try again.');
        }
        throw new Error(followUpError.message || 'Failed to create follow-up record');
      }

      // If this is the first follow-up (no parent), update job status
      if (!followUpData.parentFollowUpId) {
        const { error: jobError } = await db.jobs.update(jobId, {
          status: 'FOLLOW_UP',
          follow_up_date: followUpData.followUpDate,
          follow_up_notes: followUpData.followUpReason,
          follow_up_scheduled_by: user?.id || 'admin',
          follow_up_scheduled_at: new Date().toISOString()
        } as any);

        if (jobError) {
          throw new Error(jobError.message);
        }

        // Update local state
        setJobs(prev => prev.map(job => 
          job.id === jobId ? { 
            ...job, 
            status: 'FOLLOW_UP',
            followUpDate: followUpData.followUpDate,
            followUpNotes: followUpData.followUpReason,
            followUpScheduledBy: user?.id || 'admin',
            followUpScheduledAt: new Date().toISOString()
          } : job
        ));

        setCustomerJobs(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(customerId => {
            updated[customerId] = updated[customerId].map(job => 
              job.id === jobId ? { 
                ...job, 
                status: 'FOLLOW_UP',
                followUpDate: followUpData.followUpDate,
                followUpNotes: followUpData.followUpReason + ((followUpData as any).followUpNotes ? ` - ${(followUpData as any).followUpNotes}` : ''),
                followUpScheduledBy: user?.id || 'admin',
                followUpScheduledAt: new Date().toISOString()
              } : job
            );
          });
          return updated;
        });
      }

      toast.success(
        followUpData.rescheduleFollowUpId 
          ? 'Follow-up rescheduled successfully' 
          : followUpData.parentFollowUpId 
            ? 'Nested follow-up added successfully' 
            : 'Follow-up scheduled successfully'
      );
    } catch (error) {
      toast.error('Failed to schedule follow-up');
    }
  };

  // Handle moving follow-up job to ongoing
  const handleMoveToOngoing = (job: Job) => {
    // Set default values to current date and time
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    
    // Determine time slot based on current time
    let defaultTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM' = 'MORNING';
    let defaultTime = '09:00'; // Default to 9 AM for MORNING
    
    if (currentHour >= 5 && currentHour < 12) {
      defaultTimeSlot = 'MORNING';
      defaultTime = '09:00';
    } else if (currentHour >= 12 && currentHour < 17) {
      defaultTimeSlot = 'AFTERNOON';
      defaultTime = '14:00';
    } else if (currentHour >= 17 && currentHour < 20) {
      defaultTimeSlot = 'EVENING';
      defaultTime = '17:00';
    } else {
      defaultTimeSlot = 'CUSTOM';
      defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    
    setMoveToOngoingDate(today);
    setMoveToOngoingTimeSlot(defaultTimeSlot);
    setMoveToOngoingCustomTime(defaultTimeSlot === 'CUSTOM' ? defaultTime : '');
    setSelectedJobForMoveToOngoing(job);
    setMoveToOngoingDialogOpen(true);
  };

  // Actually perform the move to ongoing action with date and time
  const performMoveToOngoing = async () => {
    if (!selectedJobForMoveToOngoing) return;

    if (!moveToOngoingDate) {
      toast.error('Please select a date');
      return;
    }

    if (moveToOngoingTimeSlot === 'CUSTOM' && !moveToOngoingCustomTime) {
      toast.error('Please enter a custom time');
      return;
    }

    try {
      setIsUpdating(true);
      
      // Determine the time to use based on time slot
      let timeToUse: string;
      if (moveToOngoingTimeSlot === 'CUSTOM') {
        timeToUse = moveToOngoingCustomTime;
      } else if (moveToOngoingTimeSlot === 'MORNING') {
        timeToUse = '09:00';
      } else if (moveToOngoingTimeSlot === 'AFTERNOON') {
        timeToUse = '14:00';
      } else { // EVENING
        timeToUse = '17:00';
      }
      
      // Combine date and time into ISO string for assigned_date
      const dateTimeString = `${moveToOngoingDate}T${timeToUse}:00`;
      const assignedDateTime = new Date(dateTimeString).toISOString();

      // Update job with new scheduled date, time slot, and status
      // If CUSTOM is selected, convert to appropriate time slot and store custom time in requirements
      let timeSlotToUse: 'MORNING' | 'AFTERNOON' | 'EVENING' = moveToOngoingTimeSlot as any;
      let customTimeInRequirements: string | null = null;
      
      if (moveToOngoingTimeSlot === 'CUSTOM' && moveToOngoingCustomTime) {
        // Parse the custom time to determine time slot
        const [hours] = moveToOngoingCustomTime.split(':').map(Number);
        if (hours < 13) {
          timeSlotToUse = 'MORNING';
        } else if (hours < 18) {
          timeSlotToUse = 'AFTERNOON';
        } else {
          timeSlotToUse = 'EVENING';
        }
        customTimeInRequirements = moveToOngoingCustomTime;
      }
      
      // Get current requirements to preserve existing data
      const currentJob = jobs.find(j => j.id === selectedJobForMoveToOngoing.id);
      let requirements: any[] = [];
      try {
        // Handle requirements - could be array, object, or JSON string
        const reqData = currentJob?.requirements || (currentJob as any)?.requirements;
        if (reqData) {
          if (typeof reqData === 'string') {
            requirements = JSON.parse(reqData);
          } else if (Array.isArray(reqData)) {
            requirements = [...reqData];
          } else if (typeof reqData === 'object') {
            requirements = [reqData];
          }
        }
        // Ensure it's an array
        if (!Array.isArray(requirements)) {
          requirements = [];
        }
      } catch (e) {
        console.error('Error parsing requirements:', e);
        requirements = [];
      }
      
      // Update or add custom_time in requirements if CUSTOM time slot
      if (customTimeInRequirements) {
        // Find or create a requirement object to store custom_time
        let found = false;
        for (let i = 0; i < requirements.length; i++) {
          if (requirements[i] && typeof requirements[i] === 'object' && !Array.isArray(requirements[i])) {
            requirements[i].custom_time = customTimeInRequirements;
            found = true;
            break;
          }
        }
        if (!found) {
          // If requirements is empty, create first object, otherwise append
          if (requirements.length === 0) {
            requirements.push({ custom_time: customTimeInRequirements });
          } else {
            // Try to add to first object, or create new one
            const firstReq = requirements[0];
            if (firstReq && typeof firstReq === 'object' && !Array.isArray(firstReq)) {
              firstReq.custom_time = customTimeInRequirements;
            } else {
              requirements.push({ custom_time: customTimeInRequirements });
            }
          }
        }
      }
      
      // Set status to PENDING so admin can reassign it to a technician
      const updateData: any = {
        status: 'PENDING',
        scheduled_date: moveToOngoingDate, // Already in YYYY-MM-DD format from date input
        scheduled_time_slot: timeSlotToUse,
        // Clear follow-up related fields when moving to ongoing
        follow_up_date: null,
        follow_up_notes: null,
        follow_up_scheduled_by: null,
        follow_up_scheduled_at: null,
        // Clear assigned fields so it can be reassigned
        assigned_technician_id: null,
        assigned_date: null,
        assigned_by: null
      };

      // Only update requirements if we have custom time or if requirements exist
      if (requirements.length > 0) {
        updateData.requirements = requirements;
      }

      console.log('Admin updating job with data:', { 
        id: selectedJobForMoveToOngoing.id, 
        scheduled_date: moveToOngoingDate,
        scheduled_time_slot: timeSlotToUse,
        status: 'PENDING'
      });

      const { error, data: updatedJob } = await db.jobs.update(selectedJobForMoveToOngoing.id, updateData);

      if (error) {
        console.error('Error updating job:', error);
        throw new Error(error.message);
      }

      console.log('Job updated successfully:', updatedJob);

      // Update local state
      setJobs(prev => prev.map(j => {
        if (j.id === selectedJobForMoveToOngoing.id) {
          const updatedJob = { 
            ...j, 
            status: 'PENDING', 
            assignedDate: null,
            assignedTechnicianId: null,
            assigned_technician_id: null,
            scheduledDate: moveToOngoingDate,
            scheduledTimeSlot: timeSlotToUse,
            requirements: requirements
          };
          return updatedJob;
        }
        return j;
      }));

      // Update customer jobs state
      setCustomerJobs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(customerId => {
          updated[customerId] = updated[customerId].map(job => {
            if (job.id === selectedJobForMoveToOngoing.id) {
              return { 
                ...job, 
                status: 'PENDING', 
                assignedDate: null,
                assignedTechnicianId: null,
                assigned_technician_id: null,
                scheduledDate: moveToOngoingDate,
                scheduledTimeSlot: timeSlotToUse,
                requirements: requirements
              };
            }
            return job;
          });
        });
        return updated;
      });

      // Reload jobs to ensure everything is updated everywhere
      await loadFilteredJobs(statusFilter, currentPage);

      toast.success('Job moved to ongoing with updated schedule');

      // Close dialog and reset state
      setMoveToOngoingDialogOpen(false);
      setSelectedJobForMoveToOngoing(null);
      setMoveToOngoingDate('');
      setMoveToOngoingTimeSlot('MORNING');
      setMoveToOngoingCustomTime('');
    } catch (error) {
      console.error('Error moving job to ongoing:', error);
      toast.error('Failed to move job to ongoing');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle job denial
  const handleDenyJob = async (job: Job) => {
    // Fetch full job data with customer if not already loaded
    let jobWithCustomer = job;
    if (!job.customer || !(job.customer as any)?.full_name && !job.customer?.fullName) {
      try {
        const { data: fullJob, error } = await db.jobs.getById(job.id);
        if (!error && fullJob) {
          jobWithCustomer = fullJob as Job;
        }
      } catch (error) {
        console.error('Error fetching job details:', error);
        // Continue with the job data we have
      }
    }
    
    setSelectedJobForDeny(jobWithCustomer);
    setDenyReason('');
    setDenyDialogOpen(true);
  };

  // Handle job denial submission
  const handleDenyJobSubmit = async () => {
    if (!selectedJobForDeny || !denyReason.trim()) {
      toast.error('Please provide a reason for denial');
      return;
    }

    try {
      // Store "Admin" instead of admin name for admin denials
      const deniedByValue = 'Admin';
      
      const { error } = await db.jobs.update(selectedJobForDeny.id, {
        status: 'DENIED',
        denial_reason: denyReason.trim(),
        denied_by: deniedByValue,
        denied_at: new Date().toISOString()
      } as any);

      if (error) {
        throw new Error(error.message);
      }

      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === selectedJobForDeny.id ? { 
          ...job, 
          status: 'DENIED',
          denialReason: denyReason.trim(),
          deniedBy: 'Admin',
          deniedAt: new Date().toISOString()
        } : job
      ));

      setCustomerJobs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(customerId => {
          updated[customerId] = updated[customerId].map(job => 
            job.id === selectedJobForDeny.id ? { 
              ...job, 
              status: 'DENIED',
              denialReason: denyReason.trim(),
              deniedBy: 'Admin',
              deniedAt: new Date().toISOString()
            } : job
          );
        });
        return updated;
      });

      toast.success('Job denied successfully');
      setDenyDialogOpen(false);
      setSelectedJobForDeny(null);
      setDenyReason('');
    } catch (error: any) {
      console.error('Error denying job:', error);
      const errorMessage = error?.message || 'Failed to deny job';
      
      // Check if it's a column missing error
      if (errorMessage.includes('denial_reason') || errorMessage.includes('denied_by') || errorMessage.includes('denied_at') || errorMessage.includes('400')) {
        toast.error('Database columns missing. Please run the migration: add-denial-fields-to-jobs.sql', {
          duration: 8000,
        });
      } else {
        toast.error(errorMessage);
      }
    }
  };

  // Handle message sent
  const handleMessageSent = async (jobId: string) => {
    try {
      // Get current job
      const job = jobs.find(j => j.id === jobId);
      if (!job) return;

      // Update requirements to mark message as sent
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

      // Add or update message_sent flag
      // Check if message_sent already exists in any requirement object
      let messageIndex = requirements.findIndex((r: any) => r?.message_sent !== undefined);
      if (messageIndex >= 0) {
        // Update existing message_sent entry
        requirements[messageIndex].message_sent = true;
        requirements[messageIndex].message_sent_at = new Date().toISOString();
      } else {
        // Find the first object that can hold message_sent, or create new one
        // Prefer adding to an existing object rather than creating a new array entry
        let added = false;
        for (let i = 0; i < requirements.length; i++) {
          if (requirements[i] && typeof requirements[i] === 'object' && !Array.isArray(requirements[i])) {
            requirements[i].message_sent = true;
            requirements[i].message_sent_at = new Date().toISOString();
            added = true;
            break;
          }
        }
        if (!added) {
          // Create a new entry for message_sent
          requirements.push({
            message_sent: true,
            message_sent_at: new Date().toISOString()
          });
        }
      }
      
      console.log('Updated requirements with message_sent:', JSON.stringify(requirements, null, 2));

      // Update job in database
      const { error } = await db.jobs.update(jobId, {
        requirements: JSON.stringify(requirements)
      } as any);

      if (error) {
        console.error('Error marking message as sent:', error);
        toast.error('Failed to save message status: ' + error.message);
      } else {
        toast.success('Message sent confirmation saved');
        // Close the dialog
        setSendMessageDialogOpen(false);
        // Reload jobs to reflect the change - pass current filter and page
        await loadFilteredJobs(statusFilter, currentPage);
      }
    } catch (error: any) {
      console.error('Error marking message as sent:', error);
    }
  };

  // Calculate AMC end date: agreement date + years - 1 day
  // calculateAMCEndDate moved to CompleteJobDialog component

  // Handle job completion
  const handleCompleteJob = async (job: Job) => {
    // OPTIMIZATION: Load QR codes only when completing a job (deferred loading)
    // Check cache first, then load if needed
    const cachedQrCodes = getCachedQrCodes();
    if (!cachedQrCodes || cachedQrCodes.length === 0) {
      // Load QR codes in background - don't block dialog opening
      loadQrCodes().catch(err => console.error('Error loading QR codes:', err));
    } else {
      // Use cached QR codes immediately
      setCommonQrCodes(cachedQrCodes);
    }
    
    // Fetch full job data with customer if not already loaded
    let jobWithCustomer = job;
    if (!job.customer || !job.serviceType) {
      try {
        const { data: fullJob, error } = await db.jobs.getById(job.id);
        if (!error && fullJob) {
          jobWithCustomer = fullJob as Job;
        }
      } catch (error) {
        console.error('Error fetching job details:', error);
        // Continue with the job data we have
      }
    }
    
    setSelectedJobForComplete(jobWithCustomer);
    setCompleteDialogOpen(true);
  };

  // Handle job deletion
  const handleDeleteJob = async () => {
    if (!jobToDelete) return;
    
    try {
      const { error } = await db.jobs.delete(jobToDelete.id);
      
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

      toast.success(`Job ${jobToDelete.job_number || jobToDelete.jobNumber} deleted successfully`);
      setDeleteJobDialogOpen(false);
      setJobToDelete(null);
    } catch (error) {
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
    if (!selectedPhoto) return;
    
    // Use selectedBillPhotos if available (for combined payment + bill photos)
    if (selectedBillPhotos && selectedBillPhotos.length > 0) {
      const newIndex = selectedPhoto.index > 0 ? selectedPhoto.index - 1 : selectedBillPhotos.length - 1;
      setSelectedPhoto({ 
        url: selectedBillPhotos[newIndex], 
        index: newIndex, 
        total: selectedBillPhotos.length 
      });
      return;
    }
    
    // Fallback to selectedJobPhotos
    if (selectedJobPhotos && selectedJobPhotos.photos) {
      const newIndex = selectedPhoto.index > 0 ? selectedPhoto.index - 1 : selectedJobPhotos.photos.length - 1;
      setSelectedPhoto({ 
        url: selectedJobPhotos.photos[newIndex], 
        index: newIndex, 
        total: selectedJobPhotos.photos.length 
      });
    }
  };

  // Navigate to next photo
  const goToNextPhoto = () => {
    if (!selectedPhoto) return;
    
    // Use selectedBillPhotos if available (for combined payment + bill photos)
    if (selectedBillPhotos && selectedBillPhotos.length > 0) {
      const newIndex = selectedPhoto.index < selectedBillPhotos.length - 1 ? selectedPhoto.index + 1 : 0;
      setSelectedPhoto({ 
        url: selectedBillPhotos[newIndex], 
        index: newIndex, 
        total: selectedBillPhotos.length 
      });
      return;
    }
    
    // Fallback to selectedJobPhotos
    if (selectedJobPhotos && selectedJobPhotos.photos) {
      const newIndex = selectedPhoto.index < selectedJobPhotos.photos.length - 1 ? selectedPhoto.index + 1 : 0;
      setSelectedPhoto({ 
        url: selectedJobPhotos.photos[newIndex], 
        index: newIndex, 
        total: selectedJobPhotos.photos.length 
      });
    }
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
      // Method 2: Fallback - open in new tab for manual save
      try {
        const newWindow = window.open(photoUrl, '_blank', 'noopener,noreferrer');
        if (newWindow) {
          toast.info('Photo opened in new tab. Right-click and "Save image as" to download.');
        } else {
          throw new Error('Popup blocked');
        }
      } catch (fallbackError) {
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
      const beforePhotos = Array.isArray(job.before_photos || job.beforePhotos) ? (job.before_photos || job.beforePhotos) : [];
      const afterPhotos = Array.isArray(job.after_photos || job.afterPhotos) ? (job.after_photos || job.afterPhotos) : [];
      
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

      // Delete from Cloudinary if it's a Cloudinary URL
      try {
        const publicIdInfo = cloudinaryService.extractPublicId(photoToDelete.photoUrl);
        if (publicIdInfo) {
          const deleted = await cloudinaryService.deleteImage(publicIdInfo.publicId, publicIdInfo.useSecondary);
          if (deleted) {
            console.log(`✅ Photo deleted from Cloudinary: ${publicIdInfo.publicId}`);
          } else {
            console.warn(`⚠️ Failed to delete photo from Cloudinary: ${publicIdInfo.publicId}`);
          }
        }
      } catch (cloudinaryError) {
        console.error('Error deleting photo from Cloudinary:', cloudinaryError);
        // Continue even if Cloudinary deletion fails - photo is already removed from database
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
      toast.error('Failed to delete photo');
    } finally {
      setIsDeletingPhoto(false);
    }
  };

  // Helper function to normalize URLs for comparison
  const normalizeUrl = (url: string): string => {
    if (!url || typeof url !== 'string') return '';
    // Remove trailing slashes, normalize to lowercase, remove query params for comparison
    return url.trim().toLowerCase().replace(/\/+$/, '').split('?')[0].split('#')[0];
  };

  // Helper function to extract URL from photo (handles strings and objects)
  const extractPhotoUrl = (photo: any): string => {
    if (typeof photo === 'string') {
      return photo;
    } else if (photo && typeof photo === 'object') {
      return photo.secure_url || photo.url || photo.public_id || '';
    }
    return '';
  };

  // Delete customer photo from all possible sources
  const confirmDeleteCustomerPhoto = async () => {
    if (!customerPhotoToDelete || !selectedCustomerForPhotos) return;
    
    setIsDeletingCustomerPhoto(true);
    try {
      const customerId = selectedCustomerForPhotos.customer_id || selectedCustomerForPhotos.customerId;
      if (!customerId) {
        throw new Error('Customer ID not found');
      }

      // Get customer UUID
      const { data: customer, error: customerError } = await db.customers.getByCustomerId(customerId);
      if (customerError || !customer) {
        throw new Error('Customer not found');
      }

      // Get all jobs for this customer
      const { data: customerJobs, error: jobsError } = await db.jobs.getByCustomerId(customer.id);
      if (jobsError) {
        throw new Error(jobsError.message);
      }

      if (!customerJobs || customerJobs.length === 0) {
        throw new Error('No jobs found for this customer');
      }

      let photoFound = false;
      const photoUrl = customerPhotoToDelete.photoUrl;
      const normalizedPhotoUrl = normalizeUrl(photoUrl);
      
      console.log('Deleting photo:', { original: photoUrl, normalized: normalizedPhotoUrl });

      // Search through all jobs to find and remove the photo
      for (const job of customerJobs) {
        let needsUpdate = false;
        const updateData: any = {};

        // Check before_photos
        const beforePhotos = Array.isArray(job.before_photos || job.beforePhotos) 
          ? (job.before_photos || job.beforePhotos) 
          : [];
        const beforePhotoIndex = beforePhotos.findIndex((photo: any) => {
          const url = extractPhotoUrl(photo);
          return normalizeUrl(url) === normalizedPhotoUrl;
        });
        
        if (beforePhotoIndex !== -1) {
          const updatedBeforePhotos = [...beforePhotos];
          updatedBeforePhotos.splice(beforePhotoIndex, 1);
          updateData.before_photos = updatedBeforePhotos;
          needsUpdate = true;
          photoFound = true;
        }

        // Check after_photos
        const afterPhotos = Array.isArray(job.after_photos || job.afterPhotos) 
          ? (job.after_photos || job.afterPhotos) 
          : [];
        const afterPhotoIndex = afterPhotos.findIndex((photo: any) => {
          const url = extractPhotoUrl(photo);
          return normalizeUrl(url) === normalizedPhotoUrl;
        });
        
        if (afterPhotoIndex !== -1) {
          const updatedAfterPhotos = [...afterPhotos];
          updatedAfterPhotos.splice(afterPhotoIndex, 1);
          updateData.after_photos = updatedAfterPhotos;
          needsUpdate = true;
          photoFound = true;
        }

        // Check images field
        const images = Array.isArray(job.images) ? job.images : [];
        const imageIndex = images.findIndex((photo: any) => {
          const url = extractPhotoUrl(photo);
          return normalizeUrl(url) === normalizedPhotoUrl;
        });
        
        if (imageIndex !== -1) {
          const updatedImages = [...images];
          updatedImages.splice(imageIndex, 1);
          updateData.images = updatedImages;
          needsUpdate = true;
          photoFound = true;
        }

        // Check requirements (bill_photos, payment_photos, qr_photos)
        if (job.requirements) {
          try {
            const requirements = typeof job.requirements === 'string' 
              ? JSON.parse(job.requirements) 
              : job.requirements;
            
            let updatedRequirements = Array.isArray(requirements) ? [...requirements] : [];
            
            // Check if it's an object format
            if (!Array.isArray(requirements) && typeof requirements === 'object') {
              updatedRequirements = Object.keys(requirements).map(key => ({ [key]: requirements[key] }));
            }

            let requirementsChanged = false;

            // Remove from bill_photos
            updatedRequirements = updatedRequirements.map((req: any) => {
              if (req.bill_photos && Array.isArray(req.bill_photos)) {
                const filtered = req.bill_photos.filter((photo: any) => {
                  const url = extractPhotoUrl(photo);
                  return normalizeUrl(url) !== normalizedPhotoUrl;
                });
                if (filtered.length !== req.bill_photos.length) {
                  requirementsChanged = true;
                  photoFound = true;
                  return { ...req, bill_photos: filtered };
                }
              }
              return req;
            });

            // Remove from payment_photos
            updatedRequirements = updatedRequirements.map((req: any) => {
              if (req.payment_photos && Array.isArray(req.payment_photos)) {
                const filtered = req.payment_photos.filter((photo: any) => {
                  const url = extractPhotoUrl(photo);
                  return normalizeUrl(url) !== normalizedPhotoUrl;
                });
                if (filtered.length !== req.payment_photos.length) {
                  requirementsChanged = true;
                  photoFound = true;
                  return { ...req, payment_photos: filtered };
                }
              }
              return req;
            });

            // Remove from qr_photos.payment_screenshot
            updatedRequirements = updatedRequirements.map((req: any) => {
              if (req.qr_photos && typeof req.qr_photos === 'object') {
                const screenshotUrl = extractPhotoUrl(req.qr_photos.payment_screenshot);
                const normalizedScreenshot = normalizeUrl(screenshotUrl);
                if (normalizedScreenshot === normalizedPhotoUrl || screenshotUrl === photoUrl) {
                  console.log(`Found photo in qr_photos.payment_screenshot for job ${job.id}`);
                  requirementsChanged = true;
                  photoFound = true;
                  const { payment_screenshot, ...restQrPhotos } = req.qr_photos;
                  return { ...req, qr_photos: restQrPhotos };
                }
              }
              return req;
            });

            if (requirementsChanged) {
              updateData.requirements = JSON.stringify(updatedRequirements);
              needsUpdate = true;
            }
          } catch (e) {
            console.error('Error parsing requirements:', e);
          }
        }

        // Update job if photo was found
        if (needsUpdate) {
          const { error: updateError } = await db.jobs.update(job.id, updateData);
          if (updateError) {
            console.error(`Error updating job ${job.id}:`, updateError);
          }
        }
      }

      // Delete from Cloudinary if it's a Cloudinary URL (always attempt, even if not found in DB)
      let cloudinaryDeleted = false;
      try {
        const publicIdInfo = cloudinaryService.extractPublicId(photoUrl);
        if (publicIdInfo) {
          const deleted = await cloudinaryService.deleteImage(publicIdInfo.publicId, publicIdInfo.useSecondary);
          if (deleted) {
            console.log(`✅ Photo deleted from Cloudinary: ${publicIdInfo.publicId}`);
            cloudinaryDeleted = true;
          } else {
            console.warn(`⚠️ Failed to delete photo from Cloudinary: ${publicIdInfo.publicId}`);
          }
        } else {
          console.warn('Could not extract public_id from URL:', photoUrl);
        }
      } catch (cloudinaryError) {
        console.error('Error deleting photo from Cloudinary:', cloudinaryError);
      }

      // If photo wasn't found in database
      if (!photoFound) {
        // Log debugging info
        console.warn('Photo not found in any job. Searching for:', normalizedPhotoUrl);
        console.warn('Original URL:', photoUrl);
        
        // Check requirements more thoroughly for payment screenshots
        console.log('Checking requirements for payment screenshots...');
        for (const job of customerJobs) {
          if (job.requirements) {
            try {
              const reqs = typeof job.requirements === 'string' ? JSON.parse(job.requirements) : job.requirements;
              const reqsArray = Array.isArray(reqs) ? reqs : [reqs];
              reqsArray.forEach((req: any) => {
                if (req.qr_photos?.payment_screenshot) {
                  const screenshotUrl = extractPhotoUrl(req.qr_photos.payment_screenshot);
                  console.log(`Job ${job.job_number} has payment_screenshot:`, screenshotUrl);
                  console.log(`  Normalized:`, normalizeUrl(screenshotUrl));
                  console.log(`  Matches:`, normalizeUrl(screenshotUrl) === normalizedPhotoUrl);
                }
              });
            } catch (e) {
              console.error('Error checking requirements:', e);
            }
          }
        }
        
        // Still update UI even if not found in database
        // Photo might be orphaned or stored differently
        console.warn('Photo not found in database. Updating UI anyway. Photo may need manual deletion from Cloudinary if API secret is not configured.');
        photoFound = true; // Allow UI update to proceed
      }

      // Reload customer photos
      await loadCustomerPhotos(customerId);

      // Update local state
      const customerIdKey = customerId;
      setCustomerPhotos(prev => {
        const updated = { ...prev };
        if (updated[customerIdKey]) {
          updated[customerIdKey] = updated[customerIdKey].filter(url => url !== photoUrl);
        }
        return updated;
      });

      // Update photo viewer to show next photo or previous if deleted photo was being viewed
      // Keep viewer open - just update the photo if needed
      if (selectedPhoto && selectedPhoto.url === photoUrl) {
        const customerIdKey = customerId;
        const remainingPhotos = customerPhotos[customerIdKey]?.filter(url => url !== photoUrl) || [];
        if (remainingPhotos.length > 0) {
          // Show next photo, or previous if at the end
          const currentIndex = customerPhotos[customerIdKey]?.indexOf(photoUrl) || 0;
          const newIndex = currentIndex < remainingPhotos.length ? currentIndex : remainingPhotos.length - 1;
          setSelectedPhoto({
            url: remainingPhotos[newIndex],
            index: newIndex,
            total: remainingPhotos.length
          });
        } else {
          // No photos left - close viewer
          setSelectedPhoto(null);
        }
      }

      // Show appropriate success message
      if (cloudinaryDeleted) {
        toast.success('Photo deleted successfully from both database and Cloudinary');
      } else if (photoFound) {
        toast.success('Photo removed from database. Note: Cloudinary deletion requires API secret configuration.');
      } else {
        toast.warning('Photo removed from UI. May still exist in Cloudinary if API secret is not configured.');
      }
      
      setDeleteCustomerPhotoDialogOpen(false);
      setCustomerPhotoToDelete(null);
    } catch (error) {
      console.error('Error deleting customer photo:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete photo');
    } finally {
      setIsDeletingCustomerPhoto(false);
    }
  };


  // Filter data based on search term (case insensitive)
  // Search by name, phone, email, and customer ID only
  const filteredCustomers = customers.filter(customer => {
    if (!searchTerm.trim()) return true; // Show all customers if search is empty
    
    const searchLower = searchTerm.toLowerCase();
    const searchTermClean = searchTerm.trim();
    
    return (
      // Customer ID search
      (customer.customerId || customer.customer_id)?.toLowerCase().includes(searchLower) ||
      // Name search
      (customer.fullName || customer.full_name)?.toLowerCase().includes(searchLower) ||
      // Phone search (exact match or partial)
      customer.phone?.includes(searchTermClean) ||
      (customer.alternatePhone || customer.alternate_phone)?.includes(searchTermClean) ||
      // Email search
      customer.email?.toLowerCase().includes(searchLower)
    );
  });


    // Group all customers with their jobs (no filtering by status)
  const customersWithJobs = customers.map(customer => {
    const customerJobs = jobs
      .filter(job => {
        // Check both possible field names for customer ID
        const jobCustomerId = (job as any).customer_id || job.customerId || (job as any).customerId;
        const customerUuid = customer.id;
        
        // Customer Jobs Match - silently continue
        
        return jobCustomerId === customerUuid;
      })
      .sort((a, b) => {
        const aDate = new Date((a as any).scheduled_date || a.scheduledDate).getTime();
        const bDate = new Date((b as any).scheduled_date || b.scheduledDate).getTime();
        return bDate - aDate; // Most recent first
      });
    
    return {
      customer,
      allJobs: customerJobs,
      upcomingJobs: customerJobs.filter(job => ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status)),                                                    
      completedJobs: customerJobs.filter(job => job.status === 'COMPLETED'),
      cancelledJobs: customerJobs.filter(job => job.status === 'CANCELLED')
    };
  });
  
  // Customers with Jobs processing complete

  // Filter customers based on status filter
  const getFilteredCustomers = () => {
    // For COMPLETED and CANCELLED, use jobs directly since they're paginated
    if (statusFilter === 'COMPLETED' || statusFilter === 'CANCELLED') {
      // Group loaded jobs by customer
      const customerMap = new Map<string, { customer: Customer; allJobs: Job[] }>();
      
      jobs.forEach(job => {
        const customer = (job as any).customer || job.customer;
        if (!customer) return;
        
        const customerId = customer.id;
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer: transformCustomerData(customer),
            allJobs: []
          });
        }
        customerMap.get(customerId)!.allJobs.push(job);
      });
      
      return Array.from(customerMap.values()).map(({ customer, allJobs }) => ({
        customer,
        allJobs,
        upcomingJobs: allJobs.filter(job => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(job.status)),
        completedJobs: allJobs.filter(job => job.status === 'COMPLETED'),
        cancelledJobs: allJobs.filter(job => job.status === 'CANCELLED' || job.status === 'DENIED')
      }));
    }
    
    let filteredCustomers = customersWithJobs;
    
    // Apply status filter
    if (statusFilter === 'ALL') {
      // Show all customers regardless of job status (including those with no jobs)
      filteredCustomers = customersWithJobs;
    } else if (statusFilter === 'ONGOING') {
      // Show customers with ongoing jobs (pending, assigned, in-progress)
      filteredCustomers = customersWithJobs.filter(({ allJobs }) => 
        allJobs.some(job => ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status))                                                                        
      );
    } else if (statusFilter === 'RESCHEDULED') {
      // For RESCHEDULED, use jobs if loaded via pagination, otherwise filter customersWithJobs
      if (jobs.length > 0 && jobs.some(j => ['FOLLOW_UP', 'RESCHEDULED'].includes(j.status))) {
        const customerMap = new Map<string, { customer: Customer; allJobs: Job[] }>();
        jobs.forEach(job => {
          const customer = (job as any).customer || job.customer;
          if (!customer) return;
          const customerId = customer.id;
          if (!customerMap.has(customerId)) {
            customerMap.set(customerId, {
              customer: transformCustomerData(customer),
              allJobs: []
            });
          }
          customerMap.get(customerId)!.allJobs.push(job);
        });
        return Array.from(customerMap.values()).map(({ customer, allJobs }) => ({
          customer,
          allJobs,
          upcomingJobs: allJobs.filter(job => ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status)),
          completedJobs: allJobs.filter(job => job.status === 'COMPLETED'),
          cancelledJobs: allJobs.filter(job => job.status === 'CANCELLED' || job.status === 'DENIED')
        }));
      }
      // Filter for follow-up jobs (FOLLOW_UP and RESCHEDULED status)
      filteredCustomers = customersWithJobs.filter(({ allJobs }) => 
        allJobs.some(job => ['FOLLOW_UP', 'RESCHEDULED'].includes(job.status))
      );
    } else if (statusFilter === 'CANCELLED') {
      // Already handled above
      filteredCustomers = customersWithJobs.filter(({ allJobs }) => 
        allJobs.some(job => ['DENIED', 'CANCELLED'].includes(job.status as any))
      );
    } else {
      // Filter by specific job status
      filteredCustomers = customersWithJobs.filter(({ allJobs }) => 
        allJobs.some(job => job.status === statusFilter)
      );
    }
    
    return filteredCustomers;
  };

  const displayedCustomers = !searchTerm.trim()
    ? getFilteredCustomers()
        .sort((a, b) => {
          const aDate = new Date(a.customer.createdAt).getTime();
          const bDate = new Date(b.customer.createdAt).getTime();
          return bDate - aDate;
        })
    : filteredCustomers.map((customer: Customer) => {
        // Find the customer in customersWithJobs to get their jobs
        const customerWithJobs = customersWithJobs.find(cwj => cwj.customer.id === customer.id);
        // If found, return it; otherwise create a new entry with empty jobs
        return customerWithJobs || {
          customer,
          allJobs: [],
          upcomingJobs: [],
          completedJobs: [],
          cancelledJobs: []
        };
      }).sort((a, b) => {
        const aDate = new Date(a.customer.createdAt).getTime();
        const bDate = new Date(b.customer.createdAt).getTime();
        return bDate - aDate;
      });


  const filteredJobs = jobs.filter(job => {
    if (!searchTerm.trim()) return true; // Show all jobs if search is empty
    
    const searchLower = searchTerm.toLowerCase();
    return (
      (job.job_number || job.jobNumber)?.toLowerCase().includes(searchLower) ||
      (job.customer?.full_name || job.customer?.fullName)?.toLowerCase().includes(searchLower) ||
      job.customer?.phone?.includes(searchTerm)
    );
  });

  // Filter jobs by today's date for stat cards
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayStart = today.toISOString();
  const todayEnd = tomorrow.toISOString();
  const todayDateStr = today.toISOString().split('T')[0];

  const pendingJobs = jobs.filter(job => {
    if (job.status !== 'PENDING') return false;
    const createdAt = job.createdAt || (job as any).created_at;
    if (!createdAt) return false;
    const createdDate = new Date(createdAt);
    return createdDate >= today && createdDate < tomorrow;
  });
  
  const assignedJobs = jobs.filter(job => job.status === 'ASSIGNED');
  
  const inProgressJobs = jobs.filter(job => {
    if (job.status !== 'IN_PROGRESS') return false;
    const createdAt = job.createdAt || (job as any).created_at;
    if (!createdAt) return false;
    const createdDate = new Date(createdAt);
    return createdDate >= today && createdDate < tomorrow;
  });
  
  const completedJobs = jobs.filter(job => job.status === 'COMPLETED');
  
  // New stats for the dashboard cards (filtered by today)
  const ongoingJobs = jobs.filter(job => {
    if (!['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status)) return false;
    const createdAt = job.createdAt || (job as any).created_at;
    if (!createdAt) return false;
    const createdDate = new Date(createdAt);
    return createdDate >= today && createdDate < tomorrow;
  });
  
  const followupJobs = jobs.filter(job => {
    if (!['FOLLOW_UP', 'RESCHEDULED'].includes(job.status)) return false;
    const followUpDate = job.followUpDate || (job as any).follow_up_date;
    if (!followUpDate) return false;
    return followUpDate.startsWith(todayDateStr);
  });
  
  const deniedJobs = jobs.filter(job => {
    if (!['DENIED', 'CANCELLED'].includes(job.status)) return false;
    const deniedAt = (job as any).denied_at;
    if (!deniedAt) return false;
    const deniedDate = new Date(deniedAt);
    return deniedDate >= today && deniedDate < tomorrow;
  });

  // Show login form if not authenticated
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="flex items-center justify-center space-x-1 mb-4">
            <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

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

  // Show GST Invoices page if requested
  if (showGSTInvoicesPage) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleHideGSTInvoices}
              className="text-gray-600 hover:text-gray-900 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
          <GSTInvoicesPage />
        </div>
      </div>
    );
  }

  // Show AMC View page if requested
  if (showAMCViewPage) {
    return <AMCViewPage onBack={handleHideAMCView} />;
  }

  // Show different views based on currentView state
  if (currentView === 'payments') {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentView('dashboard')}
              className="text-gray-600 hover:text-gray-900 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
          <TechnicianPayments />
        </div>
      </div>
    );
  }

  if (currentView === 'billing') {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentView('dashboard')}
              className="text-gray-600 hover:text-gray-900 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
          <BillingStats />
        </div>
      </div>
    );
  }

  if (currentView === 'analytics') {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentView('dashboard')}
              className="text-gray-600 hover:text-gray-900 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
          <Analytics />
        </div>
      </div>
    );
  }

  if (currentView === 'calling') {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentView('dashboard')}
              className="text-gray-600 hover:text-gray-900 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
          <CallingPage hideHeader={true} onBack={() => setCurrentView('dashboard')} />
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
            
            {/* Search Bar - visible on desktop only, replaces title */}
            <div className="hidden sm:flex flex-1 max-w-2xl gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by customer ID, name, phone, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleSearchKeyPress}
                  className="pl-10 bg-white border-gray-400 focus:border-blue-500 focus:ring-blue-500"
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
                    <span>Searching...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    <span>Search</span>
                  </div>
                )}
              </Button>
              {searchQuery && (
                <Button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchTerm('');
                    setIsSearching(false);
                  }}
                  variant="outline"
                  className="px-4"
                  title="Clear"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:flex-wrap">
              {/* All 6 buttons in a 3x2 grid on mobile, flex on desktop */}
              <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-2 w-full sm:w-auto">
                {/* Row 1: Settings, Recent, Payments */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline"
                      className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                      title="Settings"
                  >
                    <Settings className="w-4 h-4" />
                      <span className="hidden sm:inline">Settings</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => {
                    navigate('/settings');
                  }}>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShowGSTInvoices}>
                    <Receipt className="w-4 h-4 mr-2" />
                    GST Invoices
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShowAMCView}>
                    <FileText className="w-4 h-4 mr-2" />
                    View AMCs
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={async () => {
                      await logout();
                    }}
                    className="text-red-600 focus:text-red-600"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                  className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                onClick={() => setRecentAccountsDialogOpen(true)}
                  title="Recent"
              >
                <Clock className="w-4 h-4" />
                  <span className="hidden sm:inline">Recent</span>
              </Button>
                <Button
                  variant={(currentView as string) === 'payments' ? 'default' : 'outline'}
                  onClick={() => handleViewChange('payments')}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                  title="Payments"
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="hidden sm:inline">Payments</span>
                </Button>
                
                {/* Row 2: Billing, Analytics, Calling */}
                <Button
                  variant={(currentView as string) === 'billing' ? 'default' : 'outline'}
                  onClick={() => handleViewChange('billing')}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                  title="Billing"
                >
                  <Receipt className="w-4 h-4" />
                  <span className="hidden sm:inline">Billing</span>
                </Button>
                <Button
                  variant={(currentView as string) === 'analytics' ? 'default' : 'outline'}
                  onClick={() => handleViewChange('analytics')}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                  title="Analytics"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Analytics</span>
                </Button>
                <Button
                  variant={(currentView as string) === 'calling' ? 'default' : 'outline'}
                  onClick={() => handleViewChange('calling')}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto sm:px-3"
                  title="Calling"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span className="hidden sm:inline">Calling</span>
                </Button>
              </div>
              
              {/* Add Customer button */}
              <Button 
                onClick={handleAddCustomer}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto px-4 py-2 text-sm sm:text-base"
              >
                <Users className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Add Customer</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Search Bar - visible on mobile only (desktop version is in header) */}
        <div className="mb-4 sm:mb-6 sm:hidden">
          <div className="flex gap-2 w-full max-w-2xl">
            <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by customer ID, name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleSearchKeyPress}
              className="pl-10 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
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
            {searchQuery && (
              <Button
                onClick={() => {
                  setSearchQuery('');
                  setSearchTerm('');
                  setIsSearching(false);
                }}
                variant="outline"
                className="px-4"
                title="Clear"
              >
                <X className="w-4 h-4" />
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

        {/* Stats Cards - Clickable Filter Buttons */}
        <StatsCards
          statusFilter={statusFilter}
          onFilterChange={(filter) => setStatusFilter(filter as typeof statusFilter)}
          jobCounts={jobCounts}
          pendingJobs={pendingJobs}
          inProgressJobs={inProgressJobs}
        />

        {/* Date Filter for Denied Jobs */}
        {statusFilter === 'CANCELLED' && (
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <Label htmlFor="denied-date-filter" className="text-sm font-medium text-gray-700">
              Show denied jobs for:
            </Label>
            <Input
              id="denied-date-filter"
              type="date"
              value={deniedDateFilter}
              onChange={(e) => setDeniedDateFilter(e.target.value)}
              className="max-w-[200px]"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date();
                setDeniedDateFilter(today.toISOString().split('T')[0]);
              }}
            >
              Today
            </Button>
          </div>
        )}

        {/* Date Filter for Completed Jobs */}
        {statusFilter === 'COMPLETED' && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Label htmlFor="completed-date-filter" className="text-sm font-medium text-gray-700">
                Show completed jobs for:
              </Label>
              <Input
                id="completed-date-filter"
                type="date"
                value={completedDateFilter}
                onChange={(e) => setCompletedDateFilter(e.target.value)}
                className="max-w-[200px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const today = new Date();
                  setCompletedDateFilter(today.toISOString().split('T')[0]);
                }}
              >
                Today
              </Button>
            </div>
          </div>
        )}

        {/* Customers with Jobs */}
        <div className="mb-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">
            {statusFilter === 'ALL' ? 'All Customers' :
             statusFilter === 'ONGOING' ? 'Customers with Ongoing Jobs' : 
             statusFilter === 'RESCHEDULED' ? 'Customers with Follow-up Jobs' :
             statusFilter === 'CANCELLED' ? 'Customers with Denied Jobs' :
             statusFilter === 'COMPLETED' ? 'Customers with Completed Jobs' :
             `Customers with ${statusFilter} Jobs`}
          </h2>
          {!searchTerm.trim() && (
            <p className="text-xs text-gray-500 mb-3">
              {statusFilter === 'ALL'
                ? `Showing all ${displayedCustomers.length} customers (including those with no jobs)`
                : statusFilter === 'ONGOING' 
                ? `Showing ${displayedCustomers.length} customers with ongoing jobs (pending, assigned, in-progress)`                                           
                : statusFilter === 'RESCHEDULED'
                ? `Showing ${displayedCustomers.length} customers with follow-up jobs`                                                                          
                : statusFilter === 'CANCELLED'
                ? `Showing ${displayedCustomers.length} customers with denied jobs for ${new Date(deniedDateFilter).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`                                                                             
                : statusFilter === 'COMPLETED'
                ? `Showing ${displayedCustomers.length} customers with completed jobs for ${new Date(completedDateFilter).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`                                                                             
                : `Showing ${displayedCustomers.length} customers with ${statusFilter.toLowerCase().replace('_', ' ')} jobs`                                    
              }
            </p>
          )}
          
          {/* Customer Cards with Jobs */}
          <div className="space-y-6">
            {displayedCustomers.map(({ customer, allJobs, upcomingJobs, completedJobs, cancelledJobs }) => (
              <Card key={customer.id} className="bg-white border border-gray-300 hover:border-gray-400 hover:shadow-md transition-all duration-200 overflow-hidden mb-6 rounded-lg group">
                <CustomerCardHeader
                  customer={customer}
                  customerAMCStatus={customerAMCStatus}
                  isLoadingPhotos={isLoadingPhotos}
                  selectedCustomerForPhotos={selectedCustomerForPhotos}
                  moreOptionsDialogOpen={moreOptionsDialogOpen}
                  onEditCustomer={handleEditCustomer}
                  onNewJob={handleNewJob}
                  onViewPhotos={handleViewPhotos}
                  onGenerateBill={handleGenerateBill}
                  onGenerateQuotation={handleGenerateQuotation}
                  onGenerateAMC={handleGenerateAMC}
                  onGenerateTaxInvoice={handleGenerateTaxInvoice}
                  onSetSelectedCustomerForReport={setSelectedCustomerForReport}
                  onSetCustomerReportDialogOpen={setCustomerReportDialogOpen}
                  onSetMoreOptionsDialogOpen={setMoreOptionsDialogOpen}
                />

                {/* Contact & Communication - Mobile First */}
                <ContactSection
                  customer={customer}
                  handlePhoneClick={handlePhoneClick}
                  currentLocation={currentLocation}
                  isGettingLocation={isGettingLocation}
                  customerDistances={customerDistances}
                  setCurrentLocation={setCurrentLocation}
                  setIsGettingLocation={setIsGettingLocation}
                  setAddressDialogOpen={setAddressDialogOpen}
                />

                                {/* Services Section - Always show, even if no jobs */}
                <div className="p-4 bg-gray-50">
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-3">                                                              
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">                                                       
                        <Wrench className="w-4 h-4 text-gray-600" />
                      </div>
                      Service History ({allJobs.length})
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">All service requests and job details</p>                                                        
                  </div>
                  
                  {allJobs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p className="text-sm">No service history found for this customer</p>
                    </div>
                  ) : (

                                        <div className="space-y-4">
                      {(() => {
                        // Show jobs based on current filter
                        let jobsToShow = allJobs;
                        if (statusFilter === 'ALL') {
                          // Show all jobs when filter is 'ALL'
                          jobsToShow = allJobs;
                        } else if (statusFilter === 'ONGOING') {
                          // Show ongoing jobs (pending, assigned, in-progress)
                          jobsToShow = allJobs.filter(job => ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'].includes(job.status));                                      
                        } else if (statusFilter === 'RESCHEDULED') {
                          // Show follow-up jobs (FOLLOW_UP status)
                          jobsToShow = allJobs.filter(job => job.status === 'FOLLOW_UP');
                        } else if (statusFilter === 'CANCELLED') {
                          // Show denied jobs (DENIED status)
                          jobsToShow = allJobs.filter(job => job.status === 'DENIED');
                        } else if (statusFilter === 'COMPLETED') {
                          // Show all completed jobs - no filtering by message sent status
                          jobsToShow = completedJobs;
                        } else {
                          jobsToShow = allJobs.filter(job => job.status === statusFilter);                                                                      
                        }
                        
                        // Debug logging
                        if (import.meta.env.DEV) {
                        }
                        
                                                return jobsToShow.length === 0 ? (
                          <div key="no-jobs" className="text-center py-8 text-gray-500">
                            <p className="text-sm">No jobs match the current filter</p>
                          </div>
                        ) : jobsToShow.map((job) => {
                        const beforePhotos = Array.isArray(job.before_photos || job.beforePhotos) ? (job.before_photos || job.beforePhotos) : [];               
                        const afterPhotos = Array.isArray(job.after_photos || job.afterPhotos) ? (job.after_photos || job.afterPhotos) : [];                    
                        
                        const allPhotos = [...extractPhotoUrls(beforePhotos), ...extractPhotoUrls(afterPhotos)];                                                
                        const followUpDate = (job as any).follow_up_date || job.followUpDate || null;
                        const followUpTime = (job as any).follow_up_time || job.followUpTime || null;
                        const followUpNotes = (job as any).follow_up_notes || job.followUpNotes || '';
                        const followUpScheduledAt = (job as any).follow_up_scheduled_at || job.followUpScheduledAt || null;
                        const followUpScheduledBy = (job as any).follow_up_scheduled_by || job.followUpScheduledBy || null;
                        const formattedFollowUpDate = followUpDate ? new Date(followUpDate).toLocaleDateString() : null;
                        const formattedFollowUpTime = followUpTime ? (() => {
                          const timeString = String(followUpTime);
                          const [hours, minutes] = timeString.split(':');
                          if (!hours || !minutes) {
                            return timeString;
                          }
                          const hourNum = parseInt(hours, 10);
                          if (Number.isNaN(hourNum)) {
                            return timeString;
                          }
                          const normalizedHour = ((hourNum % 12) + 12) % 12 || 12;
                          const suffix = hourNum >= 12 ? 'PM' : 'AM';
                          return `${normalizedHour}:${minutes.padEnd(2, '0')} ${suffix}`;
                        })() : null;
                        const formattedFollowUpScheduledAt = followUpScheduledAt ? new Date(followUpScheduledAt).toLocaleString() : null;
                        const followUpScheduledByTechnician = followUpScheduledBy
                          ? technicians.find(tech => tech.id === followUpScheduledBy)
                          : null;
                        const followUpScheduledByName =
                          followUpScheduledByTechnician?.fullName ||
                          (followUpScheduledBy === 'admin' ? 'Admin' : undefined) ||
                          (followUpScheduledBy === 'technician' ? 'Technician' : undefined) ||
                          'Admin';
                        
                        const denialReason = (job as any).denial_reason || job.denialReason || '';
                        const deniedBy = (job as any).denied_by || job.deniedBy || '';
                        const deniedAt = (job as any).denied_at || job.deniedAt || null;
                        const formattedDeniedAt = deniedAt ? new Date(deniedAt).toLocaleString() : null;
                        
                        // Extract completion details
                        const completionNotes = (job as any).completion_notes || job.completionNotes || '';
                        const completedAt = (job as any).completed_at || job.completedAt || null;
                        const formattedCompletedAt = completedAt ? new Date(completedAt).toLocaleString() : null;
                        const completedBy = (job as any).completed_by || job.completedBy || null;
                        const actualCost = (job as any).actual_cost || job.actual_cost || null;
                        const paymentAmount = (job as any).payment_amount || job.payment_amount || null;
                        const paymentMethod = (job as any).payment_method || job.payment_method || null;
                        
                        // Get technician name who completed the job
                        let completedByName = 'Unknown';
                        if (completedBy) {
                          if (completedBy === 'admin' || completedBy === 'Admin') {
                            completedByName = 'Admin';
                          } else {
                            const completedByTechnician = technicians.find(tech => tech.id === completedBy);
                            completedByName = completedByTechnician?.fullName || 'Technician';
                          }
                        }
                        
                        // Parse requirements to get AMC info, bill photos, payment screenshot
                        const requirements = parseJobRequirements((job as any).requirements || job.requirements);
                        
                        const amcInfo = requirements.find((r: any) => r?.amc_info)?.amc_info || null;
                        const qrPhotos = requirements.find((r: any) => r?.qr_photos)?.qr_photos || null;
                        const billPhotos = requirements.find((r: any) => r?.bill_photos)?.bill_photos || [];
                        const paymentScreenshot = qrPhotos?.payment_screenshot || null;
                        
                        return (
                          <div key={job.id}>
                            <CompletedJobSection
                              job={job}
                              technicians={technicians}
                              requirements={requirements}
                              actualCost={actualCost}
                              paymentAmount={paymentAmount}
                              paymentMethod={paymentMethod}
                              qrPhotos={qrPhotos}
                              billPhotos={billPhotos}
                              paymentScreenshot={paymentScreenshot}
                              amcInfo={amcInfo}
                              completionNotes={completionNotes}
                              completedByName={completedByName}
                              formattedCompletedAt={formattedCompletedAt}
                              setSelectedCompletedJob={setSelectedCompletedJob}
                              setCompletedJobEditData={setCompletedJobEditData}
                              setEditCompletedJobDialogOpen={setEditCompletedJobDialogOpen}
                              setSelectedJobForMessage={setSelectedJobForMessage}
                              setSendMessageDialogOpen={setSendMessageDialogOpen}
                              setSelectedBillPhotos={setSelectedBillPhotos}
                              setSelectedPhoto={setSelectedPhoto}
                              setPhotoViewerOpen={setPhotoViewerOpen}
                            />
                            <DeniedJobSection
                              job={job}
                              denialReason={denialReason}
                              deniedBy={deniedBy}
                              formattedDeniedAt={formattedDeniedAt}
                            />
                            <FollowUpJobSection
                              job={job}
                              formattedFollowUpDate={formattedFollowUpDate}
                              formattedFollowUpTime={formattedFollowUpTime}
                              followUpNotes={followUpNotes}
                              formattedFollowUpScheduledAt={formattedFollowUpScheduledAt}
                              followUpScheduledByName={followUpScheduledByName}
                            />
                            <div className={`bg-white rounded-lg border ${job.status === 'PENDING' && !(job.assigned_technician_id || job.assignedTechnicianId) ? 'border-blue-500 border-2' : 'border-gray-300'} hover:border-gray-400 hover:shadow-sm transition-all duration-200 overflow-hidden group`}>
                            <div className="p-3 sm:p-4">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex-1 min-w-0">
                                  {/* Mobile: Stack badges vertically, Desktop: Horizontal */}
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge className="bg-blue-100 text-blue-800 border-0">
                                        {job.service_type || job.serviceType} {job.service_sub_type || job.serviceSubType}
                                      </Badge>
                                      <StatusBadge status={job.status} />
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {allPhotos.length > 0 && (
                                        <div className="flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-md">
                                          <Camera className="w-3 h-3" />
                                          {allPhotos.length} photos
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-sm">
                                    <div className="flex items-start gap-2 sm:items-center">
                                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs text-gray-500">Scheduled</div>
                                        <div className="font-medium text-gray-900 break-words">
                                          {new Date(job.scheduled_date || job.scheduledDate).toLocaleDateString()}
                                        </div>
                                        <div className="text-xs text-gray-600">
                                          {(() => {
                                            // Handle requirements - could be array, object, or string
                                            let requirements = (job as any).requirements;
                                            
                                            // If it's a string, parse it
                                            if (typeof requirements === 'string') {
                                              try {
                                                requirements = JSON.parse(requirements);
                                              } catch (e) {
                                                requirements = [];
                                              }
                                            }
                                            
                                            // If it's an object (not array), convert to array
                                            if (requirements && typeof requirements === 'object' && !Array.isArray(requirements)) {
                                              requirements = [requirements];
                                            }
                                            
                                            // Ensure it's an array
                                            if (!Array.isArray(requirements)) {
                                              requirements = [];
                                            }
                                            
                                            // Check if there's a custom time in requirements
                                            const customTime = requirements.find((r: any) => r?.custom_time)?.custom_time;
                                            
                                            if (customTime) {
                                              // Format the time nicely (e.g., "14:30" -> "2:30 PM")
                                              const [hours, minutes] = customTime.split(':');
                                              const hour24 = parseInt(hours);
                                              const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
                                              const ampm = hour24 >= 12 ? 'PM' : 'AM';
                                              return `${hour12}:${minutes} ${ampm}`;
                                            }
                                            
                                            // Check for flexible time
                                            const isFlexible = requirements.find((r: any) => r?.flexible_time)?.flexible_time;
                                            if (isFlexible) {
                                              return 'Flexible';
                                            }
                                            
                                            // Otherwise show the time slot
                                            const timeSlot = job.scheduled_time_slot || job.scheduledTimeSlot || 'Time not specified';
                                            // Map time slots to readable format
                                            const timeSlotMap: { [key: string]: string } = {
                                              'MORNING': 'Morning (9 AM - 1 PM)',
                                              'AFTERNOON': 'Afternoon (1 PM - 6 PM)',
                                              'EVENING': 'Evening (6 PM - 9 PM)'
                                            };
                                            return timeSlotMap[timeSlot] || timeSlot;
                                          })()}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Agreed Price - Only show if it exists and is greater than 0 */}
                                    {(() => {
                                      // Handle requirements - could be array, object, or string
                                      let requirements = (job as any).requirements;
                                      
                                      // If it's a string, parse it
                                      if (typeof requirements === 'string') {
                                        try {
                                          requirements = JSON.parse(requirements);
                                        } catch (e) {
                                          requirements = [];
                                        }
                                      }
                                      
                                      // If it's an object (not array), convert to array
                                      if (requirements && typeof requirements === 'object' && !Array.isArray(requirements)) {
                                        requirements = [requirements];
                                      }
                                      
                                      // Ensure it's an array
                                      if (!Array.isArray(requirements)) {
                                        requirements = [];
                                      }
                                      
                                      const costRange = requirements.find((r: any) => r?.cost_range)?.cost_range;
                                      const estimatedCost = (job as any).estimated_cost;
                                      const hasCost = estimatedCost && parseFloat(String(estimatedCost)) > 0;
                                      
                                      if (!hasCost) return null;
                                      
                                      return (
                                        <div className="flex items-start gap-2 sm:items-center">
                                          <div className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0 font-bold text-lg">₹</div>
                                          <div className="min-w-0 flex-1">
                                            <div className="text-xs text-gray-500">Agreed Price</div>
                                            <div className="font-medium text-gray-900 break-words">
                                              {costRange && typeof costRange === 'string' && costRange.includes('-') 
                                                ? `₹${costRange}` 
                                                : `₹${estimatedCost ? String(estimatedCost) : '0'}`}
                                              {(job as any).actual_cost && String((job as any).actual_cost) !== String(estimatedCost) && (
                                                <span className="text-xs text-gray-500 ml-1">
                                                  (Est: ₹{estimatedCost ? String(estimatedCost) : '0'})
                                                </span>
                                              )}
                                            </div>
                                            {(job as any).actual_cost && parseFloat(String((job as any).actual_cost)) > 0 && (
                                              <div className="text-xs text-green-600">
                                                Final: ₹{String((job as any).actual_cost)}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                    
                                            {(() => {
                                      // Get assigned technician info
                                      const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
                                      const assignedTechnician = job.assignedTechnician || 
                                        (assignedTechnicianId ? technicians.find(t => t.id === assignedTechnicianId) : null);
                                      
                                      // Get technician name from various possible fields
                                      const technicianName = assignedTechnician?.fullName || 
                                        (job as any).technician_name ||
                                        (assignedTechnicianId ? technicians.find(t => t.id === assignedTechnicianId)?.fullName : null);
                                      
                                      // Get brand/model for display
                                      const jobBrand = (job as any).brand || job.brand;
                                      const jobModel = (job as any).model || job.model;
                                      const customerBrand = customer.brand || '';
                                      const customerModel = customer.model || '';
                                      
                                      const isValidValue = (val: string) => {
                                        return val && 
                                          val !== 'Not specified' && 
                                          val.toLowerCase() !== 'not specified' && 
                                          val.trim() !== '';
                                      };
                                      
                                      const hasValidJobBrand = isValidValue(jobBrand);
                                      const hasValidJobModel = isValidValue(jobModel);
                                      
                                      let brand = hasValidJobBrand ? jobBrand : '';
                                      let model = hasValidJobModel ? jobModel : '';
                                      
                                      // Fallback to customer if job doesn't have valid values
                                      if (!brand || !model) {
                                        if (customerBrand && customerBrand.includes(',')) {
                                          const brands = customerBrand.split(',').map((b: string) => b.trim());
                                          const models = customerModel ? customerModel.split(',').map((m: string) => m.trim()) : [];
                                          const jobServiceType = ((job.service_type || job.serviceType || '') as string).toUpperCase();
                                          
                                          if (jobServiceType === 'RO' || jobServiceType === '') {
                                            if (!brand) brand = brands[0] || '';
                                            if (!model) model = models[0] || '';
                                          } else if (jobServiceType === 'SOFTENER' && brands.length > 1) {
                                            if (!brand) brand = brands[1] || brands[0] || '';
                                            if (!model) model = models[1] || models[0] || '';
                                              } else {
                                            if (!brand) brand = brands[0] || '';
                                            if (!model) model = models[0] || '';
                                          }
                                        } else {
                                          if (!brand && isValidValue(customerBrand)) brand = customerBrand;
                                          if (!model && isValidValue(customerModel)) model = customerModel;
                                        }
                                      }
                                      
                                      const validBrand = isValidValue(brand) ? brand : '';
                                      const validModel = isValidValue(model) ? model : '';
                                      
                                      // Show both Equipment and Assigned To if they exist
                                      const hasEquipment = validBrand || validModel;
                                      const hasTechnician = technicianName || assignedTechnicianId;
                                      
                                      if (!hasEquipment && !hasTechnician) {
                                        return null;
                                      }
                                      
                                      return (
                                        <>
                                          {/* Show Equipment section with brand and/or model */}
                                          {hasEquipment && (
                                            <div className="flex items-start gap-2 sm:items-center">
                                              <Wrench className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                              <div className="min-w-0 flex-1">
                                                <div className="text-xs text-gray-500">Equipment</div>
                                                <div className="font-medium text-gray-900 break-words">
                                                  {validBrand && validModel 
                                                    ? `${validBrand} - ${validModel}` 
                                                    : validBrand || validModel}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                          
                                          {/* Show Assigned To section if technician is assigned */}
                                          {hasTechnician && (
                                            <div className="flex items-start gap-2 sm:items-center">
                                              <User className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                              <div className="min-w-0 flex-1">
                                                <div className="text-xs text-gray-500">Assigned To</div>
                                                <div className="font-medium text-gray-900 break-words">
                                                  {technicianName || 'Unassigned'}
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                    
                                    {job.description && job.description.trim() && job.description !== 'No description provided' && (() => {
                                      const descriptionLength = job.description.length;
                                      const maxLength = 150; // Show expand option if longer than 150 characters
                                      const shouldShowExpand = descriptionLength > maxLength;
                                      const displayText = shouldShowExpand 
                                        ? job.description.substring(0, maxLength) + '...' 
                                        : job.description;
                                      
                                      return (
                                        <div className="flex items-start gap-2 sm:items-center">
                                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                          <div className="min-w-0 flex-1">
                                            <div className="text-xs text-gray-500">Description</div>
                                            <div className="font-medium text-gray-900 break-words">
                                              {displayText}
                                            </div>
                                            {shouldShowExpand && (
                                              <button
                                                onClick={() => {
                                                  setSelectedJobDescription({
                                                    jobId: job.id || '',
                                                    description: job.description
                                                  });
                                                  setDescriptionDialogOpen(true);
                                                }}
                                                className="text-xs text-blue-600 hover:text-blue-800 mt-1 font-medium"
                                              >
                                                Show more
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                    
                                    {/* Lead Source */}
                                    {(() => {
                                      // Handle requirements - could be array, object, or string
                                      let requirements = (job as any).requirements;
                                      
                                      
                                      // If it's a string, parse it
                                      if (typeof requirements === 'string') {
                                        try {
                                          requirements = JSON.parse(requirements);
                                        } catch (e) {
                                          requirements = [];
                                        }
                                      }
                                      
                                      // If it's null or undefined, set to empty array
                                      if (!requirements) {
                                        requirements = [];
                                      }
                                      
                                      // If it's an object (not array), convert to array
                                      if (requirements && typeof requirements === 'object' && !Array.isArray(requirements)) {
                                        // Check if it has lead_source directly
                                        if (requirements.lead_source) {
                                          return (
                                            <div className="flex items-start gap-2 sm:items-center">
                                              <Tag className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                              <div className="min-w-0 flex-1">
                                                <div className="text-xs text-gray-500">Lead Source</div>
                                                <div className="font-medium text-gray-900 break-words">{requirements.lead_source}</div>
                                              </div>
                                            </div>
                                          );
                                        }
                                        // Otherwise convert to array
                                        requirements = [requirements];
                                      }
                                      
                                      // Ensure it's an array
                                      if (!Array.isArray(requirements)) {
                                        requirements = [];
                                      }
                                      
                                      // Find lead_source in the array
                                      let leadSource: string | null = null;
                                      
                                      // Try to find lead_source in the array
                                      for (const req of requirements) {
                                        if (req && typeof req === 'object') {
                                          if (req.lead_source) {
                                            leadSource = req.lead_source;
                                            break;
                                          }
                                        }
                                      }
                                      
                                      // If still no lead_source found, check if requirements array has objects with nested properties
                                      if (!leadSource && requirements.length > 0) {
                                        // Sometimes Supabase returns it as an array with numeric keys
                                        const flatReq = requirements.flat();
                                        for (const req of flatReq) {
                                          if (req && typeof req === 'object' && req.lead_source) {
                                            leadSource = req.lead_source;
                                            break;
                                          }
                                        }
                                      }
                                      
                                      // Don't show lead source if it's "Website"
                                      if (leadSource && leadSource !== 'Website') {
                                        return (
                                          <div className="flex items-start gap-2 sm:items-center">
                                            <Tag className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                                            <div className="min-w-0 flex-1">
                                              <div className="text-xs text-gray-500">Lead Source</div>
                                              <div className="font-medium text-gray-900 break-words">{leadSource}</div>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                    
                                  </div>

                                  {/* Photos Section - Mobile responsive */}
                                  {allPhotos.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                      <button
                                        onClick={() => openPhotoGallery(job.id, allPhotos, 'photos')}
                                        className="w-full sm:w-auto text-sm text-gray-600 hover:text-gray-800 font-medium flex items-center justify-center sm:justify-start gap-2 bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-md transition-colors"
                                      >
                                        <Camera className="w-4 h-4 flex-shrink-0" />
                                        <span className="truncate">View Photos ({allPhotos.length})</span>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Job Actions - Always in top-right */}
                                <div className="flex items-center ml-2 flex-shrink-0">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 flex-shrink-0"
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                      {/* Complete Job - First option for all active statuses */}
                                      {(job.status === 'PENDING' || job.status === 'ASSIGNED' || job.status === 'EN_ROUTE' || job.status === 'IN_PROGRESS' || job.status === 'FOLLOW_UP' || job.status === 'RESCHEDULED') && (
                                        <DropdownMenuItem onClick={() => handleCompleteJob(job)}>
                                          <CheckCircle2 className="mr-2 h-4 w-4" />
                                          Complete Job
                                        </DropdownMenuItem>
                                      )}
                                      {job.status === 'PENDING' && (
                                        <DropdownMenuItem onClick={() => handleAssignJob(job)}>
                                          <Wrench className="mr-2 h-4 w-4" />
                                          Assign to Technician
                                        </DropdownMenuItem>
                                      )}
                                      {job.status === 'ASSIGNED' && (
                                        <DropdownMenuItem onClick={() => handleJobStatusUpdate(job.id, 'IN_PROGRESS')}>
                                          <Clock className="mr-2 h-4 w-4" />
                                          Start Job
                                        </DropdownMenuItem>
                                      )}
                                      {(job.status === 'PENDING' || job.status === 'ASSIGNED' || job.status === 'EN_ROUTE' || job.status === 'IN_PROGRESS') && (
                                        <>
                                          <DropdownMenuItem onClick={() => handleScheduleFollowUp(job)}>
                                            <CalendarPlus className="mr-2 h-4 w-4" />
                                            Schedule Follow-up
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleDenyJob(job)}>
                                            <XCircle className="mr-2 h-4 w-4" />
                                            Deny Job
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      {(job.status === 'FOLLOW_UP' || job.status === 'RESCHEDULED') && (
                                        <>
                                          <DropdownMenuItem onClick={() => handleMoveToOngoing(job)}>
                                            <ArrowRight className="mr-2 h-4 w-4" />
                                            Move to Ongoing
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleScheduleFollowUp(job)}>
                                            <CalendarPlus className="mr-2 h-4 w-4" />
                                            Schedule Follow-up
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      <DropdownMenuItem 
                                        onClick={() => handleEditJob(job)}
                                      >
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit Job
                                      </DropdownMenuItem>
                                      {(() => {
                                        // Use the same logic as the technician name display above
                                        const assignedTechnicianId = (job as any).assigned_technician_id || (job as any).assignedTechnicianId;
                                        const assignedTechnician = job.assignedTechnician || 
                                          (assignedTechnicianId ? technicians.find(t => t.id === assignedTechnicianId) : null);
                                        
                                        // Show reassign option if there's an assigned technician or if status suggests one is assigned
                                        const hasAssignedTechnician = 
                                          assignedTechnicianId || 
                                          assignedTechnician ||
                                          job.status === 'ASSIGNED' || 
                                          job.status === 'EN_ROUTE' ||
                                          job.status === 'IN_PROGRESS';
                                        
                                        return hasAssignedTechnician ? (
                                          <DropdownMenuItem 
                                            onClick={() => handleReassignJob(job)}
                                          >
                                            <User className="mr-2 h-4 w-4" />
                                            Reassign Technician
                                          </DropdownMenuItem>
                                        ) : null;
                                      })()}
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
                          </div>
                          </div>
                        );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
          
          {/* Pagination Controls - Only show for paginated views */}
          {(statusFilter === 'COMPLETED' || statusFilter === 'CANCELLED' || statusFilter === 'RESCHEDULED') && totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing page {currentPage} of {totalPages} ({totalCount} total)
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage > 1) {
                          setCurrentPage(currentPage - 1);
                        }
                      }}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(pageNum);
                          }}
                          isActive={currentPage === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        if (currentPage < totalPages) {
                          setCurrentPage(currentPage + 1);
                        }
                      }}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>

      </main>

      {/* Add Customer Dialog */}
      <AddCustomerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        customers={customers}
        onCustomerCreated={loadDashboardData}
        onExistingCustomerFound={(customer) => {
          setExistingCustomer(customer);
          setOverrideDialogOpen(true);
        }}
      />

      {/* Override Dialog for Existing Customer */}
      <AlertDialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Customer Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              A customer with this phone number or email already exists: {existingCustomer?.customer_id || existingCustomer?.customerId} - {existingCustomer?.fullName || existingCustomer?.full_name}
              <br /><br />
              Would you like to update the existing customer instead?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setOverrideDialogOpen(false);
              setExistingCustomer(null);
              setAddDialogOpen(false);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShouldUpdateExisting(true);
              setOverrideDialogOpen(false);
              // Move to step 2 to continue
              setCurrentStep(2);
            }}>
              Update Existing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Legacy Add Customer Dialog - REMOVED - Now using AddCustomerDialog component */}


      {/* Edit Customer Dialog */}
      <EditCustomerDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        customer={editingCustomer}
        dbBrands={dbBrands}
        dbModels={dbModels}
        onCustomerUpdated={(updatedCustomer) => {
          setCustomers(customers.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
          setEditingCustomer(null);
          setEditDialogOpen(false);
          loadDashboardData();
        }}
        onLoadBrandsAndModels={loadBrandsAndModels}
        onCustomerDeleted={(customerId) => {
          setCustomers(customers.filter(c => c.id !== customerId));
          setEditingCustomer(null);
          loadDashboardData();
        }}
      />

      {/* Legacy Edit Customer Dialog - REMOVED */}

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

      {/* Delete Customer Photo Confirmation Dialog */}
      <AlertDialog open={deleteCustomerPhotoDialogOpen} onOpenChange={setDeleteCustomerPhotoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo?
              <br />
              <br />
              This action cannot be undone and will permanently remove the photo from all associated jobs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCustomerPhoto}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteCustomerPhoto}
              disabled={isDeletingCustomerPhoto}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingCustomerPhoto ? (
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

      {/* Override Existing Customer Dialog */}
      <AlertDialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Customer Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              A customer with this phone number or email already exists:
              <br />
              <br />
              <strong>Customer ID:</strong> {(existingCustomer as any)?.customer_id}
              <br />
              <strong>Name:</strong> {(existingCustomer as any)?.full_name}
              <br />
              <strong>Phone:</strong> {(existingCustomer as any)?.phone}
              {existingCustomer?.email && (
                <>
                  <br />
                  <strong>Email:</strong> {existingCustomer.email}
                </>
              )}
              <br />
              <br />
              Do you want to continue and update this existing customer with the new information?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelOverride}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShouldUpdateExisting(true);
                setOverrideDialogOpen(false);
                setCurrentStep(2); // Move to next step
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Continue & Update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Photo Gallery Dialog */}
      <PhotoGalleryDialog
        open={photoGalleryOpen}
        onOpenChange={setPhotoGalleryOpen}
        selectedJobPhotos={selectedJobPhotos}
        onViewPhoto={openPhotoViewer}
        onDeletePhoto={handleDeletePhoto}
      />

      {/* Full-Screen Photo Viewer Modal */}
      <PhotoViewerDialog
        open={photoViewerOpen}
        onOpenChange={setPhotoViewerOpen}
        selectedPhoto={selectedPhoto}
        selectedBillPhotos={selectedBillPhotos}
        selectedJobPhotos={selectedJobPhotos}
        onPrevious={goToPreviousPhoto}
        onNext={goToNextPhoto}
        onDownload={downloadPhoto}
        onClose={() => {
          setPhotoViewerOpen(false);
          setSelectedPhoto(null);
          setSelectedBillPhotos(null);
        }}
      />


      {/* Job Assignment Dialog */}
      <AssignJobDialog
        open={assignJobDialogOpen}
        onOpenChange={setAssignJobDialogOpen}
        job={jobToAssign}
        technicians={technicians}
        selectedTechnicianId={selectedTechnicianId}
        onTechnicianSelect={setSelectedTechnicianId}
        onReloadTechnicians={reloadTechnicians}
        onSave={handleSaveJobAssignment}
        onCancel={() => {
          setAssignJobDialogOpen(false);
          setJobToAssign(null);
          setSelectedTechnicianId('');
        }}
      />

      {/* New Job Dialog */}
      <NewJobDialog
        open={newJobDialogOpen}
        onOpenChange={(open) => {
          setNewJobDialogOpen(open);
          if (!open) {
            setIsJobDialogReady(false);
            setSelectedCustomerForJob(null);
          }
        }}
        customer={selectedCustomerForJob}
        technicians={technicians}
        onJobCreated={(newJob) => {
          setJobs([newJob, ...jobs]);
          const customerId = selectedCustomerForJob?.customer_id || selectedCustomerForJob?.customerId;
          if (customerId) {
            setTimeout(() => {
              loadCustomerPhotos(customerId);
            }, 1000);
          }
        }}
        onCustomerUpdated={(updatedCustomer) => {
          setCustomers(customers.map(c => 
            c.id === updatedCustomer.id ? updatedCustomer : c
          ));
        }}
        onBrandsModelsReload={loadBrandsAndModels}
        parseDbServiceType={parseDbServiceType}
      />

      {/* Customer Photo Gallery Dialog */}
      <CustomerPhotoGalleryDialog
        open={customerPhotoGalleryOpen}
        onOpenChange={handleClosePhotoGallery}
        customer={selectedCustomerForPhotos}
        customerPhotos={customerPhotos}
        uploadingThumbnails={uploadingThumbnails}
        isUploadingPhoto={isUploadingPhoto}
        isLoadingPhotos={isLoadingPhotos}
        isDragOverPhotos={isDragOverPhotos}
        isCompressingImage={isCompressingImage}
        onPhotoUpload={handlePhotoUpload}
        onCameraCapture={handleCameraCapture}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPhotoClick={(photo, index, total) => {
          setSelectedPhoto({ url: photo, index, total });
        }}
        onDeletePhoto={(photoUrl, photoIndex) => {
          setCustomerPhotoToDelete({ photoUrl, photoIndex });
          setDeleteCustomerPhotoDialogOpen(true);
        }}
      />

      {/* Photo Viewer Dialog - Only show if photoViewerOpen is false (fallback for customer photos) */}
      {!photoViewerOpen && (
      <Dialog open={!!selectedPhoto && !!selectedBillPhotos && !photoViewerOpen} onOpenChange={(open) => {
        if (!open) {
          setSelectedPhoto(null);
          setSelectedBillPhotos(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <style dangerouslySetInnerHTML={{__html: `
            [data-radix-dialog-content] button[data-radix-dialog-close] {
              display: none !important;
            }
          `}} />
          <DialogHeader className="sr-only">
            <DialogTitle>Photo Viewer</DialogTitle>
            <DialogDescription>View photo in full screen</DialogDescription>
          </DialogHeader>
          {selectedPhoto && (
            <div className="relative">
              {/* Previous button - only show if viewing bill photos with multiple photos */}
              {selectedBillPhotos && selectedBillPhotos.length > 1 && selectedPhoto.index > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70 rounded-full w-10 h-10"
                  onClick={() => {
                    const newIndex = selectedPhoto.index - 1;
                    setSelectedPhoto({
                      url: selectedBillPhotos[newIndex],
                      index: newIndex,
                      total: selectedBillPhotos.length
                    });
                  }}
                >
                  <span className="text-2xl">‹</span>
                </Button>
              )}

              {/* Next button - only show if viewing bill photos with multiple photos */}
              {selectedBillPhotos && selectedBillPhotos.length > 1 && selectedPhoto.index < selectedBillPhotos.length - 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70 rounded-full w-10 h-10"
                  onClick={() => {
                    const newIndex = selectedPhoto.index + 1;
                    setSelectedPhoto({
                      url: selectedBillPhotos[newIndex],
                      index: newIndex,
                      total: selectedBillPhotos.length
                    });
                  }}
                >
                  <span className="text-2xl">›</span>
                </Button>
              )}

              <img
                src={selectedPhoto.url}
                alt={`Photo ${selectedPhoto.index + 1}`}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              <div className="absolute top-4 right-4 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = selectedPhoto.url;
                    link.download = `photo-${selectedPhoto.index + 1}.jpg`;
                    link.click();
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                {selectedCustomerForPhotos && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setCustomerPhotoToDelete({ photoUrl: selectedPhoto.url, photoIndex: selectedPhoto.index });
                      setDeleteCustomerPhotoDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSelectedPhoto(null);
                    setSelectedBillPhotos(null);
                  }}
                >
                  Close
                </Button>
              </div>
              {selectedPhoto.total > 1 && (
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded">
                {selectedPhoto.index + 1} of {selectedPhoto.total}
              </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      )}

      {/* Service History Dialog */}
      <ServiceHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        customer={selectedCustomerForHistory}
        history={selectedCustomerForHistory ? (customerHistory[selectedCustomerForHistory.customer_id || selectedCustomerForHistory.customerId || ''] || []) : []}
      />

      {/* Legacy Service History Dialog - REMOVED - Now using ServiceHistoryDialog component */}

      {/* Phone Numbers Popup */}
      <PhoneNumbersDialog
        open={phonePopupOpen}
        onOpenChange={setPhonePopupOpen}
        customer={selectedCustomerPhone}
      />

      {/* Reassign Job Dialog */}
      <ReassignJobDialog
        open={reassignDialogOpen}
        onOpenChange={setReassignDialogOpen}
        job={jobToReassign}
        technicians={technicians}
        selectedTechnicianId={selectedTechnicianForReassign}
        onTechnicianSelect={setSelectedTechnicianForReassign}
        onReloadTechnicians={reloadTechnicians}
        onSave={handleReassignSubmit}
        onCancel={() => {
          setReassignDialogOpen(false);
          setJobToReassign(null);
          setSelectedTechnicianForReassign('');
        }}
      />
      
      {/* Legacy Reassign Job Dialog - REMOVED - Now using ReassignJobDialog component */}

      {/* Edit Job Dialog */}
      <EditJobDialog
        open={editJobDialogOpen}
        onOpenChange={setEditJobDialogOpen}
        job={jobToEdit}
        onJobUpdated={(updatedJob) => {
          setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
          setJobToEdit(null);
        }}
      />

      {/* Bill Generation Modal */}
      <BillModal
        isOpen={billModalOpen}
        onClose={handleBillModalClose}
        customer={selectedCustomerForBill}
      />

      {/* Quotation Generation Modal */}
      <QuotationModal
        isOpen={quotationModalOpen}
        onClose={handleQuotationModalClose}
        customer={selectedCustomerForQuotation}
      />

      {/* AMC Generation Modal */}
      <AMCModal
        isOpen={amcModalOpen}
        onClose={handleAMCModalClose}
        customer={selectedCustomerForAMC}
        onAMCSaved={reloadAMCStatus}
      />

      {/* Tax Invoice Generation Modal */}
      <TaxInvoiceModal
        isOpen={taxInvoiceModalOpen}
        onClose={handleTaxInvoiceModalClose}
        customer={selectedCustomerForTaxInvoice}
      />

      {/* Follow-up Modal */}
        <FollowUpModal
          isOpen={followUpModalOpen}
          onClose={() => {
            setFollowUpModalOpen(false);
            setSelectedJobForFollowUp(null);
          }}
          job={selectedJobForFollowUp}
          onScheduleFollowUp={handleFollowUpSubmit}
        />

        {/* Move to Ongoing Dialog */}
        <Dialog open={moveToOngoingDialogOpen} onOpenChange={setMoveToOngoingDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move to Ongoing</DialogTitle>
              <DialogDescription>
                Please select the new scheduled date and time slot for this job.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="admin-ongoing-date">Scheduled Date *</Label>
                <Input
                  id="admin-ongoing-date"
                  type="date"
                  value={moveToOngoingDate}
                  onChange={(e) => setMoveToOngoingDate(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="admin-ongoing-time-slot">Time Slot *</Label>
                <Select
                  value={moveToOngoingTimeSlot}
                  onValueChange={(value: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM') => {
                    setMoveToOngoingTimeSlot(value);
                    // Set default time based on time slot
                    if (value === 'MORNING') {
                      setMoveToOngoingCustomTime('');
                    } else if (value === 'AFTERNOON') {
                      setMoveToOngoingCustomTime('');
                    } else if (value === 'EVENING') {
                      setMoveToOngoingCustomTime('');
                    } else {
                      // CUSTOM - use current time
                      const now = new Date();
                      const customTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                      setMoveToOngoingCustomTime(customTime);
                    }
                  }}
                >
                  <SelectTrigger id="admin-ongoing-time-slot" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MORNING">Morning (9 AM - 12 PM)</SelectItem>
                    <SelectItem value="AFTERNOON">Afternoon (12 PM - 5 PM)</SelectItem>
                    <SelectItem value="EVENING">Evening (5 PM - 8 PM)</SelectItem>
                    <SelectItem value="CUSTOM">Custom Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {moveToOngoingTimeSlot === 'CUSTOM' && (
                <div>
                  <Label htmlFor="admin-ongoing-custom-time">Custom Time *</Label>
                  <Input
                    id="admin-ongoing-custom-time"
                    type="time"
                    value={moveToOngoingCustomTime}
                    onChange={(e) => setMoveToOngoingCustomTime(e.target.value)}
                    className="mt-1"
                    required
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setMoveToOngoingDialogOpen(false);
                  setSelectedJobForMoveToOngoing(null);
                  setMoveToOngoingDate('');
                  setMoveToOngoingTimeSlot('MORNING');
                  setMoveToOngoingCustomTime('');
                }}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                onClick={performMoveToOngoing}
                disabled={isUpdating || !moveToOngoingDate || (moveToOngoingTimeSlot === 'CUSTOM' && !moveToOngoingCustomTime)}
                className="bg-black hover:bg-gray-800 text-white"
              >
                {isUpdating ? 'Moving...' : 'Move to Ongoing'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Deny Job Dialog */}
      <DenyJobDialog
        open={denyDialogOpen}
        onOpenChange={setDenyDialogOpen}
        job={selectedJobForDeny}
        denyReason={denyReason}
        onDenyReasonChange={setDenyReason}
        onDeny={handleDenyJobSubmit}
      />

      {/* Complete Job Dialog */}
      <CompleteJobDialog
        open={completeDialogOpen}
        onOpenChange={(open) => {
          setCompleteDialogOpen(open);
        if (!open) {
          setSelectedJobForComplete(null);
          }
        }}
        job={selectedJobForComplete}
        technicians={technicians}
        commonQrCodes={commonQrCodes}
        onLoadQrCodes={loadQrCodes}
        onJobCompleted={async () => {
          await loadFilteredJobs(statusFilter, currentPage);
        }}
      />
      
      {/* Complete Job Dialog - Now handled by CompleteJobDialog component */}
      {/* Address Dialog */}
      <AddressDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        customers={customers}
        currentLocation={currentLocation}
        customerDistances={customerDistances}
        onCalculateDistance={async (customer) => {
          if (calculateDistanceAndTimeRef.current && currentLocation) {
                      const customerLocation = extractCoordinates(customer.location);
                      let finalCustomerLocation = customerLocation;
                      
                      if (!finalCustomerLocation || finalCustomerLocation.latitude === 0 || finalCustomerLocation.longitude === 0) {
                        const googleMapsLink = customer.location?.formattedAddress;
                        if (googleMapsLink && (googleMapsLink.includes('google.com/maps') || googleMapsLink.includes('maps.app.goo.gl'))) {
                          finalCustomerLocation = extractCoordinates({ formattedAddress: googleMapsLink });
                        }
                      }
                      
                      if (finalCustomerLocation && finalCustomerLocation.latitude && finalCustomerLocation.longitude) {
                          await calculateDistanceAndTimeRef.current(
                            currentLocation,
                            { lat: finalCustomerLocation.latitude, lng: finalCustomerLocation.longitude },
                            customer.id
                          );
                        }
          }
        }}
      />
      
      {/* Description Dialog */}
      <DescriptionDialog
        open={descriptionDialogOpen}
        onOpenChange={setDescriptionDialogOpen}
        selectedJobDescription={selectedJobDescription}
        jobs={jobs}
      />

      {/* Job Address Dialog */}
      <JobAddressDialog
        open={jobAddressDialogOpen}
        onOpenChange={setJobAddressDialogOpen}
        jobs={jobs}
      />

      {/* Customer Report Dialog */}
      <CustomerReportDialog
        open={customerReportDialogOpen}
        onOpenChange={setCustomerReportDialogOpen}
        customer={selectedCustomerForReport}
        technicians={technicians}
        onPhotoClick={(url, index, total) => {
          setSelectedPhoto({ url, index, total });
          setPhotoViewerOpen(true);
        }}
        onBillPhotosClick={(photos, index) => {
          setSelectedBillPhotos(photos);
          setSelectedPhoto({ url: photos[index], index, total: photos.length });
          setPhotoViewerOpen(true);
        }}
      />

      {/* Edit Completed Job Dialog */}
      <EditCompletedJobDialog
        open={editCompletedJobDialogOpen}
        onOpenChange={setEditCompletedJobDialogOpen}
        job={selectedCompletedJob}
        editData={completedJobEditData}
        onEditDataChange={setCompletedJobEditData}
        technicians={technicians}
        onSave={async () => {
                try {
                  if (!selectedCompletedJob) return;

                  // Update requirements with edited data
                  let requirements: any[] = [];
                  try {
                    const reqData = (selectedCompletedJob as any).requirements || selectedCompletedJob.requirements;
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

                  // Update or add AMC info
                  let amcIndex = requirements.findIndex((r: any) => r?.amc_info);
                  if (completedJobEditData.amcInfo) {
                    if (amcIndex >= 0) {
                      requirements[amcIndex].amc_info = completedJobEditData.amcInfo;
                    } else {
                      requirements.push({ amc_info: completedJobEditData.amcInfo });
                    }
                  }

                  // Update QR photos if QR code name changed
                  if (completedJobEditData.qrCodeName) {
                    let qrIndex = requirements.findIndex((r: any) => r?.qr_photos);
                    if (qrIndex >= 0) {
                      requirements[qrIndex].qr_photos = {
                        ...requirements[qrIndex].qr_photos,
                        selected_qr_code_name: completedJobEditData.qrCodeName
                      };
                    } else {
                      requirements.push({
                        qr_photos: { selected_qr_code_name: completedJobEditData.qrCodeName }
                      });
                    }
                  }

                  // Prepare update data
                  const amount = parseFloat(completedJobEditData.amount) || 0;
                  const updateData: any = {
                    actual_cost: amount,
                    payment_amount: amount,
                    payment_method: completedJobEditData.paymentMethod || 'CASH',
                    payment_status: amount > 0 ? 'PAID' : 'PENDING',
                    completion_notes: completedJobEditData.completionNotes || '',
                    completed_by: completedJobEditData.completedBy || 'admin',
                    requirements: JSON.stringify(requirements)
                  };

                  const { error } = await db.jobs.update(selectedCompletedJob.id, updateData);
                  
                  if (error) {
                    toast.error('Failed to update job: ' + error.message);
                  } else {
                    toast.success('Job updated successfully');
                    setEditCompletedJobDialogOpen(false);
                    // Reload jobs
                    await loadFilteredJobs(statusFilter, currentPage);
                  }
                } catch (error: any) {
                  toast.error('Error updating job: ' + error.message);
                }
              }}
      />

      {/* Send Message Dialog */}
      <SendMessageDialog
        open={sendMessageDialogOpen}
        onOpenChange={setSendMessageDialogOpen}
        job={selectedJobForMessage}
        onMessageSent={handleMessageSent}
      />

      {/* PIN Dialog */}

      {/* Recent Accounts Dialog */}
      <Dialog open={recentAccountsDialogOpen} onOpenChange={setRecentAccountsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recent Accounts - Today</DialogTitle>
            <DialogDescription>
              All accounts created today ({new Date().toLocaleDateString()})
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {customers
              .filter(customer => {
                const customerSince = (customer as any).customerSince || (customer as any).customer_since;
                if (!customerSince) return false;
                const createdDate = new Date(customerSince);
                const today = new Date();
                return createdDate.toDateString() === today.toDateString();
              })
              .length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No accounts created today.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {customers
                  .filter(customer => {
                    const customerSince = (customer as any).customerSince || (customer as any).customer_since;
                    if (!customerSince) return false;
                    const createdDate = new Date(customerSince);
                    const today = new Date();
                    return createdDate.toDateString() === today.toDateString();
                  })
                  .sort((a, b) => {
                    const dateA = new Date((a as any).customerSince || (a as any).customer_since || 0);
                    const dateB = new Date((b as any).customerSince || (b as any).customer_since || 0);
                    return dateB.getTime() - dateA.getTime(); // Most recent first
                  })
                  .map((customer) => (
                    <div
                      key={customer.id}
                      className="border border-gray-300 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900">
                              {customer.customer_id || (customer as any).customerId}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {customer.fullName || customer.full_name}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p>
                              <span className="font-medium">Phone:</span> {customer.phone}
                              {customer.alternate_phone && ` / ${customer.alternate_phone}`}
                            </p>
                            <p>
                              <span className="font-medium">Email:</span> {customer.email && customer.email.trim() && !customer.email.toLowerCase().includes('nomail') && !customer.email.toLowerCase().includes('no@mail') 
                                ? customer.email 
                                : 'nomail@mail'}
                            </p>
                            <p>
                              <span className="font-medium">Service:</span> {customer.service_type || 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500">
                              Created: {new Date((customer as any).customerSince || (customer as any).customer_since || '').toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              handleNewJob(customer);
                              setRecentAccountsDialogOpen(false);
                            }}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            New Job
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingCustomer(customer);
                              setEditDialogOpen(true);
                              setRecentAccountsDialogOpen(false);
                            }}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecentAccountsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;